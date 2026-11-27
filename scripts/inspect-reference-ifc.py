"""Measure staircase products in supplied IFC files. Geometry is reported in millimetres."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import element, shape, unit
import numpy as np


def bounds(vertices):
    low = vertices.min(axis=0)
    high = vertices.max(axis=0)
    return {key: np.round(vector, 4).tolist() for key, vector in (
        ("min", low), ("max", high), ("size", high - low),
    )}


def aggregate_tree(root):
    pending = [root]
    nodes = {}
    while pending:
        node = pending.pop()
        if node.id() in nodes:
            continue
        nodes[node.id()] = node
        for relationship in (*node.IsDecomposedBy, *getattr(node, "IsNestedBy", ())):
            pending.extend(relationship.RelatedObjects)
    return list(nodes.values())


def inspect_stair(stair, settings, scale, details):
    objects = aggregate_tree(stair)
    products = [obj for obj in objects if getattr(obj, "Representation", None)]
    storey = element.get_container(stair)
    parents = [rel.RelatingObject.is_a() for rel in stair.Decomposes]
    record = {
        "guid": stair.GlobalId, "name": stair.Name,
        "type": getattr(stair, "PredefinedType", getattr(stair, "ShapeType", None)),
        "storey": storey.Name if storey else None, "decomposition_parents": parents,
        "direct_children": dict(Counter(
            obj.is_a() for rel in stair.IsDecomposedBy for obj in rel.RelatedObjects
        )),
        "psets": element.get_psets(stair),
        "represented_products": len(products), "regenerated_products": 0,
        "failures": [], "flights": [],
    }
    vertices = []
    if details:
        record["parts"] = []
    for obj in products:
        try:
            mesh = ifcopenshell.geom.create_shape(settings, obj)
            coords = shape.get_vertices(mesh.geometry) * 1000
            faces = shape.get_faces(mesh.geometry)
            if not len(coords) or not len(faces):
                raise ValueError("No triangulated solid faces")
        except (RuntimeError, ValueError) as error:
            record["failures"].append({"id": obj.id(), "error": str(error)})
            continue
        vertices.extend((coords.min(axis=0), coords.max(axis=0)))
        record["regenerated_products"] += 1
        if details:
            record["parts"].append({
                "id": obj.id(), "class": obj.is_a(), "name": obj.Name,
                "bounds_mm": bounds(coords),
                "representations": [[r.RepresentationIdentifier, r.RepresentationType]
                                    for r in obj.Representation.Representations],
            })
            # Use mesh boundary edges. A top face triangulation diagonal gives a different angle.
            edges = coords[shape.get_edges(mesh.geometry)]
            highest_edges = edges[np.max(np.abs(edges[:, :, 2] - coords[:, 2].max()), axis=1) < 0.0001]
            if len(highest_edges):
                record["parts"][-1]["top_edges_xy_mm"] = np.round(highest_edges[:, :, :2], 4).tolist()
                vectors = highest_edges[:, 1, :2] - highest_edges[:, 0, :2]
                vector = vectors[np.argmax(np.linalg.norm(vectors, axis=1))]
                if np.linalg.norm(vector) > 0.0001:
                    record["parts"][-1]["longest_top_edge_deg_mod_180"] = round(
                        float(np.degrees(np.arctan2(vector[1], vector[0])) % 180), 6
                    )
            if obj.is_a("IfcStairFlight"):
                triangles = coords[faces]
                planes = triangles[np.ptp(triangles[:, :, 2], axis=1) < 0.0001]
                heights = np.round(planes[:, 0, 2], 4)
                record["parts"][-1]["horizontal_faces_mm"] = [
                    {"z": float(z), "bounds_mm": bounds(planes[heights == z].reshape(-1, 3))}
                    for z in np.unique(heights)
                ]
    for obj in objects:
        if obj.is_a("IfcStairFlight"):
            record["flights"].append({
                "id": obj.id(),
                "risers": getattr(obj, "NumberOfRisers", getattr(obj, "NumberOfRiser", None)),
                "treads": obj.NumberOfTreads,
                "riser_mm": obj.RiserHeight * scale * 1000 if obj.RiserHeight is not None else None,
                "going_mm": obj.TreadLength * scale * 1000 if obj.TreadLength is not None else None,
                "psets": element.get_psets(obj),
            })
    record["world_bounds_mm"] = bounds(np.array(vertices)) if vertices else None
    return record


def inspect_file(path, settings, details):
    model = ifcopenshell.open(path)
    scale = unit.calculate_unit_scale(model)
    return {
        "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "schema": model.schema, "project_length_unit_in_metres": scale,
        "model_counts": {name: len(model.by_type(name)) for name in (
            "IfcStair", "IfcStairFlight", "IfcMaterial", "IfcElementQuantity",
            "IfcRelAssociatesClassification", "IfcRelContainedInSpatialStructure",
        )},
        "stairs": [inspect_stair(stair, settings, scale, details) for stair in model.by_type("IfcStair")],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="Unpacked IFC model(s)")
    parser.add_argument("--details", action="store_true", help="Include product bounds and horizontal flight faces")
    args = parser.parse_args()
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    reports = [inspect_file(path, settings, args.details) for path in args.files]
    print(json.dumps({"ifcopenshell": ifcopenshell.version, "models": reports}, indent=2, default=str))
    raise SystemExit(int(any(s["failures"] for model in reports for s in model["stairs"])))
