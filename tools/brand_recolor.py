"""Recolours the Glotter brand files from the design handoff with the antracite / ivory / gold palette.
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

LETTERS, GOLD, IVORY, ANTHRACITE, PAPER = "#2b2823", "#f5c745", "#ece6d8", "#3b3832", "#f8f4e9"
MAPS = {  # file -> {old colour: new colour}
    "glotter-logo.svg": {"#1d1a16": LETTERS, "#ffcc1e": GOLD},
    "glotter-logo-su-scuro.svg": {"#ffcc1e": GOLD, "#ffffff": IVORY},
    "mark.svg": {"#1d1a16": LETTERS, "#ffcc1e": GOLD},
    "mark-dark.svg": {"#ffcc1e": GOLD, "#ffffff": IVORY},
    "icon-app.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": GOLD, "#ffffff": PAPER},
    "icon-maskable.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": GOLD, "#ffffff": PAPER},
    "favicon.svg": {"#1d1a16": ANTHRACITE, "#ffcc1e": GOLD, "#ffffff": PAPER},
}


def clean(svg):
    svg = re.sub(r' xmlns:c2pa="[^"]*"', "", svg)
    return re.sub(r"<metadata>.*?</metadata>", "", svg, flags=re.S)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, colours in MAPS.items():
        svg = clean((SRC / name).read_text())
        for old, new in colours.items():
            svg = re.sub(old, new, svg, flags=re.I)
        (OUT / name).write_text(svg)
    for name in ("glotter-logo.svg", "glotter-logo-su-scuro.svg", "icon-app.svg", "mark.svg"):
        shutil.copy(OUT / name, SITE / name)
    print("written", len(MAPS), "files to", OUT)
