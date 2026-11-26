"""Exercise the mixed housed/keepboom editor, workshop sheet and DXF."""
import sys
from pathlib import Path

import ezdxf
from playwright.sync_api import sync_playwright


with sync_playwright() as playwright:
    browser=playwright.chromium.launch(channel='msedge')
    page=browser.new_page(viewport={'width':1600,'height':1000},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(sys.argv[1],wait_until='domcontentloaded')
    page.locator('#family').select_option('quarter_turn')
    page.locator('#stringer-left').select_option('cut')
    assert page.locator('#stringer-right').input_value()=='housed'
    assert page.locator('#stringer-overhang').input_value()=='20'
    if len(sys.argv)>2:
        page.locator('canvas[aria-label="3D-model van de trap"]').wait_for(timeout=30000)
        page.get_by_text('3D-weergave laden…').wait_for(state='hidden',timeout=30000)
        page.screenshot(path=sys.argv[2],full_page=False)
    page.get_by_role('tab',name='Werkstroom Werkvoorbereiding').click()
    page.get_by_role('button',name='Wangbladen infrezingen').click()
    page.locator('#housing-beam').select_option('TR-01-WG1-L')
    page.get_by_role('heading',name='Keepboom · uitgezaagde treden').wait_for()
    assert 'minimale rug' in page.locator('.instruction').first.inner_text().lower()
    with page.expect_download() as saved:
        page.get_by_role('button',name='Wang-DXF',exact=True).click()
    target=Path(saved.value.path())
    dxf=ezdxf.readfile(target)
    assert not dxf.audit().errors
    contours=[entity for entity in dxf.modelspace() if entity.dxf.layer=='OSS-KEEPBOOM-CONTOUR']
    assert len(contours)==1 and contours[0].closed
    page.get_by_role('tab',name='Werkstroom CNC').click()
    page.get_by_role('button',name='Wangen frezen').click()
    page.locator('#cam-beam').select_option('TR-01-WG1-L')
    assert page.get_by_role('button',name='LinuxCNC-programma (.ngc)').is_disabled()
    assert page.get_by_role('button',name='Volledige wang-DXF').is_enabled()
    assert not errors,errors
    browser.close()
print('UI: keepboom per zijde, werkblad, gesloten DXF en CNC-grens gecontroleerd.')
