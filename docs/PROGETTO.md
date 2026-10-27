# Glott (ex "Lingua") — memoria del progetto

Documento di passaggio: cosa c'è, dove sta, perché è fatto così, cosa manca. Niente segreti qui dentro (chiavi, password, codici): quelli stanno solo nelle impostazioni dei servizi.
Ultimo aggiornamento: 8 ottobre 2026.

## 1. Cos'è

Chat in tempo reale in cui **ognuno scrive e legge nella propria lingua**: un modello AI (Claude Haiku) traduce ogni messaggio per ogni destinatario. Sito responsive installabile come app (PWA), per telefono e computer.

- **Proprietario:** Andrea Babetto (Shampissima, agenzia di Amazon PPC). Primo utente di prova: **Hamad** (agenzia, India). Parla italiano, preferisce istruzioni brevi, passo per passo, con screenshot.
- **Stato:** in produzione, **beta chiusa su invito** (registrazione con codice `INVITE_CODE`). Usata da Andrea e Hamad.
- **Nome:** **Glotter** (scelto da Andrea il 22/10/2026): "glot" dal greco *glotta* (lingua) + "-ter" (chi fa qualcosa). Interfaccia già aggiornata (logo, colori antracite, avorio e verde salvia (aggiornati il 23/10/2026 sul ramo `design-refresh`, partendo dal design nero e giallo), carattere Onest, 41 lingue) con il design in `docs/brand/design_handoff_glotter/`. Marchio NON ancora verificato: TMview trova "GLOTTER" registrato in Messico (classe 25) e "PolyGlotterz" in Francia (classe 38, telecomunicazioni); serve un parere di un consulente in marchi (EUIPO, WIPO, UIBM). Domini: glotter.com occupato; alla verifica del 22/10 risultavano liberi .it .net .biz .eu .me .tel .tv (da confermare dal registrar prima di comprarli). Repong è stato il nome precedente: resta solo nei documenti di storia (`docs/brand/design_handoff_repong/`).

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
- Opzionali, **non impostate**: `OPENAI_API_KEY` (trascrizione vocali), `GOOGLE_CLIENT_ID` (accesso Google), `VOICE_MESSAGES=true` (accende i vocali: pronti dal 26/10/2026), `TRANSLATION_TEMPERATURE` (la libreria installata rifiutava `temperature`: oggi non viene inviata).
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
- Font: **Onest** (testo e logo) e **Noto Sans Arabic** per le lingue da destra a sinistra, inclusi nel sito. Colori: token Glotter in `src/index.css` (antracite, avorio e verde salvia `#7da36f`, neutri caldi; modalità scura con primario salvia chiaro `#a9c9a0`), partiti da `docs/brand/design_handoff_glotter/tokens.css`; i file del marchio si rigenerano con `tools/brand_recolor.py` (in `docs/brand/glotter_v2/assets`). Sfondo chat: carta calda con un puntino ogni 18px (solo CSS). Logo: `components/Logo.jsx` (scritta + frecce; `LogoArrows` si anima mentre traduce). Icone: `tools/e2e/make_icons.py`.

**Dati (collezioni Mongo):** `users`, `chats`, `messages` (originale + traduzioni per lingua + traduzioni per utente con glossario, `reactions`, `deleted_for`), `contacts`, `files`, `translation_cache`, `translation_logs`, `reports`, `settings` (chiavi VAPID create da sole), `push_subs`.

## 5. Funzioni oggi

Chat 1:1 e gruppi; traduzione automatica per ognuno (originale sempre recuperabile); glossario personale (termini da non tradurre); un solo tono (neutro); foto e file; risposte, **modifica entro 30 minuti** (ritraduce), **reazioni** (una per persona), eliminazione per me/per tutti, **eliminare una chat solo per sé** (tasto premuto a lungo / clic destro); bozze per chat; anteprima foto; tasto "vai all'ultimo messaggio"; ricerca nei messaggi; presenza e "sta scrivendo"; blocco e segnalazione utenti; ricerca persone **solo per username, email esatta o telefono esatto**; **notifiche push** con l'app chiusa; cambio password; **elimina account** (Profilo → Elimina account, chiede la password; `POST /api/auth/delete-account` cancella profilo, messaggi, file, iscrizioni push, contatti; le chat uno-a-uno spariscono per entrambi; dai gruppi esce); **pagine `/privacy` e `/terms`** (bozze in italiano e inglese in `frontend/src/pages/Legal.jsx`, da far rivedere a un legale; nome del titolare e email di contatto vengono dalle variabili di build `VITE_LEGAL_NAME` e `VITE_LEGAL_EMAIL` su `lingua-web`); casella di consenso alla registrazione; **testi dell'app nella lingua del profilo** (41 lingue + inglese, arabo/ebraico/urdu/persiano da destra a sinistra; vedi sotto); reset password da `/admin`; dashboard costi; installazione PWA (iPhone: Condividi → Aggiungi a Home; Android: Installa app).

