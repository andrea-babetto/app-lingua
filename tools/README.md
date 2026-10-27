# Strumenti di prova (non fanno parte dell'app)

Script usati per controllare l'app in un browser simulato da telefono, **senza** database vero, senza AI a pagamento e senza toccare la produzione.

## Serve
- Python con le dipendenze del server (`pip install -r backend/requirements-dev.txt`) per `run_demo_backend.py`.
- Python con **Playwright** (`pip install playwright`) e un Chromium (variabile `CHROMIUM` = percorso dell'eseguibile; di default quello di `/opt/pw-browsers`) per gli script di controllo.

## Come si usa (3 terminali, o 3 comandi in sottofondo)
1. Server di prova (porta 8001, database in memoria, traduttore finto, utenti di prova `giulia@lingua.app` e `james@lingua.app`, admin `admin@test.dev`):
   `python tools/e2e/run_demo_backend.py`
2. Sito costruito per quel server, servito con ritorno alla pagina iniziale (porta 3000):
   `cd frontend && REACT_APP_BACKEND_URL=http://127.0.0.1:8001 yarn build && cd ..`
   `python tools/e2e/spa_server.py frontend/build 3000`
3. Controlli (le immagini finiscono in `$SHOTS_DIR`, di default `/tmp/glott-shots`):
   - `python tools/e2e/features_check.py` — 17 controlli: menu del messaggio, reazioni, modifica, bozze, anteprima foto, tasto "vai in fondo", riconnessione, cambio password, reset da admin. **Cambia dati nel server di prova: riavviarlo prima di ripetere.**
   - `python tools/e2e/i18n_check.py` — 10 controlli: pagina di benvenuto, lingua dell'interfaccia (browser, menu, profilo), arabo da destra a sinistra, pagine `/privacy` e `/terms` senza account, consenso alla registrazione, elimina account. **Cambia dati nel server di prova: riavviarlo prima di ripetere.**
   - `python tools/e2e/keyboard_check.py` — simula la tastiera (schermo ridotto) e controlla che l'intestazione resti ferma.
   - `python tools/e2e/voice_check.py` — 24 controlli su vocali (tieni premuto, scorri per annullare, blocca, ascolto tradotto, "Scrivilo", voce originale), dettatura e ascolto dei messaggi scritti. **Avviare il server di prova con `VOICE_DEMO=1`** (trascrizione finta e un "bip" al posto della voce tradotta; il browser usa un microfono finto).
   - `python tools/e2e/invite_check.py` — 13 controlli sui link d'invito (benvenuto con chi ti ha invitato, registrazione, la chat si apre da sola, link del gruppo con richiesta e Accetta, contatore in /admin). **Cambia dati nel server di prova: riavviarlo prima di ripetere.**
   - `python tools/e2e/guide_check.py` — 6 controlli sulla guida "Cosa sa fare Glotter" (elenco, scheda con i nomi veri dei tasti, "Provalo", lingua di chi legge).

## Lingue dell'interfaccia
`python tools/extract_i18n.py` rilegge tutte le frasi `t("...")` del sito e scrive `frontend/src/i18n/source.json`; con `--check` dice quali lingue (`frontend/src/i18n/locales/*.json`) non hanno ancora una frase.

## Icone
`python tools/e2e/make_icons.py` riscrive `frontend/public/icon-*.png`, `icon-maskable-512.png`, `apple-touch-icon.png` e `favicon.svg` a partire dai file del marchio Glotter in `docs/brand/design_handoff_glotter/assets`.

## Cosa NON si può provare qui
Safari su iPhone vero (tastiera, installazione sulla Home, notifiche reali): va provato sul telefono dopo la pubblicazione.
