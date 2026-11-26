"""Exercise per-cast settings, shop drawings, bar schedule and IFC in Edge or WebView2.

Pass a Vite URL or --desktop followed by the executable. --examples preserves
the unchanged study's full PDF, first flight PDF and exported IFC.
"""
import csv
import json
import math
import sys
from pathlib import Path

import pymupdf
from browser_handoff import run_handoff


def check(page, download):
    examples = Path(__file__).resolve().parents[1] / 'examples'
    work = page.get_by_role('region', name='Prefab werkvoorbereiding')
    cast = page.get_by_label('Prefabelement', exact=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    button = lambda name: page.get_by_role('button', name=name, exact=True)

    def open_project(path):
        page.locator('input[type=file]').set_input_files(str(path))
        button('Prefabdetails').click()
        cast.wait_for()

    def angle(value):
        field = page.locator('#plan-slingAngle')
        field.fill(str(value))
        field.press('Tab')
        assert field.input_value() == str(value)

    def print_set(all_elements):
        page.get_by_label('Alle elementen in de PDF').set_checked(all_elements)
        page.evaluate("window.print=()=>{window.didPrint=true};window.didPrint=false")
        button('Elementblad en berekening als PDF').click()
        page.wait_for_function('window.didPrint')
        pdf = page.pdf(prefer_css_page_size=True, print_background=True)
        with pymupdf.open(stream=pdf, filetype='pdf') as doc:
            texts = [' '.join(p.get_text().split()) for p in doc]
            assert all('BT-01 / ' in t and 'revisie A' in t for t in texts), [(i+1,t[:110]) for i,t in enumerate(texts) if 'BT-01 / ' not in t]
            assert any('Bijlegwapening' in t and 'Plaatsing en buigstaat' in t for t in texts)
            assert any('Elementhijsplan' in t and 'Hijspositie' in t for t in texts)
            assert sum('· Elementhijsplan' in t for t in texts) == (5 if all_elements else 1)
            assert sum('ingestelde vrije modelafstand 2 mm' in t for t in texts) == (15 if all_elements else 3)
            assert any('LH-01' in t and 'H-01' in t for t in texts)
            if all_elements:
                assert any('Studie H-03' in t and 'tussenbordes · Elementhijsplan' in t for t in texts)
            count=len(doc)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        return pdf,count

    page.get_by_role('tab',name='Werkstroom Trap ontwerpen',exact=True).click()
    button('Projectopstelling').click()
    button('Plaats prefabvoorbeeld met bijlegwapening en hijsplannen').click()
    cast.wait_for()
    assert cast.locator('option').count()==5
    open_project(examples/'prefab-wapening.oss.json')
    button('Bijlegwapening').click()
    button('Bijlegwapening toevoegen').click()
    assert work.locator('.local-sheet:visible').count() >= 3
    button('Elementhijsplan').click()
    angle(19)
    cast.select_option('tussenbordes')
    assert page.locator('#plan-slingAngle').input_value() == '30'
    angle(39)
    cast.select_option('vlucht-1')
    assert page.locator('#plan-slingAngle').input_value() == '19'
    saved=download('Opslaan','.oss.json')
    stored=json.loads(saved.read_text(encoding='utf-8-sig'))
    plans=stored['stairwell']['instances'][0]['liftPlans']
    assert plans=={'vlucht-1':{'slingAngle':19},'tussenbordes':{'slingAngle':39}}
    open_project(saved)
    button('Elementhijsplan').click()
    cast.select_option('tussenbordes')
    assert page.locator('#plan-slingAngle').input_value()=='39'
    button('Alle trapwaarden overnemen').click()
    assert page.locator('#plan-slingAngle').input_value()=='30'
    page.keyboard.press('Control+z')
    assert page.locator('#plan-slingAngle').input_value()=='39'
    page.keyboard.press('Control+y')
    assert page.locator('#plan-slingAngle').input_value()=='30'
    cast.select_option('vlucht-1')
    assert page.locator('#plan-slingAngle').input_value()=='19'
    open_project(examples/'prefab-elementhijsplannen.oss.json')
    button('Elementhijsplan').click()
    cast.select_option('tussenbordes')
    assert page.locator('#plan-liftLayout').input_value()=='fixed'
    assert [page.locator('#plan-'+key).input_value() for key in ['liftStationAX','liftStationBX','liftStationY']]==['391','1073','296']
    button('Werkplaatsblad').click()
    cast.select_option('vlucht-1')
    with download('Instortstaat CSV','.csv').open(encoding='utf-8-sig',newline='') as fp:
        rows=list(csv.DictReader(fp,delimiter=';'))
    bent=[r for r in rows if r['Bij voorziening']]
    assert len(bent)==10 and len({r['Onderdeel-ID'] for r in rows})==len(rows)
    for r in bent:
        segments=json.loads(r['Buigsegmenten lokaal (JSON)'])
        total=sum(s['lengthMm'] if s['type']=='line' else s['radiusMm']*math.radians(s['angleDeg']) for s in segments)
        assert abs(total-float(r['Aslengte mm'].replace(',','.')))<.002
    one,n=print_set(False)
    full,m=print_set(True)
    assert (n,m)==(8,40), (n,m)
    content=download('Ontwerp als IFC4','.ifc').read_bytes()
    assert b'OSS_Elementhijsplan' in content and b'IFCRELASSIGNSTOPRODUCT' in content and b'OSS_Bijlegzone' in content
    assert content.count(b'=IFCREINFORCINGBAR(')==257
    if '--examples' in sys.argv:
        (examples/'prefab-elementhijsplannen.ifc').write_bytes(content)
        (examples/'prefab-elementhijsplannen.pdf').write_bytes(full)
        (examples/'prefab-bijlegwapening-vlucht.pdf').write_bytes(one)
    assert not errors, errors
    print(f'Elementplannen bewaren en herstellen, terugval per merk, {len(bent)} buigstaten op vlucht 1, {n}/{m} PDF-bladen en 257 IFC-staven gecontroleerd.')


if __name__=='__main__':
    run_handoff(sys.argv[1:],check)
