"""Check the installed desktop updater against the published latest.json."""
import sys
from browser_handoff import run_handoff


def check(page, _download):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    control = page.get_by_role('button', name='Controleer op updates')
    control.wait_for()
    status = page.locator('.titlebar .update-status')
    status.get_by_text('Je gebruikt de nieuwste versie').wait_for(timeout=30000)
    assert not errors, errors
    print('Installed app: update endpoint reachable; current release recognized.')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], check)
