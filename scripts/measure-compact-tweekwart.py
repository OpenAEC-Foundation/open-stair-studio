"""Audit compact two-quarter IFC4 and IFCX exports in world millimetres."""
import argparse
import json
from pathlib import Path
from runpy import run_path

import ifcopenshell.validate
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

measurement = run_path(Path(__file__).with_name("measure-wel-tweekwart.py"))
FIRST = [18.533, 18.809, 17.920, 18.040, 16.698]
SECOND = [17.639, 17.746, 16.945, 18.731, 18.938]


def equal(actual, expected, tolerance, label):
    np.testing.assert_allclose(actual, expected, atol=tolerance, rtol=0, err_msg=label)


def reflected_parts(meshes, hand):
    # Match individual products even when IFC IDs or the order of objects differ.
    sign = [1, -1 if hand == "rechts" else 1, 1]
    parts = []
    for vertices, faces, kind in meshes:
        cloud = np.unique(vertices * sign, axis=0)
        center = (cloud.min(axis=0) + cloud.max(axis=0)) / 2
        a, b, c = (vertices - vertices.mean(axis=0))[faces].transpose(1, 0, 2)
        volume = abs(np.einsum("ij,ij->", a, np.cross(b, c))) / 6
        area = np.linalg.norm(np.cross(b-a, c-a), axis=1).sum() / 2
        assert volume > 0 and area > 0, kind
        parts.append((kind, center, cloud, (volume, area)))
    return parts


def compare_parts(actual, expected, label):
    pending = list(expected)
    maximum = 0
    for kind, center, cloud, metrics in actual:
        candidates = [(i, p) for i, p in enumerate(pending)
                      if p[0] == kind and np.linalg.norm(center - p[1]) < .001]
        for index, (_, _, other, wanted) in candidates:
            distances = np.linalg.norm(cloud[:, None] - other[None, :], axis=2)
            delta = max(distances.min(axis=0).max(), distances.min(axis=1).max())
            if delta <= .001 and np.allclose(metrics, wanted, rtol=3e-6, atol=.1):
                maximum = max(maximum, delta)
                pending.pop(index)
                break
        else:
            raise AssertionError(f"{label}: unmatched {kind} at {center}")
    assert not pending, label
    print(f"{label}: {len(actual)} products, maximum vertex difference {maximum:.6f} mm")


def design_properties(path):
    pset_name = "Pset_OpenStairStudio_Design"
    if path.suffix == ".ifcx":
        nodes = json.loads(path.read_text(encoding="utf-8"))["data"]
        stair, = [n["attributes"] for n in nodes if n["attributes"]["bsi::ifc::class"]["code"] == "IfcStair"]
        return stair["openaec::ifc4"]["propertySets"][pset_name]
    model = ifcopenshell.open(str(path))
    stair, = model.by_type("IfcStair")
    pset, = [r.RelatingPropertyDefinition for r in stair.IsDefinedBy
             if r.is_a("IfcRelDefinesByProperties") and r.RelatingPropertyDefinition.Name == pset_name]
    return {p.Name: {"value": p.NominalValue.wrappedValue, "type": p.NominalValue.is_a().upper(),
                     "unit": (p.Unit.Prefix or "") + p.Unit.Name if p.Unit else None}
            for p in pset.HasProperties}


def inspect(path, size, first, second, position, hand, express):
    result = measurement["inspect"](path)
    label = path.name
    equal(sorted(result["size_mm"][:2], reverse=True), size, .02, label)
    expected = [*first, *[0]*5, *second]
    equal(result["board_angles_delta_deg"], np.array(expected) * (1 if hand == "links" else -1), .003, label)
    equal(result["offsets_mm"], 45, .02, label)
    equal(result["first_board_xy_mm"][0], 45 + 13/2 - position, .02, label)
    measurement["check_nosing_property"](path, result["offsets_mm"])
    equal(result["straight_going_mm"][5:10], 220.513, .02, label)
    equal(result["parallel_depths_mm"][5:10], 265.513, .02, label)
    props = design_properties(path)
    assert props["TwoQuarterLayout"]["value"] == "dimensioned" and "WindersPerQuarter" not in props
    for key, mm in zip(["DesignOuterLength_mm", "DesignOuterDepth_mm", "MiddleStraightOffset_mm"],
                       [*size, 20.034], strict=True):
        assert props[key] == {"value": mm, "type": "IFCLENGTHMEASURE", "unit": "MILLIMETRE"}, (label, key)
    for prefix, angles in [("Lower", first), ("Upper", second)]:
        assert props[prefix+"QuarterWinders"]["value"] == len(angles)
        for i, angle in enumerate(angles, 1):
            prop = props[f"{prefix}QuarterAngle{i:02d}"]
            assert prop["type"] == "IFCPLANEANGLEMEASURE"
            equal(np.degrees(prop["value"]), angle, .003, label)
    if express and path.suffix == ".ifc":
        logger = ifcopenshell.validate.json_logger()
        ifcopenshell.validate.validate(str(path), logger, express_rules=True)
        assert not logger.statements, (label, logger.statements)
        print(f"{label}: EXPRESS validation returned 0 issues")
    print(f"{label}: extent {result['size_mm']}, 15 nosings {min(result['offsets_mm'])}.."
          f"{max(result['offsets_mm'])} mm, angles {result['board_angles_delta_deg']}", flush=True)
    return list(measurement["meshes"](path))


