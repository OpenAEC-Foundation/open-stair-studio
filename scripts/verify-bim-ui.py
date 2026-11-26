"""Exercise the landing frame editor and workshop DXF in a real browser."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge')
    page = browser.new_page(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='domcontentloaded')
    page.locator('#family').select_option('quarter_turn')
    page.locator('#landing-thickness').fill('65')
    page.locator('#landing-thickness').dispatch_event('change')
    page.locator('#landing-frame').select_option('perimeter')
    page.get_by_role('tab', name='Werkstroom Werkvoorbereiding').click()
    page.get_by_role('button', name='Bordesraam en naden').click()
    page.get_by_role('heading', name='Bordesraam en aansluitingen').wait_for()
    assert page.locator('.parts-table').first.locator('tbody tr').count() == 4
    assert page.locator('.parts-table').nth(1).locator('tbody tr').count() == 8
    assert '65 mm' in page.locator('.production-summary').first.inner_text()
    with page.expect_download() as event:
        page.get_by_role('button', name='DXF · 1:1').click()
    download = event.value
    assert download.suggested_filename.endswith('-bordesraam.dxf')
    assert 'OSS-BOORPUNTEN-BUITENZIJDE' in Path(download.path()).read_text(errors='replace')
    page.get_by_role('tab', name='Werkstroom BIM').click()
    page.locator('#host-ifc-file').set_input_files(Path(__file__).resolve().parents[1] / 'examples' / 'testgebouw-trapgat.ifc')
    page.locator('.bim-view').get_by_text('1 vloer', exact=False).wait_for()
    assert 'Sparingscontour controleren' in page.locator('.bim-view [role=status]').inner_text()
    assert not errors, errors
    if len(sys.argv) > 2:
        page.screenshot(path=str(Path(sys.argv[2])), full_page=True)
    browser.close()
print('UI: bordesraam, DXF en IFC-gebouwmodel met sparing gecontroleerd.')
