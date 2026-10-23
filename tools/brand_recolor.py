"""Recolours the Glotter brand files from the design handoff with the antracite / ivory / sage-green palette.
usage: python tools/brand_recolor.py
Reads docs/brand/design_handoff_glotter/assets/*.svg (left untouched), writes docs/brand/glotter_v2/assets/*.svg
and copies the files the site imports into frontend/src/assets/brand/."""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/brand/design_handoff_glotter/assets"
OUT = ROOT / "docs/brand/glotter_v2/assets"
SITE = ROOT / "frontend/src/assets/brand"

LETTERS, SAGE, SAGE_LIGHT, IVORY, ANTHRACITE, PAPER = "#2b2823", "#7da36f", "#a9c9a0", "#ece6d8", "#3b3832", "#f8f4e9"  # SAGE on light, SAGE_LIGHT on dark
MAPS = {  # file -> {old colour: new colour}
    "glotter-logo.svg": {"#1d1a16": LETTERS, "#ffcc1e": SAGE},
    "glotter-logo-su-scuro.svg": {"#ffffff": IVORY},  # the ring and the tail become ivory too, only the dot is green (see DOT_DARK)
    "mark.svg": {"#1d1a16": LETTERS, "#ffcc1e": SAGE},
    "mark-dark.svg": {"#ffffff": SAGE_LIGHT, "#ffcc1e": IVORY},  # ring and tail ivory, dot green
    "icon-app.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": SAGE_LIGHT, "#ffffff": PAPER},
    "icon-maskable.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": SAGE_LIGHT, "#ffffff": PAPER},
    "favicon.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": SAGE_LIGHT, "#ffffff": PAPER},
}


def dark_logo(svg):
    """On dark: letters, ring and tail ivory, only the dot green (like the light logo, where only the dot is coloured)."""
    svg = re.sub(r'(<path d="M251\.1 108\.8[^>]*?)fill="#ffcc1e"', r'\1fill="%s"' % SAGE_LIGHT, svg)
    return re.sub("#ffcc1e", IVORY, svg, flags=re.I)


def clean(svg):
    svg = re.sub(r' xmlns:c2pa="[^"]*"', "", svg)
    return re.sub(r"<metadata>.*?</metadata>", "", svg, flags=re.S)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, colours in MAPS.items():
        svg = clean((SRC / name).read_text())
        if name == "glotter-logo-su-scuro.svg":
            svg = dark_logo(svg)
        for old, new in colours.items():
            svg = re.sub(old, new, svg, flags=re.I)
        (OUT / name).write_text(svg)
    for name in ("glotter-logo.svg", "glotter-logo-su-scuro.svg", "icon-app.svg", "mark.svg"):
        shutil.copy(OUT / name, SITE / name)
    print("written", len(MAPS), "files to", OUT)
