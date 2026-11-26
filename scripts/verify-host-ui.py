"""Read the synthetic IFC host in a real desktop WebView2 session."""
import sys
from pathlib import Path
from browser_handoff import run_handoff

fixture=Path(__file__).resolve().parents[1]/'examples'/'testgebouw-trapgat.ifc'

def check(page, _download):
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.get_by_role('tab',name='Werkstroom BIM').click()
    page.locator('#host-ifc-file').set_input_files(fixture)
    page.locator('.bim-view').get_by_text('1 vloer',exact=False).wait_for()
    assert 'Sparingscontour controleren' in page.locator('.bim-view [role=status]').inner_text()
    assert not errors,errors
    print('Desktop: IFC-vloer, sparing en void-relatie ingelezen; planpassing gemeld.')

if __name__=='__main__':
    run_handoff(sys.argv[1:],check)
