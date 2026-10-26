"""API tests: auth, privacy, permissions, uploads, translation flow, websocket."""
import asyncio
import time

import pytest

import server
import stt
import tts
from conftest import PNG, FakeProvider


def wait_for(client, person, chat_id, msg_id, predicate, timeout=5.0):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        msgs = client.get(f"/api/messages/{chat_id}", headers=person.h).json()
        last = next((m for m in msgs if m["id"] == msg_id), None)
        if last and predicate(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f"timeout, last state: {last}")


def direct(client, a, b):
    r = client.post(f"/api/chats/direct/{b.id}", headers=a.h)
    assert r.status_code == 200, r.text
    return r.json()


def upload(client, person, name="a.png", data=PNG, ctype="image/png"):
    return client.post("/api/upload", files={"file": (name, data, ctype)}, headers=person.h)


# ---------------------------------------------------------------- auth
def test_health_and_config(client):
    assert client.get("/api/health").json() == {"ok": True}
    cfg = client.get("/api/config").json()
    assert cfg["google_client_id"] == "" and cfg["voice_transcription"] is False


def test_register_validation(client):
    ok = {"email": "a@x.com", "password": "longenough1", "name": "A"}
    assert client.post("/api/auth/register", json={**ok, "password": "short"}).status_code == 422
    assert client.post("/api/auth/register", json={**ok, "password": "x" * 73}).status_code == 422
    assert client.post("/api/auth/register", json={**ok, "name": "   "}).status_code == 422
    assert client.post("/api/auth/register", json=ok).status_code == 200
    assert client.post("/api/auth/register", json=ok).status_code == 400  # duplicate email


def test_login_and_lockout_after_repeated_failures(client, make_person):
    p = make_person("l@x.com")
    assert client.post("/api/auth/login", json={"email": "l@x.com", "password": "correct-horse-1"}).status_code == 200
    for _ in range(8):
        assert client.post("/api/auth/login", json={"email": "l@x.com", "password": "wrong-password"}).status_code == 401
    # locked now, even with the right password
    assert client.post("/api/auth/login", json={"email": "l@x.com", "password": "correct-horse-1"}).status_code == 429


