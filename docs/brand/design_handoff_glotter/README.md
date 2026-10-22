# Handoff: Glotter — marchio e interfaccia mobile (nero e giallo)

## Overview
Rebrand di **Glott** (repo `andrea-babetto/app-lingua`, `frontend/src`) in **Glotter**: chat in cui ognuno scrive e legge nella propria lingua. Nuovo logo (la "o" è un fumetto con coda e un punto), palette **nero e giallo**, carattere **Onest**, schermate mobile riviste.

## About the Design Files
`Glotter Brand Nero Giallo.dc.html` è un **riferimento di design in HTML** (aprire nel browser con `support.js` accanto), non codice da copiare. Ricreare il design nel repo esistente (React + Vite, `index.css`, i18n) riusando i componenti attuali: `MessageBubble.jsx`, `Sidebar.jsx`, `ChatWindow.jsx`, `ProfilePanel.jsx`, `Logo.jsx`, `LanguagePicker.jsx`.

## Fidelity
High-fidelity: colori, tipografia, raggi e testi definitivi.

## Marchio
- **Logo**: usare i file in `assets/` così come sono (lettere già in tracciati, viewBox 625×224). **Non ricomporre il logo con il font.**
  - `glotter-logo.svg` su chiaro · `glotter-logo-su-scuro.svg` su scuro · `glotter-logo-su-giallo.svg` su giallo · `glotter-logo-nero.svg` / `glotter-logo-bianco.svg` a un colore
- **Logo.jsx**: importare lo SVG e dimensionarlo in altezza (rapporto 625:224). Intestazione app: altezza ~29px.
- **Simbolo** (`mark.svg`, 24×24): anello r9 tratto 3.8, coda in basso a sinistra, punto r2.6. Usato nella pill "Tradotto" (11px) e come indicatore di traduzione in corso (15px, il punto pulsa opacity .35→1, 1s; rispettare `prefers-reduced-motion`).
- **Icone/PWA**: `icon-app.svg` (fondo nero, simbolo bianco, punto giallo), `icon-app-light.svg`, `icon-maskable.svg` (area sicura 80%), `favicon.svg`. Generare PNG 192/512/1024. `manifest.json`: name/short_name "Glotter", theme_color #1d1a16, background_color #ffffff.

## Colori (vedi `tokens.css`)
- **Chiaro**: primario **nero #1d1a16** (bolle inviate, CTA, tab attivo, badge, switch on); accento **giallo #ffcc1e** (punto del logo, dettagli, bordo tratteggiato "Hamad legge"); giallo chiaro #fff0b8 (pill "Tradotto" con testo #5b4300, banner notifiche). Superfici calde #f7f5ef / #fbf8ef, linee #f1ece1, bordi #ebe6da, testi #1d1a16 / #5f5a50 / #8a8477.
- **Scuro**: il primario diventa **giallo con testo nero** (bolle inviate, CTA, badge, FAB, avatar gruppo); fondi #15130f / #1d1b16 / #181611.
- **Regola**: mai giallo come colore del testo su fondo chiaro.
- Errore #b42318 solo con icona "!" e fondo #fdecea.

## Cosa cambiare nel repo (ordine)
1. Token: sostituire le variabili azzurro di `index.css` con `tokens.css`; Onest 400–800 (+ fallback Noto Sans Arabic/Devanagari/SC), togliere Plus Jakarta Sans.
2. Logo.jsx, favicon, icone PWA, manifest.
3. Testi: "Glott" → "Glotter" in tutti i locale.
4. Schermate come sotto. Navigazione in basso **a 4 voci**: Chat / Gruppi / Contatti / Profilo.

## Screens (sezione 11 del file)
- **11d Accesso**: menu lingua UI in alto a destra; logo; tagline 23/600 "Ogni messaggio ha una risposta, in ogni lingua."; campi h48 r14, focus nero + ring 3px rgba(29,26,22,.12); CTA h52 r16 nera; "Registrati"; "Hai un codice d'invito?".
- **11e Lingua (onboarding 2/2)**: progresso 2 segmenti; titolo 26/700; ricerca; righe nome nativo + nome italiano; radio 22 (selezionato bordo 7px nero, riga #fff6d6); CTA "Continua in {lingua}".
- **11f Elenco chat**: logo + avatar; ricerca; banner notifiche giallo chiaro; righe avatar 50 (persona cerchio, gruppo r16), codice lingua, non letti bold + badge nero; "sta scrivendo" nell'anteprima; FAB 56 nero; tab bar 4 voci.
- **11g Conversazione**: stato "online" / "sta scrivendo in inglese…"; sfondo #fbf8ef con puntini #ebe4d0 ogni 18px. Ricevuta bianca r18/18/18/6. **Pill "Tradotto dall'inglese"** sotto ogni ricevuto; al tocco mostra l'originale. Inviata nera r18/18/6/18 con ✓/✓✓ e citazione risposta. Sotto i miei "⇄ Hamad legge in inglese" → riquadro tratteggiato giallo col testo tradotto. Reazioni. Bottone ↓ (padding-bottom ≥56px sulla lista). Composer: +, input, invio nero.
- **11h Menu messaggio**: reazioni; Rispondi, Copia traduzione, Copia originale, Mostra l'originale, Elimina per me; toast.
- **11i Profilo**: Lingua e traduzione / Preferenze / Account. Switch 46×28.
- **11j Vuoto + errore** (Gruppi).
- **11k/11l Scuro**, **11m RTL arabo** (`dir="rtl"`, layout specchiato, orari LTR; testi arabi da far verificare).

## State
Per messaggio: showOriginal, showRecipientView, status (translating|sent|read), reactions, replyTo. Utente: uiLanguage, chatLanguage, theme, preferenze. Traduzione: backend esistente (Claude Haiku).

## Non ancora disegnato
Contatti, nuova chat/gruppo, info contatto, privacy e termini, desktop: seguire lo stesso stile.

## Files
`Glotter Brand Nero Giallo.dc.html` + `support.js`, `tokens.css`, `assets/*.svg`.
