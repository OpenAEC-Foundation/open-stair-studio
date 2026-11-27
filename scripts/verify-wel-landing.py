"""Measure eight mirrored half-turn landings and their incoming and outgoing riser joints.

node scripts/export-wel-tweekwart.mjs <directory> --bordessen
uv run --python 3.12 --with ifcopenshell==0.9.0.post1 python scripts/verify-wel-landing.py <directory>
"""
import argparse
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import element, shape
import numpy as np


def products(path):
    if path.suffix == ".ifcx":
        layer = json.loads(path.read_text(encoding="utf-8"))
        for node in layer["data"]:
            attrs = node["attributes"]
            if mesh := attrs.get("usd::usdgeom::mesh"):
                data = attrs["openaec::ifc4"]
                slab = data.get("quantitySets", {}).get("Qto_SlabBaseQuantities", {})
                yield data["Tag"], np.array(mesh["points"])*1000, np.array(mesh["faceVertexIndices"]).reshape(-1, 3), slab.get("NetVolume", {}).get("value")
    else:
        model = ifcopenshell.open(path)
        settings = ifcopenshell.geom.settings()
        settings.set("use-world-coords", True)
        for obj in model.by_type("IfcProduct"):
            if getattr(obj, "Representation", None):
                body = ifcopenshell.geom.create_shape(settings, obj)
                quantity = element.get_pset(obj, "Qto_SlabBaseQuantities", "NetVolume")
                yield obj.Tag, shape.get_vertices(body.geometry)*1000, shape.get_faces(body.geometry), quantity


def corners(xs, ys, z):
    return [[x, y, z] for x in xs for y in ys]


def has(points, expected):
    for p in expected:
        assert np.linalg.norm(points - p, axis=1).min() < .002, ("missing corner", p)


def verify(path, position, right, housed):
    parts = {tag: (v, f, q) for tag, v, f, q in products(path)}
    slab, faces, quantity = parts["ST-01-LB-01"]
    incoming = parts["ST-01-V1-UIT-SB"][0]
    outgoing = parts["ST-01-TD-08-SB"][0]
    if right:
        for v in (slab, incoming, outgoing):
            v[:, 1] *= -1
    # Seven straight goings per flight before the eight-rise landing.
    entry = 7*220 - position
    exit_edge = 7*220 + position - 45 - 13
    back = 7*220 + 1000
    for z in [1460, 1500]:
        has(slab, [[entry, -440, z], [back, -440, z], [back, 1420, z],
                   [exit_edge, 1420, z], [exit_edge, 490, z], [entry, 490, z]])
    entry_face = entry + 45
    has(incoming, corners([entry_face, entry_face + 13], [-402, 402], 1460))
    has(outgoing, corners([exit_edge, exit_edge + 13], [578, 1382], 1500))
    if housed:
        for start, center_y, mouth, groove_floor, lip_tip, board in (
                (entry_face, 0, 1460, 1468, 1467.8, incoming),
                (exit_edge, 980, 1500, 1492, 1492.2, outgoing)):
            for z in (mouth, groove_floor):
                has(slab, corners([start+3.05, start+9.95], [center_y-390, center_y+390], z))
            has(board, corners([start+3.25, start+9.75], [center_y-386.8, center_y+386.8], lip_tip))
    else:
        assert abs(incoming[:, 2].max()-1460) < .002
        assert abs(outgoing[:, 2].min()-1500) < .002
    expected = ((back - entry) + (back - exit_edge)) * 930 * 40
    if housed:
        expected -= 2 * 780 * 6.9 * 8
    a, b, c = (slab-slab.mean(axis=0))[faces].transpose(1, 0, 2)
    volume = abs(np.einsum("ij,ij->i", a, np.cross(b, c)).sum())/6
    assert abs(volume-expected) < 30, (path, volume, expected)
    assert abs(quantity*1e9-expected) < 1, (path, quantity, expected)
    print(f"{path.name}: {volume/1e6:.6f} liter")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory
    for hand in ["left", "right"]:
        for position in [-15, 15]:
            for joint in ["butt", "housed"]:
                for suffix in ["ifc", "ifcx"]:
                    verify(directory/f"{hand}_{position}_{joint}.{suffix}", position,
                           hand == "right", joint == "housed")
