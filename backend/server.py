from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import hmac
import time
import secrets
import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator

import stt
import push
import storage
from translation import TranslationEngine
from languages import LANGUAGES, RTL_CODES
from security import (
    limiter, client_ip, ALLOWED_UPLOADS, IMAGE_TYPES, AUDIO_TYPES, normalize_content_type, sniff_ok,
    clean_filename, download_headers, USERNAME_RE, PHONE_RE, normalize_phone,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

APP_ENV = os.environ.get("APP_ENV", "production")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
if len(JWT_SECRET) < 32:
    if APP_ENV == "production":
        raise RuntimeError("JWT_SECRET must be at least 32 characters (generate one with: openssl rand -hex 32)")
    logger.warning("JWT_SECRET is short; fine for tests, not for production")
JWT_ALG = "HS256"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
MAX_UPLOAD_BYTES = int(float(os.environ.get("MAX_UPLOAD_MB", "15")) * 1024 * 1024)
MAX_VOICE_BYTES = 25 * 1024 * 1024
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
LANG_CODES = {l["code"] for l in LANGUAGES}

# One translation register for everybody (the engine can do formal/casual, the app does not expose it).
DEFAULT_TONE = "neutral"

engine = TranslationEngine(db)

app = FastAPI(title="Glott API")
api = APIRouter(prefix="/api")

_bg_tasks = set()


def spawn(coro):
    """Fire-and-forget that keeps a reference so the task is not garbage-collected mid-flight."""
    t = asyncio.create_task(coro)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return t


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Auth helpers ----------------
def _hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def _verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


DUMMY_HASH = _hash_password("not-a-real-password")


def hash_password(p: str) -> str:
    return _hash_password(p)


def verify_password(p: str, h: str) -> bool:
    return _verify_password(p, h)


async def hash_password_async(p: str) -> str:
    return await asyncio.to_thread(_hash_password, p)  # bcrypt is CPU-heavy: keep it off the event loop


async def verify_password_async(p: str, h: str) -> bool:
    return await asyncio.to_thread(_verify_password, p, h)


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    """The user's OWN profile (includes private fields). Never send this to other users."""
    if not u:
        return u
    return {k: u.get(k) for k in ["id", "name", "username", "email", "avatar", "language", "phone", "settings", "role", "created_at", "online", "last_seen", "blocked"]}


def public_profile(u: dict) -> dict:
    """What OTHER users may see: no email, phone, settings, role or block list."""
    if not u:
        return u
    show_seen = (u.get("settings") or {}).get("last_seen_enabled", True)
    return {
        "id": u.get("id"), "name": u.get("name"), "username": u.get("username"), "avatar": u.get("avatar", ""),
        "language": u.get("language", ""), "online": bool(u.get("online")),
        "last_seen": u.get("last_seen") if show_seen else None,
    }


async def user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        changed = (u or {}).get("password_changed_at")
        if u and changed and int(payload.get("iat", 0)) < int(datetime.fromisoformat(changed).timestamp()):
            return None  # signed in before the password was changed
        return u
    except Exception:
        return None


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    u = await user_from_token(token)
    if not u:
        raise HTTPException(status_code=401, detail="Invalid token")
    return u


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=60)
    invite_code: str = Field(default="", max_length=100)

    @field_validator("password")
    @classmethod
    def _password_bytes(cls, v):
        if len(v.encode("utf-8")) > 72:  # bcrypt only looks at the first 72 bytes
            raise ValueError("Password too long (max 72 bytes)")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Name required")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class GoogleIn(BaseModel):
    credential: str = Field(min_length=10, max_length=4096)
    invite_code: str = Field(default="", max_length=100)


class ProfileIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    username: Optional[str] = Field(default=None, max_length=30)
    avatar: Optional[str] = Field(default=None, max_length=600)
    language: Optional[str] = Field(default=None, max_length=8)
    phone: Optional[str] = Field(default=None, max_length=32)
    settings: Optional[dict] = None


class MessageIn(BaseModel):
    chat_id: str = Field(max_length=64)
    text: str = Field(default="", max_length=4000)
    reply_to: Optional[str] = Field(default=None, max_length=64)
    attachment: Optional[dict] = None


# ---------------- WebSocket manager ----------------
class WSManager:
    def __init__(self):
        self.conns = {}  # user_id -> set[WebSocket]
        self.last_frame = {}  # user_id -> time.monotonic() of the last frame received

    def touch(self, user_id):
        self.last_frame[user_id] = time.monotonic()

    def is_active(self, user_id, window=60):
        """Connected AND heard from recently: a phone that went to sleep leaves a half-open socket behind."""
        return user_id in self.conns and time.monotonic() - self.last_frame.get(user_id, 0) < window

    async def connect(self, user_id, ws):
        await ws.accept()
        self.conns.setdefault(user_id, set()).add(ws)
        self.touch(user_id)
        await db.users.update_one({"id": user_id}, {"$set": {"online": True}})

    def disconnect(self, user_id, ws):
        if user_id in self.conns:
            self.conns[user_id].discard(ws)
            if not self.conns[user_id]:
                del self.conns[user_id]

    def is_online(self, user_id):
        return user_id in self.conns

    async def send(self, user_id, payload):
        for ws in list(self.conns.get(user_id, [])):
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                pass


ws_manager = WSManager()


async def chat_member_ids(chat_id):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    return chat["members"] if chat else []


async def get_chat_for(chat_id: str, user: dict) -> dict:
    """Load a chat the user belongs to, or 403 (same answer for 'missing' and 'not a member')."""
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or user["id"] not in chat["members"]:
        raise HTTPException(status_code=403, detail="Not a member")
    return chat


FILE_REF_RE = re.compile(r"^(?:https?://[^\s/]+)?/api/files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")


async def validate_avatar_ref(value: str) -> str:
    """An avatar must point to an image uploaded to this app (or be empty)."""
    if not value:
        return ""
    m = FILE_REF_RE.match(value)
    rec = await db.files.find_one({"id": m.group(1), "is_deleted": False}) if m else None
    if not rec or rec.get("content_type") not in IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Avatar must be an uploaded image")
    return value


