"""
Lingua backend regression + feature tests (iteration 2).
Covers:
- Auth (login, admin pw rotation, old admin pw rejected)
- Google session_id endpoint rejects bad id
- BUG1: chat-list last-message preview text (not 'Attachment')
- BUG2: delete-for-everyone persists through GET
- BUG4: demo + admin seeding behavior
- GROUP CHAT: create, add member, promote admin, leave
- TONE SELECTOR: PUT /api/chats/{id}/tone
- TRANSLATION QUALITY cases (Italian idioms, URL/paragraph preservation, emoji, Hindi<->Italian)
"""
import os
import time
import pytest
import requests

if "REACT_APP_BACKEND_URL" not in os.environ:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("REACT_APP_BACKEND_URL="):
                os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
                break
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

GIULIA = ("giulia@lingua.app", "demo1234")
JAMES = ("james@lingua.app", "demo1234")
ADMIN = ("admin@lingua.app", "Ling2026!AdminX9q")
OLD_ADMIN_PW = "admin1234"


# ---------------- helpers ----------------
def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def giulia_token():
    r = login(*GIULIA)
    assert r.status_code == 200, f"giulia login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def james_token():
    r = login(*JAMES)
    assert r.status_code == 200, f"james login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def giulia_user(giulia_token):
    return requests.get(f"{API}/auth/me", headers=auth_headers(giulia_token)).json()


@pytest.fixture(scope="session")
def james_user(james_token):
    return requests.get(f"{API}/auth/me", headers=auth_headers(james_token)).json()


@pytest.fixture(scope="session")
def direct_chat_id(giulia_token):
    r = requests.get(f"{API}/chats", headers=auth_headers(giulia_token))
    assert r.status_code == 200
    chats = r.json()
    direct = [c for c in chats if c["type"] == "direct"]
    assert direct, "no direct chat seeded"
    return direct[0]["id"]


def wait_for_translation(token, chat_id, msg_id, expected_lang, timeout=15):
    """Poll until message has translation for expected_lang (or status != translating)."""
    for _ in range(timeout * 2):
        r = requests.get(f"{API}/messages/{chat_id}", headers=auth_headers(token))
        if r.status_code == 200:
            for m in r.json():
                if m["id"] == msg_id:
                    if m.get("status") != "translating":
                        return m
        time.sleep(0.5)
    return None


# ---------------- Auth / seeding ----------------
class TestAuthSeeding:
    def test_giulia_login(self):
        r = login(*GIULIA)
        assert r.status_code == 200
        assert r.json()["user"]["language"] == "it"

    def test_james_login(self):
        r = login(*JAMES)
        assert r.status_code == 200
        assert r.json()["user"]["language"] == "en"

    def test_admin_login_new_pw(self):
        r = login(*ADMIN)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_admin_old_pw_rejected(self):
        r = login(ADMIN[0], OLD_ADMIN_PW)
        assert r.status_code == 401

    def test_google_session_bad_id(self):
        r = requests.post(f"{API}/auth/google/session", json={"session_id": "clearly-invalid-xyz"}, timeout=30)
        assert r.status_code == 401

    def test_google_session_missing(self):
        r = requests.post(f"{API}/auth/google/session", json={}, timeout=30)
        assert r.status_code == 400


# ---------------- BUG1: last message preview ----------------
class TestLastMessagePreview:
    def test_preview_shows_text_not_attachment(self, giulia_token, james_token, direct_chat_id):
        # Giulia sends a text message
        text = "Preview test ciao bello"
        r = requests.post(f"{API}/messages", headers=auth_headers(giulia_token),
                          json={"chat_id": direct_chat_id, "text": text})
        assert r.status_code == 200
        msg_id = r.json()["id"]
        time.sleep(10)  # allow translation

        # Giulia side: last_message.display_text should contain text (original Italian)
        chats_g = requests.get(f"{API}/chats", headers=auth_headers(giulia_token)).json()
        chat_g = next(c for c in chats_g if c["id"] == direct_chat_id)
        last_g = chat_g["last_message"]
        assert last_g is not None
        assert last_g.get("display_text") == text
        assert "Attachment" not in (last_g.get("display_text") or "")

        # James side: display_text should be the translated (English) text, not 'Attachment'
        chats_j = requests.get(f"{API}/chats", headers=auth_headers(james_token)).json()
        chat_j = next(c for c in chats_j if c["id"] == direct_chat_id)
        last_j = chat_j["last_message"]
        assert last_j is not None
        dt_j = last_j.get("display_text") or ""
        assert dt_j != "", "James preview display_text is empty"
        assert "Attachment" not in dt_j
        print(f"[preview] Giulia sees: {last_g.get('display_text')!r}")
        print(f"[preview] James  sees: {dt_j!r}")