def test_unknown_email_gets_same_error_as_wrong_password(client, make_person):
    make_person("known@x.com")
    a = client.post("/api/auth/login", json={"email": "known@x.com", "password": "nope-nope-1"})
    b = client.post("/api/auth/login", json={"email": "ghost@x.com", "password": "nope-nope-1"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_signup_is_rate_limited_per_address(client):
    codes = [client.post("/api/auth/register", json={"email": f"u{i}@x.com", "password": "longenough1", "name": "U"}).status_code for i in range(12)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_requests_without_token_are_rejected(client):
    for method, url in [("get", "/api/chats"), ("get", "/api/auth/me"), ("post", "/api/messages"), ("get", "/api/glossary")]:
        assert getattr(client, method)(url).status_code == 401
    assert client.get("/api/chats", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_google_login(client, monkeypatch, make_person):
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 503  # not configured
    monkeypatch.setattr(server, "GOOGLE_CLIENT_ID", "client-id")
    info = {"email": "G@Example.com", "email_verified": True, "name": "Gina", "picture": "https://lh3.googleusercontent.com/a"}
    monkeypatch.setattr(server, "_verify_google", lambda cred: info)
    r = client.post("/api/auth/google", json={"credential": "x" * 20})
    assert r.status_code == 200 and r.json()["user"]["email"] == "g@example.com"
    again = client.post("/api/auth/google", json={"credential": "x" * 20}).json()
    assert again["user"]["id"] == r.json()["user"]["id"]  # same account, not a duplicate
    monkeypatch.setitem(info, "email_verified", False)
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 401

    def bad(cred):
        raise ValueError("bad token")
    monkeypatch.setattr(server, "_verify_google", bad)
    assert client.post("/api/auth/google", json={"credential": "y" * 20}).status_code == 401
    # a Google-only account has no password: it cannot be entered through the password form
    assert client.post("/api/auth/login", json={"email": "g@example.com", "password": "not-a-real-password"}).status_code == 401


# ---------------------------------------------------------------- profile
def test_profile_validation(client, make_person):
    p = make_person("p@x.com")
    put = lambda body: client.put("/api/auth/profile", json=body, headers=p.h)
    assert put({"language": "xx"}).status_code == 400
    assert put({"username": "A B"}).status_code == 400
    assert put({"username": "ab"}).status_code == 400
    assert put({"phone": "abc"}).status_code == 400
    r = put({"phone": "+39 349-768 1905", "name": "  New Name "})
    assert r.json()["phone"] == "+393497681905" and r.json()["name"] == "New Name"
    # only known settings, as booleans; nothing else can be written
    r = put({"settings": {"show_original": False, "role": "admin", "evil": 1}})
    assert r.json()["settings"]["show_original"] is False and "evil" not in r.json()["settings"]
    assert client.get("/api/auth/me", headers=p.h).json()["role"] == "user"


def test_username_must_be_unique(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    assert client.put("/api/auth/profile", json={"username": "taken_name"}, headers=a.h).status_code == 200
    assert client.put("/api/auth/profile", json={"username": "taken_name"}, headers=b.h).status_code == 400


def test_avatar_must_be_an_uploaded_image(client, make_person):
    p = make_person("av@x.com")
    put = lambda av: client.put("/api/auth/profile", json={"avatar": av}, headers=p.h)
    assert put("https://evil.example/pixel.gif").status_code == 400
    assert put("/api/files/not-a-file").status_code == 400
    f = upload(client, p).json()
    assert put(f"http://testserver{f['url']}").status_code == 200
    doc = upload(client, p, "d.pdf", b"%PDF-1.4 x", "application/pdf").json()
    assert put(doc["url"]).status_code == 400  # a PDF is not an avatar
    assert put("").status_code == 200  # removing it is fine


# ---------------------------------------------------------------- privacy: search
def test_search_only_exposes_public_fields(client, make_person):
    a, b = make_person("a@x.com", "Anna"), make_person("secret@x.com", "Bruno", "it")
    client.put("/api/auth/profile", json={"username": "bruno_rossi", "phone": "+393331112222"}, headers=b.h)
    res = client.get("/api/users/search", params={"q": "bruno"}, headers=a.h).json()
    assert len(res) == 1
    assert set(res[0]) == {"id", "name", "username", "avatar", "language", "online", "last_seen", "bio"}
    flat = str(res)
    for secret in ("secret@x.com", "393331112222", "password", "blocked", "settings", "role"):
        assert secret not in flat


def test_search_cannot_list_the_directory(client, make_person):
    a, b = make_person("a@x.com", "Anna"), make_person("b@x.com", "Bruno")
    s = lambda q: client.get("/api/users/search", params={"q": q}, headers=a.h).json()
    assert s("Bruno") == []            # names are not searchable
    assert s("b@") == [] and s("b") == []  # too short / partial email
    assert s("") == []
    assert [u["id"] for u in s("b@x.com")] == [b.id]      # exact email works
    assert [u["id"] for u in s(b.username[:4])] == [b.id]  # username prefix works
    assert all(u["id"] != a.id for u in s(a.username))      # never returns yourself


def test_search_respects_blocks_and_hides_admin(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    client.post(f"/api/users/{a.id}/block", headers=b.h)  # b blocks a: a can no longer find b
    assert client.get("/api/users/search", params={"q": b.username}, headers=a.h).json() == []
    server_db = server.db
    import asyncio
    asyncio.run(server_db.users.update_one({"id": b.id}, {"$set": {"role": "admin", "blocked": []}}))
    assert client.get("/api/users/search", params={"q": b.username}, headers=a.h).json() == []


def test_search_is_rate_limited(client, make_person):
    a = make_person("a@x.com")
    codes = [client.get("/api/users/search", params={"q": "abc"}, headers=a.h).status_code for _ in range(31)]
    assert codes[-1] == 429


def test_chat_members_do_not_leak_email_or_phone(client, make_person):
    a, b = make_person("a@x.com"), make_person("private@x.com")
    chat = direct(client, a, b)
    flat = str(chat)
    assert "private@x.com" not in flat and "password" not in flat
    assert chat["other_user"]["id"] == b.id


# ---------------------------------------------------------------- messages + translation
def test_message_is_translated_for_each_reader(client, make_person):
    a, b = make_person("a@x.com", "Giulia", "it"), make_person("b@x.com", "James", "en")
    chat = direct(client, a, b)
    sent = client.post("/api/messages", json={"chat_id": chat["id"], "text": "Offro io!"}, headers=a.h).json()
    assert sent["display_text"] == "Offro io!" and sent["is_translated"] is False  # sender sees own words
    seen_by_b = wait_for(client, b, chat["id"], sent["id"], lambda m: m["status"] == "sent")
    assert seen_by_b["display_text"] == "[en] Offro io!" and seen_by_b["is_translated"] and seen_by_b["translated_from"] == "it"
    assert seen_by_b["original_text"] == "Offro io!"
    own = wait_for(client, a, chat["id"], sent["id"], lambda m: m["status"] == "sent")
    assert own["display_text"] == "Offro io!"


def test_same_language_is_not_sent_to_the_translator(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "hi"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    assert FakeProvider.calls == []


def test_group_translates_once_per_language_and_applies_glossary(client, make_person):
    a = make_person("a@x.com", "A", "it")
    b, c, d = make_person("b@x.com", lang="en"), make_person("c@x.com", lang="en"), make_person("d@x.com", lang="es")
    client.post("/api/glossary", json={"term": "ACOS", "rule": "keep"}, headers=c.h)
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id, d.id]}, headers=a.h).json()
    m = client.post("/api/messages", json={"chat_id": g["id"], "text": "Come va l'ACOS?"}, headers=a.h).json()
    wait_for(client, a, g["id"], m["id"], lambda x: x["status"] == "sent")
    langs = sorted((c_["target"], c_["glossary"]) for c_ in FakeProvider.calls)
    assert langs == [("en", ""), ("en", "ACOS=keep"), ("es", "")]  # c has her own glossary, so her version is separate
    assert wait_for(client, b, g["id"], m["id"], lambda x: x["is_translated"])["display_text"] == "[en] Come va l'ACOS?"
    assert wait_for(client, d, g["id"], m["id"], lambda x: x["is_translated"])["display_text"].startswith("[es]")


def test_failed_translation_is_reported_and_original_is_kept(client, make_person, monkeypatch):
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)

    real_translate = server.engine.translate

    async def boom(*args, **kw):
        return None
    monkeypatch.setattr(server.engine, "translate", boom)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao"}, headers=a.h).json()
    seen = wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "translation_failed")
    assert seen["display_text"] == "ciao" and seen["is_translated"] is False
    # retry works once the translator is back
    monkeypatch.setattr(server.engine, "translate", real_translate)
    assert client.post(f"/api/messages/{m['id']}/retry", headers=b.h).status_code == 200
    assert wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")["display_text"] == "[en] ciao"


def test_message_validation(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    chat = direct(client, a, b)
    post = lambda body: client.post("/api/messages", json={"chat_id": chat["id"], **body}, headers=a.h)
    assert post({"text": "   "}).status_code == 400
    assert post({"text": "x" * 4001}).status_code == 422
    assert post({"text": "ok", "reply_to": "does-not-exist"}).status_code == 400
    first = post({"text": "first"}).json()
    assert post({"text": "ok", "reply_to": first["id"]}).status_code == 200


def test_sending_is_rate_limited(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    codes = [client.post("/api/messages", json={"chat_id": chat["id"], "text": f"m{i}"}, headers=a.h).status_code for i in range(61)]
    assert codes[:60] == [200] * 60 and codes[60] == 429


def test_blocked_users_cannot_message(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    chat = direct(client, a, b)
    client.post(f"/api/users/{b.id}/block", headers=a.h)
    assert client.post("/api/messages", json={"chat_id": chat["id"], "text": "hi"}, headers=b.h).status_code == 403
    assert client.post("/api/messages", json={"chat_id": chat["id"], "text": "hi"}, headers=a.h).status_code == 403
    assert client.post(f"/api/chats/direct/{a.id}", headers=b.h).status_code == 403  # b cannot open a new chat to a blocker


def test_delete_for_everyone_hides_the_message_for_both(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "secret"}, headers=a.h).json()
    assert client.delete(f"/api/messages/{m['id']}?for_all=true", headers=b.h).status_code == 403  # only the sender
    assert client.delete(f"/api/messages/{m['id']}?for_all=true", headers=a.h).status_code == 200
    for who in (a, b):
        got = next(x for x in client.get(f"/api/messages/{chat['id']}", headers=who.h).json() if x["id"] == m["id"])
        assert got["deleted_for_all"] is True and got["original_text"] == "" and got["display_text"] == ""
    assert client.get("/api/chats", headers=b.h).json()[0]["last_message"]["original_text"] == ""


def test_chat_list_preview_shows_text_not_attachment(client, make_person):
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao a tutti"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    last = client.get("/api/chats", headers=b.h).json()[0]["last_message"]
    assert last["display_text"] == "[en] ciao a tutti" and last["attachment"] is None


def test_delete_chat_only_affects_me_and_it_comes_back_empty(client, make_person):
    a, b, evil = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en"), make_person("e@x.com", lang="en")
    chat = direct(client, a, b)
    cid = chat["id"]
    client.post("/api/messages", json={"chat_id": cid, "text": "old one"}, headers=a.h)
    assert client.get("/api/chats", headers=b.h).json()[0]["unread"] == 1

    assert client.post(f"/api/chats/{cid}/delete", headers=evil.h).status_code == 403  # members only
    assert client.post(f"/api/chats/{cid}/delete", headers=b.h).status_code == 200
    assert client.get("/api/chats", headers=b.h).json() == []                      # gone from my list
    assert [c["id"] for c in client.get("/api/chats", headers=a.h).json()] == [cid]  # the other person keeps it
    assert len(client.get(f"/api/messages/{cid}", headers=a.h).json()) == 1
    assert "hidden_for" not in client.get("/api/chats", headers=a.h).json()[0]       # nobody learns who deleted it

    # a new message brings it back, with only the new message and no stale unread count
    client.post("/api/messages", json={"chat_id": cid, "text": "new one"}, headers=a.h)
    back = client.get("/api/chats", headers=b.h).json()
    assert [c["id"] for c in back] == [cid] and back[0]["unread"] == 1
    assert [m["original_text"] for m in client.get(f"/api/messages/{cid}", headers=b.h).json()] == ["new one"]


def test_starting_a_deleted_chat_again_shows_it_again(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    client.post("/api/messages", json={"chat_id": chat["id"], "text": "hello"}, headers=a.h)
    client.post(f"/api/chats/{chat['id']}/delete", headers=a.h)
    assert client.get("/api/chats", headers=a.h).json() == []
    again = client.post(f"/api/chats/direct/{b.id}", headers=a.h).json()
    assert again["id"] == chat["id"]
    assert [c["id"] for c in client.get("/api/chats", headers=a.h).json()] == [chat["id"]]
    assert client.get(f"/api/messages/{chat['id']}", headers=a.h).json() == []  # history stays cleared


# ---------------------------------------------------------------- permissions
def test_outsiders_cannot_touch_a_chat(client, make_person):
    a, b, evil = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en"), make_person("e@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "private"}, headers=a.h).json()
    cid, mid = chat["id"], m["id"]
    attempts = [
        client.get(f"/api/messages/{cid}", headers=evil.h),
        client.get(f"/api/messages/{cid}/search", params={"q": "private"}, headers=evil.h),
        client.post("/api/messages", json={"chat_id": cid, "text": "hi"}, headers=evil.h),
        client.post(f"/api/messages/{cid}/read", headers=evil.h),
        client.post(f"/api/messages/{mid}/retry", headers=evil.h),
        client.delete(f"/api/messages/{mid}", headers=evil.h),
    ]
    assert [r.status_code for r in attempts] == [403] * 6
    assert [c["id"] for c in client.get("/api/chats", headers=evil.h).json()] == []


def test_accepting_requires_a_real_request(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    assert client.post(f"/api/contacts/accept/{a.id}", headers=b.h).status_code == 404  # nobody asked
    assert client.post(f"/api/contacts/request/{b.id}", headers=a.h).json()["status"] == "pending_out"
    assert [u["id"] for u in client.get("/api/contacts/requests", headers=b.h).json()] == [a.id]
    assert client.post(f"/api/contacts/accept/{a.id}", headers=b.h).json()["status"] == "accepted"
    assert client.post(f"/api/contacts/request/{a.id}", headers=a.h).status_code == 400  # not yourself


def test_group_rules(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    g = client.post("/api/chats/group", json={"name": "G", "member_ids": [b.id], "tone": "weird"}, headers=a.h).json()
    assert g["tone"] == "neutral"  # there is one tone for everybody; a client cannot pick another
    assert client.put(f"/api/chats/{g['id']}/tone", params={"tone": "casual"}, headers=a.h).status_code in (404, 405)
    assert client.post(f"/api/chats/{g['id']}/members", json={"member_ids": []}, headers=b.h).status_code == 403
    assert client.put(f"/api/chats/{g['id']}/admin/{b.id}", headers=b.h).status_code == 403
    assert client.post("/api/chats/group", json={"name": "", "member_ids": []}, headers=a.h).status_code == 422
    assert client.post("/api/chats/group", json={"name": "G", "member_ids": ["x"] * 50}, headers=a.h).status_code == 422


def test_group_ignores_unknown_ids_and_people_who_blocked_you(client, make_person):
    a, b, c = make_person("a@x.com"), make_person("b@x.com"), make_person("c@x.com")
    client.post(f"/api/users/{a.id}/block", headers=c.h)
    g = client.post("/api/chats/group", json={"name": "G", "member_ids": [b.id, c.id, "ghost"]}, headers=a.h).json()
    assert sorted(g["members"]) == sorted([a.id, b.id])


def test_glossary_limits(client, make_person):
    a = make_person("a@x.com")
    assert client.post("/api/glossary", json={"term": "x" * 61, "rule": "keep"}, headers=a.h).status_code == 422
    r = client.post("/api/glossary", json={"term": "A<b>C=D", "rule": "k;eep\nnow"}, headers=a.h).json()
    assert r == [{"term": "A b C D", "rule": "k eep now"}]
    for i in range(49):
        assert client.post("/api/glossary", json={"term": f"t{i}", "rule": "keep"}, headers=a.h).status_code == 200
    assert client.post("/api/glossary", json={"term": "one-too-many", "rule": "keep"}, headers=a.h).status_code == 400


def test_admin_stats_are_admin_only(client, make_person):
    a = make_person("a@x.com")
    assert client.get("/api/admin/stats", headers=a.h).status_code == 403
    assert client.get("/api/admin/client-ip", headers=a.h).status_code == 403


def test_client_ip_resolution(client, make_person, monkeypatch):
    import asyncio
    a = make_person("a@x.com")
    asyncio.run(server.db.users.update_one({"id": a.id}, {"$set": {"role": "admin"}}))
    xff = {"X-Forwarded-For": "6.6.6.6, 203.0.113.9, 10.0.0.1", **a.h}
    # default: one trusted proxy -> the entry just left of it; forged left-hand entries are ignored
    assert client.get("/api/admin/client-ip", headers=xff).json()["resolved"] == "10.0.0.1"
    monkeypatch.setenv("TRUST_PROXY_HOPS", "2")
    assert client.get("/api/admin/client-ip", headers=xff).json()["resolved"] == "203.0.113.9"
    monkeypatch.setenv("CLIENT_IP_HEADER", "cf-connecting-ip")
    got = client.get("/api/admin/client-ip", headers={**xff, "CF-Connecting-IP": "198.51.100.7"}).json()
    assert got["resolved"] == "198.51.100.7"


# ---------------------------------------------------------------- files
@pytest.mark.parametrize("name,data,ctype", [
    ("x.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml"),
    ("x.html", b"<script>alert(1)</script>", "text/html"),
    ("x.exe", b"MZ\x90\x00", "application/x-msdownload"),
    ("x.png", b"<script>alert(1)</script>", "image/png"),   # lies about its type
    ("x.pdf", b"not a pdf", "application/pdf"),
    ("empty.png", b"", "image/png"),
])
def test_dangerous_uploads_are_refused(client, make_person, name, data, ctype):
    a = make_person("a@x.com")
    assert upload(client, a, name, data, ctype).status_code == 415


def test_upload_size_limit(client, make_person, monkeypatch):
    a = make_person("a@x.com")
    monkeypatch.setattr(server, "MAX_UPLOAD_BYTES", 1000)
    assert upload(client, a, "big.png", PNG + b"\x00" * 2000).status_code == 413
    assert upload(client, a, "ok.png", PNG).status_code == 200


def test_uploaded_files_cannot_run_code_in_the_browser(client, make_person):
    a = make_person("a@x.com")
    f = upload(client, a, "../../etc/passwd.png", PNG).json()
    assert f["filename"] == "passwd.png"  # path stripped
    r = client.get(f["url"])
    assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in r.headers["content-security-policy"]
    assert r.headers["content-disposition"].startswith("inline")
    pdf = upload(client, a, "doc.pdf", b"%PDF-1.4 hello", "application/pdf").json()
    r = client.get(pdf["url"])
    assert r.headers["content-disposition"].startswith("attachment")  # downloads, never rendered on our origin
    assert client.get("/api/files/00000000-0000-0000-0000-000000000000").status_code == 404


def test_uploads_need_login(client):
    assert client.post("/api/upload", files={"file": ("a.png", PNG, "image/png")}).status_code == 401


def test_attachment_must_be_your_own_upload(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    mine, theirs = upload(client, a).json(), upload(client, b).json()
    send = lambda att: client.post("/api/messages", json={"chat_id": chat["id"], "text": "", "attachment": att}, headers=a.h)
    assert send({"id": "made-up"}).status_code == 400
    assert send({"id": theirs["id"]}).status_code == 400  # someone else's file
    assert send({"url": "https://evil.example/x"}).status_code == 400
    ok = send({"id": mine["id"], "url": "https://evil.example/x", "filename": "<script>"})
    assert ok.status_code == 200
    att = ok.json()["attachment"]
    assert att["url"] == f"/api/files/{mine['id']}" and att["filename"] == "a.png" and att["is_image"] is True  # rebuilt from our record


# ---------------------------------------------------------------- voice
def test_voice_messages_are_off_by_default(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    chat = direct(client, a, b)
    r = client.post("/api/voice", data={"chat_id": chat["id"], "duration": "4"}, files={"file": ("v.webm", b"\x00" * 6000, "audio/webm")}, headers=a.h)
    assert r.status_code == 404


def test_voice_message_without_transcription_service(client, make_person, monkeypatch):
    monkeypatch.setenv("VOICE_MESSAGES", "true")
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    r = client.post("/api/voice", data={"chat_id": chat["id"], "duration": "4"}, files={"file": ("v.webm", b"\x1a\x45\xdf\xa3" * 500, "audio/webm;codecs=opus")}, headers=a.h)
    assert r.status_code == 200
    msg = r.json()
    assert msg["attachment"]["is_voice"] is True and msg["status"] == "sent" and msg["original_text"] == ""
    assert client.get(msg["attachment"]["url"]).content.startswith(b"\x1a\x45")


def test_voice_message_is_transcribed_and_translated(client, make_person, monkeypatch):
    monkeypatch.setenv("VOICE_MESSAGES", "true")
    async def fake_transcribe(data, filename, content_type, language=""):
        assert language == "it"
        return "Come stai oggi?"
    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    r = client.post("/api/voice", data={"chat_id": chat["id"], "duration": "4"}, files={"file": ("v.webm", b"\x00" * 6000, "audio/webm")}, headers=a.h).json()
    got = wait_for(client, b, chat["id"], r["id"], lambda x: x["status"] == "sent")
    assert got["display_text"] == "[en] Come stai oggi?" and got["attachment"]["is_voice"]


def test_voice_rejects_wrong_type_and_outsiders(client, make_person, monkeypatch):
    monkeypatch.setenv("VOICE_MESSAGES", "true")
    a, b, evil = make_person("a@x.com"), make_person("b@x.com"), make_person("e@x.com")
    chat = direct(client, a, b)
    bad = client.post("/api/voice", data={"chat_id": chat["id"], "duration": "4"}, files={"file": ("v.html", b"<script>", "text/html")}, headers=a.h)
    assert bad.status_code == 415
    out = client.post("/api/voice", data={"chat_id": chat["id"], "duration": "4"}, files={"file": ("v.webm", b"\x00" * 6000, "audio/webm")}, headers=evil.h)
    assert out.status_code == 403


def test_short_clips_are_not_sent_to_the_speech_model():
    import asyncio
    assert asyncio.run(stt.transcribe(b"\x00" * 100, "a.webm", "audio/webm")) == ""


def _voice(client, person, chat_id, **extra):
    data = {"chat_id": chat_id, "duration": "6.5", **extra}
    return client.post("/api/voice", data=data, files={"file": ("v.webm", b"\x1a\x45\xdf\xa3" * 2000, "audio/webm")}, headers=person.h)


def _voice_on(monkeypatch, transcript="Come stai oggi?", speech=b"ID3fake-mp3"):
    monkeypatch.setenv("VOICE_MESSAGES", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    calls = {"speech": []}
    async def fake_transcribe(data, filename, content_type, language=""):
        return transcript
    async def fake_speech(text):
        calls["speech"].append(text)
        return speech
    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(tts, "synthesize", fake_speech)
    return calls


def test_voice_duration_is_checked_and_kept(client, make_person, monkeypatch):
    _voice_on(monkeypatch)
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    assert _voice(client, a, chat["id"], duration="200").status_code == 400  # longer than 2 minutes
    assert _voice(client, a, chat["id"], duration="0").status_code == 400
    msg = _voice(client, a, chat["id"]).json()
    assert msg["attachment"]["duration"] == 6.5 and msg["status"] == "transcribing"
    cfg = client.get("/api/config").json()
    assert cfg["voice_messages"] and cfg["voice_speech"] and cfg["voice_max_seconds"] == 120


def test_failed_transcription_keeps_the_audio(client, make_person, monkeypatch):
    _voice_on(monkeypatch, transcript="")
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    msg = _voice(client, a, chat["id"]).json()
    got = wait_for(client, b, chat["id"], msg["id"], lambda x: x["status"] == "transcription_failed")
    assert got["original_text"] == "" and client.get(got["attachment"]["url"]).status_code == 200


def test_voice_reply_keeps_the_quote(client, make_person, monkeypatch):
    _voice_on(monkeypatch)
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    first = client.post("/api/messages", json={"chat_id": chat["id"], "text": "Hello"}, headers=b.h).json()
    msg = _voice(client, a, chat["id"], reply_to=first["id"]).json()
    assert msg["reply_to"] == first["id"] and msg["reply_quote"]["text"] == "Hello"


def test_spoken_translation_is_ready_and_made_once_per_language(client, make_person, monkeypatch):
    calls = _voice_on(monkeypatch)
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carl", "en")
    group = client.post("/api/chats/group", json={"name": "G", "member_ids": [b.id, c.id]}, headers=a.h).json()
    msg = _voice(client, a, group["id"]).json()
    # made right after the translation, so play starts at once
    got = wait_for(client, b, group["id"], msg["id"], lambda x: x["status"] == "sent" and x.get("speech_url"))
    r1 = client.post(f"/api/messages/{msg['id']}/speech", headers=b.h)
    assert r1.status_code == 200 and r1.json()["url"] == got["speech_url"] and client.get(r1.json()["url"]).content == b"ID3fake-mp3"
    r2 = client.post(f"/api/messages/{msg['id']}/speech", headers=c.h)
    assert r2.json()["url"] == r1.json()["url"] and calls["speech"] == ["[en] Come stai oggi?"]
    assert _mine(client, c, group["id"], msg["id"])["speech_url"] == r1.json()["url"]
    assert "speech" not in _mine(client, c, group["id"], msg["id"])
    # the writer hears their own voice: there is no translation to read
    assert client.post(f"/api/messages/{msg['id']}/speech", headers=a.h).status_code == 409
    outsider = make_person("o@x.com", lang="en")
    assert client.post(f"/api/messages/{msg['id']}/speech", headers=outsider.h).status_code == 403
    text = client.post("/api/messages", json={"chat_id": group["id"], "text": "Ciao"}, headers=a.h).json()
    assert client.post(f"/api/messages/{text['id']}/speech", headers=b.h).status_code == 404


def test_spoken_translation_made_on_play_if_not_ready(client, make_person, monkeypatch):
    calls = _voice_on(monkeypatch, speech=b"")  # making it in advance failed
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    msg = _voice(client, a, chat["id"]).json()
    got = wait_for(client, b, chat["id"], msg["id"], lambda x: x["status"] == "sent")
    time.sleep(0.3)
    assert got["speech_url"] is None and len(calls["speech"]) == 1
    assert client.post(f"/api/messages/{msg['id']}/speech", headers=b.h).status_code == 502
    async def works(text):
        return b"ID3now"
    monkeypatch.setattr(tts, "synthesize", works)
    url = client.post(f"/api/messages/{msg['id']}/speech", headers=b.h).json()["url"]
    assert client.get(url).content == b"ID3now"

def test_old_voice_audio_is_deleted_but_text_stays(client, make_person, monkeypatch):
    _voice_on(monkeypatch)
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    msg = _voice(client, a, chat["id"]).json()
    wait_for(client, b, chat["id"], msg["id"], lambda x: x["status"] == "sent")
    speech = client.post(f"/api/messages/{msg['id']}/speech", headers=b.h).json()["url"]
    assert asyncio.run(server.expire_old_voice()) == 0  # still young
    asyncio.run(server.db.messages.update_one({"id": msg["id"]}, {"$set": {"created_at": _iso(-31 * 86400)}}))
    assert asyncio.run(server.expire_old_voice()) == 1
    got = _mine(client, b, chat["id"], msg["id"])
    assert got["attachment"]["expired"] and got["attachment"]["url"] is None and got["display_text"] == "[en] Come stai oggi?"
    assert client.get(msg["attachment"]["url"]).status_code == 404 and client.get(speech).status_code == 404
    assert client.post(f"/api/messages/{msg['id']}/speech", headers=b.h).status_code == 410


def test_deleting_a_voice_for_everyone_deletes_the_audio(client, make_person, monkeypatch):
    _voice_on(monkeypatch)
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    msg = _voice(client, a, chat["id"]).json()
    wait_for(client, b, chat["id"], msg["id"], lambda x: x["status"] == "sent")
    speech = client.post(f"/api/messages/{msg['id']}/speech", headers=b.h).json()["url"]
    assert client.delete(f"/api/messages/{msg['id']}?for_all=true", headers=a.h).status_code == 200
    assert client.get(msg["attachment"]["url"]).status_code == 404 and client.get(speech).status_code == 404


def test_voice_push_preview():
    assert server.push_preview({"display_text": "Hi", "attachment": {"is_voice": True}}) == "🎤 Hi"
    assert server.push_preview({"display_text": "", "attachment": {"is_voice": True}}) == "🎤 Voice message"


# ---------------------------------------------------------------- websocket
def test_websocket_rejects_bad_token_and_foreign_origin(client, make_person):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/ws?token=garbage"):
            pass
    a = make_person("a@x.com")
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/ws?token={a.token}", headers={"origin": "https://evil.example"}):
            pass


def _next_of_type(ws, kind, tries=20):
    for _ in range(tries):
        ev = ws.receive_json()
        if ev["type"] == kind:
            return ev
    raise AssertionError(f"no {kind} event")


def test_websocket_delivers_messages_in_the_readers_language(client, make_person):
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    with client.websocket_connect(f"/api/ws?token={b.token}") as ws:
        m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "Ciao!"}, headers=a.h).json()
        first = _next_of_type(ws, "new_message")
        assert first["message"]["id"] == m["id"] and first["message"]["display_text"] == "Ciao!"  # original arrives at once
        upd = _next_of_type(ws, "message_update")
        assert upd["message"]["display_text"] == "[en] Ciao!" and "translations_by_user" not in upd["message"]


def test_typing_only_reaches_chats_you_belong_to(client, make_person):
    a, b, evil = make_person("a@x.com"), make_person("b@x.com"), make_person("e@x.com")
    chat = direct(client, a, b)
    with client.websocket_connect(f"/api/ws?token={b.token}") as wb, client.websocket_connect(f"/api/ws?token={evil.token}") as we:
        we.send_json({"type": "typing", "chat_id": chat["id"]})  # not a member: ignored
        we.send_text("not json at all")                           # must not crash the socket
        with client.websocket_connect(f"/api/ws?token={a.token}") as wa:
            wa.send_json({"type": "typing", "chat_id": chat["id"]})
            ev = _next_of_type(wb, "typing")
            assert ev["user"]["id"] == a.id and "email" not in ev["user"]
        assert ev["chat_id"] == chat["id"]


def test_invite_code_gates_new_accounts(client, monkeypatch):
    ok = {"email": "inv@x.com", "password": "correct-horse-1", "name": "Inv"}
    assert client.get("/api/config").json()["invite_required"] is False
    assert client.post("/api/auth/register", json=ok).status_code == 200  # open when no code is configured

    monkeypatch.setenv("INVITE_CODE", "s3cret-code")
    assert client.get("/api/config").json()["invite_required"] is True
    new = {**ok, "email": "inv2@x.com"}
    assert client.post("/api/auth/register", json=new).status_code == 403
    assert client.post("/api/auth/register", json={**new, "invite_code": "wrong"}).status_code == 403
    assert client.post("/api/auth/register", json={**new, "invite_code": " s3cret-code "}).status_code == 200

    # existing accounts can still sign in without any code
    r = client.post("/api/auth/login", json={"email": "inv@x.com", "password": "correct-horse-1"})
    assert r.status_code == 200


def test_invite_code_gates_google_signup(client, monkeypatch):
    monkeypatch.setattr(server, "GOOGLE_CLIENT_ID", "cid")
    info = {"email": "newg@example.com", "email_verified": True, "name": "New G"}
    monkeypatch.setattr(server, "_verify_google", lambda cred: info)
    monkeypatch.setenv("INVITE_CODE", "s3cret-code")
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 403
    assert client.post("/api/auth/google", json={"credential": "x" * 20, "invite_code": "s3cret-code"}).status_code == 200
    # once the account exists, Google sign-in needs no code
    assert client.post("/api/auth/google", json={"credential": "x" * 20}).status_code == 200


# ---------------------------------------------------------------- edit, reactions
def test_edit_message_retranslates_and_is_limited_to_the_sender(client, make_person):
    a, b = make_person("a@x.com", lang="it"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao a tutti"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    assert client.put(f"/api/messages/{m['id']}", json={"text": "hack"}, headers=b.h).status_code == 403
    assert client.put(f"/api/messages/{m['id']}", json={"text": "   "}, headers=a.h).status_code == 400
    r = client.put(f"/api/messages/{m['id']}", json={"text": "buongiorno a tutti"}, headers=a.h)
    assert r.status_code == 200 and r.json()["edited"] is True
    got = wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent" and x["display_text"] == "[en] buongiorno a tutti")
    assert got["edited"] is True and got["original_text"] == "buongiorno a tutti"


def test_edit_window_and_deleted_messages(client, make_person):
    a, b = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "old"}, headers=a.h).json()
    old = (server.datetime.now(server.timezone.utc) - server.timedelta(minutes=45)).isoformat()
    asyncio.run(server.db.messages.update_one({"id": m["id"]}, {"$set": {"created_at": old}}))
    assert client.put(f"/api/messages/{m['id']}", json={"text": "too late"}, headers=a.h).status_code == 400
    fresh = client.post("/api/messages", json={"chat_id": chat["id"], "text": "new"}, headers=a.h).json()
    client.delete(f"/api/messages/{fresh['id']}?for_all=true", headers=a.h)
    assert client.put(f"/api/messages/{fresh['id']}", json={"text": "back"}, headers=a.h).status_code == 403


def test_reactions_toggle_and_only_members_can_react(client, make_person):
    a, b, evil = make_person("a@x.com"), make_person("b@x.com"), make_person("e@x.com")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "hi"}, headers=a.h).json()
    react = lambda who, e: client.post(f"/api/messages/{m['id']}/react", json={"emoji": e}, headers=who.h)
    assert react(evil, "👍").status_code == 403
    assert react(b, "🦄").status_code == 400                      # only the allowed set
    assert react(b, "👍").json()["reactions"] == {"👍": [b.id]}
    assert react(a, "👍").json()["reactions"] == {"👍": [b.id, a.id]}
    assert react(b, "❤️").json()["reactions"] == {"👍": [a.id], "❤️": [b.id]}  # one reaction per person
    assert react(b, "❤️").json()["reactions"] == {"👍": [a.id]}              # same emoji again removes it
    got = client.get(f"/api/messages/{chat['id']}", headers=a.h).json()[0]
    assert got["reactions"] == {"👍": [a.id]}


# ---------------------------------------------------------------- notifications
def test_push_subscription_rules(client, make_person):
    a = make_person("a@x.com")
    key = client.get("/api/push/key", headers=a.h).json()["public_key"]
    assert len(key) > 80 and client.get("/api/push/key", headers=a.h).json()["public_key"] == key  # stable
    sub = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "p" * 40, "auth": "a" * 20}}
    assert client.post("/api/push/subscribe", json=sub, headers=a.h).status_code == 200
    for bad in ("http://fcm.googleapis.com/x", "https://evil.example/hook", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x"):
        assert client.post("/api/push/subscribe", json={**sub, "endpoint": bad}, headers=a.h).status_code == 400, bad
    assert client.post("/api/push/subscribe", json=sub).status_code == 401
    assert client.post("/api/push/unsubscribe", json={"endpoint": sub["endpoint"]}, headers=a.h).status_code == 200


def test_offline_members_get_a_notification_in_their_language(client, make_person, monkeypatch):
    sent = []

    async def fake_send(db, user_id, payload, contact=""):
        sent.append((user_id, payload))
        return 1
    monkeypatch.setattr(server.push, "send_to_user", fake_send)
    a, b = make_person("a@x.com", "Anna", lang="it"), make_person("b@x.com", "Bob", lang="en")
    chat = direct(client, a, b)
    sub = {"endpoint": "https://fcm.googleapis.com/fcm/send/b", "keys": {"p256dh": "p" * 40, "auth": "a" * 20}}
    client.post("/api/push/subscribe", json=sub, headers=b.h)

    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao Bob"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    time.sleep(0.2)
    assert sent == [(b.id, {"title": "Anna", "body": "[en] ciao Bob", "chat_id": chat["id"]})]

    # someone using the app right now is not notified, and the sender never is
    sent.clear()
    server.ws_manager.conns[b.id] = {object()}
    server.ws_manager.touch(b.id)
    m2 = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ancora"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m2["id"], lambda x: x["status"] == "sent")
    time.sleep(0.2)
    assert sent == []
    server.ws_manager.conns.pop(b.id, None)


# ---------------------------------------------------------------- passwords
def test_change_password_and_old_sessions_stop_working(client, make_person):
    a = make_person("a@x.com")
    r = client.post("/api/auth/change-password", json={"current_password": "wrong-one", "new_password": "brand-new-pass-1"}, headers=a.h)
    assert r.status_code == 400
    assert client.post("/api/auth/change-password", json={"current_password": "correct-horse-1", "new_password": "short"}, headers=a.h).status_code == 422
    time.sleep(1.1)  # tokens carry whole seconds
    r = client.post("/api/auth/change-password", json={"current_password": "correct-horse-1", "new_password": "brand-new-pass-1"}, headers=a.h)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=a.h).status_code == 401           # the old token is dead
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@x.com", "password": "brand-new-pass-1"}).status_code == 200


def test_admin_can_list_users_and_reset_a_password(client, make_person):
    admin, u = make_person("admin@x.com"), make_person("user@x.com")
    assert client.get("/api/admin/users", headers=u.h).status_code == 403
    assert client.post(f"/api/admin/users/{u.id}/reset-password", headers=u.h).status_code == 403
    asyncio.run(server.db.users.update_one({"id": admin.id}, {"$set": {"role": "admin"}}))
    rows = client.get("/api/admin/users", headers=admin.h).json()
    assert {r["email"] for r in rows} == {"admin@x.com", "user@x.com"} and all("password_hash" not in r for r in rows)
    assert client.post(f"/api/admin/users/{admin.id}/reset-password", headers=admin.h).status_code == 404  # not yourself
    time.sleep(1.1)
    temp = client.post(f"/api/admin/users/{u.id}/reset-password", headers=admin.h).json()["temporary_password"]
    assert len(temp) >= 10
    assert client.get("/api/auth/me", headers=u.h).status_code == 401
    assert client.post("/api/auth/login", json={"email": "user@x.com", "password": temp}).status_code == 200


def test_delete_account_erases_the_person_and_what_they_wrote(client, make_person):
    a, b, c = make_person("a@x.com", lang="en"), make_person("b@x.com", lang="it"), make_person("c@x.com", lang="en")
    chat = direct(client, a, b)
    f = upload(client, a).json()
    client.post("/api/messages", json={"chat_id": chat["id"], "text": "hello"}, headers=a.h)
    client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao"}, headers=b.h)
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id]}, headers=a.h).json()
    mine = client.post("/api/messages", json={"chat_id": g["id"], "text": "from a"}, headers=a.h).json()
    theirs = client.post("/api/messages", json={"chat_id": g["id"], "text": "from b"}, headers=b.h).json()
    client.post(f"/api/messages/{theirs['id']}/react", json={"emoji": "👍"}, headers=a.h)
    client.post(f"/api/users/{a.id}/block", headers=b.h)
    assert client.post("/api/auth/delete-account", json={"password": "wrong-pass-1"}, headers=a.h).status_code == 400
    assert client.get("/api/auth/me", headers=a.h).status_code == 200  # a wrong password changes nothing
    assert client.post("/api/auth/delete-account", json={"password": "correct-horse-1"}, headers=a.h).status_code == 200
    assert client.get("/api/auth/me", headers=a.h).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"}).status_code == 401
    ids = [x["id"] for x in client.get("/api/chats", headers=b.h).json()]
    assert chat["id"] not in ids and g["id"] in ids  # direct chat gone, group stays for the others
    msgs = client.get(f"/api/messages/{g['id']}", headers=b.h).json()
    assert [m["original_text"] for m in msgs] == ["from b"] and not msgs[0]["reactions"]
    grp = next(x for x in client.get("/api/chats", headers=b.h).json() if x["id"] == g["id"])
    assert a.id not in grp["members"] and grp["admins"]  # someone is left in charge
    assert client.get(f"/api/files/{f['id']}", headers=b.h).status_code == 404
    assert client.get("/api/auth/me", headers=b.h).json()["blocked"] == []
    assert client.post("/api/auth/delete-account", json={}, headers=b.h).status_code == 400  # password required


