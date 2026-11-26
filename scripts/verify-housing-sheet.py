"""Check the workshop sheets against exported DXF contours and the printed PDFs.

Pass a running application URL. Use --example PDF to render the two-sheet
example from examples/halfslag-infrezingen.oss.json after the checks.
"""
import argparse
from math import isclose
from pathlib import Path
from tempfile import TemporaryDirectory

import ezdxf
import pymupdf
from playwright.sync_api import sync_playwright


def mm(value):
    return float(value.replace('.', '').replace(',', '.'))


def same(a, b):
    assert isclose(a, b, abs_tol=0.00501), (a, b)


def drawing(page, folder, beam):
    with page.expect_download() as saved:
        page.get_by_role('button', name='Wang-DXF', exact=True).click()
    assert saved.value.suggested_filename.endswith(beam + '_binnenvlak.dxf')
    target = folder / 'beam.dxf'
    saved.value.save_as(target)
    cad = ezdxf.readfile(target)
    audit = cad.audit()
    assert not audit.errors and not audit.fixes and cad.units == 4
    entities = list(cad.modelspace())
    face, = [entity for entity in entities if entity.dxf.layer == 'OSS-FACE']
    assert face.closed and face.dxftype() == 'LWPOLYLINE'
    setup, = [entity for entity in entities if entity.dxf.layer == 'OSS-SETUP']
    assert setup.dxf.text + '.dxf' == saved.value.suggested_filename
    pockets = [e for e in entities if e.dxf.layer.startswith('OSS-POCKET-D')]
    marks = [e.dxf.text for e in entities if e.dxf.layer == 'OSS-MARK']
    assert len(pockets) == len(marks) and len(set(marks)) == len(marks)
    result = {}
    for mark, contour in zip(marks, pockets):
        assert contour.closed and contour.dxftype() == 'LWPOLYLINE'
        depth = float(contour.dxf.layer.removeprefix('OSS-POCKET-D').replace('p', '.'))
        result[mark] = (list(contour.get_points('xy')), depth)
    return result


def pdf(page, required):
    data = page.pdf(print_background=True, prefer_css_page_size=True)
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        text = '\n'.join(sheet.get_text() for sheet in doc)
        for word in required:
            assert word in text, (word, text)
        assert 'Wang-DXF' not in text and 'Naar CNC' not in text
        for sheet in doc:
            assert abs(sheet.rect.width - 842) < 2 and abs(sheet.rect.height - 595) < 2
            assert sheet.get_text().strip()
    return data


