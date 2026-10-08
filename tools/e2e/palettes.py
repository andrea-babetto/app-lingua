import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the repository
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
import asyncio
import base64
from playwright.async_api import async_playwright

CH = CHROMIUM
URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
SH = os.path.join(SHOTS, "pal")

PALETTES = [
    ("1 · Indaco", "243", "75%", "59%"),
    ("2 · Smeraldo", "168", "76%", "33%"),
    ("3 · Azzurro", "205", "85%", "44%"),
    ("4 · Corallo", "12", "80%", "52%"),
    ("5 · Fucsia", "330", "75%", "52%"),
    ("6 · Notte", "222", "62%", "38%"),
]


async def main():
    import os
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, args=["--no-sandbox"])
        api = await p.request.new_context()

        async def login(email):
            r = await api.post(f"{API}/auth/login", data={"email": email, "password": PW})
            d = await r.json()
            return d["token"], d["user"]

        gt, g = await login("giulia@lingua.app")
        jt, j = await login("james@lingua.app")
        H = lambda t: {"Authorization": f"Bearer {t}"}
        chat = await (await api.post(f"{API}/chats/direct/{j['id']}", headers=H(gt))).json()
        script = [
            (gt, "Ciao James! Come stai oggi?"),
            (jt, "Hi Giulia, all good! Did you see the new campaign results?"),
            (gt, "Sì, ottimi! Stasera andiamo a mangiare una pizza fuori? Offro io!"),
            (jt, "Sounds perfect, I'm in 🍕"),
            (jt, "What time works for you?"),
            (gt, "Alle otto davanti al ristorante, ok?"),
        ]
        ids = []
        for who, text in script:
            r = await (await api.post(f"{API}/messages", headers=H(who), data={"chat_id": chat["id"], "text": text})).json()
            ids.append(r["id"])
            await asyncio.sleep(0.15)
        await asyncio.sleep(1.5)
        await api.post(f"{API}/messages/{ids[2]}/react", headers=H(jt), data={"emoji": "❤️"})
        await api.post(f"{API}/messages/{ids[3]}/react", headers=H(gt), data={"emoji": "👍"})
        grp = await (await api.post(f"{API}/chats/group", headers=H(gt), data={"name": "Amazon PPC Team", "member_ids": [j["id"]]})).json()
        await api.post(f"{API}/messages", headers=H(jt), data={"chat_id": grp["id"], "text": "Report ready for review"})
        await asyncio.sleep(1.5)

        for name, h, s, l in PALETTES:
            css = f":root{{--h:{h};--s:{s};--l:{l};}}"
            # sign-in screen
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1.5, is_mobile=True, has_touch=True)
            page = await ctx.new_page()
            await page.goto(URL)
            await page.add_style_tag(content=css)
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"{SH}/{h}_login.png")
            await ctx.close()
            # list + conversation
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1.5, is_mobile=True, has_touch=True)
            await ctx.add_init_script(f"localStorage.setItem('lingua_token','{gt}');localStorage.setItem('glott_theme','light');")
            page = await ctx.new_page()
            await page.goto(URL)
            await page.add_style_tag(content=css)
            await page.wait_for_selector('[data-testid^="sidebar-chat-item-"]', timeout=15000)
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"{SH}/{h}_list.png")
            await page.get_by_test_id(f"sidebar-chat-item-{chat['id']}").click()
            await page.wait_for_selector('[data-testid^="message-bubble-"]', timeout=10000)
            await page.wait_for_timeout(900)
            await page.screenshot(path=f"{SH}/{h}_chat.png")
            await ctx.close()
        await b.close()

    # one sheet to compare them side by side (rendered with the app's own font)
    def img(path):
        return "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode()

    font = base64.b64encode(open(str(ROOT / "frontend/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2"), "rb").read()).decode()
    cols = ""
    for name, h, s, l in PALETTES:
        cols += f'<div class="col"><div class="label"><span class="sw" style="background:hsl({h} {s} {l})"></span>{name}</div>' \
                f'<img src="{img(f"{SH}/{h}_login.png")}"><img src="{img(f"{SH}/{h}_list.png")}"><img src="{img(f"{SH}/{h}_chat.png")}"></div>'
    html = f"""<html><head><style>
    @font-face{{font-family:J;src:url(data:font/woff2;base64,{font});font-weight:200 800}}
    body{{margin:0;background:#eef0f4;font-family:J,sans-serif;padding:28px}}
    .row{{display:flex;gap:18px}} .col{{width:300px;display:flex;flex-direction:column;gap:12px}}
    .col img{{width:300px;border-radius:18px;box-shadow:0 4px 18px rgba(0,0,0,.18)}}
    .label{{font-weight:800;font-size:22px;display:flex;align-items:center;gap:10px;color:#111}}
    .sw{{width:26px;height:26px;border-radius:50%;display:inline-block}}
    h1{{margin:0 0 18px;font-size:30px}}
    </style></head><body><h1>glott — palette del colore</h1><div class="row">{cols}</div></body></html>"""
    open(f"{SH}/sheet.html", "w").write(html)
    ctx = await (await async_playwright().start()).chromium.launch(executable_path=CH, args=["--no-sandbox"])
    page = await (await ctx.new_context(viewport={"width": 2000, "height": 1000})).new_page()
    await page.goto(f"file://{SH}/sheet.html")
    await page.wait_for_timeout(800)
    await page.screenshot(path=f"{SH}/sheet.png", full_page=True)
    await ctx.close()


asyncio.run(main())