# ---------------- Misc endpoints ----------------
@api.get("/health")
async def health():
    return {"ok": True}


def invite_code_required() -> bool:
    return bool(os.environ.get("INVITE_CODE", "").strip())


def check_invite_code(given: str):
    """When INVITE_CODE is set, creating a new account needs that code (existing accounts are unaffected)."""
    expected = os.environ.get("INVITE_CODE", "").strip()
    if expected and not hmac.compare_digest((given or "").strip().encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid invite code")


@api.get("/config")
async def public_config():
    return {"google_client_id": GOOGLE_CLIENT_ID, "voice_transcription": stt.enabled(),
            "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024), "invite_required": invite_code_required()}


@api.get("/languages")
async def languages():
    return LANGUAGES


# ---------------- Auth endpoints ----------------
def make_username(seed: str) -> str:
    base = re.sub(r"[^a-z0-9_.]", "", seed.lower())[:20] or "user"
    return base + uuid.uuid4().hex[:4]


def new_user_doc(email, name, password_hash="", avatar="", provider=None):
    doc = {
        "id": str(uuid.uuid4()), "email": email, "password_hash": password_hash,
        "name": name, "username": make_username(email.split("@")[0]), "avatar": avatar, "language": "",
        "settings": {"show_original": True, "last_seen_enabled": True}, "glossary": [],
        "role": "user", "online": False, "last_seen": None, "created_at": now_iso(),
    }
    if provider:
        doc["auth_provider"] = provider
    return doc


@api.post("/auth/register")
async def register(body: RegisterIn, request: Request):
    limiter.check(f"register-ip:{client_ip(request)}", 10, 3600, "Too many sign-ups from this address. Try again later.")
    check_invite_code(body.invite_code)
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = new_user_doc(email, body.name, await hash_password_async(body.password))
    await db.users.insert_one(dict(doc))
    return {"token": create_token(doc["id"]), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    limiter.check(f"login-ip:{client_ip(request)}", 30, 600, "Too many attempts. Try again in a few minutes.")
    email = body.email.lower()
    fail_key = f"login-fail:{email}"
    if limiter.is_limited(fail_key, 8, 900):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.", headers={"Retry-After": "900"})
    u = await db.users.find_one({"email": email}, {"_id": 0})
    hashed = (u or {}).get("password_hash") or DUMMY_HASH  # always do one bcrypt check: same timing for unknown emails
    ok = await verify_password_async(body.password, hashed) and bool(u) and bool(u.get("password_hash"))
    if not ok:
        limiter.add(fail_key, 900)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    limiter.reset(fail_key)
    return {"token": create_token(u["id"]), "user": public_user(u)}


def _verify_google(credential: str) -> dict:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
    return id_token.verify_oauth2_token(credential, grequests.Request(), GOOGLE_CLIENT_ID)


@api.post("/auth/google")
async def google_login(body: GoogleIn, request: Request):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    limiter.check(f"google-ip:{client_ip(request)}", 30, 600)
    try:
        info = await asyncio.to_thread(_verify_google, body.credential)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account email is not verified")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        u = existing
    else:
        check_invite_code(body.invite_code)
        u = new_user_doc(email, (info.get("name") or email.split("@")[0])[:60], "", info.get("picture", ""), provider="google")
        await db.users.insert_one(dict(u))
    return {"token": create_token(u["id"]), "user": public_user(u)}


class ChangePasswordIn(BaseModel):
    current_password: str = Field(default="", max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def _bytes(cls, v):
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password too long (max 72 bytes)")
        return v


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    limiter.check(f"chpw:{user['id']}", 10, 3600, "Too many attempts. Try again later.")
    if user.get("password_hash"):  # accounts created with Google have no password yet: they may set one
        if not await verify_password_async(body.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is wrong")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "password_hash": await hash_password_async(body.new_password), "password_changed_at": now_iso()}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"token": create_token(user["id"]), "user": public_user(fresh)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api.put("/auth/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    raw = {k: v for k, v in body.model_dump().items() if v is not None}
    updates = {}
    if "name" in raw:
        name = raw["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name required")
        updates["name"] = name
    if "language" in raw:
        if raw["language"] not in LANG_CODES:
            raise HTTPException(status_code=400, detail="Unsupported language")
        updates["language"] = raw["language"]
    if "phone" in raw:
        phone = normalize_phone(raw["phone"])
        if phone and not PHONE_RE.match(phone):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        updates["phone"] = phone
    if "avatar" in raw:
        updates["avatar"] = await validate_avatar_ref(raw["avatar"])
    if "username" in raw:
        username = raw["username"].strip().lower()
        if not USERNAME_RE.match(username):
            raise HTTPException(status_code=400, detail="Username must be 3-30 characters: letters, numbers, dot or underscore")
        if await db.users.find_one({"username": username, "id": {"$ne": user["id"]}}):
            raise HTTPException(status_code=400, detail="Username taken")
        updates["username"] = username
    if raw.get("settings"):
        for k in ("show_original", "last_seen_enabled"):
            if k in raw["settings"]:
                updates[f"settings.{k}"] = bool(raw["settings"][k])
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return public_user(u)


# ---------------- Contacts / users ----------------
@api.get("/users/search")
async def search_users(q: str, user=Depends(get_current_user)):
    """Find people by username (prefix), exact email or exact phone. Never lists the directory."""
    limiter.check(f"search:{user['id']}", 30, 60)
    q = q.strip().lower().lstrip("@")
    if len(q) < 3 or len(q) > 64:
        return []
    conds = [{"username": {"$regex": "^" + re.escape(q)}}]
    if "@" in q:
        conds.append({"email": q})
    phone = normalize_phone(q)
    if PHONE_RE.match(phone):
        conds.append({"phone": phone})
    me_full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "blocked": 1}) or {}
    exclude = [user["id"]] + list(me_full.get("blocked", []))
    cur = db.users.find({"id": {"$nin": exclude}, "role": {"$ne": "admin"}, "blocked": {"$ne": user["id"]}, "$or": conds}, {"_id": 0}).limit(20)
    return [public_profile(u) for u in await cur.to_list(20)]


@api.post("/contacts/request/{target_id}")
async def contact_request(target_id: str, user=Depends(get_current_user)):
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    target = await db.users.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["id"] in target.get("blocked", []):
        raise HTTPException(status_code=403, detail="You cannot contact this user")
    existing = await db.contacts.find_one({"user_id": user["id"], "contact_id": target_id})
    if existing:
        return {"status": existing["status"]}
    now = now_iso()
    await db.contacts.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "contact_id": target_id, "status": "pending_out", "created_at": now})
    await db.contacts.insert_one({"id": str(uuid.uuid4()), "user_id": target_id, "contact_id": user["id"], "status": "pending_in", "created_at": now})
    await ws_manager.send(target_id, {"type": "contact_request", "from": public_profile(user)})
    return {"status": "pending_out"}


@api.post("/contacts/accept/{requester_id}")
async def contact_accept(requester_id: str, user=Depends(get_current_user)):
    pending = await db.contacts.find_one({"user_id": user["id"], "contact_id": requester_id, "status": "pending_in"})
    if not pending:
        raise HTTPException(status_code=404, detail="No pending request from this user")
    await db.contacts.update_one({"user_id": user["id"], "contact_id": requester_id}, {"$set": {"status": "accepted"}})
    await db.contacts.update_one({"user_id": requester_id, "contact_id": user["id"]}, {"$set": {"status": "accepted"}})
    chat = await get_or_create_direct(user["id"], requester_id)
    await ws_manager.send(requester_id, {"type": "contact_accepted", "chat": chat})
    return {"status": "accepted", "chat": chat}


@api.post("/contacts/decline/{requester_id}")
async def contact_decline(requester_id: str, user=Depends(get_current_user)):
    await db.contacts.delete_many({"$or": [
        {"user_id": user["id"], "contact_id": requester_id},
        {"user_id": requester_id, "contact_id": user["id"]},
    ]})
    return {"status": "declined"}


@api.get("/contacts/requests")
async def pending_requests(user=Depends(get_current_user)):
    cur = db.contacts.find({"user_id": user["id"], "status": "pending_in"}, {"_id": 0})
    out = []
    for c in await cur.to_list(100):
        u = await db.users.find_one({"id": c["contact_id"]}, {"_id": 0})
        if u:
            out.append(public_profile(u))
    return out


# ---------------- Messages: views ----------------
def message_view(msg, user_lang, uid=None):
    """Return the message with the text the given user should see."""
    out = {k: v for k, v in msg.items() if k not in ("translations_by_user", "deleted_for")}
    tr = msg.get("translations", {})
    mine = (msg.get("translations_by_user") or {}).get(uid) if uid else None
    entry = mine or tr.get(user_lang)
    if msg["original_language"] == user_lang or not entry:
        out["display_text"] = msg["original_text"]
        out["is_translated"] = False
        out["translated_from"] = None
    else:
        out["display_text"] = entry["text"]
        out["is_translated"] = True
        out["translated_from"] = msg["original_language"]
    return out


# ---------------- Chats ----------------
async def enrich_chat(chat, me_id):
    members = []
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0})
        if u:
            mu = public_profile(u)
            mu["online"] = ws_manager.is_online(mid)
            mu["is_admin"] = mid in chat.get("admins", [])
            members.append(mu)
    me_lang = next((m["language"] for m in members if m["id"] == me_id), "en") or "en"
    last = await db.messages.find_one({"chat_id": chat["id"], "deleted_for": {"$ne": me_id}}, {"_id": 0}, sort=[("created_at", -1)])
    if last:
        last = message_view(last, me_lang, me_id)
    unread = await db.messages.count_documents({"chat_id": chat["id"], "sender_id": {"$ne": me_id}, "read_by": {"$ne": me_id},
                                                "deleted_for": {"$ne": me_id}})
    out = dict(chat)
    out.pop("hidden_for", None)  # who deleted the chat is private to each person
    out["members_info"] = members
    out["last_message"] = last
    out["unread"] = unread
    if chat["type"] == "direct":
        other = next((m for m in members if m["id"] != me_id), None)
        out["display_name"] = other["name"] if other else "Chat"
        out["display_avatar"] = other["avatar"] if other else ""
        out["other_user"] = other
    else:
        out["display_name"] = chat.get("name", "Group")
        out["display_avatar"] = chat.get("avatar", "")
        out["description"] = chat.get("description", "")
    return out


