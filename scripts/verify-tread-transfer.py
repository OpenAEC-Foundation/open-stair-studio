"""Read a complete tread and matching housing job from Edge or the packaged app.

Pass a local URL or --desktop path/to/application.exe. Add --example file.zip
to keep the verified downloads together with the tread setup sheet.
"""
import csv
import json
import re
import sys
import zipfile
from pathlib import Path

import ezdxf
import pymupdf
from browser_handoff import run_handoff


def verify(page, download):
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda dialog: dialog.accept())
    samples = Path(__file__).resolve().parents[1] / 'examples'
    source = samples / 'halfslag-infrezingen.oss.json'
    page.locator('input[type=file]').first.set_input_files(str(source))
    page.wait_for_function("document.getElementById('project-number')?.value === 'OSS-WG-01'")
    saved_project = download('Opslaan', '.oss.json')
    model = json.loads(saved_project.read_text(encoding='utf-8'))
    assert model['version'] == '0.11.0' and model['joinery']['type'] == 'housed'
    page.get_by_role('tab', name='Plattegrond').click()
    page.locator('.step-marker').nth(5).click()
    nominal_dxf = download('Tredecontour DXF', '.dxf')
    page.get_by_role('button', name='Trede frezen', exact=True).click()
    part_id = 'TR-01-TD-06'
    assert page.locator('#cnc-tread').input_value() == part_id
    tread_nc = download('Tredeprogramma (.ngc)', '.ngc')
    tread_json = download('Trede-CAM (.json)', '.cam.json')
    data = json.loads(tread_json.read_text(encoding='utf8'))
    assert data['partId'] == part_id and data['fit']['status'] == 'pass'
    assert data['metadata']['number'] == 'OSS-WG-01'
    assert data['parameters'] == model['treadCam']
    assert {c['beamId'] for c in data['fit']['connections']} == {'TR-01-WG-L3', 'TR-01-WG-R4'}
    code = tread_nc.read_text(encoding='ascii')
    plunges = [float(v) for v in re.findall(r'^G1 Z(-[\d.]+)', code, re.MULTILINE)]
    assert plunges == data['levels'] and min(plunges) == -40.3 and code.strip().endswith('M2')
    cad = ezdxf.readfile(nominal_dxf)
    nominal, = cad.modelspace().query('LWPOLYLINE')
    xx, yy = data['offset']['x'], data['offset']['y']
    assert sorted((round(p['x']-xx, 4), round(p['y']-yy, 4)) for p in data['contour']) == sorted(
        (round(x, 4), round(y, 4)) for x, y in nominal.get_points('xy'))
    page.get_by_role('button', name='Naar tredeblad', exact=True).click()
    assert page.locator('#wvb-tread').input_value() == part_id
    files = [nominal_dxf, tread_nc, tread_json]
    for connection in data['fit']['connections']:
        beam = connection['beamId']
        page.locator('.connections button').filter(has_text=beam).click()
        assert page.locator('#housing-pocket').input_value() == connection['pocketId']
        page.get_by_role('button', name='Naar CNC').click()
        page.locator('#cam-scope').select_option('single-pocket')
        assert page.locator('#cam-beam').input_value() == beam
        joint_nc = download('LinuxCNC-programma (.ngc)', '.ngc')
        joint_json = download('CAM-pakket (.json)', '.cam.json')
        pocket_package = json.loads(joint_json.read_text(encoding='utf8'))
        operation, = pocket_package['operations']
        assert operation['id'] == connection['pocketId'] and operation['tread'] == part_id
        assert operation['depth'] == 12 and operation['id'] in joint_nc.read_text(encoding='ascii')
        files.extend([joint_nc, joint_json])
        page.get_by_role('tab', name='Onderdelen', exact=True).click()
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding', exact=True).click()
    listing = download('Onderdelen naar CSV', '.csv')
    with listing.open(encoding='utf-8-sig', newline='') as stream:
        row, = [r for r in csv.DictReader(stream, delimiter=';') if r['Merk'] == part_id]
    assert float(row['CNC-opspanlengte mm']) == data['stock']['length']
    assert float(row['CNC-opspanbreedte mm']) == data['stock']['width']
    page.get_by_role('tab', name='Calculatie').click()
    price = page.locator('.estimate-result strong').inner_text()
    page.locator('#estimate-tread-stock').select_option('cnc')
    assert page.locator('.estimate-result strong').inner_text() != price
    page.get_by_role('tab', name='Trede-CNC').click()
    page.locator('#tread-cam-breakthrough').fill('0.5')
    page.locator('#tread-cam-breakthrough').press('Tab')
    page.get_by_title('Ongedaan maken', exact=True).click()
    assert page.locator('#tread-cam-breakthrough').input_value() == '0.3'
    page.reload()
    page.get_by_role('tab', name='Calculatie').click()
    assert page.locator('#estimate-tread-stock').input_value() == 'cnc' and not errors, errors
    if '--example' in sys.argv:
        destination = Path(sys.argv[sys.argv.index('--example') + 1])
        pdf = samples / 'trede-cnc-opstelblad.pdf'
        with pymupdf.open(pdf) as doc:
            assert len(doc) == 1 and part_id in doc[0].get_text()
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for f in [saved_project, pdf, *files]: z.write(f, f.name)
        with zipfile.ZipFile(destination) as z:
            assert len(z.namelist()) == 9 and z.testzip() is None
    print(f'{page.url} {part_id}, {len(plunges)} through-profile passes, two paired stringer NC downloads, stock CSV, estimate change, undo and recovery verified.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], verify)
