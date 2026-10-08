"""Render the app icons: the full name "glott" in the brand font on the brand colour.
usage: make_icons.py H S L   (e.g. 243 75 59)  -> writes frontend/public/{icon-192,icon-512,apple-touch-icon}.png and favicon.svg
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the repository
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

import base64, subprocess, sys, os
from PIL import Image

H, S, L = sys.argv[1:4]
CH = CHROMIUM
FONT = str(ROOT / "frontend/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2")
OUT = str(ROOT / "frontend/public")
TMP = os.path.join(SHOTS, "icons")
os.makedirs(TMP, exist_ok=True)
font = base64.b64encode(open(FONT, "rb").read()).decode()
bg = f"hsl({H} {S}% {L}%)"

def page(n):
    # the word spans ~72% of the icon: inside the safe zone that phones use to round or crop icons
    return f"""<html><head><style>
    @font-face{{font-family:J;src:url(data:font/woff2;base64,{font});font-weight:200 800}}
    html,body{{margin:0;width:{n}px;height:{n}px;background:{bg};overflow:hidden}}
    .w{{width:{n}px;height:{n}px;display:flex;align-items:center;justify-content:center;
        font-family:J;font-weight:800;color:#fff;font-size:{n*0.30}px;letter-spacing:-{n*0.012}px;
        padding-bottom:{n*0.045}px;box-sizing:border-box}}
    </style></head><body><div class="w">glott</div></body></html>"""

for n, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
    f = f"{TMP}/word-{n}.html"
    open(f, "w").write(page(n))
    raw = f"{TMP}/word-raw-{n}.png"
    subprocess.run([CH, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", f"--window-size={n},{n+200}",
                    f"--screenshot={raw}", f"file://{f}"], check=True, capture_output=True)
    Image.open(raw).convert("RGB").crop((0, 0, n, n)).save(f"{OUT}/{name}", optimize=True)

# the tiny browser-tab icon keeps the single letter (a whole word is unreadable at 16 px)
g = ('<g fill="none" stroke="#fff" stroke-width="60" stroke-linecap="round" stroke-linejoin="round" '
     'transform="translate(256 256) scale(1.12) translate(-232 -273)"><circle cx="232" cy="226" r="92"/>'
     '<path d="M324 226 V320 A92 92 0 0 1 152.3 366.3"/></g>')
open(f"{OUT}/favicon.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{bg}"/>{g}</svg>')
print("icons written for", bg)
