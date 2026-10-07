"""Iteration 4 feature tests: profile edit (name/username/phone), avatar upload, search by phone."""
import io
import os
import struct
import pytest
import requests

if "REACT_APP_BACKEND_URL" not in os.environ:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("REACT_APP_BACKEND_URL="):
                os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

GIULIA = ("giulia@lingua.app", "demo1234")
JAMES = ("james@lingua.app", "demo1234")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def giulia_tok():
    return _login(*GIULIA)


@pytest.fixture(scope="module")
def james_tok():
    return _login(*JAMES)


# --- Profile edit: name / username / phone ---
class TestProfileEdit:
    def test_me_returns_phone_field(self, giulia_tok):
        r = requests.get(f"{API}/auth/me", headers=_h(giulia_tok), timeout=15)
        assert r.status_code == 200
        assert "phone" in r.json()

    def test_update_name_username_phone_persists(self, giulia_tok):
        # Fetch current state
        before = requests.get(f"{API}/auth/me", headers=_h(giulia_tok)).json()
        original_name = before.get("name")
        original_username = before.get("username")

        new_username = f"giulia_t4_{os.getpid()}"
        payload = {"name": "Giulia TEST4", "username": new_username, "phone": "+39 333 9998877"}
        r = requests.put(f"{API}/auth/profile", json=payload, headers=_h(giulia_tok), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Giulia TEST4"
        assert body["username"] == new_username
        assert body["phone"] == "+39 333 9998877"

        # Verify via GET /me
        me = requests.get(f"{API}/auth/me", headers=_h(giulia_tok)).json()
        assert me["name"] == "Giulia TEST4"
        assert me["username"] == new_username
        assert me["phone"] == "+39 333 9998877"

        # Revert name/username (keep phone for search test)
        requests.put(f"{API}/auth/profile", json={"name": original_name, "username": original_username},
                     headers=_h(giulia_tok))

    def test_username_uniqueness_enforced(self, giulia_tok, james_tok):
        james_me = requests.get(f"{API}/auth/me", headers=_h(james_tok)).json()
        r = requests.put(f"{API}/auth/profile", json={"username": james_me["username"]},
                         headers=_h(giulia_tok), timeout=15)
        assert r.status_code == 400
        assert "taken" in r.json().get("detail", "").lower()


# --- Avatar upload via /api/upload + profile assignment ---
def _tiny_png_bytes():
    # 1x1 transparent PNG
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000a49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )


class TestAvatarUpload:
    def test_upload_and_set_avatar(self, giulia_tok):
        files = {"file": ("avatar.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(f"{API}/upload", files=files, headers=_h(giulia_tok), timeout=30)
        assert r.status_code == 200, r.text
        up = r.json()
        assert up.get("is_image") is True
        assert "/api/files/" in up["url"]
        fid = up["id"]

        # The URL may be relative; frontend saves absolute. Test both acceptable forms.
        abs_url = f"{BASE_URL}{up['url']}" if up["url"].startswith("/") else up["url"]

        r2 = requests.put(f"{API}/auth/profile", json={"avatar": abs_url},
                          headers=_h(giulia_tok), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["avatar"] == abs_url

        me = requests.get(f"{API}/auth/me", headers=_h(giulia_tok)).json()
        assert me["avatar"] == abs_url

        # File is retrievable
        r3 = requests.get(f"{BASE_URL}/api/files/{fid}", timeout=20)
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("image/")
        assert len(r3.content) > 0


# --- Search by phone / username / email ---
class TestSearchByPhone:
    def test_search_by_phone_fragment(self, giulia_tok, james_tok):
        # Ensure giulia has the phone set
        requests.put(f"{API}/auth/profile", json={"phone": "+39 333 9998877"},
                     headers=_h(giulia_tok))
        r = requests.get(f"{API}/users/search", params={"q": "9998877"},
                         headers=_h(james_tok), timeout=15)
        assert r.status_code == 200
        results = r.json()
        emails = [u["email"] for u in results]
        assert "giulia@lingua.app" in emails

    def test_search_by_username(self, giulia_tok, james_tok):
        giulia_me = requests.get(f"{API}/auth/me", headers=_h(giulia_tok)).json()
        uname = giulia_me["username"]
        if not uname:
            pytest.skip("no username")
        r = requests.get(f"{API}/users/search", params={"q": uname[:4]},
                         headers=_h(james_tok), timeout=15)
        assert r.status_code == 200
        assert any(u["email"] == "giulia@lingua.app" for u in r.json())

    def test_search_by_email(self, james_tok):
        r = requests.get(f"{API}/users/search", params={"q": "giulia@lingua"},
                         headers=_h(james_tok), timeout=15)
        assert r.status_code == 200
        assert any(u["email"] == "giulia@lingua.app" for u in r.json())
