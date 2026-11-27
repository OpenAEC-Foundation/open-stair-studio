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
        family = sys.argv[3] if len(sys.argv) > 3 else 'quarter_turn'
        winding = family.endswith('_winder')
        index = 8 if winding else 1
        page.locator('#family').select_option(family)
        if winding:
            page.locator('#turn-direction').select_option('right')
            page.locator('#outer-shape').select_option('faceted')
        page.locator('#stair-riser-boards').select_option('closed')
        page.locator('#riser-joint').select_option('housed')
        nose = '25' if winding else '-35'
        page.locator('#nosing').fill(nose)
        page.locator('#nosing').press('Tab')
        page.get_by_role('tab', name='Werkstroom CNC').click()
        page.get_by_role('button', name='Treden frezen').click()
        page.locator('#cnc-tread').select_option(index=index)
        page.get_by_role('button', name='Naar tredeblad').click()
        setups = page.locator('section.groove')
        assert setups.count() == 2, page.locator('.production-view').inner_text()
        if winding:
            rear = setups.nth(1).locator('polygon.slot')
            old_slot = rear.get_attribute('points')
            for value in ['-35', nose]:
                page.locator('#nosing').fill(value)
                page.locator('#nosing').press('Tab')
                assert page.locator('#wvb-tread').input_value() == f'TR-01-TD-{index+1:02d}'
                assert (rear.get_attribute('points') == old_slot) == (value == nose)
        for i, (label, operation) in enumerate([('Onderzijde boven', 'UNDERSIDE UP'), ('Bovenzijde boven', 'TOP FACE UP')]):
            section = setups.nth(i)
            assert label in section.inner_text()
            with page.expect_download() as download:
                section.get_by_role('button', name='Groef frezen (.ngc)').click()
            nc = Path(download.value.path()).read_text()
            assert operation in nc and 'G1 Z-8' in nc and 'M2' in nc
            with page.expect_download() as download:
                section.get_by_role('button', name='Groef-DXF').click()
            assert 'OSS-STOOTBORD-D' in Path(download.value.path()).read_text()
        target = Path(sys.argv[2]) if len(sys.argv)>2 else Path(tmp)/'tread.pdf'
        page.pdf(path=target, prefer_css_page_size=True, print_background=True)
        with pymupdf.open(target) as pdf:
            texts = [p.get_text() for p in pdf]
            assert len(texts) == 2, texts
            assert 'Tredeblad' in texts[0] and 'Insteeklippen' in texts[0], texts[0]
            assert all(label in texts[1] for label in ['Onderzijde boven','Bovenzijde boven','Opspanning 1/2','Opspanning 2/2',
                f'TR-01-TD-{index+1:02d}-SB', f'TR-01-TD-{index+2:02d}-SB']), texts[1]
            if winding:
                assert 'hoekpunten G54' in texts[1] and 'Rechtsom bij oplopen' in texts[1] and 'Verdreven' in texts[0], texts
        if winding:
            riser = f'TR-01-TD-{index+1:02d}-SB'
            page.get_by_role('tab', name='Werkstroom Werkvoorbereiding').click()
            page.get_by_role('button', name='Houtdetails en profielen').click()
            page.get_by_label('Onderdeelgroep').select_option('riser')
            page.get_by_label('Onderdeelmerk').select_option(riser)
            notes = page.locator('.paper').get_by_text('Wegens het wangverstek')
            note = notes.inner_text()
            beam, depth = note.split(' in ')[1].split()[:2]
            detail = page.pdf(prefer_css_page_size=True, print_background=True)
            page.get_by_role('button', name='Wangbladen infrezingen').click()
            page.locator('#housing-beam').select_option(beam)
            page.get_by_title('Pocketdetail '+riser, exact=True).click()
            wang = page.pdf(prefer_css_page_size=True, print_background=True)
            page.get_by_role('button',name='Naar CNC',exact=True).click()
            page.locator('#cam-scope').select_option('single-pocket')
            with page.expect_download() as download:
                page.get_by_role('button',name='LinuxCNC-programma (.ngc)').click()
            nc = Path(download.value.path()).read_text()
            assert f'{beam}__{riser}__inside' in nc and 'G1 Z-'+depth+' F' in nc
            with pymupdf.open() as assembled:
                with pymupdf.open(target) as tread:
                    assembled.insert_pdf(tread)
                for data, labels in [(detail,[riser, beam,'Hoekpunten bordlichaam']), (wang,[beam,riser,'Hoekpunten in wangcoördinaten'])]:
                    with pymupdf.open(stream=data,filetype='pdf') as sheet:
                        assert len(sheet)==1 and all(label in sheet[0].get_text() for label in labels), [p.get_text() for p in sheet]
                        assembled.insert_pdf(sheet)
                assembled.save(target,garbage=4,deflate=True)
        assert not errors, errors
print('Tredeblad gecontroleerd in Edge. PDF met overzicht en beide groefopspanningen. Beide NC-bestanden gedownload en herlezen.')