# ---------------- BUG2: delete for everyone ----------------
class TestDeleteForEveryone:
    def test_delete_for_all_persists(self, giulia_token, james_token, direct_chat_id):
        r = requests.post(f"{API}/messages", headers=auth_headers(giulia_token),
                          json={"chat_id": direct_chat_id, "text": "will be deleted for everyone"})
        assert r.status_code == 200
        msg_id = r.json()["id"]
        time.sleep(2)
        d = requests.delete(f"{API}/messages/{msg_id}?for_all=true", headers=auth_headers(giulia_token))
        assert d.status_code == 200

        # Fresh re-fetch for both
        for tok, who in [(giulia_token, "giulia"), (james_token, "james")]:
            msgs = requests.get(f"{API}/messages/{direct_chat_id}", headers=auth_headers(tok)).json()
            m = next((x for x in msgs if x["id"] == msg_id), None)
            assert m is not None, f"{who} should still see the (tombstoned) message"
            assert m.get("deleted_for_all") is True, f"{who} should see deleted_for_all=true"
            assert m.get("original_text") in ("", None)

    def test_delete_for_me_only_hides_for_actor(self, giulia_token, james_token, direct_chat_id):
        r = requests.post(f"{API}/messages", headers=auth_headers(giulia_token),
                          json={"chat_id": direct_chat_id, "text": "delete-for-me target"})
        msg_id = r.json()["id"]
        time.sleep(1)
        requests.delete(f"{API}/messages/{msg_id}", headers=auth_headers(giulia_token))

        g = requests.get(f"{API}/messages/{direct_chat_id}", headers=auth_headers(giulia_token)).json()
        j = requests.get(f"{API}/messages/{direct_chat_id}", headers=auth_headers(james_token)).json()
        assert not any(m["id"] == msg_id for m in g), "giulia should not see msg she deleted-for-me"
        assert any(m["id"] == msg_id for m in j), "james SHOULD still see the message"


# ---------------- GROUP CHAT ----------------
class TestGroupChat:
    def test_group_create_add_promote_leave(self, giulia_token, james_token, giulia_user, james_user):
        # Create a 3rd user to add later
        import uuid as _u
        email = f"testgm_{_u.uuid4().hex[:6]}@lingua.app"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "GroupMember"})
        assert rr.status_code == 200
        third_token = rr.json()["token"]
        third_id = rr.json()["user"]["id"]
        # Set language
        requests.put(f"{API}/auth/profile", headers=auth_headers(third_token), json={"language": "es"})

        # Giulia creates group with James only
        g = requests.post(f"{API}/chats/group", headers=auth_headers(giulia_token),
                          json={"name": "TEST_GROUP", "member_ids": [james_user["id"]], "tone": "neutral"})
        assert g.status_code == 200
        chat = g.json()
        assert chat["type"] == "group"
        assert giulia_user["id"] in chat["admins"]
        chat_id = chat["id"]

        # Add third member
        a = requests.post(f"{API}/chats/{chat_id}/members", headers=auth_headers(giulia_token),
                          json={"member_ids": [third_id]})
        assert a.status_code == 200
        assert third_id in a.json()["members"]

        # Non-admin add should fail
        f = requests.post(f"{API}/chats/{chat_id}/members", headers=auth_headers(james_token),
                          json={"member_ids": [third_id]})
        assert f.status_code == 403

        # Promote james
        p = requests.put(f"{API}/chats/{chat_id}/admin/{james_user['id']}", headers=auth_headers(giulia_token))
        assert p.status_code == 200
        chat_check = requests.get(f"{API}/chats", headers=auth_headers(giulia_token)).json()
        grp = next(c for c in chat_check if c["id"] == chat_id)
        assert james_user["id"] in grp["admins"]

        # Each member reads in own language
        requests.post(f"{API}/messages", headers=auth_headers(giulia_token),
                      json={"chat_id": chat_id, "text": "Ciao a tutti, benvenuti!"})
        time.sleep(10)
        j_msgs = requests.get(f"{API}/messages/{chat_id}", headers=auth_headers(james_token)).json()
        t_msgs = requests.get(f"{API}/messages/{chat_id}", headers=auth_headers(third_token)).json()
        if j_msgs:
            print(f"[group] James(en): {j_msgs[-1].get('display_text')!r}")
            print(f"[group] Third(es): {t_msgs[-1].get('display_text')!r}")

        # Member leaves
        lv = requests.post(f"{API}/chats/{chat_id}/leave", headers=auth_headers(third_token))
        assert lv.status_code == 200
        chat_after = requests.get(f"{API}/chats", headers=auth_headers(giulia_token)).json()
        grp2 = next(c for c in chat_after if c["id"] == chat_id)
        assert third_id not in grp2["members"]