def test_group_members_get_a_notification_with_the_group_name(client, make_person, monkeypatch):
    sent = []

    async def fake_send(db, user_id, payload, contact=""):
        sent.append((user_id, payload))
        return 1
    monkeypatch.setattr(server.push, "send_to_user", fake_send)
    a = make_person("a@x.com", "Anna", lang="it")
    b, c, d = make_person("b@x.com", "Bob", lang="en"), make_person("c@x.com", "Carla", lang="es"), make_person("d@x.com", "Dan", lang="en")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id, d.id]}, headers=a.h).json()
    for p in (a, b, c):  # Dan never turned notifications on
        sub = {"endpoint": f"https://fcm.googleapis.com/fcm/send/{p.id}", "keys": {"p256dh": "p" * 40, "auth": "a" * 20}}
        client.post("/api/push/subscribe", json=sub, headers=p.h)

    m = client.post("/api/messages", json={"chat_id": g["id"], "text": "ciao a tutti"}, headers=a.h).json()
    wait_for(client, b, g["id"], m["id"], lambda x: x["status"] == "sent")
    time.sleep(0.2)
    assert sorted(sent, key=lambda s: s[0]) == sorted([
        (b.id, {"title": "Anna · Team", "body": "[en] ciao a tutti", "chat_id": g["id"]}),
        (c.id, {"title": "Anna · Team", "body": "[es] ciao a tutti", "chat_id": g["id"]}),
    ], key=lambda s: s[0])


