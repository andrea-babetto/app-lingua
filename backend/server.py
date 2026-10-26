from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import hmac
import hashlib
import time
import secrets
import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator

import stt
import tts
import mailer
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
MAX_VOICE_BYTES = 8 * 1024 * 1024  # 2 minutes take well under 3MB, even on iPhone
MAX_VOICE_SECONDS = 120
VOICE_KEEP_DAYS = 30  # then the audio (and its spoken translations) is deleted; the text stays
STT_COST_PER_MIN, TTS_COST_PER_MIN = 0.003, 0.015  # OpenAI list prices (estimates) for the cost dashboard
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
LANG_CODES = {l["code"] for l in LANGUAGES}

# One translation register for everybody (the engine can do formal/casual, the app does not expose it).
DEFAULT_TONE = "neutral"

engine = TranslationEngine(db)

app = FastAPI(title="Glotter API")
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


# People who turned off "last seen & online": they also do not show when they read, and do not see when others read.
# Kept in memory (one server process) and refreshed at start-up and whenever the setting changes.
RECEIPTS_HIDDEN = set()


def hides_receipts(uid) -> bool:
    return uid in RECEIPTS_HIDDEN


def public_user(u: dict) -> dict:
    """The user's OWN profile (includes private fields). Never send this to other users."""
    if not u:
        return u
    return {k: u.get(k) for k in ["id", "name", "username", "email", "avatar", "language", "phone", "settings", "role", "created_at", "online", "last_seen", "blocked", "bio", "timezone"]}


def public_profile(u: dict) -> dict:
    """What OTHER users may see: no email, phone, settings, role or block list."""
    if not u:
        return u
    settings = u.get("settings") or {}
    show_seen = settings.get("last_seen_enabled", True)
    return {
        "id": u.get("id"), "name": u.get("name"), "username": u.get("username"), "avatar": u.get("avatar", ""),
        "language": u.get("language", ""), "online": bool(u.get("online")), "bio": u.get("bio", ""),
        "last_seen": u.get("last_seen") if show_seen else None,
        "timezone": (u.get("timezone") or "") if settings.get("local_time_enabled", True) else "",
    }


def stranger_profile(u: dict) -> dict:
    """What someone who has no chat with the person sees (search results, contact requests): no local time."""
    return {k: v for k, v in public_profile(u).items() if k != "timezone"}


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
    bio: Optional[str] = Field(default=None, max_length=140)
    timezone: Optional[str] = Field(default=None, max_length=64)  # the phone's time zone, e.g. "Asia/Kolkata"


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


def voice_messages_on() -> bool:
    return os.environ.get("VOICE_MESSAGES", "").strip().lower() == "true"


def invite_code_required() -> bool:
    return bool(os.environ.get("INVITE_CODE", "").strip())


