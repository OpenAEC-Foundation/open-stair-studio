"""Reopen timber newel examples and compare manufactured outlines in millimetres."""
import argparse
import json
from hashlib import sha256
from pathlib import Path
from runpy import run_path

import ifcopenshell
import ifcopenshell.validate
import numpy as np
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union

compact = run_path(Path(__file__).with_name("measure-compact-tweekwart.py"))
measurement = compact["measurement"]
REFERENCE_SHA = "71baad364be87316e989403eaf917e2ea8ca9db9685d7a03fc54db53cccef746"
CONNECTED = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]


def outline(v, f):
    triangles = (Polygon(points) for points in v[f, :2])
    return unary_union([tri for tri in triangles if tri.area > 1.e-8]).simplify(.00001)


def parts(meshes, hand=None):
    # Reference axes are global manufacturer axes. Register to the bottom-right
    # footprint corner and lower landing, using the same translation throughout.
    bounds = np.vstack([v for v, _, _ in meshes])
    lo, hi = bounds.min(axis=0), bounds.max(axis=0)
    treads, posts = [], []
    for vertices, faces, kind in meshes:
        v = vertices.copy()
        if hand:
            if hand == "rechts":
                v[:, 1] *= -1
        else:
            v[:, :2] = np.column_stack((vertices[:, 1]-lo[1], hi[0]-vertices[:, 0]))
            v[:, 2] -= lo[2]
        height = np.ptp(v[:, 2])
        if kind in ("IfcPlate", "IfcBuildingElementPart") and abs(height-38) < .005:
            treads.append((v[:, 2].max(), outline(v, faces)))
        if height >= 2899 and max(np.ptp(v[:, :2], axis=0)) < 200:
            posts.append((v[:, 2].max(), v[:, 2].min(), MultiPoint(v[:, :2]).convex_hull))
    assert len(treads) in (15, 16) and len(posts) == 2, (len(treads), len(posts))
    treads.sort(key=lambda p: p[0])
    posts.sort(key=lambda p: p[2].centroid.y)
    return [p[1] for p in treads[:15]], posts


def properties_and_connections(path):
    if path.suffix == ".ifcx":
        nodes = json.loads(path.read_text(encoding="utf-8"))["data"]
        by_id = {n["path"]: n["attributes"]["openaec::ifc4"] for n in nodes}
        data = [by_id[n["path"]] for n in nodes if
                n["attributes"]["bsi::ifc::class"]["code"] == "IfcMember" and
                by_id[n["path"]].get("PredefinedType") == "POST"]
        links = [(node.get("Name"), by_id[link["target"]].get("Name"))
                 for node in by_id.values() for link in node.get("connections", [])]
        psets = [o.get("propertySets", {}) for o in data]
        names = [o["Name"] for o in data]
    else:
        model = ifcopenshell.open(str(path))
        data = [o for o in model.by_type("IfcMember") if o.PredefinedType == "POST"]
        names = [o.Name for o in data]
        links = [(r.RelatingElement.Name, r.RelatedElement.Name) for r in model.by_type("IfcRelConnectsElements")]
        psets = [ifcopenshell.util.element.get_psets(o) for o in data]
    assert len(names) == 2 and all("OSS_Spil" in p for p in psets), (path, names, psets)
    pairs = {tuple(sorted((a, b))) for a, b in links if a in names or b in names}
    for name, indices in (("Onderspil", CONNECTED[:6]), ("Bovenspil", CONNECTED[6:])):
        assert name in names
        actual = sorted(int(item.rsplit("-", 1)[1]) for pair in pairs if name in pair
                        for item in pair if item != name)
        assert actual == indices, (path, name, actual)
    return names, pairs


def compare_reference(result, ref):
    treads, posts = result
    deltas = [a.boundary.hausdorff_distance(b.boundary) for a, b in zip(treads, ref[0], strict=True)]
    # Studio depth is specified as 992 mm. Manufacturer's measured depth is 992.105 mm.
    for (z1, z0, p), (rz1, rz0, rp) in zip(posts, ref[1], strict=True):
        assert p.boundary.hausdorff_distance(rp.boundary) < .2, (p.bounds, rp.bounds)
        np.testing.assert_allclose([z0, z1], [rz0, rz1], atol=.002, rtol=0)
    return deltas


