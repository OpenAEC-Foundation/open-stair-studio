"""Verify actual Open BIM Suite GPU output, pointer navigation and context recovery in Edge."""
import argparse
import time
from io import BytesIO

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright


def camera(surface):
    return tuple(float(x) for x in surface.get_attribute("data-camera").split(","))


def frame(canvas):
    return Image.open(BytesIO(canvas.screenshot())).convert("RGB")


def check(page, url, force_gl=False):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if
            "Invalid CommandBuffer" in msg.text or "While validating" in msg.text else None)
    if force_gl:
        page.add_init_script("Object.defineProperty(navigator, 'gpu', {value: undefined});")
    page.goto(url)
    surface = page.locator(".surface")
    page.wait_for_function("document.querySelector('.surface')?.dataset.camera.length > 0")
    backend = surface.get_attribute("data-backend")
    assert backend in ("WebGPU", "WebGL2")
    if force_gl:
        assert backend == "WebGL2"

    canvas = surface.locator("canvas")
    home = camera(surface)
    before = frame(canvas)
    assert max(ImageStat.Stat(before).stddev) > 8, "Canvas contains no visible model"
    box = surface.bounding_box()
    x, y = box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.55
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 107, y - 36, steps=7)
    page.mouse.up()
    orbit = camera(surface)
    assert orbit[:4] == home[:4] and orbit[4:] != home[4:]
    assert max(ImageStat.Stat(ImageChops.difference(before, frame(canvas))).mean) > 1
    page.mouse.down(button="middle")
    page.mouse.move(x + 64, y + 4, steps=6)
    page.mouse.up(button="middle")
    pan = camera(surface)
    assert pan[:3] != orbit[:3] and pan[3:] == orbit[3:]
    page.mouse.wheel(0, -140)
    page.wait_for_function("distance => Number(document.querySelector('.surface').dataset.camera.split(',')[3]) < distance", arg=pan[3])
    zoom = camera(surface)
    assert zoom[3] < pan[3] and zoom[:3] != pan[:3]

    page.get_by_role("tab", name="Plattegrond", exact=True).click()
    page.get_by_role("tab", name="3D-model", exact=True).click()
    page.wait_for_function("document.querySelector('.surface')?.dataset.camera.length > 0")
    assert camera(surface) == zoom, "Tab switch reset the camera"

    page.set_viewport_size({"width": 1200, "height": 800})
    page.wait_for_function("const c=document.querySelector('.surface canvas'); c.width===Math.round(c.getBoundingClientRect().width * Math.min(devicePixelRatio, 2))")
    assert camera(surface) == zoom
    assert max(ImageStat.Stat(frame(canvas)).stddev) > 8

    page.get_by_role("button", name="Instellingen", exact=True).click()
    page.get_by_label("Thema", exact=True).select_option("dark")
    page.get_by_label("Werkruimte", exact=True).select_option("dark")
    page.get_by_role("button", name="Gereed", exact=True).click()
    deadline = time.monotonic() + 4
    while frame(canvas).getpixel((4, 4)) != (38, 38, 45):
        assert time.monotonic() < deadline, "Blueprint dark workspace did not reach GPU"
    assert camera(surface) == zoom

    if force_gl:
        canvas.evaluate("""c => {
          const gl = c.getContext('webgl2');
          c.dataset.originalContext = 'true';
          gl.getExtension('WEBGL_lose_context').loseContext();
        }""")
        page.wait_for_function("""document.querySelector('.surface canvas') &&
          !document.querySelector('.surface canvas').dataset.originalContext &&
          document.querySelector('.surface').dataset.backend === 'WebGL2'""")
        assert camera(surface) == zoom, "Context recovery reset the camera"
        assert max(ImageStat.Stat(frame(canvas)).stddev) > 8

    surface.focus()
    page.keyboard.press("f")
    assert camera(surface)[:3] == home[:3]
    assert camera(surface)[4:] == orbit[4:]
    page.keyboard.press("Home")
    assert camera(surface)[4:] == home[4:]
    assert not errors, errors
    print(backend, "pixels, orbit, pan, cursor zoom, tab, resize, fit and camera OK",
          "(including device loss)" if force_gl else "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:5198")
    args = parser.parse_args()
    with sync_playwright() as playwright, playwright.chromium.launch(channel="msedge") as browser:
        for gl_only in [False, True]:
            page = browser.new_page(viewport={"width": 1365, "height": 920})
            check(page, args.url, gl_only)
            page.close()
        page = browser.new_page()
        page.add_init_script("""Object.defineProperty(navigator, 'gpu', {value: undefined});
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
            return kind.includes('webgl') ? null : original.call(this, kind, ...args);
          };""")
        page.goto(args.url)
        page.get_by_role("button", name="Opnieuw openen").wait_for()
        page.get_by_role("tab", name="Plattegrond", exact=True).click()
        assert page.get_by_role("img", name="Trapplattegrond", exact=True).is_visible()
        print("Unavailable GPU reported; 2D workspace usable")