# ---------------- Block & report ----------------
class ReportIn(BaseModel):
    reason: str = Field(default="", max_length=1000)


async def _require_other_user(uid: str, user: dict):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Not allowed on yourself")
    if not await db.users.find_one({"id": uid}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="User not found")


@api.post("/users/{uid}/block")
async def block_user(uid: str, user=Depends(get_current_user)):
    await _require_other_user(uid, user)
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"blocked": uid}})
    return {"ok": True}


@api.post("/users/{uid}/unblock")
async def unblock_user(uid: str, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"blocked": uid}})
    return {"ok": True}


@api.get("/users/blocked")
async def blocked_list(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("blocked", [])


@api.post("/users/{uid}/report")
async def report_user(uid: str, body: ReportIn, user=Depends(get_current_user)):
    limiter.check(f"report:{user['id']}", 10, 3600)
    await _require_other_user(uid, user)
    await db.reports.insert_one({"id": str(uuid.uuid4()), "reporter": user["id"], "reported": uid,
                                 "reason": body.reason, "created_at": now_iso()})
    return {"ok": True}


async def get_or_create_direct(a, b):
    chat = await db.chats.find_one({"type": "direct", "members": {"$all": [a, b], "$size": 2}}, {"_id": 0})
    if not chat:
        chat = {"id": str(uuid.uuid4()), "type": "direct", "name": "", "members": [a, b],
                "admins": [], "tone": DEFAULT_TONE, "created_at": now_iso()}
        await db.chats.insert_one(dict(chat))
    elif a in chat.get("hidden_for", []):
        await db.chats.update_one({"id": chat["id"]}, {"$pull": {"hidden_for": a}})
    return await enrich_chat(chat, a)


@api.get("/chats")
async def list_chats(user=Depends(get_current_user)):
    cur = db.chats.find({"members": user["id"], "hidden_for": {"$ne": user["id"]}}, {"_id": 0})
    chats = [await enrich_chat(c, user["id"]) for c in await cur.to_list(200)]
    chats.sort(key=lambda c: (c["last_message"]["created_at"] if c["last_message"] else c["created_at"]), reverse=True)
    return chats


@api.post("/chats/direct/{other_id}")
async def create_direct(other_id: str, user=Depends(get_current_user)):
    if other_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot chat with yourself")
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    if user["id"] in other.get("blocked", []):
        raise HTTPException(status_code=403, detail="You cannot message this user")
    return await get_or_create_direct(user["id"], other_id)


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    member_ids: List[str] = Field(max_length=49)


async def _valid_member_ids(ids, adder_id):
    """Existing users who have not blocked the person adding them."""
    ids = [i for i in dict.fromkeys(ids) if isinstance(i, str)]
    cur = db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "blocked": 1})
    return [u["id"] for u in await cur.to_list(100) if adder_id not in u.get("blocked", [])]