def test_pin_a_chat_is_private_and_limited(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    chat = direct(client, a, b)
    assert client.get("/api/chats", headers=a.h).json()[0]["pinned"] is False
    assert client.post(f"/api/chats/{chat['id']}/pin", headers=a.h).json() == {"pinned": True}
    mine = client.get("/api/chats", headers=a.h).json()[0]
    assert mine["pinned"] is True and "pinned_by" not in mine
    assert client.get("/api/chats", headers=b.h).json()[0]["pinned"] is False  # the other person sees nothing
    assert client.post(f"/api/chats/{chat['id']}/pin", headers=a.h).status_code == 200  # pinning twice is fine
    assert client.post(f"/api/chats/{chat['id']}/unpin", headers=a.h).json() == {"pinned": False}
    assert client.get("/api/chats", headers=a.h).json()[0]["pinned"] is False
    c = make_person("c@x.com")
    assert client.post(f"/api/chats/{chat['id']}/pin", headers=c.h).status_code == 403  # not a member
    assert client.post(f"/api/chats/{chat['id']}/pin").status_code == 401


def test_pinning_stops_at_five_chats(client, make_person):
    a = make_person("a@x.com")
    chats = [direct(client, a, make_person(f"p{i}@x.com")) for i in range(6)]
    for c in chats[:5]:
        assert client.post(f"/api/chats/{c['id']}/pin", headers=a.h).status_code == 200
    assert client.post(f"/api/chats/{chats[5]['id']}/pin", headers=a.h).status_code == 400
    assert client.post(f"/api/chats/{chats[0]['id']}/pin", headers=a.h).status_code == 200  # already pinned: no error


def test_group_emoji_is_optional_validated_and_editable_by_admins(client, make_person):
    a, b = make_person("a@x.com"), make_person("b@x.com")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id], "emoji": "💼"}, headers=a.h).json()
    assert g["emoji"] == "💼"
    assert client.get("/api/chats", headers=b.h).json()[0]["emoji"] == "💼"   # members see it too
    plain = client.post("/api/chats/group", json={"name": "Plain", "member_ids": [b.id]}, headers=a.h).json()
    assert not plain.get("emoji")
    for bad in ("abc", "<b>", "1", "a💼", "💼💼💼💼💼💼💼💼💼"):
        r = client.post("/api/chats/group", json={"name": "X", "member_ids": [], "emoji": bad}, headers=a.h)
        assert r.status_code == 422, bad
    assert client.put(f"/api/chats/{g['id']}/info", json={"emoji": "🍕"}, headers=b.h).status_code == 403  # not an admin
    assert client.put(f"/api/chats/{g['id']}/info", json={"emoji": "🍕"}, headers=a.h).json()["emoji"] == "🍕"
    assert not client.put(f"/api/chats/{g['id']}/info", json={"emoji": ""}, headers=a.h).json().get("emoji")  # removed
    assert client.put(f"/api/chats/{g['id']}/info", json={"emoji": "<script>"}, headers=a.h).status_code == 422


