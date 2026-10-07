# Lingua — PRD

## Problem statement
A WhatsApp/Telegram-style real-time messenger where every user writes and reads in their OWN language and AI (Claude Haiku) auto-translates every message between participants. Removes language barriers for friendships, dating, work, travel, family, business. Each message stores original + per-language translations so the original is always recoverable.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT Bearer auth (localStorage). WebSocket at /api/ws for real-time delivery, typing, presence, receipts.
- Pluggable translation engine (`backend/translation.py`): `TranslationProvider` interface with `detect_language`, `translate`, `supported_languages`. Providers: LLMProvider (default, Claude Haiku 4.5 via Emergent universal key), SelfHostedProvider (LibreTranslate/NLLB stub, env URL), MockProvider (tests). Selected by TRANSLATION_PROVIDER env. Fallback chain (mock NOT in production chain). Per-translation cache (sha256 of text+source+target+tone) + translation_logs (provider, chars, latency, est_cost). Retry/backoff on 429.
- Files/avatars: Emergent Object Storage.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui + framer-motion. Light/dark with system detection. RTL support (ar/he/ur/fa). Outfit font.

## User personas
- Multilingual friends/family, cross-border couples, global teams, travelers.

## Core requirements (static)
- Own-language read/write with auto-translation; original recoverable; translate once per distinct target lang + cache; skip when langs match.
- Translated-by-default with "translated from X" toggle; sender sees original instantly; translating state; failed→retry, never lose a message.
- Email/password + Google (Google deferred). Onboarding: name, avatar, searchable 40+ language picker. Settings: show-original, last-seen, language, personal glossary, tone per chat.
- 1:1 chat, groups endpoint; sent/read ticks, typing, presence, unread counts, infinite scroll (before cursor), files/images, emoji, reply, delete me/everyone, push notifications.
- Pluggable engine + admin cost dashboard, rate concerns, 4000-char limit.

## Implemented (2026-06, pass 1)
- [x] Email/password JWT auth, /me, profile update, seeded demo users (giulia IT, james EN) + admin.
- [x] Language onboarding with 40+ searchable languages.
- [x] Pluggable translation engine with LLM/selfhosted/mock providers, caching, logging, fallback, retry.
- [x] 1:1 real-time chat over WebSocket with LIVE Claude Haiku translation (verified: Italian↔English incl. idioms).
- [x] Translation badge toggle (original/translated), translating + failed/retry states.
- [x] Contact search + request/accept/decline; new chat dialog + invite link.
- [x] Settings: show-original, last-seen, language change, personal glossary (injected into prompt).
- [x] File/image upload (object storage), emoji picker, reply, delete me/everyone, read ticks, typing, presence.
- [x] Admin cost dashboard (/admin) with daily counts + estimated cost.
- [x] Light/dark + system detection, RTL support, responsive desktop 3-pane / mobile single-column.
- [x] Browser push notifications for background messages.

## Backlog (P1/P2)
- P1: Google sign-in (Emergent-managed) — button present but disabled.
- P1: Full group chat UI (create group dialog, admin roles, member management). Backend endpoint exists.
- P1: Per-chat tone selector in UI (backend endpoint exists).
- P2: Voice messages (record → transcribe → translate). Structure ready.
- P2: Block & report user; privacy/terms pages; UI localization (IT/EN).
- P2: Infinite scroll UI wiring (backend `before` cursor ready); message search.

## Next tasks
- Add Google sign-in; build group-chat UI; add tone selector to chat header.

## Iteration 2 (2026-06)
- Bug fixes: (1) sidebar preview shows translated last-message text, "Attachment" only for files; (2) delete-for-everyone now removes for both users persistently; (3) desktop conversation panel fills full width; (4) demo users gated behind SEED_DEMO env, admin password moved to env (rotated).
- Features: group chat (create, per-language translation, admin roles, add member, promote admin, leave, optional info panel), per-chat tone selector (formal/neutral/casual, injected into translation prompt), real Emergent-managed Google login (POST /api/auth/google/session).
- Translation prompt tuned for idiomatic (non-literal) output. Verified live via testing agent: 15/15 backend tests pass; Hindi↔Italian, URL/paragraph/emoji preservation all good.

## Iteration 3 (2026-06)
- Features: (1) Voice messages — record via MediaRecorder, upload to /api/voice, transcribe with OpenAI Whisper (whisper-1 via Emergent key), translate transcript per recipient language, play audio + show translated transcript; transcription_failed state. (2) In-conversation message search (/api/messages/{id}/search over original + viewer-language translation, regex-escaped). (3) Group avatar + name + description editing by admins (/api/chats/{id}/info, avatar restricted to uploaded files). (4) Block & report users (/api/users/{id}/block|unblock|report; blocked direct messages return 403).
- UI: WhatsApp-style larger text (bubbles text-[15px]) and spacing across sidebar, bubbles, header, input. Voice mic button shows when input empty.
- Verified by testing agent: 27/27 backend tests (12 new + 15 regression); frontend OK at 1280 and 390px, no overflow. Hardening applied: search regex escape, 25MB voice cap, group-avatar URL validation.
- Remaining backlog: split server.py into routers; optional E2E encryption; UI localization (IT/EN); privacy/terms pages.

## Iteration 4 (2026-06)
- Features: (1) Change own profile picture — avatar upload in Settings (camera button) and Onboarding (custom photo). (2) Phone number field on profile; users findable by username, email OR phone (/api/users/search). (3) Editable name/username/phone in Settings with Save button. 
- UI polish: date separators (Today/Yesterday/date) between messages, dotted chat wallpaper, larger WhatsApp-style text/spacing.
- Hardening: search_users regex-escaped (handles '+39'), phone length cap (32), avatar must be an uploaded /api/files URL (or unsplash demo). Verified: 7/7 new tests + regression; obsolete iter3 avatar test updated.