def check_invite_code(given: str):
    """When INVITE_CODE is set, creating a new account needs that code (existing accounts are unaffected)."""
    expected = os.environ.get("INVITE_CODE", "").strip()
    if expected and not hmac.compare_digest((given or "").strip().encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid invite code")


@api.get("/config")
async def public_config():
    return {"google_client_id": GOOGLE_CLIENT_ID, "voice_messages": voice_messages_on(), "voice_transcription": stt.enabled(),
            "voice_speech": tts.enabled(), "voice_max_seconds": MAX_VOICE_SECONDS,
            "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024), "invite_required": invite_code_required(),
            "password_reset": mailer.enabled() or APP_ENV == "test"}


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
        "settings": {"show_original": True, "last_seen_enabled": True, "local_time_enabled": True}, "glossary": [],
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


# ---------------- Download my data (GDPR, right of access) ----------------
EXPORT_NOTE = ("Your data on Glotter, as of the date above. It contains your profile and settings, the messages you wrote "
               "(original text and the translations made for the people who read them), your chats, contacts, blocked people, "
               "glossary, scheduled messages, the files you sent (name and type; open them from the app), your devices for "
               "notifications and how many messages were translated each month. Messages written by other people are not "
               "included: they belong to them.")


@api.get("/auth/export")
async def export_my_data(user=Depends(get_current_user)):
    limiter.check(f"export:{user['id']}", 5, 3600, "Please wait a little before downloading your data again.")
    uid = user["id"]
    me = await db.users.find_one({"id": uid}, {"_id": 0}) or {}
    names = {}

    async def who(ids):
        missing = [i for i in ids if i not in names]
        if missing:
            async for u in db.users.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "name": 1, "username": 1}):
                names[u["id"]] = {"name": u.get("name", ""), "username": u.get("username", "")}
        return [dict(id=i, **names.get(i, {"name": "(deleted account)", "username": ""})) for i in ids]

    chats = []
    for c in await db.chats.find({"members": uid}, {"_id": 0}).to_list(2000):
        chats.append({"id": c["id"], "type": c.get("type"), "name": c.get("name", ""), "created_at": c.get("created_at"),
                      "members": await who([m for m in c.get("members", []) if m != uid]), "i_am_admin": uid in c.get("admins", [])})
    messages = []
    for m in await db.messages.find({"sender_id": uid}, {"_id": 0}).sort("created_at", 1).to_list(200000):
        if m.get("deleted_for_all"):
            continue
        tr = {lang: e.get("text", "") for lang, e in (m.get("translations") or {}).items()}
        messages.append({"id": m["id"], "chat_id": m["chat_id"], "created_at": m.get("created_at"), "language": m.get("original_language"),
                         "text": m.get("original_text", ""), "translations": tr, "edited": bool(m.get("edited")),
                         "reply_to": m.get("reply_to"), "attachment": (m.get("attachment") or {}).get("filename")})
    contacts = []
    for c in await db.contacts.find({"user_id": uid}, {"_id": 0}).to_list(5000):
        person = (await who([c["contact_id"]]))[0]
        contacts.append({**person, "status": c.get("status"), "since": c.get("created_at")})
    files = [{"name": f.get("original_filename"), "type": f.get("content_type"), "size": f.get("size"), "sent_at": f.get("created_at")}
             for f in await db.files.find({"owner_id": uid, "is_deleted": {"$ne": True}}, {"_id": 0}).to_list(20000)]
    devices = [{"added_at": d.get("created_at")} for d in await db.push_subs.find({"user_id": uid}, {"_id": 0, "created_at": 1}).to_list(100)]
    usage = [{"month": u["month"], "translated_for_me": u.get("received", 0), "my_messages_translated": u.get("sent", 0)}
             for u in await db.usage.find({"user_id": uid}, {"_id": 0}).sort("month", 1).to_list(500)]
    scheduled = [{"chat_id": x["chat_id"], "text": x["text"], "send_at": x["send_at"]}
                 for x in await db.scheduled.find({"sender_id": uid}, {"_id": 0}).to_list(100)]
    profile = {k: me.get(k) for k in ("id", "name", "username", "email", "phone", "language", "bio", "timezone", "avatar", "created_at", "last_seen", "settings")}
    data = {"service": "Glotter", "exported_at": now_iso(), "note": EXPORT_NOTE, "profile": profile,
            "glossary": me.get("glossary", []), "blocked": await who(me.get("blocked", [])), "contacts": contacts,
            "chats": chats, "messages_i_wrote": messages, "scheduled_messages": scheduled, "files_i_sent": files,
            "notification_devices": devices, "translation_usage_by_month": usage}
    filename = f"glotter-data-{me.get('username') or uid}-{now_iso()[:10]}.json"
    return Response(content=json.dumps(data, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


# ---------------- Forgot password: a one-time link by email ----------------
RESET_VALID = timedelta(hours=1)
RESET_MAIL = {
    "it": ("Reimposta la password di Glotter",
           "Ciao {name},\n\nhai chiesto di reimpostare la password di Glotter. Apri questo link (vale 1 ora e si usa una volta sola):\n\n{link}\n\n"
           "Se non sei stato tu, ignora questa email: la tua password resta quella di prima.\n\nGlotter"),
    "en": ("Reset your Glotter password",
           "Hi {name},\n\nyou asked to reset your Glotter password. Open this link (it works for 1 hour, and only once):\n\n{link}\n\n"
           "If it wasn't you, ignore this email: your password stays as it is.\n\nGlotter"),
}


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=72)


def reset_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()  # only the hash is stored: a database leak gives no working links


@api.post("/auth/forgot")
async def forgot_password(body: ForgotIn, request: Request):
    """Always the same answer, whether or not the email has an account (nobody can test which emails are registered)."""
    limiter.check(f"forgot-ip:{client_ip(request)}", 10, 3600, "Too many attempts. Try again later.")
    email = body.email.lower().strip()
    limiter.check(f"forgot-mail:{email}", 3, 3600, "Too many attempts. Try again later.")
    origin = (request.headers.get("origin") or "").rstrip("/")
    app_url = origin if origin in ALLOWED_ORIGINS else (ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "")
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if u and app_url:
        token = secrets.token_urlsafe(32)
        await db.password_resets.delete_many({"user_id": u["id"]})
        await db.password_resets.insert_one({"user_id": u["id"], "token_hash": reset_hash(token),
                                             "expires_at": (datetime.now(timezone.utc) + RESET_VALID).isoformat(), "created_at": now_iso()})
        subject, text = RESET_MAIL.get(u.get("language"), RESET_MAIL["en"])
        await mailer.send(email, subject, text.format(name=u.get("name") or "", link=f"{app_url}/reset?token={token}"))
    return {"ok": True}


@api.post("/auth/reset")
async def reset_password(body: ResetIn, request: Request):
    limiter.check(f"reset-ip:{client_ip(request)}", 20, 3600, "Too many attempts. Try again later.")
    row = await db.password_resets.find_one_and_delete({"token_hash": reset_hash(body.token)})  # a link works only once
    if not row or datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This link is no longer valid. Ask for a new one.")
    await db.users.update_one({"id": row["user_id"]}, {"$set": {
        "password_hash": await hash_password_async(body.new_password), "password_changed_at": now_iso()}})  # other sessions end
    fresh = await db.users.find_one({"id": row["user_id"]}, {"_id": 0})
    if not fresh:
        raise HTTPException(status_code=400, detail="This link is no longer valid. Ask for a new one.")
    return {"token": create_token(fresh["id"]), "user": public_user(fresh)}


class DeleteAccountIn(BaseModel):
    password: str = Field(default="", max_length=72)


@api.post("/auth/delete-account")
async def delete_account(body: DeleteAccountIn, user=Depends(get_current_user)):
    """Erase the account and what it wrote: profile, messages, files, push subscriptions, contacts.
    Direct chats disappear for both people; groups lose the member (and the group if nobody is left)."""
    limiter.check(f"delacc:{user['id']}", 5, 3600, "Too many attempts. Try again later.")
    uid = user["id"]
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="The admin account cannot be deleted here")
    if user.get("password_hash") and not await verify_password_async(body.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is wrong")
    notify = set()
    chat_ids = []
    for chat in await db.chats.find({"members": uid}, {"_id": 0}).to_list(5000):
        remaining = [m for m in chat["members"] if m != uid]
        notify.update(remaining)
        if chat["type"] == "direct" or not remaining:
            await db.messages.delete_many({"chat_id": chat["id"]})
            await db.chats.delete_one({"id": chat["id"]})
            continue
        chat_ids.append(chat["id"])
        await db.chats.update_one({"id": chat["id"]}, {"$pull": {"members": uid, "admins": uid, "pinned_by": uid}})
        if not [a for a in chat.get("admins", []) if a in remaining]:
            await db.chats.update_one({"id": chat["id"]}, {"$addToSet": {"admins": remaining[0]}})
    await db.messages.update_many({"reply_quote.sender_id": uid}, {"$set": {"reply_quote.text": "", "reply_quote.deleted": True, "reply_quote.is_image": False}})
    await db.messages.delete_many({"sender_id": uid})
    if chat_ids:
        await db.messages.update_many({"chat_id": {"$in": chat_ids}}, {"$pull": {"read_by": uid}})
        for m in await db.messages.find({"chat_id": {"$in": chat_ids}, "reactions": {"$ne": {}}}, {"_id": 0, "id": 1, "reactions": 1}).to_list(100000):
            cleaned = {e: [x for x in users if x != uid] for e, users in (m.get("reactions") or {}).items()}
            cleaned = {e: users for e, users in cleaned.items() if users}
            if cleaned != m["reactions"]:
                await db.messages.update_one({"id": m["id"]}, {"$set": {"reactions": cleaned}})
    for f in await db.files.find({"owner_id": uid}, {"_id": 0}).to_list(100000):
        try:
            await storage.delete_object(f["storage_path"])
        except Exception:
            logger.warning("could not delete stored file %s", f.get("id"))
    await db.files.delete_many({"owner_id": uid})
    await db.push_subs.delete_many({"user_id": uid})
    await db.usage.delete_many({"user_id": uid})
    await db.scheduled.delete_many({"sender_id": uid})
    await db.password_resets.delete_many({"user_id": uid})
    await db.contacts.delete_many({"$or": [{"user_id": uid}, {"contact_id": uid}]})
    await db.users.update_many({"blocked": uid}, {"$pull": {"blocked": uid}})
    await db.users.delete_one({"id": uid})
    for mid in notify:
        await ws_manager.send(mid, {"type": "chat_updated", "chat_id": ""})
    return {"ok": True}


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
    if "bio" in raw:
        updates["bio"] = " ".join(raw["bio"].split())  # one line, no stray spaces
    if "timezone" in raw:
        tz = raw["timezone"].strip()
        try:
            ZoneInfo(tz)
        except Exception:
            raise HTTPException(status_code=400, detail="Unknown time zone")
        updates["timezone"] = tz
    if raw.get("settings"):
        for k in ("show_original", "last_seen_enabled", "local_time_enabled"):
            if k in raw["settings"]:
                updates[f"settings.{k}"] = bool(raw["settings"][k])
        if "last_seen_enabled" in raw["settings"]:
            (RECEIPTS_HIDDEN.discard if raw["settings"]["last_seen_enabled"] else RECEIPTS_HIDDEN.add)(user["id"])
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
    return [stranger_profile(u) for u in await cur.to_list(20)]


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
    await ws_manager.send(target_id, {"type": "contact_request", "from": stranger_profile(user)})
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


@api.get("/contacts")
async def my_contacts(user=Depends(get_current_user)):
    """The people I saved (accepted, or asked and still waiting), also the ones I have no chat with
    (I never wrote, or I deleted the chat). Blocked people are left out."""
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "blocked": 1}) or {}
    rows = await db.contacts.find({"user_id": user["id"], "status": {"$in": ["accepted", "pending_out"]}}, {"_id": 0}).to_list(1000)
    ids = [r["contact_id"] for r in rows if r["contact_id"] not in (me.get("blocked") or [])]
    status = {r["contact_id"]: r["status"] for r in rows}
    people = {u["id"]: u async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0})}
    out = []
    for cid in ids:
        u = people.get(cid)
        if not u or user["id"] in (u.get("blocked") or []):
            continue
        p = public_profile(u) if status[cid] == "accepted" else stranger_profile(u)
        p["online"] = ws_manager.is_online(cid)
        out.append({**p, "status": status[cid]})
    return sorted(out, key=lambda p: (p.get("name") or "").lower())


