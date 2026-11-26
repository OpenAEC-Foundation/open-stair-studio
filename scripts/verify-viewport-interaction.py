"""Verify the rendered stair through actual mouse input in Edge or the packaged WebView2.

Run with an application URL, or with --desktop followed by the path to the executable.
Requires Playwright, Microsoft Edge and Pillow.
"""
import sys
from io import BytesIO
from time import monotonic

from PIL import Image, ImageChops, ImageFilter

from browser_handoff import run_handoff


def timber_pixels(canvas):
    image = Image.open(BytesIO(canvas.screenshot())).convert('RGB')
    # The keyboard focus ring runs around the canvas in the Blueprint accent colour.
    image = image.crop((4, 4, image.width - 4, image.height - 4))
    red, _, blue = image.split()
    # Wood surfaces are warm. The background, wire edges and construction grid are neutral.
    mask = ImageChops.subtract(red, blue).point(lambda value: 255 if value > 22 else 0)
    # Ignore individual subpixels from HUD text at the edge of the rendered scene.
    return mask.filter(ImageFilter.MinFilter(3))


def area(mask):
    return mask.histogram()[255]


def changed(first, second):
    return area(ImageChops.difference(first, second)) / max(area(ImageChops.lighter(first, second)), 1)


def frame_when(canvas, criterion, reason):
    until = monotonic() + 12
    while monotonic() < until:
        frame = timber_pixels(canvas)
        if criterion(frame):
            return frame
    raise AssertionError(f'{reason}. Last image has {area(frame)} visible timber pixels')


def centre(mask):
    left, top, right, bottom = mask.getbbox()
    return ((left + right) / 2, (top + bottom) / 2)


def drag(page, canvas, button, dx, dy):
    box = canvas.bounding_box()
    x, y = box['x'] + .5 * box['width'], box['y'] + .5 * box['height']
    page.mouse.move(x, y)
    page.mouse.down(button=button)
    page.mouse.move(x + dx, y + dy, steps=12)
    page.mouse.up(button=button)


def check(page, _download):
    errors = []
    # browser_handoff opens the app before calling us. Let its first WASM request
    # finish so that reloading for error capture doesn't abort an in-flight fetch.
    page.locator('.surface[data-backend]:not([data-backend=""]) canvas').wait_for()
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    # Capture initialization errors as well when running via browser_handoff.
    page.reload()
    tab = page.get_by_role('tab', name='3D-model', exact=True)
    canvas = page.locator('.editor-area canvas:visible')
    fit = page.get_by_role('button', name='Passend', exact=True)
    images = []
    families = ['straight', 'quarter_turn', 'landing', 'half_turn', 'quarter_winder', 'half_winder']
    for family in families:
        page.locator('#family').select_option(family)
        tab.click()
        page.locator('.surface[data-backend]:not([data-backend=""]) canvas').wait_for()
        fit.click()
        initial = frame_when(canvas, lambda m: area(m) > 700, f'{family} is empty')
        assert all(changed(other, initial) > .06 for other in images), f'{family} duplicates an earlier shape'
        images.append(initial)
        drag(page, canvas, 'left', 103, -38)
        orbited = frame_when(canvas, lambda m: changed(initial, m) > .13, f'Orbit left {family} stationary')
        # Fit preserves the viewpoint of the upstream camera. Capture its fitted reference after orbit.
        fit.click()
        canvas.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        reference = frame_when(canvas, lambda m: area(m) > 700, 'Orbit fit lost the stair')
        x, y = centre(reference)
        drag(page, canvas, 'middle', 68, 28)
        moved = frame_when(canvas, lambda m: area(m) > 700 and centre(m)[0] > x + 24
                           and centre(m)[1] > y + 8, f'Middle pan failed on {family}')
        page.mouse.wheel(0, -240)
        enlarged = frame_when(canvas, lambda m: area(m) > area(moved) * 1.13, f'Wheel zoom failed on {family}')
        page.keyboard.press('f')
        frame_when(canvas, lambda m: changed(reference, m) < .06, f'F did not refit {family}')
        drag(page, canvas, 'middle', -54, -22)
        frame_when(canvas, lambda m: changed(reference, m) > .13, 'Second pan failed')
        fit.click()
        frame_when(canvas, lambda m: changed(reference, m) < .06, 'Toolbar did not refit the stair')
        if family == 'straight':
            drag(page, canvas, 'middle', -39, 31)
            before_tab_switch = frame_when(canvas, lambda m: changed(reference, m) > .13, 'Tab setup pan failed')
            page.get_by_role('tab', name='Plattegrond', exact=True).click()
            page.get_by_role('img', name='Trapplattegrond').wait_for()
            tab.click()
            frame_when(canvas, lambda m: changed(before_tab_switch, m) < .06, 'Returning from plan reset the camera')
        print(f'{family}: orbit {changed(initial, orbited):.0%} of model pixels, '
              f'pan ({centre(moved)[0] - x:.0f}, {centre(moved)[1] - y:.0f}) px, '
              f'zoom area {area(enlarged) / area(moved):.2f}x, keyboard and toolbar fit.')
    assert not errors, errors


if __name__ == '__main__':
    run_handoff(sys.argv[1:], check)
