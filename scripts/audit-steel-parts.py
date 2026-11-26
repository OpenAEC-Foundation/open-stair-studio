# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["ifcopenshell","trimesh","manifold3d","scipy"]
# ///
"""Audit the actual IFC4 steel stair download with uv run --script <this> FILENAME.ifc."""
import sys
import numpy as np
import trimesh
import manifold3d
import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util.element import get_pset
from ifcopenshell.util.shape import get_vertices, get_faces

for filename in sys.argv[1:]:
    model = ifcopenshell.open(filename)
    cfg = ifcopenshell.geom.settings()
    cfg.set('use-world-coords', True)
    solids = []
    mass = 0
    for e in model.by_type('IfcElement'):
        data = get_pset(e, 'OSS_Staalonderdeel')
        if not e.Representation or not data:
            continue
        shape = ifcopenshell.geom.create_shape(cfg, e)
        mesh = trimesh.Trimesh(get_vertices(shape.geometry), get_faces(shape.geometry), process=True)
        assert mesh.is_volume, e.Tag
        body = manifold3d.Manifold(manifold3d.Mesh64(np.asarray(mesh.vertices), np.asarray(mesh.faces, dtype=np.uint64)))
        assert body.status() == manifold3d.Error.NoError and not body.is_empty(), e.Tag
        kg = body.volume() * 7850
        assert abs(kg - data['Massa']) <= max(.0001, kg * 1e-6), (e.Tag, kg, data['Massa'])
        mass += kg
        for other, candidate, bounds in solids:
            if np.any(mesh.bounds[1] <= bounds[0] + 1e-9) or np.any(bounds[1] <= mesh.bounds[0] + 1e-9):
                continue
            overlap = (body ^ candidate).volume() * 1e9
            assert overlap < 1, (e.Tag, other, overlap)
        solids.append((e.Tag, body, mesh.bounds))
    assert solids, 'Open an IFC4 file with OSS_Staalonderdeel properties'
    print(f'{filename}: {len(solids)} IFC volumes, {mass:.3f} kg, no overlap above 1 mm³')