@api.post("/chats/group")
async def create_group(body: GroupIn, user=Depends(get_current_user)):
    limiter.check(f"group:{user['id']}", 10, 3600)
    valid = await _valid_member_ids(body.member_ids, user["id"])
    members = ([user["id"]] + [m for m in valid if m != user["id"]])[:50]
    chat = {"id": str(uuid.uuid4()), "type": "group", "name": body.name.strip(), "members": members,
            "admins": [user["id"]], "tone": DEFAULT_TONE, "created_at": now_iso()}
    await db.chats.insert_one(dict(chat))
    enriched = await enrich_chat(chat, user["id"])
    for m in members:
        await ws_manager.send(m, {"type": "new_chat", "chat": await enrich_chat(chat, m)})
    return enriched


@api.post("/chats/{chat_id}/delete")
async def delete_chat_for_me(chat_id: str, user=Depends(get_current_user)):
    """Remove the conversation from my list and clear my copy of its history. Other members are not affected;
    the chat comes back (empty) if someone writes again or if I start it again."""
    await get_chat_for(chat_id, user)
    await db.messages.update_many({"chat_id": chat_id}, {"$addToSet": {"deleted_for": user["id"]}})
    await db.chats.update_one({"id": chat_id}, {"$addToSet": {"hidden_for": user["id"]}})
    return {"ok": True}


class AddMembersIn(BaseModel):
    member_ids: List[str] = Field(max_length=49)


@api.post("/chats/{chat_id}/members")
async def add_members(chat_id: str, body: AddMembersIn, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or chat["type"] != "group" or user["id"] not in chat["members"]:
        raise HTTPException(status_code=404, detail="Group not found")
    if user["id"] not in chat.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can add members")
    valid = await _valid_member_ids(body.member_ids, user["id"])
    new_members = list(dict.fromkeys(chat["members"] + valid))[:50]
    await db.chats.update_one({"id": chat_id}, {"$set": {"members": new_members}})
    chat["members"] = new_members
    for mid in new_members:
        await ws_manager.send(mid, {"type": "new_chat", "chat": await enrich_chat(chat, mid)})
    return await enrich_chat(chat, user["id"])


@api.post("/chats/{chat_id}/leave")
async def leave_group(chat_id: str, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or chat["type"] != "group" or user["id"] not in chat["members"]:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.chats.update_one({"id": chat_id}, {"$pull": {"members": user["id"], "admins": user["id"]}})
    remaining = [m for m in chat["members"] if m != user["id"]]
    if remaining and not [a for a in chat.get("admins", []) if a in remaining]:
        await db.chats.update_one({"id": chat_id}, {"$addToSet": {"admins": remaining[0]}})
    for mid in remaining:
        await ws_manager.send(mid, {"type": "chat_updated", "chat_id": chat_id})
    return {"ok": True}


@api.put("/chats/{chat_id}/admin/{uid}")
async def promote_admin(chat_id: str, uid: str, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or user["id"] not in chat.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can promote")
    if uid not in chat.get("members", []):
        raise HTTPException(status_code=400, detail="User is not a member")
    await db.chats.update_one({"id": chat_id}, {"$addToSet": {"admins": uid}})
    return {"ok": True}


class GroupInfoIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    avatar: Optional[str] = Field(default=None, max_length=600)
    description: Optional[str] = Field(default=None, max_length=500)


@api.put("/chats/{chat_id}/info")
async def update_group_info(chat_id: str, body: GroupInfoIn, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or chat["type"] != "group" or user["id"] not in chat["members"]:
        raise HTTPException(status_code=404, detail="Group not found")
    if user["id"] not in chat.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can edit group")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "avatar" in updates:
        updates["avatar"] = await validate_avatar_ref(updates["avatar"])
    if updates:
        await db.chats.update_one({"id": chat_id}, {"$set": updates})
        chat.update(updates)
    for mid in chat["members"]:
        await ws_manager.send(mid, {"type": "chat_updated", "chat_id": chat_id})
    return await enrich_chat(chat, user["id"])


# ---------------- Messages ----------------
async def translate_message_async(msg_id, chat_id, sender_lang, text, tone, notify=False):
    """Translate one message for every recipient language, then push the update. Never leaves a
    message stuck in 'translating'."""
    status, translations, by_user = "translation_failed", {}, {}
    members = []
    try:
        chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
        members = chat["members"] if chat else []
        users = {}
        for mid in members:
            u = await db.users.find_one({"id": mid}, {"_id": 0})
            if u:
                users[mid] = u
        jobs = {}  # (lang, glossary) -> [user ids]
        for mid, u in users.items():
            lang = u.get("language")
            if lang and lang != sender_lang:
                glossary = "; ".join(f"{g['term']}={g.get('rule', 'keep')}" for g in u.get("glossary", []))
                jobs.setdefault((lang, glossary), []).append(mid)
        keys = list(jobs)
        results = await asyncio.gather(
            *[engine.translate(text, sender_lang, lang, tone=tone, glossary=gl) for lang, gl in keys],
            return_exceptions=True,
        )
        missing = 0
        for (lang, gl), res in zip(keys, results):
            if isinstance(res, dict):
                entry = {"text": res["text"], "provider": res["provider"]}
                if gl:
                    for mid in jobs[(lang, gl)]:
                        by_user[mid] = entry
                else:
                    translations[lang] = entry
            else:
                missing += 1
        status = "translation_failed" if missing else "sent"
    except Exception:
        logger.exception("translation job failed for message %s", msg_id)
    finally:
        await db.messages.update_one({"id": msg_id}, {"$set": {"translations": translations, "translations_by_user": by_user, "status": status}})
        msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
        if msg:
            for mid in members:
                u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
                await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat_id})
            if notify:
                await notify_offline(msg, await db.chats.find_one({"id": chat_id}, {"_id": 0}))


PUSH_CONTACT = "mailto:" + (os.environ.get("ADMIN_EMAIL", "").strip() or "admin@example.com")


def push_preview(view):
    t = (view.get("display_text") or "").strip()
    if t:
        return t[:140]
    att = view.get("attachment")
    if att:
        return "📷 Photo" if att.get("is_image") else "📎 Attachment"
    return "New message"


async def notify_offline(msg, chat):
    """Web Push to the members who are not using the app right now (never to the sender)."""
    if not chat:
        return
    try:
        for mid in chat["members"]:
            if mid == msg["sender_id"] or ws_manager.is_active(mid):
                continue
            u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1, "blocked": 1})
            if not u or msg["sender_id"] in (u.get("blocked") or []):
                continue
            if not await db.push_subs.find_one({"user_id": mid}, {"_id": 0, "endpoint": 1}):
                continue
            view = message_view(msg, u.get("language") or "en", mid)
            title = msg["sender_name"] if chat["type"] == "direct" else f"{msg['sender_name']} · {chat.get('name') or 'Group'}"
            await push.send_to_user(db, mid, {"title": title, "body": push_preview(view), "chat_id": chat["id"]}, PUSH_CONTACT)
    except Exception:
        logger.exception("push notification failed")


