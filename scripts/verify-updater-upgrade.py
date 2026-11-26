"""Click an offered signed update in an installed Windows application."""
import sys
import time
import winreg

from playwright.sync_api import Error as PlaywrightError
from browser_handoff import run_handoff


def installed_version():
    root = r'Software\Microsoft\Windows\CurrentVersion\Uninstall'
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, root) as uninstall:
        for index in range(winreg.QueryInfoKey(uninstall)[0]):
            try:
                with winreg.OpenKey(uninstall, winreg.EnumKey(uninstall, index)) as entry:
                    if winreg.QueryValueEx(entry, 'DisplayName')[0] == 'Open Stair Studio':
                        return winreg.QueryValueEx(entry, 'DisplayVersion')[0]
            except OSError:
                pass
    return None


def check(page, _download):
    expected = sys.argv[2]
    assert installed_version() != expected, 'The requested version is already installed.'
    button = page.get_by_role('button', name=f'Installeer versie {expected}')
    button.wait_for(timeout=60000)
    button.click()
    end = time.monotonic() + 180
    while time.monotonic() < end:
        if installed_version() == expected:
            print(f'Installed app updated through its own UI to {expected}.')
            return
        try:
            status = page.locator('.titlebar .update-status').inner_text(timeout=1000)
            if 'mislukt' in status.lower():
                raise AssertionError(status)
        except PlaywrightError:
            pass  # The Windows updater closes the old WebView before installing.
        time.sleep(2)
    raise AssertionError(f'Update to {expected} did not complete; installed={installed_version()}')


if __name__ == '__main__':
    run_handoff(['--desktop', sys.argv[1]], check)
