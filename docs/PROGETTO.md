# Glott (ex "Lingua") — memoria del progetto

Documento di passaggio: cosa c'è, dove sta, perché è fatto così, cosa manca. Niente segreti qui dentro (chiavi, password, codici): quelli stanno solo nelle impostazioni dei servizi.
Ultimo aggiornamento: 8 ottobre 2026.

## 1. Cos'è

Chat in tempo reale in cui **ognuno scrive e legge nella propria lingua**: un modello AI (Claude Haiku) traduce ogni messaggio per ogni destinatario. Sito responsive installabile come app (PWA), per telefono e computer.

- **Proprietario:** Andrea Babetto (Shampissima, agenzia di Amazon PPC). Primo utente di prova: **Hamad** (agenzia, India). Parla italiano, preferisce istruzioni brevi, passo per passo, con screenshot.
- **Stato:** in produzione, **beta chiusa su invito** (registrazione con codice `INVITE_CODE`). Usata da Andrea e Hamad.
- **Nome:** "Glott" è **provvisorio**. Esiste TalkGlot (app di conversazioni bilingui, suono identico) e "Glot" è già usato nelle traduzioni: prima di spendere in marchio/store serve una ricerca ufficiale (EUIPO, USPTO, UIBM) e il controllo di `.app`/`.chat`. I servizi e il codice si chiamano ancora `lingua-*`.

## 2. Dove sta tutto