def td15_board(poly):
    # TD15 is laid out from its inclined nosing. Use its outside intersection
    # with the outer stringer as the physical board datum for both products.
    vertices = np.array(poly.simplify(.001).exterior.coords)
    edges = list(zip(vertices[:-1], vertices[1:]))
    a, b = max(edges, key=lambda e: np.linalg.norm(e[1]-e[0]))
    outer, inner = sorted([a, b], key=lambda p: -p[1])
    axis = (inner-outer) / np.linalg.norm(inner-outer)
    return Polygon((vertices-outer) @ np.column_stack((axis, [-axis[1], axis[0]])))


def plot(result, ref, target):
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(11, 6), layout="constrained")
    for ax, i, post in zip(axes, [0, 14], [0, 1], strict=True):
        for model, color, label, style in [(ref, "#064d46", "De Vries IFC2x3", "-"),
                                           (result, "#b34b19", "Open Stair Studio IFC4", "--")]:
            poly = model[0][i]
            p = model[1][post][2]
            ax.plot(*poly.exterior.xy, color=color, ls=style, label=label, lw=2)
            ax.plot(*p.exterior.xy, color=color, ls=style, lw=1)
        p = ref[1][post][2]
        ax.set(xlim=(p.bounds[0]-45, p.bounds[2]+100), ylim=(p.bounds[1]-55, p.bounds[3]+55),
               xlabel="X in mm", ylabel="Y in mm", aspect="equal", title=f"Trede {i+1} en {['onderspil','bovenspil'][post]}")
        ax.legend(loc="best", fontsize=8)
        ax.grid(alpha=.15)
    fig.savefig(target, dpi=180)
    plt.close(fig)


def verify_pockets(meshes, hand, treads, variant):
    newels = sorted([(v.copy(), f) for v, f, _ in meshes if np.ptp(v[:, 2]) >= 2899
                     and max(np.ptp(v[:, :2], axis=0)) < 200], key=lambda pair: abs(pair[0][:, 1].mean()))
    for j, (v, f) in enumerate(newels):
        if hand == "rechts":
            v[:, 1] *= -1
        block = MultiPoint(v[:, :2]).convex_hull
        depth = 8 if variant == "insteek" else 5 if j == 1 and variant == "gemengd" else 0
        triangles = v[f]
        # Any horizontal triangle strictly inside the post envelope belongs to a pocket floor or ceiling.
        flat = triangles[np.ptp(triangles[:, :, 2], axis=1) < .001]
        elev = flat[:, 0, 2]
        internal = (elev > v[:, 2].min()+.001) & (elev < v[:, 2].max()-.001)
        a, b, c = (v-v.mean(axis=0))[f].transpose(1, 0, 2)
        volume = abs(np.einsum("ij,ij->", a, np.cross(b, c))) / 6
        blank_volume = block.area * np.ptp(v[:, 2])
        if not depth:
            np.testing.assert_allclose(volume, blank_volume, rtol=3.e-6)
            assert not internal.any(), (hand, variant, j)
            continue
        gap = .4 if variant == "insteek" else 0
        expected_levels = []
        removed = 0
        for index in (CONNECTED[:6] if j == 0 else CONNECTED[6:]):
            tread = treads[index-1]
            overlap = block.intersection(tread)
            removed += overlap.area * (38 + gap)
            # A mortise cut from two adjacent faces can extend past the inside
            # corner only within the prescribed distance of at least one face.
            assert overlap.intersection(block.buffer(-depth-.002)).area < .01
            assert overlap.intersection(block.buffer(-depth+.1)).area > .001
            for z in (index*181.25-38-gap/2, index*181.25+gap/2):
                cap = unary_union([Polygon(t[:, :2]) for t in flat[abs(elev-z) < .001]])
                assert not cap.is_empty and cap.symmetric_difference(overlap).area < .15, (hand, j, index, z, cap.area, overlap.area, cap.symmetric_difference(overlap).area)
                expected_levels.append(z)
        assert all(min(abs(z-np.array(expected_levels))) < .001 for z in elev[internal])
        np.testing.assert_allclose(volume, blank_volume-removed, rtol=3.e-6)
        print(f"{variant}/{hand} {j+1} · {removed/1000:.3f} cm³ pockets; {volume/1.e6:.6f} L net")


