# Come mettere Lingua online

Tempo: circa un'ora la prima volta. Costo del test: circa 7-15 € al mese (vedi in fondo).

Le schermate dei servizi cambiano ogni tanto: se un pulsante ha un nome leggermente diverso, cerca quello più simile. **Le chiavi segrete non vanno mai incollate in chat, nelle email o nel codice**: si scrivono solo nelle impostazioni dei servizi.

Prepara un file di appunti (fuori da questo repository) dove segnare, man mano, i valori che ti servono: ti serviranno tutti alla fine.

---

## 1. Il database: MongoDB Atlas (gratis per il test)

1. Crea un account su **mongodb.com/atlas**.
2. Crea un cluster gratuito (**M0**), provider AWS, zona **Frankfurt (eu-central-1)**, nome `lingua`. **Togli la spunta** a "Preload sample dataset" (occupa quasi tutti i 512 MB gratuiti) e a "Automate security setup" (autorizzerebbe solo il tuo indirizzo di casa).
3. Nella finestra "Connetti" (o in *Database Access*) crea l'utente `lingua_app` con una password **solo lettere e numeri** (simboli come `@ : / ? #` rompono l'indirizzo). Un modo per generarla senza che passi da nessuna parte: nel Terminale `openssl rand -hex 16`.
4. *Network Access* → aggiungi l'indirizzo `0.0.0.0/0` ("da qualsiasi posto"). Serve perché gli indirizzi di Render cambiano; il database resta protetto da utente e password.
5. *Connect* → *Drivers* → copia l'indirizzo che inizia con `mongodb+srv://`. Sostituisci `<password>` con la tua password.
   👉 Questo è **MONGO_URL**.

> Il piano gratuito **non fa copie di sicurezza**. Va bene per il test con Hamad. Prima di far entrare persone vere, passa a un piano con backup.

## 2. I file e i vocali: Cloudflare R2

1. Crea un account su **cloudflare.com** e apri **R2** (può chiedere una carta; il piano gratuito include 10 GB).
2. Crea un *bucket* chiamato `lingua-files`. 👉 **S3_BUCKET** = `lingua-files`
3. In R2 cerca *API Tokens* → crea un token **"Lettura e scrittura di oggetti"** (non "Amministratore") limitato al solo bucket `lingua-files`. TTL "Per sempre"; filtro IP vuoto.
4. Ti vengono mostrati: *Access Key ID* (👉 **S3_ACCESS_KEY_ID**), *Secret Access Key* (👉 **S3_SECRET_ACCESS_KEY**) e un indirizzo come `https://XXXX.r2.cloudflarestorage.com` (👉 **S3_ENDPOINT_URL**). Il segreto si vede una volta sola: salvalo subito.

## 3. L'interprete: Anthropic (Claude)

1. Crea un account su **console.anthropic.com**.
2. Aggiungi un credito piccolo (5-10 $ bastano per mesi di test) e, se la console lo permette, imposta un **limite di spesa mensile**.
3. *API keys* → crea una chiave **legata a uno spazio di lavoro** (Default). Una chiave "personale" dà l'errore *"This API key is not scoped to a workspace"*. 👉 **ANTHROPIC_API_KEY**
4. Prova dal Terminale (la chiave non compare nella cronologia):
   `read -rs ANTHROPIC_API_KEY; export ANTHROPIC_API_KEY`, poi
   `curl -s https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-haiku-4-5","max_tokens":60,"messages":[{"role":"user","content":"Translate to Italian, reply with only the translation: How are you today?"}]}'`
   Deve rispondere con `"text":"Come stai oggi?"`. Alla fine: `unset ANTHROPIC_API_KEY`.

## 4. Il server: Render