| Cosa | Dove | Note |
|---|---|---|
| Codice | GitHub `andrea-babetto/app-lingua`, ramo `main` | repository **privato** (da verificare ogni tanto) |
| Sito (frontend) | Render, servizio statico `lingua-web` → https://lingua-web-753a.onrender.com | build `yarn build`, cartella `frontend/` |
| Server (API + WebSocket) | Render, servizio `lingua-api`, piano **Starter** (sempre acceso), Francoforte → https://lingua-api-1384.onrender.com | `uvicorn server:app`, cartella `backend/` |
| Database | MongoDB Atlas, cluster `lingua` (M0 gratuito, AWS eu-central-1), utente `lingua_app`, database `lingua` | **nessun backup** sul piano gratuito |
| File (foto, allegati) | Cloudflare R2, bucket `lingua-files` | token solo lettura/scrittura sul bucket |
| Traduzioni | API Anthropic, modello `claude-haiku-4-5`, chiave **legata a un workspace** | una chiave "personale" dà l'errore *not scoped to a workspace* |
| Davanti a Render | Cloudflare (l'IP vero è in `cf-connecting-ip`) | per questo `CLIENT_IP_HEADER=cf-connecting-ip` |

Emergent (dove nacque il prototipo) **non è più usato**: nessun suo servizio serve all'app. La vecchia password admin di Emergent è da considerare compromessa.

## 3. Variabili d'ambiente (nomi, non valori)

Su `lingua-api` (Render → Environment). Elenco commentato in `backend/.env.example` e `render.yaml`.

- Obbligatorie: `MONGO_URL`, `DB_NAME`, `JWT_SECRET` (generata da Render), `CORS_ORIGINS` (= indirizzo del sito, senza `/`), `ANTHROPIC_API_KEY`, `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `APP_ENV=production`.
- Amministratore: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥12 caratteri, il server la riallinea a ogni avvio).
- Beta chiusa: `INVITE_CODE` (se vuota la registrazione è aperta a tutti).
- Rete: `CLIENT_IP_HEADER=cf-connecting-ip` (verificato in `/admin` → Address check).
- Opzionali, **non impostate**: `OPENAI_API_KEY` (trascrizione vocali), `GOOGLE_CLIENT_ID` (accesso Google), `VOICE_MESSAGES=true` (riattiva i vocali, oggi spenti), `TRANSLATION_TEMPERATURE` (la libreria installata rifiutava `temperature`: oggi non viene inviata).
- Su `lingua-web`: `REACT_APP_BACKEND_URL` (= indirizzo del server, senza `/`). Va **ricostruito** il sito quando cambia (il valore entra nel codice alla build).

## 4. Come è fatto

**Backend** (`backend/`, Python 3.13, FastAPI, motor/MongoDB, WebSocket):
- `server.py` — tutte le rotte, WebSocket, middleware (limite dimensioni, CORS, controlli), avvio e indici.
- `translation.py` — motore di traduzione sostituibile (`llm` = Claude, `selfhosted`, `mock`), cache (testo+lingue+tono+glossario, TTL 30 giorni), prompt rinforzato contro le "iniezioni" (il messaggio è un dato, non un comando), costo reale dai token.
- `security.py` — limiti di richieste in memoria (un solo processo), IP del client, regole per upload, pulizia input.
- `storage.py` — S3/R2 (in sviluppo: cartella locale). `stt.py` — trascrizione OpenAI (opzionale). `push.py` — notifiche Web Push. `languages.py` — 40+ lingue.
- Test: `backend/tests/` (79, MongoDB simulato, nessuna rete). `cd backend && pytest`.

**Frontend** (`frontend/`, React 19, Vite, Tailwind 4, shadcn/ui):
- `src/pages/` — `Login`, `Onboarding`, `Chat` (schermata principale, WebSocket con riconnessione), `Admin` (costi, indirizzo, persone + reset password).
- `src/components/chat/` — `Sidebar` (elenco, tab Chats/Groups/Profile), `ChatWindow`, `MessageBubble`, `MessageActions` (menu al tocco), `ProfilePanel`, `InfoPanel`, `NewChatDialog`, `PushPrompt`.
- `src/hooks/useAppViewport.js` — tiene ferma l'intestazione quando si apre la tastiera su iPhone.
- `src/lib/push.js` + `public/sw.js` — notifiche. `public/manifest.json` + icone — installazione.
- Font: Plus Jakarta Sans (incluso nel sito). Colore: variabili `--h --s --l` in `src/index.css` (oggi **Azzurro** `205 85% 44%`). Sfondo chat: texture neutra `public/wallpaper-*.svg`.

**Dati (collezioni Mongo):** `users`, `chats`, `messages` (originale + traduzioni per lingua + traduzioni per utente con glossario, `reactions`, `deleted_for`), `contacts`, `files`, `translation_cache`, `translation_logs`, `reports`, `settings` (chiavi VAPID create da sole), `push_subs`.

## 5. Funzioni oggi

Chat 1:1 e gruppi; traduzione automatica per ognuno (originale sempre recuperabile); glossario personale (termini da non tradurre); un solo tono (neutro); foto e file; risposte, **modifica entro 30 minuti** (ritraduce), **reazioni** (una per persona), eliminazione per me/per tutti, **eliminare una chat solo per sé** (tasto premuto a lungo / clic destro); bozze per chat; anteprima foto; tasto "vai all'ultimo messaggio"; ricerca nei messaggi; presenza e "sta scrivendo"; blocco e segnalazione utenti; ricerca persone **solo per username, email esatta o telefono esatto**; **notifiche push** con l'app chiusa; cambio password; reset password da `/admin`; dashboard costi; installazione PWA (iPhone: Condividi → Aggiungi a Home; Android: Installa app).

**Spente:** vocali (`VOICE_MESSAGES`), accesso Google (nessun `GOOGLE_CLIENT_ID`).

## 6. Decisioni prese (e perché)

- Fuori da Emergent, tutto su servizi propri (Render, Atlas, R2, Anthropic): controllo e costi chiari.
- Traduzione con **Claude Haiku** (non gratis, ma qualità e costo bassi: ~0,56 $ ogni 1.000 messaggi tradotti, stima). Stessa lingua → **nessuna traduzione, nessun costo**. In un gruppo si traduce una volta per lingua.
- **Lingua = quella del profilo** (non c'è riconoscimento automatico della lingua del testo).
- Un solo tono neutro (la scelta formale/informale è stata tolta; il motore la sa ancora fare).
- Beta chiusa su invito; vocali spenti ("solo testo al momento").
- Aspetto: colore Azzurro, font Plus Jakarta Sans, icona con il nome intero "glott", "g" minuscola come favicon (la "G" maiuscola somigliava a quella di Google).
- Notifiche: il server manda la push solo a chi non è collegato da più di 60 secondi (ping ogni 20 s dal sito); gli indirizzi push ammessi sono solo quelli dei browser principali (il server si collega a quell'indirizzo).

## 7. Sicurezza e limiti noti

Fatto: password bcrypt (fuori dal ciclo degli eventi), blocco dopo tentativi falliti, limiti per indirizzo e per utente, token JWT che muoiono al cambio password, ricerca utenti senza elenco pubblico, controlli di appartenenza su ogni chat/messaggio, upload con tipi consentiti + controllo del contenuto + `nosniff` + CSP `sandbox` (niente SVG/HTML), allegati ricostruiti dai record del server, WebSocket con controllo di origine, CORS esplicito.

Limiti: limiti anti-abuso **in memoria** (un solo processo; con più istanze serve Redis); file raggiungibili da chi ha il link (identificativo casuale); si può aprire una chat con chiunque si trovi per username/email esatta; **nessuna verifica email né recupero password autonomo**; token in `localStorage`; nessuna Content-Security-Policy sul sito; **nessun backup** del database; **nessuna pagina privacy/termini** (i messaggi passano da Anthropic: dirlo prima di aprire a persone esterne).

## 8. Strategia (sintesi, ottobre 2026)

- WhatsApp traduce già i messaggi (dal 2025, a richiesta per messaggio) e Telegram pure (a pagamento per la chat intera): "chat che traduce" da sola non basta. Vantaggio di Glott: traduzione **automatica per tutti**, **glossario** (ACOS, bid...), niente numero di telefono da dare, uso professionale.
- Punto di partenza: **agenzie ed e-commerce con collaboratori all'estero** (assistenti virtuali, freelance). Crescita: il **link d'invito** (ogni conversazione porta un'altra persona) → da costruire: **ingresso da link senza account**; poi pagina pubblica per freelance ("scrivimi nella tua lingua").
- Fiverr e Upwork limitano lo scambio di contatti fuori piattaforma: non usarli come canale.
- Per ora: **uso interno tra Andrea e Hamad**; strategia e crescita in pausa fino a nuova decisione.
- Soldi (ipotesi): gratis con tetto di messaggi, piano per team a pagamento (5-10 $ a persona al mese).

## 9. Da fare (in ordine)

1. Interfaccia nella lingua di ciascuno (oggi tutta in inglese).
2. Backup del database (piano Atlas con backup) + pagina privacy e termini.
3. Ricerca ufficiale sul marchio e scelta del nome definitivo; dominio proprio (`.app`/`.chat`/`.com`).
4. Ingresso da link senza account; recupero password autonomo (serve un servizio email).
5. Vocali: chiave OpenAI + `VOICE_MESSAGES=true` + rimettere il pulsante del microfono (è stato tolto dal sito).
6. Accesso con Google (`GOOGLE_CLIENT_ID`). Regolazione (sposta/ingrandisci) della foto profilo.
7. App negli store (Capacitor): serve il nome definitivo, Apple Developer 99 $/anno, Google Play 25 $ una tantum; le notifiche push native vanno aggiunte.

## 9bis. Idee per il futuro e priorità (riflessione di ottobre 2026)

Sono ragionamenti, non ricerche di mercato: nessun numero verificato.

**Le tre da fare per prime** (sono quelle che servono ai team come il nostro ogni giorno, e ci distinguono da WhatsApp e Telegram):
1. **Ingresso da link senza account**: è il motore di crescita senza ads (ogni conversazione porta un'altra persona).
2. **Interfaccia nella lingua di ciascuno** (oggi tutta in inglese).
3. **Glossario condiviso di team** (termini fissi di brand e prodotto, non solo personali).

**Poi, a livelli:**
- *Team:* vocali con trascrizione e traduzione; traduzione di allegati, PDF e screenshot; riassunto di una conversazione lunga nella propria lingua.
- *Chiarezza:* scelta del tono per messaggio (formale/amichevole: il motore lo sa già fare); avviso quando una frase è ambigua; originale e traduzione affiancati.
- *Altri pubblici:* link pubblico "scrivimi nella tua lingua" per freelance e piccoli negozi; widget per siti web; modalità "famiglia" semplice.
- *Ambiziose:* sottotitoli tradotti in chiamata; tutor che propone le parole nuove incontrate.

**Da evitare per ora:** temi sanitari e legali per migranti (un errore di traduzione costa troppo e non abbiamo le tutele); videochiamate (costose e già presidiate); voler servire tutti insieme.

**Limite da dire sempre agli utenti:** la traduzione automatica può sbagliare (battute, slang, dialetti), quindi l'originale deve restare visibile.

**Proteggere il progetto:** l'idea non è registrabile né brevettabile. Si proteggono nome/logo (marchio, dopo la ricerca ufficiale), dominio, codice (resta privato; contratti con chi collabora) e con NDA verso chi vede i dettagli tecnici. Per decisioni importanti serve un consulente di proprietà intellettuale.

## 10. Come lavorare sul progetto

- **Flusso:** lavoro su un ramo → pull request → **si unisce a `main` solo quando Andrea lo dice** ("unisci"). Mai segreti in chat o nel codice. Non aprire PR se non richieste.
- **Rilascio:** dopo l'unione, su Render **Manual Deploy → Deploy latest commit** su `lingua-web` e/o `lingua-api` (se è cambiato il server, entrambi). Sul telefono chiudere e riaprire l'app; reinstallare l'icona solo se cambia icona o nome.
- **Controlli prima di unire:** `cd backend && pytest` (79 test); `cd frontend && yarn build`; prova nel browser simulato con gli script in `tools/e2e/` (vedi `tools/README.md`).
- **Provare in locale senza AI a pagamento:** `TRANSLATION_PROVIDER=mock`, oppure il server di prova in `tools/e2e/run_demo_backend.py` (database in memoria, traduttore finto).
- **Guide:** `docs/PUBBLICAZIONE.md` (messa online passo passo), `README.md`.

## 11. Cose imparate (per non ripeterle)

- Anthropic: la chiave deve essere **legata a un workspace**. Il parametro `temperature` veniva rifiutato dalla libreria installata: non va mandato di default.
- iPhone Safari (fuori da una app installata) **non ha l'oggetto `Notification`**: usarlo senza controllare spegne la pagina (schermo nero). Ora ogni uso è protetto e c'è una rete di sicurezza che mostra l'errore.
- iPhone: con la tastiera Safari fa scorrere la pagina e l'intestazione sparisce → la schermata chat segue il *visual viewport* (`useAppViewport`).
- Nessun `Notification` automatico all'avvio: serve un tocco dell'utente (obbligatorio su iPhone).
- Le anteprime dell'icona sulla Home restano in memoria: per vedere una nuova icona va tolta e riaggiunta.
- Render: la regione di un servizio non si cambia dopo la creazione; le modifiche a `render.yaml` richiedono di sincronizzare il Blueprint.
- Nello strumento shell: non usare `pkill -f <nome>` nello stesso comando che contiene quel nome (si uccide da solo): usare `[x]` nel pattern e comandi separati.
