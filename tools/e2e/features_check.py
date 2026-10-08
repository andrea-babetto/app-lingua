import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the repository
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
import asyncio
from playwright.async_api import async_playwright

CH = CHROMIUM
URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
SH = os.path.join(SHOTS, "feat")
ICON = str(ROOT / "frontend/public/icon-512.png")
errors, results = [], []


def check(name, ok):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name)


async def main():
    import os
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, args=["--no-sandbox"])
        api = await p.request.new_context()

        async def login(email, pw=PW):
            r = await api.post(f"{API}/auth/login", data={"email": email, "password": pw})
            d = await r.json()
            return d["token"], d["user"]

        gt, g = await login("giulia@lingua.app")
        jt, j = await login("james@lingua.app")
        H = lambda t: {"Authorization": f"Bearer {t}"}
        chat = await (await api.post(f"{API}/chats/direct/{j['id']}", headers=H(gt))).json()
        cid = chat["id"]

        async def say(t, who, text):
            return await (await api.post(f"{API}/messages", headers=H(t), data={"chat_id": cid, "text": text})).json()

        await say(jt, jt, "Hello Giulia, how is the campaign?")
        mine = await say(gt, gt, "Tutto bene, grazie!")
        icon = open(ICON, "rb").read()
        up = await (await api.post(f"{API}/upload", headers=H(jt), multipart={"file": {"name": "photo.png", "mimeType": "image/png", "buffer": icon}})).json()
        await api.post(f"{API}/messages", headers=H(jt), data={"chat_id": cid, "text": "", "attachment": up})
        await asyncio.sleep(1.5)

        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script(f"localStorage.setItem('lingua_token','{gt}');localStorage.setItem('glott_theme','light');"
                                  "window.__sockets=[];const _WS=window.WebSocket;window.WebSocket=function(u,p){const s=new _WS(u,p);window.__sockets.push(s);return s};"
                                  "window.WebSocket.prototype=_WS.prototype;Object.assign(window.WebSocket,{OPEN:1,CLOSED:3,CONNECTING:0,CLOSING:2});")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
        await page.goto(URL)
        await page.get_by_test_id(f"sidebar-chat-item-{cid}").click()
        await page.wait_for_selector('[data-testid^="message-bubble-"]', timeout=10000)
        await page.wait_for_timeout(800)

        # 1. tap a message -> actions sheet -> react
        await page.get_by_test_id(f"message-bubble-{mine['id']}").locator("[role=button]").first.click()
        await page.get_by_test_id("message-actions").wait_for()
        await page.screenshot(path=f"{SH}/actions.png")
        check("tap opens the actions sheet", await page.get_by_test_id("message-actions").is_visible())
        await page.get_by_test_id("react-👍").click()
        await page.wait_for_timeout(600)
        check("reaction chip appears", await page.get_by_test_id("reaction-👍").count() == 1)

        # 2. edit my message
        await page.get_by_test_id(f"message-bubble-{mine['id']}").locator("[role=button]").first.click()
        await page.get_by_test_id("action-edit").click()
        ta = page.get_by_test_id("message-input")
        check("edit fills the input", (await ta.input_value()) == "Tutto bene, grazie!")
        await ta.fill("Tutto bene, grazie mille!")
        await page.get_by_test_id("send-message-button").click()
        await page.wait_for_timeout(1500)
        bubble = page.get_by_test_id(f"message-bubble-{mine['id']}")
        txt = await bubble.inner_text()
        check("edited text and label shown", "grazie mille" in txt and "modificato" in txt)  # Giulia reads the app in Italian

        # 3. draft survives leaving and coming back
        await ta.fill("unsent draft")
        await page.get_by_test_id("mobile-back-button").click()
        await page.get_by_test_id(f"sidebar-chat-item-{cid}").click()
        await page.wait_for_selector('[data-testid^="message-bubble-"]')
        check("draft restored", (await page.get_by_test_id("message-input").input_value()) == "unsent draft")
        await page.get_by_test_id("message-input").fill("")

        # 4. lightbox
        img = page.locator('[data-testid^="message-bubble-"] img[alt="photo.png"]').first
        await img.click()
        await page.wait_for_timeout(300)
        check("image opens full screen", await page.get_by_test_id("lightbox").count() == 1)
        await page.screenshot(path=f"{SH}/lightbox.png")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        check("lightbox closes", await page.get_by_test_id("lightbox").count() == 0)

        # 5. scrolled up + new message -> "go to latest" button with a counter
        for i in range(25):
            await say(jt, jt, f"filler message number {i}")
        await page.wait_for_timeout(1500)
        await page.evaluate("document.querySelector('.chat-wallpaper').scrollTo(0, 0)")
        await page.wait_for_timeout(400)
        check("scroll-to-bottom button shows when scrolled up", await page.get_by_test_id("scroll-to-bottom").count() == 1)
        await say(jt, jt, "a brand new message while you scroll")
        await page.wait_for_timeout(1200)
        badge = await page.get_by_test_id("scroll-to-bottom").inner_text()
        print("badge text:", repr(badge))
        check("button counts new messages", badge.strip() == "1")
        await page.get_by_test_id("scroll-to-bottom").click()
        await page.wait_for_timeout(900)
        check("button jumps to the latest", await page.get_by_test_id("scroll-to-bottom").count() == 0)

        # 6. the connection comes back by itself
        n_before = await page.evaluate("window.__sockets.length")
        await page.evaluate("window.__sockets.forEach(s => s.close())")
        await page.wait_for_timeout(2500)
        n_after = await page.evaluate("window.__sockets.length")
        check("a new socket is opened after a drop", n_after > n_before)
        await say(jt, jt, "message after reconnect")
        await page.wait_for_timeout(1500)
        check("messages arrive after reconnecting", "message after reconnect" in await page.inner_text("body"))

        # 7. profile: notifications row + change password
        await page.get_by_test_id("mobile-back-button").click()
        await page.get_by_test_id("tab-profile").click()
        await page.wait_for_timeout(600)
        check("profile shows the notifications row", "Notifiche" in await page.inner_text("body"))
        await page.get_by_test_id("change-password-toggle").click()
        await page.get_by_test_id("current-password-input").fill(PW)
        await page.get_by_test_id("new-password-input").fill("a-brand-new-pass-9")
        await page.screenshot(path=f"{SH}/profile_pw.png")
        await page.get_by_test_id("change-password-save").click()
        await page.wait_for_timeout(1500)
        r = await api.post(f"{API}/auth/login", data={"email": "giulia@lingua.app", "password": "a-brand-new-pass-9"})
        check("password changed from the profile", r.status == 200)
        r = await api.get(f"{API}/auth/me", headers=H(gt))
        check("the old session is closed", r.status == 401)
        check("this device stays signed in", "Profilo" in await page.inner_text("body") and "Accedi" not in await page.inner_text("body"))
        await ctx.close()

        # 8. admin: list people and reset a password
        at, a = await login("admin@test.dev", "admin-e2e-pass-123")
        ctx = await b.new_context(viewport={"width": 1100, "height": 900})
        await ctx.add_init_script(f"localStorage.setItem('lingua_token','{at}')")
        page = await ctx.new_page()
        await page.goto(f"{URL}/admin")
        await page.get_by_test_id("users-card").wait_for(timeout=8000)
        await page.get_by_test_id(f"reset-password-{j['id']}").click()
        await page.get_by_test_id("confirm-reset-password").click()
        await page.get_by_test_id("temp-password-dialog").wait_for(timeout=5000)
        temp = (await page.get_by_test_id("temp-password").inner_text()).strip()
        await page.screenshot(path=f"{SH}/admin_reset.png")
        r = await api.post(f"{API}/auth/login", data={"email": "james@lingua.app", "password": temp})
        check("admin reset gives a working temporary password", r.status == 200)
        await ctx.close()

        print("JS errors:", errors)
        await b.close()
    bad = [n for n, ok in results if not ok]
    print("FAILED:", bad if bad else "none")


asyncio.run(main())
