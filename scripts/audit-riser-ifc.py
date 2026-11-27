"""Rebuild exported solids with OpenCascade and test assembled joints with Manifold.

uv run --no-project --python 3.12 --with ifcopenshell==0.9.0.post1 --with manifold3d scripts/audit-riser-ifc.py
"""
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util.shape import get_faces, get_vertices
import manifold3d as mf
import numpy as np


def solid(product, settings):
    shape = ifcopenshell.geom.create_shape(settings, product)
    mesh = mf.Mesh64(np.array(get_vertices(shape.geometry), dtype=np.float64, order="C", copy=True),
                     np.array(get_faces(shape.geometry), dtype=np.uint64, order="C", copy=True))
    mesh.merge()
    body = mf.Manifold(mesh)
    assert body.status() == mf.Error.NoError and body.volume() > 0, (product.Tag, body.status())
    return body


with TemporaryDirectory() as folder:
    subprocess.run(["node", "scripts/verify-riser-ifc.mjs", folder], check=True)
    verified = joints = 0
    for file in Path(folder).glob("*.ifc"):
        model = ifcopenshell.open(str(file))
        expected = json.loads(file.with_suffix(".json").read_text(encoding="utf-8"))
        hosts = model.by_type("IfcPlate") + model.by_type("IfcMember") + model.by_type("IfcSlab")
        settings = ifcopenshell.geom.settings()
        settings.set("use-world-coords", True)
        bodies = {host.Tag: solid(host, settings) for host in hosts}
        connections = {rel.Name: rel for rel in model.by_type("IfcRelConnectsElements")}
        assert connections.keys() == expected["tongueVolumes"].keys()
        connected = {(rel.RelatingElement.Tag, rel.RelatedElement.Tag) for rel in connections.values()}
        risers = {board for _, board in connected}
        boxes = {tag: body.bounding_box() for tag, body in bodies.items()}
        for board in risers:
            for host in bodies.keys() - risers:
                if (host, board) in connected:
                    continue
                # At a mitre the board may touch a second stringer facet.
                # Detect penetration there as well as at its machined host.
                a, b = boxes[host], boxes[board]
                if all(min(a[i+3], b[i+3]) > max(a[i], b[i]) for i in range(3)):
                    clash = (bodies[host] ^ bodies[board]).volume()
                    assert abs(clash) < 1e-10, (file.name, host, board, "neighbour clash in m³", clash)
        for host in hosts:
            actual = bodies[host.Tag].volume()
            scheduled = expected["volumes"][host.Tag]
            # Round nosings use a 24-chord quarter circle in IFC and an
            # analytical section in the cutting list. Straight faces are exact.
            tolerance = 1e-7 if host.ObjectType == "Houten trede" else 1e-8
            assert scheduled > 0 and abs(actual-scheduled) < tolerance, (
                file.name, host.Tag, actual, scheduled
            )
            verified += 1
            rep, = host.Representation.Representations
            operand, = rep.Items
            while operand.is_a("IfcBooleanResult"):
                cut = operand.SecondOperand
                name = cut.SweptArea.ProfileName
                if name in connections:
                    rel = connections.pop(name)
                    assert rel.RelatingElement == host
                    board = bodies[rel.RelatedElement.Tag]
                    clash = (bodies[host.Tag] ^ board).volume()
                    assert abs(clash) < 1e-10, (file.name, name, "material clash in m³", clash)
                    # Expose the IFC cutter temporarily as the host's Body.
                    # The same object placement therefore applies to both.
                    original_type, original_items = rep.RepresentationType, rep.Items
                    try:
                        rep.RepresentationType, rep.Items = "SweptSolid", (cut,)
                        cavity = solid(host, settings)
                    finally:
                        rep.RepresentationType, rep.Items = original_type, original_items
                    embedded = (cavity ^ board).volume()
                    tongue = expected["tongueVolumes"][name]
                    assert tongue > 0 and abs(embedded - tongue) < 1e-10, (
                        file.name, name, "embedded lip in m³", embedded, tongue
                    )
                    joints += 1
                operand = operand.FirstOperand
        assert not connections, (file.name, list(connections))
    print(f"Verified {verified} net IFC volumes and the assembled fit of {joints} riser tongues.")
