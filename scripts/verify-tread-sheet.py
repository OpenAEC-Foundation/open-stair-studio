"""Verify the tread sheet -> CNC handoff, printed setup and actual UI downloads in Edge.

Pass the running Vite URL; --example PDF saves the opstelblad for TR-01-TD-06.
Requires playwright, pymupdf and Microsoft Edge.
"""
import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from playwright.sync_api import sync_playwright


def click(page, name):
    page.get_by_role('button', name=name, exact=True).click()


def tab(page, name):
    page.get_by_role('tab', name=name, exact=True).click()


def setting(page, key, value):
    field = page.locator('#tread-cam-' + key)
    field.fill(str(value))
    field.press('Tab')


def file_from(page, label, folder):
    with page.expect_download() as result:
        click(page, label)
    dest = folder / result.value.suggested_filename
    result.value.save_as(dest)
    return dest


def select_tread(page, mark):
    tab(page, 'Onderdelen')
    click(page, 'Tredeblad')
    page.locator('#wvb-tread').select_option(mark)
    assert page.locator('.tread-sheet h2').inner_text() == mark
    click(page, 'Trede frezen')
    assert page.locator('.tread-cam h1').inner_text() == mark


def verify(page, url, folder, example):
    page.goto(url)
    page.locator('input[type=file]').first.set_input_files(
        str(Path('examples/halfslag-infrezingen.oss.json').resolve()))
    page.wait_for_function("document.getElementById('project-number')?.value === 'OSS-WG-01'")
    mark = 'TR-01-TD-06'
    select_tread(page, mark)
    job = json.loads(file_from(page, 'Trede-CAM (.json)', folder).read_text(encoding='utf-8'))
    nc = file_from(page, 'Tredeprogramma (.ngc)', folder).read_text(encoding='ascii')
    assert job['partId'] == mark and job['fit']['status'] == 'pass'
    assert len(job['tongues']) >= 2 and job['reliefs'] and job['levels'][-1] < -job['stock']['thickness']
    assert job['fileStem'] in nc and 'M2' in nc.splitlines()
    assert page.locator('.tread-cam .connections tbody tr').count() == len(job['tongues'])
    for selector, key in [('polyline.path', 'path'), ('polygon.board', 'contour'), ('polyline.nose', 'nose')]:
        pairs = page.locator('.tread-cam .overview ' + selector).get_attribute('points').split()
        assert [[float(v) for v in pair.split(',')] for pair in pairs] == [[p['x'], p['y']] for p in job[key]]
    assert page.locator('.tread-cam .overview circle.relief').count() == len(job['reliefs'])
    assert page.locator('.magnifier svg').is_visible()
    svg = page.locator('.tread-cam .overview')
    full = svg.get_attribute('viewBox')
    link = page.locator('.connections tbody button').first
    link.click()
    assert svg.get_attribute('viewBox') != full
    assert page.locator('#tread-cam-detail').input_value() == job['tongues'][0]['pocketId']
    page.locator('#tread-cam-detail').select_option('')
    assert svg.get_attribute('viewBox') == full

    page.evaluate('window.print = () => {window.setupRequested = true}')
    click(page, 'Opstelblad / PDF')
    assert page.evaluate('window.setupRequested')
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as doc:
        assert len(doc) == 1, len(doc)
        assert abs(doc[0].rect.width - 842) < 1 and abs(doc[0].rect.height - 595) < 1
        content = doc[0].get_text()
        for word in ['OSS-WG-01', 'revisie A', mark, 'G54', 'Freesdiameter', 'Z-40,3', 'offerplaat',
                     'Snijlengte', 'Gereedschap', 'Passing', *[t['beamId'] for t in job['tongues']]]:
            assert word in content, word
        assert 'Tredeprogramma (.ngc)' not in content and 'Opstelblad / PDF' not in content
    if example:
        example.write_bytes(pdf)
    program = page.get_by_role('button', name='Tredeprogramma (.ngc)', exact=True)
    setting(page, 'fluteLength', 10)
    assert program.is_disabled() and page.locator('.fit-result.blocked').is_visible()
    setting(page, 'fluteLength', 50)
    assert program.is_enabled()
    setting(page, 'stockMargin', 20)
    revised = json.loads(file_from(page, 'Trede-CAM (.json)', folder).read_text(encoding='utf-8'))
    assert revised['stock']['length'] == job['stock']['length'] + 16
    assert revised['stock']['width'] == job['stock']['width'] + 16
    for p, q in zip(job['path'], revised['path'], strict=True):
        assert max(abs(q[k] - p[k] - 8) for k in ('x', 'y')) < .00001
    click(page, 'Naar tredeblad')
    assert page.locator('#wvb-tread').input_value() == mark
    tab(page, 'CNC-machine')
    page.locator('#corner-mode').select_option('rounded')
    tab(page, 'Trede-CNC')
    assert program.is_disabled() and page.locator('.connections').get_by_text('De ronde binnenhoek', exact=False).count() > 0
    tab(page, 'Wangbladen')
    page.locator('#joinery-type').select_option('none')
    tab(page, 'Trede-CNC')
    assert program.is_enabled() and 'Losse trede' in page.locator('.fit-result').inner_text()
    print(f'{mark}: {len(job["tongues"])} tongue links, {len(job["reliefs"])} corner reliefs, '
          f'{len(job["levels"])} depths; preview equals exported XY, G54 margin, fit blocker, standalone tread and A4 setup checked.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--example', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory() as tmp, sync_playwright() as playwright:
        with playwright.chromium.launch(channel='msedge') as browser:
            page = browser.new_page(viewport={'width': 1440, 'height': 920})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            verify(page, args.url, Path(tmp), args.example)
            assert not errors, errors
