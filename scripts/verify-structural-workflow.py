"""Run with a Vite URL or --desktop EXE. --example saves the illustrated IFC and PDF."""
import json
import sys
from pathlib import Path

import pymupdf
from browser_handoff import run_handoff

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / 'examples'


def check(page, download):
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.set_default_timeout(90000)
    upload = page.locator('input[type=file][accept*="json"]').first
    upload.set_input_files(EXAMPLES / 'rekenvoorbeeld-trapverbindingen.oss.json')
    work = page.get_by_role('region', name='Trap ontwerpen', exact=True)
    tab = lambda title: page.get_by_role('tab', name='Werkstroom '+title, exact=True)
    btn = lambda title: work.get_by_role('button', name=title, exact=True)
    tab('Engineering').click()
    calc = work.get_by_role('region', name='Constructieve berekening')
    calc.wait_for()
    row = calc.get_by_role('row').filter(has_text='Treden · buigspanning per dragend glasblad')
    before = row.locator('td').nth(1).inner_text()
    assert '175,593' in before, before
    field = page.locator('#well-designP')
    field.evaluate("(el)=>el.closest('details').open=true")
    field.fill('4')
    field.press('Tab')
    assert before != row.locator('td').nth(1).inner_text()
    field.fill('2')
    field.press('Tab')
    assert before == row.locator('td').nth(1).inner_text()
    calc.get_by_label('Filter constructieve toetsen').select_option('open')
    assert not row.count()
    calc.get_by_label('Filter constructieve toetsen').select_option('all')

    def print_pdf(button):
        page.evaluate("window.print=()=>{window.printReady=true}; window.printReady=false")
        btn(button).click()
        page.wait_for_function('window.printReady')
        data = page.pdf(prefer_css_page_size=True, print_background=True)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        return pymupdf.open(stream=data, filetype='pdf')

    with print_pdf('Berekening afdrukken') as report:
        extracted = ' '.join(p.get_text() for p in report)
        assert '175,593' in extracted and 'Resttoestand' in extracted
    book = pymupdf.open()
    for mark, key, count in [('GL-01','kop-L',2),('GL-01','trede-01-L-oplegging',0),('BL-01','trede-01-wandplaat-1',4),
                              ('ST-01','vlucht-1-voet-L',4),('VT-01','keerbordes-voet-1',4)]:
        page.locator('button.tree-item').filter(has_text=mark+' ·').click()
        tab('Werkvoorbereiding').click()
        picker = work.get_by_label('Verbinding op werkplaatsblad')
        picker.select_option(key)
        article = work.get_by_role('article', name='Werkplaatsblad '+key, exact=True)
        assert article.get_by_role('img').count() == 2
        if count:
            assert article.get_by_role('table', name='Ankerharten').locator('tbody tr').count() == count
        with print_pdf('Detail afdrukken') as result:
            assert result.page_count == 1, (key, result.page_count)
            text = result[0].get_text()
            assert mark+' / '+key in text and 'Verbindingstoetsen' in text and (count == 0 or 'h.o.h.' in text), text[:450]
            if count == 0:
                assert 'restbuiging' in text.lower() and 'vervorming na glasbreuk' in text.lower()
            book.insert_pdf(result)
        if mark=='GL-01':
            ids=picker.locator('option').evaluate_all('(opts)=>opts.map(o=>o.value)')
            with print_pdf('Alle verbindingsbladen afdrukken') as complete:
                text='\n'.join(p.get_text() for p in complete)
                assert all(mark+' / '+i in text for i in ids), (len(ids),len(complete))
    data = download('Geheel project als IFC4','.ifc').read_bytes()
    assert data.count(b'=IFCSTAIR(') == 4
    assert data.count(b'=IFCGROUP(') > 100 and b'OSS_ConstructieveToets_' in data
    saved = download('Opslaan','.oss.json')
    model = json.loads(saved.read_text(encoding='utf-8-sig'))
    assert model['version'] == '0.13.3' and model['stairwell']['instances'][0]['params']['designP'] == 2
    upload.set_input_files(saved)
    tab('Engineering').click()
    assert 'VT-01' in calc.inner_text()
    if '--example' in sys.argv:
        book.save(EXAMPLES/'werkplaats-trapverbindingen.pdf', garbage=4, deflate=True)
        (EXAMPLES/'rekenvoorbeeld-trapverbindingen.ifc').write_bytes(data)
    book.close()
    assert not errors, errors
    print('Vier geprojecteerde werkplaatsdetails en een rekenrapport geprint; lasten gewijzigd, IFC4 overgedragen en project heropend.')


if __name__=='__main__':
    run_handoff(sys.argv[1:], check)
