"""
Lingua iteration 3 — new feature tests
- Voice messages (POST /api/voice) via Whisper
- Message search (GET /api/messages/{chat_id}/search)
- Group avatar/name/description (PUT /api/chats/{chat_id}/info)
- Block & report (POST /api/users/{uid}/block|unblock|report + send 403)
"""
import io
import math
import os
import struct
import time
import uuid
import wave
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


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def giulia():
    tok, u = _login(*GIULIA)
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def james():
    tok, u = _login(*JAMES)
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def direct_chat(giulia, james):
    # Canonical chat via POST /api/chats/direct/{other_id}
    r = requests.post(f"{API}/chats/direct/{james['user']['id']}", headers=_h(giulia["token"]))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _wait_msg(tok, chat_id, msg_id, timeout=20):
    for _ in range(timeout * 2):
        r = requests.get(f"{API}/messages/{chat_id}", headers=_h(tok))
        if r.status_code == 200:
            for m in r.json():
                if m["id"] == msg_id and m.get("status") != "translating":
                    return m
        time.sleep(0.5)
    # one last fetch regardless
    r = requests.get(f"{API}/messages/{chat_id}", headers=_h(tok))
    for m in r.json():
        if m["id"] == msg_id:
            return m
    return None


def _make_wav(seconds=1.0, freq=440, sr=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        n = int(seconds * sr)
        frames = b"".join(struct.pack("<h", int(16000 * math.sin(2 * math.pi * freq * i / sr))) for i in range(n))
        w.writeframes(frames)
    buf.seek(0)
    return buf


# ---------------- VOICE ----------------
class TestVoice:
    def test_upload_voice_creates_message_with_is_voice(self, giulia, james, direct_chat):
        wav = _make_wav(1.0)
        files = {"file": ("voice.wav", wav, "audio/wav")}
        data = {"chat_id": direct_chat}
        r = requests.post(f"{API}/voice", headers=_h(giulia["token"]), files=files, data=data, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("attachment", {}).get("is_voice") is True
        msg_id = body["id"]

        # James should also receive it; wait for pipeline
        m_j = _wait_msg(james["token"], direct_chat, msg_id, timeout=20)
        assert m_j is not None, "James did not receive voice msg"
        assert m_j["attachment"]["is_voice"] is True
        # status should not stay 'translating' forever
        assert m_j.get("status") in ("sent", "translation_failed"), f"status={m_j.get('status')}"
        print(f"[voice-synth] giulia_transcript={body.get('original_text')!r}  james_status={m_j.get('status')}  james_display={m_j.get('display_text')!r}")

    def test_upload_voice_with_text_transcript_translates(self, giulia, james, direct_chat):
        """Simulate a real transcript via WAV header + silent frames; whisper may transcribe to empty.
        We assert pipeline doesn't 500 and message is is_voice=true.
        Separately, if transcript non-empty, it should get translated for James."""
        wav = _make_wav(0.8, freq=220)
        files = {"file": ("voice2.wav", wav, "audio/wav")}
        data = {"chat_id": direct_chat}
        r = requests.post(f"{API}/voice", headers=_h(giulia["token"]), files=files, data=data, timeout=60)
        assert r.status_code == 200
        body = r.json()
        msg_id = body["id"]
        time.sleep(2)
        m_j = _wait_msg(james["token"], direct_chat, msg_id, timeout=15)
        assert m_j and m_j["attachment"]["is_voice"] is True
        if (body.get("original_text") or "").strip():
            # If whisper produced a transcript, James should see it (same or translated)
            assert (m_j.get("display_text") or "") != ""
            print(f"[voice-with-text] transcript={body.get('original_text')!r} james_sees={m_j.get('display_text')!r} is_translated={m_j.get('is_translated')}")

    def test_voice_rejects_non_member(self, direct_chat):
        # Register a stranger
        em = f"stranger_{uuid.uuid4().hex[:6]}@lingua.app"
        rr = requests.post(f"{API}/auth/register", json={"email": em, "password": "pass1234", "name": "Str"})
        assert rr.status_code == 200
        tok = rr.json()["token"]
        wav = _make_wav(0.3)
        r = requests.post(f"{API}/voice", headers=_h(tok),
                          files={"file": ("v.wav", wav, "audio/wav")}, data={"chat_id": direct_chat})
        assert r.status_code == 403


# ---------------- SEARCH ----------------
class TestSearch:
    def test_search_original_and_translation(self, giulia, james, direct_chat):
        # Unique token to find after translation
        marker_it = f"ananasuniq{uuid.uuid4().hex[:6]}"  # Italian-ish nonsense preserved
        # Giulia sends a message in Italian containing an English-translatable word
        text = f"Mangio una banana e un {marker_it} molto dolce oggi"
        r = requests.post(f"{API}/messages", headers=_h(giulia["token"]),
                          json={"chat_id": direct_chat, "text": text})
        assert r.status_code == 200
        msg_id = r.json()["id"]
        # Wait for translation
        m_j = _wait_msg(james["token"], direct_chat, msg_id, timeout=20)
        assert m_j is not None

        # Giulia searches Italian word in original
        r1 = requests.get(f"{API}/messages/{direct_chat}/search", headers=_h(giulia["token"]),
                          params={"q": marker_it})
        assert r1.status_code == 200
        ids1 = [m["id"] for m in r1.json()]
        assert msg_id in ids1, f"giulia search on original failed: {r1.json()}"

        # James searches English word 'banana' which should appear in translation
        r2 = requests.get(f"{API}/messages/{direct_chat}/search", headers=_h(james["token"]),
                          params={"q": "banana"})
        assert r2.status_code == 200
        ids2 = [m["id"] for m in r2.json()]
        # The translation should contain 'banana' (same spelling in English)
        assert msg_id in ids2, f"james search on translation failed: {r2.json()}"
        print(f"[search] james translated: {m_j.get('display_text')!r}")

    def test_search_empty_q(self, giulia, direct_chat):
        r = requests.get(f"{API}/messages/{direct_chat}/search", headers=_h(giulia["token"]),
                         params={"q": "   "})
        assert r.status_code == 200
        assert r.json() == []

    def test_search_non_member_403(self, direct_chat):
        em = f"stranger_{uuid.uuid4().hex[:6]}@lingua.app"
        rr = requests.post(f"{API}/auth/register", json={"email": em, "password": "pass1234", "name": "Str"})
        tok = rr.json()["token"]
        r = requests.get(f"{API}/messages/{direct_chat}/search", headers=_h(tok), params={"q": "hello"})
        assert r.status_code == 403


# ---------------- GROUP INFO ----------------
class TestGroupInfo:
    @pytest.fixture(scope="class")
    def group_chat(self, giulia, james):
        r = requests.post(f"{API}/chats/group", headers=_h(giulia["token"]),
                          json={"name": "TEST_ITER3", "member_ids": [james["user"]["id"]], "tone": "neutral"})
        assert r.status_code == 200
        return r.json()["id"]

    def test_admin_updates_name_desc_avatar(self, giulia, james, group_chat):
        avatar_url = f"{API}/files/fake-id-123"
        payload = {"name": "TEST_ITER3_RENAMED",
                   "description": "A test group for iter3",
                   "avatar": avatar_url}
        r = requests.put(f"{API}/chats/{group_chat}/info", headers=_h(giulia["token"]), json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("name") == "TEST_ITER3_RENAMED"
        assert body.get("description") == "A test group for iter3"
        assert body.get("display_avatar") == avatar_url
        # Sidebar reflects — james sees the updated name/desc too
        chats_j = requests.get(f"{API}/chats", headers=_h(james["token"])).json()
        grp = next((c for c in chats_j if c["id"] == group_chat), None)
        assert grp is not None
        assert grp["name"] == "TEST_ITER3_RENAMED"
        assert grp.get("description") == "A test group for iter3"
        assert grp.get("display_avatar") == avatar_url

    def test_non_admin_403(self, james, group_chat):
        r = requests.put(f"{API}/chats/{group_chat}/info", headers=_h(james["token"]),
                         json={"name": "hacked"})
        assert r.status_code == 403

    def test_non_member_403(self, group_chat):
        em = f"stranger_{uuid.uuid4().hex[:6]}@lingua.app"
        rr = requests.post(f"{API}/auth/register", json={"email": em, "password": "pass1234", "name": "Str"})
        tok = rr.json()["token"]
        r = requests.put(f"{API}/chats/{group_chat}/info", headers=_h(tok), json={"name": "x"})
        assert r.status_code == 403


# ---------------- BLOCK & REPORT ----------------
class TestBlockReport:
    def test_block_prevents_direct_message(self, giulia, james, direct_chat):
        # James blocks Giulia
        rb = requests.post(f"{API}/users/{giulia['user']['id']}/block", headers=_h(james["token"]))
        assert rb.status_code == 200

        # Giulia tries to message -> 403
        r = requests.post(f"{API}/messages", headers=_h(giulia["token"]),
                          json={"chat_id": direct_chat, "text": "while blocked"})
        assert r.status_code == 403, f"expected 403 while blocked got {r.status_code}: {r.text}"

        # Unblock
        ru = requests.post(f"{API}/users/{giulia['user']['id']}/unblock", headers=_h(james["token"]))
        assert ru.status_code == 200

        # Now Giulia can message again -> 200
        r2 = requests.post(f"{API}/messages", headers=_h(giulia["token"]),
                           json={"chat_id": direct_chat, "text": "after unblock"})
        assert r2.status_code == 200, r2.text

    def test_report_user(self, giulia, james):
        r = requests.post(f"{API}/users/{giulia['user']['id']}/report", headers=_h(james["token"]),
                          json={"reason": "spam test"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_blocked_list_endpoint(self, giulia, james):
        # Block then verify list contains giulia
        requests.post(f"{API}/users/{giulia['user']['id']}/block", headers=_h(james["token"]))
        rl = requests.get(f"{API}/users/blocked", headers=_h(james["token"]))
        assert rl.status_code == 200
        assert giulia["user"]["id"] in rl.json()
        # Clean up
        requests.post(f"{API}/users/{giulia['user']['id']}/unblock", headers=_h(james["token"]))
