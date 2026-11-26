"""Reassemble stock left by both LinuxCNC programs, in design coordinates.

uv run --no-project --python 3.12 --with shapely --with manifold3d python scripts/verify-machined-fit.py
"""

import itertools
import json
import re
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

import manifold3d as mf
import numpy as np
from shapely import affinity, union_all
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
TOL = 0.003  # mm, including four-place NC roundoff and polygonal approximation of circular tools
ARC_SEGMENTS = 96  # per quadrant
NUM = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"


def controller(path, settings, depths):
    """Interpret the exported metric, absolute G0/G1 dialect, grouping uninterrupted cuts at depth."""
    program = path.read_text(encoding="ascii")
    assert "G21" in program and "G90" in program and "G54" in program and "G40" in program
    assert re.search(r"^M2\s*$", program, re.MULTILINE)
    diameter = float(re.search(r"\bD(" + NUM + r")\s*mm", program, re.IGNORECASE)[1])
    assert diameter == settings["toolDiameter"]
    lines = program.splitlines()
    definitions = {}
    expanded = []
    sub = None
    for line in lines:
        command = re.fullmatch(r"o(\d+) (sub|endsub|call)", line)
        if command:
            label, action = command.groups()
            if action == "sub":
                assert sub is None and label not in definitions
                definitions[label] = []
                sub = label
            elif action == "endsub":
                assert sub == label
                sub = None
            else:
                assert sub is None
                expanded.extend(definitions[label])
        elif sub is None:
            expanded.append(line)
        else:
            definitions[sub].append(line)
    assert sub is None
    paths = defaultdict(lambda: defaultdict(list))
    op = path.stem
    x = y = z = None
    cutting = None
    spindle = False
    for line in expanded:
        if line.startswith("(Pocket "):
            op = line.split()[1]
        if re.match(r"^M0?3\b", line):
            spindle = True
        if line == "M5":
            spindle = False
        line = re.sub(r"\([^)]*\)", "", line).strip()
        if not re.search(r"[XYZ]" + NUM, line):
            continue
        motion = re.match(r"^G([01]) ", line)
        assert motion, (path, "unsupported motion", line)
        words = {a: float(b) for a, b in re.findall(r"([XYZF])(" + NUM + ")", line)}
        moving_xy = "X" in words or "Y" in words
        if motion[1] == "0":
            assert not moving_xy or z == settings["safeZ"], (path, "rapid across stock", line, z)
            cutting = None
        elif moving_xy:
            assert cutting is not None and spindle and "Z" not in words, (path, line, z)
            cutting.append((words.get("X", x), words.get("Y", y)))
        elif "Z" in words:
            assert spindle and x is not None and y is not None and words["Z"] < 0
            cutting = [(x, y)]
            paths[op][words["Z"]].append(cutting)
        x, y, z = words.get("X", x), words.get("Y", y), words.get("Z", z)
    assert not spindle and z == settings["safeZ"] and paths
    result = {}
    for op, levels in paths.items():
        wanted = -depths(op)
        assert abs(min(levels) - wanted) < 0.00006, (path, op, wanted, list(levels))
        previous = 0
        for floor, cuts in levels.items():
            assert 0 < previous - floor <= settings["stepDown"] + 0.00011, (op, floor, previous)
            # This controller profile repeats the same XY pattern on every depth pass.
            assert cuts == levels[min(levels)], (op, "changing XY pattern through thickness")
            previous = floor
        # Buffer every G1 block separately. GEOS may simplify a shallow turn if
        # an entire polyline is buffered at once, changing the simulated cut.
        segments = [(a, b) for cut in levels[min(levels)] for a, b in itertools.pairwise(cut) if a != b]
        swept = MultiLineString(segments).buffer(diameter / 2, quad_segs=ARC_SEGMENTS)
        result[op] = (swept, -min(levels))
    return result


def xy(p):
    return np.array([p["x"], p["y"]])


def xyz(p):
    return np.array([p["x"], p["y"], p["z"]])


def polygon(points):
    return Polygon([xy(p) for p in points])