def test_bio_is_validated(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    me = client.put("/api/auth/profile", json={"bio": "  Marketing   a Milano \n e dintorni "}, headers=a.h).json()
    assert me["bio"] == "Marketing a Milano e dintorni"
    assert client.put("/api/auth/profile", json={"bio": "x" * 141}, headers=a.h).status_code == 422
    chat = direct(client, a, b)
    assert client.get("/api/chats", headers=b.h).json()[0]["other_user"]["bio"] == "Marketing a Milano e dintorni"  # others see the bio


def test_blocked_users_page_lists_names_and_unblocks(client, make_person):
    a, b = make_person("a@x.com", "Anna"), make_person("b@x.com", "Bob")
    assert client.get("/api/users/blocked/details", headers=a.h).json() == []
    client.post(f"/api/users/{b.id}/block", headers=a.h)
    rows = client.get("/api/users/blocked/details", headers=a.h).json()
    assert [r["id"] for r in rows] == [b.id] and rows[0]["name"] == "Bob" and set(rows[0]) == {"id", "name", "username", "avatar"}
    assert client.get("/api/users/blocked/details", headers=b.h).json() == []            # Bob sees nobody
    assert client.get("/api/users/blocked/details").status_code == 401
    client.post(f"/api/users/{b.id}/unblock", headers=a.h)
    assert client.get("/api/users/blocked/details", headers=a.h).json() == []


def test_usage_counts_translated_messages_per_person_and_month(client, make_person):
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carl", "en")
    d = make_person("d@x.com", "Dora", "it")
    zero = {"received": 0, "sent": 0}
    assert {k: client.get("/api/usage", headers=a.h).json()[k] for k in zero} == zero
    assert client.get("/api/usage").status_code == 401
    # 1:1, different languages: Anna wrote (sent), Bob read it translated (received)
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao"}, headers=a.h).json()
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    ua, ub = client.get("/api/usage", headers=a.h).json(), client.get("/api/usage", headers=b.h).json()
    assert (ua["sent"], ua["received"], ub["sent"], ub["received"]) == (1, 0, 0, 1) and ua["month"] == ub["month"]
    # same language: nothing to translate, nothing counted
    chat2 = direct(client, a, d)
    m2 = client.post("/api/messages", json={"chat_id": chat2["id"], "text": "ciao Dora"}, headers=a.h).json()
    wait_for(client, d, chat2["id"], m2["id"], lambda x: x["status"] == "sent")
    assert client.get("/api/usage", headers=d.h).json()["received"] == 0 and client.get("/api/usage", headers=a.h).json()["sent"] == 1
    # an edit is the same message: not counted twice
    client.put(f"/api/messages/{m['id']}", json={"text": "buongiorno"}, headers=a.h)
    wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent" and x["display_text"] == "[en] buongiorno")
    assert (client.get("/api/usage", headers=a.h).json()["sent"], client.get("/api/usage", headers=b.h).json()["received"]) == (1, 1)
    # group: one message written, each English reader counts it once for themselves
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id]}, headers=a.h).json()
    m3 = client.post("/api/messages", json={"chat_id": g["id"], "text": "ciao a tutti"}, headers=a.h).json()
    wait_for(client, c, g["id"], m3["id"], lambda x: x["status"] == "sent")
    assert client.get("/api/usage", headers=a.h).json()["sent"] == 2
    assert (client.get("/api/usage", headers=b.h).json()["received"], client.get("/api/usage", headers=c.h).json()["received"]) == (2, 1)


