from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from translation import TranslationEngine
from languages import LANGUAGES, RTL_CODES

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
engine = TranslationEngine(db)

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------------- Object storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "lingua"
_storage_key = None


def init_storage(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    import requests
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def put_object(path, data, content_type):
    import requests
    key = init_storage()
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def get_object(path):
    import requests
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------- Auth helpers ----------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    if not u:
        return u
    return {k: u.get(k) for k in ["id", "name", "username", "email", "avatar", "language", "settings", "role", "created_at", "online", "last_seen"]}


async def user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
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
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    avatar: Optional[str] = None
    language: Optional[str] = None
    settings: Optional[dict] = None


class MessageIn(BaseModel):
    chat_id: str
    text: str
    reply_to: Optional[str] = None
    attachment: Optional[dict] = None


# ---------------- WebSocket manager ----------------
class WSManager:
    def __init__(self):
        self.conns = {}  # user_id -> set[WebSocket]

    async def connect(self, user_id, ws):
        await ws.accept()
        self.conns.setdefault(user_id, set()).add(ws)
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


# ---------------- Auth endpoints ----------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    username = email.split("@")[0] + uuid.uuid4().hex[:4]
    doc = {
        "id": uid, "email": email, "password_hash": hash_password(body.password),
        "name": body.name, "username": username, "avatar": "", "language": "",
        "settings": {"show_original": True, "last_seen_enabled": True}, "glossary": [],
        "role": "user", "online": False, "last_seen": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"token": create_token(uid), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_token(u["id"]), "user": public_user(u)}


@api.post("/auth/google/session")
async def google_session(request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    import requests as _rq
    r = _rq.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}, timeout=20)
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    email = (data.get("email") or "").lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        uid = existing["id"]
        if not existing.get("avatar") and data.get("picture"):
            await db.users.update_one({"id": uid}, {"$set": {"avatar": data["picture"]}})
        u = await db.users.find_one({"id": uid}, {"_id": 0})
    else:
        uid = str(uuid.uuid4())
        u = {"id": uid, "email": email, "password_hash": "", "name": data.get("name") or email.split("@")[0],
             "username": email.split("@")[0] + uuid.uuid4().hex[:4], "avatar": data.get("picture", ""),
             "language": "", "settings": {"show_original": True, "last_seen_enabled": True}, "glossary": [],
             "role": "user", "online": False, "last_seen": None, "auth_provider": "google",
             "created_at": datetime.now(timezone.utc).isoformat()}
        await db.users.insert_one(dict(u))
    return {"token": create_token(uid), "user": public_user(u)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api.put("/auth/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "username" in updates:
        existing = await db.users.find_one({"username": updates["username"], "id": {"$ne": user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Username taken")
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return public_user(u)


@api.get("/languages")
async def languages():
    return LANGUAGES


# ---------------- Contacts / users ----------------
@api.get("/users/search")
async def search_users(q: str, user=Depends(get_current_user)):
    q = q.strip().lower()
    if not q:
        return []
    cur = db.users.find({"id": {"$ne": user["id"]},
                         "$or": [{"username": {"$regex": q, "$options": "i"}},
                                 {"email": {"$regex": q, "$options": "i"}},
                                 {"name": {"$regex": q, "$options": "i"}}]}, {"_id": 0}).limit(20)
    return [public_user(u) for u in await cur.to_list(20)]


@api.post("/contacts/request/{target_id}")
async def contact_request(target_id: str, user=Depends(get_current_user)):
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    existing = await db.contacts.find_one({"user_id": user["id"], "contact_id": target_id})
    if existing:
        return {"status": existing["status"]}
    now = datetime.now(timezone.utc).isoformat()
    await db.contacts.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "contact_id": target_id, "status": "pending_out", "created_at": now})
    await db.contacts.insert_one({"id": str(uuid.uuid4()), "user_id": target_id, "contact_id": user["id"], "status": "pending_in", "created_at": now})
    await ws_manager.send(target_id, {"type": "contact_request", "from": public_user(user)})
    return {"status": "pending_out"}


@api.post("/contacts/accept/{requester_id}")
async def contact_accept(requester_id: str, user=Depends(get_current_user)):
    await db.contacts.update_one({"user_id": user["id"], "contact_id": requester_id}, {"$set": {"status": "accepted"}})
    await db.contacts.update_one({"user_id": requester_id, "contact_id": user["id"]}, {"$set": {"status": "accepted"}})
    chat = await get_or_create_direct(user["id"], requester_id)
    await ws_manager.send(requester_id, {"type": "contact_accepted", "chat": chat})
    return {"status": "accepted", "chat": chat}


@api.post("/contacts/decline/{requester_id}")
async def contact_decline(requester_id: str, user=Depends(get_current_user)):
    await db.contacts.delete_many({"user_id": {"$in": [user["id"], requester_id]}, "contact_id": {"$in": [user["id"], requester_id]}})
    return {"status": "declined"}


@api.get("/contacts/requests")
async def pending_requests(user=Depends(get_current_user)):
    cur = db.contacts.find({"user_id": user["id"], "status": "pending_in"}, {"_id": 0})
    out = []
    for c in await cur.to_list(100):
        u = await db.users.find_one({"id": c["contact_id"]}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return out


# ---------------- Chats ----------------
async def enrich_chat(chat, me_id):
    members = []
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0})
        if u:
            mu = public_user(u)
            mu["online"] = ws_manager.is_online(mid)
            mu["is_admin"] = mid in chat.get("admins", [])
            members.append(mu)
    me_lang = next((m["language"] for m in members if m["id"] == me_id), "en") or "en"
    last = await db.messages.find_one({"chat_id": chat["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if last:
        last = message_view(last, me_lang)
    unread = await db.messages.count_documents({"chat_id": chat["id"], "sender_id": {"$ne": me_id}, "read_by": {"$ne": me_id}})
    out = dict(chat)
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
        out["display_avatar"] = ""
    return out


async def get_or_create_direct(a, b):
    chat = await db.chats.find_one({"type": "direct", "members": {"$all": [a, b], "$size": 2}}, {"_id": 0})
    if not chat:
        chat = {"id": str(uuid.uuid4()), "type": "direct", "name": "", "members": [a, b],
                "admins": [], "tone": "neutral", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.chats.insert_one(dict(chat))
    return await enrich_chat(chat, a)


@api.get("/chats")
async def list_chats(user=Depends(get_current_user)):
    cur = db.chats.find({"members": user["id"]}, {"_id": 0})
    chats = [await enrich_chat(c, user["id"]) for c in await cur.to_list(200)]
    chats.sort(key=lambda c: (c["last_message"]["created_at"] if c["last_message"] else c["created_at"]), reverse=True)
    return chats


@api.post("/chats/direct/{other_id}")
async def create_direct(other_id: str, user=Depends(get_current_user)):
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    return await get_or_create_direct(user["id"], other_id)


class GroupIn(BaseModel):
    name: str
    member_ids: List[str]
    tone: Optional[str] = "neutral"


@api.post("/chats/group")
async def create_group(body: GroupIn, user=Depends(get_current_user)):
    members = list(set([user["id"]] + body.member_ids))[:50]
    chat = {"id": str(uuid.uuid4()), "type": "group", "name": body.name, "members": members,
            "admins": [user["id"]], "tone": body.tone or "neutral", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.chats.insert_one(dict(chat))
    enriched = await enrich_chat(chat, user["id"])
    for m in members:
        await ws_manager.send(m, {"type": "new_chat", "chat": await enrich_chat(chat, m)})
    return enriched


@api.put("/chats/{chat_id}/tone")
async def set_tone(chat_id: str, tone: str, user=Depends(get_current_user)):
    await db.chats.update_one({"id": chat_id}, {"$set": {"tone": tone}})
    members = await chat_member_ids(chat_id)
    for mid in members:
        await ws_manager.send(mid, {"type": "chat_updated", "chat_id": chat_id})
    return {"tone": tone}


class AddMembersIn(BaseModel):
    member_ids: List[str]


@api.post("/chats/{chat_id}/members")
async def add_members(chat_id: str, body: AddMembersIn, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or chat["type"] != "group":
        raise HTTPException(status_code=404, detail="Group not found")
    if user["id"] not in chat.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can add members")
    new_members = list(dict.fromkeys(chat["members"] + body.member_ids))[:50]
    await db.chats.update_one({"id": chat_id}, {"$set": {"members": new_members}})
    chat["members"] = new_members
    for mid in new_members:
        await ws_manager.send(mid, {"type": "new_chat", "chat": await enrich_chat(chat, mid)})
    return await enrich_chat(chat, user["id"])


@api.post("/chats/{chat_id}/leave")
async def leave_group(chat_id: str, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or chat["type"] != "group":
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
    await db.chats.update_one({"id": chat_id}, {"$addToSet": {"admins": uid}})
    return {"ok": True}


# ---------------- Messages ----------------
def message_view(msg, user_lang):
    """Return the message with the text the given user should see."""
    out = dict(msg)
    tr = msg.get("translations", {})
    if msg["original_language"] == user_lang or user_lang not in tr:
        out["display_text"] = msg["original_text"]
        out["is_translated"] = False
        out["translated_from"] = None
    else:
        out["display_text"] = tr[user_lang]["text"]
        out["is_translated"] = True
        out["translated_from"] = msg["original_language"]
    return out


async def translate_message_async(msg_id, chat_id, sender_lang, text, tone):
    members = await chat_member_ids(chat_id)
    langs = set()
    for mid in members:
        u = await db.users.find_one({"id": mid}, {"_id": 0})
        if u and u.get("language") and u["language"] != sender_lang:
            glossary = "; ".join([f"{g['term']}={g.get('rule','keep')}" for g in u.get("glossary", [])])
            langs.add((u["language"], glossary))
    translations = {}
    for lang, glossary in langs:
        res = await engine.translate(text, sender_lang, lang, tone=tone, glossary=glossary)
        if res:
            translations[lang] = {"text": res["text"], "provider": res["provider"]}
    status = "sent" if translations or not langs else "translation_failed"
    await db.messages.update_one({"id": msg_id}, {"$set": {"translations": translations, "status": status}})
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    for mid in members:
        u = await db.users.find_one({"id": mid}, {"_id": 0})
        await ws_manager.send(mid, {"type": "message_update", "message": message_view(msg, u.get("language", "en") if u else "en"), "chat_id": chat_id})


@api.post("/messages")
async def send_message(body: MessageIn, user=Depends(get_current_user)):
    if len(body.text) > 4000:
        raise HTTPException(status_code=400, detail="Message too long (max 4000 chars)")
    chat = await db.chats.find_one({"id": body.chat_id}, {"_id": 0})
    if not chat or user["id"] not in chat["members"]:
        raise HTTPException(status_code=403, detail="Not a member")
    sender_lang = user.get("language") or "en"
    msg = {
        "id": str(uuid.uuid4()), "chat_id": body.chat_id, "sender_id": user["id"],
        "sender_name": user["name"], "sender_avatar": user.get("avatar", ""),
        "original_text": body.text, "original_language": sender_lang, "translations": {},
        "attachment": body.attachment, "reply_to": body.reply_to,
        "status": "translating" if body.text else "sent", "read_by": [user["id"]],
        "deleted_for": [], "deleted_for_all": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(dict(msg))
    # instant broadcast (original) to all members
    for mid in chat["members"]:
        u = await db.users.find_one({"id": mid}, {"_id": 0})
        await ws_manager.send(mid, {"type": "new_message", "message": message_view(msg, u.get("language", "en") if u else "en"), "chat_id": body.chat_id})
    # translate in background
    if body.text.strip():
        import asyncio
        asyncio.create_task(translate_message_async(msg["id"], body.chat_id, sender_lang, body.text, chat.get("tone", "neutral")))
    return message_view(msg, sender_lang)


@api.get("/messages/{chat_id}")
async def get_messages(chat_id: str, before: Optional[str] = None, limit: int = 50, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or user["id"] not in chat["members"]:
        raise HTTPException(status_code=403, detail="Not a member")
    query = {"chat_id": chat_id, "deleted_for": {"$ne": user["id"]}}
    if before:
        query["created_at"] = {"$lt": before}
    cur = db.messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    msgs = await cur.to_list(limit)
    msgs.reverse()
    lang = user.get("language", "en")
    return [message_view(m, lang) for m in msgs]


@api.post("/messages/{chat_id}/read")
async def mark_read(chat_id: str, user=Depends(get_current_user)):
    await db.messages.update_many({"chat_id": chat_id, "read_by": {"$ne": user["id"]}}, {"$addToSet": {"read_by": user["id"]}})
    members = await chat_member_ids(chat_id)
    for mid in members:
        await ws_manager.send(mid, {"type": "read_receipt", "chat_id": chat_id, "reader": user["id"]})
    return {"ok": True}


@api.post("/messages/{msg_id}/retry")
async def retry_translation(msg_id: str, user=Depends(get_current_user)):
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = await db.chats.find_one({"id": msg["chat_id"]}, {"_id": 0})
    import asyncio
    asyncio.create_task(translate_message_async(msg_id, msg["chat_id"], msg["original_language"], msg["original_text"], chat.get("tone", "neutral")))
    return {"ok": True}


@api.delete("/messages/{msg_id}")
async def delete_message(msg_id: str, for_all: bool = False, user=Depends(get_current_user)):
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    if for_all and msg["sender_id"] == user["id"]:
        await db.messages.update_one({"id": msg_id}, {"$set": {"deleted_for_all": True, "original_text": "", "translations": {}}})
        members = await chat_member_ids(msg["chat_id"])
        for mid in members:
            await ws_manager.send(mid, {"type": "message_deleted", "message_id": msg_id, "chat_id": msg["chat_id"]})
    else:
        await db.messages.update_one({"id": msg_id}, {"$addToSet": {"deleted_for": user["id"]}})
    return {"ok": True}


# ---------------- Glossary ----------------
class GlossaryIn(BaseModel):
    term: str
    rule: str


@api.get("/glossary")
async def get_glossary(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("glossary", [])


@api.post("/glossary")
async def add_glossary(body: GlossaryIn, user=Depends(get_current_user)):
    entry = {"term": body.term, "rule": body.rule}
    await db.users.update_one({"id": user["id"]}, {"$push": {"glossary": entry}})
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
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    fid = str(uuid.uuid4())
    await db.files.insert_one({"id": fid, "storage_path": result["path"], "original_filename": file.filename,
                               "content_type": file.content_type, "size": result.get("size", len(data)),
                               "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    is_image = (file.content_type or "").startswith("image/")
    return {"id": fid, "url": f"/api/files/{fid}", "filename": file.filename, "content_type": file.content_type, "size": result.get("size", len(data)), "is_image": is_image}


@api.get("/files/{file_id}")
async def download(file_id: str):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ct)


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


# ---------------- WebSocket ----------------
@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str):
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
            data = json.loads(raw)
            if data.get("type") == "typing":
                members = await chat_member_ids(data["chat_id"])
                for mid in members:
                    if mid != uid:
                        await ws_manager.send(mid, {"type": "typing", "chat_id": data["chat_id"], "user": public_user(user)})
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(uid, ws)
        if not ws_manager.is_online(uid):
            await db.users.update_one({"id": uid}, {"$set": {"online": False, "last_seen": datetime.now(timezone.utc).isoformat()}})
            await _broadcast_presence(uid, False)


async def _broadcast_presence(uid, online):
    cur = db.chats.find({"members": uid}, {"_id": 0})
    notified = set()
    for c in await cur.to_list(500):
        for mid in c["members"]:
            if mid != uid and mid not in notified:
                notified.add(mid)
                await ws_manager.send(mid, {"type": "presence", "user_id": uid, "online": online})


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


# ---------------- Startup ----------------
async def seed_demo():
    # Admin always seeded (credentials from env only).
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@lingua.app")
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if admin_pw:
        existing_admin = await db.users.find_one({"email": admin_email})
        if not existing_admin:
            await db.users.insert_one({"id": str(uuid.uuid4()), "email": admin_email,
                                       "password_hash": hash_password(admin_pw),
                                       "name": "Admin", "username": "admin", "avatar": "", "language": "en",
                                       "settings": {"show_original": True, "last_seen_enabled": True}, "glossary": [],
                                       "role": "admin", "online": False, "last_seen": None,
                                       "created_at": datetime.now(timezone.utc).isoformat()})
        elif not verify_password(admin_pw, existing_admin["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})

    # Demo users only when explicitly enabled (never in production by default).
    if os.environ.get("SEED_DEMO", "").lower() != "true":
        return
    demo_pw = os.environ.get("DEMO_PASSWORD")
    if not demo_pw:
        return
    demos = [
        {"email": "giulia@lingua.app", "name": "Giulia Rossi", "username": "giulia", "language": "it",
         "avatar": "https://images.unsplash.com/flagged/photo-1565751242292-352286c13b42?crop=entropy&cs=srgb&fm=jpg&q=85&w=200"},
        {"email": "james@lingua.app", "name": "James Carter", "username": "james", "language": "en",
         "avatar": "https://images.unsplash.com/photo-1605596507299-0fe2cbf21ed0?crop=entropy&cs=srgb&fm=jpg&q=85&w=200"},
    ]
    ids = []
    for d in demos:
        existing = await db.users.find_one({"email": d["email"]})
        if existing:
            ids.append(existing["id"])
            continue
        uid = str(uuid.uuid4())
        ids.append(uid)
        await db.users.insert_one({"id": uid, "email": d["email"], "password_hash": hash_password(demo_pw),
                                   "name": d["name"], "username": d["username"], "avatar": d["avatar"],
                                   "language": d["language"], "settings": {"show_original": True, "last_seen_enabled": True},
                                   "glossary": [], "role": "user", "online": False, "last_seen": None,
                                   "created_at": datetime.now(timezone.utc).isoformat()})
    a, b = ids
    if not await db.contacts.find_one({"user_id": a, "contact_id": b}):
        now = datetime.now(timezone.utc).isoformat()
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
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed_demo()
    logger.info("Lingua backend ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()
