"""Check drawings, calculations and downloads in Edge or the packaged WebView2.

Run with a local app URL, or --desktop target/release/open-stair-studio.exe.
--artifacts DIR retains the original example's flight PDF and IFC.
--all-pdf PATH preserves the separate full five-element print run for visual QA.
"""
import csv
import json
import math
import sys
from pathlib import Path
from time import monotonic

import pymupdf
from browser_handoff import run_handoff


def value(option):
    return Path(sys.argv[sys.argv.index(option) + 1]).resolve() if option in sys.argv else None


def check(page, download):
    samples = Path(__file__).resolve().parents[1] / 'examples'
    artifacts, all_pdf = value('--artifacts'), value('--all-pdf')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda dialog: dialog.accept())
    button = lambda name: page.get_by_role('button', name=name, exact=True)
    work = page.get_by_role('region', name='Prefab werkvoorbereiding')
    host = page.get_by_label('Prefabelement', exact=True)

    def open_project(path):
        page.locator('input[type=file]').set_input_files(str(path))
        page.get_by_role('region', name='Trap ontwerpen').wait_for()
        button('Prefabdetails').click()
        work.wait_for()

    def number_input(key, new_value):
        field = page.locator('#well-' + key)
        box = field.locator('xpath=ancestor::details[1]')
        if box.count() and not box.evaluate('(e) => e.open'):
            box.locator('summary').click()
        field.fill(str(new_value))
        field.press('Tab')
        assert field.input_value() == str(new_value)

    def csv_download(mark, cast):
        with download('Instortstaat CSV', '.csv').open(encoding='utf-8-sig', newline='') as stream:
            rows = list(csv.DictReader(stream, delimiter=';'))
        assert rows and all(r['Trapmerk'] == mark and r['Betonelement'] == cast for r in rows)
        assert len({r['Onderdeel-ID'] for r in rows}) == len(rows)
        for r in rows:
            coord = lambda key: float(r[key].replace(',', '.'))
            segments = json.loads(r.get('Buigsegmenten lokaal (JSON)') or '[]')
            if segments:
                length = sum(math.dist([s['start'][a] for a in 'xyz'], [s['end'][a] for a in 'xyz'])
                             if s['type'] == 'line' else s['radiusMm'] * math.radians(s['angleDeg'])
                             for s in segments)
            else:
                length = math.dist([coord(axis + ' begin mm') for axis in 'XYZ'],
                                   [coord(axis + ' einde mm') for axis in 'XYZ'])
            assert abs(length - coord('Aslengte mm')) < .0025, r
        return rows

    def print_pdf(marks, all_elements=False):
        page.get_by_label('Alle elementen in de PDF').set_checked(all_elements)
        page.evaluate("window.print = () => { window.testPrecastPrinted = true }; window.testPrecastPrinted = false")
        button('Elementblad en berekening als PDF').click()
        page.wait_for_function('window.testPrecastPrinted')
        data = page.pdf(print_background=True, prefer_css_page_size=True)
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            pages = [' '.join(p.get_text().split()) for p in doc]
            for pg in doc:
                assert pg.rect.width > pg.rect.height and pg.rect.width > 800, pg.rect
                assert len(pg.get_text().strip()) > 100, pg.number
            for mark in marks:
                for title in ['Werkplaatsblad', 'Instortdetails', 'Berekening', 'Hijsberekening']:
                    assert any(f'BT-01 / {mark} · {title}' in p for p in pages), (mark, title, pages)
            assert all(any(f'BT-01 / {mark}' in p for mark in marks) for p in pages), 'Continuation without prefab mark'
            for term in ['Staafstaat', 'Doorsnede A', 'Zwaartepunt', 'H-04', 'Deeltoetsen']:
                assert any(term in p for p in pages), term
            assert sum(bool(pg.get_drawings()) for pg in doc) >= len(marks) * 2
            count = len(doc)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        return data, count

    # Import a real 0.7 project, then explicitly upgrade only its active stair.
    open_project(samples / 'trappenhuis-beton.oss.json')
    assert not host.count()
    button('Wapening en instortdelen toevoegen').click()
    host.wait_for()
    assert page.locator('#well-detailing').input_value() == 'engineered'
    assert host.locator('option').count() == 5
    sources = page.locator('#well-instance option').evaluate_all('(options)=>options.map(o=>o.value)')
    page.locator('#well-instance').select_option(sources[1])
    assert page.locator('#well-detailing').input_value() == 'none'
    button('Wapening en instortdelen toevoegen').wait_for()
    page.locator('#well-instance').select_option(sources[0])
    host.wait_for()
    number_input('mainDiameter', 14)
    number_input('useLoad', 5)
    host.select_option('tussenbordes')
    rows = csv_download('BT-01', 'tussenbordes')
    assert all(r['Diameter mm']=='14' for r in rows if 'hoofdstaaf' in r['Soort'])
    button('Berekening').click()
    assert 'gebruik 5 kN/m²' in work.locator('.calc:visible').inner_text()
    saved = download('Opslaan', '.oss.json')
    saved_model = json.loads(saved.read_text(encoding='utf-8'))
    first, second = saved_model['stairwell']['instances']
    assert first['params']['mainDiameter']==14 and first['params']['useLoad']==5
    assert second['params']['detailing']=='none'
    open_project(saved)
    assert page.locator('#well-mainDiameter').input_value()=='14'

    # Deliverables always use the unmodified project with provisional product data.
    sample = samples / 'prefab-wapening.oss.json'
    open_project(sample)
    workspace=page.get_by_role('region',name='Trap ontwerpen')
    workspace.get_by_role('button',name='3D',exact=True).click()
    canvas=workspace.locator('.surface[data-backend]:not([data-backend=""]) canvas')
    canvas.wait_for()
    def image():
        pix=pymupdf.Pixmap(canvas.screenshot())
        return pix.samples[::12]
    before=image()
    workspace.get_by_label('Alleen wapening en instortdelen').check()
    until=monotonic()+10
    while True:
        after=image()
        assert len(before)==len(after)
        changed=sum(abs(a-b)>15 for a,b in zip(before,after))/len(before)
        if changed>.01 or monotonic()>until:
            break
    assert changed>.01, f'Wapeningsweergave verandert slechts {changed:.2%} van de viewport'
    button('Prefabdetails').click()
    host.select_option('vlucht-1')
    button('Werkplaatsblad').click()
    assert work.get_by_role('img',name='Bovenaanzicht wapening en instortdelen').is_visible()
    holder=work.locator('.paper:visible')
    assert 'Dekking 30 mm' in holder.inner_text()
    rows=csv_download('BT-01','vlucht-1')
    assert sum('Hijshuls' in r['Soort'] for r in rows)==4
    assert sum('kopbout' in r['Soort'] for r in rows)==2
    assert sum('moer' in r['Soort'] for r in rows)==2
    assert sum('Aansluitplaat' in r['Soort'] for r in rows)==2
    single, single_pages=print_pdf(['vlucht-1'])
    if artifacts:
        artifacts.mkdir(parents=True, exist_ok=True)
        (artifacts/'prefab-vlucht-werkplaats.pdf').write_bytes(single)
    marks = host.locator('option').evaluate_all('(options)=>options.map(o=>o.value)')
    assert {'onderbordes','bovenbordes','tussenbordes','vlucht-1','vlucht-2'} == set(marks)
    full, all_pages=print_pdf(marks, True)
    assert all_pages >= 3*len(marks) and all_pages <= 6*len(marks), all_pages
    if all_pdf:
        all_pdf.write_bytes(full)
    ifc=download('Ontwerp als IFC4','.ifc').read_bytes()
    for entity in ['IFCREINFORCINGBAR','IFCSTAIRFLIGHT','IFCMECHANICALFASTENER','IFCPLATE','IFCDISCRETEACCESSORY','IFCSLAB']:
        assert ('='+entity+'(').encode() in ifc, entity
    if artifacts:
        (artifacts/'prefab-wapening.ifc').write_bytes(ifc)
    assert not errors, errors
    print(f'Checked 0.7 opt-in, host selection, 3D reinforcement ({changed:.1%} of samples), diameter/load edits, CSV {len(rows)} positions, save/reopen, '
          f'{single_pages} flight PDF sheets, {all_pages} sheets for {len(marks)} elements, IFC {len(ifc)} bytes.')


if __name__=='__main__':
    run_handoff(sys.argv[1:],check)
