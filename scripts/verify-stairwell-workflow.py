"""Exercise actual stairwell editing, camera, drawings and downloads in Edge or WebView2.

Pass the Vite URL, or --desktop followed by the executable path. --pdf FILE retains
the final loft drawing PDF. Add --project FILE --pdf FILE to print an unchanged
example separately. Use --building for the entire building and --ifc FILE to
keep its exported IFC. The desktop run uses a fresh isolated user profile.
"""
import csv
import json
import sys
from pathlib import Path
from time import monotonic

import pymupdf
from browser_handoff import run_handoff


def image_change(a, b):
    before, after = pymupdf.Pixmap(a), pymupdf.Pixmap(b)
    assert (before.width, before.height, before.n) == (after.width, after.height, after.n)
    v, w = before.samples, after.samples
    changed, total = 0, 0
    # Exclude the viewport controls, edge text and focus indicator.
    for y in range(before.height // 8, before.height * 7 // 8, 4):
        for x in range(before.width // 8, before.width * 7 // 8, 4):
            i = (y * before.width + x) * before.n
            changed += max(abs(v[i + j] - w[i + j]) for j in range(3)) > 15
            total += 1
    return changed / max(total, 1)

def rendered_change(canvas, initial, action):
    until = monotonic() + 8
    while True:
        difference = image_change(initial, canvas.screenshot())
        if difference > .008 or monotonic() > until:
            break
    assert difference > .008, f'{action}: stationary model, changed {difference:.1%}'
    return difference

def print_project(page, download):
    """Render the actual application print view for an unchanged sample project."""
    project_path = Path(sys.argv[sys.argv.index('--project') + 1]).resolve()
    output = Path(sys.argv[sys.argv.index('--pdf') + 1]).resolve()
    payload = json.loads(project_path.read_text('utf-8-sig'))
    items = payload['stairwell']['instances']
    item = items[0]
    building = '--building' in sys.argv
    page.locator('input[type=file]').set_input_files(str(project_path))
    workspace = page.get_by_role('region', name='Trap ontwerpen')
    workspace.wait_for()
    page.locator('#well-instance').select_option(item['id'])
    if building:
        workspace.get_by_label('Zichtbare componenten').select_option('building')
        workspace.get_by_role('checkbox', name='Vloerranden').check()
        densities = {i['mark']:i['params']['density'] for i in items if i['type']=='concrete'}
        if densities:
            workspace.get_by_role('button',name='Onderdelen',exact=True).click()
            assert workspace.get_by_role('columnheader',name='Betonmassa (kg)').is_visible()
            with download('Onderdelen als CSV','.csv').open(encoding='utf-8-sig', newline='') as stream:
                rows=list(csv.DictReader(stream,delimiter=';'))
            totals={mark:0.0 for mark in densities}
            for row in rows:
                v=row['Nettovolume (m³)']; mass=row['Massa (kg)']
                if row['Materiaal']=='Beton':
                    measured=float(mass.replace(',','.'))
                    assert abs(measured-float(v.replace(',','.'))*densities[row['Component']])<.003
                    totals[row['Component']]+=measured
                else:
                    assert not mass and not v, row['Onderdeel']
            assert all(t>0 for t in totals.values())
            print(f'Checked {len(rows)} CSV records. Concrete masses (kg) per mark: {totals}')
    else:
        workspace.get_by_role('checkbox', name='Vloerranden').uncheck()
    if '--ifc' in sys.argv:
        data = download('Geheel project als IFC4' if page.get_by_role('button',name='Geheel project als IFC4',exact=True).count() else 'Ontwerp als IFC4', '.ifc').read_bytes()
        assert b"FILE_SCHEMA(('IFC4'))" in data and b'IFCBUILDINGSTOREY(' in data
        assert data.count(b'=IFCSTAIR(') == len(items)
        assert all(i['mark'].encode() in data for i in items)
        Path(sys.argv[sys.argv.index('--ifc')+1]).write_bytes(data)
    workspace.get_by_role('button', name='Plattegrond', exact=True).click()
    page.evaluate("window.print = () => { window.stairwellPrintRequested = true; }")
    workspace.get_by_role('button', name='Tekening afdrukken').click()
    page.wait_for_function('window.stairwellPrintRequested === true')
    pdf = page.pdf(print_background=True, prefer_css_page_size=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as doc:
        words = ' '.join(p.get_text() for p in doc)
        terms=[payload['project']['number'],item['mark'],'Bovenaanzicht','Vooraanzicht']
        if item['type']=='loft': terms.extend(['Bedieningsruimte','bewegingsenvelop'])
        if building:
            terms.extend(['gebouw-aanzicht',*[i['mark'] for i in items]])
            levels=sorted({i['storey'] for i in items})
            assert len(doc)==len(levels)+1
            for sheet,level in enumerate(levels,1):
                assert f'bouwlaag {level}' in doc[sheet].get_text().lower()
        else:
            assert len(doc)==1
        for term in terms:
            assert term.lower() in words.lower(), term
        assert all(len(p.get_drawings())>10 for p in doc)
        sheets=len(doc)
    output.write_bytes(pdf)
    print(f'Printed {sheets} page(s) from {project_path.name}: {output.name}')


def check(page, download):
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.on('dialog', lambda dialog: dialog.accept())
    workspace = page.get_by_role('region', name='Trap ontwerpen')
    def button(name):
        return page.get_by_role('button', name=name, exact=True)
    def open_workspace():
        page.get_by_role('tab', name='Werkstroom Trap ontwerpen', exact=True).click()
        page.get_by_role('button', name='Projectopstelling', exact=True).click()
        workspace.wait_for()
    def set_number(key, value):
        inp = page.locator('#well-' + key)
        group=inp.locator('xpath=ancestor::details[1]')
        if group.count() and not group.evaluate('(e)=>e.open'):
            group.locator('summary').click()
        inp.fill(str(value))
        inp.press('Tab')
    open_workspace()
    button('Plaats voorbeeldtrappenhuis met twee bouwlagen').click()
    assert page.locator('#well-instance option').count() == 2
    assert workspace.get_by_label('Zichtbare componenten').input_value() == 'building'
    page.keyboard.press('Control+z')
    button('Plaats voorbeeldtrappenhuis met twee bouwlagen').wait_for()
    page.locator('#ontwerp-type').select_option('concrete')
    set_number('shaft-width', 4200)
    page.locator('#well-layout').select_option('straight')
    page.locator('#well-layout').select_option('return')
    page.get_by_text('Plaatsing en bouwlaag',exact=True).click()
    button('Kopiëren naar volgende bouwlaag').click()
    level = page.locator('#well-place-storey')
    assert level.input_value() == '1'
    page.locator('#ontwerp-type').select_option('spiral')
    set_number('diameter', 2200)
    page.locator('#well-turn').select_option('left')
    set_number('place-rotation', 15)
    page.locator('#ontwerp-type').select_option('loft')
    page.locator('#well-pose').select_option('packed')
    page.keyboard.press('Control+z')
    assert page.locator('#well-pose').input_value() == 'open'
    page.keyboard.press('Control+Shift+z')
    assert page.locator('#well-pose').input_value() == 'packed'
    page.locator('#well-pose').select_option('open')
    set_number('place-storey', 2)
    set_number('level-height', 3000)
    count = page.locator('#well-instance option').count()
    assert count == 4, count
    loft_id = page.locator('#well-instance').input_value()

    workspace.get_by_role('button', name='3D', exact=True).click()
    canvas = workspace.locator('.surface[data-backend]:not([data-backend=""]) canvas')
    canvas.wait_for()
    workspace.get_by_role('checkbox', name='Vloerranden').uncheck()
    workspace.get_by_role('button', name='Passend', exact=True).click()
    page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    initial = canvas.screenshot()
    page.locator('#well-pose').select_option('packed')
    folded = rendered_change(canvas, initial, 'Folding the attic ladder')
    page.locator('#well-pose').select_option('open')
    page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    initial = canvas.screenshot()
    box = canvas.bounding_box()
    x, y = box['x'] + .5 * box['width'], box['y'] + .5 * box['height']
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 105, y - 42, steps=12)
    page.mouse.up()
    difference = rendered_change(canvas, initial, 'Orbiting the stairwell')
    for mode in ['Plattegrond', 'Aanzicht']:
        workspace.get_by_role('button', name=mode, exact=True).click()
        drawing = workspace.locator('.stage svg')
        assert drawing.is_visible() and drawing.locator('path,polygon,polyline,line').count() >= 6

    workspace.get_by_role('button', name='Onderdelen', exact=True).click()
    assert workspace.locator('tbody tr').count() == 52
    page.locator('#well-grip').select_option('with')
    assert workspace.locator('tbody tr').count() == 55
    csv_file = download('Onderdelen als CSV', '.csv')
    with csv_file.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream, delimiter=';'))
    assert len(rows) == 55 and all(r['Bouwlaag'] == '2' for r in rows)
    assert 'shoe-R' in {r['Onderdeel'] for r in rows}
    workspace.get_by_label('Zichtbare componenten').select_option('building')
    assert workspace.locator('tbody tr').count() > 100
    workspace.get_by_label('Zichtbare componenten').select_option('selected')
    page.evaluate("window.print = () => { window.stairwellPrintRequested = true; }")
    button('Tekening afdrukken').click()
    page.wait_for_function('window.stairwellPrintRequested === true')
    pdf = page.pdf(print_background=True, prefer_css_page_size=True)
    with pymupdf.open(stream=pdf, filetype='pdf') as doc:
        words = ' '.join(' '.join(p.get_text().split()) for p in doc)
        assert 1 <= len(doc) <= 3, len(doc)
        assert 'VZ-01' in words and 'Vlizotrap' in words and 'Bedieningsruimte' in words and 'bouwlaag 2' in words.casefold(), words
        assert any(len(p.get_drawings()) > 10 for p in doc)
    if '--pdf' in sys.argv:
        Path(sys.argv[sys.argv.index('--pdf') + 1]).write_bytes(pdf)
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")

    saved = download('Opslaan', '.oss.json')
    payload = json.loads(saved.read_text('utf-8'))
    well = payload['stairwell']
    assert [i['type'] for i in well['instances']] == ['concrete','concrete','spiral','loft']
    assert well['instances'][-1]['id'] == loft_id and well['instances'][-1]['storey'] == 2
    assert well['instances'][1]['storey'] == 1
    assert well['instances'][2]['params']['diameter'] == 2200
    assert well['instances'][2]['rotation'] == 15
    assert well['width'] == 4200 and well['heights']['2'] == 3000
    set_number('freeRun', 1000)
    assert 'obstakel' in workspace.locator('.summary').inner_text()
    page.locator('input[type=file]').set_input_files(str(saved))
    open_workspace()
    page.locator('#well-instance').select_option(loft_id)
    assert page.locator('#well-freeRun').input_value() == '2200'
    assert page.locator('#well-instance option').count() == count
    page.reload()
    open_workspace()
    page.locator('#well-instance').select_option(loft_id)
    assert page.locator('#well-place-storey').input_value() == '2'
    assert page.locator('#well-level-height').input_value() == '3000'

    ifc = download('Geheel project als IFC4' if page.get_by_role('button',name='Geheel project als IFC4',exact=True).count() else 'Ontwerp als IFC4', '.ifc').read_text('utf-8')
    assert "FILE_SCHEMA(('IFC4'))" in ifc
    assert ifc.count('=IFCSTAIR(') >= 3
    for token in ['IFCBUILDINGSTOREY', 'IFCRELAGGREGATES', 'BT-01', 'BT-02', 'SP-01', 'VZ-01']:
        assert token in ifc, token
    assert not errors, errors
    print(f'Checked four placed components, folding ({folded:.1%} of sampled pixels), orbit ({difference:.1%}), two drawings, 55 CSV records, PDF, IFC4, history and project recovery.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], print_project if '--project' in sys.argv else check)
