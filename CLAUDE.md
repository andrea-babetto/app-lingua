# Glott (ex Lingua) — leggimi prima di lavorare

Chat in tempo reale in cui ognuno scrive e legge nella propria lingua, tradotta da Claude Haiku. **Il quadro completo è in `docs/PROGETTO.md`** (servizi, variabili, architettura, decisioni, limiti, da fare, lezioni imparate). Guida di pubblicazione: `docs/PUBBLICAZIONE.md`.

## Con chi lavori
- **Andrea Babetto**, non tecnico, parla **italiano**. Spiegagli le cose a passi brevi e concreti ("come a un bambino"), una cosa per volta; lui risponde con screenshot. Dì sempre dove cliccare.
- Il primo utente di prova è Hamad (India). Il sito è in beta chiusa (codice d'invito).

## Regole
- **Mai segreti** (chiavi, password, codici d'invito, stringhe di connessione) in chat, nel codice o nei file. Se Andrea li incolla, digli di cancellarli dal servizio e crearne di nuovi.
- Lavora su un ramo, **non aprire pull request se non richiesto**, e **unisci a `main` solo quando Andrea dice "unisci"**. Ogni unione va seguita da istruzioni chiare su cosa ripubblicare su Render (`lingua-web` e/o `lingua-api`) e sul telefono.
- Prima di dire "fatto": `cd backend && pytest`, `cd frontend && yarn build`, e provalo nel browser simulato (`tools/README.md`). Dì chiaramente cosa **non** hai potuto provare (iPhone vero, notifiche reali).
- Non dire "disponibile" per un dominio o un nome senza averlo controllato; la ricerca web non è una verifica legale sul marchio.
- Il nome "Glott" è provvisorio; nome scelto da Andrea il 13/10/2026: **Repong** ("re" di *reply* + "pong" del ping-pong: il botta e risposta). Nessuna app trovata con questo nome in una ricerca web (non è una verifica legale). Domini al 13/10: repong.com è in vendita (parcheggiato, prezzo da chiedere), liberi .it .net .org .biz .eu .me .tel .tv, getrepong.com e repongapp.com; .app e .chat da controllare. Da fare prima di cambiare nome nell'app: ricerca ufficiale sul marchio (EUIPO, WIPO; attenzione al videogioco Pong). Fino ad allora l'app resta "glott". Logo e colori scelti il 13/10/2026 (bozze, da far rifinire a un grafico): scritta **repong⇄** tutta minuscola, carattere Onest grassetto, con due frecce di scambio al posto del punto finale (freccia che va = colore principale, freccia che torna = secondo colore, cioè "le due lingue"); icona dell'app = le due frecce da sole. Colori **terracotta `#c2410c`** (principale: icona, intestazione, propri messaggi, pulsante invio) e **sabbia `#f2b544`** (freccia di ritorno, etichetta "Tradotto"; poco contrasto sul bianco, non usarlo per testi). Scartati: nuvolette, palline (rischio Pong/ping-pong), gradienti.

## Comandi
- Test server: `cd backend && pip install -r requirements-dev.txt && pytest`
- Sito: `cd frontend && yarn install && yarn build`
- Prova con dati finti: vedi `tools/README.md`
