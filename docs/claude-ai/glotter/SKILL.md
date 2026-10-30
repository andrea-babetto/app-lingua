---
name: glotter
description: Contesto completo del progetto Glotter (prima "Glott", all'inizio "Lingua"), la chat in cui ognuno scrive e legge nella propria lingua tradotta da Claude Haiku, costruita da Andrea Babetto (primo utente di prova Hamad). Usa questa skill ogni volta che si parla di Glotter, Glott, Lingua, della chat con traduzione automatica, del repository app-lingua, di Render/lingua-api/lingua-web, MongoDB Atlas o Cloudflare R2 per questa app, del nome/logo/colore/icona/design dell'app, dei vocali, delle notifiche push o dell'installazione sul telefono, dei link d'invito, del video "Guarda come funziona", o di strategia, prezzi e crescita di questa app — anche se non dice esplicitamente "Glotter".
---

# Glotter (ex Glott, ex Lingua)

Aggiornato al **30 ottobre 2026**. Chat in tempo reale in cui **ognuno scrive e legge nella propria lingua**: Claude Haiku traduce ogni messaggio per ogni destinatario. Sito responsive installabile come app (PWA), per telefono e computer.

**Fonte della verità:** il progetto si costruisce in **Claude Code** sul repository GitHub `andrea-babetto/app-lingua` (ramo `main`). Lì ci sono `docs/PROGETTO.md` (quadro completo, sempre aggiornato) e `CLAUDE.md` (regole di lavoro). Questa nota è un riassunto per parlarne in Claude normale: se qualcosa qui contrasta con quei file, vincono loro. In Claude normale si ragiona, si scrivono testi e si decide; **il codice si cambia solo in Claude Code**.

## Con chi parli
- **Andrea Babetto**: non tecnico, scrive in italiano. Spiega a passi brevi e concreti, una cosa per volta, dicendo sempre **dove cliccare**; lui risponde con screenshot. Ha anche Shampissima (haircare) e un'agenzia di Amazon PPC.
- **Mai segreti in chat** (chiavi, password, codici d'invito, stringhe di connessione): se li incolla, digli di cancellarli dal servizio e crearne di nuovi.
- Primo utente reale: **Hamad** (agenzia, India). Beta chiusa: si entra con un codice o con un link d'invito.

## Nome e marchio
- **Glotter**, scelto da Andrea il 22/10/2026: "glot" dal greco *glotta* (lingua) + "-ter" (chi fa qualcosa). Nomi precedenti: Lingua, Glott, Repong (solo storia).
- **Marchio NON verificato:** su TMview risultano "GLOTTER" in Messico (classe 25) e "PolyGlotterz" in Francia (classe 38). Serve un consulente in marchi (EUIPO, WIPO, UIBM). Domini: glotter.com occupato; il 22/10 sembravano liberi .it .net .biz .eu .me .tel .tv (da confermare dal registrar). Non dire mai "libero" o "disponibile" senza una verifica vera.

## Aspetto (design definitivo del 29/10/2026)
- Bianco, nero per ciò che è scelto, **giallo `#f7c600`** per il pulsante principale, Invita, i non letti e i **messaggi miei** (testo nero). Forme a pillola. Carattere **Onest**. Modalità scura in grigio morbido (`#1f1f22`).
- **Logo:** la scritta "glotter" in cui la "o" è un fumetto; dentro ci sono **tre puntini gialli**, il primo pieno e gli altri due sfumati, come quando qualcuno sta scrivendo (versione "D3"). Icona dell'app: fumetto bianco su quadrato nero con i puntini gialli.
- **Animazione "sta scrivendo":** gli stessi tre puntini si accendono uno dopo l'altro quando l'altra persona scrive.
- Presentazione: "Ognuno nella sua lingua.", con i pulsanti "Crea il tuo account" (giallo) e "Accedi", il link "Guarda come funziona" e un telefono con una chat tradotta.
- Lista chat compatta come Telegram. I gruppi mostrano 3 visi sovrapposti e "N persone · IT EN PT". La barra in basso galleggia: Chat, Gruppi, Contatti, Profilo.
- In chat c'è un banner "Tu scrivi in italiano · James legge in inglese": si chiude con la X, solo per quella chat. Le lingue hanno la bandierina rotonda.
- Storia dei colori, tutta scartata: azzurro, antracite, verde salvia.

## Cosa fa oggi (in produzione)
- **Chat e gruppi:**
  - chat 1:1 e gruppi fino a 50 persone, con traduzione automatica per ognuno (l'originale si recupera sempre);
  - stessa lingua = nessuna traduzione e nessun costo;
  - glossario personale (parole da non tradurre);
  - un solo tono, neutro.
- **Messaggi:**
  - foto e file, risposte (anche scorrendo il messaggio), modifica entro 30 minuti, reazioni;
  - eliminazione per me o per tutti; chat fissate; bozze; ricerca;
  - messaggi programmati (tieni premuto invio);
  - spunte animate e "Info messaggio" (consegnato e letto, con l'ora).
- **Voce** (serve la chiave OpenAI; Andrea il 30/10 ha detto che c'è):
  - vocali trascritti, tradotti e letti con voce sintetica nella lingua di chi ascolta;
  - 🔊 "Ascolta" anche sui messaggi scritti;
  - "Detta invece di scrivere".
- **Gruppi:** sondaggi tradotti; descrizione e regole tradotte; link d'invito ai gruppi con approvazione degli admin.
- **Persone:**
  - link d'invito personale: chi lo apre si registra senza codice e trova già la chat aperta;
  - Contatti; ora locale dell'altra persona;
  - blocco e segnalazione; ricerca solo per username, email o telefono esatti.
- **Account:**
  - notifiche push anche ad app chiusa;
  - recupero password via email; scarica i miei dati; elimina account;
  - pagine Privacy e Termini (bozze da far vedere a un legale).
- **App:**
  - interfaccia in **41 lingue**, con arabo, ebraico, urdu e persiano da destra a sinistra;
  - guida "Cosa sa fare Glotter" in Profilo;
  - "Guarda come funziona": per ora una mini chat animata al posto del video.
- **Admin e costi:** dashboard costi e contatore dei messaggi tradotti per persona (base per un futuro limite gratuito); backup notturno del database su R2, 14 giorni.
- **Spento:** accesso con Google (manca `GOOGLE_CLIENT_ID`).

## Dove sta
- Codice: GitHub `andrea-babetto/app-lingua` (privato), ramo `main`.
- Sito: Render, servizio statico `lingua-web` → https://lingua-web-753a.onrender.com
- Server: Render, `lingua-api` (Python/FastAPI, piano Starter, Francoforte) → https://lingua-api-1384.onrender.com
- Database: MongoDB Atlas M0 (gratuito; il backup lo fa Glotter ogni notte). File e backup: Cloudflare R2, bucket `lingua-files`.
- Traduzioni: API Anthropic `claude-haiku-4-5` (la chiave deve essere legata a un workspace). Voce: OpenAI (`gpt-4o-mini-transcribe` e `gpt-4o-mini-tts`).
- Davanti a Render c'è Cloudflare: `CLIENT_IP_HEADER=cf-connecting-ip`.
- Variabili su `lingua-api` (solo i nomi, **mai i valori**): `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `ANTHROPIC_API_KEY`, `S3_*`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `INVITE_CODE`, `VOICE_MESSAGES`, `OPENAI_API_KEY`, `SMTP_*`/`MAIL_FROM`, `GOOGLE_CLIENT_ID`. Su `lingua-web`: `REACT_APP_BACKEND_URL`, `VITE_LEGAL_NAME`, `VITE_LEGAL_EMAIL`.

## Come si pubblica una modifica
1. Claude Code lavora su un ramo, fa i controlli (test del server, build del sito, prova nel telefono simulato) e dice cosa **non** ha potuto provare (iPhone vero, notifiche reali).
2. Si unisce a `main` **solo quando Andrea scrive "unisci"**. Le pull request si aprono solo se le chiede lui.
3. Su Render: **Manual Deploy → Deploy latest commit** su `lingua-web`, e anche su `lingua-api` se è cambiato il server.
4. Sul telefono: chiudere e riaprire l'app. Se cambiano icona o nome, togliere l'icona dalla Home e riaggiungerla (Safari → Condividi → Aggiungi alla schermata Home).

## Costi (stime)
- Traduzione: circa 0,56 $ ogni 1.000 messaggi tradotti.
- Voce: circa 1,5 centesimi al minuto per lingua; i primi 19 usi sono costati 0,02 $.
- Server Render Starter: sempre acceso. Atlas M0 e R2: gratis o quasi a questi volumi.

## Strategia e soldi (ipotesi, nulla di deciso)
- WhatsApp e Telegram traducono già, ma a richiesta. I vantaggi di Glotter: traduzione **automatica per tutti**, glossario, voce tradotta, niente numero di telefono, uso professionale.
- Partenza: agenzie ed e-commerce con collaboratori all'estero. Crescita con i link d'invito. Non usare Fiverr o Upwork come canale (vietano i contatti fuori piattaforma).
- Prezzi pensati: gratis con un tetto di messaggi tradotti, poi 2-4 € al mese; più avanti un piano team. Da vedere con commercialista e legale: IVA/GST, magari con un "merchant of record" come Paddle o Lemon Squeezy; in India carte ricorrenti e UPI.

## Concorrenti (analisi del 30/10/2026, dati dichiarati dagli sviluppatori)
- **Intent** ("The Chat translator"): chat con traduzione integrata, stessa idea di Glotter; testo, vocali con voce clonata, foto, gruppi, chiamate tradotte; uscita a ottobre 2025, circa 1,3 milioni di installazioni su Android, voto 4,2; 73 lingue di testo; tono da vita privata e coppie; abbonamento. Il più forte.
- **Rakkan**: chat per coppie (luglio 2026), traduce messaggi e sottotitoli delle videochiamate, anteprima prima dell'invio, 7 lingue, gratis più un piano Plus. Piccola.
- **Heartline** ("Couples Translator"): chiamate vocali e chat tradotte per coppie, consulente di coppia AI, abbonamento (annuale circa 209 $). Maggio 2026, pochi dati.
- **Conclusione:** l'idea è confermata. Glotter si distingue puntando sul **lavoro** (team internazionali, agenzie, e-commerce: glossario, gruppi, privacy, niente numero di telefono). Ci mancano chiamate tradotte, voce clonata e anteprima prima dell'invio. I nostri prezzi ipotizzati sono molto più bassi dei loro; per i team si può chiedere di più.

## Da fare
- **Prossimo:** il video "Guarda come funziona" **parlato**: la mini chat animata più una voce OpenAI nella lingua di chi guarda, creata dal server una volta per lingua. Testo e voce sono da approvare da Andrea.
- **Prima di aprire al pubblico:**
  - revisione legale di Termini e Privacy;
  - nuovo codice d'invito;
  - far rivedere le traduzioni a madrelingua (almeno hindi, arabo, spagnolo);
  - verifica del marchio e del dominio;
  - pagamenti;
  - app negli store (Apple 99 $ l'anno, Google 25 $ una volta).
- **Funzioni in lista:**
  - anteprima dei link;
  - posizione condivisa;
  - pagine pubbliche per lingua (per Google);
  - più dispositivi;
  - tono che si adatta;
  - traduzione di foto e documenti;
  - conversazione a voce dal vivo;
  - chiamate con sottotitoli.

## Lezioni imparate
- Anthropic: la chiave dev'essere legata a un workspace; `temperature` non va mandato.
- Su iPhone Safari, fuori da un'app installata, l'oggetto `Notification` non esiste. Le notifiche si attivano solo con un tocco. Con la tastiera aperta la pagina scorre: l'app lo gestisce.
- L'icona sulla Home si aggiorna solo togliendola e riaggiungendola.
- Render: la regione non si cambia dopo la creazione; `REACT_APP_BACKEND_URL` entra nel sito al momento della build, quindi se cambia va ricostruito.
