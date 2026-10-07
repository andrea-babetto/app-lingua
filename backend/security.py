"""Small security helpers: rate limiting, upload policy, input cleaning.

The rate limiter keeps its counters in memory, so it protects a single server process (which is
what the default Render setup is). If you run several instances, move it to Redis.
"""
import os
import re
import time
import collections
from urllib.parse import quote

from fastapi import HTTPException, Request


# ---------------------------------------------------------------- rate limiting
class RateLimiter:
    def __init__(self):
        self._hits = {}

    def _prune(self, key, window):
        q = self._hits.setdefault(key, collections.deque())
        cutoff = time.monotonic() - window
        while q and q[0] <= cutoff:
            q.popleft()
        return q

    def _gc(self):
        if len(self._hits) > 20000:
            self._hits = {k: v for k, v in self._hits.items() if v}

    def check(self, key: str, limit: int, window: float, detail: str = "Too many requests. Please slow down."):
        """Count one hit; raise 429 if the key is over the limit."""
        self._gc()
        q = self._prune(key, window)
        if len(q) >= limit:
            raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(int(window))})
        q.append(time.monotonic())

    def is_limited(self, key: str, limit: int, window: float) -> bool:
        return len(self._prune(key, window)) >= limit

    def add(self, key: str, window: float):
        self._prune(key, window).append(time.monotonic())

    def reset(self, key: str):
        self._hits.pop(key, None)

    def clear(self):
        self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """Client address, used only for anti-abuse limits.

    Set CLIENT_IP_HEADER to a header your hosting/CDN sets itself (e.g. "cf-connecting-ip") to use it as is.
    Otherwise take the X-Forwarded-For entry TRUST_PROXY_HOPS from the right (a proxy appends the address it
    saw; the left side is client-controlled and can be forged). Verify the result after deploying with the
    admin-only endpoint GET /api/admin/client-ip."""
    header = os.environ.get("CLIENT_IP_HEADER", "").strip().lower()
    if header:
        value = request.headers.get(header, "").split(",")[0].strip()
        if value:
            return value
    hops = int(os.environ.get("TRUST_PROXY_HOPS", "1"))
    xff = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if hops > 0 and len(parts) >= hops:
        return parts[-hops]
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------- uploads
# Content types we accept and the extension we store them under. SVG and HTML are deliberately absent.
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}
AUDIO_TYPES = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav",
    "video/webm": "webm",  # some browsers label audio-only MediaRecorder output this way
}
DOC_TYPES = {
    "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}
ALLOWED_UPLOADS = {**IMAGE_TYPES, **AUDIO_TYPES, **DOC_TYPES}
INLINE_TYPES = set(IMAGE_TYPES) | set(AUDIO_TYPES)  # everything else is served as a download

_MAGIC = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/gif": [b"GIF87a", b"GIF89a"],
    "application/pdf": [b"%PDF-"],
}


def normalize_content_type(ct: str) -> str:
    return (ct or "").split(";")[0].strip().lower()


def sniff_ok(ct: str, data: bytes) -> bool:
    """The first bytes must match the declared type (for the types that have a signature)."""
    if ct == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    sigs = _MAGIC.get(ct)
    return True if not sigs else any(data.startswith(s) for s in sigs)


def clean_filename(name: str, fallback: str = "file") -> str:
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return name[:120] or fallback


def download_headers(filename: str, content_type: str) -> dict:
    disp = "inline" if content_type in INLINE_TYPES else "attachment"
    return {
        "Content-Disposition": f"{disp}; filename*=UTF-8''{quote(filename)}",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=86400",
        "Cross-Origin-Resource-Policy": "cross-origin",  # images/audio are loaded from the frontend origin
    }


# ---------------------------------------------------------------- input cleaning
USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")
PHONE_RE = re.compile(r"^\+?[0-9]{6,20}$")


def normalize_phone(p: str) -> str:
    return re.sub(r"[\s().-]", "", p or "")
