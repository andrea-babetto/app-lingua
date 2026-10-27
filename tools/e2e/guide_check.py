"""The guide in Profile ("What Glotter can do"): the list, a card, "Try it", in the reader's own language (Italian and English)."""
import asyncio
import os

from playwright.async_api import async_playwright

URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
SH = os.path.join(os.environ.get("SHOTS_DIR", "/tmp/glott-shots"), "guide")
res, errors = [], []


def check(name, ok):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name)


async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
        api = await p.request.new_context()
        tokens = {e: (await (await api.post(f"{API}/auth/login", data={"email": e, "password": PW})).json())["token"]
                  for e in ("giulia@lingua.app", "james@lingua.app")}

        async def open_guide(email):
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            await ctx.add_init_script(f"localStorage.setItem('lingua_token','{tokens[email]}');localStorage.setItem('glott_theme','light');")
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(URL)
            await pg.get_by_test_id("tab-profile").click()
            await pg.get_by_test_id("profile-row-features").click()
            await pg.get_by_test_id("feature-voice-messages").wait_for()
            return pg

        pg = await open_guide("giulia@lingua.app")  # reads the app in Italian
        check("26 functions in the list", await pg.locator('[data-testid^="feature-"]').count() == 26)
        body = await pg.inner_text("body")
        check("in Italian, with the new ones marked", "Cosa sa fare Glotter" in body and "NUOVO" in body.upper())
        await pg.screenshot(path=f"{SH}/list.png")
        await pg.get_by_test_id("feature-original").click()
        card = pg.get_by_test_id("feature-detail-original")
        await card.wait_for()
        text = await pg.inner_text("body")
        check("card names the real buttons", "“Tradotto da …”" in text and "“Mostra l'originale”" in text)
        await pg.screenshot(path=f"{SH}/card.png")
        await pg.get_by_test_id("profile-back").click()
        await pg.get_by_test_id("feature-last-seen").click()
        await pg.get_by_test_id("feature-try").click()
        await pg.wait_for_timeout(500)
        check("Try it opens the Privacy page", "Privacy" in await pg.inner_text("body") and await pg.get_by_test_id("feature-try").count() == 0)

        en = await open_guide("james@lingua.app")  # reads the app in English
        await en.get_by_test_id("feature-voice-messages").click()
        await en.wait_for_timeout(300)
        check("English guide for an English reader", "Translated voice messages" in await en.inner_text("body"))
        await en.screenshot(path=f"{SH}/card-en.png")
        check("no page errors", not errors)
        print(errors)
        await b.close()
    print(f"{sum(res)}/{len(res)}")


asyncio.run(main())
