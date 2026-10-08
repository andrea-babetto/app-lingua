"""Dev launcher for the browser test: real FastAPI server, in-memory database, fake translator."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the repository
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/glott-shots")
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

import os, sys, tempfile
sys.path.insert(0, str(ROOT / "backend"))
os.environ.update(APP_ENV="test", MONGO_URL="mongodb://x", DB_NAME="e2e", JWT_SECRET="e2e-" + "x" * 40,
                  CORS_ORIGINS="http://localhost:3000", TRANSLATION_PROVIDER="fake", SEED_DEMO="true", ADMIN_EMAIL="admin@test.dev", ADMIN_PASSWORD="admin-e2e-pass-123",
                  DEMO_PASSWORD="e2e-demo-pass-1", STORAGE_DIR=tempfile.mkdtemp())
for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "S3_BUCKET"):
    os.environ.pop(k, None)
from mongomock_motor import AsyncMongoMockClient
import server, translation

DEMO = {  # scripted demo translations (NOT produced by the AI)
    "Ciao James! Come stai oggi?": "Hi James! How are you today?",
    "Hi Giulia, all good! Did you see the new campaign results?": "Ciao Giulia, tutto bene! Hai visto i risultati della nuova campagna?",
    "Sì, ottimi! Stasera andiamo a mangiare una pizza fuori? Offro io!": "Yes, great! Shall we go out for pizza tonight? My treat!",
    "Sounds perfect, I'm in 🍕": "Perfetto, ci sono 🍕",
    "Alle otto davanti al ristorante, ok?": "At eight in front of the restaurant, okay?",
}
class Fake(translation.TranslationProvider):
    name = "fake"
    async def detect_language(self, t): return "en"
    async def translate(self, text, s, t, o): return DEMO.get(text, f"[{t}] {text}")
    def supported_languages(self): return []
translation._PROVIDERS["fake"] = Fake
translation._FALLBACK["fake"] = []
db = AsyncMongoMockClient()["e2e"]
server.db = db; server.engine.db = db
import uvicorn
uvicorn.run(server.app, host="127.0.0.1", port=8001, log_level="warning")
