"""Inspect all 15 manufactured outlines independently of Studio's geometry kernel."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from runpy import run_path

import ifcopenshell.validate
import numpy as np
from shapely.geometry import Polygon

newel = run_path(Path(__file__).with_name("measure-newel-tweekwart.py"))
compact = newel["compact"]
meshes = newel["measurement"]["meshes"]


def board(poly, angle):
    # Use the long front edge and its outside endpoint as the board datum.
    rad = np.radians(angle)
    normal = np.array([np.cos(rad), np.sin(rad)])
    along = np.array([-normal[1], normal[0]])
    points = np.array(poly.simplify(.001).exterior.coords)
    edges = [(a, b) for a, b in zip(points[:-1], points[1:])
             if np.linalg.norm(b-a) > 500 and abs((b-a) @ normal) < .02*np.linalg.norm(b-a)]
    front = min(edges, key=lambda edge: ((edge[0]+edge[1])/2) @ normal)
    origin, inner = sorted(front, key=lambda p: p @ along)
    axis = (inner-origin)/np.linalg.norm(inner-origin)
    return Polygon((points-origin) @ np.column_stack((axis, [axis[1], -axis[0]])))


def tread_semantics(path, stair):
    name = "OSS_Tredeverdrijving"
    if path.suffix == ".ifcx":
        nodes = [n["attributes"] for n in json.loads(path.read_text(encoding="utf-8"))["data"]]
        data = {a["openaec::ifc4"]["Name"]: {k:v["value"] for k,v in
                a["openaec::ifc4"].get("propertySets", {}).get(name, {}).items()}
                for a in nodes if a["bsi::ifc::class"]["code"] == "IfcPlate"}
    else:
        model = ifcopenshell.open(path)
        data = {p.Name: ifcopenshell.util.element.get_pset(p, name) or {}
                for p in model.by_type("IfcPlate")}
    winder = sorted((n, p) for n, p in data.items() if p)
    assert len(winder) == 10, (path, winder)
    for part, p in winder:
        level = int(part.rsplit("-", 1)[1])
        lower = level <= 5
        index = level-1 if lower else level-11
        offsets = [*stair["firstQuarterOffsets"], 0] if lower else [0, *stair["secondQuarterOffsets"]]
        assert p["Quarter"] == ("lower" if lower else "upper") and p["IndexInQuarter"] == index+1
        np.testing.assert_allclose([p["FrontBoundaryOffset_mm"], p["BackBoundaryOffset_mm"]], offsets[index:index+2], rtol=0, atol=.00001)


def check_program(file, poly, hand, level):
    newel["verify_tread_program"](file, poly, hand)
    job = json.loads(file.with_suffix(".cam.json").read_text(encoding="utf-8"))
    assert job["fit"]["status"] == ("pass" if level in newel["CONNECTED"] else "unconnected")
    assert job["parameters"]["toolDiameter"] == 6
    # Check every emitted pass, including later passes that might diverge.
    lines = file.with_suffix(".ngc").read_text(encoding="utf-8").splitlines()
    passes = []
    for line in lines:
        if line.startswith("G1 Z"):
            passes.append([])
        elif line.startswith("G1 X"):
            passes[-1].append(line)
    assert len(passes) == 13 and passes[0] and all(p == passes[0] for p in passes)


def figure(treads, ref, local, target):
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(3, 5, figsize=(15, 7.5), layout="constrained")
    for i, (ax, actual, expected) in enumerate(zip(axes.flat, treads, ref, strict=True)):
        ax.plot(*expected.exterior.xy, lw=2.5, color="#155651", label="De Vries")
        ax.plot(*actual.exterior.xy, lw=1.5, ls="--", color="#d77932", label="Studio")
        ax.set_aspect("equal")
        ax.set_title(f"TD{i+1:02d}   ·   {local[i]:.4f} mm", fontsize=10)
        ax.tick_params(labelsize=7)
        ax.grid(alpha=.15)
    fig.suptitle("Zaagcontour per trede op bronmaat · afstand in plankassen", fontsize=16)
    fig.legend(*axes.flat[0].get_legend_handles_labels(), loc="outside lower center", ncols=2)
    fig.savefig(target, dpi=165)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--express", action="store_true")
    parser.add_argument("--figure", type=Path)
    args = parser.parse_args()
    fixture = Path(__file__).with_name("testdata") / "devries-tweekwart-contours.json"
    sample = json.loads(fixture.read_text(encoding="utf-8"))
    assert sample["units"] == "mm" and sample["sha256"] == newel["REFERENCE_SHA"]
    reference = [Polygon(points) for points in sample["treads"]]
    assert len(reference) == 15 and all(p.is_valid for p in reference)
    if args.reference:
        assert sha256(args.reference.read_bytes()).hexdigest() == sample["sha256"]
        measured = newel["parts"](list(meshes(args.reference)))[0]
        for p,q in zip(reference, measured, strict=True):
            assert p.boundary.hausdorff_distance(q.boundary) < .00001
        reference = measured
    # Front planes turn through 90 degrees in each quarter. The approximate
    # angles only identify a front edge. Its measured vertices define the datum.
    angles = [0, 19, 37, 55, 73, *[90]*6, 108, 125, 142, 161]
    reference_boards = [board(p, a) for p, a in zip(reference, angles, strict=True)]
    baseline = {}
    for variant, depth in [("nominaal", 992), ("bronmaat", 992.105), ("td4-proef", 992.105)]:
        left = {}
        for hand in ("links", "rechts"):
            base = args.directory / f"verdrijving-{variant}-{hand}"
            stair = json.loads(base.with_suffix(".oss.json").read_text(encoding="utf-8"))["stair"]
            formats = {}
            for fmt in ("ifc", "ifcx"):
                path = base.with_suffix("."+fmt)
                measured = newel["measurement"]["inspect"](path)
                np.testing.assert_allclose(measured["size_mm"], [depth,3140,3950], atol=.002, rtol=0)
                np.testing.assert_allclose(measured["offsets_mm"], [45]*15, atol=.002, rtol=0)
                newel["measurement"]["check_nosing_property"](path, measured["offsets_mm"])
                turns = np.array([*stair["firstQuarterAngles"], *[0]*5, *stair["secondQuarterAngles"]])
                np.testing.assert_allclose(measured["board_angles_delta_deg"],
                                           turns*(1 if hand == "links" else -1), atol=.002, rtol=0)
                if fmt == "ifc" and args.express:
                    logger = ifcopenshell.validate.json_logger()
                    ifcopenshell.validate.validate(str(path), logger, express_rules=True)
                    assert not logger.statements, (path, logger.statements)
                data = list(meshes(path))
                props = compact["design_properties"](path)
                assert props["TurnDirection"]["value"] == stair["turnDirection"]
                for prefix, key in [("Lower", "firstQuarterOffsets"), ("Upper", "secondQuarterOffsets")]:
                    for i, mm in enumerate(stair[key], 1):
                        assert props[f"{prefix}QuarterBoundaryOffset{i:02d}_mm"] == {
                            "type":"IFCLENGTHMEASURE", "unit":"MILLIMETRE", "value":mm}
                tread_semantics(path, stair)
                newel["properties_and_connections"](path)
                formats[fmt] = newel["signatures"](data, hand)
                actual = newel["parts"](data, hand)[0]
                boards = [board(p, a) for p, a in zip(actual, angles, strict=True)]
                world, local = [[a.boundary.hausdorff_distance(b.boundary) for a,b in zip(s,t,strict=True)]
                                for s,t in [(actual,reference),(boards,reference_boards)]]
                print(path.name, "world mm", np.round(world, 4), "board mm", np.round(local, 4), flush=True)
                if variant == "td4-proef":
                    previous = baseline[hand, fmt]
                    changed = [i+1 for i,(p,q) in enumerate(zip(previous, actual, strict=True))
                               if p.boundary.hausdorff_distance(q.boundary) > .001]
                    assert changed == [3,4], (path, changed)
                    def front_station(poly):
                        vertices = np.array(poly.exterior.coords)
                        a,b = next((a,b) for a,b in zip(vertices[:-1],vertices[1:])
                                   if abs(a[0]-b[0]) > 850 and 590 < abs(a[1]-b[1]) < 630)
                        edge = b-a
                        normal = np.array([-edge[1],edge[0]]) / np.linalg.norm(edge)
                        return abs(normal @ a)
                    np.testing.assert_allclose(front_station(actual[3])-front_station(previous[3]), 5,
                                               rtol=0, atol=.002)
                else:
                    assert max(world) < (.106 if variant == "nominaal" else .001), (path, world)
                    assert max(local) < .001, (path, local)
                    if variant == "bronmaat":
                        baseline[hand, fmt] = actual
                if fmt == "ifc":
                    for i, poly in enumerate(actual, 1):
                        check_program(base.with_name(base.name+f"-TD{i:02d}"), poly, hand, i)
                if args.figure and variant == "bronmaat" and fmt == "ifc" and hand == "links":
                    figure(boards, reference_boards, local, args.figure)
                if hand == "links":
                    left[fmt] = formats[fmt]
                else:
                    newel["compare_signatures"](formats[fmt], left[fmt], path.name+" mirror")
            newel["compare_signatures"](formats["ifc"], formats["ifcx"], base.name+" IFC4 / IFCX")


if __name__ == "__main__":
    main()
