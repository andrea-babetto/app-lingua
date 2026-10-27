"""The Backup card in /admin: back up now, the copy is listed, and it downloads as a .jsonl.gz file."""
import asyncio
import gzip
import json
import os

from playwright.async_api import async_playwright

URL, API = "http://localhost:3000", "http://127.0.0.1:8001/api"
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
SH = os.path.join(os.environ.get("SHOTS_DIR", "/tmp/glott-shots"), "backup")
res, errors = [], []


def check(name, ok):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name)


async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
        api = await p.request.new_context()
        token = (await (await api.post(f"{API}/auth/login", data={"email": "admin@test.dev", "password": "admin-e2e-pass-123"})).json())["token"]
        ctx = await b.new_context(viewport={"width": 1100, "height": 900}, accept_downloads=True)
        await ctx.add_init_script(f"localStorage.setItem('lingua_token','{token}');localStorage.setItem('glott_theme','light');")
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(f"{URL}/admin")
        card = pg.get_by_test_id("backups-card")
        await card.wait_for(timeout=10000)
        await pg.get_by_test_id("backup-now").click()
        row = pg.locator('[data-testid^="backup-row-"]').first
        await row.wait_for(timeout=10000)
        check("backup listed after 'Back up now'", "/" in await row.inner_text())
        await card.screenshot(path=f"{SH}/card.png")
        async with pg.expect_download() as info:
            await row.get_by_text("Download").click()
        dl = await info.value
        path = os.path.join(SH, dl.suggested_filename)
        await dl.save_as(path)
        lines = gzip.decompress(open(path, "rb").read()).decode().splitlines()
        names = {json.loads(line)["c"] for line in lines if line.strip()}
        check("downloaded copy holds the people and the chats", dl.suggested_filename.startswith("glotter-backup-") and {"users", "chats"} <= names)
        check("no page errors", not errors)
        print(errors)
        await b.close()
    print(f"{sum(res)}/{len(res)}")


asyncio.run(main())
