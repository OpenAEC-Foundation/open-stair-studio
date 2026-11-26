"""Exercise new-project confirmation and draft replacement in Edge or installed WebView2."""
import json
import sys

from browser_handoff import run_handoff


def verify(page, download):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.locator('#nosing').fill('-20')
    page.locator('#nosing').press('Tab')
    page.get_by_role('tab', name='Werkstroom Start').click()
    page.get_by_role('region', name='Opdrachten').get_by_role('button', name='Nieuw project').click()
    dialog = page.get_by_role('dialog', name='Nieuw project starten?')
    assert dialog.is_visible()
    assert page.locator('#nosing').input_value() == '-20'
    dialog.get_by_role('button', name='Huidig project behouden').click()
    assert not dialog.is_visible()
    assert page.locator('#nosing').input_value() == '-20'
    page.locator('.quick-button[aria-label="Nieuw project"]').click()
    dialog.get_by_role('button', name='Nieuw project starten').click()
    assert not dialog.is_visible()
    assert page.title().startswith('Nieuw trapproject')
    assert not page.locator('#nosing').count()
    assert not page.locator('canvas[aria-label="3D-model van de trap"]').count()
    assert page.get_by_text('0 trappen').count() > 0
    assert page.get_by_role('heading', name='Begin met een traptype').is_visible()
    page.reload()
    assert page.title().startswith('Nieuw trapproject')
    assert not page.locator('#nosing').count()
    saved_file = download('Project opslaan', '.oss.json')
    saved = json.loads(saved_file.read_text('utf-8'))
    assert saved['stairEnabled'] is False and saved['stair'] is None
    page.get_by_role('button', name='Steektrap', exact=False).first.click()
    assert page.locator('#nosing').input_value() == '25'
    assert page.get_by_text('0 trappen').count() == 0
    page.locator('.quick-button[title="Ongedaan maken"]').click()
    assert page.get_by_role('heading', name='Begin met een traptype').is_visible()
    page.locator('.quick-button[title="Opnieuw"]').click()
    assert page.locator('#nosing').input_value() == '25'
    page.on('dialog', lambda prompt: prompt.accept())
    page.locator('input[accept=".json,.oss.json"]').set_input_files(str(saved_file))
    assert page.get_by_role('heading', name='Begin met een traptype').is_visible()
    assert not page.locator('#nosing').count()
    page.get_by_role('button', name='Steektrap', exact=False).first.click()
    page.locator('.quick-button[aria-label="Nieuw project"]').click()
    assert dialog.is_visible()
    dialog.get_by_role('button', name='Nieuw project starten').click()
    assert not page.locator('#nosing').count()
    assert not errors, errors
    print('New project: visible confirmation, cancel, reset, draft recovery and saved-project shortcut checked.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], verify)