async def resolve_attachment(att, user):
    """Rebuild the attachment from our own file record: the client only gets to name a file it uploaded."""
    if not att:
        return None
    fid = att.get("id") if isinstance(att, dict) else None
    rec = await db.files.find_one({"id": fid, "is_deleted": False, "owner_id": user["id"]}, {"_id": 0}) if isinstance(fid, str) else None
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid attachment")
    ct = rec["content_type"]
    return {"id": rec["id"], "url": f"/api/files/{rec['id']}", "filename": rec["original_filename"],
            "content_type": ct, "is_image": ct in IMAGE_TYPES, "is_voice": bool(rec.get("is_voice"))}


async def deliver(msg, chat):
    if chat.get("hidden_for"):
        await db.chats.update_one({"id": chat["id"]}, {"$set": {"hidden_for": []}})
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
        await ws_manager.send(mid, {"type": "new_message", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat["id"]})


def new_message_doc(chat_id, user, text, lang, attachment, reply_to, status):
    return {
        "id": str(uuid.uuid4()), "chat_id": chat_id, "sender_id": user["id"],
        "sender_name": user["name"], "sender_avatar": user.get("avatar", ""),
        "original_text": text, "original_language": lang, "translations": {}, "translations_by_user": {},
        "attachment": attachment, "reply_to": reply_to, "status": status, "read_by": [user["id"]],
        "deleted_for": [], "deleted_for_all": False, "reactions": {}, "created_at": now_iso(),
    }


