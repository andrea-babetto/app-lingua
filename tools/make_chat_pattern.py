"""Writes the chat background textures to frontend/src/assets/brand/chat-pattern-{light,dark}.svg: a tile of small line drawings
of famous places from around the world (the idea: people from every country in one chat), for the light and dark themes.
usage: python tools/make_chat_pattern.py"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend/src/assets/brand"

# Each drawing lives in a 48x48 box and is drawn with lines only (stroke C, no fill).
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
ORDER = [["eiffel", "colosseum", "liberty", "gondola"], ["bigben", "taj", "pyramids", "torii"], ["parthenon", "christ", "windmill", "pagoda"]]
CELL, ICON = 72, 38           # the grid cell and the size of a drawing
W, H = CELL * 4, CELL * 3     # one tile repeats every W x H
TILT = [[-6, 5, -4, 7], [4, -7, 6, -5], [-5, 6, -7, 4]]


def tile(colour, opacity):
    parts = []
    for row, names in enumerate(ORDER):
        for col, name in enumerate(names):
            x = col * CELL + (CELL - ICON) / 2 + (CELL / 2 if row % 2 else 0)
            y = row * CELL + (CELL - ICON) / 2
            for dx in ((0, -W) if x + ICON > W else (0,)):  # the staggered rows wrap around the edge
                parts.append(f'<g transform="translate({x + dx:.1f} {y:.1f}) rotate({TILT[row][col]} {ICON / 2} {ICON / 2}) scale({ICON / 48:.4f})">'
                             f'<path d="{LANDMARKS[name]}"/></g>')
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="1.5" fill="{colour}" stroke="none"/>' for x, y in [(36, 8), (108, 62), (180, 12), (252, 66), (70, 134), (140, 118), (214, 140), (20, 190), (250, 204)])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<g opacity="{opacity}" fill="none" stroke="{colour}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">{"".join(parts)}{dots}</g></svg>')


if __name__ == "__main__":
    (OUT / "chat-pattern-light.svg").write_text(tile("#3b3832", 0.1))
    (OUT / "chat-pattern-dark.svg").write_text(tile("#ece6d8", 0.09))
    print("written to", OUT, "- tile", W, "x", H)
