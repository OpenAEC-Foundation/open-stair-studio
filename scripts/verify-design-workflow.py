"""Run in Edge with a Vite URL, or in the native app with --desktop EXE. --example writes the timber booklet."""
import json
import sys
from pathlib import Path

import pymupdf
from browser_handoff import run_handoff

def check(page,download):
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda dialog:dialog.accept())
    page.set_default_timeout(18000)
    button=lambda name:page.get_by_role('button',name=name,exact=True)
    tab=lambda name:page.get_by_role('tab',name=name,exact=True)
    button('Klassieke houten kwartslag').click()
    assert page.locator('#wood-detail').input_value()=='classic'
    tab('Houtdetails').click()
    sheet=page.get_by_role('region',name='Houtwerkplaats')
    groups=sheet.get_by_label('Onderdeelgroep')
    assert groups.locator('option').count()==6
    book=pymupdf.open()
    def print_sheet(label):
        page.evaluate("window.print=()=>{window.printReady=true};window.printReady=false")
        button(label).click()
        page.wait_for_function('window.printReady')
        with pymupdf.open(stream=page.pdf(prefer_css_page_size=True,print_background=True),filetype='pdf') as printed:
            for p in printed:
                assert 'HT-01' in p.get_text(), (label,p.number,p.get_text()[:120])
            book.insert_pdf(printed)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    for kind in ['tread','nosingStrip','riser','newel','baluster','handrail']:
        groups.select_option(kind)
        print_sheet('Detailblad PDF')
    print_sheet('Maatstaat PDF')
    assert book.page_count>=7
    if '--example' in sys.argv:
        book.save(Path(__file__).resolve().parents[1]/'examples'/'houtdetails-kwartslag.pdf',garbage=4,deflate=True)
    doc_pages=book.page_count
    book.close()
    assert b'ENTITIES' in download('Detail-DXF','.dxf').read_bytes()
    tab('Werkstroom Trap ontwerpen').click()
    chooser=page.locator('#ontwerp-type')
    assert chooser.locator('option').count()==16
    assert not tab('Werkstroom Trappenhuis').count()
    assert not tab('Trappenhuis').count()
    work=page.get_by_role('region',name='Trap ontwerpen',exact=True)
    for kind,field in [('glass','guard'),('cantilever','guard'),('steel','railSide'),('escape','railSide'),('portable','guard'),('ladder','handholds')]:
        chooser.select_option(kind)
        work.wait_for()
        control=page.locator('#well-'+field)
        control.select_option('none')
        enabled=control.locator('option').evaluate_all("(opts)=>opts.find(o=>o.value!=='none').value")
        work.get_by_role('button',name='Onderdelen',exact=True).click()
        rows=work.locator('.stage table tbody tr')
        count=rows.count()
        assert count>4,(kind,count)
        control.select_option(enabled)
        assert rows.count()>count,(kind,enabled,count,rows.count())
        control.select_option('none')
        assert rows.count()==count
    stored=json.loads(download('Opslaan','.oss.json').read_text(encoding='utf-8-sig'))
    assert len(stored['stairwell']['instances'])==6
    assert stored['designSelection']==stored['stairwell']['instances'][-1]['id']
    tab('Werkstroom BIM').click()
    single=download('Ontwerp als IFC4','.ifc').read_bytes()
    assert single.count(b'=IFCSTAIR(')==1
    exported=download('Geheel project als IFC4','.ifc').read_bytes()
    assert b'IFCTRIANGULATEDFACESET' in exported and b'IFCSTYLEDITEM' in exported and b'OSS_Vluchtroute' in exported
    assert exported.count(b'=IFCSTAIR(')==6
    assert not errors,errors
    print(f'Houtdetails: {doc_pages} gemerkte PDF-bladen. Zes complete ontwerpen met wisselbare leuning in dezelfde werkstroom opgeslagen en als IFC4 heropend ({len(exported)} bytes).')

if __name__=='__main__':
    run_handoff(sys.argv[1:],check)