@api.get("/contacts/requests")
async def pending_requests(user=Depends(get_current_user)):
    cur = db.contacts.find({"user_id": user["id"], "status": "pending_in"}, {"_id": 0})
    out = []
    for c in await cur.to_list(100):
        u = await db.users.find_one({"id": c["contact_id"]}, {"_id": 0})
        if u:
            out.append(stranger_profile(u))
    return out


# ---------------- Messages: views ----------------
def message_view(msg, user_lang, uid=None):
    """Return the message with the text the given user should see."""
    out = {k: v for k, v in msg.items() if k not in ("translations_by_user", "deleted_for", "speech")}
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
    if (msg.get("attachment") or {}).get("is_voice") and out["is_translated"]:
        fid = (msg.get("speech") or {}).get(speech_key(out["display_text"]))
        out["speech_url"] = f"/api/files/{fid}" if fid else None  # the translation read aloud, once someone asked for it
    if msg.get("poll"):
        out["poll"] = poll_view(msg["poll"], msg["original_language"], user_lang, uid)
    # Delivered / read, with the time: only the sender sees them, and nobody's reading shows when either side hides it.
    if uid and msg.get("sender_id") == uid:
        hide_all = hides_receipts(uid)
        out["read_by"] = [uid] + ([] if hide_all else [r for r in msg.get("read_by", []) if r != uid and not hides_receipts(r)])
        out["read_at"] = {} if hide_all else {k: v for k, v in (msg.get("read_at") or {}).items() if not hides_receipts(k)}
        out["delivered_to"] = dict(msg.get("delivered_to") or {})
    else:
        out["read_by"], out["read_at"], out["delivered_to"] = [], {}, {}
    return out


def speech_key(text):
    """Spoken translations are kept per text: everyone who reads the same translation hears the same audio."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def poll_view(poll, original_lang, user_lang, uid):
    """A poll as one person sees it: answers in their language when translated, how many chose each, and their own choice.
    Who voted for what is not sent."""
    texts = (poll.get("translations") or {}).get(user_lang) if user_lang != original_lang else None
    votes = poll.get("votes") or {}
    voters = {v for ids in votes.values() for v in ids}
    return {"multiple": bool(poll.get("multiple")), "voters": len(voters),
            "options": [{"id": o["id"], "text": (texts[i] if texts and i < len(texts) and texts[i] else o["text"]),
                         "count": len(votes.get(o["id"], [])), "mine": bool(uid and uid in votes.get(o["id"], []))}
                        for i, o in enumerate(poll.get("options") or [])]}


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
    out["pinned"] = me_id in (out.pop("pinned_by", None) or [])  # who pinned it is private too
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
        # description and rules in my language when translated; the originals are kept for the admins who edit them
        out.pop("group_texts_translations", None)
        src = chat.get("texts_language") or ""
        tr = (chat.get("group_texts_translations") or {}).get(me_lang) if src and me_lang != src else None
        out["description_original"], out["rules_original"] = chat.get("description", ""), chat.get("rules", "")
        out["description"] = (tr or {}).get("description") or chat.get("description", "")
        out["rules"] = (tr or {}).get("rules") or chat.get("rules", "")
        out["texts_translated_from"] = src if tr else None
    return out


async def translate_group_texts(chat_id):
    """Translate a group's description and rules into the language of each member."""
    try:
        chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
        if not chat or chat.get("type") != "group":
            return
        src = chat.get("texts_language") or ""
        texts = {k: chat.get(k, "") for k in ("description", "rules") if chat.get(k)}
        if not src or not texts:
            return
        done = chat.get("group_texts_translations") or {}
        langs = set()
        for mid in chat["members"]:
            u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1}) or {}
            if u.get("language") and u["language"] != src and u["language"] not in done:
                langs.add(u["language"])
        for lang in langs:
            keys = list(texts)
            res = await asyncio.gather(*[engine.translate(texts[k], src, lang, tone=DEFAULT_TONE) for k in keys], return_exceptions=True)
            entry = {k: r["text"] for k, r in zip(keys, res) if isinstance(r, dict)}
            await db.chats.update_one({"id": chat_id}, {"$set": {f"group_texts_translations.{lang}": entry}})
        if langs:
            for mid in chat["members"]:
                await ws_manager.send(mid, {"type": "chat_updated", "chat_id": chat_id})
    except Exception:
        logger.exception("group texts translation failed for %s", chat_id)


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


