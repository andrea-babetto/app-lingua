"""Text-to-speech for voice messages (optional): reads the translated transcript aloud.

Enabled only when OPENAI_API_KEY is set. One neutral voice for everyone (TTS_VOICE), never a copy of the sender's voice.
"""
import os
import logging

logger = logging.getLogger(__name__)

_client = None


def enabled() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=60.0, max_retries=2)
    return _client


async def synthesize(text: str) -> bytes:
    """Return MP3 audio of the text, or b'' if disabled or failed."""
    if not enabled() or not text.strip():
        return b""
    try:
        resp = await _get_client().audio.speech.create(
            model=os.environ.get("TTS_MODEL", "gpt-4o-mini-tts"), voice=os.environ.get("TTS_VOICE", "alloy"),
            input=text[:4000], response_format="mp3")
        return resp.content
    except Exception as e:
        logger.warning("speech synthesis failed: %s", e)
        return b""