def joined_profile(t):
    pieces = [polygon(t["visible"]), *[polygon(x["points"]) for x in t["tongues"]]]
    profile = polygon(t["profile"])
    assert profile.is_valid and profile.symmetric_difference(union_all(pieces)).area < 0.0001
    return profile


def prism(shape, low, high):
    poly = orient(shape)
    contours = [np.array(ring.coords[:-1]) for ring in [poly.exterior, *poly.interiors]]
    solid = mf.CrossSection(contours).extrude(high - low).translate((0, 0, low))
    assert not solid.is_empty()
    return solid


def blank_solid(raw):
    if "vertices" in raw:
        vertices = np.array([xyz(v) for v in raw["vertices"]])
        triangles = [
            [face[0], face[j], face[j + 1]] for face in raw["faces"] for j in range(1, len(face) - 1)
        ]
        return mf.Manifold(mf.Mesh64(vertices, np.asarray(triangles, dtype="uint64")))
    f = raw["frame"]
    axes = np.column_stack([xyz(f[s]) for s in ["axis", "sideAxis", "down"]])
    size = [raw[k] for k in ["length", "thickness", "width"]]
    corner = xyz(f["origin"]) - axes[:, 1] * size[1] / 2 - axes[:, 2] * size[2] / 2
    return mf.Manifold.cube(size).transform(np.column_stack([axes, corner]))


def frame_matrix(frame):
    return np.column_stack([xyz(frame[key]) for key in ["xAxis", "yAxis", "zAxis", "origin"]])


def stock_to_world(t, margin):
    # Reconstruct using the marked nose ends. No production board frame/offset helper is used.
    a, b = [xy(p) + margin for p in t["nose"]]
    p, q = [xy(v) for v in t["worldNose"]]
    u, v = (b - a) / np.linalg.norm(b - a), (q - p) / np.linalg.norm(q - p)
    assert abs(np.linalg.norm(b - a) - np.linalg.norm(q - p)) < 1e-6
    cos, sin = np.dot(u, v), u[0] * v[1] - u[1] * v[0]
    dx, dy = p - np.array([[cos, -sin], [sin, cos]]) @ a
    return [cos, -sin, sin, cos, dx, dy]


def machined_tread(folder, t, cam):
    path = folder / (t["id"] + ".ngc")
    header = re.search(
        r"\(Stock L("
        + NUM
        + r") W("
        + NUM
        + r") T("
        + NUM
        + r") mm\. Margin ("
        + NUM
        + r") mm per side\. Breakthrough ("
        + NUM
        + r") mm\.\)",
        path.read_text(encoding="ascii"),
    )
    assert header, (path, "stock setup is missing")
    length, width, thickness, margin, breakthrough = map(float, header.groups())
    expected = [
        t["length"] + 2 * cam["stockMargin"],
        t["width"] + 2 * cam["stockMargin"],
        t["thickness"],
        cam["stockMargin"],
        cam["breakthrough"],
    ]
    assert np.allclose([length, width, thickness, margin, breakthrough], expected, rtol=0, atol=0.00006)
    [(cut, _)] = controller(path, cam, lambda _: thickness + breakthrough).values()
    blank = box(0, 0, length, width)
    remaining = blank.difference(cut)
    pieces = list(getattr(remaining, "geoms", [remaining]))
    visible = polygon(t["visible"])
    aligned = [affinity.affine_transform(p, stock_to_world(t, margin)) for p in pieces]
    [actual] = [p for p in aligned if p.contains(visible.representative_point())]
    assert not actual.interiors, (t["id"], "unintended interior cut")
    nominal = joined_profile(t)
    excess = actual.difference(nominal.buffer(TOL))
    assert excess.is_empty, (t["id"], "extra wood outside profile", excess.area, excess.bounds)
    # Only inside corners can lose wood to tool-radius relief; protect all other edges.
    ring = list(orient(nominal).exterior.coords)[:-1]
    corners = []
    for i, vertex in enumerate(ring):
        a, b = np.array(vertex) - ring[i - 1], np.array(ring[(i + 1) % len(ring)]) - vertex
        if a[0] * b[1] - a[1] * b[0] < -1e-5:
            corners.append(Point(vertex).buffer(cam["toolDiameter"] + TOL, quad_segs=ARC_SEGMENTS))
    damage = nominal.difference(actual.buffer(TOL)).difference(unary_union(corners))
    assert damage.is_empty, (t["id"], "lost wood away from tool relief", damage.area)
    return actual


