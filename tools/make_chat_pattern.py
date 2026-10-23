"""Writes the chat background textures to frontend/src/assets/brand/chat-pattern-{light,dark}.svg: a dense tile of small line icons
(chat, languages, travel, food, music, famous places...), like the wallpaper of the big chat apps, for the light and dark themes.
The icons are the Lucide ones the site already uses (ISC licence, read from frontend/node_modules/lucide-react), so they all share one
careful drawing style; the Glotter mark is drawn here. The placement is random but fixed (seeded), so the files are reproducible.
usage: cd frontend && yarn install, then: python tools/make_chat_pattern.py"""
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/src/assets/brand"
LUCIDE = ROOT / "frontend/node_modules/lucide-react/dist/esm/icons"

NAMES = [
    # chat and languages
    "message-circle", "languages", "globe", "earth", "send", "mic", "mail", "smile", "heart", "hand-heart", "handshake", "message-square-text",
    # travel and places
    "plane", "luggage", "backpack", "map-pin", "compass", "flag", "landmark", "castle", "church", "tent", "mountain-snow", "tree-palm",
    "sailboat", "ship", "train-front", "bike", "umbrella", "anchor", "shell", "sun",
    # everyday life
    "coffee", "pizza", "ice-cream-cone", "cake", "wine", "gift", "camera", "music", "guitar", "headphones", "book-open", "lightbulb", "palette", "sparkles", "star", "rocket",
]
MARK = ('<circle cx="12" cy="11.2" r="9"/><path d="M4.4 15.8L2.4 22.4L9.4 19.6z"/><circle cx="12" cy="11.2" r="2.4"/>')  # the Glotter mark
GRID, CELL = 9, 34             # GRID x GRID cells of CELL px: one tile repeats every W x H
W = H = GRID * CELL


def lucide(name):
    """The drawing of a Lucide icon as SVG elements (24x24 box)."""
    src = (LUCIDE / f"{name}.js").read_text()
    node = re.search(r"__iconNode = (\[.*?\n\]);", src, re.S).group(1)
    out = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{(.*?)\}\s*\]', node, re.S):
        pairs = [(k, v) for k, v in re.findall(r'(\w+): "([^"]*)"', attrs) if k != "key"]
        out.append(f"<{tag} " + " ".join(f'{k}="{v}"' for k, v in pairs) + "/>")
    return "".join(out)


def tile(colour, opacity):
    rnd = random.Random(5)
    icons = [lucide(n) for n in NAMES] + [MARK]
    order = icons[:]
    rnd.shuffle(order)
    while len(order) < GRID * GRID:   # a few extra slots: repeat some drawings
        order.append(rnd.choice(icons))
    parts = []
    for i in range(GRID * GRID):
        r, c = divmod(i, GRID)
        size = rnd.uniform(21, 26)
        cx = c * CELL + CELL / 2 + rnd.uniform(-5, 5) + (CELL / 2 if r % 2 else 0)
        cy = r * CELL + CELL / 2 + rnd.uniform(-5, 5)
        rot = rnd.uniform(-22, 22)
        for dx in (-W, 0, W):               # copies across the edge so the tile repeats without a seam
            for dy in (-H, 0, H):
                x, y = cx + dx, cy + dy
                if -size < x < W + size and -size < y < H + size:
                    parts.append(f'<g transform="translate({x - size / 2:.1f} {y - size / 2:.1f}) rotate({rot:.0f} {size / 2:.1f} {size / 2:.1f}) scale({size / 24:.4f})">{order[i]}</g>')
    body = "".join(parts).replace("/>", ' vector-effect="non-scaling-stroke"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<g opacity="{opacity}" fill="none" stroke="{colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>')


if __name__ == "__main__":
    (OUT / "chat-pattern-light.svg").write_text(tile("#3b3832", 0.1))
    (OUT / "chat-pattern-dark.svg").write_text(tile("#ece6d8", 0.085))
    print("written to", OUT, "- tile", W, "x", H)
