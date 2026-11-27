"""Measure the actual IFC4, IFCX or manufacturer IFC meshes in world millimetres."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import element, shape, unit
import numpy as np


def meshes(path):
    if path.suffix.lower() == ".ifcx":
        for node in json.loads(path.read_text(encoding="utf-8"))["data"]:
            mesh = node["attributes"].get("usd::usdgeom::mesh")
            if mesh:
                yield (np.array(mesh["points"]) * 1000,
                       np.array(mesh["faceVertexIndices"]).reshape(-1, 3), node["attributes"]["bsi::ifc::class"]["code"])
    else:
        settings = ifcopenshell.geom.settings()
        settings.set("use-world-coords", True)
        model = ifcopenshell.open(path)
        for product in model.by_type("IfcProduct"):
            if getattr(product, "Representation", None):
                body = ifcopenshell.geom.create_shape(settings, product)
                yield shape.get_vertices(body.geometry) * 1000, shape.get_faces(body.geometry), product.is_a()


def top_boundary(vertices, faces):
    # Weld repeated IFCX triangle vertices before removing shared top-face diagonals.
    triangles = vertices[faces]
    triangles = triangles[np.max(abs(triangles[:, :, 2] - vertices[:, 2].max()), axis=1) < .01]
    edges = Counter()
    for tri in triangles:
        points = [tuple(point) for point in np.round(tri[:, :2], 4)]
        for a, b in zip(points, points[1:] + points[:1]):
            edges[tuple(sorted((a, b)))] += 1
    return np.array([edge for edge, count in edges.items() if count == 1])


def inspect(path):
    boards, treads, bounds = [], [], []
    for vertices, faces, kind in meshes(path):
        bounds.extend([vertices.min(axis=0), vertices.max(axis=0)])
        if kind not in ("IfcPlate", "IfcBuildingElementPart"):
            continue
        height = np.ptp(vertices[:, 2])
        if abs(height - 38) < .01 or 100 < height < 200:
            group = treads if abs(height - 38) < .01 else boards
            group.append((vertices[:, 2].max(), top_boundary(vertices, faces)))
    for group in (boards, treads):
        group.sort(key=lambda pair: pair[0])
    assert len(boards) == 16 and len(treads) in (15, 16), (path, len(boards), len(treads))
    angles, offsets, centers, depths, axes = [], [], [], [], []
    for i, (height, board) in enumerate(boards):
        vectors = board[:, 1] - board[:, 0]
        axis = vectors[np.linalg.norm(vectors, axis=1).argmax()]
        axis = axis / np.linalg.norm(axis)
        axes.append(axis)
        angles.append(np.degrees(np.arctan2(axis[1], axis[0])))
        centers.append(board.reshape(-1, 2).mean(axis=0))
        if i == 15:
            break
        tread_height, tread = treads[i]
        assert abs(tread_height - height - 38) < .02
        normal = np.array([-axis[1], axis[0]])
        if (boards[i + 1][1].mean(axis=(0, 1)) - centers[-1]) @ normal < 0:
            normal = -normal

        def projections(edges):
            vectors = edges[:, 1] - edges[:, 0]
            lengths = np.linalg.norm(vectors, axis=1)
            parallel = edges[(lengths > 500) & (abs(vectors @ normal) < .001 * lengths)]
            return parallel.mean(axis=1) @ normal

        tread_proj = projections(tread)
        offsets.append(projections(board).min() - tread_proj.min())
        depths.append(round(float(np.ptp(tread_proj)), 3) if len(tread_proj) > 1 else None)
    angles = (np.diff(angles) + 90) % 180 - 90
    goings = []
    for i, angle in enumerate(angles):
        if abs(angle) >= .01:
            goings.append(None)
            continue
        normal = np.array([-axes[i][1], axes[i][0]])
        if np.subtract(centers[i+1], centers[i]) @ normal < 0:
            normal *= -1
        # A corner can split one board edge and bias its arithmetic vertex mean.
        planes = [(boards[j][1].reshape(-1, 2) @ normal).min() for j in (i, i+1)]
        goings.append(round(float(planes[1] - planes[0]), 3))
    return dict(file=path.name, sha256=sha256(path.read_bytes()).hexdigest(),
                straight_going_mm=goings, parts=len(bounds)//2, size_mm=np.ptp(bounds, axis=0).round(3).tolist(),
                offsets_mm=np.round(offsets, 3).tolist(), parallel_depths_mm=depths,
                first_board_xy_mm=np.round(centers[0], 3).tolist(),
                board_angles_delta_deg=angles.round(3).tolist())


def check_nosing_property(path, measured):
    targets = [("IfcStair", "Pset_StairCommon"), ("IfcStairFlight", "Pset_StairFlightCommon")]
    if path.suffix == ".ifcx":
        nodes = json.loads(path.read_text(encoding="utf-8"))["data"]
        def attributes(kind):
            node, = [n for n in nodes if n["attributes"]["bsi::ifc::class"]["code"] == kind]
            return node["attributes"]["openaec::ifc4"]
        assert attributes("IfcProject")["units"]["LENGTHUNIT"] == "METRE"
        values = []
        for kind, pset in targets:
            prop = attributes(kind)["propertySets"][pset]["NosingLength"]
            assert prop["type"] == "IFCLENGTHMEASURE"
            values.append(prop["value"] * 1000)
    else:
        model = ifcopenshell.open(path)
        scale = unit.calculate_unit_scale(model) * 1000
        values = []
        for kind, pset in targets:
            obj, = model.by_type(kind)
            values.append(element.get_pset(obj, pset, "NosingLength") * scale)
    for value in values:
        assert np.allclose(measured, value, atol=.02), (path, value, measured)


def verify_exports(directory):
    # Read both physical formats independently, using world coordinates.
    for family, hands in [("steek", ["left"]), ("tweekwart", ["left", "right"])]:
        for extension in ["ifc", "ifcx"]:
            for position in [-15, 0, 15]:
                mirror = []
                for hand in hands:
                    path = directory / f"{family}_{hand}_{position}.{extension}"
                    result = inspect(path)
                    assert np.allclose(result["offsets_mm"], 45, atol=.02), result
                    check_nosing_property(path, result["offsets_mm"])
                    angles = np.array(result["board_angles_delta_deg"])
                    if family == "tweekwart":
                        mask = [True]*5 + [False]*5 + [True]*5
                        assert np.array_equal(abs(angles) > 1, mask), result
                        assert abs(abs(sum(angles)) - 180) < .02, result
                        assert np.allclose(result["straight_going_mm"][5:10], 220.513, atol=.02), result
                        assert np.allclose(result["parallel_depths_mm"][5:10], 265.513, atol=.02), result
                        cloud = np.vstack([v for v, _, _ in meshes(path)])
                        if hand == "right":
                            cloud[:, 1] *= -1
                        mirror.append(set(map(tuple, np.round(cloud, 2))))
                    else:
                        assert np.allclose(result["parallel_depths_mm"], 265, atol=.02), result
                        center = result["first_board_xy_mm"]
                        if position == -15:
                            start = center
                        assert abs((start[0] - center[0]) - (position + 15)) < .02, result
                    print(json.dumps(result))
                if mirror:
                    assert mirror[0] == mirror[1], (path, "mirrored vertices", len(mirror[0] ^ mirror[1]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", type=Path, nargs="*")
    parser.add_argument("--verify-exports", type=Path)
    args = parser.parse_args()
    if args.verify_exports:
        verify_exports(args.verify_exports)
    for path in args.files:
        print(json.dumps(inspect(path), ensure_ascii=True))
