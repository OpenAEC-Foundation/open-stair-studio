"""Print a two-sided tread and read the machining setups from the resulting PDF."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from playwright.sync_api import sync_playwright


with TemporaryDirectory() as tmp, sync_playwright() as playwright:
    with playwright.chromium.launch(channel='msedge') as browser:
        page = browser.new_page(viewport={'width': 1550, 'height': 930}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(sys.argv[1])
        page.locator('#family').select_option('quarter_turn')
        page.locator('#stair-riser-boards').select_option('closed')
        page.locator('#riser-joint').select_option('housed')
        page.locator('#nosing').fill('-35')
        page.locator('#nosing').press('Tab')
        page.get_by_role('tab', name='Werkstroom CNC').click()
        page.get_by_role('button', name='Treden frezen').click()
        page.locator('#cnc-tread').select_option(index=1)
        page.get_by_role('button', name='Naar tredeblad').click()
        setups = page.locator('section.groove')
        assert setups.count() == 2, page.locator('.production-view').inner_text()
        for i, (label, operation) in enumerate([('Onderzijde boven', 'UNDERSIDE UP'), ('Bovenzijde boven', 'TOP FACE UP')]):
            section = setups.nth(i)
            assert label in section.inner_text()
            with page.expect_download() as download:
                section.get_by_role('button', name='Groef frezen (.ngc)').click()
            nc = Path(download.value.path()).read_text()
            assert operation in nc and 'G1 Z-8' in nc and 'M2' in nc
        target = Path(sys.argv[2]) if len(sys.argv)>2 else Path(tmp)/'tread.pdf'
        page.pdf(path=target, prefer_css_page_size=True, print_background=True)
        with pymupdf.open(target) as pdf:
            texts = [p.get_text() for p in pdf]
            assert len(texts) == 2, texts
            assert 'Tredeblad' in texts[0] and 'Insteeklippen' in texts[0], texts[0]
            assert all(label in texts[1] for label in ['Onderzijde boven','Bovenzijde boven','Opspanning 1/2','Opspanning 2/2','TR-01-TD-02-SB','TR-01-TD-03-SB']), texts[1]
        assert not errors, errors
print('Tredeblad gecontroleerd in Edge. PDF met overzicht en beide groefopspanningen. Beide NC-bestanden gedownload en herlezen.')