@api.post("/messages")
async def send_message(body: MessageIn, user=Depends(get_current_user)):
    limiter.check(f"msg:{user['id']}", 60, 60, "You are sending messages too fast.")
    text = body.text.strip()
    if not text and not body.attachment:
        raise HTTPException(status_code=400, detail="Message is empty")
    chat = await get_chat_for(body.chat_id, user)
    if chat["type"] == "direct":
        other_id = next((m for m in chat["members"] if m != user["id"]), None)
        if other_id:
            other = await db.users.find_one({"id": other_id}, {"_id": 0})
            me_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
            if other and (user["id"] in other.get("blocked", []) or other_id in me_full.get("blocked", [])):
                raise HTTPException(status_code=403, detail="You cannot message this user")
    if body.reply_to and not await db.messages.find_one({"id": body.reply_to, "chat_id": body.chat_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=400, detail="Reply target not found in this chat")
    attachment = await resolve_attachment(body.attachment, user)
    sender_lang = user.get("language") or "en"
    msg = new_message_doc(body.chat_id, user, text, sender_lang, attachment, body.reply_to, "translating" if text else "sent")
    await db.messages.insert_one(dict(msg))
    await deliver(msg, chat)  # instant broadcast of the original
    if text:
        spawn(translate_message_async(msg["id"], body.chat_id, sender_lang, text, DEFAULT_TONE, notify=True))
    else:
        spawn(notify_offline(msg, chat))
    return message_view(msg, sender_lang, user["id"])


@api.post("/voice")
async def send_voice(chat_id: str = Form(...), file: UploadFile = File(...), user=Depends(get_current_user)):
    if os.environ.get("VOICE_MESSAGES", "").strip().lower() != "true":
        raise HTTPException(status_code=404, detail="Voice messages are not available")
    limiter.check(f"voice:{user['id']}", 20, 60)
    chat = await get_chat_for(chat_id, user)
    ct = normalize_content_type(file.content_type)
    if ct not in AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    data = await file.read(MAX_VOICE_BYTES + 1)
    if len(data) > MAX_VOICE_BYTES:
        raise HTTPException(status_code=413, detail="Voice message too large (max 25MB)")
    ext = AUDIO_TYPES[ct]
    filename = clean_filename(file.filename, f"voice.{ext}")
    stored = await storage.put_object(f"lingua/voice/{user['id']}/{uuid.uuid4()}.{ext}", data, ct)
    fid = str(uuid.uuid4())
    await db.files.insert_one({"id": fid, "storage_path": stored["path"], "original_filename": filename, "content_type": ct,
                               "size": stored.get("size", len(data)), "owner_id": user["id"], "is_voice": True,
                               "is_deleted": False, "created_at": now_iso()})
    sender_lang = user.get("language") or "en"
    transcript = await stt.transcribe(data, f"audio.{ext}", ct, sender_lang)
    attachment = {"id": fid, "url": f"/api/files/{fid}", "filename": filename, "content_type": ct, "is_image": False, "is_voice": True}
    status = "translating" if transcript else ("transcription_failed" if stt.enabled() else "sent")
    msg = new_message_doc(chat_id, user, transcript, sender_lang, attachment, None, status)
    await db.messages.insert_one(dict(msg))
    await deliver(msg, chat)
    if transcript:
        spawn(translate_message_async(msg["id"], chat_id, sender_lang, transcript, DEFAULT_TONE))
    return message_view(msg, sender_lang, user["id"])


@api.get("/messages/{chat_id}")
async def get_messages(chat_id: str, before: Optional[str] = None, limit: int = 50, user=Depends(get_current_user)):
    await get_chat_for(chat_id, user)
    limit = max(1, min(limit, 100))
    query = {"chat_id": chat_id, "deleted_for": {"$ne": user["id"]}}
    if before:
        query["created_at"] = {"$lt": before}
    cur = db.messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    msgs = await cur.to_list(limit)
    msgs.reverse()
    lang = user.get("language", "en")
    return [message_view(m, lang, user["id"]) for m in msgs]


@api.get("/messages/{chat_id}/search")
async def search_messages(chat_id: str, q: str, user=Depends(get_current_user)):
    limiter.check(f"msgsearch:{user['id']}", 30, 60)
    await get_chat_for(chat_id, user)
    q = q.strip()[:100]
    if not q:
        return []
    lang = user.get("language", "en")
    if lang not in LANG_CODES:
        lang = "en"
    rx = {"$regex": re.escape(q), "$options": "i"}
    query = {"chat_id": chat_id, "deleted_for": {"$ne": user["id"]}, "deleted_for_all": {"$ne": True},
             "$or": [{"original_text": rx}, {f"translations.{lang}.text": rx}]}
    cur = db.messages.find(query, {"_id": 0}).sort("created_at", -1).limit(50)
    msgs = await cur.to_list(50)
    return [message_view(m, lang, user["id"]) for m in msgs]


@api.post("/messages/{chat_id}/read")
async def mark_read(chat_id: str, user=Depends(get_current_user)):
    chat = await get_chat_for(chat_id, user)
    await db.messages.update_many({"chat_id": chat_id, "read_by": {"$ne": user["id"]}}, {"$addToSet": {"read_by": user["id"]}})
    for mid in chat["members"]:
        await ws_manager.send(mid, {"type": "read_receipt", "chat_id": chat_id, "reader": user["id"]})
    return {"ok": True}


@api.post("/messages/{msg_id}/retry")
async def retry_translation(msg_id: str, user=Depends(get_current_user)):
    limiter.check(f"retry:{user['id']}", 20, 60)
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = await get_chat_for(msg["chat_id"], user)
    if msg.get("deleted_for_all") or not msg.get("original_text"):
        raise HTTPException(status_code=400, detail="Nothing to translate")
    spawn(translate_message_async(msg_id, msg["chat_id"], msg["original_language"], msg["original_text"], DEFAULT_TONE))
    return {"ok": True}


@api.delete("/messages/{msg_id}")
async def delete_message(msg_id: str, for_all: bool = False, user=Depends(get_current_user)):
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = await get_chat_for(msg["chat_id"], user)
    if for_all:
        if msg["sender_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the sender can delete a message for everyone")
        await db.messages.update_one({"id": msg_id}, {"$set": {"deleted_for_all": True, "original_text": "", "translations": {}, "translations_by_user": {}, "attachment": None}})
        for mid in chat["members"]:
            await ws_manager.send(mid, {"type": "message_deleted", "message_id": msg_id, "chat_id": msg["chat_id"]})
    else:
        await db.messages.update_one({"id": msg_id}, {"$addToSet": {"deleted_for": user["id"]}})
    return {"ok": True}


EDIT_WINDOW = timedelta(minutes=30)
REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]


class EditIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@api.put("/messages/{msg_id}")
async def edit_message(msg_id: str, body: EditIn, user=Depends(get_current_user)):
    limiter.check(f"edit:{user['id']}", 30, 60)
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = await get_chat_for(msg["chat_id"], user)
    if msg["sender_id"] != user["id"] or msg.get("deleted_for_all"):
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    if (msg.get("attachment") or {}).get("is_voice"):
        raise HTTPException(status_code=400, detail="Voice messages cannot be edited")
    if datetime.now(timezone.utc) - datetime.fromisoformat(msg["created_at"]) > EDIT_WINDOW:
        raise HTTPException(status_code=400, detail="Messages can only be edited for 30 minutes")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    lang = user.get("language") or "en"
    if text != msg["original_text"]:
        await db.messages.update_one({"id": msg_id}, {"$set": {
            "original_text": text, "original_language": lang, "translations": {}, "translations_by_user": {},
            "status": "translating", "edited": True, "edited_at": now_iso()}})
        msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
        for mid in chat["members"]:
            u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
            await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat["id"]})
        spawn(translate_message_async(msg_id, chat["id"], lang, text, DEFAULT_TONE))
    return message_view(msg, lang, user["id"])


class ReactIn(BaseModel):
    emoji: str = Field(max_length=8)


@api.post("/messages/{msg_id}/react")
async def react_to_message(msg_id: str, body: ReactIn, user=Depends(get_current_user)):
    """One reaction per person per message; sending the same emoji again takes it back."""
    limiter.check(f"react:{user['id']}", 60, 60)
    if body.emoji not in REACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported reaction")
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = await get_chat_for(msg["chat_id"], user)
    if msg.get("deleted_for_all"):
        raise HTTPException(status_code=400, detail="Message was deleted")
    reactions = {e: [u for u in users if u != user["id"]] for e, users in (msg.get("reactions") or {}).items()}
    had = user["id"] in (msg.get("reactions") or {}).get(body.emoji, [])
    if not had:
        reactions.setdefault(body.emoji, []).append(user["id"])
    reactions = {e: users for e, users in reactions.items() if users}
    await db.messages.update_one({"id": msg_id}, {"$set": {"reactions": reactions}})
    msg["reactions"] = reactions
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
        await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat["id"]})
    return {"reactions": reactions}


