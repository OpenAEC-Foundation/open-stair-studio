"""Open the three sample projects and check the dossier in real Edge or WebView2.

Pass the Vite URL or --desktop path/to/open-stair-studio.exe.
Add --pdf path/to/report.pdf to keep the CLT example printed by the application.
"""
import json
import sys
from math import isclose
from pathlib import Path
import pymupdf
from browser_handoff import run_handoff

args = sys.argv[1:]
output = Path(args[args.index('--pdf') + 1]) if '--pdf' in args else None


def verify(page, download):
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    def enter(key, value):
        field = page.locator('#eng-' + key)
        field.fill(str(value))
        field.press('Tab')

    for name, expected in [('glas', 'pass'), ('rooster', 'fail'), ('clt', 'pass')]:
        page.locator('input[type=file]').set_input_files(str(Path('examples/rekenvoorbeeld-' + name + '.oss.json').resolve()))
        page.get_by_role('tab', name='Engineering', exact=True).click()
        sheet = page.locator('[data-check="resistance"]')
        page.wait_for_function("v => document.querySelector('[data-check=resistance]')?.dataset.status === v", arg=expected)
        report = json.loads(download('Dossier als JSON', '.json').read_text('utf-8'))
        assert report['project']['number'] == 'DEMO-' + name.upper()
        d = report['dossier']
        assert d['resistance']['status'] == expected
        rows = {r['id']:r for r in d['resistance']['rows']}
        assert isclose(rows['connection']['demand'], 3.0675)
        assert len(rows) == sheet.locator('tbody tr').count()
        assert rows['bending']['status'] == expected
        if name != 'clt':
            continue
        assert d['escape']['capacity'] == 36 and d['escape']['status'] == 'pass'
        assert isclose(rows['bearing-pressure']['demand'], 3.0675 * 1000 / 1600)
        assert isclose(rows['fastener-shear']['demand'], 3.0675 * .55)
        assert sheet.locator('[data-id="fastener-group"]').is_visible()
        if output:
            pdf = page.pdf(prefer_css_page_size=True, print_background=True)
            with pymupdf.open(stream=pdf, filetype='pdf') as doc:
                words = ' '.join(' '.join(p.get_text().split()) for p in doc)
                for term in ['DEMO-CLT', 'CLT-treden', 'oplegdruk', 'bevestiger', '36 personen', '1,35', 'UGT', 'BGT']:
                    assert term.lower() in words.lower(), term
            output.write_bytes(pdf)
        enter('escapePersons', 37)
        assert page.locator('[data-check="escape"]').get_attribute('data-status') == 'fail'
        enter('connectionRd', 1)
        assert sheet.get_attribute('data-status') == 'fail'
        saved = download('Opslaan', '.oss.json')
        page.reload()
        page.get_by_role('tab', name='Engineering', exact=True).click()
        assert page.locator('#eng-connectionRd').input_value() == '1'
        page.locator('input[type=file]').set_input_files(str(saved))
        assert page.locator('#eng-escapePersons').input_value() == '37'
        page.locator('#eng-supportDetailMode').select_option('whole')
        assert not page.locator('#eng-fastenerCount').count()
        assert not sheet.locator('[data-id="fastener-group"]').count()
        page.get_by_role('tab',name='BIM-model',exact=True).click()
        content = download('IFC4 exporteren', '.ifc').read_text('utf-8')
        for fragment in ['EscapeCapacityPersons','IFCINTEGER(36)','AssignedPersons','TreadStructuralCheckStatus']:
            assert fragment in content, fragment
    assert not errors, errors
    print('Glass, grating, CLT, selected support details, overloads, real downloads, persistence and IFC4 checked.')

if __name__ == '__main__':
    run_handoff(args, verify)
