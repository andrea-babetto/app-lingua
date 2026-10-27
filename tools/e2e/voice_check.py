"""Voice messages in the browser: hold to record, slide to cancel, lock, and the other person listening to the translation.
Also dictation and listening to written messages. Needs the test server started with VOICE_DEMO=1 (scripted transcript, a beep instead of the spoken translation)."""
import asyncio, os
from playwright.async_api import async_playwright
URL, API, PW = "http://localhost:3000", "http://127.0.0.1:8001/api", "e2e-demo-pass-1"
SH = os.path.join(os.environ.get("SHOTS_DIR", "/tmp/glott-shots"), "voice")
res, errors = [], []
def check(n, ok): res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n)

async def main():
    os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"),
                                    args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        api = await p.request.new_context()
        async def login(e):
            d = await (await api.post(f"{API}/auth/login", data={"email": e, "password": PW})).json(); return d["token"], d["user"]
        gt, g = await login("giulia@lingua.app"); jt, j = await login("james@lingua.app")
        H = lambda t: {"Authorization": f"Bearer {t}"}
        cid = (await (await api.post(f"{API}/chats/direct/{j['id']}", headers=H(gt))).json())["id"]
        async def msgs(tok):
            return await (await api.get(f"{API}/messages/{cid}", headers=H(tok))).json()
        async def voices(tok):
            return [m for m in await msgs(tok) if (m.get("attachment") or {}).get("is_voice")]

        async def page_for(tok):
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, permissions=["microphone"])
            await ctx.add_init_script(f"localStorage.setItem('lingua_token','{tok}');localStorage.setItem('glott_theme','light');")
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(URL)
            await pg.get_by_test_id(f"sidebar-chat-item-{cid}").click()
            await pg.wait_for_timeout(1000)
            return pg
        written = await (await api.post(f"{API}/messages", headers=H(gt), data={"chat_id": cid, "text": "Ciao James! Come stai oggi?"})).json()
        page = await page_for(gt)
        mic = page.get_by_test_id("voice-record-button")
        check("mic shows when the box is empty", await mic.is_visible())
        await page.get_by_test_id("message-input").fill("ciao")
        check("send arrow when there is text", await page.get_by_test_id("send-message-button").is_visible() and await mic.count() == 0)
        await page.get_by_test_id("message-input").fill("")
        box = await mic.bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

        # 1. hold, talk, release -> sent
        await page.mouse.move(cx, cy); await page.mouse.down()
        await page.wait_for_timeout(2300)
        check("recording bar with timer", await page.get_by_test_id("voice-recording").is_visible() and (await page.get_by_test_id("voice-timer").inner_text()).startswith("0:0"))
        await page.screenshot(path=f"{SH}/voice-recording.png")
        await page.mouse.up()
        await page.wait_for_timeout(2500)
        v = await voices(gt)
        check("voice message sent", len(v) == 1 and 1.5 < v[0]["attachment"]["duration"] < 4)
        vid = v[0]["id"]
        txt = await page.get_by_test_id(f"voice-text-{vid}").inner_text() if await page.get_by_test_id(f"voice-text-{vid}").count() else ""
        check("the writer sees what was understood", "Ciao James" in txt)

        # 2. slide left -> cancelled
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.wait_for_timeout(1500)
        for k in range(1, 9): await page.mouse.move(cx - k * 20, cy); await page.wait_for_timeout(30)
        await page.wait_for_timeout(300)
        check("slide to cancel closes the bar", await page.get_by_test_id("voice-recording").count() == 0)
        await page.mouse.up(); await page.wait_for_timeout(1500)
        check("nothing sent after cancel", len(await voices(gt)) == 1)

        # 3. slide up -> locked, then send
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.wait_for_timeout(1000)
        for k in range(1, 7): await page.mouse.move(cx, cy - k * 18); await page.wait_for_timeout(30)
        await page.mouse.up()
        await page.wait_for_timeout(1500)
        check("locked: still recording after letting go", await page.get_by_test_id("voice-send").is_visible() and await page.get_by_test_id("voice-cancel").is_visible())
        await page.screenshot(path=f"{SH}/voice-locked.png")
        await page.get_by_test_id("voice-send").click()
        await page.wait_for_timeout(2500)
        check("locked recording sent", len(await voices(gt)) == 2)

        # 3b. dictation: talk, "Done", the words land in the box (nothing is sent)
        await page.get_by_test_id("dictate-button").click()
        await page.wait_for_timeout(1500)
        check("dictation is listening", await page.get_by_test_id("dictation").is_visible())
        await page.screenshot(path=f"{SH}/dictation.png")
        await page.get_by_test_id("dictation-done").click()
        await page.wait_for_timeout(2000)
        check("dictated words in the message box", "Ciao James" in await page.get_by_test_id("message-input").input_value())
        check("dictation sends nothing by itself", len(await voices(gt)) == 2 and len(await msgs(gt)) == 3)
        await page.get_by_test_id("message-input").fill("")

        # 4. James listens
        jp = await page_for(jt)
        bubble = jp.get_by_test_id(f"voice-{vid}")
        await bubble.wait_for()
        check("text hidden until 'Write it'", await jp.get_by_test_id(f"voice-text-{vid}").count() == 0)
        check("play reads the translation", (await jp.get_by_test_id(f"voice-mode-{vid}").inner_text()) == "Translated voice")
        ready = next(x for x in await msgs(jt) if x["id"] == vid).get("speech_url")
        check("translated voice already ready before play", ready)
        asked = []
        jp.on("request", lambda r: asked.append(r.url) if r.url.endswith("/speech") else None)
        await jp.get_by_test_id(f"voice-play-{vid}").click()
        await jp.wait_for_timeout(1200)
        check("play starts without waiting for the voice to be made", not asked)
        label = await jp.get_by_test_id(f"voice-play-{vid}").get_attribute("aria-label")
        m = next(x for x in await msgs(jt) if x["id"] == vid)
        check("spoken translation made and playing", m.get("speech_url") and label == "Pause")
        await jp.get_by_test_id(f"voice-write-{vid}").click()
        check("'Write it' shows the translated text", (await jp.get_by_test_id(f"voice-text-{vid}").inner_text()) == "Hi James, see you tomorrow at ten?")
        await jp.get_by_test_id(f"voice-original-{vid}").click(); await jp.wait_for_timeout(500)
        check("original voice plays", (await jp.get_by_test_id(f"voice-mode-{vid}").inner_text()) == "Original voice")
        await jp.screenshot(path=f"{SH}/voice-james.png")

        # 5. listen to a written message in your language
        listen = jp.get_by_test_id(f"listen-{written['id']}")
        check("🔊 next to a translated written message", await listen.is_visible())
        await listen.click()
        await jp.wait_for_timeout(1200)
        check("the written message is read aloud", await listen.get_attribute("aria-label") == "Pause")
        await listen.click()
        await jp.get_by_test_id(f"message-bubble-{written['id']}").locator("[role=button]").first.click()
        check("'Listen' in the message menu", await jp.get_by_test_id("action-listen").is_visible())
        await jp.keyboard.press("Escape"); await jp.wait_for_timeout(400)
        await jp.get_by_test_id("back-button").click() if await jp.get_by_test_id("back-button").count() else None
        side = await jp.get_by_test_id(f"sidebar-chat-item-{cid}").inner_text()
        check("chat list preview says voice message, not the text", "🎤 Voice message · 0:0" in side and "see you" not in side)
        check("no page errors", not errors); print(errors)
        await b.close()
    print(f"{sum(res)}/{len(res)}")
asyncio.run(main())