def test_admin_usage_report_and_account_deletion(client, make_person):
    admin, a, b = make_person("admin@x.com", "Admin", "it"), make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    asyncio.run(server.db.users.update_one({"id": admin.id}, {"$set": {"role": "admin"}}))
    assert client.get("/api/admin/usage", headers=a.h).status_code == 403
    assert client.get("/api/admin/usage?month=2026-13", headers=admin.h).status_code == 400
    assert client.get("/api/admin/usage?month=nope", headers=admin.h).status_code == 400
    empty = client.get("/api/admin/usage", headers=admin.h).json()
    assert empty["people"] == [] and empty["median_received"] == 0 and empty["active_people"] == 0
    chat = direct(client, a, b)
    for text in ("uno", "due", "tre"):
        m = client.post("/api/messages", json={"chat_id": chat["id"], "text": text}, headers=a.h).json()
        wait_for(client, b, chat["id"], m["id"], lambda x: x["status"] == "sent")
    r = client.get("/api/admin/usage", headers=admin.h).json()
    assert r["total_received"] == 3 and r["total_sent"] == 3 and r["active_people"] == 2 and r["months"] == [r["month"]]
    assert r["people"][0]["name"] == "Bob" and r["people"][0]["received"] == 3 and "email" not in r["people"][0]
    assert r["max_received"] == 3
    # deleting an account also erases its counters
    assert client.post("/api/auth/delete-account", json={"password": "correct-horse-1"}, headers=b.h).status_code == 200
    assert asyncio.run(server.db.usage.count_documents({"user_id": b.id})) == 0
    after = client.get("/api/admin/usage", headers=admin.h).json()
    assert after["active_people"] == 1 and after["people"][0]["name"] == "Anna"


def test_local_time_zone_is_shared_only_with_chat_partners_and_can_be_hidden(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    assert client.put("/api/auth/profile", json={"timezone": "Mars/Olympus"}, headers=a.h).status_code == 400
    me = client.put("/api/auth/profile", json={"timezone": "Europe/Rome"}, headers=a.h).json()
    assert me["timezone"] == "Europe/Rome"
    # a stranger who finds Anna in search does not see her time zone
    found = client.get("/api/users/search", params={"q": a.username}, headers=b.h).json()
    assert found and "timezone" not in found[0]
    # in a chat, Bob sees it
    direct(client, a, b)
    other = next(c for c in client.get("/api/chats", headers=b.h).json() if c["type"] == "direct")["other_user"]
    assert other["timezone"] == "Europe/Rome"
    # Anna hides it from Profile > Privacy
    client.put("/api/auth/profile", json={"settings": {"local_time_enabled": False}}, headers=a.h)
    other = next(c for c in client.get("/api/chats", headers=b.h).json() if c["type"] == "direct")["other_user"]
    assert other["timezone"] == ""
    assert client.get("/api/auth/me", headers=a.h).json()["settings"]["local_time_enabled"] is False


def _iso(delta):
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    return (_dt.now(_tz.utc) + _td(seconds=delta)).isoformat()


def test_scheduled_messages_wait_and_then_leave(client, make_person):
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carl", "en")
    chat = direct(client, a, b)
    body = {"chat_id": chat["id"], "text": "  buongiorno  ", "send_at": _iso(3600)}
    assert client.post("/api/scheduled", json={**body, "send_at": _iso(-60)}, headers=a.h).status_code == 400     # past
    assert client.post("/api/scheduled", json={**body, "send_at": _iso(31 * 86400)}, headers=a.h).status_code == 400  # too far
    assert client.post("/api/scheduled", json={**body, "send_at": "2026-10-24T09:00"}, headers=a.h).status_code == 400  # no time zone
    assert client.post("/api/scheduled", json={**body, "text": "   "}, headers=a.h).status_code == 400
    assert client.post("/api/scheduled", json=body, headers=c.h).status_code == 403    # not in the chat
    s = client.post("/api/scheduled", json=body, headers=a.h).json()
    assert s["text"] == "buongiorno"
    # only Anna sees it; Bob gets nothing yet
    assert [x["id"] for x in client.get(f"/api/scheduled/{chat['id']}", headers=a.h).json()] == [s["id"]]
    assert client.get(f"/api/scheduled/{chat['id']}", headers=b.h).json() == []
    assert client.get(f"/api/messages/{chat['id']}", headers=b.h).json() == []
    assert client.delete(f"/api/scheduled/{s['id']}", headers=b.h).status_code == 404
    # change the time, then its time comes
    assert client.put(f"/api/scheduled/{s['id']}", json={"send_at": _iso(7200)}, headers=a.h).status_code == 200
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    assert asyncio.run(server.dispatch_due_scheduled(_dt.now(_tz.utc) + _td(minutes=30))) == 0   # not yet
    assert asyncio.run(server.dispatch_due_scheduled(_dt.now(_tz.utc) + _td(hours=3))) == 1
    got = client.get(f"/api/messages/{chat['id']}", headers=b.h).json()
    assert len(got) == 1 and got[0]["original_text"] == "buongiorno" and got[0]["sender_id"] == a.id
    assert client.get(f"/api/scheduled/{chat['id']}", headers=a.h).json() == []
    assert asyncio.run(server.dispatch_due_scheduled(_dt.now(_tz.utc) + _td(hours=3))) == 0   # never twice


def test_scheduled_send_now_cancel_limit_and_blocking(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    chat = direct(client, a, b)
    s1 = client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "uno", "send_at": _iso(3600)}, headers=a.h).json()
    s2 = client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "due", "send_at": _iso(3600)}, headers=a.h).json()
    m = client.post(f"/api/scheduled/{s1['id']}/send-now", headers=a.h)
    assert m.status_code == 200 and m.json()["original_text"] == "uno"
    assert client.post(f"/api/scheduled/{s1['id']}/send-now", headers=a.h).status_code == 404   # already gone
    assert client.delete(f"/api/scheduled/{s2['id']}", headers=a.h).json() == {"ok": True}
    assert [x["original_text"] for x in client.get(f"/api/messages/{chat['id']}", headers=b.h).json()] == ["uno"]
    # if Bob blocks Anna before the time, the message is dropped, not sent
    s3 = client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "tre", "send_at": _iso(3600)}, headers=a.h).json()
    client.post(f"/api/users/{a.id}/block", headers=b.h)
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    assert asyncio.run(server.dispatch_due_scheduled(_dt.now(_tz.utc) + _td(hours=2))) == 0
    assert client.get(f"/api/scheduled/{chat['id']}", headers=a.h).json() == []
    assert asyncio.run(server.db.messages.count_documents({"original_text": "tre"})) == 0
    client.post(f"/api/users/{a.id}/unblock", headers=b.h)
    # at most 20 waiting per person
    for i in range(20):
        assert client.post("/api/scheduled", json={"chat_id": chat["id"], "text": f"m{i}", "send_at": _iso(3600)}, headers=a.h).status_code == 200
    assert client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "one more", "send_at": _iso(3600)}, headers=a.h).status_code == 400
    # deleting the account removes them
    assert client.post("/api/auth/delete-account", json={"password": "correct-horse-1"}, headers=a.h).status_code == 200
    assert asyncio.run(server.db.scheduled.count_documents({"sender_id": a.id})) == 0


