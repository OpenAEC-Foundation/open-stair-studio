"""Check actual browser downloads. Usage: python scripts/verify-handoff.py URL

Requires playwright, pymupdf, ezdxf and Microsoft Edge. All output is temporary.
"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import ezdxf
import pymupdf
from playwright.sync_api import sync_playwright


def check_exports(page, folder, family, counts):
    page.locator('#family').select_option(family)
    winding = family.endswith('_winder')
    if winding:
        assert page.locator('.step-marker').count() == 17
        page.locator('.step-marker').nth(7).click()
        assert page.get_by_role('heading', name='TR-01-TD-08', exact=True).is_visible()
        page.get_by_role('button', name='Onderdelenstaat', exact=True).click()
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding', exact=True).click()
    with page.expect_download() as result:
        page.get_by_role('button', name='Plan naar DXF').click()
    dxf_path = folder / f'{family}.dxf'
    result.value.save_as(dxf_path)
    cad = ezdxf.readfile(dxf_path)
    assert cad.units == 4
    outlines = [item for item in cad.modelspace() if item.dxf.layer in counts]
    assert all(shape.dxftype() == 'LWPOLYLINE' and shape.closed for shape in outlines)
    assert Counter(shape.dxf.layer for shape in outlines) == counts
    if winding:
        line, = list(cad.modelspace().query('*[layer=="OSS-WALKLINE"]'))
        assert not line.closed and len(line) > counts['OSS-TREAD']
        marks = cad.modelspace().query('TEXT[layer=="OSS-MARK"]')
        assert {int(item.dxf.text) for item in marks} == set(range(1, 18))
    audit = cad.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)

    with page.expect_download() as result:
        page.get_by_role('button', name='Onderdelen naar CSV').click()
    csv_path = folder / f'{family}.csv'
    result.value.save_as(csv_path)
    with csv_path.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream, delimiter=';'))
    if winding:
        boards = [row for row in rows if row['Tredenummer']]
        assert len(boards) == counts['OSS-TREAD']
        assert any(float(row['Bruto m3']) > float(row['Netto m3']) for row in boards)
        for shape, board in zip(cad.modelspace().query('LWPOLYLINE[layer=="OSS-TREAD"]'), boards, strict=True):
            points = list(shape.get_points('xy'))
            area = abs(sum(x*y2-x2*y for (x,y),(x2,y2) in zip(points, points[1:]+points[:1])))/2
            assert abs(area-float(board['Contouroppervlak mm2'])) < .001
    else:
        tread = next(row for row in rows if row['Merk'].endswith('-TD'))
        assert int(tread['Breedte mm']) == 800
        assert int(tread['Aantal']) == counts['OSS-TREAD']
    assert sum(int(row['Aantal']) for row in rows) == len(outlines)

    page.evaluate('document.fonts.ready')
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as report:
        if not winding:
            assert len(report) == 1
        text = ''.join(page.get_text() for page in report)
        assert all(row['Merk'] in text for row in rows)
        for label in ['Onderdelenstaat', 'Woonhuis De Linde', 'OSS-2026-001', 'TR-01-TD']:
            assert label in text
        assert 'PDF / afdrukken' not in text and 'geëxporteerd' not in text

    page.get_by_role('tab', name='Werkstroom BIM', exact=True).click()
    with page.expect_download(timeout=60000) as result:
        page.locator('.bim-view .action-btn').click()
    ifc_path = folder / f'{family}.ifc'
    result.value.save_as(ifc_path)
    assert "FILE_SCHEMA(('IFC4'))" in ifc_path.read_text(encoding='utf-8')
    print(f'{family}: DXF ({len(outlines)} contours), CSV, A4 PDF and IFC4 download OK')


if __name__ == '__main__':
    with TemporaryDirectory() as directory, sync_playwright() as playwright:
        with playwright.chromium.launch(channel='msedge') as browser:
            page = browser.new_page(viewport={'width': 1440, 'height': 920})
            problems = []
            page.on('pageerror', lambda error: problems.append(str(error)))
            page.goto(sys.argv[1])
            # Verify the older, joint-free handoff against the coordination plan.
            page.get_by_role('tab', name='Wangbladen').click()
            page.locator('#joinery-type').select_option('none')
            page.get_by_role('tab', name='Plattegrond').click()
            page.get_by_role('button', name='Inzoomen').click()
            assert '125%' in page.locator('.zoom-control').inner_text()
            page.get_by_role('button', name='Passend', exact=True).click()
            assert '100%' in page.locator('.zoom-control').inner_text()
            page.get_by_role('button', name='Bibliotheek', exact=True).click()
            page.get_by_label('Zoek trapmodellen').fill('kwartslag')
            assert page.locator('.library-item').count() == 2
            page.get_by_label('Zoek trapmodellen').fill('')
            page.locator('#family').select_option('half_winder')
            page.locator('#outer-shape').select_option('faceted')
            page.locator('#turn-direction').select_option('right')
            page.locator('#entry-steps').select_option('1')
            page.locator('#winder-count').fill('5')
            page.locator('#winder-count').press('Tab')
            with page.expect_download() as saved:
                page.get_by_title('Project opslaan', exact=True).click()
            archive = Path(directory) / 'right.oss.json'
            saved.value.save_as(archive)
            stair = json.loads(archive.read_text(encoding='utf-8'))['stair']
            assert [stair[k] for k in ['type','windersPerQuarter','entrySteps','turnDirection','outerShape']] == [
                'half_winder',5,1,'right','faceted']
            page.reload()
            assert page.locator('#family').input_value() == 'half_winder'
            assert page.locator('#entry-steps').input_value() == '1'
            page.locator('#winder-count').fill('2')
            page.locator('#winder-count').press('Tab')
            assert page.get_by_role('heading', name='Verdrijving aanpassen').is_visible()
            page.get_by_title('Ongedaan maken', exact=True).click()
            assert page.locator('#winder-count').input_value() == '5'
            page.locator('#outer-shape').select_option('square')
            page.locator('#turn-direction').select_option('left')
            page.locator('#entry-steps').select_option('-1')
            page.locator('#winder-count').fill('4')
            page.locator('#winder-count').press('Tab')
            for family in ['straight', 'quarter_turn', 'landing', 'half_turn', 'quarter_winder', 'half_winder']:
                counts = {
                    'straight': {'OSS-TREAD': 17, 'OSS-STRINGER': 2},
                    'quarter_winder': {'OSS-TREAD': 17, 'OSS-STRINGER': 10},
                    'half_winder': {'OSS-TREAD': 17, 'OSS-STRINGER': 15},
                }.get(family, {'OSS-TREAD': 16, 'OSS-STRINGER': 4, 'OSS-LANDING': 1})
                check_exports(page, Path(directory), family, counts)
            page.locator('#family').select_option('straight')
            page.get_by_role('tab', name='Onderdelen', exact=True).click()
            page.locator('#stair-width').fill('300')
            page.locator('#stair-width').press('Tab')
            page.locator('#stringer-thickness').fill('150')
            page.locator('#stringer-thickness').press('Tab')
            assert page.get_by_role('heading', name='Geen ruimte voor de treden').is_visible()
            assert page.locator('.parts-table').count() == 0
            page.get_by_title('Ongedaan maken', exact=True).click()
            assert page.locator('.parts-table').is_visible()
            assert not problems, problems
