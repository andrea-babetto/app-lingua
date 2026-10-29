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
- Il nome è **Glotter** (scelto da Andrea il 22/10/2026): "glot" dal greco *glotta* (lingua) + "-ter" (chi fa qualcosa). Interfaccia aggiornata al **design definitivo del 29/10/2026** (bianco, nero e giallo `#f7c600`, forme a pillola, logo con tre puntini gialli "sta scrivendo" dentro il fumetto, carattere Onest, 41 lingue; dettagli in `docs/PROGETTO.md`, file del marchio in `docs/brand/glotter_v3/`). Prima: verde salvia, antracite, azzurro (storia in `docs/PROGETTO.md`). Marchio NON ancora verificato: TMview trova "GLOTTER" registrato in Messico (classe 25) e "PolyGlotterz" in Francia (classe 38, telecomunicazioni); serve un parere di un consulente in marchi (EUIPO, WIPO, UIBM). Domini: glotter.com occupato; alla verifica del 22/10 risultavano liberi .it .net .biz .eu .me .tel .tv (da confermare dal registrar prima di comprarli). Repong è stato il nome precedente: resta solo nei documenti di storia (`docs/brand/design_handoff_repong/`).

## Comandi
- Test server: `cd backend && pip install -r requirements-dev.txt && pytest`
- Sito: `cd frontend && yarn install && yarn build`
- Prova con dati finti: vedi `tools/README.md`
