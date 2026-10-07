"""Pluggable translation engine. Chat code calls only TranslationProvider."""
import os
import time
import hashlib
import logging
from abc import ABC, abstractmethod

import requests

logger = logging.getLogger(__name__)


def cache_key(text: str, source: str, target: str, tone: str) -> str:
    raw = f"{source}|{target}|{tone}|{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class TranslationProvider(ABC):
    name = "base"

    @abstractmethod
    async def detect_language(self, text: str) -> str:
        ...

    @abstractmethod
    async def translate(self, text: str, source_lang: str, target_lang: str, options: dict) -> str:
        ...

    @abstractmethod
    def supported_languages(self) -> list:
        ...


class MockProvider(TranslationProvider):
    name = "mock"

    async def detect_language(self, text: str) -> str:
        return "en"

    async def translate(self, text, source_lang, target_lang, options):
        return f"[{target_lang}] {text}"

    def supported_languages(self):
        return ["en", "it", "hi", "es", "fr", "de"]


class SelfHostedProvider(TranslationProvider):
    """LibreTranslate / NLLB-200 compatible HTTP endpoint (stub, env-configured)."""
    name = "selfhosted"

    def __init__(self):
        self.url = os.environ.get("SELFHOSTED_TRANSLATE_URL", "").strip()

    async def detect_language(self, text: str) -> str:
        if not self.url:
            raise RuntimeError("SELFHOSTED_TRANSLATE_URL not configured")
        r = requests.post(f"{self.url}/detect", json={"q": text}, timeout=10)
        r.raise_for_status()
        return r.json()[0]["language"]

    async def translate(self, text, source_lang, target_lang, options):
        if not self.url:
            raise RuntimeError("SELFHOSTED_TRANSLATE_URL not configured")
        r = requests.post(
            f"{self.url}/translate",
            json={"q": text, "source": source_lang, "target": target_lang, "format": "text"},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()["translatedText"]

    def supported_languages(self):
        return []


class LLMProvider(TranslationProvider):
    """Default provider: Claude Haiku via Emergent universal key."""
    name = "llm"
    MODEL = ("anthropic", "claude-haiku-4-5-20251001")

    def __init__(self):
        self.api_key = os.environ.get("EMERGENT_LLM_KEY")

    def _chat(self, system_message: str):
        from emergentintegrations.llm.chat import LlmChat
        chat = LlmChat(api_key=self.api_key, session_id="translate", system_message=system_message)
        return chat.with_model(*self.MODEL)

    async def detect_language(self, text: str) -> str:
        from emergentintegrations.llm.chat import UserMessage
        sys = "Detect the language of the text. Reply with ONLY the ISO 639-1 two-letter code (e.g. en, it, hi). No other text."
        chat = self._chat(sys)
        resp = await chat.send_message(UserMessage(text=text[:500]))
        return (resp or "en").strip().lower()[:2]

    async def translate(self, text, source_lang, target_lang, options):
        import asyncio
        from emergentintegrations.llm.chat import UserMessage
        tone = options.get("tone", "neutral")
        glossary = options.get("glossary", "") or "none"
        sys = (
            f"You are a professional translator inside a chat app. Translate the message from {source_lang} to {target_lang}. "
            "Preserve tone, register, emojis, formatting, names, numbers, URLs and line breaks. "
            "Prefer the natural idiomatic equivalent in the target language over a literal word-for-word rendering (e.g. translate idioms and slang to how a native speaker would really say it). "
            f"Apply the requested tone: {tone}. Respect this glossary: {glossary}. "
            "Do not add explanations, notes or quotation marks. Return only the translation."
        )
        last_err = None
        for attempt in range(3):
            try:
                chat = self._chat(sys)
                resp = await chat.send_message(UserMessage(text=text))
                return (resp or text).strip()
            except Exception as e:
                last_err = e
                if "429" in str(e) or "rate" in str(e).lower():
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise
        raise last_err

    def supported_languages(self):
        return []


_PROVIDERS = {"llm": LLMProvider, "selfhosted": SelfHostedProvider, "mock": MockProvider}
# fallback chain per primary
# mock is never a silent fallback for a real provider — a real failure must surface as retryable.
_FALLBACK = {"llm": ["selfhosted"], "selfhosted": ["llm"], "mock": []}


class TranslationEngine:
    """Facade with caching, fallback chain, and per-call logging."""

    def __init__(self, db):
        self.db = db
        self.primary = os.environ.get("TRANSLATION_PROVIDER", "llm")

    def _chain(self):
        order = [self.primary] + _FALLBACK.get(self.primary, [])
        return [(n, _PROVIDERS[n]()) for n in order if n in _PROVIDERS]

    async def detect_language(self, text: str, fallback: str = "en") -> str:
        for name, prov in self._chain():
            try:
                return await prov.detect_language(text)
            except Exception as e:
                logger.warning(f"detect via {name} failed: {e}")
        return fallback

    async def translate(self, text, source_lang, target_lang, tone="neutral", glossary=""):
        if source_lang == target_lang:
            return {"text": text, "provider": "none"}
        key = cache_key(text, source_lang, target_lang, tone)
        cached = await self.db.translation_cache.find_one({"key": key}, {"_id": 0})
        if cached:
            return {"text": cached["text"], "provider": cached["provider"] + "(cache)"}

        options = {"tone": tone, "glossary": glossary}
        for name, prov in self._chain():
            start = time.time()
            try:
                out = await prov.translate(text, source_lang, target_lang, options)
                latency = int((time.time() - start) * 1000)
                chars = len(text)
                est_cost = round(chars / 1000 * 0.0008, 6)  # rough
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc).isoformat()
                if name != "mock":
                    await self.db.translation_cache.insert_one(
                        {"key": key, "text": out, "provider": name, "created_at": now}
                    )
                await self.db.translation_logs.insert_one(
                    {"provider": name, "chars": chars, "latency_ms": latency,
                     "est_cost": est_cost, "source": source_lang, "target": target_lang, "created_at": now}
                )
                return {"text": out, "provider": name}
            except Exception as e:
                logger.warning(f"translate via {name} failed: {e}")
        return None  # caller falls back to original
