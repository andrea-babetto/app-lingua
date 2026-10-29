"""The Glotter brand with the "typing" mark (chosen on 29/10/2026): the speech-bubble "o" of the logo with three yellow dots
inside, the first full and the other two fading, as when someone is typing.
usage: python tools/brand_dots.py  -> writes docs/brand/glotter_v3/assets/*.svg and frontend/src/assets/brand/*.svg
Then run tools/e2e/make_icons.py for the PNG icons."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/brand/design_handoff_glotter/assets/glotter-logo.svg"
OUT = ROOT / "docs/brand/glotter_v3/assets"
APP = ROOT / "frontend/src/assets/brand"
INK, YELLOW = "#1d1a16", "#f7c600"


def dots(cx, cy, r, gap, color):
    """Three dots in a row around (cx, cy): full, 60%, 30%."""
    return "".join(f'<circle cx="{cx + (i - 1) * gap:g}" cy="{cy:g}" r="{r:g}" fill="{color}"{a}/>'
                   for i, a in enumerate(["", ' opacity="0.6"', ' opacity="0.3"']))


def logo(ink=INK, dot=YELLOW):
    svg = re.sub(r"<metadata>.*?</metadata>", "", SRC.read_text(), flags=re.S).replace(' xmlns:c2pa="http://c2pa.org/manifest"', "")
    svg = re.sub(r'<path d="M251\.1 108\.8[^>]*></path>', dots(234.2, 108.8, 8, 19, dot), svg)
    return svg.replace(INK, ink)


def mark(ink, dot, r=1.25, gap=2.95):
    """The bubble alone in a 24x24 box (ring r9, tail bottom-left)."""
    return (f'<circle cx="12" cy="11.2" r="9" fill="none" stroke="{ink}" stroke-width="3.8"/>'
            f'<path d="M4.4 15.8 L2.4 22.4 L9.4 19.6 Z" fill="{ink}" stroke="{ink}" stroke-width="1" stroke-linejoin="round"/>' + dots(12, 11.2, r, gap, dot))


def icon(rx, scale, r=1.25, gap=2.95):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024"{f" rx={chr(34)}{rx}{chr(34)}" if rx else ""} fill="#1a1a1a"/>'
            f'<g transform="translate(512 512) scale({scale}) translate(-11.7 -12)">{mark("#ffffff", YELLOW, r, gap)}</g></svg>')


FILES = {
    "glotter-logo.svg": logo(),
    "glotter-logo-su-scuro.svg": logo("#ffffff"),
    "icon-app.svg": icon(228, 25),
    "icon-maskable.svg": icon(0, 20),
    # the browser tab is tiny: bigger dots so they still show
    "favicon.svg": icon(220, 27, 1.75, 3.6),
    "mark.svg": f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">{mark(INK, YELLOW)}</svg>',
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, svg in FILES.items():
        (OUT / name).write_text(svg)
        if name in ("glotter-logo.svg", "glotter-logo-su-scuro.svg", "icon-app.svg", "mark.svg"):
            (APP / name).write_text(svg)
    print("brand written to", OUT, "and", APP)
