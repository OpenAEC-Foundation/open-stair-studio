# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["ifcopenshell", "trimesh", "manifold3d", "scipy"]
# ///
"""Independent IFC-only mesh audit. Run with uv run --script <script> <file.ifc>."""
import argparse
import json
import math
from collections import Counter

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util.element import get_pset, get_type
from ifcopenshell.util.shape import get_faces, get_vertices
from ifcopenshell.util.placement import get_local_placement
from ifcopenshell.util.unit import calculate_unit_scale
import manifold3d as solid
import numpy as np
import trimesh


def mesh(product, settings):
    shape = ifcopenshell.geom.create_shape(settings, product)
    result = trimesh.Trimesh(get_vertices(shape.geometry), get_faces(shape.geometry), process=True)
    assert result.is_volume, f"{product.Tag}: open or reversed surface"
    manifold = solid.Manifold(solid.Mesh64(np.asarray(result.vertices), np.asarray(result.faces, dtype=np.uint64)))
    assert manifold.status() == solid.Error.NoError and not manifold.is_empty(), product.Tag
    return manifold


def check_bend_schedule(bar, data, settings, scale):
    """Reconstruct arc length and endpoint tangents from radius vectors alone."""
    schedule = json.loads(data["Buigsegmenten"])
    xyz = lambda p: np.array([p[k] for k in ("x", "y", "z")])
    previous_end = previous_tangent = None
    length = 0.0
    for s in schedule:
        a, b = xyz(s["start"]), xyz(s["end"])
        if s["type"] == "line":
            piece_length = np.linalg.norm(b - a)
            start_tangent = end_tangent = (b - a) / piece_length
        else:
            assert s["type"] == "arc", bar.Tag
            c, n = xyz(s["center"]), xyz(s["normal"])
            u, v = a - c, b - c
            radius = np.linalg.norm(u)
            assert abs(radius - np.linalg.norm(v)) < 1e-7, bar.Tag
            assert abs(radius * 2 - data["Doorndiameter"] - data["Diameter"]) < 1e-6, bar.Tag
            assert abs(np.linalg.norm(n) - 1) < 1e-8 and abs(u @ n) + abs(v @ n) < 1e-7, bar.Tag
            angle = math.atan2(np.linalg.norm(np.cross(u, v)), u @ v)
            assert abs(math.degrees(angle) - s["angleDeg"]) < 1e-7, bar.Tag
            piece_length = radius * angle
            start_tangent, end_tangent = np.cross(n, u) / radius, np.cross(n, v) / radius
        if previous_end is not None:
            assert np.linalg.norm(a - previous_end) < 1e-7, bar.Tag
            assert np.linalg.norm(start_tangent - previous_tangent) < 1e-7, f"{bar.Tag}: non-tangent bend"
        previous_end, previous_tangent = b, end_tangent
        length += piece_length
    assert abs(length - data["Lengte"]) < 1e-6 and abs(length - get_type(bar).BarLength) < 1e-6, bar.Tag
    link, = [rel for rel in bar.HasAssignments if rel.is_a("IfcRelAssignsToProduct")]
    assert link.RelatingProduct.Tag == data["Doelvoorziening"], bar.Tag


    target = link.RelatingProduct
    crown, = [s for s in schedule if s["type"] == "arc" and abs(s["angleDeg"] - 180) < 1e-8]
    centre = xyz(crown["center"])
    if target.is_a("IfcDiscreteAccessory"):
        # Horizontal U is centred on the vertical socket shank in local plan.
        insert = get_pset(target, "OSS_PrefabDetail")
        assert np.allclose(centre[:2], [insert["BeginX"], insert["BeginY"]]), bar.Tag
        assert insert["EindeZ"] < centre[2] < insert["BeginZ"], bar.Tag
    elif target.Tag.endswith(("onderstrip", "bovenstrip")):
        # The return of each tie lies over the physical elastomer strip independently
        # of its owning cast, including the opposite flight of a dogleg landing.
        shape = ifcopenshell.geom.create_shape(settings, target)
        pad_world = get_vertices(shape.geometry) / scale
        transform = np.linalg.inv(get_local_placement(bar.ObjectPlacement))
        pad = (np.column_stack([pad_world, np.ones(len(pad_world))]) @ transform.T)[:, :3]
        assert np.all(centre[:2] >= pad.min(axis=0)[:2] - 1e-4), bar.Tag
        assert np.all(centre[:2] <= pad.max(axis=0)[:2] + 1e-4), bar.Tag


