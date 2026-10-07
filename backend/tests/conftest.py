"""Test setup: no network, no real database. MongoDB is replaced by mongomock, translation by a fake provider."""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

# Must be set before `import server`.
os.environ["APP_ENV"] = "test"
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "lingua_test"
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["TRANSLATION_PROVIDER"] = "fake"
for _k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "S3_BUCKET", "GOOGLE_CLIENT_ID", "ADMIN_PASSWORD", "SEED_DEMO"):
    os.environ.pop(_k, None)

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server
import storage
import translation
from security import limiter


class FakeProvider(translation.TranslationProvider):
    name = "fake"
    calls = []

    async def detect_language(self, text):
        return "en"

    async def translate(self, text, source_lang, target_lang, options):
        FakeProvider.calls.append({"text": text, "source": source_lang, "target": target_lang, **options})
        return f"[{target_lang}] {text}"

    def supported_languages(self):
        return []


translation._PROVIDERS["fake"] = FakeProvider
translation._FALLBACK["fake"] = []


@pytest.fixture()
def client(tmp_path, monkeypatch):
    mock_db = AsyncMongoMockClient()["lingua_test"]
    monkeypatch.setattr(server, "db", mock_db)
    monkeypatch.setattr(server.engine, "db", mock_db)
    monkeypatch.setattr(server.engine, "primary", "fake")
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "files"))
    storage.reset_storage()
    limiter.clear()
    server.ws_manager.conns.clear()
    FakeProvider.calls.clear()
    with TestClient(server.app) as c:  # keeps one event loop alive, so background translation tasks finish
        yield c
    storage.reset_storage()


class Person:
    def __init__(self, client, email, name, lang):
        r = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-1", "name": name})
        assert r.status_code == 200, r.text
        data = r.json()
        self.token, self.id, self.email = data["token"], data["user"]["id"], email
        self.h = {"Authorization": f"Bearer {self.token}"}
        r = client.put("/api/auth/profile", json={"language": lang}, headers=self.h)
        assert r.status_code == 200, r.text
        self.username = r.json()["username"]


@pytest.fixture()
def make_person(client):
    def _make(email, name="Test", lang="en"):
        return Person(client, email, name, lang)
    return _make


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
