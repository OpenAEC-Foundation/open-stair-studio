"""Run the engineering workspace controls, downloads and print renderer in Edge.

Pass the running application URL. --example FILE keeps the glass example PDF
and the editable project with the same basename.
"""
import argparse
import json
from math import isclose
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from playwright.sync_api import sync_playwright


def set_field(page, key, value):
    field = page.locator('#eng-' + key)
    field.fill(str(value))
    field.press('Tab')


def select(page, key, value):
    page.locator('#eng-' + key).select_option(value)


def download(page, folder):
    with page.expect_download() as event:
        page.get_by_role('button', name='Dossier als JSON', exact=True).click()
    path = folder / event.value.suggested_filename
    event.value.save_as(path)
    return json.loads(path.read_text(encoding='utf-8'))


def verify(page, url, folder, example):
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator('input[type=file]').first.set_input_files(str(Path('examples/halfslag-infrezingen.oss.json').resolve()))
    page.wait_for_function("document.getElementById('project-number')?.value === 'OSS-WG-01'")
    page.locator('#project-name').fill('Rekenvoorbeeld · glazen halfslagtrap')
    page.locator('#project-number').fill('OSS-ENG-GL-01')
    page.get_by_role('tab', name='Engineering', exact=True).click()
    select(page, 'structureType', 'glass')
    select(page, 'use', 'escape')
    select(page, 'support', 'two-edge')
    values = {'spanMm': 800, 'loadArea': 3.5, 'loadPoint': 2,
              'sourceProduct': 'Fictief ontwerpblad G-01, revisie A',
              'productBasis': '',
              'arrangement': 'Voorbeeld van twee evenwijdige oplegassen.',
              'escapeBasis': 'Bezetting en maatgevende doorgangen nog te bepalen.',
              'notes': 'Fictieve proefinvoer voor de lastwerking. De glasopbouw en de projectbelastingen moeten nog worden vastgesteld.'}
    for key, value in values.items():
        set_field(page, key, value)
    data = download(page, folder)
    assert data['project']['number'] == 'OSS-ENG-GL-01' and data['stair']['mark'] == 'TR-01'
    assert data['inputs']['structureType'] == 'glass' and data['inputs']['use'] == 'escape'
    check = data['dossier']
    q, p = check['cases']
    assert isclose(q['moment'], .28) and isclose(q['reaction'], 1.4) and q['momentUnit'] == 'kN·m/m'
    assert isclose(p['moment'], .4) and p['reaction'] == 1 and p['momentUnit'] == 'kN·m'
    assert page.locator('.engineering .case').count() == 2
    assert all(r['url'].startswith('https://') for r in check['sources'])
    assert any('iplo.nl' in r['url'] for r in check['sources'])
    page.evaluate("window.print = () => {window.engineeringPrintRequested = true;}")
    page.get_by_role('button', name='Dossier als PDF', exact=True).click()
    assert page.evaluate('window.engineeringPrintRequested')
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as doc:
        text = ' '.join(p.get_text() for p in doc)
        assert all(label in text for label in ['TR-01', 'G-01', 'Glazen treden', 'Regulier gebruik en vluchtroute',
                                               '0,28', '1,4', '0,4', 'kN·m/m', 'Verder te toetsen', 'Referenties'])
        assert 'Dossier als JSON' not in text
        print(f'Glass dossier: {len(doc)} A4 pages, verified inputs, units, result cases and scope.')
    if example:
        sample = Path(example).resolve()
        sample.write_bytes(pdf)
        with page.expect_download() as saved:
            page.get_by_role('button', name='Opslaan', exact=True).click()
        project = sample.with_suffix('.oss.json')
        saved.value.save_as(project)
        archive = json.loads(project.read_text(encoding='utf-8'))
        assert archive['project']['number'] == data['project']['number']
        assert all(archive['engineering'][key] == val for key, val in data['inputs'].items())
    select(page, 'support', 'four-edge')
    assert page.locator('.engineering .case').count() == 0
    assert download(page, folder)['dossier']['cases'] == []
    select(page, 'structureType', 'clt')
    assert 'CLT-treden' in page.locator('#eng-structureType option:checked').inner_text()
    assert values['sourceProduct'] != page.locator('#eng-sourceProduct').input_value()
    set_field(page, 'sourceProduct', 'Voorbeeld CLT fiche')
    select(page, 'support', 'two-edge')
    for key, val in [('spanMm', 1500), ('loadPoint', 4)]:
        set_field(page, key, val)
    clt = download(page, folder)
    point_result, = [case for case in clt['dossier']['cases'] if case['id'] == 'point']
    assert point_result['moment'] == 1.5 and point_result['reaction'] == 2
    with pymupdf.open(stream=page.pdf(prefer_css_page_size=True), filetype='pdf') as doc:
        text = ' '.join(p.get_text() for p in doc)
        assert 'CLT-treden' in text and 'Voorbeeld CLT fiche' in text and '1,5 kN·m' in text
    select(page, 'structureType', 'glass')
    assert page.locator('#eng-sourceProduct').input_value() == values['sourceProduct']
    select(page, 'structureType', 'custom')
    set_field(page, 'customDescription', 'Trap met bijzondere oplegging')
    select(page, 'use', 'escape-only')
    assert page.locator('#eng-escapeBasis').is_visible()
    assert download(page, folder)['inputs']['customDescription'] == 'Trap met bijzondere oplegging'
    page.reload()
    page.get_by_role('tab', name='Engineering', exact=True).click()
    assert page.locator('#eng-customDescription').input_value() == 'Trap met bijzondere oplegging'
    if example:
        restored = page.context.browser.new_page()
        restored.goto(url)
        restored.locator('input[type=file]').first.set_input_files(str(project))
        restored.wait_for_function("document.getElementById('project-number')?.value === 'OSS-ENG-GL-01'")
        restored.get_by_role('tab', name='Engineering', exact=True).click()
        assert download(restored, folder)['dossier'] == check
        restored.close()
    for width in [1440, 1024]:
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.locator('.engineering').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    assert not errors, errors
    print('Checked material-specific data, escape-only use, special system, printable report, persistence and narrow workplace.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    parser.add_argument('--example')
    args = parser.parse_args()
    with TemporaryDirectory() as tmp, sync_playwright() as p:
        with p.chromium.launch(channel='msedge') as browser:
            verify(browser.new_page(viewport={'width': 1440, 'height': 920}), args.url, Path(tmp), args.example)