# ---------------- TONE ----------------
class TestTone:
    def test_set_tone(self, giulia_token, direct_chat_id):
        for tone in ["formal", "casual", "neutral"]:
            r = requests.put(f"{API}/chats/{direct_chat_id}/tone?tone={tone}", headers=auth_headers(giulia_token))
            assert r.status_code == 200
            assert r.json()["tone"] == tone


# ---------------- TRANSLATION QUALITY ----------------
class TestTranslationQuality:
    TRANSLATIONS = {}  # collect for report

    def _send_and_get(self, token, chat_id, text, receiver_token, receiver_lang):
        r = requests.post(f"{API}/messages", headers=auth_headers(token),
                          json={"chat_id": chat_id, "text": text})
        assert r.status_code == 200, r.text
        msg_id = r.json()["id"]
        m = wait_for_translation(receiver_token, chat_id, msg_id, receiver_lang, timeout=20)
        return m

    def test_italian_idioms(self, giulia_token, james_token, direct_chat_id):
        for phrase in ["mi sono cadute le braccia", "in bocca al lupo"]:
            m = self._send_and_get(giulia_token, direct_chat_id, phrase, james_token, "en")
            display = (m or {}).get("display_text")
            self.TRANSLATIONS[phrase] = display
            print(f"[idiom] IT: {phrase!r}  ->  EN: {display!r}  provider={m and m.get('translations',{}).get('en',{}).get('provider')}")
            assert m is not None and display, f"no translation for {phrase}"

    def test_url_and_paragraphs(self, giulia_token, james_token, direct_chat_id):
        text = ("Primo paragrafo con informazioni importanti.\n\n"
                "Secondo paragrafo: puoi leggere l'articolo qui: https://example.com/articolo\n\n"
                "Terzo paragrafo di chiusura, grazie!")
        m = self._send_and_get(giulia_token, direct_chat_id, text, james_token, "en")
        display = (m or {}).get("display_text") or ""
        self.TRANSLATIONS["long_url"] = display
        print(f"[url] translated:\n{display}")
        assert "https://example.com/articolo" in display, "URL not preserved"
        assert display.count("\n\n") >= 1, "paragraph breaks not preserved"

    def test_emoji_preserved(self, giulia_token, james_token, direct_chat_id):
        text = "Buongiorno 🌞☕ oggi è una bella giornata 🎉🚀"
        m = self._send_and_get(giulia_token, direct_chat_id, text, james_token, "en")
        display = (m or {}).get("display_text") or ""
        self.TRANSLATIONS["emoji"] = display
        print(f"[emoji] -> {display!r}")
        for e in ["🌞", "☕", "🎉", "🚀"]:
            assert e in display, f"emoji {e} dropped"

    def test_hindi_user_bidirectional(self, giulia_token, giulia_user):
        import uuid as _u
        email = f"testhi_{_u.uuid4().hex[:6]}@lingua.app"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Hindi User"})
        assert rr.status_code == 200
        hi_token = rr.json()["token"]
        hi_id = rr.json()["user"]["id"]
        pr = requests.put(f"{API}/auth/profile", headers=auth_headers(hi_token), json={"language": "hi"})
        assert pr.status_code == 200
        assert pr.json()["language"] == "hi"

        # Start direct chat
        c = requests.post(f"{API}/chats/direct/{giulia_user['id']}", headers=auth_headers(hi_token))
        assert c.status_code == 200
        chat_id = c.json()["id"]

        # Hindi -> Italian
        hi_text = "नमस्ते, आप कैसे हैं? आज मौसम बहुत अच्छा है।"
        r = requests.post(f"{API}/messages", headers=auth_headers(hi_token),
                          json={"chat_id": chat_id, "text": hi_text})
        assert r.status_code == 200
        mid = r.json()["id"]
        m = wait_for_translation(giulia_token, chat_id, mid, "it", timeout=25)
        it_disp = (m or {}).get("display_text") or ""
        self.TRANSLATIONS["hi_to_it"] = it_disp
        print(f"[hi->it] {hi_text!r}  ->  {it_disp!r}")
        assert m is not None and it_disp, "Italian translation missing"
        assert it_disp != hi_text, "Italian translation looks same as original"

        # Italian -> Hindi
        it_text = "Ciao! Sto bene, grazie. Oggi è una bellissima giornata."
        r2 = requests.post(f"{API}/messages", headers=auth_headers(giulia_token),
                           json={"chat_id": chat_id, "text": it_text})
        mid2 = r2.json()["id"]
        m2 = wait_for_translation(hi_token, chat_id, mid2, "hi", timeout=25)
        hi_disp = (m2 or {}).get("display_text") or ""
        self.TRANSLATIONS["it_to_hi"] = hi_disp
        print(f"[it->hi] {it_text!r}  ->  {hi_disp!r}")
        assert m2 is not None and hi_disp, "Hindi translation missing"
        # Devanagari range
        assert any("\u0900" <= ch <= "\u097F" for ch in hi_disp), "Hindi output is not in Devanagari"
