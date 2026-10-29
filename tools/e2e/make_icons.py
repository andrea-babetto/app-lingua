"""Render the app icons from the Glotter brand files (docs/brand/glotter_v3/assets, made by tools/brand_dots.py).
usage: make_icons.py  -> writes frontend/public/{icon-192,icon-512,icon-1024,icon-maskable-512,apple-touch-icon}.png and favicon.svg
"""
import base64
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]  # the repository
ASSETS = ROOT / "docs/brand/glotter_v3/assets"
PUBLIC = ROOT / "frontend/public"
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")


def clean(name):
    """The SVG without the provenance metadata block (it only adds weight)."""
    svg = (ASSETS / name).read_text()
    return re.sub(r"<metadata>.*?</metadata>", "", re.sub(r' xmlns:c2pa="[^"]*"', "", svg), flags=re.S)


JOBS = [("icon-app.svg", "icon-192.png", 192), ("icon-app.svg", "icon-512.png", 512), ("icon-app.svg", "icon-1024.png", 1024),
        ("icon-maskable.svg", "icon-maskable-512.png", 512), ("icon-maskable.svg", "apple-touch-icon.png", 180)]

if __name__ == "__main__":
    (PUBLIC / "favicon.svg").write_text(clean("favicon.svg"))
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM)
        for svg, out, size in JOBS:
            page = browser.new_page(viewport={"width": size, "height": size})
            data = base64.b64encode(clean(svg).encode()).decode()
            page.set_content(f'<style>html,body{{margin:0}}</style><img src="data:image/svg+xml;base64,{data}" width="{size}" height="{size}">')
            page.screenshot(path=str(PUBLIC / out), omit_background=True)
            page.close()
        browser.close()
    print("icons written to", PUBLIC)
