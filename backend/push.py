"""Web Push: notifications when the app is closed.

The VAPID key pair is created the first time it is needed and kept in the database (collection `settings`),
so there is nothing to configure. Subscriptions come from the browser and are only accepted for the push
services of the major browsers (the server will connect to those addresses, so they must not be arbitrary).
"""
import asyncio
import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02, b64urlencode

logger = logging.getLogger("push")

ALLOWED_HOST_RE = re.compile(
    r"(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$"
)
MAX_SUBSCRIPTIONS_PER_USER = 10
_cache = {}


def endpoint_allowed(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    return p.scheme == "https" and bool(p.hostname) and bool(ALLOWED_HOST_RE.search(p.hostname)) and len(url) <= 600


async def get_vapid(db):
    """(Vapid02 object, public key as url-safe base64 for the browser)."""
    if "vapid" in _cache:
        return _cache["vapid"]
    doc = await db.settings.find_one({"key": "vapid"}, {"_id": 0})
    if doc:
        vapid = Vapid02.from_pem(doc["private_pem"].encode())
    else:
        vapid = Vapid02()
        vapid.generate_keys()
        await db.settings.update_one({"key": "vapid"}, {"$setOnInsert": {"key": "vapid", "private_pem": vapid.private_pem().decode()}}, upsert=True)
        doc = await db.settings.find_one({"key": "vapid"}, {"_id": 0})
        vapid = Vapid02.from_pem(doc["private_pem"].encode())  # in case another process won the race
    pub = vapid.public_key.public_bytes(encoding=serialization.Encoding.X962, format=serialization.PublicFormat.UncompressedPoint)
    _cache["vapid"] = (vapid, b64urlencode(pub))
    return _cache["vapid"]


def reset_cache():
    _cache.clear()


def _send_blocking(vapid, subscription: dict, payload: dict, contact: str):
    from pywebpush import webpush
    return webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=vapid,
        vapid_claims={"sub": contact},
        ttl=3600,
        timeout=10,
    )


async def send_to_user(db, user_id: str, payload: dict, contact: str = "mailto:admin@example.com") -> int:
    """Send to every device of the user. Returns how many were accepted. Dead subscriptions are removed."""
    subs = await db.push_subs.find({"user_id": user_id}, {"_id": 0}).to_list(MAX_SUBSCRIPTIONS_PER_USER)
    if not subs:
        return 0
    vapid, _ = await get_vapid(db)
    sent = 0
    for s in subs:
        try:
            await asyncio.to_thread(_send_blocking, vapid, {"endpoint": s["endpoint"], "keys": s["keys"]}, payload, contact)
            sent += 1
        except Exception as e:  # WebPushException carries the response of the push service
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                await db.push_subs.delete_one({"endpoint": s["endpoint"]})
            else:
                logger.warning("push to %s failed: %s", s["endpoint"][:40], e)
    return sent
