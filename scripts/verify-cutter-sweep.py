"""Check the *written NGC* cutter sweep, independent of CAM polygon offsets.

uv run --no-project --python 3.12 --with shapely scripts/verify-cutter-sweep.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import re
import subprocess

from shapely.geometry import LineString, Polygon, Point


def at_floor(program, pocket, cam):
    marker = f"(Pocket {pocket['id']} / {pocket['treadId']})"
    lines = program.split(marker, 1)[1].splitlines()
    x = y = z = None
    path = []
    for line in lines:
        if line.startswith("("):
            break
        if not line.startswith(("G0 ", "G1 ")):
            continue
        words = {k: float(v) for k, v in re.findall(r"([XYZF])(-?[0-9.]+)", line)}
        x, y = words.get("X", x), words.get("Y", y)
        z = words.get("Z", z)
        if z is not None and abs(z + pocket["depth"]) < .0001:
            assert line.startswith("G1 ")
            path.append((x, y))
    assert len(path) >= 3
    return LineString(path).buffer(cam["toolDiameter"] / 2, quad_segs=64)


def polygon(data):
    return Polygon([(p["x"], p["y"]) for p in data])


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    checked = 0
    with TemporaryDirectory(prefix="oss-cutter-sweep-") as temp:
        subprocess.run(["node", "scripts/verify-housing-cam.mjs", "--fixtures", temp], cwd=root, check=True)
        for ngc in Path(temp).glob("*.ngc"):
            data = json.loads(ngc.with_suffix(".json").read_text())
            cam, beam = data["cam"], data["beam"]
            radius = cam["toolDiameter"] / 2
            program = ngc.read_text()
            boundary = polygon(beam["outline"])
            previous = []
            for pocket in beam["pockets"]:
                nominal = polygon(pocket["contour"])
                swept = at_floor(program, pocket, cam)
                rounded = nominal.buffer(-radius, join_style="mitre").buffer(radius, quad_segs=64)
                required = nominal if cam["cornerMode"] == "dogbone" else rounded
                assert swept.buffer(.002).covers(required), (ngc.name, pocket["id"], "uncut material")
                assert boundary.buffer(.002).covers(swept), (ngc.name, pocket["id"], "stock breakout")
                if cam["cornerMode"] == "dogbone":
                    for x, y in nominal.exterior.coords:
                        assert swept.buffer(.002).covers(Point(x, y)), "sharp tongue corner would foul"
                    allowed = nominal
                    for vertex in nominal.exterior.coords:
                        allowed = allowed.union(Point(vertex).buffer(2 * radius + .01))
                    assert allowed.buffer(.002).covers(swept), "overcut outside drill relief zone"
                else:
                    assert rounded.buffer(.002).covers(swept), "rounded finish overcut"
                assert not any(swept.intersects(other) for other in previous), "neighbouring housings touch"
                previous.append(swept)
                checked += 1
    assert checked > 0
    print(f"Independent GEOS sweep check: {checked} NGC pocket floors, reach, fit, corner treatment and neighbours verified.")
