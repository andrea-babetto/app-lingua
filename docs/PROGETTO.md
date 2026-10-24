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

Lista ufficiale delle funzioni da implementare, per costo e complessità (23/10/2026). Ordine dentro ogni gruppo: prima quelle che servono alla beta. Quando una funzione è fatta (o scartata) si toglie dalla lista. Scartate: silenzioso e orari (24/10/2026). Stato personale: unito alla frase di presentazione già esistente (24/10/2026).

### Costo zero, complessità piccola
- [ ] Ora locale dell'altra persona
- [ ] Risposta rapida con citazione
- [ ] Animazione di consegna (la spunta che si disegna)
- [ ] Animazione di lettura (la spunta che si colora)
- [ ] Anteprima del link quando viene incollato
- [ ] Contatore degli inviti

### Costo zero, complessità media
- [ ] Messaggi programmati (partono all'ora scelta)
- [ ] Scarica i miei dati (obbligo europeo) — **prima della beta allargata**
- [ ] Contatti senza chat (la scheda Contatti mostra anche chi non hai ancora sentito, ma devi averlo salvato)
- [ ] Ingresso da link (il link apre la chat con chi invita) — **prima della beta allargata**
- [ ] Inviti a gruppi con link
- [ ] Sondaggi nei gruppi
- [ ] Descrizione e regole del gruppo
- [ ] Posizione condivisa per un momento
- [ ] Pagine pubbliche per lingua (per farsi trovare su Google)
- [ ] Sincronizzazione su più dispositivi (come WhatsApp Web)

### Costo basso (centesimi al mese per utente)
- [ ] Recupero password da soli (serve un servizio di email, costo fisso piccolo) — **prima della beta allargata**
- [ ] Messaggi vocali: trascrizione con OpenAI, pochi centesimi al minuto di audio (complessità media, frontend incluso). Serve la chiave OpenAI e `VOICE_MESSAGES=true`. Da decidere: durata massima (proposta 2 minuti), chi ascolta l'audio (solo i destinatari), conservazione (proposta 30 giorni), cosa si mostra se la trascrizione fallisce. Parere legale sull'invio dell'audio a OpenAI.

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
- **Ricezione in voce** (tieni premuto, parli nella tua lingua; l'altra persona legge la trascrizione tradotta e può ascoltare la voce originale): il server c'è già (`POST /api/voice`, trascrizione con OpenAI, traduzione); mancano la registrazione nell'app e il lettore audio. Vedi il piano dettagliato sotto.
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
