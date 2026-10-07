# Lingua

Chat in tempo reale in cui **ognuno scrive e legge nella propria lingua**: un modello AI (Claude Haiku) traduce ogni messaggio per ogni destinatario. Funziona su desktop e su telefono (web app responsive).

> Il nome "Lingua" è provvisorio.

## Com'è fatta

| Parte | Tecnologia | Cartella |
|---|---|---|
| API + WebSocket | Python, FastAPI | `backend/` |
| Sito | React 19, Vite, Tailwind 4, shadcn/ui | `frontend/` |
| Database | MongoDB (Atlas in produzione) | – |
| File e vocali | Cloudflare R2 / qualsiasi S3 | `backend/storage.py` |
| Traduzione | API di Anthropic (`claude-haiku-4-5`) | `backend/translation.py` |
| Trascrizione vocali (opzionale) | API di OpenAI | `backend/stt.py` |
| Login Google (opzionale) | Google Identity Services | `frontend/src/components/GoogleSignIn.jsx` |

Nessun servizio di Emergent è più necessario.

### Il motore di traduzione è sostituibile
Il resto dell'app parla solo con `TranslationEngine`. I motori disponibili (variabile `TRANSLATION_PROVIDER`): `llm` (Claude, predefinito), `selfhosted` (un server compatibile LibreTranslate; usa solo modelli con licenza commerciale, **NLLB-200 è solo non commerciale**), `mock` (test). Cache, ripiego tra motori e costo reale per messaggio (dai token usati) sono nel motore, non nei singoli fornitori.

### Il messaggio è un dato, non un comando
Il testo degli utenti non è mai fidato. Va al modello dentro un tag casuale diverso a ogni richiesta, con l'istruzione di non obbedirgli; la risposta viene controllata (frasi da assistente, tag, lunghezza anomala) e, se sospetta, viene richiesta di nuovo o scartata (l'utente vede l'originale e un pulsante "riprova"). Vedi `backend/tests/test_translation.py`.

## Avvio in locale

```bash
# 1) backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # compila almeno MONGO_URL, JWT_SECRET, ANTHROPIC_API_KEY
uvicorn server:app --reload --port 8001

# 2) sito (altro terminale)
cd frontend
cp .env.example .env        # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install && yarn dev    # http://localhost:3000
```

Serve un MongoDB raggiungibile (`MONGO_URL`). Per provare senza AI a pagamento: `TRANSLATION_PROVIDER=mock`.

## Test

```bash
cd backend && pytest        # 67 test, senza rete e senza database reale (MongoDB simulato)
cd frontend && yarn build   # controlla che il sito compili
```

I test coprono: traduzione e protezioni contro i messaggi "trabocchetto", permessi tra chat, privacy della ricerca, upload pericolosi, limiti anti-abuso, login (anche Google), vocali, WebSocket, archiviazione S3.

## Pubblicare

Vedi **[docs/PUBBLICAZIONE.md](docs/PUBBLICAZIONE.md)** (guida passo-passo) e `render.yaml` (configurazione di Render).

## Sicurezza: cosa c'è e cosa manca

Fatto: password con bcrypt (fuori dal ciclo degli eventi), blocco dopo tentativi falliti, limiti per indirizzo e per utente, ricerca utenti senza elenco pubblico (solo username/email esatta/telefono esatto; nessun dato privato negli altri profili), controlli di appartenenza su ogni chat e messaggio, upload con tipi consentiti + controllo del contenuto + `nosniff` + CSP `sandbox` (niente SVG/HTML), allegati ricostruiti dai record del server, WebSocket con controllo di origine e di appartenenza, CORS esplicito.

Limiti noti (da decidere più avanti):
- I limiti anti-abuso sono in memoria: validi per **un solo** processo (come in `render.yaml`). Con più istanze serve Redis.
- I file si aprono con il loro link (identificativo casuale, come i link dei media nelle chat più diffuse). Le foto profilo devono poter essere caricate dal sito.
- Si può iniziare una chat con chiunque si trovi per username/email esatta (la richiesta di contatto è parallela, non bloccante). Se arriva spam, si rende obbligatoria l'accettazione.
- Nessuna verifica email né recupero password.
- Il token di accesso sta in `localStorage`; manca una Content-Security-Policy sul sito.
- Il token del WebSocket passa nell'indirizzo (finisce nei log del server).
- Il database gratuito di Atlas non ha backup.
