# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["ifcopenshell"]
# ///
"""Run with uv run --script scripts/audit-design-connections.py from any directory."""
import json
import subprocess
import tempfile
from functools import cache
from math import isclose
from pathlib import Path

import ifcopenshell
import numpy as np
from ifcopenshell.util.element import get_psets
from ifcopenshell.validate import json_logger, validate


ROOT = Path(__file__).resolve().parents[1]
GENERATE = """
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {emptyWell, newInstance, assembleWell} from './src/stairwell.js';
import {createStairwellIfc} from './src/stairwell-ifc.js';
const dir = process.argv[1], well = structuredClone(emptyWell);
well.uid = 'astra-design-connections';
for (const [type, params] of [
  ['glass', {guard:'both', designG:1.5, designQ:3, designP:2, designLimit:4,
             designBasis:'AUDIT-A', glassFd:28, glassStrip:120,glassCarrierEI:3012.5,
             glassHeadRd:5, glassHeadLever:14, glassHeadNRd:12, glassHeadVRd:8}],
  ['cantilever', {wallSide:'left',guard:'free', designBasis:'AUDIT-B',
                  designG:1.5, designQ:3, designP:2, armFd:250, wallLever:70,anchorEmbed:133}],
  ['steel', {layout:'straight', designBasis:'AUDIT-C', designG:1.5, designQ:3, designP:2,
             steelFyd:235, steelBaseN:4, steelBaseV:2, steelBaseMx:.27, steelBaseMy:.064,
             steelBaseMz:.054, steelAnchorNRd:20, steelAnchorVRd:10,
             steelBaseActions:'envelope', steelEmbed:123,steelAnchorBasis:'C'}],
  ['escape', {layout:'return'}],
  ['glass', {carrier:'steel',guard:'none'}],
]) {
  const item = newInstance(type, well);
  Object.assign(item.params, params);
  item.rotation = 19;
  well.instances.push(item);
}
const manifest = assembleWell(well).map(({instance, structural}) => ({
  mark:instance.mark, checks:structural.checks, connections:structural.connections,
}));
writeFileSync(join(dir,'expected.json'), JSON.stringify(manifest));
writeFileSync(join(dir,'assemblies.ifc'), await createStairwellIfc({
  name:'Onafhankelijke overdrachtstoets',number:'A-01',revision:'A',
},well));
"""


def hand_checks(stairs, property_sets):
    # Glass: n=2 effective 10 mm plies, 120 mm strip, support centres 903.44 mm apart.
    span = 903.44
    glass_moment = 1.35 * 1.5 * .120 * span**2 / 8 + 1.5 * 2000 * span / 4
    # RHS: 40 x 50 x 4 mm, full transverse edge lever from the plate face.
    length, pitch = 1012, 127.5
    inertia = (40 * 50**3 - 32 * 42**3) / 12
    arm_moment = 1.35 * 1.5 * pitch / 1000 * length**2 / 2 + 1.5 * 3000 * length
    # Folded tray: integrate the full rectangle minus the lower hollow region.
    width, height, thickness = 253, 35, 5
    void_width = width - 2 * thickness
    area = width * height - void_width * (height - thickness)
    centroid = (width * height**2 - void_width * (height**2 - thickness**2)) / (2 * area)
    tray_inertia = (width * height**3 - void_width * (height**3 - thickness**3)) / 3 - area * centroid**2
    permanent = area * 7850 * 9.81 / 1e9 + 1.5 * .260
    tray_moment = 1.35 * permanent * 1000**2 / 8 + 1.5 * 2000 * 1000 / 4
    reference = [
        ("GL-01", "treden-buiging", glass_moment / (2 * 120 * 10**2 / 6)),
        ("BL-01", "treden-arm-buiging", arm_moment / (inertia / 25)),
        ("BL-01", "treden-wand-trek", (1.35 * 1.5 * .255 * 524 + 1.5 * 2 * 1024) / 70),
        ("ST-01", "vlucht-1-trede-buiging", tray_moment * (height - centroid) / tray_inertia),
        ("ST-01", "vlucht-1-voet-L-ankers", (4 + 5 + 1) / 20 + (2 + 1) / 10),
        ("ST-01", "vlucht-1-voet-L-anker-trek", 10),
        ("ST-01", "vlucht-1-voet-L-anker-afschuiving", 3),
    ]
    for mark, name, target in reference:
        value = property_sets(stairs[mark])["OSS_ConstructieveToets_" + name]["Rekenwaarde"]
        assert isclose(value, target, rel_tol=1e-6), (mark, name, value, target)


