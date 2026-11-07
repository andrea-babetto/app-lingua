"""Signing up and in with a code sent by email, in the simulated phone browser.
Needs the demo backend started with EMAIL_CODE_DEMO=1 (it logs the emails instead of sending them: DEMO_LOG is the path of
its log, where this script reads the code) and the built site on 3000 (see tools/README.md). Changes demo data: restart the backend before repeating."""
import asyncio, os, re
from playwright.async_api import async_playwright

CH = os.environ.get("CHROMIUM") or "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
URL = "http://localhost:3000"
SH = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
LOG = os.environ["DEMO_LOG"]
results = []


def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name, extra)


def codes_sent():
    """The codes the demo server "sent" so far (it writes each email to its log instead of sending it)."""
    with open(LOG, encoding="utf-8", errors="ignore") as f:
        return re.findall(r"email not sent: (\d{6}) ", f.read())


async def new_code(before, timeout=10):
    """The code of the email sent after `before` codes were in the log."""
    for _ in range(timeout * 4):
        codes = codes_sent()
        if len(codes) > before:
            return codes[-1]
        await asyncio.sleep(0.25)
    return ""


async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="it-IT")
        await ctx.add_init_script("localStorage.setItem('glott_theme','light');")
        pg = await ctx.new_page()

        # 1. sign up: email, code, name and the Terms box; no password anywhere
        await pg.goto(URL + "/login")
        await pg.get_by_test_id("welcome-register").click()
        await pg.get_by_test_id("code-send").wait_for()
        check("sign-up asks only the email, no password", await pg.get_by_test_id("password-input").count() == 0)
        await pg.get_by_test_id("email-input").fill("finta@yopmail.com")
        await pg.get_by_test_id("code-send").click()
        await pg.wait_for_timeout(800)
        check("a throwaway email is refused", await pg.get_by_test_id("code-input").count() == 0 and "temporanee" in await pg.inner_text("body"))
        email = "marco.codice@example.com"
        await pg.get_by_test_id("email-input").fill(email)
        before = len(codes_sent())
        await pg.get_by_test_id("code-send").click()
        await pg.get_by_test_id("code-input").wait_for()
        await pg.screenshot(path=f"{SH}/code-step.png")
        code = await new_code(before)
        check("the code arrives by email", len(code) == 6)
        await pg.get_by_test_id("code-input").fill("000000" if code != "000000" else "111111")
        await pg.wait_for_timeout(800)
        check("a wrong code is refused", await pg.get_by_test_id("email-name-step").count() == 0)
        await pg.get_by_test_id("code-input").fill(code)  # six digits: it goes on by itself
        await pg.get_by_test_id("email-name-step").wait_for()
        await pg.get_by_test_id("name-input").fill("Marco Codice")
        check("the account waits for the Terms box", await pg.get_by_test_id("submit-auth-button").is_disabled())
        await pg.get_by_test_id("consent-checkbox").check()
        await pg.screenshot(path=f"{SH}/code-name.png")
        await pg.get_by_test_id("submit-auth-button").click()
        await pg.wait_for_url("**/onboarding", timeout=10000)

        # 2. the language: the phone's one is already chosen, one tap
        await pg.get_by_test_id("language-suggested").wait_for()
        check("the phone's language is suggested", "Italiano" in await pg.get_by_test_id("language-suggested").inner_text())
        await pg.screenshot(path=f"{SH}/language-suggested.png")
        await pg.get_by_test_id("confirm-language-button").click()
        await pg.get_by_test_id("bottom-tabs").wait_for(timeout=10000)
        check("one tap and the chats open", True)

        # 3. sign in again with a code, on a new phone
        ctx2 = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="it-IT")
        await ctx2.add_init_script("localStorage.setItem('glott_seen','1');")
        pg2 = await ctx2.new_page()
        await pg2.goto(URL + "/login")
        await pg2.get_by_test_id("use-code-link").click()
        await pg2.get_by_test_id("email-input").fill(email)
        before = len(codes_sent())
        await pg2.get_by_test_id("code-send").click()
        await pg2.get_by_test_id("code-input").wait_for()
        await pg2.get_by_test_id("code-input").fill(await new_code(before))
        await pg2.get_by_test_id("bottom-tabs").wait_for(timeout=10000)
        check("the code signs in to the same account, straight to the chats", "/onboarding" not in pg2.url)
        await b.close()
    print(f"{sum(results)}/{len(results)} passed")


asyncio.run(main())