@api.get("/users/blocked/details")
async def blocked_details(user=Depends(get_current_user)):
    """The people I blocked, with name and photo (for the 'Blocked users' page)."""
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "blocked": 1})
    ids = (me or {}).get("blocked", [])
    if not ids:
        return []
    cur = db.users.find({"id": {"$in": ids}}, {"_id": 0})
    return [{k: v for k, v in public_profile(u).items() if k in ("id", "name", "username", "avatar")} for u in await cur.to_list(len(ids))]


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
    raw = await db.chats.find({"members": user["id"], "hidden_for": {"$ne": user["id"]}}, {"_id": 0}).to_list(200)
    await mark_delivered(user["id"], [c["id"] for c in raw])
    chats = [await enrich_chat(c, user["id"]) for c in raw]
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


def clean_group_emoji(value):
    """An optional emoji shown as the group's picture: a few symbol characters, never letters, digits or markup."""
    v = (value or "").strip()
    if not v:
        return ""
    if len(v) > 8 or any(c.isalnum() or c.isspace() or c in "<>&\"'`\\" or ord(c) < 32 for c in v):
        raise HTTPException(status_code=422, detail="Use a single emoji")
    return v


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    member_ids: List[str] = Field(max_length=49)
    emoji: Optional[str] = Field(default=None, max_length=16)


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
    emoji = clean_group_emoji(body.emoji)
    if emoji:
        chat["emoji"] = emoji
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
    spawn(translate_group_texts(chat_id))  # new members may read another language
    return await enrich_chat(chat, user["id"])


MAX_PINNED_CHATS = 5


@api.post("/chats/{chat_id}/pin")
async def pin_chat(chat_id: str, user=Depends(get_current_user)):
    """Keep a chat at the top of my list. Private to me; at most MAX_PINNED_CHATS."""
    await get_chat_for(chat_id, user)
    already = await db.chats.count_documents({"pinned_by": user["id"], "members": user["id"]})
    if already >= MAX_PINNED_CHATS and not await db.chats.find_one({"id": chat_id, "pinned_by": user["id"]}):
        raise HTTPException(status_code=400, detail=f"You can pin up to {MAX_PINNED_CHATS} chats")
    await db.chats.update_one({"id": chat_id}, {"$addToSet": {"pinned_by": user["id"]}})
    return {"pinned": True}


@api.post("/chats/{chat_id}/unpin")
async def unpin_chat(chat_id: str, user=Depends(get_current_user)):
    await get_chat_for(chat_id, user)
    await db.chats.update_one({"id": chat_id}, {"$pull": {"pinned_by": user["id"]}})
    return {"pinned": False}


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
    rules: Optional[str] = Field(default=None, max_length=1000)
    emoji: Optional[str] = Field(default=None, max_length=16)  # "" removes it


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
    if "emoji" in updates:
        updates["emoji"] = clean_group_emoji(updates["emoji"])
    for k in ("description", "rules"):
        if k in updates:
            updates[k] = updates[k].strip()
    texts_changed = any(k in updates and updates[k] != chat.get(k, "") for k in ("description", "rules"))
    if texts_changed:  # written in the editor's language; the old translations are no longer right
        updates["texts_language"] = user.get("language") or "en"
        updates["group_texts_translations"] = {}
    if updates:
        await db.chats.update_one({"id": chat_id}, {"$set": updates})
        chat.update(updates)
    for mid in chat["members"]:
        await ws_manager.send(mid, {"type": "chat_updated", "chat_id": chat_id})
    if texts_changed:
        spawn(translate_group_texts(chat_id))
    return await enrich_chat(chat, user["id"])


# ---------------- Messages ----------------
def usage_month(when=None):
    return (when or datetime.now(timezone.utc)).strftime("%Y-%m")


async def record_usage(sender_id, recipient_ids):
    """Counts one translated message for the month: +1 'sent' for who wrote it, +1 'received' for each person it was translated for.
    It never breaks a translation: a failure here is only logged."""
    month = usage_month()
    try:
        for uid, field in [(sender_id, "sent")] + [(r, "received") for r in recipient_ids]:
            await db.usage.update_one({"key": f"{uid}|{month}"}, {"$inc": {field: 1}, "$setOnInsert": {"user_id": uid, "month": month}}, upsert=True)
    except Exception:
        logger.exception("could not record the usage of message")


async def translate_message_async(msg_id, chat_id, sender_lang, text, tone, notify=False, count=True):
    """Translate one message for every recipient language, then push the update. Never leaves a
    message stuck in 'translating'. count=False for an edit: the same message is not counted twice."""
    status, translations, by_user = "translation_failed", {}, {}
    members, delivered = [], []
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
                delivered += jobs[(lang, gl)]
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
        if count and delivered:  # counted before the message shows as translated, so a reader of the status always finds the count too
            row = await db.messages.find_one({"id": msg_id}, {"_id": 0, "sender_id": 1})
            if row:
                await record_usage(row["sender_id"], delivered)
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
    att = view.get("attachment")
    if att and att.get("is_voice"):
        return f"🎤 {t[:138]}" if t else "🎤 Voice message"
    if t:
        return t[:140]
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
    online = [m for m in chat["members"] if m != msg["sender_id"] and ws_manager.is_online(m)]
    if online:  # their app is open: the message has reached their device
        now = now_iso()
        await db.messages.update_one({"id": msg["id"]}, {"$set": {f"delivered_to.{m}": now for m in online}})
        msg.setdefault("delivered_to", {}).update({m: now for m in online})
        for m in online:
            await ws_manager.send(msg["sender_id"], {"type": "delivered", "chat_id": chat["id"], "user": m, "at": now, "message_ids": [msg["id"]]})


async def mark_delivered(uid, chat_ids, now=None):
    """Messages that reached this person's device (they opened the app or a chat): tell each sender."""
    now = now or now_iso()
    query = {"chat_id": {"$in": list(chat_ids)}, "sender_id": {"$ne": uid}, f"delivered_to.{uid}": {"$exists": False},
             "deleted_for_all": {"$ne": True}}
    rows = await db.messages.find(query, {"_id": 0, "id": 1, "chat_id": 1, "sender_id": 1}).to_list(2000)
    if not rows:
        return
    await db.messages.update_many({"id": {"$in": [r["id"] for r in rows]}}, {"$set": {f"delivered_to.{uid}": now}})
    groups = {}
    for r in rows:
        groups.setdefault((r["sender_id"], r["chat_id"]), []).append(r["id"])
    for (sender, chat_id), ids in groups.items():
        await ws_manager.send(sender, {"type": "delivered", "chat_id": chat_id, "user": uid, "at": now, "message_ids": ids})


