"""Verify IFC4 exports with a second reader, its EXPRESS rules and OpenCascade.

From a checkout with npm dependencies installed:
uv run --no-project --python 3.12 --with ifcopenshell==0.9.0.post1 --with pytest scripts/verify-ifc-independent.py
"""

import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.validate as validation
import numpy as np
from ifcopenshell.util.shape import get_vertices, get_volume


def has_vertices(mesh, points):
    return all(np.min(np.linalg.norm(mesh - point, axis=1)) < 1e-7 for point in points)


def boundary_faces(brep):
    faces = []
    for face in brep.Outer.CfsFaces:
        (bound,) = face.Bounds
        assert bound.Orientation
        # Discard sub-nanometre STEP serialisation differences for comparison.
        faces.append([tuple(round(v, 9) for v in p.Coordinates) for p in bound.Bound.Polygon])
    return faces


def verify_mitres(beams, shells):
    joints = 0
    for side in {b['side'] for b in beams}:
        ordered = [shells[b['id']] for b in beams if b['side'] == side]
        for (first, first_vertices), (second, second_vertices) in zip(ordered, ordered[1:]):
            shared = [(a, b) for a in first for b in second if len(a) == 4 and set(a) == set(b)]
            assert len(shared) == 1, 'adjacent boards must share one complete mitre face'
            a, b = shared[0]
            assert a[(a.index(b[0]) - 1) % len(a)] == b[1], 'joint faces must have opposite normals'
            p = np.asarray(a)
            normal = np.cross(p[1] - p[0], p[2] - p[0])
            normal /= np.linalg.norm(normal)
            assert np.max((first_vertices - p[0]) @ normal) < 1e-7
            assert np.min((second_vertices - p[0]) @ normal) > -1e-7
            joints += 1
    return joints


def verify_export(path, settings):
    expected = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
    log = validation.json_logger()
    validation.validate(str(path), log, express_rules=True)
    assert not log.statements, (path.name, log.statements)
    model = ifcopenshell.open(str(path))
    assert model.schema == 'IFC4'
    assert model.by_type('IfcProject')[0].Name == expected['name']
    products = model.by_type('IfcStairFlight') + model.by_type('IfcSlab')
    solids = [item for product in products for rep in product.Representation.Representations for item in rep.Items]
    beams = expected['beams']
    pending_beams = {b['id']: b for b in beams}
    pending_treads = {t['key']: t for t in expected['treads']} if expected['winding'] else {}
    shells = {}
    vertices = []
    total = 0
    for solid in solids:
        mesh = geom.create_shape(settings, solid)
        corners = get_vertices(mesh)
        volume = get_volume(mesh)
        assert volume > 0
        total += volume
        vertices.extend(corners)
        if solid.is_a('IfcFacetedBrep'):
            (beam,) = [b for b in pending_beams.values() if has_vertices(corners, b['vertices'])]
            assert abs(volume - beam['volume']) < 1e-8, beam['id']
            shells[beam['id']] = boundary_faces(solid), corners.copy()
            del pending_beams[beam['id']]
        elif solid.SweptArea.is_a('IfcArbitraryClosedProfileDef'):
            tread = pending_treads.pop(solid.SweptArea.ProfileName)
            assert abs(volume - tread['volume']) < 1e-8, tread['key']
            top = corners[np.abs(corners[:, 2] - tread['z']) < 1e-7, :2]
            assert len(top) >= 3 and has_vertices(top, tread['coords'])
    assert not pending_beams and not pending_treads
    joints = verify_mitres(beams, shells)
    low, high = np.min(vertices, axis=0), np.max(vertices, axis=0)
    bounds = [*low[:2], *(high - low)[:2], high[2]]
    np.testing.assert_allclose(bounds, expected['bounds'], rtol=0, atol=1e-6)
    assert abs(expected['volume'] - total) < 1e-7, path.name
    print(f'{path.stem}: {len(solids)} solids, {joints} mitre joints, {total:.6f} m³', flush=True)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    settings = geom.settings()
    settings.set('use-world-coords', True)
    print(f'IfcOpenShell {ifcopenshell.version}', flush=True)
    with TemporaryDirectory(prefix='oss-ifc-') as temporary:
        subprocess.run(['node', 'scripts/verify-stair.mjs', '--fixtures', temporary], cwd=root, check=True)
        cases = sorted(Path(temporary).glob('*.ifc'))
        assert len(cases) == 12
        for case in cases:
            verify_export(case, settings)