1. Crea un account su **render.com** e collega il tuo account GitHub.
2. *New +* → **Blueprint** → scegli il repository `app-lingua` e il ramo con questo codice (`claude/nice-darwin-d6y7ej`, oppure `main` dopo l'unione).
3. Render legge `render.yaml` e propone due servizi: **lingua-api** (il server) e **lingua-web** (il sito). Chiede i valori segreti:

| Dove | Variabile | Valore |
|---|---|---|
| lingua-api | `MONGO_URL` | dal punto 1 |
| lingua-api | `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | dal punto 2 |
| lingua-api | `ANTHROPIC_API_KEY` | dal punto 3 |
| lingua-api | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | la tua email e una **password nuova** di almeno 12 caratteri |
| lingua-api | `CORS_ORIGINS` | per ora scrivi `https://esempio.invalid` (lo sistemi al passo 5) |
| lingua-web | `REACT_APP_BACKEND_URL` | per ora `https://esempio.invalid` (lo sistemi al passo 5) |

   `JWT_SECRET` lo crea Render da solo.
4. Premi **Apply** e attendi che entrambi i servizi risultino pubblicati.

## 4b. Registrazione su invito (consigliata)

Il sito è pubblico: chi ha il link potrebbe creare un account e usare, senza saperlo, la tua chiave di traduzione. Per tenerlo chiuso:

1. In **lingua-api** → *Environment* → aggiungi `INVITE_CODE` con un codice che scegli tu (almeno 12 caratteri, lettere e numeri).
2. Salva: il server si riavvia.
3. Da quel momento chi si registra vede il campo **Invite code**. Chi ha già un account entra come prima, senza codice.
4. Dai il codice solo alle persone che inviti. Per cambiarlo basta modificare la variabile (gli account esistenti restano).

Senza `INVITE_CODE` la registrazione è aperta a tutti (il server lo scrive nei log all'avvio).

## 5. Collegare sito e server

Servono gli indirizzi che Render ha assegnato (tipo `https://lingua-api-xxxx.onrender.com` e `https://lingua-web-xxxx.onrender.com`).

1. In **lingua-api** → *Environment* → `CORS_ORIGINS` = indirizzo del **sito** (senza `/` finale).
2. In **lingua-web** → *Environment* → `REACT_APP_BACKEND_URL` = indirizzo del **server** (senza `/` finale).
3. Premi *Manual Deploy → Deploy latest commit* su **tutti e due**. (Il sito si "fotografa" l'indirizzo del server quando viene costruito: per questo va ricostruito.)

## 6. Controlli

- Apri `https://…lingua-api….onrender.com/api/health`: deve rispondere `{"ok":true}`.
- Apri il sito, crea due account con due email diverse (in due finestre, una anche in anonimo), scegli lingue diverse e scrivetevi. Devi leggere i messaggi tradotti.
- **Controllo anti-abuso (10 secondi):** entra con l'account amministratore e apri `/admin` sul sito. Nel riquadro "Address check" c'è l'indirizzo con cui il server ti vede: deve essere **il tuo indirizzo vero** (confrontalo con un sito tipo "qual è il mio IP"), non quello di Render o Cloudflare. Se è diverso, aggiungi su lingua-api la variabile `CLIENT_IP_HEADER` = `cf-connecting-ip` (o cambia `TRUST_PROXY_HOPS`), ripubblica e ricontrolla. Se salti questo passaggio, i limiti anti-abuso potrebbero contare tutti gli utenti come una sola persona.
- Nella stessa pagina `/admin` trovi la dashboard dei costi di traduzione.

## 7. Cose facoltative (si possono aggiungere dopo)

- **Vocali tradotti:** crea una chiave su platform.openai.com e aggiungila a lingua-api come `OPENAI_API_KEY`. Senza, i vocali arrivano come audio ma senza testo.
- **Accesso con Google:** su console.cloud.google.com → *APIs & Services* → *Credentials* → *OAuth client ID* di tipo *Web application*. In "Authorized JavaScript origins" scrivi l'indirizzo del **sito**. Copia il *Client ID* e mettilo in lingua-api come `GOOGLE_CLIENT_ID`. Il pulsante compare da solo.
- **Un indirizzo tuo (dominio):** in Render → lingua-web → *Custom Domains*. Poi aggiorna `CORS_ORIGINS` (e, se vuoi un dominio anche per il server, `REACT_APP_BACKEND_URL`) e ripubblica.

## 8. Da fare subito (sicurezza)

- **Cambia/ritira la vecchia password amministratore** creata da Emergent: era scritta nei report di test ed è rimasta nella storia del repository (i file sono stati rimossi, ma la storia no). Considerala compromessa e non riusarla. Anche gli account demo (`…@lingua.app`, password `demo1234`) vanno cancellati dall'app su Emergent, se la lasci online.
- Verifica che il repository `app-lingua` su GitHub sia **privato**.
- Non usare mai le stesse chiavi o password su più servizi. Se una chiave finisce in una chat o in un file, **cancellala dal servizio e creane una nuova**.

## Quanto costa (test con una persona)

| Voce | Circa |
|---|---|
| Render (server sempre acceso) | 7 $/mese |
| Atlas, R2 | 0 $ (piani gratuiti) |
| Claude (traduzioni) | pochi centesimi: ~0,56 $ ogni 1.000 messaggi (stima) |
| Dominio (facoltativo) | 10-20 $/anno |

Prezzi e limiti dei servizi cambiano: controllali sulle loro pagine ufficiali prima di pagare.
