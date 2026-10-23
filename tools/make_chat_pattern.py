"""Writes the chat background textures to frontend/src/assets/brand/chat-pattern-{light,dark}.svg: a dense tile of small line doodles
(chat, travel, language and famous places from around the world; the idea: people from every country in one chat), like the
wallpaper of the big chat apps, for the light and dark themes. The placement is random but fixed (seeded), so the files are reproducible.
usage: python tools/make_chat_pattern.py"""
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend/src/assets/brand"

# Famous places: each drawing lives in a 48x48 box and is drawn with lines only.
LANDMARKS = {
    "eiffel": "M24 3V8M24 8L19.5 25L15 43M24 8L28.5 25L33 43M20.5 17H27.5M18 27H30M12 43H36M17 37Q24 28 31 37",
    "colosseum": "M3 14Q24 8 45 14M3 14V35Q24 43 45 35V14M9 27V23a2.5 2.5 0 0 1 5 0V27M17.5 28V24a2.5 2.5 0 0 1 5 0V28M26 28V24a2.5 2.5 0 0 1 5 0V28M34.5 27V23a2.5 2.5 0 0 1 5 0V27M9 36V33a2.5 2.5 0 0 1 5 0V36M17.5 38V35a2.5 2.5 0 0 1 5 0V38M26 38V35a2.5 2.5 0 0 1 5 0V38M34.5 36V33a2.5 2.5 0 0 1 5 0V36",
    "liberty": "M13 44V38H33V44M17 38L19 22H27L29 38M24 18.5m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M20 15L17 12M24 14.8V10.5M28 15L31 12M27 22L33 12V8M31 8H35M33 8V4M19 27L16 30",
    "gondola": "M3 30Q8 36 24 36Q40 36 45 26V19M45 19l-3 -3M45 23l-3 -3M45 27l-3 -3M5 43q4 -3 8 0t8 0t8 0t8 0M19 14m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0M19 17V30M19 21L31 37M14 33L19 30",
    "bigben": "M17 44V17H31V44M17 17L24 7L31 17M24 7V3M24 26m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M24 22.5V26L26.5 27.5M21 35V40M27 35V40M13 44H35",
    "taj": "M14 30Q14 16 24 13Q34 16 34 30M24 13V6M10 44V30H38V44M5 44V22M5 22l-2 -3M5 22l2 -3M43 44V22M43 22l-2 -3M43 22l2 -3M20 44V38a4 4 0 0 1 8 0V44",
    "pyramids": "M3 41L21 11L39 41ZM21 11V41M26 41L36 24L46 41M36 24V41M40 11m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "torii": "M5 13Q24 18 43 13M9 20H39M14 15V43M34 15V43M24 17V20",
    "parthenon": "M3 19L24 8L45 19ZM6 23H42M11 23V37M19 23V37M29 23V37M37 23V37M5 41H43M3 45H45",
    "christ": "M24 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M8 19L24 16L40 19M24 16V36M24 36L18 44H30ZM2 44Q14 38 24 41Q34 38 46 44",
    "windmill": "M18 44L21 24H29L32 44ZM21 24L25 18L29 24M25 18L11 6M25 18L39 30M25 18L39 6M25 18L11 30M13 44H37",
    "pagoda": "M24 3V8M14 14Q24 10 34 14M17 14V22M31 14V22M9 22Q24 17 39 22M13 22V32M35 22V32M4 32Q24 26 44 32M8 32V42M40 32V42M4 42H44",
}

# Everyday doodles: each lives in a 24x24 box.
DOODLES = {
    "bubble": "M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
    "globe": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3.5 3.2 3.5 14.8 0 18M12 3c-3.5 3.2-3.5 14.8 0 18",
    "heart": "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z",
    "plane": "M3 11L21 3l-6 18-3-8zM12 13l9-10",
    "smile": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9 10v1M15 10v1M8 14q4 4 8 0",
    "star": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
    "camera": "M3 8h4l2-3h6l2 3h4v11H3zM12 17a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7",
    "music": "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0",
    "suitcase": "M5 8h14v12H5zM9 8V5h6v3M5 13h14",
    "coffee": "M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v3M12 3v3",
    "mail": "M3 6h18v12H3zM3 7l9 7 9-7",
    "mic": "M9 3h6v9a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
    "translate": "M4 5h9M8.5 3v2M6 5c1 4 3 6 6 7M11 5c-1 4-3 6-6 7M13 21l4-10 4 10M14.5 17.5h5",
    "pin": "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5",
    "sun": "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19",
    "cloud": "M7 18a4 4 0 0 1 0-8a5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z",
    "compass": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5L13.5 13.5L8.5 15.5L10.5 10.5z",
    "flag": "M5 21V4M5 4h12l-2 4l2 4H5",
    "bulb": "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 11c.8.6 1 1.2 1 2h5c0-.8.2-1.4 1-2A6 6 0 0 0 12 3z",
    "book": "M3 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3zM21 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z",
    "mark": "M12 2.2a9 9 0 1 0 0 18a9 9 0 1 0 0-18M4.4 15.8L2.4 22.4L9.4 19.6zM12 8.6a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 0 0 0-5.2",
    "gift": "M4 9h16v4H4zM6 13v8h12v-8M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9zM12 9c2-4 6-4 6-1.5S15 9 12 9z",
}
GLYPHS = [(f"d:{n}", d, 24) for n, d in DOODLES.items()] + [(f"l:{n}", LANDMARKS[n], 48) for n in ("eiffel", "colosseum", "torii", "pyramids", "taj", "bigben", "windmill", "liberty")]
GRID, CELL = 6, 46            # GRID x GRID cells of CELL px: one tile repeats every W x H
W = H = GRID * CELL


def tile(colour, opacity):
    rnd = random.Random(11)
    order = []
    while len(order) < GRID * GRID:   # every drawing about equally often, never twice in a row
        batch = GLYPHS[:]
        rnd.shuffle(batch)
        if order and batch[0][0] == order[-1][0]:
            batch.append(batch.pop(0))
        order += batch
    parts = []
    for i in range(GRID * GRID):
        r, c = divmod(i, GRID)
        _, path, box = order[i]
        size = rnd.uniform(25, 31)
        cx = c * CELL + CELL / 2 + rnd.uniform(-7, 7) + (CELL / 2 if r % 2 else 0)
        cy = r * CELL + CELL / 2 + rnd.uniform(-7, 7)
        rot = rnd.uniform(-28, 28)
        for dx in (-W, 0, W):               # copies across the edge so the tile repeats without a seam
            for dy in (-H, 0, H):
                x, y = cx + dx, cy + dy
                if -size < x < W + size and -size < y < H + size:
                    parts.append(f'<g transform="translate({x - size / 2:.1f} {y - size / 2:.1f}) rotate({rot:.0f} {size / 2:.1f} {size / 2:.1f}) scale({size / box:.4f})"><path d="{path}" vector-effect="non-scaling-stroke"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<g opacity="{opacity}" fill="none" stroke="{colour}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{"".join(parts)}</g></svg>')


if __name__ == "__main__":
    (OUT / "chat-pattern-light.svg").write_text(tile("#3b3832", 0.085))
    (OUT / "chat-pattern-dark.svg").write_text(tile("#ece6d8", 0.07))
    print("written to", OUT, "- tile", W, "x", H)