def new_message_doc(chat_id, user, text, lang, attachment, reply_to, status):
    return {
        "id": str(uuid.uuid4()), "chat_id": chat_id, "sender_id": user["id"],
        "sender_name": user["name"], "sender_avatar": user.get("avatar", ""),
        "original_text": text, "original_language": lang, "translations": {}, "translations_by_user": {},
        "attachment": attachment, "reply_to": reply_to, "status": status, "read_by": [user["id"]],
        "deleted_for": [], "deleted_for_all": False, "reactions": {}, "created_at": now_iso(),
    }


async def post_message(user, chat, text, reply_to=None, attachment_ref=None, voice=None):
    """Write a message in a chat the user belongs to, send it to everyone and start its translation.
    voice: {"data", "content_type", "duration"} for a voice message (its transcript becomes the text)."""
    if chat["type"] == "direct":
        other_id = next((m for m in chat["members"] if m != user["id"]), None)
        if other_id:
            other = await db.users.find_one({"id": other_id}, {"_id": 0})
            me_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
            if other and (user["id"] in other.get("blocked", []) or other_id in me_full.get("blocked", [])):
                raise HTTPException(status_code=403, detail="You cannot message this user")
    target = await db.messages.find_one({"id": reply_to, "chat_id": chat["id"]}, {"_id": 0}) if reply_to else None
    if reply_to and not target:
        raise HTTPException(status_code=400, detail="Reply target not found in this chat")
    attachment = await resolve_attachment(attachment_ref, user)
    sender_lang = user.get("language") or "en"
    transcribe = bool(voice) and stt.enabled()
    if voice:
        attachment["duration"] = voice["duration"]
    msg = new_message_doc(chat["id"], user, text, sender_lang, attachment, reply_to,
                          "transcribing" if transcribe else ("translating" if text else "sent"))
    if target:  # a copy of what is being answered, so everyone sees the quote even if the original is not loaded
        msg["reply_quote"] = {"sender_id": target["sender_id"], "sender_name": target.get("sender_name", ""),
                              "text": (target.get("original_text") or "")[:300], "is_image": bool((target.get("attachment") or {}).get("is_image"))}
    await db.messages.insert_one(dict(msg))
    await deliver(msg, chat)  # instant broadcast of the original
    if transcribe:
        spawn(transcribe_voice(msg["id"], chat["id"], voice, sender_lang))
    elif text:
        spawn(translate_message_async(msg["id"], chat["id"], sender_lang, text, DEFAULT_TONE, notify=True))
    else:
        spawn(notify_offline(msg, chat))
    return msg


async def transcribe_voice(msg_id, chat_id, voice, lang):
    """Voice message: the transcript becomes the message text and is translated like any message.
    If it fails, the audio stays and the message says so."""
    ext = AUDIO_TYPES.get(voice["content_type"], "webm")
    transcript = await stt.transcribe(voice["data"], f"audio.{ext}", voice["content_type"], lang)
    await log_voice_cost("transcription", voice["duration"], STT_COST_PER_MIN)
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg or msg.get("deleted_for_all"):
        return
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if transcript:
        await db.messages.update_one({"id": msg_id}, {"$set": {"original_text": transcript, "status": "translating"}})
        await translate_message_async(msg_id, chat_id, lang, transcript, DEFAULT_TONE, notify=True)
        await prepare_speech(msg_id)
    else:
        await db.messages.update_one({"id": msg_id}, {"$set": {"status": "transcription_failed"}})
        await broadcast_message(msg_id, chat_id)
        await notify_offline(await db.messages.find_one({"id": msg_id}, {"_id": 0}), chat)


async def log_voice_cost(kind, seconds, per_minute):
    try:
        await db.voice_logs.insert_one({"kind": kind, "seconds": round(float(seconds or 0), 1),
                                        "est_cost": round((seconds or 0) / 60 * per_minute, 6), "created_at": now_iso()})
    except Exception:
        logger.exception("could not log voice cost")


@api.post("/messages")
async def send_message(body: MessageIn, user=Depends(get_current_user)):
    limiter.check(f"msg:{user['id']}", 60, 60, "You are sending messages too fast.")
    text = body.text.strip()
    if not text and not body.attachment:
        raise HTTPException(status_code=400, detail="Message is empty")
    chat = await get_chat_for(body.chat_id, user)
    msg = await post_message(user, chat, text, body.reply_to, body.attachment)
    return message_view(msg, user.get("language") or "en", user["id"])


# ---------------- Polls (groups) ----------------
# A poll is a message: the question is its text (translated like any message), the answers are translated for each language too.
class PollIn(BaseModel):
    chat_id: str = Field(max_length=64)
    question: str = Field(min_length=1, max_length=200)
    options: List[str] = Field(min_length=2, max_length=10)
    multiple: bool = False


class VoteIn(BaseModel):
    option_ids: List[str] = Field(default_factory=list, max_length=10)


async def translate_poll_options(msg_id, chat_id, sender_lang, options):
    try:
        chat = await db.chats.find_one({"id": chat_id}, {"_id": 0, "members": 1}) or {}
        langs = set()
        for mid in chat.get("members", []):
            u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1}) or {}
            if u.get("language") and u["language"] != sender_lang:
                langs.add(u["language"])
        for lang in langs:
            res = await asyncio.gather(*[engine.translate(o, sender_lang, lang, tone=DEFAULT_TONE) for o in options], return_exceptions=True)
            texts = [r["text"] if isinstance(r, dict) else "" for r in res]
            await db.messages.update_one({"id": msg_id}, {"$set": {f"poll.translations.{lang}": texts}})
        await broadcast_message(msg_id, chat_id)
    except Exception:
        logger.exception("poll translation failed for %s", msg_id)


async def broadcast_message(msg_id, chat_id):
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0, "members": 1})
    if not msg or not chat:
        return
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
        await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat_id})


