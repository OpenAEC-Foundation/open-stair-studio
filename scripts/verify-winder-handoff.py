"""Check individual tread sheets and gross pricing in Edge. Use the same environment
as verify-handoff.py and pass the URL of a running Open Stair Studio instance.
"""
from collections import Counter
from csv import DictReader
from math import isclose
from pathlib import Path
from tempfile import TemporaryDirectory
import sys

import ezdxf
import pymupdf
from playwright.sync_api import sync_playwright


def downloaded(page, label, target):
    with page.expect_download() as result:
        page.get_by_role('button', name=label, exact=True).click()
    result.value.save_as(target)
    return result.value.suggested_filename


def verify_hand(page, folder, family, hand, shape):
    page.locator('#family').select_option(family)
    page.locator('#turn-direction').select_option(hand)
    page.locator('#outer-shape').select_option(shape)
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding', exact=True).click()
    downloaded(page, 'Onderdelen naar CSV', folder / 'parts.csv')
    with (folder / 'parts.csv').open(encoding='utf-8-sig', newline='') as file:
        rows = list(DictReader(file, delimiter=';'))
    treads = [part for part in rows if part['Tredenummer']]
    assert len(treads) == 17 and len({part['Merk'] for part in treads}) == 17
    beams = [part for part in rows if not part['Tredenummer']]
    assert beams and any(float(p['Bruto m3']) > float(p['Netto m3']) for p in beams)
    for beam in beams:
        raw = float(beam['Ruwlengte mm']) * float(beam['Ruwbreedte mm']) * float(beam['Dikte mm']) / 1e9
        assert isclose(float(beam['Bruto m3']), raw, rel_tol=2e-5, abs_tol=2e-8)
        assert float(beam['Bruto m3']) >= float(beam['Netto m3'])
    # The board with the largest offcut has an asymmetric, easily recognised outline.
    part = max(treads, key=lambda row: float(row['Bruto m3']) - float(row['Netto m3']))
    mark = part['Merk']
    page.get_by_role('button', name='Tredeblad', exact=True).click()
    page.get_by_label('Trede', exact=True).select_option(mark)
    assert page.get_by_role('heading', name=mark, exact=True).is_visible()
    assert downloaded(page, 'Tredecontour DXF', folder / 'tread.dxf') == f'{mark}-contour.dxf'
    cad = ezdxf.readfile(folder / 'tread.dxf')
    audit = cad.audit()
    assert not audit.errors and not audit.fixes and cad.units == 4
    entity, = list(cad.modelspace())
    assert entity.closed and entity.dxftype() == 'LWPOLYLINE' and entity.dxf.layer == 'OSS-TREAD'
    points = list(entity.get_points('xy'))
    area = abs(sum(x * y2 - x2 * y for (x, y), (x2, y2) in zip(points, points[1:] + points[:1]))) / 2
    assert isclose(area, float(part['Contouroppervlak mm2']), abs_tol=.001)
    for axis, column in [(0, 'Ruwlengte mm'), (1, 'Ruwbreedte mm')]:
        values = [p[axis] for p in points]
        assert abs(min(values)) < 1e-6
        assert -.000001 <= float(part[column]) - max(values) < 1.000001
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as document:
        content = ''.join(p.get_text() for p in document)
        assert mark in content and 'Kortste zijmaat langs wang' in content and 'Ruwlengte langs voorrand' in content
        assert 'Tredecontour DXF' not in content
    (folder / f'{family}-{shape}-{hand}.pdf').write_bytes(pdf)
    page.get_by_role('tab', name='Calculatie', exact=True).click()
    materials = page.locator('.estimate-result dt').filter(has_text='Hout incl. uitval').locator('xpath=following-sibling::dd[1]').inner_text()
    amount = float(materials.replace('€', '').replace(' ', '').strip().replace(',', '.'))
    expected = sum(float(p['Bruto m3']) for p in rows) * 1.18 * 2400
    assert abs(amount - expected) < .01, (amount, expected)
    print(f'{family}/{hand}/{shape}: {mark}, {len(points)} contour points, {area:.1f} mm2, materials EUR {amount:.2f}')
    return mark, points


if __name__ == '__main__':
    with TemporaryDirectory() as directory, sync_playwright() as playwright:
        with playwright.chromium.launch(channel='msedge') as browser:
            page = browser.new_page(viewport={'width': 1440, 'height': 920})
            page.goto(sys.argv[1])
            for family in ['quarter_winder', 'half_winder']:
                for shape in ['square', 'faceted']:
                    left_mark, left = verify_hand(page, Path(directory), family, 'left', shape)
                    right_mark, right = verify_hand(page, Path(directory), family, 'right', shape)
                    assert left_mark == right_mark
                    xmax = max(x for x, y in left)
                    assert Counter((round(xmax - x, 4), round(y, 4)) for x, y in left) == Counter(
                        (round(x, 4), round(y, 4)) for x, y in right)
