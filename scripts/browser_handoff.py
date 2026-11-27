"""Exercise the same downloaded files from Edge or a clean Tauri WebView2 profile."""
import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright


def download_button(page, target):
    return page.get_by_role('button', name=target, exact=True) if isinstance(target, str) else target


def edge(p, url, folder, check):
    with p.chromium.launch(channel='msedge') as browser:
        page = browser.new_page(viewport={'width': 1440, 'height': 920})
        page.goto(url)
        def download(label, ext):
            with page.expect_download() as event:
                download_button(page, label).click()
            name = event.value.suggested_filename
            assert name.endswith(ext)
            event.value.save_as(folder / name)
            return folder / name
        check(page, download)


def desktop(p, exe, folder, check):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    url = f'http://127.0.0.1:{port}'
    env = dict(os.environ, WEBVIEW2_USER_DATA_FOLDER=str(folder / 'webview'),
               WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f'--remote-debugging-port={port} --remote-debugging-address=127.0.0.1')
    proc = subprocess.Popen([str(Path(exe).resolve())], env=env, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(url + '/json/list', timeout=1) as response:
                    if json.load(response):
                        break
            except OSError:
                pass
            time.sleep(.2)
        browser = p.chromium.connect_over_cdp(url)
        page = browser.contexts[0].pages[0]
        page.wait_for_url('**/tauri.localhost/**')
        session = browser.new_browser_cdp_session()
        session.send('Browser.setDownloadBehavior', dict(behavior='allow', downloadPath=str(folder)))
        def download(label, ext):
            before = set(folder.glob('*' + ext))
            download_button(page, label).click()
            for _ in range(150):
                files = set(folder.glob('*' + ext)) - before
                if files:
                    return files.pop()
                time.sleep(.1)
            raise AssertionError(f'Missing {ext} after {label}')
        check(page, download)
    finally:
        proc.terminate()
        proc.wait(15)


def run_handoff(arguments, check):
    with TemporaryDirectory(ignore_cleanup_errors=True) as tmp, sync_playwright() as playwright:
        if arguments[0] == '--desktop':
            desktop(playwright, arguments[1], Path(tmp), check)
        else:
            edge(playwright, arguments[0], Path(tmp), check)