def projected_parts(meshes):
    """Register at the bounding-box corner after rotating the first ascent to +Y."""
    boards = sorted([(v[:, 2].max(), measurement["top_boundary"](v, f)) for v, f, k in meshes
                     if k in ("IfcPlate", "IfcBuildingElementPart") and 100 < np.ptp(v[:, 2]) < 200],
                    key=lambda board: board[0])
    first = boards[0][1]
    axis = np.diff(first, axis=1)[:, 0]
    axis = axis[np.linalg.norm(axis, axis=1).argmax()]
    axis /= np.linalg.norm(axis)
    forward = np.array([-axis[1], axis[0]])
    if forward @ (boards[1][1].mean(axis=(0, 1)) - first.mean(axis=(0, 1))) < 0:
        forward *= -1
    transform = np.column_stack(([forward[1], -forward[0]], forward))
    origin = (np.vstack([v[:, :2] for v, _, _ in meshes]) @ transform).min(axis=0)
    treads, supports = [], []
    for v, f, kind in meshes:
        xy = v[:, :2] @ transform - origin
        triangles = [Polygon(points) for points in xy[f]]
        outline = unary_union([p for p in triangles if p.area > 1.e-7])
        height = np.ptp(v[:, 2])
        if kind in ("IfcPlate", "IfcBuildingElementPart") and abs(height - 38) < .01:
            treads.append((v[:, 2].max(), outline))
        elif kind == "IfcMember" or height > 200:
            supports.append(outline)
    treads.sort(key=lambda t: t[0])
    # The manufacturer's sixteenth 38 mm board is the landing trim.
    # Ascending to the left in this registration, the visible board face has maximum X.
    seventh_face_x = ((boards[6][1].reshape(-1, 2) @ transform) - origin)[:, 0].max()
    return [outline for _, outline in treads[:15]], supports, seventh_face_x


def compare(actual, reference, figure):
    models = [projected_parts(meshes) for meshes in (actual, reference)]
    deltas = [a.boundary.hausdorff_distance(b.boundary) for a, b in zip(models[0][0], models[1][0], strict=True)]
    print("Tread boundary distances to manufacturer (mm):", np.round(deltas, 2).tolist())
    print("Seventh riser, visible face X after registration (mm), Studio/manufacturer:",
          [round(float(model[2]), 4) for model in models])
    equal(models[0][2], models[1][2], .02, "position of the straight middle flight")
    if figure:
        import matplotlib.pyplot as plt
        from matplotlib.patches import Patch
        fig, axes = plt.subplots(2, 1, figsize=(10, 7.8), layout="constrained", sharex=True, sharey=True)
        for ax, (treads, supports, _), title in zip(axes, models, ["Open Stair Studio · IFC4", "De Vries · IFC2x3"]):
            for i, outline in enumerate(treads):
                ax.fill(*outline.exterior.xy, color="#a2ceb9" if 5 <= i < 10 else "#e5c49a",
                        ec="#42382f", lw=.8)
                p = outline.centroid if outline.contains(outline.centroid) else outline.representative_point()
                ax.text(p.x, p.y, str(i+1), ha="center", va="center", fontsize=8)
            for outline in supports:
                for piece in getattr(outline, "geoms", [outline]):
                    ax.fill(*piece.exterior.xy, fc="#637a91", alpha=.62)
            ax.set(aspect="equal", title=title, ylabel="mm")
        axes[-1].set_xlabel("mm")
        axes[0].legend(handles=[Patch(color=c, label=s) for c, s in
                            [("#e5c49a", "Kwartdraai"), ("#a2ceb9", "Tussenloop"), ("#637a91", "Wangen en spillen")]],
                       loc="upper center", bbox_to_anchor=(.5, 1.31), ncol=3, frameon=False)
        fig.savefig(figure, dpi=165)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--express", action="store_true")
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--figure", type=Path)
    args = parser.parse_args()
    if args.figure and not args.reference:
        parser.error("--figure requires --reference")
    if args.reference:
        source = measurement["inspect"](args.reference)
        equal(source["size_mm"], [3140, 992.105, 3950], .002, "reference envelope")
        equal(source["offsets_mm"], [45]*15, .002, "reference nosings")
        equal(source["board_angles_delta_deg"], [*FIRST, *[0]*5, *SECOND], .002, "reference angles")
    fixtures = [
        ("3140x992", (3140, 992), FIRST, SECOND, 0),
        ("3300x1100", (3300, 1100), FIRST, [15, 17, 19, 20, 19], 0),
        ("eerste-kwart", (3140, 992), [17, 18, 19, 20, 16], SECOND, 0),
        ("positie-min15", (3140, 992), FIRST, SECOND, -15),
        ("positie-plus15", (3140, 992), FIRST, SECOND, 15),
    ]
    for stem, size, first, second, position in fixtures:
        base = f"tweekwart-{stem}"
        left = {}
        for hand in ("links", "rechts"):
            physical_ifc = None
            for fmt in ("ifc", "ifcx"):
                path = args.directory / f"{base}-{hand}.{fmt}"
                meshes = inspect(path, size, first, second, position, hand, args.express)
                signature = reflected_parts(meshes, hand)
                if hand == "links":
                    left[fmt] = signature
                else:
                    compare_parts(signature, left[fmt], f"{path.name} mirror")
                if fmt == "ifc":
                    physical_ifc = signature
                else:
                    compare_parts(signature, physical_ifc, f"{path.name} vs IFC4")
                if stem == "3140x992" and hand == "links" and fmt == "ifc" and args.reference:
                    compare(meshes, list(measurement["meshes"](args.reference)), args.figure)


if __name__ == "__main__":
    main()
