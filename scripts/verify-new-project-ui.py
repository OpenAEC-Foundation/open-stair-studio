"""Exercise new-project confirmation and draft replacement in Edge or installed WebView2."""
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
    assert page.locator('#nosing').input_value() == '25'
    page.reload()
    assert page.title().startswith('Nieuw trapproject')
    assert page.locator('#nosing').input_value() == '25'
    download('Project opslaan', '.oss.json')
    page.locator('.quick-button[aria-label="Nieuw project"]').click()
    assert not dialog.is_visible()
    assert page.title().startswith('Nieuw trapproject')
    assert not errors, errors
    print('New project: visible confirmation, cancel, reset, draft recovery and saved-project shortcut checked.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], verify)
