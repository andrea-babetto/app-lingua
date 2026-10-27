"""Invite links in the browser: a friend's link (welcome page, sign-up, the chat opens by itself), a group's link
(request, the admin's banner, accept) and the admin's invite counter. Changes data: restart the test server first."""
import asyncio
import os
import time

from playwright.async_api import async_playwright

URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
SH = os.path.join(os.environ.get("SHOTS_DIR", "/tmp/glott-shots"), "invite")
res, errors = [], []


def check(name, ok):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name)


async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
        api = await p.request.new_context()
        H = lambda t: {"Authorization": f"Bearer {t}"}

        async def login(email, pw=PW):
            d = await (await api.post(f"{API}/auth/login", data={"email": email, "password": pw})).json()
            return d["token"], d["user"]

        gt, g = await login("giulia@lingua.app")
        jt, j = await login("james@lingua.app")
        at, _ = await login("admin@test.dev", "admin-e2e-pass-123")
        code = (await (await api.get(f"{API}/me/invite", headers=H(gt))).json())["code"]

        async def ctx_page(token=None):
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            init = "localStorage.setItem('glott_theme','light');localStorage.setItem('glott_ui_lang','it');"
            if token:
                init += f"localStorage.setItem('lingua_token','{token}');"
            await ctx.add_init_script(init)
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            return pg

        # 1. a friend's link: welcome page with who invited you, sign up, the chat with them opens by itself
        page = await ctx_page()
        await page.goto(f"{URL}/?invite={code}")
        banner = page.get_by_test_id("invite-banner")
        await banner.wait_for(timeout=10000)
        check("welcome page says who invited you", "Giulia" in await banner.inner_text())
        check("the code leaves the address bar", "invite=" not in page.url)
        await page.screenshot(path=f"{SH}/welcome.png")
        await page.get_by_test_id("welcome-register").click()
        check("no invite-code field with a friend's link", await page.get_by_test_id("show-invite-button").count() == 0)
        email = f"amico{int(time.time())}@test.dev"
        await page.get_by_test_id("name-input").fill("Marco Amico")
        await page.get_by_test_id("email-input").fill(email)
        await page.get_by_test_id("password-input").fill("amico-pass-123")
        await page.get_by_test_id("submit-auth-button").click()
        await page.wait_for_url("**/onboarding", timeout=10000)
        mt = await page.evaluate("localStorage.getItem('lingua_token')")
        await api.put(f"{API}/auth/profile", headers=H(mt), data={"language": "it"})  # the language step, done quickly
        await page.goto(URL)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{SH}/chat-opened.png")
        body = await page.inner_text("body")
        check("the chat with the friend opened by itself", "Giulia" in body and await page.get_by_test_id("message-input").count() == 1)
        gchats = await (await api.get(f"{API}/chats", headers=H(gt))).json()
        check("the friend has the chat too", any(c.get("display_name") == "Marco Amico" for c in gchats))

        # 2. a group's link: request, the admin's banner, accept
        grp = await (await api.post(f"{API}/chats/group", headers=H(gt), data={"name": "Viaggio a Lisbona", "member_ids": [j["id"]]})).json()
        gcode = (await (await api.post(f"{API}/chats/{grp['id']}/invite-link", headers=H(gt))).json())["code"]
        await page.goto(f"{URL}/?invite={gcode}")
        await page.wait_for_timeout(2000)
        check("request sent message", "Viaggio a Lisbona" in await page.inner_text("body"))
        mine = await (await api.get(f"{API}/chats", headers=H(mt))).json()
        check("not in the group before the admin accepts", not any(c["id"] == grp["id"] for c in mine))
        gp = await ctx_page(gt)
        await gp.goto(URL)
        await gp.get_by_test_id(f"sidebar-chat-item-{grp['id']}").click()
        ban = gp.get_by_test_id("join-requests-banner")
        await ban.wait_for(timeout=8000)
        check("admin sees who asks to join", "Marco" in await ban.inner_text())
        await ban.click()
        await gp.get_by_test_id("group-invite").wait_for()
        await gp.wait_for_timeout(500)
        await gp.screenshot(path=f"{SH}/requests.png")
        check("the group's link is shown to the admin", gcode in await gp.get_by_test_id("group-invite-url").inner_text())
        await gp.locator('[data-testid^="join-approve-"]').first.click()
        await gp.wait_for_timeout(1500)
        mine = await (await api.get(f"{API}/chats", headers=H(mt))).json()
        check("accepted: now in the group", any(c["id"] == grp["id"] for c in mine))
        check("the request is gone", await gp.get_by_test_id("join-requests").count() == 0)

        # 3. the admin's counter
        ap = await ctx_page(at)
        await ap.goto(f"{URL}/admin")
        card = ap.get_by_test_id("invites-card")
        await card.wait_for(timeout=8000)
        check("admin counter: Giulia brought 1 person", "Giulia" in await card.inner_text() and await ap.get_by_test_id(f"invites-row-{g['id']}").count() == 1)
        await ap.screenshot(path=f"{SH}/admin.png", full_page=True)

        check("no page errors", not errors)
        print(errors)
        await b.close()
    print(f"{sum(res)}/{len(res)}")


asyncio.run(main())