def test_scheduled_loop_sends_what_is_due(client, make_person, monkeypatch):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    chat = direct(client, a, b)
    asyncio.run(server.db.scheduled.insert_one({"id": "due-1", "chat_id": chat["id"], "sender_id": a.id, "text": "è ora",
                                                "send_at": _iso(-5), "reply_to": None, "created_at": _iso(-60)}))
    real_sleep, calls = asyncio.sleep, {"n": 0}

    async def one_round(_seconds):
        calls["n"] += 1
        if calls["n"] > 1:
            raise asyncio.CancelledError
        await real_sleep(0)

    monkeypatch.setattr(server.asyncio, "sleep", one_round)
    try:
        asyncio.run(server.scheduled_loop())
    except asyncio.CancelledError:
        pass
    monkeypatch.setattr(server.asyncio, "sleep", real_sleep)
    assert [m["original_text"] for m in client.get(f"/api/messages/{chat['id']}", headers=b.h).json()] == ["è ora"]


def test_a_reply_carries_a_quote_of_what_it_answers(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    chat = direct(client, a, b)
    q = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ci vediamo alle nove?"}, headers=a.h).json()
    r = client.post("/api/messages", json={"chat_id": chat["id"], "text": "yes!", "reply_to": q["id"]}, headers=b.h).json()
    assert r["reply_quote"] == {"sender_id": a.id, "sender_name": "Anna", "text": "ci vediamo alle nove?", "is_image": False}
    got = next(m for m in client.get(f"/api/messages/{chat['id']}", headers=a.h).json() if m["id"] == r["id"])
    assert got["reply_quote"]["text"] == "ci vediamo alle nove?"          # Anna sees it too, from the server
    # the quote follows an edit of the original...
    client.put(f"/api/messages/{q['id']}", json={"text": "ci vediamo alle dieci?"}, headers=a.h)
    got = next(m for m in client.get(f"/api/messages/{chat['id']}", headers=b.h).json() if m["id"] == r["id"])
    assert got["reply_quote"]["text"] == "ci vediamo alle dieci?"
    # ...and is emptied when the original is deleted for everyone
    client.delete(f"/api/messages/{q['id']}?for_all=true", headers=a.h)
    got = next(m for m in client.get(f"/api/messages/{chat['id']}", headers=b.h).json() if m["id"] == r["id"])
    assert got["reply_quote"]["text"] == "" and got["reply_quote"]["deleted"] is True
    # a scheduled reply keeps its quote too
    q2 = client.post("/api/messages", json={"chat_id": chat["id"], "text": "domani?"}, headers=a.h).json()
    s = client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "sure", "send_at": _iso(3600), "reply_to": q2["id"]}, headers=b.h).json()
    m = client.post(f"/api/scheduled/{s['id']}/send-now", headers=b.h).json()
    assert m["reply_quote"]["text"] == "domani?"
    # when Anna deletes her account, her words disappear from the quotes as well (in a group, Bob's reply stays)
    c = make_person("c@x.com", "Carl", "en")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id]}, headers=a.h).json()
    q3 = client.post("/api/messages", json={"chat_id": g["id"], "text": "chi viene?"}, headers=a.h).json()
    r3 = client.post("/api/messages", json={"chat_id": g["id"], "text": "me", "reply_to": q3["id"]}, headers=b.h).json()
    assert client.post("/api/auth/delete-account", json={"password": "correct-horse-1"}, headers=a.h).status_code == 200
    left = asyncio.run(server.db.messages.find_one({"id": r3["id"]}, {"_id": 0}))
    assert left["reply_quote"]["text"] == "" and left["reply_quote"]["deleted"] is True