def check_fasteners(parts, props):
    welds, bolts = 0, 0
    for tag, product in parts.items():
        mark, _, key = tag.partition("/")
        if "-las-" in key:
            assert product.is_a() == "IfcFastener" and product.PredefinedType == "WELD", tag
            assert product.Representation.Representations[0].Items, tag
            welds += 1
        embedded = 0
        if mark.startswith("GL-") and key.startswith(("voetanker-", "kopanker-")):
            embedded, plate = 100, 11 if key.startswith("voet") else 10
        elif mark.startswith("BL-") and "-wandplaat-" in key and "-anker-" in key:
            embedded, plate = 133, 12
        elif mark.startswith(("ST-", "VT-")) and "-voet-" in key and "-anker-" in key:
            embedded, plate = (123 if mark.startswith("ST-") else 90), (10 if key.startswith("vlucht") else 12)
        if not embedded:
            continue
        assert product.is_a() == "IfcMechanicalFastener" and product.PredefinedType == "ANCHORBOLT", tag
        assert product.NominalDiameter == 12 and product.NominalLength == embedded + plate, tag
        data = props(product)["OSS_Anker"]
        assert [data[k] for k in ("Nominale diameter", "Schachtlengte", "Inbedding in ondergrond")] == [
            12, embedded + plate, embedded], tag
        # Infer the longitudinal axis and extract the end rings from IFC tessellation.
        mesh = product.Representation.Representations[0].Items[0]
        vertices = np.unique(np.asarray(mesh.Coordinates.CoordList), axis=0)
        centered = vertices - vertices.mean(axis=0)
        axis = np.linalg.svd(centered, full_matrices=False)[2][0]
        levels = np.unique(np.round(centered @ axis, 4))
        gaps = np.diff(levels)
        assert np.isclose(gaps.max(), embedded + plate, atol=.002), (tag, levels)
        diameter_rings = []
        for level in (levels[0], levels[-1]):
            ring = vertices[np.isclose(centered @ axis, level, atol=.001)]
            diameter_rings.append(np.linalg.norm(ring[:, None] - ring[None, :], axis=2).max())
        assert np.isclose(min(diameter_rings), 12, atol=.002), (tag, diameter_rings)
        bolts += 1
    assert welds > 0 and bolts > 0
    return welds, bolts


def audit(folder):
    subprocess.run(["node", "--input-type=module", "-e", GENERATE, str(folder)],
                   cwd=ROOT, check=True)
    model = ifcopenshell.open(folder / "assemblies.ifc")
    schema_log = json_logger()
    validate(model, schema_log)
    assert not schema_log.statements, schema_log.statements[:3]
    expected = json.loads((folder / "expected.json").read_text(encoding="utf-8"))
    roots = model.by_type("IfcRoot")
    assert len({e.GlobalId for e in roots}) == len(roots), "duplicate GlobalId"
    property_sets = cache(get_psets)
    stairs = {e.Tag: e for e in model.by_type("IfcStair")}
    hand_checks(stairs, property_sets)
    parts = {e.Tag: e for e in model.by_type("IfcElement") if e.Tag}
    welds, bolts = check_fasteners(parts, property_sets)
    assert welds == sum(e.PredefinedType == "WELD" for e in model.by_type("IfcFastener"))
    assert bolts == sum(e.PredefinedType == "ANCHORBOLT" for e in model.by_type("IfcMechanicalFastener"))
    pset = model.by_id(property_sets(stairs["GL-01"])["OSS_Trapcomponent"]["id"])
    ei = next(p for p in pset.HasProperties if p.Name == "glassCarrierEI")
    assert ei.NominalValue.is_a() == "IfcReal" and ei.NominalValue.wrappedValue == 3012.5
    assert ei.Unit.UnitType == "USERDEFINED" and {(e.Unit.Name, e.Unit.Prefix, e.Exponent)
        for e in ei.Unit.Elements} == {("NEWTON", "KILO", 1), ("METRE", None, 2)}
    assert all(np.allclose([c.Red, c.Green, c.Blue], [.56, .81, .84]) for c in model.by_type("IfcColourRgb"))
    assert {s.Transparency for s in model.by_type("IfcSurfaceStyleShading")} == {.75, .88}
    states = {"fail":"Overschreden", "pass":"Deeltoets voldoet", "open":"Open"}
    groups = []
    for group in model.by_type("IfcGroup"):
        if "OSS_Verbinding" in property_sets(group):
            members = {e.Tag for assignment in group.IsGroupedBy for e in assignment.RelatedObjects}
            groups.append((group, members))
    expected_count = sum(len(item["connections"]) for item in expected)
    assert len(groups) == expected_count > 0, (len(groups), expected_count)
    for assembly in expected:
        mark = assembly["mark"]
        stair = stairs[mark]
        stair_sets = property_sets(stair)
        assert "OSS_ConstructieveBerekening" in stair_sets, mark
        assert assembly["connections"] and assembly["checks"], mark
        for check in assembly["checks"]:
            name = "OSS_ConstructieveToets_" + check["id"]
            assert name in stair_sets, (mark, name)
            data = stair_sets[name]
            assert data["Status"] == states[check["status"]], (mark, name)
            for field, prop in [("demand", "Rekenwaarde"), ("capacity", "Grenswaarde")]:
                if check[field] is None:
                    assert prop not in data, (mark, name, prop)
                else:
                    assert isclose(data[prop], check[field], rel_tol=1e-6), (mark, name, prop)
            assert data.get("Eenheid", "") == check["unit"], (mark, name)
            for part in check["partIds"]:
                assert name in property_sets(parts[f"{mark}/{part}"]), (mark, part, name)
        for connection in assembly["connections"]:
            tags = {f"{mark}/{part}" for part in connection["partIds"]}
            assert tags, (mark, connection["id"])
            candidates = [g for g, members in groups if members == tags and
                          g.Name == f"{mark}/{connection['id']}"]
            check_states = {c["status"] for c in assembly["checks"] if c["id"] in connection["checkIds"]}
            state = "fail" if "fail" in check_states else "pass" if check_states == {"pass"} else "open"
            assert len(candidates) == 1 and property_sets(candidates[0])["OSS_Verbinding"]["Status"] == states[state]
            assert any(all("OSS_ConstructieveToets_" + check in property_sets(g)
                           for check in connection["checkIds"]) for g in candidates), (
                           mark, connection["id"], tags)
    print(f"{len(stairs)} stairs, {welds} welds, {bolts} anchors, {expected_count} connection groups, "
          f"{sum(len(i['checks']) for i in expected)} checks read with IfcOpenShell.")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as folder:
        audit(Path(folder))