**Spente:** vocali (`VOICE_MESSAGES`), accesso Google (nessun `GOOGLE_CLIENT_ID`).

## 6. Decisioni prese (e perché)

- Fuori da Emergent, tutto su servizi propri (Render, Atlas, R2, Anthropic): controllo e costi chiari.
- Traduzione con **Claude Haiku** (non gratis, ma qualità e costo bassi: ~0,56 $ ogni 1.000 messaggi tradotti, stima). Stessa lingua → **nessuna traduzione, nessun costo**. In un gruppo si traduce una volta per lingua.
- **Lingua = quella del profilo** (non c'è riconoscimento automatico della lingua del testo).
- Un solo tono neutro (la scelta formale/informale è stata tolta; il motore la sa ancora fare).
- Beta chiusa su invito; vocali spenti ("solo testo al momento").
- Aspetto: terracotta e sabbia (Repong) sostituiti dal design Glotter (prima nero e giallo, poi antracite, avorio e verde salvia; `docs/brand/design_handoff_glotter/` e `docs/brand/glotter_v2/`). Sotto i propri messaggi, nelle chat a due, "{nome} legge in {lingua}" mostra il testo tradotto per l'altra persona.
- Notifiche: il server manda la push solo a chi non è collegato da più di 60 secondi (ping ogni 20 s dal sito); gli indirizzi push ammessi sono solo quelli dei browser principali (il server si collega a quell'indirizzo).

## 7. Sicurezza e limiti noti

Fatto: password bcrypt (fuori dal ciclo degli eventi), blocco dopo tentativi falliti, limiti per indirizzo e per utente, token JWT che muoiono al cambio password, ricerca utenti senza elenco pubblico, controlli di appartenenza su ogni chat/messaggio, upload con tipi consentiti + controllo del contenuto + `nosniff` + CSP `sandbox` (niente SVG/HTML), allegati ricostruiti dai record del server, WebSocket con controllo di origine, CORS esplicito.

Lingue dell'interfaccia: in `frontend/src/i18n/` — la frase inglese nel codice, `t("...")`, è la chiave; ogni lingua ha `locales/<codice>.json` (chiave inglese → traduzione); cosa manca resta in inglese. Dopo aver aggiunto o cambiato frasi: `python tools/extract_i18n.py` (scrive `source.json`) e `python tools/extract_i18n.py --check` (quali lingue mancano di frasi). Non tradotti: pannello `/admin`, messaggi d'errore che arrivano dal server (restano in inglese), pagine legali (solo italiano e inglese).

Limiti: limiti anti-abuso **in memoria** (un solo processo; con più istanze serve Redis); file raggiungibili da chi ha il link (identificativo casuale); si può aprire una chat con chiunque si trovi per username/email esatta; **nessuna verifica email né recupero password autonomo**; token in `localStorage`; nessuna Content-Security-Policy sul sito; **nessun backup** del database; pagine privacy/termini **solo bozza**, nessun pulsante "scarica i miei dati" (l'esportazione si fa su richiesta via email), nessun accordo scritto (DPA) con i fornitori verificato.

## 8. Strategia (sintesi, ottobre 2026)

- WhatsApp traduce già i messaggi (dal 2025, a richiesta per messaggio) e Telegram pure (a pagamento per la chat intera): "chat che traduce" da sola non basta. Vantaggio di Glott: traduzione **automatica per tutti**, **glossario** (ACOS, bid...), niente numero di telefono da dare, uso professionale.
- Punto di partenza: **agenzie ed e-commerce con collaboratori all'estero** (assistenti virtuali, freelance). Crescita: il **link d'invito** (ogni conversazione porta un'altra persona) → da costruire: **ingresso da link senza account**; poi pagina pubblica per freelance ("scrivimi nella tua lingua").
- Fiverr e Upwork limitano lo scambio di contatti fuori piattaforma: non usarli come canale.
- Per ora: **uso interno tra Andrea e Hamad**; strategia e crescita in pausa fino a nuova decisione.
- Soldi (ipotesi): gratis con tetto di messaggi, piano per team a pagamento (5-10 $ a persona al mese).

## 9. Da completare

Lista ufficiale delle funzioni da implementare, per costo e complessità (23/10/2026). Ordine dentro ogni gruppo: prima quelle che servono alla beta. Quando una funzione è fatta (o scartata) si toglie dalla lista e va in "Già fatte".

### Già fatte
- [x] Ora locale dell'altra persona (in alto nella chat e nella scheda contatto, disattivabile dalla Privacy)
- [x] Risposta rapida scorrendo il messaggio verso destra (a sinistra in arabo ed ebraico)
- [x] Animazione di consegna (la spunta che si disegna)
- [x] Animazione di lettura (la seconda spunta che si disegna e diventa verde)
- [x] Messaggi programmati (tieni premuto invio)
- [x] Citazione nelle risposte visibile a tutti (correzione, 26/10/2026)
- [x] Scarica i miei dati (Profilo › Account, 26/10/2026)
- [x] Recupero password da soli (link via email; serve un servizio SMTP su Render, 26/10/2026)
- [x] Contatti senza chat (26/10/2026)
- [x] Sondaggi nei gruppi, tradotti per ciascuno (26/10/2026)
- [x] Descrizione e regole del gruppo, tradotte per ciascuno (26/10/2026)
- [x] Info messaggio: consegnato e letto, con l'ora (legato a "ultimo accesso", 26/10/2026)
- [x] Messaggi vocali trascritti, tradotti e letti a voce nella lingua di chi ascolta (26/10/2026; da accendere su Render)
- [x] Ascolta i messaggi scritti (🔊) e Detta invece di scrivere (27/10/2026)
- [x] Ingresso da link, inviti ai gruppi con link e contatore degli inviti per l'admin (27/10/2026)

### Scartate o unite
- Schermata iniziale a rotella e versione ibrida (lista + rotella + "palcoscenico" col cielo dell'altra persona): disegnate e provate, Andrea tiene l'interfaccia attuale (27/10/2026)
- Silenzioso e orari: scartata (24/10/2026)
- Stato personale: unito alla frase di presentazione già esistente (24/10/2026)

### Rimandate (ci torniamo)
- [ ] Anteprima del link quando viene incollato (da decidere: dentro la chat, nel link d'invito, o tutte e due)
- [ ] Costi dei vocali da rianalizzare con più dati (27/10/2026: primi 19 richieste OpenAI = 0,02 $). Opzione pronta da valutare: leggere la voce tradotta e il 🔊 con la voce del telefono (gratis, immediata, qualità variabile) e usare OpenAI solo per trascrivere.

### Costo zero, complessità media
- [ ] Posizione condivisa per un momento
- [ ] Pagine pubbliche per lingua (per farsi trovare su Google)
- [ ] Sincronizzazione su più dispositivi (come WhatsApp Web)

### Costo basso (centesimi al mese per utente)

### Costo medio (si paga a ogni uso, va misurato)
- [ ] Tono che si adatta (amichevole o professionale; dai del tu o del lei): stesso costo dei messaggi

### Costo alto
- [ ] Traduzione di foto e documenti (complessità media-grande; costo per immagine)
- [ ] Conversazione dal vivo tradotta a voce (complessità grande; costo per minuto molto più alto)
- [ ] Traduzione di chiamate e video con sottotitoli (complessità molto grande; prodotto a sé)

### Prima di aprire al pubblico (non sono funzioni, ma vanno fatte)
- [ ] Revisione legale di Termini, Privacy e regole della comunità, con il contatore d'uso e la voce citati nell'informativa
- [ ] Backup del database (piano Atlas con backup)
- [ ] Nuovo codice d'invito prima di condividerlo largamente
- [ ] Traduzioni delle frasi nuove da far rivedere a madrelingua (almeno hindi, arabo, spagnolo)
- [ ] Verifica del marchio "Glotter" e del dominio con un consulente
- [ ] Pagamenti (vedi sezione Pagamenti): solo con utenti reali e commercialista
- [ ] App negli store (costi: circa 99 $ l'anno Apple, 25 $ una tantum Google): dopo la beta

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


## Novità del 23/10/2026 (ramo `design-refresh`)
- Tavolozza antracite, avorio e verde salvia (provato prima l'oro, scartato); avatar senza foto in sei colori morbidi scelti dal nome (`src/lib/avatar.js`).
- Elenco chat: filtri Tutte / Non lette; i gruppi si vedono anche tra tutte le chat.
- Chat fissate (max 5, private, salvate sul server): `POST /api/chats/{id}/pin` e `/unpin`; nell'elenco compaiono sotto "Fissate". Si fissa con pressione lunga (o clic destro) sulla chat.
- Scheda contatto: pulsanti rotondi Cerca / Blocca / Segnala e schede Media, File, Link (dai messaggi già caricati: gli ultimi 50 più quelli scorsi).
- Gruppi con emoji come immagine (facoltativa): campo `emoji` del gruppo (solo simboli, max 8 caratteri; validato dal server), scelta alla creazione e nella modifica; al posto delle iniziali.
- Titolo della schermata (icona + nome) in cima a ogni scheda al posto del logo ripetuto; scorrendo da sinistra a destra (da destra a sinistra in arabo/ebraico) si chiude la chat aperta sul telefono.
- Profilo rifatto: intestazione grande con foto, nome, @username, lingua e frase di presentazione; elenco di righe che aprono sotto-pagine (Account, Lingua e traduzione, Notifiche, Aspetto, Glossario personale, Privacy con Utenti bloccati) più "Invita un amico" (condivisione di `/?invite=username`) e "Aiuto e segnalazioni" (mail a `VITE_LEGAL_EMAIL`, compare solo se la variabile c'è).
- Frase di presentazione (`bio`, max 140 caratteri, NON tradotta): pubblica, visibile nella scheda contatto e nella ricerca.
- Utenti bloccati: `GET /api/users/blocked/details` (nomi) e sblocco dalla pagina Privacy.
- Aspetto: Chiaro / Scuro / Come il telefono (`glott_theme` = light | dark | system).
- Tema scuro: nel logo solo il pallino è verde (scritta, O e coda avorio); le icone prima dei titoli hanno il colore del testo.
- Icona dell'app (scelta da Andrea il 23/10/2026): quadro avorio, fumetto antracite, pallino verde (`tools/brand_recolor.py` poi `tools/e2e/make_icons.py`).
- Pagina d'ingresso in tre schermate: benvenuto (prima volta: logo, slogan, descrizione, animazione di esempio, "Crea il tuo account", Google se non serve il codice d'invito, "Ho già un account"), crea account (con "Indietro") e accedi ("Bentornato"). Il telefono ricorda di aver già avuto un account (`glott_seen` nel browser) e apre direttamente il modulo di accesso. Descrizione dell'app (meta e manifest) allineata allo slogan.
- Sfondo delle conversazioni in stile WhatsApp: texture fitta e leggera di piccole icone a linee Lucide (chat, lingue, viaggio, monumenti, cibo, musica; `tools/make_chat_pattern.py` le legge da `node_modules`, posizioni casuali ma fisse). Barra delle chat più larga su computer (22, 26 e 28 rem). Pagine Termini e Privacy: testata chiara con logo a contrasto e freccia che torna alla schermata di partenza (Profilo › Privacy, registrazione con nome e email già scritti, mai la password). Aiuto e feedback è una pagina con l'email scritta, "Scrivici" e "Copia" (compare solo se c'è `VITE_LEGAL_EMAIL`).

## Pagamenti: decisioni del 23/10/2026 (ipotesi, da verificare prima di costruire)
- Modello: **gratis con limite di messaggi tradotti al mese, poi abbonamento**; prima un piano personale, poi (fase 2) un piano per team.
- Prezzo personale pensato: **2-4 € al mese**; vendita **in tutto il mondo** (India, USA...); partenza prevista tra **3-6 mesi**, dopo la beta con utenti veri.
- Incasso: Andrea ha già una partita IVA / società attiva.
- Costo reale della traduzione (stima): ~0,56 $ ogni 1.000 messaggi tradotti; 300 messaggi gratis ≈ 0,17 $ al mese per utente gratuito.
- Da decidere con commercialista e legale: IVA/GST/sales tax nei vari paesi (valutare un "merchant of record" come Paddle o Lemon Squeezy, che incassa e gestisce le imposte), diritto di recesso, termini di servizio con prezzi e rinnovo.
- Da verificare: commissioni fisse sui prezzi molto bassi (pesano molto sotto i 4 €), pagamenti ricorrenti con carta in India (regole RBI), metodi di pagamento locali (UPI).
- **Contatore dei messaggi tradotti** (23/10/2026): per ogni persona e ogni mese il server conta `received` (messaggi tradotti per lei: è quello che conterebbe un tetto gratuito) e `sent` (suoi messaggi che hanno avuto bisogno di una traduzione), nella collezione `usage` (chiave `utente|AAAA-MM`; nessun testo dei messaggi). Non conta se la lingua è la stessa, né le modifiche dello stesso messaggio; un nuovo tentativo dopo un errore conta di nuovo solo ciò che è stato consegnato. `GET /api/usage` (i propri numeri; nessun limite applicato per ora), `GET /api/admin/usage?month=AAAA-MM` (solo admin: totali, mediana, 90° percentile, elenco per persona) e sezione "Messages translated per person" in `/admin`. L'eliminazione dell'account cancella anche i contatori. Da ricordare: citare i contatori d'uso nell'informativa sulla privacy prima di aprire al pubblico.

## Idee da valutare (23/10/2026, non ancora decise)
**Chat**
- Risposta rapida con anteprima della citazione (lavoro piccolo).
- Messaggi programmati: scrivi ora, parte all'ora scelta (lavoro medio, nessun costo).
- Traduzione mentre scrivi: anteprima di come arriva all'altra persona (lavoro medio; ogni anteprima costa una traduzione).
- Frasi salvate: una lista personale di traduzioni utili da riusare (lavoro piccolo, nessun costo).
- Ricerca anche nelle traduzioni, non solo nell'originale (lavoro piccolo).
- Silenzioso e orari: nessuna notifica di notte, con orario scelto (lavoro piccolo, nessun costo).
- Messaggi a tempo: scompaiono dopo un tempo scelto (lavoro medio).

**Sociali**
- Stato personale: una frase breve visibile agli altri (lavoro piccolo, nessun costo).
- Gruppi per tema con descrizione e immagine (lavoro piccolo).
- Inviti a gruppi con link, anche senza essere in rubrica (lavoro medio).
- Lingue in comune nella scheda contatto (lavoro piccolo).
- Profilo pubblico per chi fa scambio linguistico (lavoro grande; richiede moderazione e un parere legale).
- Gruppi di scambio linguistico con un argomento del giorno (lavoro grande; è la funzione che sfrutta la beta con le comunità di studenti).

## Crescita: idee per farla arrivare a più persone (23/10/2026, da provare)
- Il link d'invito apre direttamente la chat con chi invita, risposta possibile senza account; la registrazione arriva dopo la prima risposta (lavoro medio; è il punto 4 della lista da fare).
- Anteprima del link quando viene incollato (nome di chi invita, logo, slogan): lavoro piccolo, nessun costo.
- Premio per chi invita e per chi entra (messaggi in più, o un mese in più con il piano a pagamento): da introdurre insieme al limite gratuito.
- Pagine pubbliche per lingua ("chatta con parlanti hindi"), per farsi trovare su Google: lavoro medio, serve contenuto scritto bene.
- Immagine di una conversazione tradotta da condividere, solo con il consenso di tutti i partecipanti: lavoro medio, attenzione alla privacy.
- Gruppi con link di invito: lavoro medio.
- Sezione per le comunità di chi impara lingue, con esempi reali di conversazioni: lavoro piccolo.
- Ambasciatori (poche persone entusiaste con il proprio link): nessun costo, ma si fa parlando con le persone.
- Contatore degli inviti (aperti, registrati, primo messaggio, ritorno dopo una settimana): lavoro piccolo, da fare per primo.
- Da evitare: accesso alla rubrica senza parere legale; inviti automatici o in massa; premi che chiedono di invitare molte persone.

## Effetto "wow" (tecnologia che si percepisce; 23/10/2026, da valutare)
- **Ricezione in voce:** fatta il 26/10/2026 (vedi "Messaggi vocali" nelle novità).
- Traduzione che appare mentre l'altro scrive (lettera per lettera): costa una traduzione per pausa, da fare con cautela.
- Tono che si adatta (formale/informale): il motore lo sa fare; lavoro medio, costo uguale.
- Glossario che impara: propone da solo di tenere i termini che si ripetono; lavoro piccolo.
- Traduzione con spiegazione (tocchi una parola e vedi una frase d'esempio): costo di una chiamata in più.
- Riassunto della conversazione nella tua lingua: pochi token; richiede una scelta esplicita, perché legge messaggi di altri.
- Risposte suggerite già tradotte: costo più alto per conversazione.
- Sincronizzazione istantanea su più dispositivi (come WhatsApp Web): il server lo fa già; da rifinire offline.
- Animazione di consegna (spunta che si disegna quando letto): quasi gratis.
- Tema che segue l'ora (chiaro di giorno, scuro di sera): quasi gratis.
- Feedback tattile su messaggio tradotto (dove il telefono lo permette): quasi gratis.
- Icona alternativa dell'app scelta dalle impostazioni: lavoro piccolo.

## Funzioni di livello alto e complesso (23/10/2026, da pianificare dopo la beta; in lista da completare sopra)
Ordine proposto: 1) traduzione di foto e documenti, 2) apprendimento della lingua dentro la chat, 3) conversazione dal vivo tradotta a voce. Le funzioni che leggono le conversazioni (memoria, assistente di scrittura, dizionario culturale) vanno per ultime, con parere legale e scelta chiara dell'utente.
- Traduzione di foto e documenti: fotografi un menu o un cartello, il testo tradotto appare sopra l'immagine nella posizione giusta. Serve riconoscimento del testo (OCR), traduzione e resa grafica. Costo per immagine più alto di un messaggio; avviso chiaro che per documenti importanti serve un controllo umano.
- Apprendimento della lingua dentro la chat: segnala gli errori nei messaggi scritti nella lingua che si sta imparando, con la correzione. Richiede livelli per persona e test con chi studia davvero.
- Conversazione dal vivo tradotta a voce: due persone parlano al telefono, ognuna nella propria lingua. Richiede latenza sotto il secondo, voci sintetiche naturali, servizi di voce in tempo reale: costi per minuto molto più alti. Da decidere: chiamate dentro l'app e chi paga.
- Traduzione di chiamate e video con sottotitoli: un prodotto a sé (infrastruttura di chiamate, WebRTC).
- Memoria personale delle conversazioni: ricerca per significato in tutte le chat. Rischio privacy alto: va progettata con cancellazione chiara.
- Assistente di scrittura: aiuta a rendere una bozza adatta al destinatario (cortese, chiara, formule locali). Richiede di capire il contesto della relazione e di non sostituire la voce della persona.
- Dizionario e contesto culturale: spiega modi di dire e termini locali. Le spiegazioni sbagliate fanno danni: scelta chiara su quando mostrarle.
- Rete di traduttori umani per messaggi importanti (contratti, sanità, legale): un'organizzazione e una responsabilità a sé.

## Novità del 24/10/2026
- **Ora locale dell'altra persona:** il telefono manda il suo fuso orario (`timezone`, nome IANA come "Asia/Kolkata", controllato dal server con `zoneinfo`; pacchetto `tzdata` aggiunto) e lo aggiorna quando cambia. Nelle chat a due si vede in alto ("online · ore 22:32 locali", solo se l'ora è diversa) e nella scheda contatto ("Ora locale: 22:32 (+3:30)"). Solo chi ha una chat con la persona la vede (non nella ricerca né nelle richieste di contatto: `stranger_profile`). Interruttore "Mostra la mia ora locale" in Profilo › Privacy (`settings.local_time_enabled`, acceso di default): chi lo spegne non mostra la sua ora e non vede quella degli altri.
- **Risposta scorrendo il messaggio** (come WhatsApp): sul telefono si trascina un messaggio verso destra (verso sinistra in arabo/ebraico); oltre 56 px compare l'icona e, lasciando, si apre la risposta con la citazione (breve vibrazione dove il telefono la supporta). Un trascinamento corto o verticale non fa niente. Lo scorrimento che parte dal bordo dello schermo (28 px) chiude sempre la chat, anche sopra un messaggio.
- **Spunte animate:** un messaggio appena inviato disegna la sua spunta; quando è letto la seconda spunta si disegna e tutte e due diventano verde salvia (#a9c9a0). I messaggi vecchi non si muovono. Rispetta "riduci animazioni". Corretto anche un difetto: la doppia spunta si vedeva solo mentre la chat era aperta (ora viene da `read_by` del server); nei gruppi diventa verde solo quando hanno letto tutti.
- **Messaggi programmati:** si tiene premuto il tasto invio (o clic destro su computer) e si sceglie quando parte: tra 1 ora, stasera alle 20 (fino alle 19), domani alle 9, o data e ora a scelta (fino a 30 giorni). Nelle chat a due compare anche l'ora di chi riceve ("Per Hamad saranno le 13:30"). In attesa, il messaggio si vede solo a chi l'ha scritto, in fondo alla chat, tratteggiato con l'orario; toccandolo: invia ora, cambia ora, elimina. Server: collezione `scheduled`, `POST /api/scheduled`, `GET /api/scheduled/{chat}`, `PUT/DELETE /api/scheduled/{id}`, `POST /api/scheduled/{id}/send-now`; un ciclo ogni 15 secondi invia quelli scaduti (tolti prima di partire, quindi mai due volte; non parte in `APP_ENV=test`). Massimo 20 in attesa a persona. La traduzione avviene alla partenza. Se nel frattempo si è bloccati o fuori dal gruppo, il messaggio viene scartato e chi l'ha scritto riceve un avviso. Eliminando l'account si cancellano anche quelli in attesa.
- **Citazione nelle risposte (corretto 26/10/2026):** prima la citazione era solo un'aggiunta temporanea sul telefono di chi scriveva (chi riceveva non la vedeva mai, e spariva riaprendo la chat). Ora il server salva con la risposta una copia di ciò che si cita (`reply_quote`: nome, testo originale fino a 300 caratteri, se era una foto); l'app mostra il messaggio citato nella lingua di chi legge quando è caricato, altrimenti la copia. La citazione sta dentro il fumetto (come WhatsApp), con il nome ("Tu" se eri tu); toccandola si va al messaggio originale, che lampeggia. La copia segue le modifiche del messaggio citato e si svuota se viene eliminato per tutti o se chi l'ha scritto elimina l'account.
- **Scarica i miei dati** (26/10/2026): in Profilo › Account il tasto "Scarica i miei dati" scarica un file JSON (`GET /api/auth/export`, massimo 5 volte l'ora) con profilo e impostazioni, messaggi scritti (originale e traduzioni fatte per chi li ha letti; esclusi quelli eliminati per tutti), chat (con nome e username degli altri membri, mai la loro email), contatti, persone bloccate, glossario, messaggi programmati, file inviati (nome e tipo), dispositivi per le notifiche (solo la data) e messaggi tradotti al mese. Non contiene i messaggi scritti dagli altri. Il server ora permette al sito di leggere il nome del file scaricato (`expose_headers`).
- **Recupero password da soli** (26/10/2026): nella pagina di accesso "Password dimenticata?" (compare solo se il server può mandare email: `password_reset` in `/api/config`). Si scrive l'email; la risposta è sempre la stessa, che l'account esista o no. Se esiste parte un'email (italiano o inglese secondo la lingua del profilo) con un link `…/reset?token=…` valido 1 ora e una sola volta; nel database c'è solo l'impronta del codice (`password_resets.token_hash`). Dalla pagina `/reset` si sceglie la nuova password e si entra; le altre sessioni si chiudono. Limiti: 3 richieste l'ora per email, 10 per indirizzo. Email via SMTP (`backend/mailer.py`), variabili su `lingua-api`: `SMTP_HOST`, `SMTP_PORT` (587 o 465), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. In prova (`APP_ENV=test`) le email non partono e il link compare nel registro del server.
- **Contatti senza chat** (26/10/2026): la scheda Contatti mostra le persone con cui hai una chat più quelle salvate senza chat nell'elenco (`GET /api/contacts`: contatti accettati o richiesta inviata; mai le persone bloccate o che ti hanno bloccato). Chi ha la richiesta ancora in attesa ha la scritta "Richiesta inviata" e non mostra l'ora locale. Toccandole si apre (o si riapre) la chat. Ordine alfabetico.
- **Sondaggi nei gruppi** (26/10/2026): nei gruppi il "+" offre "Foto o file" e "Sondaggio". Una domanda (max 200 caratteri), da 2 a 10 risposte (max 100, non uguali), "Consenti più di una risposta". Il sondaggio è un messaggio: la domanda è il testo (tradotta come un messaggio, conta nel contatore), le risposte vengono tradotte per ogni lingua del gruppo (`poll.translations`). Si vota toccando una risposta (ritoccandola si toglie); il conteggio si aggiorna in diretta per tutti. Chi ha votato cosa non viene mandato agli altri (solo i numeri e la propria scelta). Non si modifica; se eliminato per tutti non si vota più. `POST /api/polls`, `POST /api/messages/{id}/vote`. Nell'elenco chat compare "📊 domanda".
- **Descrizione e regole del gruppo** (26/10/2026): gli amministratori scrivono descrizione (max 500) e regole (max 1000, facoltative) nella modifica del gruppo. Sono salvate nella lingua di chi le scrive (`texts_language`) e tradotte per ogni lingua del gruppo (`group_texts_translations`, ritradotte quando cambiano o quando entra qualcuno con un'altra lingua). Nella scheda del gruppo ciascuno le legge nella propria lingua, con "Tradotto da …" sotto le regole; chi modifica parte sempre dagli originali (`description_original`, `rules_original`).
- **Info messaggio: consegnato e letto, con l'ora** (26/10/2026): tenendo premuto (o toccando) un proprio messaggio c'è "Info": per ogni persona "Letto 14:35" e "Consegnato 14:32" (ieri / giorno per le date passate); nei gruppi tre elenchi: Letto da, Consegnato a, Non ancora consegnato. Spunte: una grigia = inviato, due grigie = consegnato, due verdi = letto (nei gruppi: consegnato/letto da tutti). Server: `delivered_to` e `read_at` (persona → ora) su ogni messaggio. "Consegnato" scatta quando il messaggio arriva all'app aperta (WebSocket) o quando l'app di chi riceve carica l'elenco chat o la chat; l'arrivo della sola notifica push con app chiusa NON conta ancora. Avvisi in diretta: `delivered` e `read_receipt` (con l'ora). Privacy legata a "Condividi ultimo accesso e online" (come WhatsApp, reciproco): chi lo spegne non fa sapere quando legge e non vede quando gli altri leggono; la consegna si vede sempre. Questi dati arrivano solo a chi ha scritto il messaggio. I messaggi vecchi non hanno l'ora: mostrano "Letto" senza orario.
- **Messaggi vocali** (26/10/2026): con la casella vuota, al posto della freccia c'è il microfono. Si tiene premuto e si parla (timer, punto rosso); lasciando parte. Scorrendo verso l'inizio della riga si annulla; scorrendo in su si blocca (si parla senza dito, con cestino e invio). Meno di 0,8 secondi non parte; a 2 minuti parte da solo. Si può rispondere a un messaggio con un vocale. Server: `POST /api/voice` (durata obbligatoria, max 120 s e 8 MB; webm dal computer/Android, mp4 da iPhone). Il vocale arriva subito come audio; la trascrizione (OpenAI `gpt-4o-mini-transcribe`) avviene dopo, poi la traduzione come un messaggio normale e la notifica ("🎤 testo"). Nell'elenco chat e nelle notifiche (nella lingua di chi le riceve, subito, senza aspettare la trascrizione) si vede "🎤 Vocale · 0:12" con la durata, non il testo (chiesto da Andrea il 27/10/2026). Se la trascrizione non riesce: "Trascrizione non riuscita", l'audio resta. Chi lo manda vede il testo capito, per controllare. Chi parla un'altra lingua: play legge la traduzione con una voce sintetica unica (OpenAI `gpt-4o-mini-tts`, voce `TTS_VOICE`, di base "alloy"), preparata dal server subito dopo la traduzione (dal 27/10/2026, chiesto da Andrea: così play parte all'istante; si paga anche per i vocali non ascoltati, circa 1,5 centesimi per minuto e per lingua) e tenuta una volta per testo tradotto (chi legge la stessa traduzione sente lo stesso audio, pagato una volta); se non è pronta, `POST /api/messages/{id}/speech` la crea al momento; sotto "Scrivilo" (testo tradotto) e "Voce originale". Senza chiave OpenAI i vocali funzionano solo come audio, con il testo che resta vuoto. Dopo 30 giorni (ciclo ogni ora) audio e voci tradotte vengono cancellati: resta il testo con "Audio non più disponibile". Eliminando per tutti si cancella anche l'audio. Costi stimati in `voice_logs` e nella dashboard admin (`voice`). Informativa privacy aggiornata (OpenAI, USA, 30 giorni): da far vedere al legale. Prova nel browser: `tools/e2e/voice_check.py` con `VOICE_DEMO=1`.
- **Ascolta i messaggi scritti** (27/10/2026): accanto a "Tradotto da …" c'è 🔊, e nel menu di ogni messaggio scritto "Ascolta". Legge il messaggio nella lingua di chi ascolta con la stessa voce sintetica dei vocali (`POST /api/messages/{id}/speech`, ora valido anche per i messaggi scritti). La voce si crea al primo ascolto (non in anticipo: sarebbe un costo su ogni messaggio) e si tiene per chi legge la stessa traduzione; si cancella dopo 30 giorni, quando il messaggio viene modificato o eliminato per tutti. Limite: 60 ascolti nuovi l'ora a persona. Una sola voce alla volta in tutta l'app (`lib/speak.js`).
- **Detta invece di scrivere** (27/10/2026): nella casella del messaggio c'è un'icona a onde (accanto alle emoji). Si tocca, si parla (max 2 minuti), si tocca "Fatto": le parole compaiono nella casella, da controllare e poi inviare; la ✕ annulla. Server: `POST /api/dictate` (trascrizione OpenAI nella lingua del profilo; l'audio non viene salvato; 20 al minuto). Compare solo se c'è la chiave OpenAI (`dictation` in `/api/config`). Informativa privacy aggiornata.
- **Ingresso da link** (27/10/2026, decisioni di Andrea: il link basta, senza limite di persone; contatore solo per l'admin; nei gruppi serve l'approvazione). Ognuno ha un link personale `/?invite=<codice>` (8 caratteri casuali, `users.invite_code`, creato al primo uso; Profilo › "Invita un amico" e "Condividi il mio link d'invito" nella nuova chat; `GET /api/me/invite`, `POST /api/me/invite/reset` per un link nuovo: il vecchio smette di funzionare). Chi apre il link vede "Giulia ti ha invitato su Glotter" nella pagina di benvenuto, si registra **senza codice della beta** (`invite_link` in registrazione e Google; `users.invited_by`) e dopo la scelta della lingua si apre da sola la chat con chi l'ha invitato (contatti accettati per tutti e due; chi invita riceve "Marco è entrato su Glotter con il tuo invito"). Se ha già un account, entra e la chat si apre. Il codice del link si tiene nel telefono finché la persona non è dentro (`lib/invite.js`). I vecchi link con lo username (`/?invite=nome`) aprono ancora la chat ma **non** valgono come invito (serve il codice della beta: gli username si possono indovinare). **Gruppi:** gli amministratori creano il link nella scheda del gruppo (Condividi, Nuovo link, Disattiva; `POST/DELETE /api/chats/{id}/invite-link`, `?reset=true`). Chi lo apre chiede di entrare (anche appena registrato, sempre senza codice della beta): gli amministratori ricevono un avviso (e una notifica se l'app è chiusa), vedono in cima alla chat "Marco chiede di entrare · Vedi" e nella scheda Accetta / Rifiuta (`POST /api/chats/{id}/requests/{persona}/approve|decline`). Il link e le richieste li vedono solo gli amministratori. Massimo 50 membri e 100 richieste in attesa. **Contatore:** in `/admin` il riquadro "Invites" (`GET /api/admin/invites`): quante persone ha portato ciascuno e quante sono entrate dai link dei gruppi. Nota: con link senza limite il codice della beta (`INVITE_CODE`) protegge solo chi arriva senza link. Prova nel browser: `tools/e2e/invite_check.py`.