def line_range(shape, a, b):
    line = shape.intersection(LineString([a, b]))
    assert line.geom_type == "LineString" and not line.is_empty, (line.geom_type, a, b)
    return np.array(line.coords)[[0, -1]]


def longest_flat(actual, root, along, length):
    # A buffered tangent would report apparent bearing even when only a
    # circular relief touches the last corner. Measure straight edges instead.
    normal = np.array([-along[1], along[0]])
    ring = np.array(actual.exterior.coords) - root
    across, station = ring @ normal, ring @ along
    intervals = []
    for i in range(len(ring) - 1):
        run = abs(station[i + 1] - station[i])
        if run < 1e-7 or abs(across[i + 1] - across[i]) > run * 0.001:
            continue
        if max(abs(across[i]), abs(across[i + 1])) > TOL:
            continue
        low, high = sorted(station[i : i + 2])
        if low < length and high > 0:
            intervals.append((max(0, low), min(high, length)))
    merged = []
    for low, high in sorted(intervals):
        if merged and low <= merged[-1][1] + 0.0001:
            merged[-1][1] = max(merged[-1][1], high)
        else:
            merged.append([low, high])
    return max((high - low for low, high in merged), default=0)


def measure_tongue(t, tg, actual, pocket, matrix, joinery, diameter):
    a, tip_a, tip_b, b = [xy(p) for p in tg["points"]]
    along = (b - a) / np.linalg.norm(b - a)
    into = (tip_a - a) / np.linalg.norm(tip_a - a)
    width = np.linalg.norm(b - a)
    depth = np.linalg.norm(tip_a - a)
    assert abs(width - np.linalg.norm(tip_b - tip_a)) < TOL and abs(depth - joinery["depth"]) < TOL
    # The entire nominal tongue footprint, including both root corners, must survive.
    assert actual.buffer(TOL).covers(Polygon([a, tip_a, tip_b, b])), (
        t["id"],
        tg["pocketId"],
        "damaged tongue",
    )
    ends = line_range(actual, a + into * depth / 2 - along * 2, b + into * depth / 2 + along * 2)
    lip_ends = sorted((ends - a) @ along)
    assert np.allclose(lip_ends, [0, width], rtol=0, atol=TOL)
    mid = (a + b) / 2
    tip = line_range(actual, mid - into, mid + into * (depth + 2))
    reach = max((tip - mid) @ into)
    swept, floor = pocket
    assert abs(floor - reach) <= TOL, (t["id"], "depth fit", floor, reach)
    low = t["elevation"] - t["thickness"]
    # Turn the actual cutter-swept housing plane upright in the tread assembly.
    upright = affinity.affine_transform(
        swept,
        [
            along @ matrix[:2, 0],
            along @ matrix[:2, 1],
            matrix[2, 0],
            matrix[2, 1],
            along @ (matrix[:2, 3] - a),
            matrix[2, 3] - low,
        ],
    )
    u = line_range(upright, [-1e5, t["thickness"] / 2], [1e5, t["thickness"] / 2])
    z = line_range(upright, [width / 2, -1e5], [width / 2, 1e5])
    left, right = sorted(u[:, 0])
    bottom, top = sorted(z[:, 1])
    gaps = [lip_ends[0] - left, right - lip_ends[1], -bottom, top - t["thickness"]]
    assert np.allclose(gaps, joinery["clearance"] / 2, rtol=0, atol=TOL), (t["id"], "edge gaps", gaps)
    # Both shoulder flats must still bear against the beam. The other end of
    # a shoulder can itself be a relieved corner on a faceted winder.
    nominal = joined_profile(t)
    ring = list(orient(nominal).exterior.coords)[:-1]
    shortest = float("inf")
    for root, direction in [(a, -along), (b, along)]:
        probe = LineString([root, root + direction * 1e4])
        sides = nominal.boundary.intersection(probe.buffer(0.00001, cap_style="flat"))
        segments = [
            s
            for s in getattr(sides, "geoms", [sides])
            if s.length > 0.001 and s.distance(Point(root)) < 0.001
        ]
        assert segments, (tg["pocketId"], "missing design shoulder")
        length = max(s.length for s in segments)
        end = root + direction * length
        i = min(range(len(ring)), key=lambda n: np.linalg.norm(ring[n] - end))
        assert np.linalg.norm(ring[i] - end) < 0.001
        incoming = np.array(ring[i]) - ring[i - 1]
        outgoing = np.array(ring[(i + 1) % len(ring)]) - ring[i]
        reflex = incoming[0] * outgoing[1] - incoming[1] * outgoing[0] < -1e-5
        expected = max(0.0002, length - diameter * (1 + reflex) - TOL)
        bearing = longest_flat(actual, root, direction, length)
        assert bearing >= expected, (tg["pocketId"], "shoulder cut away", bearing, expected)
        shortest = min(shortest, bearing)
    return shortest