@api.post("/polls")
async def create_poll(body: PollIn, user=Depends(get_current_user)):
    limiter.check(f"msg:{user['id']}", 60, 60, "You are sending messages too fast.")
    chat = await get_chat_for(body.chat_id, user)
    if chat["type"] != "group":
        raise HTTPException(status_code=400, detail="Polls are for groups")
    question = " ".join(body.question.split())
    options = [" ".join(o.split())[:100] for o in body.options]
    if not question or any(not o for o in options):
        raise HTTPException(status_code=400, detail="Write the question and every answer")
    if len({o.lower() for o in options}) != len(options):
        raise HTTPException(status_code=400, detail="Two answers are the same")
    sender_lang = user.get("language") or "en"
    msg = new_message_doc(chat["id"], user, question, sender_lang, None, None, "translating")
    msg["poll"] = {"options": [{"id": f"o{i}", "text": o} for i, o in enumerate(options)], "multiple": body.multiple, "votes": {}, "translations": {}}
    await db.messages.insert_one(dict(msg))
    await deliver(msg, chat)
    spawn(translate_message_async(msg["id"], chat["id"], sender_lang, question, DEFAULT_TONE, notify=True))
    spawn(translate_poll_options(msg["id"], chat["id"], sender_lang, options))
    return message_view(msg, sender_lang, user["id"])


@api.post("/messages/{msg_id}/vote")
async def vote(msg_id: str, body: VoteIn, user=Depends(get_current_user)):
    """Replaces my choice with these answers (an empty list takes my vote back)."""
    limiter.check(f"vote:{user['id']}", 60, 60)
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg or not msg.get("poll") or msg.get("deleted_for_all"):
        raise HTTPException(status_code=404, detail="Poll not found")
    await get_chat_for(msg["chat_id"], user)
    ids = list(dict.fromkeys(body.option_ids))
    valid = {o["id"] for o in msg["poll"]["options"]}
    if any(i not in valid for i in ids) or (len(ids) > 1 and not msg["poll"].get("multiple")):
        raise HTTPException(status_code=400, detail="Invalid answer")
    update = {"$pull": {f"poll.votes.{o}": user["id"] for o in valid}}
    await db.messages.update_one({"id": msg_id}, update)
    if ids:
        await db.messages.update_one({"id": msg_id}, {"$addToSet": {f"poll.votes.{o}": user["id"] for o in ids}})
    await broadcast_message(msg_id, msg["chat_id"])
    fresh = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    return message_view(fresh, user.get("language") or "en", user["id"])


# ---------------- Scheduled messages ----------------
# Written now, sent at a chosen time. Only the writer sees them until they leave; the text is translated when it is sent.
MAX_SCHEDULED = 20                      # waiting messages per person
SCHEDULE_AHEAD = timedelta(days=30)


class ScheduleIn(BaseModel):
    chat_id: str = Field(max_length=64)
    text: str = Field(max_length=4000)
    send_at: str = Field(max_length=40)  # ISO date and time with its zone
    reply_to: Optional[str] = Field(default=None, max_length=64)


class RescheduleIn(BaseModel):
    send_at: str = Field(max_length=40)


def parse_send_at(value):
    try:
        when = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if when.tzinfo is None:
        raise HTTPException(status_code=400, detail="Invalid date")
    when = when.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if when <= now + timedelta(seconds=30):
        raise HTTPException(status_code=400, detail="Choose a time in the future")
    if when > now + SCHEDULE_AHEAD:
        raise HTTPException(status_code=400, detail="You can schedule up to 30 days ahead")
    return when


def scheduled_view(doc):
    return {k: doc.get(k) for k in ("id", "chat_id", "text", "send_at", "reply_to", "created_at")}


