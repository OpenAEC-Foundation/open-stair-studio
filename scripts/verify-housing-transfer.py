"""Check production downloads in Edge. Pass a Vite URL or --desktop path/to/app.exe."""
import csv
import json
import re
import sys
from pathlib import Path

import ezdxf
import pymupdf
from browser_handoff import run_handoff


def verify(page, download):
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.locator('input[type=file]').first.set_input_files(
        str(Path('examples/halfslag-rechts.oss.json').resolve()))
    page.wait_for_function("document.getElementById('family')?.value === 'half_winder'")
    page.get_by_role('tab', name='Wangbladen').click()
    assert page.locator('#joinery-type').input_value() == 'none'
    page.get_by_role('button', name='Infrezingen toevoegen').click()
    depth = page.locator('#joinery-depth')
    depth.fill('11.5')
    depth.press('Tab')
    page.get_by_role('tab', name='Plattegrond').click()
    page.locator('.step-marker').nth(6).click()
    tread = page.locator('.tread-sheet h2').inner_text()
    links = page.locator('.connections .part-link')
    assert links.count() >= 2
    links.last.click()
    pocket = page.locator('#housing-pocket').input_value()
    beam = page.locator('#housing-beam').input_value()
    assert pocket.endswith('__' + tread)
    sheet = download('Wang-DXF', '.dxf')
    page.get_by_role('button', name='Naar CNC').click()
    assert page.locator('#cam-beam').input_value() == beam
    assert page.locator('#cam-pocket').input_value() == pocket
    package = json.loads(download('CAM-pakket (.json)', '.cam.json').read_text(encoding='utf-8'))
    nc = download('LinuxCNC-programma (.ngc)', '.ngc').read_text(encoding='ascii')
    assert package['controller'] == 'LinuxCNC' and package['fixture'] == 'G54' and package['beam'] == beam
    assert package['units'] == 'mm' and package['face'] == 'inside' and package['revision'] == 'A'
    assert package['number'] in nc and beam in nc
    cad = ezdxf.readfile(sheet)
    entities = list(cad.modelspace())
    paths = [e for e in entities if e.dxf.layer.startswith('OSS-POCKET-D')]
    marks = [e.dxf.text for e in entities if e.dxf.layer == 'OSS-MARK']
    assert cad.units == 4 and len(paths) == len(package['operations'])
    assert not cad.audit().errors
    assert any(op['id'] == pocket for op in package['operations'])
    for op, path, mark in zip(package['operations'], paths, marks, strict=True):
        assert mark == op['tread'] and op['id'] in nc and op['depth'] == 11.5
        assert sorted(tuple(p.values()) for p in op['contour']) == sorted(path.get_points('xy'))
    # Re-read modal Z moves separately from JSON and check all actual plunges.
    blocks = nc.splitlines()
    plunges = [float(m.group(1)) for line in blocks if (m := re.match(r'G1 Z(-?[\d.]+)', line))]
    assert plunges == [z for op in package['operations'] for z in op['zLevels']]
    assert min(plunges) == -11.5 and 'G54' in nc and 'M2' in blocks
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding', exact=True).click()
    listing = download('Onderdelen naar CSV', '.csv')
    with listing.open(encoding='utf-8-sig', newline='') as stream:
        rows = {row['Merk']: row for row in csv.DictReader(stream, delimiter=';')}
    assert int(rows[beam]['Infrezingen']) == len(paths)
    assert int(rows[tread]['Insteeklippen']) >= 2 and float(rows[tread]['Insteekdiepte mm']) == 11.5
    page.get_by_role('tab', name='CNC-machine').click()
    page.locator('#joinery-depth').fill('50')
    page.locator('#joinery-depth').press('Tab')
    assert page.get_by_role('button', name='LinuxCNC-programma (.ngc)').is_disabled()
    page.get_by_role('tab', name='Wangbladen').click()
    assert page.get_by_role('button', name='Wang-DXF').is_disabled()
    page.get_by_title('Ongedaan maken', exact=True).click()
    assert page.locator('#joinery-depth').input_value() == '11.5'
    page.reload()
    page.get_by_role('tab', name='Wangbladen').click()
    assert page.locator('#joinery-depth').input_value() == '11.5' and not errors, errors
    marks = page.locator('#housing-beam option').evaluate_all('options => options.map(o => o.value)')
    # Exercise the real button and its print layout while the browser PDF renderer
    # takes the place of the OS printer dialog.
    page.evaluate("window.print = () => { window.testPrintRequested = true; }")
    page.get_by_role('button', name='Alle wangbladen / PDF', exact=True).click()
    page.wait_for_function('window.testPrintRequested')
    with pymupdf.open(stream=page.pdf(prefer_css_page_size=True, print_background=True), filetype='pdf') as doc:
        assert len(doc) == len(marks)
        for sheet, expected_mark in zip(doc, marks, strict=True):
            content = sheet.get_text()
            assert expected_mark in content.splitlines() and 'OSS-VD-01' in content
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    assert page.locator('#housing-beam').is_visible()
    print(f'{page.url} {beam} / {tread}: migrated project, selected pocket, local DXF, CAM JSON, {len(blocks)} NC blocks, quantities, blocked cut, undo and recovery OK.')
    print(f'Printed {len(marks)} numbered stringer drawings with project, revision and setup identification.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], verify)
