"""Verify the real shell with Edge or a built Windows application."""
import sys

from playwright.sync_api import expect
from browser_handoff import run_handoff


def check(page, _download):
    page.wait_for_selector('.project-panel.oa-panel')
    native = page.url.startswith('http://tauri.localhost') or page.url.startswith('https://tauri.localhost')
    if native:
        maximize = page.get_by_role('button', name='Maximaliseren', exact=True)
        maximize.click()
        page.get_by_role('button', name='Vorig formaat', exact=True).click()
        expect(maximize).to_be_visible()
    else:
        expect(page.get_by_role('button', name='Maximaliseren', exact=True)).to_have_count(0)

    appearance = page.get_by_role('button', name='Instellingen', exact=True)
    appearance.click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_label('Thema', exact=True).select_option('high-contrast-dark')
    expect(dialog.get_by_label('Werkruimte', exact=True)).to_be_disabled()
    dialog.get_by_label('Thema', exact=True).select_option('blueprint')
    dialog.get_by_label('Tekstgrootte', exact=True).select_option('large')
    dialog.get_by_label('Werkruimte', exact=True).select_option('dark')
    dialog.get_by_role('button', name='Gereed').click()
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-oa-theme', 'blueprint')
    expect(page.locator('html')).to_have_attribute('data-oa-workspace', 'dark')
    expect(page.locator('html')).to_have_attribute('data-oa-text', 'large')
    page.keyboard.press('Control+,')
    expect(dialog).to_be_visible()
    dialog.get_by_label('Thema', exact=True).select_option('light')
    dialog.get_by_label('Werkruimte', exact=True).select_option('theme')
    dialog.get_by_label('Tekstgrootte', exact=True).select_option('standard')
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)

    for width in ([None] if native else [1440, 1100, 1024]):
        if width:
            page.set_viewport_size({'width': width, 'height': 768})
        panel = page.locator('.project-panel')
        handle = page.get_by_role('separator', name='Breedte projectverkenner')
        original = panel.bounding_box()['width']
        handle.focus()
        page.keyboard.press('ArrowRight')
        assert abs(panel.bounding_box()['width'] - original - 12) < 1
        page.reload()
        expect(handle).to_be_visible()
        assert abs(panel.bounding_box()['width'] - original - 12) < 1
        rect = handle.bounding_box()
        x, y = rect['x'] + 2, rect['y'] + 50
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 36, y, steps=4)
        page.mouse.up()
        assert abs(panel.bounding_box()['width'] - original - 48) < 1
        handle.focus()
        page.keyboard.press('Enter')
        assert abs(panel.bounding_box()['width'] - original) < 1
        right = page.get_by_role('separator', name='Breedte eigenschappenpaneel')
        props = page.locator('.properties-panel')
        old_right = props.bounding_box()['width']
        right.focus()
        page.keyboard.press('ArrowLeft')
        assert abs(props.bounding_box()['width'] - old_right - 12) < 1
        page.keyboard.press('Enter')

        ribbon = page.get_by_role('tablist', name='Werkstromen')
        documents = page.get_by_role('tablist', name='Modelweergaven')
        for strip in [ribbon, documents]:
            strip.locator('[aria-selected="true"]').focus()
            page.keyboard.press('End')
            last = strip.get_by_role('tab').last
            expect(last).to_be_focused()
            expect(last).to_have_attribute('aria-selected', 'true')
            clip = strip.bounding_box()
            tab = last.bounding_box()
            assert tab['x'] >= clip['x'] - 1 and tab['x'] + tab['width'] <= clip['x'] + clip['width'] + 1
            page.keyboard.press('Home')
            expect(strip.get_by_role('tab').first).to_be_focused()
            assert strip.locator('[role=tab][tabindex="0"]').count() == 1

        assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
        assert page.locator('.editor-area').bounding_box()['width'] >= 420
        metrics = page.evaluate("""() => ['.titlebar', '.ribbon-tabs', '.ribbon', '.document-tabs', '.panel-titlebar', '.statusbar']
            .map(s => document.querySelector(s).getBoundingClientRect().height)""")
        assert metrics == [32, 28, 94, 30, 24, 22], metrics
        print(f'Blueprint shell {width or "WebView2"} px: {metrics}, keyboard and pointer OK')
    broken = page.evaluate("""async () => {
        const sprite = new DOMParser().parseFromString(await (await fetch('/blueprint/frame.svg')).text(), 'image/svg+xml');
        return [...document.querySelectorAll('use[href*="blueprint/frame.svg#"]')]
            .map(element => element.getAttribute('href').split('#')[1]).filter(id => !sprite.getElementById(id));
    }""")
    assert broken == [], broken
    page.emulate_media(media='print')
    expect(page.locator('.blueprint-splitter').first).to_be_hidden()
    expect(page.locator('.titlebar')).to_be_hidden()
    page.emulate_media(media='screen')


if __name__ == '__main__':
    run_handoff(sys.argv[1:], check)