@api.post("/scheduled")
async def schedule_message(body: ScheduleIn, user=Depends(get_current_user)):
    limiter.check(f"sched:{user['id']}", 30, 60)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    await get_chat_for(body.chat_id, user)
    when = parse_send_at(body.send_at)
    if await db.scheduled.count_documents({"sender_id": user["id"]}) >= MAX_SCHEDULED:
        raise HTTPException(status_code=400, detail="Too many scheduled messages")
    if body.reply_to and not await db.messages.find_one({"id": body.reply_to, "chat_id": body.chat_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=400, detail="Reply target not found in this chat")
    doc = {"id": str(uuid.uuid4()), "chat_id": body.chat_id, "sender_id": user["id"], "text": text,
           "send_at": when.isoformat(), "reply_to": body.reply_to, "created_at": now_iso()}
    await db.scheduled.insert_one(dict(doc))
    return scheduled_view(doc)


@api.get("/scheduled/{chat_id}")
async def list_scheduled(chat_id: str, user=Depends(get_current_user)):
    await get_chat_for(chat_id, user)
    rows = await db.scheduled.find({"chat_id": chat_id, "sender_id": user["id"]}, {"_id": 0}).sort("send_at", 1).to_list(MAX_SCHEDULED)
    return [scheduled_view(r) for r in rows]


async def own_scheduled(sid, user):
    doc = await db.scheduled.find_one({"id": sid, "sender_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@api.put("/scheduled/{sid}")
async def reschedule(sid: str, body: RescheduleIn, user=Depends(get_current_user)):
    await own_scheduled(sid, user)
    when = parse_send_at(body.send_at)
    await db.scheduled.update_one({"id": sid}, {"$set": {"send_at": when.isoformat()}})
    return scheduled_view(await own_scheduled(sid, user))


@api.delete("/scheduled/{sid}")
async def cancel_scheduled(sid: str, user=Depends(get_current_user)):
    await own_scheduled(sid, user)
    await db.scheduled.delete_one({"id": sid})
    return {"ok": True}


async def send_scheduled(doc):
    """Send one waiting message (it is removed first, so it can never leave twice). Returns the message or None."""
    if not await db.scheduled.find_one_and_delete({"id": doc["id"]}):
        return None
    user = await db.users.find_one({"id": doc["sender_id"]}, {"_id": 0})
    chat = await db.chats.find_one({"id": doc["chat_id"]}, {"_id": 0})
    try:
        if not user or not chat or user["id"] not in chat["members"]:
            raise HTTPException(status_code=403, detail="Not a member")
        msg = await post_message(user, chat, doc["text"], doc.get("reply_to"))
    except HTTPException as e:  # blocked, left the group, reply deleted...: the message is dropped
        logger.info("scheduled message %s not sent: %s", doc["id"], e.detail)
        msg = None
    if user:
        await ws_manager.send(user["id"], {"type": "scheduled_sent", "id": doc["id"], "chat_id": doc["chat_id"], "sent": bool(msg)})
    return msg


@api.post("/scheduled/{sid}/send-now")
async def send_scheduled_now(sid: str, user=Depends(get_current_user)):
    doc = await own_scheduled(sid, user)
    msg = await send_scheduled(doc)
    if not msg:
        raise HTTPException(status_code=400, detail="This message could not be sent")
    return message_view(msg, user.get("language") or "en", user["id"])


async def dispatch_due_scheduled(now=None):
    """Send every waiting message whose time has come. Returns how many left."""
    now = (now or datetime.now(timezone.utc)).isoformat()
    sent = 0
    for doc in await db.scheduled.find({"send_at": {"$lte": now}}, {"_id": 0}).sort("send_at", 1).to_list(200):
        try:
            if await send_scheduled(doc):
                sent += 1
        except Exception:
            logger.exception("scheduled message %s failed", doc.get("id"))
    return sent


async def scheduled_loop():
    while True:
        await asyncio.sleep(15)
        try:
            await dispatch_due_scheduled()
        except Exception:
            logger.exception("scheduled messages loop")


@api.post("/voice")
async def send_voice(chat_id: str = Form(...), file: UploadFile = File(...), duration: float = Form(0),
                     reply_to: Optional[str] = Form(None), user=Depends(get_current_user)):
    if not voice_messages_on():
        raise HTTPException(status_code=404, detail="Voice messages are not available")
    limiter.check(f"voice:{user['id']}", 20, 60)
    chat = await get_chat_for(chat_id, user)
    ct = normalize_content_type(file.content_type)
    if ct not in AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    if not 0 < duration <= MAX_VOICE_SECONDS + 3:  # a little slack for the recorder stopping late
        raise HTTPException(status_code=400, detail="Voice messages last up to 2 minutes")
    data = await file.read(MAX_VOICE_BYTES + 1)
    if len(data) > MAX_VOICE_BYTES:
        raise HTTPException(status_code=413, detail="Voice message too large")
    ext = AUDIO_TYPES[ct]
    stored = await storage.put_object(f"lingua/voice/{user['id']}/{uuid.uuid4()}.{ext}", data, ct)
    fid = str(uuid.uuid4())
    await db.files.insert_one({"id": fid, "storage_path": stored["path"], "original_filename": f"voice.{ext}", "content_type": ct,
                               "size": stored.get("size", len(data)), "owner_id": user["id"], "is_voice": True,
                               "is_deleted": False, "created_at": now_iso()})
    voice = {"data": data, "content_type": ct, "duration": round(min(duration, MAX_VOICE_SECONDS), 1)}
    msg = await post_message(user, chat, "", reply_to or None, {"id": fid}, voice=voice)
    return message_view(msg, user.get("language") or "en", user["id"])


SPEECH_LOCKS = {}


async def make_speech(msg, text):
    """The translated text of a voice message read aloud, stored once per text (so once per language).
    Returns the file id, or None if the voice could not be made."""
    key = speech_key(text)
    lock = SPEECH_LOCKS.setdefault(f"{msg['id']}:{key}", asyncio.Lock())
    try:
        async with lock:  # made once, even if the server and two listeners ask at the same moment
            fresh = await db.messages.find_one({"id": msg["id"]}, {"_id": 0, "speech": 1})
            fid = ((fresh or {}).get("speech") or {}).get(key)
            if fid:
                return fid
            audio = await tts.synthesize(text)
            if not audio:
                return None
            await log_voice_cost("speech", msg["attachment"].get("duration") or 0, TTS_COST_PER_MIN)
            stored = await storage.put_object(f"lingua/voice/{msg['sender_id']}/{uuid.uuid4()}.mp3", audio, "audio/mpeg")
            fid = str(uuid.uuid4())
            await db.files.insert_one({"id": fid, "storage_path": stored["path"], "original_filename": "voice.mp3",
                                       "content_type": "audio/mpeg", "size": stored.get("size", len(audio)),
                                       "owner_id": msg["sender_id"], "is_voice": True, "is_speech": True,
                                       "is_deleted": False, "created_at": now_iso()})
            done = await db.messages.update_one({"id": msg["id"], "deleted_for_all": {"$ne": True}, "attachment.expired": {"$ne": True}},
                                                {"$set": {f"speech.{key}": fid}})
            if not done.matched_count:  # deleted meanwhile: do not keep its voice
                await drop_voice_audio({"speech": {key: fid}})
                return None
            return fid
    finally:
        SPEECH_LOCKS.pop(f"{msg['id']}:{key}", None)


async def prepare_speech(msg_id):
    """Right after a voice message is translated, make its spoken translations, so play starts at once."""
    if not tts.enabled():
        return
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg or msg.get("deleted_for_all") or not (msg.get("attachment") or {}).get("is_voice") or msg["attachment"].get("expired"):
        return
    texts = {e["text"] for e in list((msg.get("translations") or {}).values()) + list((msg.get("translations_by_user") or {}).values())
             if e.get("text")}
    made = await asyncio.gather(*[make_speech(msg, t) for t in texts], return_exceptions=True)
    if any(isinstance(f, str) for f in made):
        await broadcast_message(msg_id, msg["chat_id"])  # listeners get the ready voice


@api.post("/messages/{msg_id}/speech")
async def message_speech(msg_id: str, user=Depends(get_current_user)):
    """The translation of a voice message read aloud in the listener's language. Usually ready already
    (made right after the translation); if not, it is made now."""
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg or msg.get("deleted_for_all") or not (msg.get("attachment") or {}).get("is_voice"):
        raise HTTPException(status_code=404, detail="Not found")
    await get_chat_for(msg["chat_id"], user)
    if msg["attachment"].get("expired"):
        raise HTTPException(status_code=410, detail="This audio is no longer available")
    if not tts.enabled():
        raise HTTPException(status_code=404, detail="Spoken translation is not available")
    view = message_view(msg, user.get("language") or "en", user["id"])
    if not view["is_translated"]:
        raise HTTPException(status_code=409, detail="There is no translation to read yet")
    if view.get("speech_url"):
        return {"url": view["speech_url"]}
    limiter.check(f"speech:{user['id']}", 60, 3600)
    fid = await make_speech(msg, view["display_text"])
    if not fid:
        raise HTTPException(status_code=502, detail="Could not create the voice. Try again.")
    return {"url": f"/api/files/{fid}"}


async def drop_voice_audio(msg):
    """Delete a voice message's audio and its spoken translations from storage."""
    ids = [(msg.get("attachment") or {}).get("id")] + list((msg.get("speech") or {}).values())
    for f in await db.files.find({"id": {"$in": [i for i in ids if i]}}, {"_id": 0}).to_list(100):
        try:
            await storage.delete_object(f["storage_path"])
        except Exception:
            logger.warning("could not delete stored file %s", f.get("id"))
    await db.files.delete_many({"id": {"$in": [i for i in ids if i]}})


async def expire_old_voice(now=None):
    """After VOICE_KEEP_DAYS the audio goes; the transcript and its translations stay in the chat."""
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=VOICE_KEEP_DAYS)).isoformat()
    rows = await db.messages.find({"attachment.is_voice": True, "attachment.expired": {"$ne": True}, "created_at": {"$lt": cutoff}},
                                  {"_id": 0}).to_list(500)
    for m in rows:
        await drop_voice_audio(m)
        await db.messages.update_one({"id": m["id"]}, {"$set": {"attachment.expired": True, "attachment.url": None, "speech": {}}})
    return len(rows)


async def voice_cleanup_loop():
    while True:
        try:
            await expire_old_voice()
        except Exception:
            logger.exception("voice cleanup loop")
        await asyncio.sleep(3600)


@api.get("/messages/{chat_id}")
async def get_messages(chat_id: str, before: Optional[str] = None, limit: int = 50, user=Depends(get_current_user)):
    await get_chat_for(chat_id, user)
    await mark_delivered(user["id"], [chat_id])
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
    uid, now = user["id"], now_iso()
    await mark_delivered(uid, [chat_id], now)  # read means it arrived too
    await db.messages.update_many({"chat_id": chat_id, "read_by": {"$ne": uid}}, {"$addToSet": {"read_by": uid}, "$set": {f"read_at.{uid}": now}})
    if not hides_receipts(uid):
        for mid in chat["members"]:
            if mid != uid and not hides_receipts(mid):
                await ws_manager.send(mid, {"type": "read_receipt", "chat_id": chat_id, "reader": uid, "at": now})
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
        if (msg.get("attachment") or {}).get("is_voice"):
            await drop_voice_audio(msg)
        await db.messages.update_one({"id": msg_id}, {"$set": {"deleted_for_all": True, "original_text": "", "translations": {}, "translations_by_user": {}, "attachment": None, "poll": None, "speech": {}}})
        await db.messages.update_many({"reply_to": msg_id}, {"$set": {"reply_quote.text": "", "reply_quote.deleted": True, "reply_quote.is_image": False}})
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
    if msg.get("poll"):
        raise HTTPException(status_code=400, detail="Polls cannot be edited")
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
        await db.messages.update_many({"reply_to": msg_id}, {"$set": {"reply_quote.text": text[:300]}})
        msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
        for mid in chat["members"]:
            u = await db.users.find_one({"id": mid}, {"_id": 0, "language": 1})
            await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, (u or {}).get("language") or "en", mid), "chat_id": chat["id"]})
        spawn(translate_message_async(msg_id, chat["id"], lang, text, DEFAULT_TONE, count=False))
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
    voice = await db.voice_logs.aggregate([{"$group": {"_id": "$kind", "cost": {"$sum": "$est_cost"}, "seconds": {"$sum": "$seconds"}}}]).to_list(10)
    return {"total_translations": total,
            "voice": {v["_id"]: {"minutes": round(v["seconds"] / 60, 1), "cost": round(v["cost"], 4)} for v in voice},
            "total_cost": round(cost_agg[0]["cost"], 4) if cost_agg else 0,
            "total_chars": cost_agg[0]["chars"] if cost_agg else 0,
            "daily": [{"date": d["_id"], "count": d["count"], "cost": round(d["cost"], 4), "chars": d["chars"]} for d in daily]}


