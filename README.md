# Calcio Notturno

Calcio a 7 nel browser, sotto i riflettori. Apri `index.html` e gioca: non serve installare niente.

## Modalità

- **Amichevole**: scegli la tua squadra, l'avversario, la difficoltà e la durata.
- **Coppa Notturna**: otto squadre a eliminazione diretta, dai quarti alla finale. Se finisce pari si va ai rigori. Il tabellone resta salvato nel browser.
- **Sfida ai rigori**: cinque tiri a testa, poi a oltranza.

## Comandi

| Azione | Tastiera | Gamepad | Touch |
| --- | --- | --- | --- |
| Muovi | WASD o frecce | Levetta sinistra | Joystick |
| Passaggio rasoterra | X o K | A | Passa |
| Lancio o cross | C o L | X o Y | Lancio |
| Tiro (tieni premuto per caricare) | Spazio o J | B | Tiro |
| Scatto | Shift | RB o RT | Scatto |
| Senza palla: scivolata | Spazio | B | Tiro |
| Senza palla: cambia giocatore | X | A | Passa |
| Senza palla: pressing di un compagno | C | X o Y | Lancio |
| Pausa | P o Esc | Start | Pausa |

Sui rigori, su e giù scelgono l'angolo; quando para il tuo portiere, tieni su o giù per scegliere dove tuffarti.

## Com'è fatto

- `src/data.js`: dimensioni del campo, squadre, modulo, nomi
- `src/audio.js`: suoni sintetizzati con Web Audio (fischietto, tiri, pubblico)
- `src/sim.js`: fisica del pallone con altezza, regole, calci piazzati, rigori, replay e intelligenza artificiale
- `src/render.js`: stadio, giocatori animati, porte in pseudo-3D, radar e grafica a schermo
- `src/ui.js`: menu, coppa, statistiche, tastiera, touch e gamepad

Dalla console del browser `CN.fast(n)` fa avanzare la simulazione di `n` passi, utile per i test.
