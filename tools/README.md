# Strumenti di prova (non fanno parte dell'app)

Script usati per controllare l'app in un browser simulato da telefono, **senza** database vero, senza AI a pagamento e senza toccare la produzione.

## Serve
- Python con le dipendenze del server (`pip install -r backend/requirements-dev.txt`) per `run_demo_backend.py`.
- Python con **Playwright** (`pip install playwright`) e un Chromium (variabile `CHROMIUM` = percorso dell'eseguibile; di default quello di `/opt/pw-browsers`) per gli script di controllo.
- `pip install pillow` per `make_icons.py`.

## Come si usa (3 terminali, o 3 comandi in sottofondo)
1. Server di prova (porta 8001, database in memoria, traduttore finto, utenti di prova `giulia@lingua.app` e `james@lingua.app`, admin `admin@test.dev`):
   `python tools/e2e/run_demo_backend.py`
2. Sito costruito per quel server, servito con ritorno alla pagina iniziale (porta 3000):
   `cd frontend && REACT_APP_BACKEND_URL=http://127.0.0.1:8001 yarn build && cd ..`
   `python tools/e2e/spa_server.py frontend/build 3000`
3. Controlli (le immagini finiscono in `$SHOTS_DIR`, di default `/tmp/glott-shots`):
   - `python tools/e2e/features_check.py` — 17 controlli: menu del messaggio, reazioni, modifica, bozze, anteprima foto, tasto "vai in fondo", riconnessione, cambio password, reset da admin. **Cambia dati nel server di prova: riavviarlo prima di ripetere.**
   - `python tools/e2e/keyboard_check.py` — simula la tastiera (schermo ridotto) e controlla che l'intestazione resti ferma.
   - `python tools/e2e/palettes.py` — schermate con più palette, in un'unica immagine di confronto.

## Icone
`python tools/e2e/make_icons.py H S L` (per esempio `205 85 44`) riscrive `frontend/public/icon-*.png`, `apple-touch-icon.png` e `favicon.svg` con il nome "glott" e il colore indicato.

## Cosa NON si può provare qui
Safari su iPhone vero (tastiera, installazione sulla Home, notifiche reali): va provato sul telefono dopo la pubblicazione.
