"""UI language, legal pages and account deletion, in the simulated phone browser.
Needs the demo backend (8001) and the built site served on 3000 (see tools/README.md). Changes demo data: restart the backend before repeating."""
import asyncio, os
from playwright.async_api import async_playwright

CH = os.environ.get("CHROMIUM") or "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
SH = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
results = []


def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name, extra)


async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, args=["--no-sandbox"])
        api = await p.request.new_context()

        async def login(email):
            d = await (await api.post(f"{API}/auth/login", data={"email": email, "password": PW})).json()
            return d["token"], d["user"]

        async def page_for(token=None, lang="en-US"):
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale=lang)
            if token:
                await ctx.add_init_script(f"localStorage.setItem('lingua_token','{token}');localStorage.setItem('glott_theme','light');")
            return await ctx.new_page()

        # 1. sign-in page follows the browser language and the language menu
        pg = await page_for(lang="it-IT")
        await pg.goto(URL + "/login")
        await pg.get_by_test_id("submit-auth-button").wait_for()
        check("login page in Italian from the browser language", "Accedi" in await pg.get_by_test_id("submit-auth-button").inner_text())
        await pg.get_by_test_id("ui-language-select").select_option("hi")
        await pg.wait_for_timeout(500)
        txt = await pg.get_by_test_id("submit-auth-button").inner_text()
        check("language menu switches the page (Hindi)", "Accedi" not in txt and "Sign in" not in txt, txt)
        await pg.get_by_test_id("toggle-auth-mode").click()
        check("consent line with two links on sign-up", await pg.locator('[data-testid="consent-line"] a').count() == 2)
        await pg.screenshot(path=f"{SH}/login_hi.png")

        # 2. legal pages open without an account
        pg = await page_for(lang="it-IT")
        await pg.goto(URL + "/privacy")
        await pg.get_by_test_id("legal-privacy").wait_for()
        check("privacy page opens signed out (Italian)", "Informativa" in await pg.get_by_test_id("legal-privacy").inner_text())
        await pg.goto(URL + "/terms")
        await pg.get_by_test_id("legal-terms").wait_for()
        check("terms page opens signed out", True)

        # 3. signed in: the app uses the profile language; Arabic is right-to-left
        gt, g = await login("giulia@lingua.app")
        pg = await page_for(gt)
        await pg.goto(URL)
        await pg.get_by_test_id("tab-profile").wait_for()
        tabs = await pg.get_by_test_id("bottom-tabs").inner_text()
        check("Giulia (it) sees the Italian tabs", "Gruppi" in tabs and "Profilo" in tabs, tabs.replace("\n", " "))
        await api.put(f"{API}/auth/profile", data={"language": "ar"}, headers={"Authorization": f"Bearer {gt}"})
        await pg.reload()
        await pg.get_by_test_id("tab-profile").wait_for()
        await pg.wait_for_timeout(500)
        check("Arabic switches the page to right-to-left", await pg.evaluate("document.documentElement.dir") == "rtl")
        await pg.screenshot(path=f"{SH}/home_ar.png")
        await api.put(f"{API}/auth/profile", data={"language": "it"}, headers={"Authorization": f"Bearer {gt}"})

        # 4. delete the account from Profile
        res = await api.post(f"{API}/auth/register", data={"email": "temp-del@x.com", "password": PW, "name": "Temp Person"})
        d = await res.json()
        await api.put(f"{API}/auth/profile", data={"language": "en"}, headers={"Authorization": f"Bearer {d['token']}"})
        pg = await page_for(d["token"])
        await pg.goto(URL)
        await pg.get_by_test_id("tab-profile").click()
        await pg.get_by_test_id("delete-account-open").click()
        await pg.get_by_test_id("delete-account-password").fill("wrong-password-1")
        await pg.get_by_test_id("delete-account-confirm").click()
        await pg.wait_for_timeout(800)
        check("wrong password does not delete", await pg.get_by_test_id("delete-account-dialog").count() == 1)
        await pg.get_by_test_id("delete-account-password").fill(PW)
        await pg.get_by_test_id("delete-account-confirm").click()
        await pg.wait_for_timeout(1500)
        r = await api.post(f"{API}/auth/login", data={"email": "temp-del@x.com", "password": PW})
        check("account is gone and the app returns to sign-in", r.status == 401 and "/login" in pg.url, pg.url)
        await pg.screenshot(path=f"{SH}/after_delete.png")

        await b.close()
    print(f"\n{sum(results)}/{len(results)} checks passed")
    raise SystemExit(0 if all(results) else 1)


asyncio.run(main())