def test_download_my_data_contains_my_things_and_not_other_peoples_words(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    assert client.get("/api/auth/export").status_code == 401
    chat = direct(client, a, b)
    mine = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao Bob"}, headers=a.h).json()
    wait_for(client, b, chat["id"], mine["id"], lambda x: x["status"] == "sent")
    client.post("/api/messages", json={"chat_id": chat["id"], "text": "hello Anna, my secret"}, headers=b.h)
    gone = client.post("/api/messages", json={"chat_id": chat["id"], "text": "oops"}, headers=a.h).json()
    wait_for(client, b, chat["id"], gone["id"], lambda x: x["status"] == "sent")
    client.delete(f"/api/messages/{gone['id']}?for_all=true", headers=a.h)
    client.post("/api/glossary", json={"term": "ACOS", "rule": "keep"}, headers=a.h)
    client.put("/api/auth/profile", json={"bio": "Marketing a Milano", "timezone": "Europe/Rome"}, headers=a.h)
    client.post("/api/scheduled", json={"chat_id": chat["id"], "text": "domani", "send_at": _iso(3600)}, headers=a.h)
    r = client.get("/api/auth/export", headers=a.h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    assert "attachment" in r.headers["content-disposition"] and ".json" in r.headers["content-disposition"]
    d = r.json()
    assert d["profile"]["email"] == "a@x.com" and d["profile"]["bio"] == "Marketing a Milano" and d["profile"]["timezone"] == "Europe/Rome"
    assert "password_hash" not in r.text
    assert [m["text"] for m in d["messages_i_wrote"]] == ["ciao Bob"]                # deleted-for-all messages are left out
    assert d["messages_i_wrote"][0]["translations"].get("en") == "[en] ciao Bob"
    assert "my secret" not in r.text                                                  # Bob's words are not in Anna's file
    assert d["chats"][0]["members"] == [{"id": b.id, "name": "Bob", "username": b.username}]
    assert "b@x.com" not in r.text                                                    # nor Bob's email
    assert d["glossary"] == [{"term": "ACOS", "rule": "keep"}]
    assert [x["text"] for x in d["scheduled_messages"]] == ["domani"]
    assert d["translation_usage_by_month"][0]["my_messages_translated"] == 2   # "oops" was translated before being deleted


def test_forgot_password_sends_a_one_time_link(client, make_person):
    import mailer
    a = make_person("a@x.com", "Anna", "it")
    mailer.sent.clear()
    assert client.get("/api/config").json()["password_reset"] is True
    # the answer is the same for unknown emails, and no mail leaves
    assert client.post("/api/auth/forgot", json={"email": "nobody@x.com"}).json() == {"ok": True}
    assert mailer.sent == []
    assert client.post("/api/auth/forgot", json={"email": "A@x.com"}, headers={"Origin": "http://localhost:3000"}).json() == {"ok": True}
    assert len(mailer.sent) == 1 and mailer.sent[0]["to"] == "a@x.com" and "Reimposta" in mailer.sent[0]["subject"]   # in her language
    link = next(w for w in mailer.sent[0]["text"].split() if w.startswith("http://localhost:3000/reset?token="))
    token = link.split("token=")[1]
    assert client.post("/api/auth/reset", json={"token": "x" * 30, "new_password": "brand-new-pass-1"}).status_code == 400
    assert client.post("/api/auth/reset", json={"token": token, "new_password": "short"}).status_code == 422
    time.sleep(1.1)  # sessions are compared by the second: the old one must be older than the reset
    r = client.post("/api/auth/reset", json={"token": token, "new_password": "brand-new-pass-1"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "a@x.com"
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200   # signed in
    assert client.get("/api/auth/me", headers=a.h).status_code == 401                                                # old sessions closed
    assert client.post("/api/auth/login", json={"email": "a@x.com", "password": "brand-new-pass-1"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": token, "new_password": "again-new-pass-2"}).status_code == 400  # only once
    # an expired link does not work
    client.post("/api/auth/forgot", json={"email": "a@x.com"}, headers={"Origin": "http://localhost:3000"})
    token2 = mailer.sent[-1]["text"].split("token=")[1].split()[0]
    asyncio.run(server.db.password_resets.update_many({}, {"$set": {"expires_at": _iso(-10)}}))
    assert client.post("/api/auth/reset", json={"token": token2, "new_password": "again-new-pass-2"}).status_code == 400
    # at most 3 requests an hour for the same email
    assert client.post("/api/auth/forgot", json={"email": "a@x.com"}).status_code == 200
    assert client.post("/api/auth/forgot", json={"email": "a@x.com"}).status_code == 429


def test_my_contacts_include_people_without_a_chat(client, make_person):
    a, b, c, d = (make_person(f"{x}@x.com", n, "it") for x, n in (("a", "Anna"), ("b", "Bob"), ("c", "Carl"), ("d", "Dora")))
    assert client.get("/api/contacts", headers=a.h).json() == []
    client.post(f"/api/contacts/request/{b.id}", headers=a.h)          # Anna asks Bob: waiting
    client.post(f"/api/contacts/request/{c.id}", headers=a.h)          # Anna asks Carl, Carl accepts
    client.post(f"/api/contacts/accept/{a.id}", headers=c.h)
    rows = client.get("/api/contacts", headers=a.h).json()
    assert [(r["name"], r["status"]) for r in rows] == [("Bob", "pending_out"), ("Carl", "accepted")]
    assert "email" not in rows[0] and "timezone" not in rows[0]       # a pending contact sees no local time
    # Anna deletes her chat with Carl: Carl is still in her contacts
    chat = next(x for x in client.get("/api/chats", headers=a.h).json() if x["type"] == "direct")
    client.post(f"/api/chats/{chat['id']}/delete", headers=a.h)
    assert [r["name"] for r in client.get("/api/contacts", headers=a.h).json()] == ["Bob", "Carl"]
    # people who were never saved and blocked people are not there
    assert "Dora" not in [r["name"] for r in client.get("/api/contacts", headers=a.h).json()]
    client.post(f"/api/users/{b.id}/block", headers=a.h)
    assert [r["name"] for r in client.get("/api/contacts", headers=a.h).json()] == ["Carl"]
    assert client.get("/api/contacts").status_code == 401


def test_group_polls_are_translated_and_counted(client, make_person):
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carl", "en")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id]}, headers=a.h).json()
    direct_chat = direct(client, a, b)
    body = {"chat_id": g["id"], "question": "Dove ceniamo?", "options": ["Pizzeria", "Sushi", "Da Mario"]}
    assert client.post("/api/polls", json={**body, "chat_id": direct_chat["id"]}, headers=a.h).status_code == 400   # groups only
    assert client.post("/api/polls", json={**body, "options": ["solo una"]}, headers=a.h).status_code == 422
    assert client.post("/api/polls", json={**body, "options": ["Sushi", "sushi"]}, headers=a.h).status_code == 400
    p = client.post("/api/polls", json=body, headers=a.h).json()
    assert p["poll"]["multiple"] is False and [o["text"] for o in p["poll"]["options"]] == ["Pizzeria", "Sushi", "Da Mario"]
    # Bob reads the question and the answers in English
    got = wait_for(client, b, g["id"], p["id"], lambda x: x["status"] == "sent" and x["poll"]["options"][0]["text"].startswith("[en]"))
    assert got["display_text"] == "[en] Dove ceniamo?" and got["poll"]["options"][1]["text"] == "[en] Sushi"
    # votes: one answer each in a single-choice poll; changing and taking back
    opt = [o["id"] for o in p["poll"]["options"]]
    assert client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": opt[:2]}, headers=b.h).status_code == 400
    v = client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": [opt[1]]}, headers=b.h).json()
    assert [o["count"] for o in v["poll"]["options"]] == [0, 1, 0] and v["poll"]["options"][1]["mine"] is True
    client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": [opt[1]]}, headers=c.h)
    v = client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": [opt[0]]}, headers=b.h).json()  # Bob changes his mind
    assert [o["count"] for o in v["poll"]["options"]] == [1, 1, 0] and v["poll"]["voters"] == 2
    seen_by_anna = next(m for m in client.get(f"/api/messages/{g['id']}", headers=a.h).json() if m["id"] == p["id"])
    assert "votes" not in seen_by_anna["poll"] and all(o["mine"] is False for o in seen_by_anna["poll"]["options"])   # who voted what stays private
    v = client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": []}, headers=b.h).json()
    assert [o["count"] for o in v["poll"]["options"]] == [0, 1, 0]
    # several answers when the poll allows it
    m = client.post("/api/polls", json={**body, "multiple": True}, headers=a.h).json()
    mo = [o["id"] for o in m["poll"]["options"]]
    v = client.post(f"/api/messages/{m['id']}/vote", json={"option_ids": mo[:2]}, headers=b.h).json()
    assert [o["count"] for o in v["poll"]["options"]] == [1, 1, 0] and v["poll"]["voters"] == 1
    # outsiders cannot vote, polls cannot be edited, deleted polls cannot be voted
    stranger = make_person("s@x.com", "Sam", "en")
    assert client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": [opt[0]]}, headers=stranger.h).status_code == 403
    assert client.put(f"/api/messages/{p['id']}", json={"text": "altro"}, headers=a.h).status_code == 400
    client.delete(f"/api/messages/{p['id']}?for_all=true", headers=a.h)
    assert client.post(f"/api/messages/{p['id']}/vote", json={"option_ids": [opt[0]]}, headers=b.h).status_code == 404


def test_group_description_and_rules_are_translated_for_each_member(client, make_person):
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carla", "it")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id]}, headers=a.h).json()
    assert client.put(f"/api/chats/{g['id']}/info", json={"rules": "x" * 1001}, headers=a.h).status_code == 422
    assert client.put(f"/api/chats/{g['id']}/info", json={"rules": "niente spam"}, headers=b.h).status_code == 403   # admins only
    r = client.put(f"/api/chats/{g['id']}/info", json={"description": "Il gruppo del lavoro", "rules": " Niente spam, siate gentili "}, headers=a.h).json()
    assert r["rules"] == "Niente spam, siate gentili" and r["texts_translated_from"] is None
    def bobs():
        return next(x for x in client.get("/api/chats", headers=b.h).json() if x["id"] == g["id"])
    end = time.time() + 5
    while time.time() < end and not bobs()["texts_translated_from"]:
        time.sleep(0.05)
    seen = bobs()
    assert seen["description"] == "[en] Il gruppo del lavoro" and seen["rules"] == "[en] Niente spam, siate gentili"
    assert seen["texts_translated_from"] == "it" and seen["rules_original"] == "Niente spam, siate gentili"
    assert "group_texts_translations" not in seen
    # Anna (who wrote them) sees the originals
    mine = next(x for x in client.get("/api/chats", headers=a.h).json() if x["id"] == g["id"])
    assert mine["rules"] == "Niente spam, siate gentili" and mine["texts_translated_from"] is None
    # a new Italian member reads the original; changing the rules drops the old translations
    client.post(f"/api/chats/{g['id']}/members", json={"member_ids": [c.id]}, headers=a.h)
    assert next(x for x in client.get("/api/chats", headers=c.h).json() if x["id"] == g["id"])["rules"] == "Niente spam, siate gentili"
    client.put(f"/api/chats/{g['id']}/info", json={"rules": "Solo lavoro"}, headers=a.h)
    end = time.time() + 5
    while time.time() < end and bobs()["rules"] != "[en] Solo lavoro":
        time.sleep(0.05)
    assert bobs()["rules"] == "[en] Solo lavoro"


def _mine(client, person, chat_id, msg_id):
    return next(m for m in client.get(f"/api/messages/{chat_id}", headers=person.h).json() if m["id"] == msg_id)


def test_delivered_and_read_with_time_only_for_the_sender(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao"}, headers=a.h).json()
    v = _mine(client, a, chat["id"], m["id"])
    assert v["delivered_to"] == {} and v["read_at"] == {} and v["read_by"] == [a.id]       # Bob's app is closed: only sent
    client.get("/api/chats", headers=b.h)                                                  # Bob opens the app: delivered
    v = _mine(client, a, chat["id"], m["id"])
    assert list(v["delivered_to"]) == [b.id] and v["read_at"] == {}
    client.post(f"/api/messages/{chat['id']}/read", headers=b.h)                           # Bob reads it
    v = _mine(client, a, chat["id"], m["id"])
    assert v["read_by"] == [a.id, b.id] and b.id in v["read_at"] and v["read_at"][b.id] >= v["delivered_to"][b.id]
    # Bob sees no receipts on Anna's message (they are for the sender only)
    seen_by_bob = _mine(client, b, chat["id"], m["id"])
    assert seen_by_bob["read_at"] == {} and seen_by_bob["delivered_to"] == {} and seen_by_bob["read_by"] == []


def test_last_seen_off_hides_reading_both_ways_but_not_delivery(client, make_person):
    a, b = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en")
    chat = direct(client, a, b)
    m = client.post("/api/messages", json={"chat_id": chat["id"], "text": "ciao"}, headers=a.h).json()
    client.post(f"/api/messages/{chat['id']}/read", headers=b.h)
    client.put("/api/auth/profile", json={"settings": {"last_seen_enabled": False}}, headers=b.h)   # Bob hides
    v = _mine(client, a, chat["id"], m["id"])
    assert v["read_at"] == {} and v["read_by"] == [a.id] and b.id in v["delivered_to"]          # Anna sees "delivered" only
    client.put("/api/auth/profile", json={"settings": {"last_seen_enabled": True}}, headers=b.h)
    assert b.id in _mine(client, a, chat["id"], m["id"])["read_at"]
    client.put("/api/auth/profile", json={"settings": {"last_seen_enabled": False}}, headers=a.h)   # Anna hides: she sees nobody's
    v = _mine(client, a, chat["id"], m["id"])
    assert v["read_at"] == {} and v["read_by"] == [a.id] and b.id in v["delivered_to"]


def test_group_receipts_per_person(client, make_person):
    a, b, c = make_person("a@x.com", "Anna", "it"), make_person("b@x.com", "Bob", "en"), make_person("c@x.com", "Carl", "en")
    g = client.post("/api/chats/group", json={"name": "Team", "member_ids": [b.id, c.id]}, headers=a.h).json()
    m = client.post("/api/messages", json={"chat_id": g["id"], "text": "ciao"}, headers=a.h).json()
    client.get(f"/api/messages/{g['id']}", headers=b.h)                                    # Bob opens the group
    client.post(f"/api/messages/{g['id']}/read", headers=c.h)                              # Carl reads (so it reached him too)
    v = _mine(client, a, g["id"], m["id"])
    assert set(v["delivered_to"]) == {b.id, c.id} and list(v["read_at"]) == [c.id]
