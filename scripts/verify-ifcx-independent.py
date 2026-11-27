"""Check IFCX triangulation against OpenCascade on the same generated IFC4 files.

uv run --no-project --python 3.13 --with ifcopenshell==0.9.0.post1 scripts/verify-ifcx-independent.py
Pass --ifcx-cli <local bundled ifcx-cli.cjs> to additionally run buildingSMART's
alpha compositor with schema imports and validation enabled. Tested with the CLI
from buildingSMART/IFC5-development at 1a63082ada967c683cfacee2005f8f749c8e1b79.
"""
import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import ifcopenshell
import ifcopenshell.geom as geom
import numpy as np


def measure(points, indices):
    vertices = np.array(points).reshape(-1, 3)
    faces = np.array(indices).reshape(-1, 3)
    a, b, c = (vertices - vertices.mean(axis=0))[faces].transpose(1, 0, 2)
    volume = abs(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)
    return np.array([vertices.min(axis=0), vertices.max(axis=0)]), volume


def composed_features(node):
    if node["node"]:
        yield node["node"], set(node["attributes"])
    for child in node["children"].values():
        yield from composed_features(child)


def verify(path, settings, cli):
    model = ifcopenshell.open(str(path.with_suffix(".ifc")))
    layer = json.loads(path.read_text(encoding="utf-8"))
    if cli:
        composed = path.with_suffix(".composed.json")
        subprocess.run(["node", cli, "compose", path, composed], check=True)
        features = dict(composed_features(json.loads(composed.read_text(encoding="utf-8"))))
        assert features == {node["path"]: set(node["attributes"]) for node in layer["data"]}

    mesh_count, max_extent_delta, max_volume_delta = 0, 0.0, 0.0
    for node in layer["data"]:
        attributes = node["attributes"]
        guid = attributes["openaec::ifc4"]["globalId"]
        assert node["path"].replace("-", "") == ifcopenshell.guid.expand(guid)
        product = model.by_guid(guid)
        assert attributes["bsi::ifc::class"]["code"] == product.is_a()
        if "usd::usdgeom::mesh" not in attributes:
            assert not getattr(product, "Representation", None), guid
            continue
        shape = geom.create_shape(settings, product)
        bounds, volume = measure(shape.geometry.verts, shape.geometry.faces)
        mesh = attributes["usd::usdgeom::mesh"]
        actual_bounds, actual_volume = measure(mesh["points"], mesh["faceVertexIndices"])
        delta = float(np.max(np.abs(actual_bounds - bounds)))
        volume_delta = abs(actual_volume - volume)
        assert delta < 0.0001, (path.name, guid, delta)
        assert volume_delta < max(1e-7, volume * 1e-4), (path.name, guid, volume, actual_volume)
        mesh_count += 1
        max_extent_delta = max(max_extent_delta, delta)
        max_volume_delta = max(max_volume_delta, volume_delta)
    return mesh_count, max_extent_delta, max_volume_delta


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ifcx-cli", type=Path)
    cli = parser.parse_args().ifcx_cli
    settings = geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    with TemporaryDirectory(prefix="oss-ifcx-") as directory:
        fixtures = Path(directory)
        subprocess.run(["node", "scripts/verify-ifcx.mjs", fixtures], check=True,
                       cwd=Path(__file__).resolve().parents[1])
        results = [verify(path, settings, cli) for path in sorted(fixtures.glob("*.ifcx"))]
        count, bounds, volumes = zip(*results)
        print(f"{len(results)} modellen, {sum(count)} meshes. Maximale afwijking van de omhulling "
              f"{max(bounds)*1000:.4f} mm en van het volume {max(volumes)*1e6:.4f} cm³.")
