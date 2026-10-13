# Handoff: Repong — rebrand e interfaccia mobile

## Overview
Rebrand di **Glott** (repo `andrea-babetto/app-lingua`, `frontend/src`) in **Repong**: chat in cui ognuno scrive e legge nella propria lingua. Nuovo logo, palette terracotta/sabbia, carattere Onest, schermate mobile riviste.

## About the Design Files
`Repong Brand v7.dc.html` è un **riferimento di design in HTML** (aprire nel browser con `support.js` accanto), non codice da copiare. Ricreare il design nel repo esistente (React + Vite, `index.css`, i18n) riusando `MessageBubble.jsx`, `Sidebar.jsx`, `ChatWindow.jsx`, `ProfilePanel.jsx`, `Logo.jsx`, `LanguagePicker.jsx`.

## Fidelity
High-fidelity: colori, tipografia, raggi e testi definitivi.

## Cosa cambiare (ordine)
1. **Token**: sostituire le variabili azzurro di `index.css` con `tokens.css` (chiaro + `[data-theme=dark]`). Font: Onest 400–800, fallback Noto Sans Arabic/Devanagari/SC.
2. **Logo.jsx**: "repong" Onest 700, letter-spacing -0.03em, poi `assets/mark.svg` alto 0.5em, margin-left 0.07em, centrato. Su scuro `mark-dark.svg`; monocromo: entrambe le frecce nel colore del testo.
3. **PWA**: favicon.svg, icon-app.svg (generare PNG 192/512), icon-maskable.svg. `manifest.json`: name "Repong", theme_color #c2410c, background_color #ffffff.
4. **Testi**: "Glott" → "Repong" in tutti i locale.
5. **Schermate** sotto.

## Screens (sezione 11 del file)
- **11d Accesso**: menu lingua UI in alto a destra; logo 44px; tagline 23/600 "Ogni messaggio ha una risposta, in ogni lingua."; campi h48 r14 bordo 1.5px #ebe7e1, focus #c2410c + ring 3px rgba(194,65,12,.12); CTA h52 r16 #c2410c; "Registrati" e "Hai un codice d'invito?".
- **11e Lingua (onboarding 2/2)**: progresso 2 segmenti; titolo 26/700; ricerca h42 r12 #f7f5f2; righe nome nativo 16/600 + nome italiano 12 #8c877f; radio 22 (selez. bordo 7px #c2410c, riga #fdf1e9); CTA "Continua in {lingua}".
- **11f Elenco chat**: logo 26 + avatar; ricerca; banner notifiche #fde3a7 r16 con "Attiva" nero e ×; righe avatar 50 (persona cerchio, gruppo r16), nome 16/600, codice lingua 10/700, ora 12 (non letti #c2410c 700), anteprima 14 #5e5a55 ("sta scrivendo" in terracotta), badge #c2410c; FAB 56; tab bar Chat/Gruppi/Profilo, attivo #c2410c con fill 14%.
- **11g Conversazione**: stato header "online" / "sta scrivendo in inglese…"; sfondo #f6f3ef con puntini #e6dfd5 ogni 18px. Ricevuta bianca r18/18/18/6, 15/1.45. **Etichetta** sotto ogni ricevuto: pill #fde3a7/#3b2a06 11.5/600 con mini-simbolo "Tradotto dall'inglese"; tocco → originale, pill nera "Originale in inglese · mostra traduzione". Inviata #c2410c bianca r18/18/6/18, ✓/✓✓, citazione in box rgba(255,255,255,.16). Sotto i miei "⇄ Hamad legge in inglese" → riquadro tratteggiato #f2b544 col testo tradotto. Reazioni pill. Bottone ↓. Composer: +, input r20 #f7f5f2 "Scrivi in {lingua}", invio 40 #c2410c.
- **11h Menu messaggio**: overlay; reazioni 👍❤️😂😮🙏 +; Rispondi, Copia traduzione, Copia originale, Mostra l'originale, Elimina per me (#b42318); toast nero.
- **11i Profilo**: Lingua e traduzione / Preferenze (Notifiche, Ultimo accesso, Modalità scura) / Account (Cambia password, Termini e privacy, Esci, Elimina account). Switch 46×28 on #c2410c off #dcd7cf.
- **11j Vuoto + errore**: banner offline #fdecea/#7a1a10; cerchio 104 con simbolo; "Nessun gruppo, per ora"; CTA "Nuovo gruppo", link "Invita con un link".
- **11k/11l Scuro**: token dark, accento #f0703a; bolle inviate restano #c2410c.
- **11m RTL**: `dir="rtl"`, layout specchiato, orari in LTR, Noto Sans Arabic lh 1.6. Testi arabi da verificare.

## Interactions
- Traduzione in corso: spunta singola + "Traduzione per {nome}…" con simbolo animato (frecce che si scambiano, ±13 unità, 1.6s ease-in-out infinite); poi ✓✓. Rispettare `prefers-reduced-motion`.
- Nuovi messaggi: translateY(8px)→0 + fade, 250ms. Scroll automatico in fondo.
- Sta scrivendo: 3 puntini 1.2s sfasati 0.2s.
- Pressione lunga su messaggio → 11h.

## State
Per messaggio: showOriginal, showRecipientView, status (translating|sent|read), reactions, replyTo. Utente: uiLanguage, chatLanguage, theme, preferenze. Traduzione: backend esistente (Claude Haiku).

## Vincoli dal brief
Niente palline, cerchi o riferimenti al ping-pong.

## Non ancora disegnato
Nuova chat/gruppo, info contatto, privacy e termini, scuro completo, desktop.

## Files
`Repong Brand v7.dc.html` + `support.js`, `tokens.css`, `assets/*.svg`.
