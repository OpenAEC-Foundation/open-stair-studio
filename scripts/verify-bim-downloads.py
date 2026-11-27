"""Exercise the actual BIM downloads in Edge or the installed Windows app.

uv run --no-project --with playwright --with ifcopenshell==0.9.0.post1 scripts/verify-bim-downloads.py http://127.0.0.1:5173
Use --desktop PATH instead of a URL. --output DIR keeps the downloaded timber example.
"""
import argparse
import json
import shutil
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
from ifcopenshell.util import element, shape, unit
from browser_handoff import run_handoff

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


def verify_download_pair(ifc_path, ifcx_path, marks):
    model = ifcopenshell.open(str(ifc_path))
    assert model.schema == 'IFC4'
    stairs = model.by_type('IfcStair')
    assert {s.Tag for s in stairs} == marks
    assert all(element.get_container(s).is_a('IfcBuildingStorey') for s in stairs)
    layer = json.loads(ifcx_path.read_text(encoding='utf-8'))
    assert layer['header']['ifcxVersion'] == 'ifcx_alpha'
    attributes = {n['attributes']['openaec::ifc4']['globalId']: n['attributes']
              for n in layer['data'] if 'usd::usdgeom::mesh' in n['attributes']}
    products = [p for p in model.by_type('IfcProduct') if p.Representation]
    assert {p.GlobalId for p in products} == set(attributes)
    settings = ifcopenshell.geom.settings()
    settings.set('use-world-coords', True)
    for p in products:
        body = ifcopenshell.geom.create_shape(settings, p)
        vertices = shape.get_vertices(body.geometry)
        data = attributes[p.GlobalId]
        mesh = data['usd::usdgeom::mesh']
        coords = np.asarray(mesh['points'])
        assert len(mesh['faceVertexIndices']) >= 3 and len(mesh['faceVertexIndices']) % 3 == 0
        for extreme in (np.min, np.max):
            np.testing.assert_allclose(extreme(vertices, axis=0), extreme(coords, axis=0), atol=2e-5, rtol=0,
                                       err_msg=f'{p.Tag} world coordinates in metres')
        if marks == {'ST-01'}:
            qto, = element.get_psets(p, qtos_only=True).values()
            np.testing.assert_allclose(shape.get_volume(body.geometry), qto['NetVolume'], rtol=1e-7)
            np.testing.assert_allclose(data['bsi::ifc::prop::NetVolume'], qto['NetVolume'], rtol=1e-9)
    print(f'{ifc_path.name}: {len(stairs)} stair(s), {len(products)} IFC4/IFCX bodies matched.', flush=True)
    return model


def check(page, download):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    project_file = page.locator('input[type=file][accept*=".oss.json"]')
    bim = page.get_by_role('tab', name='Werkstroom BIM')
    project_file.set_input_files(EXAMPLES / 'bim-steektrap-vergelijking.oss.json')
    page.get_by_text('ST-01 · Dichte steektrap', exact=True).first.wait_for()
    bim.click()
    panel = page.locator('.bim-view')
    step = download(panel.get_by_role('button', name='IFC4 exporteren'), '.ifc')
    layer = download(panel.get_by_role('button', name='IFCX alpha exporteren'), '.ifcx')
    wood = verify_download_pair(step, layer, {'ST-01'})
    flight, = wood.by_type('IfcStairFlight')
    measures = element.get_pset(flight, 'Pset_StairFlightCommon')
    assert (measures['NumberOfRiser'], measures['NumberOfTreads']) == (16, 15)
    scale = unit.calculate_unit_scale(wood)
    np.testing.assert_allclose([measures['RiserHeight'] * scale, measures['TreadLength'] * scale], [.1875, .220])
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        for f in (step, layer):
            shutil.copyfile(f, args.output / f.name)
    if args.kit:
        for filename, counts in [('AC20-FZK-Haus.ifc', '4 vloeren · 1 gekoppelde vloersparing'),
                                 ('AC20-Institute-Var-2.ifc', '26 vloeren · 4 gekoppelde vloersparingen')]:
            panel.locator('#host-ifc-file').set_input_files(args.kit / filename)
            panel.get_by_text(counts, exact=True).wait_for(timeout=60000)
            print(f'{filename}: {counts}', flush=True)

    config = json.loads((EXAMPLES / 'zes-trapontwerpen.oss.json').read_text(encoding='utf-8'))
    items = [i for i in config['stairwell']['instances'] if i['type'] in ('portable', 'ladder')]
    assert len(items) == 2
    config['stairwell']['instances'] = items
    config['designSelection'] = items[1]['id']
    config['bim'] = dict(originX=12500, originY=-6200, originZ=875, originRotationDeg=90, originAgreed=True)
    project_file.set_input_files(dict(name='projectopstelling.oss.json', mimeType='application/json',
                                      buffer=json.dumps(config).encode()))
    page.get_by_role('button', name='Ontwerp als IFC4', exact=True).wait_for()
    bim.click()
    # Export the selection from the BIM ribbon itself, then the whole assembly.
    selected = verify_download_pair(download('IFC4 exporteren', '.ifc'), download('IFCX alpha', '.ifcx'), {items[1]['mark']})
    full = verify_download_pair(download('Geheel project als IFC4', '.ifc'),
                                download('Geheel project als IFCX alpha', '.ifcx'), {i['mark'] for i in items})
    for m in (selected, full):
        site, = m.by_type('IfcSite')
        axis = site.ObjectPlacement.RelativePlacement
        np.testing.assert_allclose(np.asarray(axis.Location.Coordinates) * unit.calculate_unit_scale(m), [12.5, -6.2, .875])
        np.testing.assert_allclose(axis.RefDirection.DirectionRatios, [0, 1, 0], atol=1e-10)
    assert {p.GlobalId for p in selected.by_type('IfcProduct') if p.Representation} <= {
        p.GlobalId for p in full.by_type('IfcProduct') if p.Representation}
    assert not errors, errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('url', nargs='?')
    target.add_argument('--desktop')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--kit', type=Path, help='Directory containing the two published Archicad 20 KIT models')
    args = parser.parse_args()
    run_handoff(['--desktop', args.desktop] if args.desktop else [args.url], check)