def verify_tread_program(base, expected, hand):
    import re
    from shapely.geometry import LineString, Point
    job = json.loads(base.with_suffix(".cam.json").read_text(encoding="utf-8"))
    nc = base.with_suffix(".ngc").read_text(encoding="utf-8")
    assert nc.rstrip().endswith("M2") and "G21 G17 G90" in nc
    plunges = np.array(re.findall(r"^G1 Z(-[\d.]+)", nc, re.M), dtype=float)
    assert np.all(np.diff(plunges) < 0) and abs(plunges[-1]+38+job["parameters"]["breakthrough"]) < .0001
    moves = r"^G[01] X(-?[\d.]+) Y(-?[\d.]+)"
    entry = re.search(moves.replace("[01]", "0"), nc, re.M).groups()
    if "o1000 sub" in nc:
        block = nc.split("o1000 sub")[1].split("o1000 endsub")[0]
        assert nc.count("o1000 call") == len(plunges)
    else:
        block = re.split(r"^G1 Z-[\d.]+.*$", nc, flags=re.M)[1]
    trace = np.array([entry, *re.findall(moves, block, re.M)], dtype=float)
    assert np.max(abs(trace[0]-trace[-1])) < .0001
    frame = job["boardFrame"]
    def world(points):
        axes = [[frame[axis][k] for k in ("x", "y")] for axis in ("xAxis", "yAxis")]
        offset = [job["offset"][k] for k in ("x", "y")]
        origin = [frame["origin"][k] for k in ("x", "y")]
        return ((np.array(points)-offset) @ axes + origin) * [1, -1 if hand == "rechts" else 1]
    nominal = Polygon(world([[p["x"], p["y"]] for p in job["contour"]]))
    assert nominal.boundary.hausdorff_distance(expected.boundary) < .002
    path = LineString(world(trace))
    radius = job["parameters"]["toolDiameter"]/2
    vertices = np.array(expected.simplify(.001).exterior.coords)
    for a, b in zip(vertices[:-1], vertices[1:]):
        center = Point((a+b)/2)
        assert abs(path.distance(center)-radius) < .002, (base, center, radius, path.distance(center))
    sweep = path.buffer(radius, quad_segs=64)
    reliefs = [Point(world([[r["center"]["x"], r["center"]["y"]]])[0]).buffer(radius+.002)
               for r in job["reliefs"]]
    unauthorized = sweep.intersection(expected).difference(unary_union(reliefs)).area
    assert unauthorized < .1, (base, unauthorized)
    print(f"{base.name} · {len(plunges)} NC depth passes, {len(reliefs)} internal corner reliefs")



def post_sections(meshes, hand):
    from shapely.geometry import LineString
    from shapely.ops import polygonize
    result = []
    for v, f, _ in meshes:
        if not (np.ptp(v[:, 2]) >= 2899 and max(np.ptp(v[:, :2], axis=0)) < 200):
            continue
        vertical = v.copy()
        if hand == "rechts":
            vertical[:, 1] *= -1
        triangles = vertical[f]
        # Both kernels may add arbitrary vertices on flat faces. Sample each
        # interval between actual pocket levels, excluding triangulation vertices.
        horizontal = triangles[np.ptp(triangles[:, :, 2], axis=1) < .001]
        levels = sorted(set(np.round(horizontal[:, 0, 2], 3)))
        slices = []
        for low, high in zip(levels[:-1], levels[1:]):
            z = (low+high)/2
            lines = []
            for tri in triangles[(triangles[:, :, 2].min(axis=1)<z) & (triangles[:, :, 2].max(axis=1)>z)]:
                points = []
                for a, b in zip(tri, np.roll(tri, 1, axis=0)):
                    if (a[2]<z) != (b[2]<z):
                        points.append((a+(b-a)*((z-a[2])/(b[2]-a[2])))[:2])
                if len(points) == 2:
                    lines.append(LineString(np.round(points, 5)))
            polygons = list(polygonize(lines))
            assert polygons, (hand, low, high)
            sections = unary_union(polygons)
            slices.append(sections)
        result.append((vertical[:, 1].min(), levels, slices))
    return sorted(result, key=lambda item: item[0])


