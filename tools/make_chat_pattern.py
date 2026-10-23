"""Writes the chat background textures (a tile of small Glotter marks, speech bubbles and dots) for the light and dark themes
to frontend/src/assets/brand/chat-pattern-{light,dark}.svg. usage: python tools/make_chat_pattern.py"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend/src/assets/brand"
SIZE = 160  # the tile is SIZE x SIZE and repeats

MARK = ('<circle cx="12" cy="11.2" r="9" fill="none" stroke="C" stroke-width="2.4"/>'
        '<path d="M4.4 15.8 L2.4 22.4 L9.4 19.6 Z" fill="C" stroke="C" stroke-width="1" stroke-linejoin="round"/>'
        '<circle cx="12" cy="11.2" r="2.2" fill="C"/>')
BUBBLE = '<path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="C" stroke-width="2.2" stroke-linejoin="round"/>'
ARROWS = '<path d="M4 9h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" fill="none" stroke="C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
GLOBE = '<circle cx="12" cy="12" r="9" fill="none" stroke="C" stroke-width="2.2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="C" stroke-width="2"/>'
# (glyph, x, y, size, rotation)
PLACE = [(MARK, 10, 12, 26, -12), (BUBBLE, 84, 8, 24, 8), (ARROWS, 120, 66, 22, -6), (GLOBE, 38, 78, 24, 10),
         (MARK, 96, 112, 20, 14), (BUBBLE, 8, 126, 20, -10)]
DOTS = [(62, 52), (140, 30), (70, 138), (150, 120), (22, 62), (112, 92)]


def tile(colour, opacity):
    g = "".join(f'<g transform="translate({x} {y}) rotate({r} {s / 2} {s / 2}) scale({s / 24})">{glyph.replace("C", colour)}</g>' for glyph, x, y, s, r in PLACE)
    d = "".join(f'<circle cx="{x}" cy="{y}" r="1.6" fill="{colour}"/>' for x, y in DOTS)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}"><g opacity="{opacity}">{g}{d}</g></svg>'


if __name__ == "__main__":
    (OUT / "chat-pattern-light.svg").write_text(tile("#3b3832", 0.07))
    (OUT / "chat-pattern-dark.svg").write_text(tile("#ece6d8", 0.065))
    print("written to", OUT)
