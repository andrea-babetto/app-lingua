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
if os.environ.get("VOICE_DEMO"):  # voice messages with a scripted transcript and a beep instead of OpenAI
    import io, math, struct, wave, stt, tts
    os.environ.update(VOICE_MESSAGES="true", OPENAI_API_KEY="demo-not-a-key")
    async def fake_transcribe(data, filename, content_type, language=""):
        return {"it": "Ciao James, ci vediamo domani alle dieci?"}.get(language, "See you tomorrow at ten")
    async def fake_speech(text):
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
            w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 8000 * 2 * math.pi * 440))) for i in range(12000)))
        return buf.getvalue()
    stt.transcribe, tts.synthesize = fake_transcribe, fake_speech
    DEMO["Ciao James, ci vediamo domani alle dieci?"] = "Hi James, see you tomorrow at ten?"
db = AsyncMongoMockClient()["e2e"]
server.db = db; server.engine.db = db
import uvicorn
uvicorn.run(server.app, host="127.0.0.1", port=8001, log_level="warning")