# ---------------- Notifications (Web Push) ----------------
class PushKeys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(max_length=600)
    keys: PushKeys


@api.get("/push/key")
async def push_key(user=Depends(get_current_user)):
    _, public = await push.get_vapid(db)
    return {"public_key": public}


@api.post("/push/subscribe")
async def push_subscribe(body: PushSubscribeIn, user=Depends(get_current_user)):
    limiter.check(f"push-sub:{user['id']}", 20, 3600)
    if not push.endpoint_allowed(body.endpoint):
        raise HTTPException(status_code=400, detail="Unsupported push service")
    await db.push_subs.update_one(
        {"endpoint": body.endpoint},
        {"$set": {"user_id": user["id"], "keys": body.keys.model_dump(), "created_at": now_iso()}}, upsert=True)
    mine = await db.push_subs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for old in mine[push.MAX_SUBSCRIPTIONS_PER_USER:]:
        await db.push_subs.delete_one({"endpoint": old["endpoint"]})
    return {"ok": True}


@api.post("/push/unsubscribe")
async def push_unsubscribe(body: dict, user=Depends(get_current_user)):
    endpoint = body.get("endpoint") if isinstance(body, dict) else None
    if isinstance(endpoint, str):
        await db.push_subs.delete_one({"endpoint": endpoint, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Glossary ----------------
class GlossaryIn(BaseModel):
    term: str = Field(min_length=1, max_length=60)
    rule: str = Field(min_length=1, max_length=120)

    @field_validator("term", "rule")
    @classmethod
    def _clean(cls, v):
        v = re.sub(r"[<>\r\n\t;=]+", " ", v).strip()
        if not v:
            raise ValueError("Empty value")
        return v


MAX_GLOSSARY = 50


@api.get("/glossary")
async def get_glossary(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("glossary", [])


@api.post("/glossary")
async def add_glossary(body: GlossaryIn, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if len(u.get("glossary", [])) >= MAX_GLOSSARY:
        raise HTTPException(status_code=400, detail=f"Glossary is full (max {MAX_GLOSSARY} entries)")
    await db.users.update_one({"id": user["id"]}, {"$push": {"glossary": {"term": body.term, "rule": body.rule}}})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("glossary", [])


@api.delete("/glossary/{term}")
async def del_glossary(term: str, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"glossary": {"term": term}}})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("glossary", [])


# ---------------- Files ----------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    limiter.check(f"upload:{user['id']}", 20, 60)
    ct = normalize_content_type(file.content_type)
    if ct not in ALLOWED_UPLOADS:
        raise HTTPException(status_code=415, detail="This file type is not allowed")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
    if not data or not sniff_ok(ct, data):
        raise HTTPException(status_code=415, detail="File content does not match its type")
    ext = ALLOWED_UPLOADS[ct]  # extension comes from the validated type, never from the file name
    filename = clean_filename(file.filename, f"file.{ext}")
    stored = await storage.put_object(f"lingua/uploads/{user['id']}/{uuid.uuid4()}.{ext}", data, ct)
    fid = str(uuid.uuid4())
    size = stored.get("size", len(data))
    await db.files.insert_one({"id": fid, "storage_path": stored["path"], "original_filename": filename, "content_type": ct,
                               "size": size, "owner_id": user["id"], "is_deleted": False, "created_at": now_iso()})
    return {"id": fid, "url": f"/api/files/{fid}", "filename": filename, "content_type": ct, "size": size, "is_image": ct in IMAGE_TYPES}


@api.get("/files/{file_id}")
async def download(file_id: str):
    """Files are addressed by an unguessable random id (like most chat apps' media links): possession of
    the link is the permission. They can't run code in the browser: fixed content type, nosniff, CSP sandbox."""
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await storage.get_object(rec["storage_path"])
    except storage.StorageError:
        raise HTTPException(status_code=404, detail="File not found")
    ct = rec.get("content_type") or "application/octet-stream"
    return Response(content=data, media_type=ct, headers=download_headers(rec.get("original_filename") or "file", ct))


# ---------------- Admin dashboard ----------------
@api.get("/admin/stats")
async def admin_stats(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    pipeline = [{"$group": {"_id": {"$substr": ["$created_at", 0, 10]},
                            "count": {"$sum": 1}, "chars": {"$sum": "$chars"}, "cost": {"$sum": "$est_cost"}}},
                {"$sort": {"_id": -1}}, {"$limit": 30}]
    daily = await db.translation_logs.aggregate(pipeline).to_list(30)
    total = await db.translation_logs.count_documents({})
    cost_agg = await db.translation_logs.aggregate([{"$group": {"_id": None, "cost": {"$sum": "$est_cost"}, "chars": {"$sum": "$chars"}}}]).to_list(1)
    return {"total_translations": total,
            "total_cost": round(cost_agg[0]["cost"], 4) if cost_agg else 0,
            "total_chars": cost_agg[0]["chars"] if cost_agg else 0,
            "daily": [{"date": d["_id"], "count": d["count"], "cost": round(d["cost"], 4), "chars": d["chars"]} for d in daily]}


@api.get("/admin/users")
async def admin_users(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    cur = db.users.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return [{"id": u["id"], "name": u.get("name"), "email": u.get("email"), "username": u.get("username"), "role": u.get("role", "user"),
             "language": u.get("language", ""), "created_at": u.get("created_at"), "online": ws_manager.is_online(u["id"]),
             "has_password": bool(u.get("password_hash"))} for u in await cur.to_list(500)]


@api.post("/admin/users/{uid}/reset-password")
async def admin_reset_password(uid: str, user=Depends(get_current_user)):
    """Give someone who lost their password a temporary one (shown once). Their old sessions stop working."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    limiter.check(f"admin-reset:{user['id']}", 20, 3600)
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target or target["id"] == user["id"]:
        raise HTTPException(status_code=404, detail="User not found")
    temp = secrets.token_urlsafe(9)
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": await hash_password_async(temp), "password_changed_at": now_iso()}})
    limiter.reset(f"login-fail:{(target.get('email') or '').lower()}")
    return {"temporary_password": temp, "email": target.get("email")}


@api.get("/admin/client-ip")
async def admin_client_ip(request: Request, user=Depends(get_current_user)):
    """Deployment check: does the server see YOUR real address? (compare 'resolved' with what a
    'what is my IP' website shows). If it shows a proxy address instead, set CLIENT_IP_HEADER or TRUST_PROXY_HOPS."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    h = request.headers
    return {"resolved": client_ip(request), "peer": request.client.host if request.client else None,
            "x_forwarded_for": h.get("x-forwarded-for"), "cf_connecting_ip": h.get("cf-connecting-ip"),
            "x_real_ip": h.get("x-real-ip"), "trust_proxy_hops": os.environ.get("TRUST_PROXY_HOPS", "1"),
            "client_ip_header": os.environ.get("CLIENT_IP_HEADER", "")}


# ---------------- WebSocket ----------------
@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str):
    origin = (ws.headers.get("origin") or "").rstrip("/")
    if origin and "*" not in ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    user = await user_from_token(token)
    if not user:
        await ws.close(code=1008)
        return
    uid = user["id"]
    await ws_manager.connect(uid, ws)
    await _broadcast_presence(uid, True)
    try:
        while True:
            raw = await ws.receive_text()
            ws_manager.touch(uid)
            if len(raw) > 2000:
                continue
            try:
                data = json.loads(raw)
            except ValueError:
                continue
            if isinstance(data, dict) and data.get("type") == "typing" and isinstance(data.get("chat_id"), str):
                members = await chat_member_ids(data["chat_id"])
                if uid in members:  # only talk to chats you belong to
                    for mid in members:
                        if mid != uid:
                            await ws_manager.send(mid, {"type": "typing", "chat_id": data["chat_id"], "user": public_profile(user)})
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(uid, ws)
        if not ws_manager.is_online(uid):
            await db.users.update_one({"id": uid}, {"$set": {"online": False, "last_seen": now_iso()}})
            await _broadcast_presence(uid, False)


async def _broadcast_presence(uid, online):
    cur = db.chats.find({"members": uid}, {"_id": 0})
    notified = set()
    for c in await cur.to_list(500):
        for mid in c["members"]:
            if mid != uid and mid not in notified:
                notified.add(mid)
                await ws_manager.send(mid, {"type": "presence", "user_id": uid, "online": online})


# ---------------- App wiring ----------------
app.include_router(api)

MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 2 * 1024 * 1024


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    """Cheap flood protection: reject huge bodies before reading them, and cap requests per IP."""
    try:
        if int(request.headers.get("content-length", "0")) > max(MAX_BODY_BYTES, MAX_VOICE_BYTES + 2 * 1024 * 1024):
            return JSONResponse({"detail": "Request too large"}, status_code=413)
    except ValueError:
        return JSONResponse({"detail": "Bad request"}, status_code=400)
    if request.url.path.startswith("/api/"):
        try:
            limiter.check(f"ip:{client_ip(request)}", 600, 60)
        except HTTPException as e:
            return JSONResponse({"detail": e.detail}, status_code=e.status_code, headers=e.headers)
    return await call_next(request)


app.add_middleware(CORSMiddleware, allow_credentials=False,
                   allow_origins=ALLOWED_ORIGINS,
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"])


# ---------------- Startup ----------------
async def seed_demo():
    # Admin is created only when ADMIN_PASSWORD is set (credentials come from the environment only).
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if admin_pw and admin_email:
        existing_admin = await db.users.find_one({"email": admin_email})
        if not existing_admin:
            doc = new_user_doc(admin_email, "Admin", hash_password(admin_pw))
            doc.update({"username": "admin", "language": "en", "role": "admin"})
            await db.users.insert_one(doc)
        elif not verify_password(admin_pw, existing_admin.get("password_hash", "")):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})

    # Demo users only when explicitly enabled (never in production by default).
    if os.environ.get("SEED_DEMO", "").lower() != "true":
        return
    demo_pw = os.environ.get("DEMO_PASSWORD")
    if not demo_pw:
        return
    demos = [
        {"email": "giulia@lingua.app", "name": "Giulia Rossi", "username": "giulia", "language": "it"},
        {"email": "james@lingua.app", "name": "James Carter", "username": "james", "language": "en"},
    ]
    ids = []
    for d in demos:
        existing = await db.users.find_one({"email": d["email"]})
        if existing:
            ids.append(existing["id"])
            continue
        doc = new_user_doc(d["email"], d["name"], hash_password(demo_pw))
        doc.update({"username": d["username"], "language": d["language"]})
        await db.users.insert_one(doc)
        ids.append(doc["id"])
    a, b = ids
    if not await db.contacts.find_one({"user_id": a, "contact_id": b}):
        now = now_iso()
        await db.contacts.insert_many([
            {"id": str(uuid.uuid4()), "user_id": a, "contact_id": b, "status": "accepted", "created_at": now},
            {"id": str(uuid.uuid4()), "user_id": b, "contact_id": a, "status": "accepted", "created_at": now},
        ])
    await get_or_create_direct(a, b)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username")
    await db.messages.create_index([("chat_id", 1), ("created_at", -1)])
    await db.translation_cache.create_index("key", unique=True)
    # Cached translations expire after 30 days so the database does not grow forever.
    await db.translation_cache.create_index("created_at_dt", expireAfterSeconds=30 * 24 * 3600)
    storage.get_storage()  # fail early (and log) if storage is misconfigured
    await seed_demo()
    if not invite_code_required():
        logger.warning("INVITE_CODE is not set: anyone with the link can create an account")
    logger.info("Glott backend ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()
