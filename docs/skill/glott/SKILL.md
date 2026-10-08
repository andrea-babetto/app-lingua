---
name: glott
description: Contesto completo del progetto Glott (ex "Lingua"), la chat in cui ognuno scrive e legge nella propria lingua tradotta da Claude Haiku, costruita da Andrea Babetto (primo utente di prova Hamad). Usa questa skill ogni volta che si parla di Glott, Lingua, della chat con traduzione automatica, del repository app-lingua, di Render/lingua-api/lingua-web, MongoDB Atlas o Cloudflare R2 per questa app, del nome/logo/colore/icona dell'app, delle notifiche push o dell'installazione sul telefono, del codice d'invito, o di strategia e crescita di questa app — anche se non dice esplicitamente "Glott".
---

# Glott (ex Lingua)

Chat in tempo reale in cui **ognuno scrive e legge nella propria lingua**: Claude Haiku traduce ogni messaggio per ogni destinatario. Sito responsive installabile come app (PWA). **Quadro completo e sempre aggiornato: `docs/PROGETTO.md` nel repository `andrea-babetto/app-lingua` (ramo `main`)**; regole di lavoro in `CLAUDE.md` nello stesso repository. Se hai accesso al repository, leggi quei due file prima di proporre modifiche: sono più aggiornati di questa nota.

## Con chi lavori
- **Andrea Babetto**: non tecnico, italiano. Spiega a passi brevi e concreti, una cosa per volta, dicendo sempre **dove cliccare**; lui risponde con screenshot. Non mettere segreti in chat: se li incolla, digli di cancellarli dal servizio e crearne di nuovi.
- Primo utente reale di prova: **Hamad** (agenzia, India). Beta chiusa su invito.

## Stato (8 ottobre 2026)
In produzione e funzionante: chat 1:1 e gruppi, traduzione automatica, glossario personale, foto/file, risposte, modifica (30 min), reazioni, eliminare chat per sé, bozze, ricerca nei messaggi, notifiche push, cambio password e reset da admin, installazione su iPhone (Safari → Condividi → Aggiungi a Home) e Android (Chrome → Installa app). **Spente:** vocali, accesso Google.

## Dove sta
- Codice: GitHub `andrea-babetto/app-lingua`, ramo `main` (privato).
- Sito: Render, `lingua-web` (statico) → https://lingua-web-753a.onrender.com
- Server: Render, `lingua-api` (Python/FastAPI, piano Starter, Francoforte) → https://lingua-api-1384.onrender.com
- Database: MongoDB Atlas M0 (gratuito, **senza backup**). File: Cloudflare R2, bucket `lingua-files`. Traduzioni: API Anthropic `claude-haiku-4-5` (chiave legata a un workspace).
- Render è dietro Cloudflare: `CLIENT_IP_HEADER=cf-connecting-ip`.
- Variabili importanti su `lingua-api`: `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `ANTHROPIC_API_KEY`, `S3_*`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `INVITE_CODE` (beta chiusa), `VOICE_MESSAGES`, `OPENAI_API_KEY` (opzionali, oggi non impostate). Su `lingua-web`: `REACT_APP_BACKEND_URL`. **Mai scrivere i valori.**

## Come si lavora
1. Modifica su un ramo; prova con `cd backend && pytest` (79 test), `cd frontend && yarn build` e gli script in `tools/` (browser simulato da telefono).
2. **Non aprire pull request se non richiesto; unisci a `main` solo quando Andrea dice "unisci".**
3. Dopo l'unione, spiega cosa ripubblicare su Render (**Manual Deploy → Deploy latest commit**: `lingua-web` e, se cambia il server, anche `lingua-api`) e cosa fare sul telefono (chiudere e riaprire l'app; reinstallare l'icona solo se cambiano icona o nome).
4. Dì sempre cosa **non** hai potuto provare (iPhone vero, notifiche reali, Safari).

## Decisioni da ricordare
- Nome **Glott provvisorio** (esiste TalkGlot, suono identico; "Glot" è già usato nelle traduzioni): serve una ricerca ufficiale sul marchio e il controllo di `.app`/`.chat` prima di spendere in logo, store, pubblicità. Non dire "libero" senza verifica.
- Aspetto: colore **Azzurro** (`--h 205, --s 85%, --l 44%` in `frontend/src/index.css`), font **Plus Jakarta Sans**, icona con il nome intero "glott", "g" minuscola come favicon, texture neutra nelle conversazioni.
- Un solo tono di traduzione (neutro). Stessa lingua → nessuna traduzione, nessun costo (~0,56 $ ogni 1.000 messaggi tradotti, stima). La lingua è quella del profilo (nessun riconoscimento automatico).
- Strategia: partire da agenzie e e-commerce con collaboratori all'estero; crescita via link d'invito; Fiverr/Upwork limitano i contatti fuori piattaforma (non usarli come canale). Per ora uso interno Andrea–Hamad.

## Da fare (in ordine)
Interfaccia nella lingua di ciascuno → backup del database + pagina privacy/termini → marchio e nome definitivo + dominio → ingresso da link senza account e recupero password → vocali (chiave OpenAI + `VOICE_MESSAGES=true` + pulsante microfono) → accesso Google → app negli store (Capacitor).

## Lezioni imparate
- Chiave Anthropic: serve **legata a un workspace**; il parametro `temperature` va omesso.
- iPhone Safari non ha `Notification` fuori da un'app installata; con la tastiera Safari fa scorrere la pagina (la chat usa `useAppViewport`); le notifiche si attivano solo con un tocco; l'icona sulla Home si aggiorna solo togliendola e riaggiungendola.
- Render: regione non modificabile dopo la creazione; `REACT_APP_BACKEND_URL` entra nel sito alla build (va ricostruito quando cambia).