def check_lift(host, scale):
    plan = get_pset(host, "OSS_Elementhijsplan")
    if not plan:
        return 0
    station = [get_pset(item, "OSS_PrefabDetail") for rel in host.IsDecomposedBy
               for item in rel.RelatedObjects if item.is_a("IfcDiscreteAccessory")]
    if not any("Strengkracht vrij hijsen" in s for s in station):
        return 0
    assert len(station) == 4, host.Tag
    # Compute concrete CG and shutter adhesion independently by integrating
    # the local solid and all its downward-facing boundary triangles.
    shape = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), host)
    shell = trimesh.Trimesh(get_vertices(shape.geometry), get_faces(shape.geometry))
    cg = shell.center_mass
    downward = shell.face_normals[:, 2] < -1e-7
    areas = shell.area_faces[downward]
    mould_cg = np.average(shell.triangles_center[downward], weights=areas, axis=0)
    assembly, = host.Decomposes
    density = get_pset(assembly.RelatingObject, "OSS_Trapcomponent", "density")
    weight = shell.volume * density * 9.81 / 1000
    geometry = get_pset(host, "OSS_PrefabGeometrie")
    assert np.allclose(cg, [geometry["Zwaartepunt " + k] * scale for k in "XYZ"], atol=1e-7), host.Tag
    ordered = sorted(station, key=lambda s: (s["BeginX"], s["BeginY"]))
    x1, x2 = np.array([ordered[0]["BeginX"], ordered[2]["BeginX"]]) * scale
    equalised = "vereffening" in plan["rigging"]
    cosine = math.cos(plan["slingAngle"])
    cases = [("Strengkracht vrij hijsen", weight * plan["hoistFactor"], cg)]
    if plan["stripping"].startswith("Volledig vrijgezet"):
        cases.append(("Strengkracht ontkisten", weight, cg))
    elif plan["stripping"].startswith("Onderzijde op mal") and plan["adhesionPressure"] > 0:
        adhesion = plan["adhesionPressure"] * areas.sum()
        cases.append(("Strengkracht ontkisten", weight + adhesion, (cg * weight + mould_cg * adhesion) / (weight + adhesion)))
    for field, total, centre in cases:
        for idx, s in enumerate(ordered):
            left = idx < 2
            share_x = ((x2 - centre[0]) if left else (centre[0] - x1)) / (x2 - x1)
            y1, y2 = [ordered[(idx // 2) * 2 + j]["BeginY"] * scale for j in (0, 1)]
            share_y = ((y2 - centre[1]) if idx % 2 == 0 else (centre[1] - y1)) / (y2 - y1)
            expected = total * share_x * (share_y if equalised else 1) / cosine
            assert abs(expected - s[field]) < 1e-6, (host.Tag, field, expected, s[field])
    return len(cases) * len(ordered)


def main():
    parser = argparse.ArgumentParser(description="Check physical rebar fit in the exported world coordinates.")
    parser.add_argument("file")
    parser.add_argument("--expect-supplementary", action="store_true")
    args = parser.parse_args()
    model = ifcopenshell.open(args.file)
    roots = model.by_type("IfcRoot")
    assert len({entity.GlobalId for entity in roots}) == len(roots), "Duplicate IFC GlobalId"
    scale = calculate_unit_scale(model)
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    hosts = {}
    seen = set()
    counts = Counter()
    forces = 0
    for bar in model.by_type("IfcReinforcingBar"):
        rel, = bar.Decomposes
        host = rel.RelatingObject
        assert get_pset(bar, "OSS_PrefabDetail", "Betonelement") == host.Tag, bar.Tag
        props = get_pset(bar, "OSS_PrefabDetail")
        if props.get("Buigsegmenten"):
            check_bend_schedule(bar, props, settings, scale)
        assert bar.Tag not in seen, bar.Tag
        seen.add(bar.Tag)
        if host.id() not in hosts:
            forces += check_lift(host, scale)
            stair, = host.Decomposes
            cover = get_pset(stair.RelatingObject, "OSS_Trapcomponent", "cover") * scale
            concrete = mesh(host, settings)
            bounds = np.array(concrete.bounding_box()).reshape(2, 3)
            # The void around the concrete retains every re-entrant stair and bearing face.
            surrounding = solid.Manifold.cube(bounds[1] - bounds[0] + 2).translate(bounds[0] - 1)
            hosts[host.id()] = concrete, surrounding - concrete, cover
        concrete, exterior, cover = hosts[host.id()]
        steel = mesh(bar, settings)
        assert (steel - concrete).volume() < 1e-12, f"{bar.Tag}: steel protrudes from concrete"
        clearance = exterior.min_gap(steel, cover + .001)
        assert clearance >= cover - 2e-6, f"{bar.Tag}: {clearance * 1000:.3f} mm, expected {cover * 1000:.3f} mm"
        counts[bar.ObjectType] += 1
    assert seen, "No reinforcing bars"
    # Check supplementary steel against all other as-cast steel in its own pour.
    # Shared faces (e.g. intended foot contact) have zero overlap volume.
    mat_roles = {"Hoofdwapening", "Verdeelwapening"}
    checked_pairs = 0
    for host_id in hosts:
        host = model.by_id(host_id)
        children = [part for rel in host.IsDecomposedBy for part in rel.RelatedObjects]
        special = [part for part in children if part.is_a("IfcReinforcingBar") and part.ObjectType not in mat_roles]
        if not special:
            continue
        stair, = host.Decomposes
        gap = get_pset(stair.RelatingObject, "OSS_Trapcomponent", "localClearance") * scale
        solids = {part.id(): mesh(part, settings) for part in children}
        seen_pairs = set()
        for part in special:
            body = solids[part.id()]
            low, high = np.reshape(body.bounding_box(), (2, 3))
            for other in children:
                pair = tuple(sorted((part.id(), other.id())))
                if pair[0] == pair[1] or pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                obstacle = solids[other.id()]
                a, b = np.reshape(obstacle.bounding_box(), (2, 3))
                if np.any(high + gap < a) or np.any(b + gap < low):
                    continue
                overlap = (body ^ obstacle).volume()
                assert overlap <= 1e-12, f"{part.Tag} intersects {other.Tag}: {overlap * 1e9:.3f} mm³"
                actual_gap = body.min_gap(obstacle, gap + .001)
                assert actual_gap >= gap - 2e-6, f"{part.Tag} to {other.Tag}: {actual_gap * 1000:.3f} mm gap"
                checked_pairs += 1
    if args.expect_supplementary:
        expected = {"Bijlegwapening oplegging", "Bijlegwapening hijshuls", "Bijlegwapening verankering"}
        assert expected <= set(counts), f"Missing supplementary roles: {expected - set(counts)}"
    print(f"{len(hosts)} hosts, {len(seen)} physical reinforcing bars; minimum mesh cover in IFC world coordinates: {dict(counts)}; {checked_pairs} potential clashes and {forces} sling forces checked")


if __name__ == "__main__":
    main()