def signatures(meshes, hand):
    beams = [(v, f, k) for v, f, k in meshes if not
             (np.ptp(v[:, 2]) >= 2899 and max(np.ptp(v[:, :2], axis=0)) < 200)]
    return compact["reflected_parts"](beams, hand), post_sections(meshes, hand)


def compare_signatures(actual, expected, label):
    compact["compare_parts"](actual[0], expected[0], label)
    delta = 0
    for (_, a_levels, a), (_, b_levels, b) in zip(actual[1], expected[1], strict=True):
        np.testing.assert_allclose(a_levels, b_levels, atol=.001, rtol=0)
        for p, q in zip(a, b, strict=True):
            delta = max(delta, p.boundary.hausdorff_distance(q.boundary))
            assert p.symmetric_difference(q).area < .1
    assert delta < .001, (label, delta)
    print(f"{label}: 2 newels, maximum section boundary difference {delta:.6f} mm")



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--figure", type=Path)
    parser.add_argument("--express", action="store_true")
    args = parser.parse_args()
    reference = None
    if args.reference:
        assert sha256(args.reference.read_bytes()).hexdigest() == REFERENCE_SHA
        reference = parts(list(measurement["meshes"](args.reference)))
    if args.figure and not reference:
        parser.error("--figure requires --reference")
    for variant in ("stuik", "bronmaat", "insteek", "gemengd"):
        left = {}
        for hand in ("links", "rechts"):
            formats = {}
            for fmt in ("ifc", "ifcx"):
                path = args.directory / f"spil-{variant}-{hand}.{fmt}"
                meshes = list(measurement["meshes"](path))
                formats[fmt] = signatures(meshes, hand)
                treads, posts = result = parts(meshes, hand)
                verify_pockets(meshes, hand, treads, variant)
                if fmt == "ifc":
                    verify_tread_program(path.with_name(path.stem+"-TD15"), treads[-1], hand)
                names, pairs = properties_and_connections(path)
                closest = [min((p[2] for p in posts), key=t.distance) for t in treads]
                indices = [i for i in range(15) if treads[i].distance(closest[i]) < 3]
                assert [i+1 for i in indices] == CONNECTED, (path, indices)
                for i in indices:
                    a, b = treads[i], closest[i]
                    if variant in ("stuik", "bronmaat") or variant == "gemengd" and i < 6:
                        assert a.distance(b) < .002 and a.intersection(b).area < .15, (path, i)
                    if variant == "insteek" or variant == "gemengd" and i >= 9:
                        assert a.intersection(b).area > 1, (path, i)
                assert len(pairs) == len(CONNECTED), (path, names, pairs)
                if variant in ("stuik", "bronmaat") and reference:
                    delta = compare_reference(result, reference)
                    print(f"{path.name} · Hausdorff TD1–15 mm", np.round(delta, 3).tolist())
                    assert max(delta[0], delta[14]) < 1, (path, delta)
                    board_delta = td15_board(treads[-1]).boundary.hausdorff_distance(td15_board(reference[0][-1]).boundary)
                    print(f"{path.name} TD15 board axes {board_delta:.6f} mm")
                    if variant == "bronmaat":
                        assert delta[-1] < .025 and board_delta < .025
                    if args.figure and variant == "stuik" and hand == "links" and fmt == "ifc":
                        plot(result, reference, args.figure)
                if fmt == "ifc" and args.express:
                    logger = ifcopenshell.validate.json_logger()
                    ifcopenshell.validate.validate(str(path), logger, express_rules=True)
                    assert not logger.statements, (path, logger.statements)
                if hand == "links":
                    left[fmt] = formats[fmt]
                else:
                    compare_signatures(formats[fmt], left[fmt], f"{path.name} mirror")
            compare_signatures(formats["ifc"], formats["ifcx"], f"{variant}/{hand} IFC4 vs IFCX")


if __name__ == "__main__":
    main()
