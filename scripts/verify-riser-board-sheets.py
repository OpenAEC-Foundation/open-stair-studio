"""Export a winding riser through its work sheet and verify the actual downloads and print pages."""
import hashlib
import re
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from playwright.sync_api import sync_playwright


def set_nosing(page, value):
    page.locator('#nosing').fill(str(value))
    page.locator('#nosing').press('Tab')


def programs(page, mark):
    result = []
    for i,section in enumerate(page.locator('section.board-setup').all()):
        page.get_by_label('Opspanning',exact=True).select_option(index=i)
        with page.expect_download() as event:
            section.get_by_role('button', name='LinuxCNC-programma (.ngc)').click()
        download = event.value
        code = Path(download.path()).read_text(encoding='utf-8')
        assert mark in code and mark in download.suggested_filename, download.suggested_filename
        assert 'G54' in code and 'M2' in code and re.search(r'(?m)^G1\s',code)
        diameter = re.search(r'Ø ([0-9,]+) mm · snijlengte',section.inner_text()).group(1).replace(',','.')
        assert f'end mill D{diameter} mm' in code and f'_D{diameter}.ngc' in download.suggested_filename
        # Compare machine motion, so merely changing the nose in a comment cannot pass.
        motion = '\n'.join(line for line in code.splitlines() if re.match(r'^G[0123]\s', line))
        result.append((download.suggested_filename, hashlib.sha256(motion.encode()).digest()))
    assert result and len({name for name,_ in result})==len(result)
    return result


with TemporaryDirectory() as tmp, sync_playwright() as playwright:
    with playwright.chromium.launch(channel='msedge') as browser:
        page = browser.new_page(viewport={'width':1500, 'height':930}, accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(sys.argv[1])
        page.locator('#family').select_option('half_winder')
        page.locator('#turn-direction').select_option('right')
        page.locator('#outer-shape').select_option('faceted')
        page.locator('#stair-riser-boards').select_option('closed')
        page.locator('#riser-joint').select_option('housed')
        set_nosing(page,25)
        page.get_by_role('tab',name='Werkstroom Werkvoorbereiding').click()
        page.get_by_role('button',name='Houtdetails en profielen').click()
        page.get_by_label('Onderdeelgroep').select_option('riser')
        mark='TR-01-TD-09-SB'
        page.get_by_label('Onderdeelmerk').select_option(mark)
        detail=page.pdf(prefer_css_page_size=True,print_background=True)
        page.get_by_role('button',name='Stootbord frezen',exact=True).click()
        right=programs(page,mark)
        set_nosing(page,-35)
        shifted=programs(page,mark)
        assert [h for _,h in shifted]!=[h for _,h in right]
        set_nosing(page,25)
        page.locator('#turn-direction').select_option('left')
        left=programs(page,mark)
        assert [h for _,h in left]!=[h for _,h in right]
        page.locator('#turn-direction').select_option('right')
        assert programs(page,mark)==right
        page.get_by_text('Gereedschap en snijgegevens',exact=True).click()
        flute=page.get_by_label('Snijlengte (mm)',exact=True)
        original=flute.input_value()
        flute.fill('1')
        flute.press('Tab')
        assert page.locator('.board-cam .problem').is_visible()
        assert page.get_by_role('button',name='LinuxCNC-programma (.ngc)').count()==0
        flute.fill(original)
        flute.press('Tab')
        assert page.locator('section.board-setup').count()==len(right)
        page.get_by_label('Gereedschap',exact=True).select_option('detail')
        detail_flute=flute.input_value()
        flute.fill('1')
        flute.press('Tab')
        assert page.locator('.board-cam .problem').is_visible()
        assert page.get_by_role('button',name='LinuxCNC-programma (.ngc)').count()==0
        flute.fill(detail_flute)
        flute.press('Tab')
        assert page.locator('section.board-setup').count()==len(right)
        page.get_by_text('Gereedschap en snijgegevens',exact=True).click()
        cam=page.pdf(prefer_css_page_size=True,print_background=True)
        target=Path(sys.argv[2]) if len(sys.argv)>2 else Path(tmp)/'riser-cam.pdf'
        with pymupdf.open() as doc:
            with pymupdf.open(stream=detail,filetype='pdf') as drawing:
                assert len(drawing)==1 and 'Hoekpunten bordlichaam' in drawing[0].get_text()
                doc.insert_pdf(drawing)
            with pymupdf.open(stream=cam,filetype='pdf') as printout:
                assert len(printout)==len(right), [sheet.get_text() for sheet in printout]
                for sheet in printout:
                    text=sheet.get_text()
                    assert all(label in text for label in [mark,'Opspanning','G54','K in deze opspanning','Plank in deze stand','Benodigde snijlengte in hout']), text
                    if 'Spilrichting vanaf haakse kop' in text:
                        assert 'Eindpunten kopvlak' in text and 'Kopdetail van boven' in text, text
                labels='\n'.join(sheet.get_text() for sheet in printout)
                assert 'Hoofdfrees' in labels and 'Detailfrees' in labels and 'Ø 2 mm' in labels and 'Ø 6 mm' in labels
                doc.insert_pdf(printout)
            doc.save(target,garbage=4,deflate=True)
        assert not errors,errors
        print(f'{len(right)} opspanningen gedownload per stand, inclusief gewijzigde freesbanen bij neusverplaatsing en spiegeling. {len(right)+1} PDF-bladen.')
