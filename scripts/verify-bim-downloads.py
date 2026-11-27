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

    page.locator('#family').select_option('two_quarter_winder')
    def set_mm(selector, value):
        field = page.locator(selector)
        field.fill(str(value))
        field.press('Tab')
        assert float(field.input_value()) == value, selector

    set_mm('#wel', 45)
    set_mm('#winder-count', 5)
    set_mm('#middle-steps', 4)
    set_mm('#middle-steps', 5)
    page.locator('#entry-steps').select_option('0')
    for hand, position in [('left', -15), ('right', 15)]:
        mark = 'TK-' + hand.upper()
        page.locator('#turn-direction').select_option(hand)
        page.locator('#stair-mark').fill(mark)
        set_mm('#nosing', position)
        assert page.locator('#wel').input_value() == '45'
        saved = download('Opslaan', '.oss.json')
        saved_stair = json.loads(saved.read_text(encoding='utf-8'))['stair']
        assert [saved_stair[k] for k in ('type', 'turnDirection', 'middleSteps', 'wel', 'nosing')] == [
            'two_quarter_winder', hand, 5, 45, position]
        project_file.set_input_files(saved)
        page.get_by_text(f'{mark} · Dichte steektrap', exact=True).first.wait_for()
        bim.click()
        result = verify_download_pair(download(panel.get_by_role('button', name='IFC4 exporteren'), '.ifc'),
                                      download(panel.get_by_role('button', name='IFCX alpha exporteren'), '.ifcx'), {mark})
        stair, = result.by_type('IfcStair')
        flight, = result.by_type('IfcStairFlight')
        assert stair.PredefinedType == 'TWO_QUARTER_WINDING_STAIR' and flight.PredefinedType == 'WINDER'
        assert element.get_pset(stair, 'Pset_StairCommon')['NosingLength'] == .045
        assert element.get_pset(flight, 'Pset_StairFlightCommon')['NosingLength'] == .045
        design = element.get_pset(stair, 'Pset_OpenStairStudio_Design')
        assert design['DesignedNosingProjection_mm'] == 45
        assert (design['MiddleStraightTreads'], design['TurnDirection'], design['TreadPositionAlongWalkingLine_mm']) == (5, hand, position)

    page.get_by_role('button', name='De Vries-voorbeeld toepassen', exact=False).click()
    assert page.locator('#two-quarter-layout').input_value() == 'dimensioned'
    assert float(page.locator('#middle-offset').input_value()) == 20.0335
    assert page.locator('#turn-direction').input_value() == 'right'
    for hand, size in [('left', (3140, 992)), ('right', (3140, 992)), ('right', (3300, 1100))]:
        fitted = size == (3140, 992)
        mark = ('SPIL-' if fitted else 'MAAT-') + hand.upper()
        page.locator('#turn-direction').select_option(hand)
        page.locator('#stair-mark').fill(mark)
        if fitted:
            assert page.locator('#lowerNewelEnabled').is_checked() and page.locator('#upperNewelEnabled').is_checked()
            if hand == 'right':
                page.get_by_text('Bovenspil · 114 × 66 mm', exact=True).click()
                set_mm('#upperNewelHousing', 5)
        else:
            page.locator('#lowerNewelEnabled').uncheck()
            page.locator('#upperNewelEnabled').uncheck()
            page.get_by_role('button', name='Verschuivingen onderkwart op nul').click()
            page.get_by_role('button', name='Verschuivingen bovenkwart op nul').click()
        set_mm('#outer-length', size[0])
        set_mm('#outer-depth', size[1])
        if not fitted:
            for index, angle in enumerate([15, 17, 19, 20]):
                set_mm('#upper-quarter-' + str(index), angle)
        project_path = download('Opslaan', '.oss.json')
        settings = json.loads(project_path.read_text(encoding='utf-8'))['stair']
        assert settings['firstQuarterAngles'][0] == 18.533458
        assert settings['upperNewelEnabled'] == fitted
        if not fitted:
            assert settings['secondQuarterAngles'] == [15, 17, 19, 20, 19]
        project_file.set_input_files(project_path)
        page.get_by_text(f'{mark} · Dichte steektrap', exact=True).first.wait_for()
        bim.click()
        step_path = download(panel.get_by_role('button', name='IFC4 exporteren'), '.ifc')
        layer_path = download(panel.get_by_role('button', name='IFCX alpha exporteren'), '.ifcx')
        model = verify_download_pair(step_path, layer_path, {mark})
        posts = [p for p in model.by_type('IfcMember') if element.get_pset(p, 'OSS_Spil')]
        assert len(posts) == (2 if fitted else 0)
        for post in posts:
            data = element.get_pset(post, 'OSS_Spil')
            depth = settings[data['Corner'] + 'NewelHousing']
            assert data['Housing_mm'] == depth and data['ConnectedTreads'] == 6
            assert len(post.ConnectedTo) == 6 and all(rel.RelatedElement.is_a('IfcPlate') for rel in post.ConnectedTo)
            assert data['Pockets'] == (6 if depth else 0)
        props = element.get_pset(model.by_type('IfcStair')[0], 'Pset_OpenStairStudio_Design')
        assert props['TwoQuarterLayout'] == 'dimensioned' and 'WindersPerQuarter' not in props
        assert props['MiddleStraightOffset_mm'] == 20.0335
        assert (props['DesignOuterLength_mm'], props['DesignOuterDepth_mm']) == size
        for prefix, angles in [('Lower', settings['firstQuarterAngles']), ('Upper', settings['secondQuarterAngles'])]:
            assert props[prefix + 'QuarterWinders'] == len(angles)
            values = [props[f'{prefix}QuarterAngle{i+1:02}'] for i in range(len(angles))]
            np.testing.assert_allclose(np.degrees(values), angles)
        td4 = next(p for p in model.by_type('IfcPlate') if p.Tag.endswith('-TD-04'))
        data = element.get_pset(td4, 'OSS_Tredeverdrijving')
        if fitted:
            assert data['Quarter'] == 'lower' and data['IndexInQuarter'] == 4
            assert data['FrontBoundaryOffset_mm'] == props['LowerQuarterBoundaryOffset04_mm']
            assert data['BackBoundaryOffset_mm'] == settings['firstQuarterOffsets'][4]
        else:
            assert not data and 'LowerQuarterBoundaryOffset04_mm' not in props
        meshes = [n['attributes']['usd::usdgeom::mesh']['points'] for n in json.loads(layer_path.read_text(encoding='utf-8'))['data']
                  if 'usd::usdgeom::mesh' in n['attributes']]
        np.testing.assert_allclose(sorted(np.ptp(np.vstack(meshes), axis=0)[:2] * 1000, reverse=True), size, atol=.02, rtol=0)
        if fitted and hand == 'right':
            page.get_by_role('tab', name='Werkstroom Werkvoorbereiding').click()
            page.get_by_role('button', name='Houtdetails en profielen').click()
            page.get_by_label('Onderdeelgroep').select_option('quarterNewel')
            page.get_by_label('Onderdeelmerk').select_option(mark + '-SP-02')
            drawing = download('Detail-DXF', '.dxf').read_text(encoding='utf-8')
            assert 'OSS-SPIL' in drawing
            setups = page.get_by_role('combobox', name='Spilvlak')
            faces = setups.locator('option').count()
            assert faces >= 2
            for index in range(faces):
                setups.select_option(index=index)
                nc = download('Spilhuizen voorfrezen · LinuxCNC', '.ngc').read_text(encoding='utf-8')
                assert mark + '-SP-02' in nc and 'G54' in nc and 'G1 Z-' in nc and nc.endswith('M2\n')

    page.locator('#reference-size').select_option('ifc')
    page.get_by_role('button', name='De Vries-voorbeeld toepassen').click()
    assert float(page.locator('#outer-depth').input_value()) == 992.105
    assert page.locator('svg polygon.plan-newel').count() == 2
    shift = page.get_by_role('spinbutton', name='Verschuiving grens vóór trede 4 (mm)', exact=True)
    new_position = float(shift.input_value()) + 3
    set_mm('#lower-quarter-offset-3', new_position)
    page.locator('#stair-mark').fill('BRONMAAT')
    page.locator('#stair-mark').press('Tab')
    saved_source = download('Opslaan', '.oss.json')
    saved = json.loads(saved_source.read_text(encoding='utf-8'))['stair']
    assert saved['outerDepth'] == 992.105 and saved['firstQuarterOffsets'][3] == new_position
    project_file.set_input_files(saved_source)
    page.get_by_text('BRONMAAT · Dichte steektrap', exact=True).first.wait_for()
    bim.click()
    edited = verify_download_pair(download(panel.get_by_role('button', name='IFC4 exporteren'), '.ifc'),
                                  download(panel.get_by_role('button', name='IFCX alpha exporteren'), '.ifcx'), {'BRONMAAT'})
    edited4 = next(p for p in edited.by_type('IfcPlate') if p.Tag.endswith('-TD-04'))
    assert element.get_pset(edited4,'OSS_Tredeverdrijving')['FrontBoundaryOffset_mm'] == new_position
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding').click()
    page.get_by_role('navigation', name='Werkvoorbereiding weergave').get_by_role('button',name='Tredeblad').click()
    page.locator('#wvb-tread').select_option(edited4.Tag)
    assert 'POLYLINE' in download('Tredecontour DXF','.dxf').read_text(encoding='utf-8')
    page.get_by_role('button',name='Trede frezen',exact=True).click()
    nc = download('Tredeprogramma (.ngc)', '.ngc').read_text(encoding='utf-8')
    cam = json.loads(download('Trede-CAM (.json)', '.json').read_text(encoding='utf-8'))
    assert cam['partId'] == edited4.Tag and cam['windingDistribution']['frontOffsetMm'] == new_position
    assert 'Winder lower quarter, tread 4' in nc and 'G1 Z-' in nc and nc.endswith('M2\n')

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
