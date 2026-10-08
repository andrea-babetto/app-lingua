import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the repository
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
import asyncio
from playwright.async_api import async_playwright

CH = CHROMIUM
URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
SH = os.path.join(SHOTS, "kb")


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
        for i in range(14):
            await api.post(f"{API}/messages", headers=H(jt if i % 2 else gt), data={"chat_id": chat["id"], "text": f"Message number {i} in this conversation"})
        await asyncio.sleep(2)

        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script(f"localStorage.setItem('lingua_token','{gt}');localStorage.setItem('glott_theme','light');")
        page = await ctx.new_page()
        await page.goto(URL)
        await page.get_by_test_id(f"sidebar-chat-item-{chat['id']}").click()
        await page.wait_for_selector('[data-testid^="message-bubble-"]')
        await page.wait_for_timeout(900)

        header = page.locator("header:visible").first
        async def top(): return (await header.bounding_box())["y"]
        async def input_bottom():
            bb = await page.get_by_test_id("message-input").bounding_box()
            return bb["y"] + bb["height"]

        print("before keyboard: header top", await top(), "| app-height", await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--app-height')"))
        await page.get_by_test_id("message-input").focus()
        await page.set_viewport_size({"width": 390, "height": 520})   # what is left above the keyboard
        await page.wait_for_timeout(700)
        h_top = await top()
        ib = await input_bottom()
        print("keyboard open: header top", h_top, "| input bottom", ib, "(visible height 520)",
              "| app-height", await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--app-height')"))
        print("page scrolled:", await page.evaluate("window.scrollY"))
        last = page.locator('[data-testid^="message-bubble-"]').last
        lb = await last.bounding_box()
        print("last message bottom", lb["y"] + lb["height"], "(should be above the input)")
        await page.screenshot(path=f"{SH}/keyboard.png")
        print("RESULT:", "ok" if h_top == 0 and ib <= 521 and (lb["y"] + lb["height"]) < ib else "PROBLEM")
        await b.close()


asyncio.run(main())