def verify_case(folder):
    case = json.loads((folder / "assembly.json").read_text())
    joinery = case["joinery"]
    beams = []
    used = set()
    for beam in case["beams"]:
        program = folder / (beam["id"] + ".ngc")
        pockets = (
            controller(program, case["housingCam"], lambda _: joinery["depth"]) if program.exists() else {}
        )
        matrix = frame_matrix(beam["frame"])
        raw = blank_solid(beam["raw"])
        assert raw.status() == mf.Error.NoError and raw.volume() > 0
        beams.append((beam["id"], raw, pockets, matrix))
    tongue_count = 0
    worst = 0
    shortest = float("inf")
    for t in case["treads"]:
        assert {tg["side"] for tg in t["tongues"]} == {"left", "right"}
        actual = machined_tread(folder, t, case["treadCam"])
        # Let the digital stock surfaces touch; shrink the finished board by the roundoff
        # tolerance before testing penetration. Real positive clearance is measured separately.
        solid = prism(actual.buffer(-TOL), t["elevation"] - t["thickness"] + TOL, t["elevation"] - TOL)
        collision = 0
        for beam_id, raw, pockets, matrix in beams:
            intrusion = solid ^ raw
            tongues = [tg for tg in t["tongues"] if tg["beamId"] == beam_id]
            for tg in tongues:
                assert tg["pocketId"] not in used
                used.add(tg["pocketId"])
                pocket = pockets[tg["pocketId"]]
                shortest = min(
                    shortest,
                    measure_tongue(
                        t, tg, actual, pocket, matrix, joinery, case["treadCam"]["toolDiameter"]
                    ),
                )
                shape, depth = pocket
                cavity = prism(shape, -depth, 0).transform(matrix)
                intrusion -= cavity
                tongue_count += 1
            assert intrusion.status() == mf.Error.NoError
            collision += max(0, intrusion.volume())
        worst = max(collision, worst)
        fits = collision < 1e-6  # mm³ numerical noise after linear allowance
        assert fits == case["expectFit"], (folder.name, t["id"], "collision mm3", collision)
        assert t["status"] == ("pass" if fits else "blocked"), (
            folder.name,
            t["id"],
            t["status"],
            collision,
        )
    assert used == {op for _, _, pockets, _ in beams for op in pockets}
    print(
        f"{folder.name}: {len(case['treads'])} treads, {tongue_count} tongues, max interference {worst:.4f} mm³, minimum shoulder flat {shortest:.3f} mm",
        flush=True,
    )
    return len(case["treads"]), tongue_count


if __name__ == "__main__":
    with TemporaryDirectory(prefix="oss-machined-fit-") as temp:
        directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(temp)
        if len(sys.argv) == 1:
            subprocess.run(["node", "scripts/machined-fit-fixtures.mjs", temp], cwd=ROOT, check=True)
        cases = [f for f in sorted(directory.iterdir()) if f.is_dir()]
        with ProcessPoolExecutor(max_workers=3) as pool:
            totals = list(pool.map(verify_case, cases))
        assert totals
        print(
            f"Independent end-mill and assembly checks: {sum(t[0] for t in totals)} treads, {sum(t[1] for t in totals)} tongue/housing pairs."
        )