@api.get("/usage")
async def my_usage(user=Depends(get_current_user)):
    """This month's counters of the person: messages translated for them (received) and their messages that needed a translation (sent)."""
    month = usage_month()
    row = await db.usage.find_one({"key": f"{user['id']}|{month}"}, {"_id": 0}) or {}
    return {"month": month, "received": row.get("received", 0), "sent": row.get("sent", 0)}


def _percentile(sorted_values, q):
    return sorted_values[int(q * (len(sorted_values) - 1))] if sorted_values else 0


@api.get("/admin/usage")
async def admin_usage(month: Optional[str] = None, user=Depends(get_current_user)):
    """Messages translated per person in a month (default: this one), to choose the limit of a free plan."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    month = month or usage_month()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(status_code=400, detail="Month must look like 2026-10")
    rows = await db.usage.find({"month": month}, {"_id": 0}).to_list(5000)
    names = {u["id"]: u async for u in db.users.find({"id": {"$in": [r["user_id"] for r in rows]}}, {"_id": 0, "id": 1, "name": 1, "username": 1})}
    people = sorted(({"name": names.get(r["user_id"], {}).get("name", "?"), "username": names.get(r["user_id"], {}).get("username", ""),
                      "received": r.get("received", 0), "sent": r.get("sent", 0)} for r in rows), key=lambda p: -p["received"])
    received = sorted(p["received"] for p in people)
    months = sorted(await db.usage.distinct("month"), reverse=True)
    return {"month": month, "months": months, "active_people": len(people),
            "total_received": sum(received), "total_sent": sum(p["sent"] for p in people),
            "median_received": _percentile(received, 0.5), "p90_received": _percentile(received, 0.9), "max_received": received[-1] if received else 0,
            "people": people[:200]}


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
                   allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Content-Disposition"])  # so the site can read the name of a downloaded file


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
    await db.usage.create_index("key", unique=True)
    await db.usage.create_index("month")
    await db.scheduled.create_index("send_at")
    await db.password_resets.create_index("token_hash")
    # a restart in the middle of a transcription: the audio is there, the text will not come
    await db.messages.update_many({"status": "transcribing"}, {"$set": {"status": "transcription_failed"}})
    RECEIPTS_HIDDEN.clear()
    RECEIPTS_HIDDEN.update([u["id"] async for u in db.users.find({"settings.last_seen_enabled": False}, {"_id": 0, "id": 1})])
    if os.environ.get("APP_ENV") != "test":
        spawn(scheduled_loop())
        spawn(voice_cleanup_loop())
    # Cached translations expire after 30 days so the database does not grow forever.
    await db.translation_cache.create_index("created_at_dt", expireAfterSeconds=30 * 24 * 3600)
    storage.get_storage()  # fail early (and log) if storage is misconfigured
    await seed_demo()
    if not invite_code_required():
        logger.warning("INVITE_CODE is not set: anyone with the link can create an account")
    logger.info("Glotter backend ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()
