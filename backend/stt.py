"""Speech-to-text for voice messages (optional).

Enabled only when OPENAI_API_KEY is set. Without it voice messages are still delivered as audio,
just without transcript/translation.
"""
import os
import logging

logger = logging.getLogger(__name__)

MIN_AUDIO_BYTES = 4000  # shorter clips are silence/clicks and make speech models hallucinate ("You", "Thank you.")
_client = None


def enabled() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=60.0, max_retries=2)
    return _client


async def transcribe(data: bytes, filename: str, content_type: str, language: str = "") -> str:
    """Return the transcript, or '' if disabled, too short or failed."""
    if not enabled() or len(data) < MIN_AUDIO_BYTES:
        return ""
    try:
        kwargs = {"model": os.environ.get("STT_MODEL", "gpt-4o-mini-transcribe"),
                  "file": (filename, data, content_type)}
        if language:
            kwargs["language"] = language  # ISO 639-1 hint improves accuracy
        resp = await _get_client().audio.transcriptions.create(**kwargs)
        return (getattr(resp, "text", "") or "").strip()
    except Exception as e:
        logger.warning("voice transcription failed: %s", e)
        return ""
