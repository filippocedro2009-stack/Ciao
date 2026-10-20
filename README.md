# Calcio Notturno

Calcio a 7 nel browser, sotto i riflettori. Apri `index.html` e gioca: non serve installare niente.

## Modalità

- **Online**: sfida in tempo reale chi ha la pagina aperta. Entri nella sala d'attesa, scegli la squadra e lanci la sfida; chi la riceve può accettare o rifiutare. Le partite sono classificate.
- **Campionato**: fondi il tuo club (nome, sigla, prima e seconda maglia, portiere, stemma), gioca 14 giornate contro 7 squadre e guadagna crediti. Con i crediti alleni i giocatori un punto alla volta o compri rinforzi al mercato. A fine stagione c'è un premio in base al piazzamento e le altre squadre si rinforzano.
- **Amichevole**: scegli la tua squadra, l'avversario, la difficoltà e la durata.
- **Coppa Notturna**: otto squadre a eliminazione diretta, dai quarti alla finale. Se finisce pari si va ai rigori. Il tabellone resta salvato nel browser.
- **Sfida ai rigori**: cinque tiri a testa, poi a oltranza.

## Online e classifica

L'online funziona nella pagina pubblicata su claude.ai, aperta da persone con cui l'hai condivisa (non con il link pubblico).

- **Sala d'attesa e partita** usano la capability `room`: solo presence, quindi va bene per chiunque possa aprire la pagina. Chi lancia la sfida simula la partita e invia lo stato circa 30 volte al secondo; l'avversario invia i propri comandi.
- **Classifica** usa la capability `db`: ogni giocatore ha un documento `ranking/<id>` che solo lui può scrivere e tutti possono leggere. Per salvare il punteggio serve almeno l'accesso da Collaboratore.
- **Punteggio Elo**: si parte da 1000. K vale 40 nelle prime 10 partite, poi 28. Divisioni: Esordiente, Bronzo (900), Argento (1050), Oro (1200), Platino (1350), Campione (1500).
- **Abbandoni**: a inizio partita viene scritta una sconfitta provvisoria, corretta a fine partita. Chi chiude la pagina a metà perde; chi resta vince a tavolino dopo 8 secondi.

## Comandi

| Azione | Tastiera | Gamepad | Touch |
| --- | --- | --- | --- |
| Muovi | WASD o frecce | Levetta sinistra | Joystick |
| Passaggio rasoterra | X o K | A | Passa |
| Lancio o cross | C o L | X | Lancio |
| Tiro (tieni premuto per caricare) | Spazio o J | B | Tiro |
| Tiro a giro (tieni premuto e rilascia) | Q o U | Y | Giro |
| Finta di tiro | F, oppure passaggio mentre carichi il tiro | LT, oppure A mentre tieni B | Passa mentre tieni Tiro |
| Allungo della palla | V o O | LB | Doppio tocco su Scatto |
| Scatto | Shift | RB o RT | Scatto |
| Senza palla: scivolata | Spazio | B | Tiro |
| Senza palla: cambia giocatore | X | A | Passa |
| Senza palla: pressing di un compagno | C | X | Lancio |
| Pausa | P o Esc | Start | Pausa |

Sui rigori, su e giù scelgono l'angolo; quando para il tuo portiere, tieni su o giù per scegliere dove tuffarti.

## Giocatori e attributi

Ogni giocatore ha sei attributi da 20 a 99: velocità, tiro, passaggio, contrasto, resistenza e portiere. Determinano velocità di corsa, precisione e potenza dei tiri, precisione dei passaggi, probabilità di rubare palla, consumo dello scatto e parate. Nelle altre modalità gli attributi derivano dalla forza della squadra; in campionato quelli del tuo club sono i tuoi.

## Com'è fatto

- `src/data.js`: dimensioni del campo, squadre, modulo, nomi
- `src/audio.js`: suoni sintetizzati con Web Audio (fischietto, tiri, pubblico)
- `src/sim.js`: fisica del pallone con altezza, regole, calci piazzati, rigori, replay e intelligenza artificiale
- `src/render.js`: stadio, giocatori animati, porte in pseudo-3D, radar e grafica a schermo
- `src/net.js`: sala d'attesa, sfide, partite online e classifica Elo
- `src/league.js`: campionato, calendario, classifica, allenamento, mercato ed editor del club
- `src/ui.js`: menu, coppa, statistiche, tastiera, touch e gamepad

Dalla console del browser `CN.fast(n)` fa avanzare la simulazione di `n` passi, utile per i test.
