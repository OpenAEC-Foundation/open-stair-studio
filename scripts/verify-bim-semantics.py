"""Read the semantic IFC4 regression exports with IfcOpenShell and OpenCascade.

uv run --no-project --python 3.12 --with ifcopenshell==0.9.0.post1 --with pytest scripts/verify-bim-semantics.py
"""

from math import isclose
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.validate
import numpy as np
from ifcopenshell.util.element import get_container, get_parts, get_pset
from ifcopenshell.util.pset import get_template
from ifcopenshell.util.shape import get_faces, get_vertices, get_volume
from ifcopenshell.util.unit import calculate_unit_scale


def checked_properties(product, name):
    definition, = [rel.RelatingPropertyDefinition for rel in product.IsDefinedBy
                   if rel.RelatingPropertyDefinition.Name == name]
    template = get_template('IFC4').get_by_name(name)
    types = {prop.Name: prop.PrimaryMeasureType for prop in template.HasPropertyTemplates}
    result = {}
    for prop in definition.HasProperties:
        assert prop.NominalValue.is_a(types[prop.Name]), (product.Name, prop.Name)
        assert prop.Unit is None, 'common lengths are in the declared project units'
        result[prop.Name] = prop.NominalValue.wrappedValue
    return result


def verify(path):
    model = ifcopenshell.open(path)
    scale = calculate_unit_scale(model)
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, log)
    assert not log.statements, (path.name, log.statements[:2])
    products = model.by_type('IfcElement')
    for product in products:
        assert get_container(product).is_a('IfcBuildingStorey'), product
        if product.is_a('IfcStair'):
            assert len(product.ContainedInStructure) == 1
        else:
            assert len(product.Decomposes) == 1 and not product.ContainedInStructure, product
    for stair in model.by_type('IfcStair'):
        props = checked_properties(stair, 'Pset_StairCommon')
        flights = sorted((p for p in get_parts(stair) if p.is_a('IfcStairFlight')), key=lambda f: f.Name)
        assert sum(f.NumberOfTreads for f in flights) == props['NumberOfTreads']
        assert sum(f.NumberOfRisers for f in flights) == props['NumberOfRiser']
        if path.stem != 'componenten':
            assert isclose(props['RiserHeight'] * scale, 0.16)
            assert props['NumberOfRiser'] == 18
        counted = 0
        for flight in flights:
            values = checked_properties(flight, 'Pset_StairFlightCommon')
            assert values['NumberOfRiser'] == flight.NumberOfRisers
            assert values['NumberOfTreads'] == flight.NumberOfTreads
            assert isclose(values['RiserHeight'], flight.RiserHeight)
            assert values.get('TreadLength') == flight.TreadLength
            if path.stem in ('componenten', 'grating'):
                continue
            parts = get_parts(flight)
            boards = [p for p in parts if p.Tag.endswith('-SB')]
            strips = [p for p in parts if p.Tag.endswith('-WL')]
            treads = [p for p in parts if p.ObjectType == 'Houten trede']
            stringers = [p for p in parts if p.is_a('IfcMember') and p.PredefinedType == 'STRINGER']
            assert flight.Representation is None
            assert len(treads) == flight.NumberOfTreads == len(strips)
            assert len(boards) == flight.NumberOfRisers and len(stringers) >= 2
            assert all(p.ObjectPlacement.PlacementRelTo == flight.ObjectPlacement for p in parts)
            tags = {p.Tag for p in boards}
            assert all(t.Tag + '-SB' in tags for t in treads)
            assert flight.Tag + '-UIT-SB' in tags
            assert all(len(p.IsTypedBy) == 1 for p in parts)
            if flight.PredefinedType == 'WINDER':
                starters = [beam for beam in stringers if beam.Tag.endswith(('-L1', '-R1'))]
                assert len(starters) == 2
                for beam in starters:
                    # Evaluate the machined CSG body. A real foot also has a
                    # horizontal bearing area, beyond a single point touching Z=0.
                    shape = geom.create_shape(geom.settings(), beam)
                    vertices = get_vertices(shape.geometry)
                    assert abs(min(vertices[:, 2])) < 1e-7, beam.Tag
                    triangles = vertices[get_faces(shape.geometry)]
                    foot = triangles[np.max(abs(triangles[:, :, 2]), axis=1) < 1e-7]
                    area = np.linalg.norm(np.cross(foot[:,1]-foot[:,0], foot[:,2]-foot[:,0]), axis=1).sum() / 2
                    assert area > 0.00005, beam.Tag
            counted += len(treads)
        if counted:
            assert counted == props['NumberOfTreads']
    if path.stem == 'componenten':
        volumes = 0
        for product in model.by_type('IfcStairFlight') + model.by_type('IfcSlab'):
            if product.Representation is None:
                continue
            name = 'Qto_StairFlightBaseQuantities' if product.is_a('IfcStairFlight') else 'Qto_SlabBaseQuantities'
            quantity = get_pset(product, name, 'GrossVolume')
            if quantity is None:  # the spiral's steel landing is not a precast casting
                assert not product.is_a('IfcStairFlight')
                continue
            shape = geom.create_shape(geom.settings(), product)
            assert isclose(quantity, get_volume(shape.geometry), rel_tol=1e-7), product.Tag
            volumes += 1
        assert volumes >= 3, 'at least two precast flights and their landing'
    return len(products)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    with TemporaryDirectory(prefix='oss-bim-semantics-') as temp:
        subprocess.run(['node', 'scripts/verify-bim-semantics.mjs', '--fixtures', temp], cwd=root, check=True)
        files = sorted(Path(temp).glob('*.ifc'))
        assert len(files) == 8
        total = sum(verify(path) for path in files)
        print(f'IfcOpenShell {ifcopenshell.version}: {len(files)} files, {total} elements, checked IFC4 property types, '
              'spatial containment, flight membership and precast casting volumes.')