def verify_beam(page, folder, beam, mark=None, capture=False):
    page.locator('#housing-beam').select_option(beam)
    page.get_by_role('button', name='Overzicht', exact=True).click()
    cad = drawing(page, folder, beam)
    assert cad and page.locator('.overview .cut').count() == len(cad)
    table = page.locator('.operations tbody tr').evaluate_all(
        '(rows) => rows.map(row => Array.from(row.cells, cell => cell.textContent.trim()))'
    )
    assert len(table) == len(cad)
    for n, ref, xs, ys, depth, edge in table:
        points, nominal_depth = cad[ref]
        assert int(n) > 0 and edge in ('In vlak', 'Aan rand')
        for axis, printed in enumerate((xs, ys)):
            start, end = [mm(v) for v in printed.split(' / ')]
            same(min(p[axis] for p in points), start)
            same(max(p[axis] for p in points), end)
        same(-nominal_depth, mm(depth))
    overview_pdf = pdf(page, [beam, 'XY-nul', *cad]) if capture else None
    ref = mark or table[len(table) // 2][1]
    points, depth = cad[ref]
    page.get_by_title('Pocketdetail ' + ref, exact=True).click()
    vertices = page.locator('.vertices tbody tr').all_inner_texts()
    assert len(vertices) == len(points)
    for index, (row, (x, y)) in enumerate(zip(vertices, points), 1):
        n, printed_x, printed_y = row.split('\t')
        assert int(n) == index
        same(x, mm(printed_x))
        same(y, mm(printed_y))
    assert page.locator('.detail-view .swept').count() == 1
    assert 'Z0' in page.locator('.depth-section').inner_text()
    detail_pdf = pdf(page, [beam, ref, 'Hoekpunten', 'Freesbereik', 'Resterend hout']) if capture else None
    pocket_id = page.locator('#housing-pocket').input_value()
    page.get_by_role('button', name='Naar CNC', exact=True).click()
    assert page.locator('#cam-beam').input_value() == beam
    assert page.locator('#cam-pocket').input_value() == pocket_id
    page.get_by_role('tab', name='Wangbladen', exact=True).click()
    return len(cad), (overview_pdf, detail_pdf)


def select_family(page, family, hand, shape):
    page.locator('#family').select_option(family)
    if hand:
        page.locator('#turn-direction').select_option(hand)
        page.locator('#outer-shape').select_option(shape)
    page.get_by_role('tab', name='Wangbladen', exact=True).click()


def check_tongue_link(page):
    page.get_by_role('tab', name='Onderdelen', exact=True).click()
    page.get_by_role('button', name='Tredeblad', exact=True).click()
    mark = page.locator('#wvb-tread option').nth(5).get_attribute('value')
    page.locator('#wvb-tread').select_option(mark)
    links = page.locator('.connections button')
    assert links.count() >= 2
    link = links.last
    beam = link.inner_text().split(' · ')[0]
    link.click()
    assert page.locator('#housing-beam').input_value() == beam
    assert mark in page.locator('.view-heading h3').inner_text()
    expected = page.locator('#housing-pocket').input_value()
    page.get_by_role('button', name='Naar CNC', exact=True).click()
    assert page.locator('#cam-pocket').input_value() == expected
    page.get_by_role('tab', name='Wangbladen', exact=True).click()
    page.locator('#joinery-depth').fill('140')
    page.locator('#joinery-depth').press('Tab')
    assert page.get_by_role('button', name='Wang-DXF', exact=True).is_disabled()
    assert page.locator('.sheet-issues').is_visible()


def check_sheet_set(page):
    options = page.locator('#housing-beam option').evaluate_all(
        'items => items.map(item => [item.value, item.textContent])'
    )
    # Capture PDF bytes via Chromium's print renderer. The native print request
    # is checked in its own tab so no second print job can interrupt it.
    page.evaluate("""() => { window.housingPrintCount = 0; window.originalPrint = window.print; window.print = () => {
        window.housingPrintCount = document.querySelectorAll('.set-item').length;
    }; }""")
    page.get_by_role('button', name='Alle wangbladen / PDF', exact=True).click()
    page.wait_for_function('window.housingPrintCount > 0')
    assert page.evaluate('window.housingPrintCount') == len(options)
    original = page.locator('#housing-beam').input_value()
    data = page.pdf(print_background=True, prefer_css_page_size=True)
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        assert len(doc) == len(options)
        for index, (sheet, (beam, label)) in enumerate(zip(doc, options), 1):
            content = sheet.get_text()
            assert f'Wangdeel {index} van {len(options)}' in content
            assert beam in content and 'revisie' in content and 'hoge trapzijde' in content
            if label.endswith('· 0 infrezingen'):
                assert 'Dit wangdeel bevat geen infrezingen' in content
            assert 'Alle wangbladen / PDF' not in content
    assert page.locator('.set-item').count() == 0
    assert page.locator('#housing-beam').input_value() == original
    page.evaluate('() => { window.print = window.originalPrint; }')


def check_native_print(browser, url):
    page = browser.new_page()
    page.goto(url)
    select_family(page, 'half_winder', 'right', 'faceted')
    count = page.locator('#housing-beam option').count()
    page.evaluate("""window.addEventListener('beforeprint', () => {
        window.housingPrintCount = document.querySelectorAll('.set-item').length;
    }, {once: true})""")
    page.get_by_role('button', name='Alle wangbladen / PDF', exact=True).click()
    page.wait_for_function('window.housingPrintCount > 0')
    assert page.evaluate('window.housingPrintCount') == count
    page.close()


def make_example(page, folder, output):
    project = Path(__file__).resolve().parents[1] / 'examples' / 'halfslag-infrezingen.oss.json'
    page.locator('input[type=file]').first.set_input_files(project)
    page.get_by_role('tab', name='Wangbladen', exact=True).click()
    # With three straight entry treads, tread 06 is in the first quarter turn.
    # Choose the longer of its inner and outer housing segments.
    candidates = []
    for beam in page.locator('#housing-beam option').evaluate_all('items => items.map(item => item.value)'):
        page.locator('#housing-beam').select_option(beam)
        rows = page.locator('.operations tbody tr').all_inner_texts()
        for row in rows:
            _, mark, bounds, *_ = row.split('\t')
            if mark.endswith('-06'):
                start, end = map(mm, bounds.split(' / '))
                candidates.append((end - start, beam, mark))
    _, beam, mark = max(candidates)
    _, pages = verify_beam(page, folder, beam, mark, capture=True)
    with pymupdf.open() as doc:
        for page_pdf in pages:
            with pymupdf.open(stream=page_pdf, filetype='pdf') as sheet:
                assert len(sheet) == 1
                doc.insert_pdf(sheet)
        doc.set_metadata({'title': 'Wangblad en infreesdetail ' + beam + ' / ' + mark,
                          'author': 'Open Stair Studio'})
        doc.save(output, garbage=4, deflate=True)
    print(f'Example {beam} / {mark}: {output}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--example', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory() as directory, sync_playwright() as playwright:
        folder = Path(directory)
        with playwright.chromium.launch(channel='msedge') as browser:
            page = browser.new_page(viewport={'width': 1440, 'height': 920})
            page.set_default_timeout(8000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url)
            for family, hand, shape in [('straight', None, None), ('quarter_winder', 'left', 'square'),
                                        ('quarter_winder', 'right', 'square'), ('half_winder', 'left', 'faceted'),
                                        ('half_winder', 'right', 'faceted')]:
                select_family(page, family, hand, shape)
                groups = page.locator('#housing-beam option').evaluate_all(
                    'items => items.map(item => [item.value, item.textContent])'
                )
                total = 0
                captured = False
                for beam, label in groups:
                    if label.endswith('· 0 infrezingen'):
                        continue
                    count, _ = verify_beam(page, folder, beam, capture=not captured)
                    captured = True
                    total += count
                print(f'{family} {hand or ""} {shape or ""}: {len(groups)} beams, {total} pocket contours')
                assert captured and total >= 34
            check_sheet_set(page)
            check_tongue_link(page)
            check_sheet_set(page)
            check_native_print(browser, args.url)
            if args.example:
                fresh = browser.new_page(viewport={'width': 1440, 'height': 920})
                fresh.goto(args.url)
                fresh.on('pageerror', lambda error: errors.append(str(error)))
                make_example(fresh, folder, args.example)
            assert not errors, errors


if __name__ == '__main__':
    main()
