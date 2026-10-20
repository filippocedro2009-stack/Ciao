'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const STORE = 'calcio-notturno-v2';
  const ROUND_NAMES = ['Quarti di finale', 'Semifinali', 'Finale'];

  // ---------- salvataggio locale ----------
  let save = { team: 'lido', opp: 'lupi', diff: 'normale', len: 240, muted: false, cup: null };
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) { /* storage non disponibile */ }
  if (!TEAMS.some(t => t.id === save.team)) save.team = 'lido';
  if (!TEAMS.some(t => t.id === save.opp) || save.opp === save.team) save.opp = TEAMS.find(t => t.id !== save.team).id;
  if (!DIFFS[save.diff]) save.diff = 'normale';
  if (!LENGTHS.some(l => l.v === save.len)) save.len = 240;
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* ignora */ } };

  let screen = null, setupMode = 'friendly', lastMatch = null, helpFrom = 'scrMenu', rankFrom = 'scrMenu';
  let resultRecorded = false, pendingBreak = null;
  const picks = { a: save.team, b: save.opp };

  // ---------- schermate ----------
  const SCREENS = ['scrMenu', 'scrSetup', 'scrCup', 'scrPause', 'scrBreak', 'scrHelp', 'scrOnline', 'scrRank', 'scrLeague', 'scrSquad', 'scrMarket', 'scrClub'];
  function show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    screen = id;
    root.classList.toggle('in-menu', !!id);
    if (id && !RD.touch) {
      const f = $(id).querySelector('.primary, .mbtn');
      if (f) f.focus({ preventScroll: true });
    }
    if (!id) blurActive();
  }
  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  function styleCrest(el, def) {
    const k = def.home, a = k.shirt, b = k.trim;
    let bg;
    switch (k.pattern) {
      case 'stripes': bg = `repeating-linear-gradient(90deg, ${a} 0 12px, ${b} 12px 24px)`; break;
      case 'hoops': bg = `repeating-linear-gradient(0deg, ${a} 0 12px, ${b} 12px 24px)`; break;
      case 'sash': bg = `linear-gradient(135deg, ${a} 0 36%, ${b} 36% 62%, ${a} 62%)`; break;
      case 'halves': bg = `linear-gradient(90deg, ${a} 0 50%, ${b} 50%)`; break;
      default: bg = `linear-gradient(180deg, ${a} 0 76%, ${b} 76%)`;
    }
    el.style.background = bg;
    el.innerHTML = '';
    const s = document.createElement('span');
    s.textContent = def.short;
    el.appendChild(s);
  }
  function crestEl(def, cls) {
    const d = document.createElement('div');
    d.className = 'crest ' + (cls || '');
    // i club del campionato hanno uno stemma disegnato su misura
    if (def.crest) { d.classList.add('svgcrest'); d.innerHTML = crestSVG(def.crest, def.short); }
    else styleCrest(d, def);
    return d;
  }

  // ---------- partite ----------
  function startAttract() {
    const ids = shuffle(TEAMS.map(t => t.id));
    Sound.quiet = true;
    newMatch({ home: ids[0], away: ids[1], diff: 'normale', len: 600, mode: 'attract' });
    RD.snap = true;
    updateBoard(true);
  }
  function startMatch(o) {
    lastMatch = o; resultRecorded = false; pendingBreak = null;
    if (o.mode === 'league') lastMatch = null;
    Sound.unlock(); Sound.quiet = false;
    newMatch(o);
    RD.snap = true;
    keys.clear();
    show(null);
    updateBoard(true);
  }
  function toMenu() {
    G.paused = false; pendingBreak = null;
    if (Net.inMatch()) Net.quit();
    Net.closeLobby(); Net.unwatchBoard();
    if (G.mode !== 'attract') startAttract();
    updateCupNote();
    show('scrMenu');
  }
  G.hooks.attractEnd = startAttract;
  // le partite online gestiscono intervallo e fine partita in net.js, per entrambi i giocatori
  G.hooks.halftime = () => { if (G.mode !== 'attract' && G.mode !== 'online') pendingBreak = { at: performance.now() + 1300, final: false }; };
  G.hooks.fulltime = () => { if (G.mode !== 'attract' && G.mode !== 'online') pendingBreak = { at: performance.now() + 1700, final: true }; };

  // ---------- tabellone ----------
  let boardKey = '';
  function updateBoard(force) {
    if (!G.teams.length) return;
    const [A, B] = G.teams;
    const clock = G.shootout ? 'RIG' : G.mode === 'shootout' ? 'RIG' : minuteNow() + "'";
    const key = [A.def.id, B.def.id, A.kit.shirt, B.kit.shirt, A.score, B.score, clock].join();
    if (key === boardKey && !force) return;
    boardKey = key;
    const chipA = $('tmA'), chipB = $('tmB');
    chipA.textContent = A.def.short; chipA.style.background = A.kit.shirt; chipA.style.color = inkOn(A.kit.shirt);
    chipB.textContent = B.def.short; chipB.style.background = B.kit.shirt; chipB.style.color = inkOn(B.kit.shirt);
    $('sA').textContent = A.score; $('sB').textContent = B.score;
    $('clock').textContent = clock;
    $('board').setAttribute('aria-label', `${A.def.name} ${A.score}, ${B.def.name} ${B.score}, minuto ${clock}`);
  }

  // ---------- impostazioni partita ----------
  function renderPicker(id, teamId) {
    const el = $(id), def = teamById(teamId);
    styleCrest(el.querySelector('.crest'), def);
    el.querySelector('.pname').textContent = def.name;
    el.querySelector('.stars').textContent = '★'.repeat(def.rating) + '☆'.repeat(5 - def.rating);
    el.querySelector('.stars').setAttribute('aria-label', `Forza ${def.rating} su 5`);
  }
  function cycle(which, d) {
    const ids = TEAMS.map(t => t.id);
    let i = ids.indexOf(picks[which]);
    const other = which === 'a' ? picks.b : picks.a;
    do { i = (i + d + ids.length) % ids.length; } while (ids[i] === other && setupMode !== 'cup');
    picks[which] = ids[i];
    if (setupMode === 'cup' && picks.a === picks.b) picks.b = ids.find(x => x !== picks.a);
    renderPicker('pickA', picks.a); renderPicker('pickB', picks.b);
    Sound.click();
  }
  for (const [id, which] of [['pickA', 'a'], ['pickB', 'b']]) {
    for (const btn of $(id).querySelectorAll('.arrow')) btn.addEventListener('click', () => cycle(which, Number(btn.dataset.d)));
  }
  function buildSeg(id, items, current, onPick) {
    const seg = $(id);
    seg.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = it.label; b.setAttribute('aria-pressed', String(it.v === current));
      b.addEventListener('click', () => {
        for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
        onPick(it.v); Sound.click();
      });
      seg.appendChild(b);
    }
  }
  function openSetup(mode) {
    setupMode = mode;
    if (picks.a === picks.b) picks.b = TEAMS.find(t => t.id !== picks.a).id;
    $('setupKicker').textContent = mode === 'cup' ? 'Coppa Notturna' : mode === 'shootout' ? 'Sfida ai rigori' : 'Amichevole';
    $('pickB').hidden = mode === 'cup';
    $('vsMark').hidden = mode === 'cup';
    $('grpLen').hidden = mode === 'shootout';
    $('btnGo').textContent = mode === 'cup' ? 'Inizia la coppa' : mode === 'shootout' ? 'Ai rigori' : "Calcio d'inizio";
    renderPicker('pickA', picks.a); renderPicker('pickB', picks.b);
    buildSeg('segDiff', Object.entries(DIFFS).map(([v, d]) => ({ v, label: d.label })), save.diff, v => { save.diff = v; persist(); });
    buildSeg('segLen', LENGTHS, save.len, v => { save.len = v; persist(); });
    show('scrSetup');
  }
  $('btnGo').addEventListener('click', () => {
    save.team = picks.a; save.opp = picks.b; persist();
    if (setupMode === 'cup') {
      save.cup = newCup(picks.a, save.diff, save.len); persist();
      showCup();
    } else {
      startMatch({ home: picks.a, away: picks.b, diff: save.diff, len: save.len, mode: setupMode });
    }
  });
  $('btnBack').addEventListener('click', toMenu);

  // ---------- coppa ----------
  function newCup(team, diff, len) {
    const ids = shuffle(TEAMS.map(t => t.id));
    const r0 = [];
    for (let i = 0; i < 8; i += 2) r0.push({ a: ids[i], b: ids[i + 1], ga: null, gb: null, pa: null, pb: null, w: null });
    return { team, diff, len, round: 0, rounds: [r0, [], []], status: 'playing' };
  }
  const userTie = cup => cup.rounds[cup.round].find(t => t.a === cup.team || t.b === cup.team);
  function poisson(l) {
    let k = 0, p = Math.exp(-l), s = p;
    const u = Math.random();
    while (u > s && k < 8) { k++; p *= l / k; s += p; }
    return k;
  }
  function simTie(t) {
    const ra = teamById(t.a).rating, rb = teamById(t.b).rating;
    t.ga = poisson(clamp(1.3 + (ra - rb) * 0.32, 0.3, 3.2));
    t.gb = poisson(clamp(1.3 + (rb - ra) * 0.32, 0.3, 3.2));
    if (t.ga === t.gb) {
      t.pa = 3 + ((Math.random() * 3) | 0);
      t.pb = Math.random() < 0.5 ? t.pa - 1 : t.pa + 1;
      t.w = t.pa > t.pb ? t.a : t.b;
    } else t.w = t.ga > t.gb ? t.a : t.b;
  }
  function advance(cup) {
    if (cup.round >= 2) return false;
    const ws = cup.rounds[cup.round].map(t => t.w), next = [];
    for (let i = 0; i < ws.length; i += 2) next.push({ a: ws[i], b: ws[i + 1], ga: null, gb: null, pa: null, pb: null, w: null });
    cup.rounds[cup.round + 1] = next;
    cup.round++;
    return true;
  }
  function recordCup() {
    const cup = save.cup;
    if (!cup || resultRecorded || cup.status !== 'playing') return;
    resultRecorded = true;
    const tie = userTie(cup), userIsA = tie.a === cup.team;
    const gu = G.teams[0].score, go = G.teams[1].score;
    tie.ga = userIsA ? gu : go; tie.gb = userIsA ? go : gu;
    if (G.shootout && G.shootout.done) {
      const su = G.shootout.kicks[0].filter(Boolean).length, so = G.shootout.kicks[1].filter(Boolean).length;
      tie.pa = userIsA ? su : so; tie.pb = userIsA ? so : su;
    }
    const won = G.result && G.result.winner === 0;
    tie.w = won ? cup.team : (userIsA ? tie.b : tie.a);
    for (const t of cup.rounds[cup.round]) if (t !== tie) simTie(t);
    if (!won) {
      cup.status = 'out';
      cup.outRound = cup.round;
      while (advance(cup)) for (const t of cup.rounds[cup.round]) simTie(t);
    } else if (cup.round === 2) cup.status = 'won';
    else advance(cup);
    persist();
  }
  function tieRow(id, g, pens, t, cup) {
    const def = teamById(id), row = document.createElement('div');
    if (id === cup.team) row.classList.add('you');
    if (t.w) row.classList.add(t.w === id ? 'win' : 'lose');
    const dotc = document.createElement('span'); dotc.className = 'dotc'; dotc.style.background = def.home.shirt;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = def.name;
    const gs = document.createElement('span'); gs.className = 'gs';
    gs.textContent = g === null ? '' : pens !== null ? `${g} (${pens})` : String(g);
    row.append(dotc, nm, gs);
    return row;
  }
  function showCup() {
    const cup = save.cup;
    if (!cup) return openSetup('cup');
    const me = teamById(cup.team);
    if (cup.status === 'won') { $('cupTitle').textContent = 'Campioni!'; $('cupSub').textContent = `${me.name} vince la Coppa Notturna.`; }
    else if (cup.status === 'out') {
      const lostFinal = cup.outRound === 2;
      $('cupTitle').textContent = lostFinal ? 'Secondo posto' : 'Eliminati';
      $('cupSub').textContent = lostFinal ? `${me.name} perde la finale.` : `${me.name} esce ai ${ROUND_NAMES[cup.outRound].toLowerCase()}.`;
    } else {
      const t = userTie(cup), opp = teamById(t.a === cup.team ? t.b : t.a);
      $('cupTitle').textContent = ROUND_NAMES[cup.round];
      $('cupSub').textContent = `${me.name} contro ${opp.name}. Se finisce pari si va ai rigori.`;
    }
    const br = $('bracket');
    br.innerHTML = '';
    cup.rounds.forEach((r, i) => {
      const col = document.createElement('div'); col.className = 'round';
      const h = document.createElement('h3'); h.textContent = ROUND_NAMES[i]; col.appendChild(h);
      const n = [4, 2, 1][i];
      for (let k = 0; k < n; k++) {
        const t = r[k], box = document.createElement('div'); box.className = 'tie';
        if (t) { box.append(tieRow(t.a, t.ga, t.pa, t, cup), tieRow(t.b, t.gb, t.pb, t, cup)); }
        else { const e = document.createElement('div'); e.innerHTML = '<span class="nm lose">Da decidere</span>'; box.appendChild(e); }
        col.appendChild(box);
      }
      br.appendChild(col);
    });
    $('cupPlay').hidden = cup.status !== 'playing';
    $('cupPlay').textContent = cup.round === 2 ? 'Gioca la finale' : 'Gioca';
    show('scrCup');
  }
  function updateCupNote() {
    const c = save.cup;
    $('cupNote').textContent = c && c.status === 'playing' ? `In corso: ${ROUND_NAMES[c.round].toLowerCase()} con ${teamById(c.team).name}` : 'Otto squadre, eliminazione diretta';
  }
  $('cupPlay').addEventListener('click', () => {
    const cup = save.cup, t = userTie(cup);
    startMatch({ home: cup.team, away: t.a === cup.team ? t.b : t.a, diff: cup.diff, len: cup.len, mode: 'cup' });
  });
  $('cupMenu').addEventListener('click', toMenu);
  $('cupReset').addEventListener('click', () => { save.cup = null; persist(); picks.a = save.team; openSetup('cup'); });

  // ---------- intervallo e fine partita ----------
  function statRows() {
    const [s0, s1] = G.stats, [A, B] = G.teams;
    const tot = s0.poss + s1.poss || 1, p0 = Math.round(s0.poss / tot * 100);
    return [
      ['Possesso', `${p0}%`, `${100 - p0}%`, p0, 100 - p0],
      ['Tiri', s0.shots, s1.shots],
      ['Tiri in porta', s0.onTarget, s1.onTarget],
      ['Passaggi riusciti', `${s0.passOk}/${s0.passes}`, `${s1.passOk}/${s1.passes}`, s0.passOk, s1.passOk],
      ["Calci d'angolo", s0.corners, s1.corners],
      ['Falli', s0.fouls, s1.fouls],
      ['Parate', s0.saves, s1.saves]
    ].map(r => {
      const a = r[3] !== undefined ? r[3] : r[1], b = r[4] !== undefined ? r[4] : r[2];
      const share = a + b ? a / (a + b) * 100 : 50;
      return `<tr><td>${r[1]}</td><td class="mid">${r[0]}<div class="bar2"><i style="width:${share}%;background:${teamInk(A)}"></i><i style="flex:1;background:${teamInk(B)}"></i></div></td><td>${r[2]}</td></tr>`;
    }).join('');
  }
  function button(label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function showBreak(final) {
    const [A, B] = G.teams;
    $('brKicker').textContent = final ? 'Fischio finale' : 'Intervallo';
    let title = 'Fine del primo tempo';
    if (final) {
      const w = G.result ? G.result.winner : -1;
      const pens = G.shootout && G.shootout.done;
      title = w === 0 ? (pens ? 'Vittoria ai rigori' : 'Hai vinto!') : w === 1 ? (pens ? 'Sconfitta ai rigori' : 'Hai perso') : 'Pareggio';
    }
    $('brTitle').textContent = title;
    const sc = $('brScore');
    sc.innerHTML = '';
    const num = document.createElement('span');
    if (G.mode === 'shootout' && G.shootout) {
      num.textContent = `${G.shootout.kicks[0].filter(Boolean).length} – ${G.shootout.kicks[1].filter(Boolean).length}`;
    } else num.textContent = `${A.score} – ${B.score}`;
    sc.append(crestEl(A.def, 'mini'), num, crestEl(B.def, 'mini'));
    const note = $('brNote');
    if (final && G.shootout && G.shootout.done && G.mode !== 'shootout') {
      note.hidden = false;
      note.textContent = `Rigori: ${G.shootout.kicks[0].filter(Boolean).length} – ${G.shootout.kicks[1].filter(Boolean).length}`;
    } else note.hidden = true;
    $('brStats').innerHTML = G.mode === 'shootout' ? '' : statRows();
    $('brStats').hidden = G.mode === 'shootout';
    const row = $('brButtons');
    row.innerHTML = '';
    if (!final) {
      row.append(button('Secondo tempo', 'primary', () => { show(null); secondHalf(); }));
    } else if (G.mode === 'cup') {
      recordCup();
      row.append(button('Tabellone della coppa', 'primary', showCup));
    } else if (G.mode === 'league') {
      if (!resultRecorded) { resultRecorded = true; League.recordMatch(G.teams[0].score, G.teams[1].score, false); }
      const last = League.note();
      if (last) {
        note.hidden = false;
        note.textContent = `+${last.credits.toLocaleString('it-IT')} crediti` + (last.grown.length ? `. Crescono: ${last.grown.join(', ')}` : '');
      }
      row.append(button('Torna al campionato', 'primary', () => { startAttract(); League.open(); }));
    } else {
      row.append(button('Rivincita', 'primary', () => startMatch(lastMatch)));
      if (G.mode === 'friendly') row.append(button('Cambia squadre', 'ghost', () => openSetup('friendly')));
      row.append(button('Menu', 'ghost', toMenu));
    }
    show('scrBreak');
  }

  // ---------- online ----------
  let netStatusMsg = '';
  const fmtRecord = r => `${r.w}V ${r.d}N ${r.l}P`;
  function tierChip(rating) {
    const t = Net.tierOf(rating), el = document.createElement('span');
    el.className = 'tier'; el.textContent = t.name; el.style.setProperty('--tc', t.col);
    return el;
  }
  function formEl(form) {
    const el = document.createElement('span');
    el.className = 'form';
    for (const ch of String(form || '')) {
      const i = document.createElement('i');
      i.textContent = ch; i.className = ch === 'V' ? 'fw' : ch === 'P' ? 'fl' : 'fd';
      el.appendChild(i);
    }
    return el;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function openOnline() {
    Sound.unlock();
    if (G.mode !== 'attract' && !Net.inMatch()) startAttract();
    Net.openLobby();
    netStatusMsg = '';
    renderOnline();
    show('scrOnline');
  }
  function renderOnline() {
    const st = Net.state();
    const status = $('onStatus');
    if (!st.tried) status.textContent = 'Collegamento alla sala in corso…';
    else if (!st.online) status.textContent = 'La modalità online funziona nella pagina pubblicata su claude.ai: condividila con un amico e apritela entrambi.';
    else if (st.connecting) status.textContent = netStatusMsg || 'Collegamento alla partita…';
    else status.textContent = st.notice || 'Sfida chi è in sala. Chi viene sfidato vede la richiesta e può accettare.';
    // la tua scheda
    const me = st.me, card = $('onMe');
    card.innerHTML = '';
    const pickRow = el('div', 'prow');
    const prev = el('button', 'arrow', '‹'), next = el('button', 'arrow', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Squadra precedente'); next.setAttribute('aria-label', 'Squadra successiva');
    const cycleTeam = d => {
      const ids = TEAMS.map(t => t.id), i = ids.indexOf(st.team);
      Net.setTeam(ids[(i + d + ids.length) % ids.length]); Sound.click(); renderOnline();
    };
    prev.addEventListener('click', () => cycleTeam(-1)); next.addEventListener('click', () => cycleTeam(1));
    pickRow.append(prev, crestEl(teamById(st.team), 'mini'), next);
    const info = el('div', 'oninfo');
    info.append(el('div', 'pname', teamById(st.team).name));
    const line = el('div', 'onrate');
    line.append(el('b', '', String(me.rating)), el('span', '', ' punti '), tierChip(me.rating));
    info.append(line, el('div', 'onrec', me.played ? `${fmtRecord(me)} · ${me.played} partite` : 'Nessuna partita classificata'));
    if (me.form) info.append(formEl(me.form));
    card.append(pickRow, info);
    $('onWarn').hidden = !(st.online && (!st.ranked || st.writeOk === false));
    $('onWarn').textContent = !st.ranked ? 'Le partite online di questa visita non entrano in classifica.' : 'Il tuo punteggio non viene salvato: per entrare in classifica serve l\'accesso da Collaboratore a questa pagina.';
    // sfida in arrivo
    const inc = $('onIncoming');
    inc.hidden = !st.incoming;
    if (st.incoming) {
      inc.innerHTML = '';
      const txt = el('p', '');
      txt.append(el('b', '', st.incoming.name), document.createTextNode(` ti sfida con ${teamById(st.incoming.team).name} (${st.incoming.r} punti), partita da ${Math.round(st.incoming.len / 60)} minuti.`));
      const row = el('div', 'row');
      const ok = el('button', 'primary', 'Accetta'), no = el('button', 'ghost', 'Rifiuta');
      ok.type = no.type = 'button';
      ok.addEventListener('click', () => { Net.accept(); renderOnline(); });
      no.addEventListener('click', () => Net.decline());
      row.append(ok, no);
      inc.append(txt, row);
    }
    // giocatori in sala
    const list = $('onList');
    list.innerHTML = '';
    if (st.online && !st.peers.length) {
      list.append(el('p', 'empty', 'Nessun altro giocatore in sala. Condividi questa pagina con un amico: quando apre Online, compare qui.'));
    }
    for (const p of st.peers) {
      const row = el('div', 'onrow');
      const who = el('div', 'onwho');
      const nm = el('span', 'nm', p.name);
      who.append(nm);
      if (p.guest) who.append(el('span', 'tag', 'ospite'));
      const team = teamById(p.team);
      const tdot = el('span', 'dotc'); tdot.style.background = team.home.shirt;
      const meta = el('div', 'onmeta');
      meta.append(tdot, document.createTextNode(` ${team.short} · ${p.r} `), tierChip(p.r));
      const act = el('div', 'onact');
      if (st.challenge && st.challenge.to === p.peer) {
        act.append(el('span', 'wait', 'In attesa…'));
        const c = el('button', 'ghost', 'Annulla'); c.type = 'button';
        c.addEventListener('click', () => Net.cancelChallenge());
        act.append(c);
      } else if (p.busy) {
        act.append(el('span', 'wait', 'In partita'));
      } else {
        const b = el('button', '', 'Sfida'); b.type = 'button';
        b.disabled = !!st.challenge || st.connecting;
        b.addEventListener('click', () => { Net.setLen(save.len); Net.challenge(p.peer); });
        act.append(b);
      }
      row.append(who, meta, act);
      list.append(row);
    }
  }
  function showOnlineHalf() {
    showBreak(false);
    $('brNote').hidden = false;
    $('brNote').textContent = 'Il secondo tempo inizia tra pochi secondi.';
    $('brButtons').innerHTML = '';
  }
  function showOnlineEnd(info) {
    const [A, B] = G.teams;
    $('brKicker').textContent = info.forfeit ? 'Vittoria a tavolino' : 'Fischio finale';
    $('brTitle').textContent = info.score === 1 ? 'Hai vinto!' : info.score === 0 ? 'Hai perso' : 'Pareggio';
    const sc = $('brScore');
    sc.innerHTML = '';
    sc.append(crestEl(A.def, 'mini'), el('span', '', `${A.score} – ${B.score}`), crestEl(B.def, 'mini'));
    const note = $('brNote');
    note.hidden = false;
    note.innerHTML = '';
    if (info.forfeit) note.append(el('span', '', `${info.opp} ha lasciato la partita. `));
    if (info.ranked) {
      const d = info.after - info.before;
      note.append(document.createTextNode(`Classifica: ${info.before} → `), el('b', '', String(info.after)), document.createTextNode(` (${d >= 0 ? '+' : ''}${d}) `), tierChip(info.after));
    } else note.append(document.createTextNode('Partita non classificata.'));
    const stats = $('brStats');
    stats.hidden = false;
    stats.innerHTML = statRows();
    const row = $('brButtons');
    row.innerHTML = '';
    row.append(button('Torna alla sala', 'primary', openOnline), button('Classifica', 'ghost', () => openRank('scrBreak')), button('Menu', 'ghost', toMenu));
    show('scrBreak');
  }
  function openRank(from) {
    rankFrom = from || 'scrMenu';
    const tb = $('rkTable');
    tb.innerHTML = '<tbody><tr><td class="empty">Caricamento della classifica…</td></tr></tbody>';
    renderTiers();
    Net.watchBoard(rows => {
      tb.innerHTML = '';
      if (rows === null) { tb.innerHTML = '<tbody><tr><td class="empty">La classifica è disponibile nella pagina pubblicata su claude.ai.</td></tr></tbody>'; return; }
      if (!rows.length) { tb.innerHTML = '<tbody><tr><td class="empty">Ancora nessuna partita classificata. Gioca online per aprire la classifica.</td></tr></tbody>'; return; }
      const head = el('thead'), hr = el('tr');
      for (const h of ['#', 'Giocatore', 'Divisione', 'Punti', 'V N P', 'Forma']) hr.append(el('th', '', h));
      head.append(hr);
      const body = el('tbody');
      rows.forEach((r, i) => {
        const tr = el('tr', r.me ? 'me' : '');
        const team = TEAMS.find(t => t.id === r.team);
        const who = el('td', 'who');
        if (team) { const d = el('span', 'dotc'); d.style.background = team.home.shirt; who.append(d); }
        who.append(el('span', 'nm', r.name));
        if (r.me) who.append(el('span', 'tag', 'tu'));
        const tierTd = el('td'); tierTd.append(tierChip(r.rating));
        const formTd = el('td'); formTd.append(formEl(r.form));
        tr.append(el('td', 'pos', String(i + 1)), who, tierTd, el('td', 'pts', String(r.rating)), el('td', 'rec', fmtRecord(r)), formTd);
        body.append(tr);
      });
      tb.append(head, body);
    });
    show('scrRank');
  }
  function renderTiers() {
    const box = $('rkTiers');
    box.innerHTML = '';
    for (const r of [900, 1050, 1200, 1350, 1500].reverse().concat([0])) {
      const t = Net.tierOf(r), item = el('span', 'tieritem');
      item.append(tierChip(r), document.createTextNode(r ? ` da ${t.min}` : ' sotto 900'));
      box.append(item);
    }
  }
  function closeRank() { Net.unwatchBoard(); if (rankFrom === 'scrOnline') openOnline(); else if (rankFrom === 'scrBreak') show('scrBreak'); else show('scrMenu'); }
  $('mOnline').addEventListener('click', openOnline);
  $('mLeague').addEventListener('click', () => { Sound.unlock(); League.open(); });
  $('mRank').addEventListener('click', () => openRank('scrMenu'));
  $('onRank').addEventListener('click', () => openRank('scrOnline'));
  $('onBack').addEventListener('click', toMenu);
  $('rkBack').addEventListener('click', closeRank);
  buildSeg('segOnLen', LENGTHS, save.len, v => { save.len = v; persist(); });

  // ---------- pausa e aiuto ----------
  function togglePause() {
    if (screen === 'scrPause') { G.paused = false; show(null); return; }
    if (screen === 'scrHelp') { show(helpFrom); return; }
    if (screen === 'scrRank') { closeRank(); return; }
    if (screen === 'scrSquad' || screen === 'scrMarket') { League.open(); return; }
    if (screen === 'scrClub') { $('clCancel').click(); return; }
    if (screen === 'scrSetup' || screen === 'scrCup' || screen === 'scrOnline' || screen === 'scrLeague') { toMenu(); return; }
    if (screen) return;
    if (G.mode === 'attract' || G.phase === 'break') return;
    const online = Net.inMatch();
    // in rete il tempo non si ferma: il menu resta aperto mentre la partita continua
    if (!online) G.paused = true;
    keys.clear(); IN.shoot = false;
    $('pauseTitle').textContent = online ? 'Partita online' : 'Pausa';
    $('pauseNote').hidden = !online;
    $('pQuit').textContent = online ? 'Abbandona (conta come sconfitta)' : G.mode === 'league' ? 'Abbandona (sconfitta 0-3)' : 'Abbandona la partita';
    show('scrPause');
  }
  $('pResume').addEventListener('click', togglePause);
  $('pQuit').addEventListener('click', () => {
    if (Net.inMatch()) { Net.quit(); openOnline(); return; }
    if (G.mode === 'league' && !resultRecorded) {
      // chi abbandona in campionato perde a tavolino
      resultRecorded = true;
      League.recordMatch(0, 3, true);
      G.paused = false; startAttract(); League.open();
      return;
    }
    toMenu();
  });
  $('pHelp').addEventListener('click', () => { helpFrom = 'scrPause'; show('scrHelp'); });
  $('mHelp').addEventListener('click', () => { helpFrom = 'scrMenu'; show('scrHelp'); });
  $('hBack').addEventListener('click', () => show(helpFrom));
  $('btnPause').addEventListener('click', togglePause);
  $('mFriendly').addEventListener('click', () => { Sound.unlock(); openSetup('friendly'); });
  $('mPens').addEventListener('click', () => { Sound.unlock(); openSetup('shootout'); });
  $('mCup').addEventListener('click', () => {
    Sound.unlock();
    if (save.cup && save.cup.status === 'playing') showCup();
    else { if (save.cup) picks.a = save.cup.team; openSetup('cup'); }
  });
  function syncSound() {
    $('btnSound').setAttribute('aria-pressed', String(!save.muted));
    $('btnSound').title = save.muted ? 'Audio spento' : 'Audio acceso';
    Sound.setMuted(save.muted);
  }
  $('btnSound').addEventListener('click', () => { save.muted = !save.muted; persist(); Sound.unlock(); syncSound(); });
  const app = $('app');
  if (!(document.fullscreenEnabled && app.requestFullscreen)) $('btnFull').hidden = true;
  $('btnFull').addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else app.requestFullscreen().catch(() => {});
    } catch (e) { /* non supportato */ }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !screen && G.mode !== 'attract' && G.mode !== 'online' && !G.paused) togglePause(); });

  // ---------- tastiera ----------
  const keys = new Set();
  const K = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] };
  const SHOOT = ['Space', 'KeyJ'], PASS = ['KeyX', 'KeyK'], LOB = ['KeyC', 'KeyL'], SPRINT = ['ShiftLeft', 'ShiftRight', 'KeyI'];
  const CURL = ['KeyQ', 'KeyU'], FEINT = ['KeyF', 'KeyH'], KNOCK = ['KeyV', 'KeyO'];
  const GAME_KEYS = new Set([...K.up, ...K.down, ...K.left, ...K.right, ...SHOOT, ...PASS, ...LOB, ...SPRINT, ...CURL, ...FEINT, ...KNOCK]);
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) togglePause(); e.preventDefault(); return; }
    if (screen || G.mode === 'attract') return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    Sound.unlock();
    keys.add(e.code);
    if (SHOOT.includes(e.code)) IN.shootE = true;
    if (PASS.includes(e.code)) IN.passE = true;
    if (LOB.includes(e.code)) IN.lobE = true;
    if (CURL.includes(e.code)) IN.curlE = true;
    if (FEINT.includes(e.code)) IN.feintE = true;
    if (KNOCK.includes(e.code)) IN.knockE = true;
    IN.anyE = true;
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ---------- touch ----------
  const joy = { x: 0, y: 0, id: null };
  let tShoot = false, tSprint = false, tCurl = false, lastSprintTap = 0;
  const joyEl = $('joy'), knob = $('knob');
  function joyMove(e) {
    const r = joyEl.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 16, l = Math.hypot(x, y);
    if (l > max) { x = x / l * max; y = y / l * max; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    joy.x = x / max; joy.y = y / max;
  }
  joyEl.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); Sound.unlock(); });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);
  function padButton(id, down, up) {
    const el = $(id);
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on');
      Sound.unlock(); IN.anyE = true; down();
    });
    const end = () => { el.classList.remove('on'); if (up) up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  padButton('tShoot', () => { tShoot = true; IN.shootE = true; }, () => { tShoot = false; });
  padButton('tPass', () => { IN.passE = true; });
  padButton('tLob', () => { IN.lobE = true; });
  padButton('tSprint', () => {
    tSprint = true;
    // doppio tocco su Scatto = allungo
    const now = performance.now();
    if (now - lastSprintTap < 320) IN.knockE = true;
    lastSprintTap = now;
  }, () => { tSprint = false; });
  padButton('tCurl', () => { tCurl = true; IN.curlE = true; }, () => { tCurl = false; });
  joyEl.addEventListener('contextmenu', e => e.preventDefault());
  $('cv').addEventListener('pointerdown', () => { if (!screen) IN.anyE = true; });

  const coarse = window.matchMedia('(pointer: coarse)');
  function syncTouch() { RD.touch = coarse.matches; root.classList.toggle('touch', coarse.matches); }
  syncTouch();
  if (coarse.addEventListener) coarse.addEventListener('change', syncTouch);

  // ---------- gamepad ----------
  const pad = { x: 0, y: 0, shoot: false, curl: false, sprint: false, prev: [] };
  function pollPad() {
    let list = [];
    try { list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { list = []; }
    const gp = list.find(g => g && g.connected);
    if (!gp) { pad.x = pad.y = 0; pad.shoot = pad.curl = pad.sprint = false; return; }
    const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = i => btn(i) && !pad.prev[i];
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    pad.x = Math.abs(ax) > 0.2 ? ax : 0; pad.y = Math.abs(ay) > 0.2 ? ay : 0;
    if (btn(12)) pad.y = -1; if (btn(13)) pad.y = 1; if (btn(14)) pad.x = -1; if (btn(15)) pad.x = 1;
    if (screen) {
      if (edge(0) && document.activeElement && document.activeElement.click) document.activeElement.click();
    } else if (G.mode !== 'attract') {
      if (edge(0)) IN.passE = true;
      if (edge(1)) IN.shootE = true;
      if (edge(2)) IN.lobE = true;
      if (edge(3)) IN.curlE = true;
      if (edge(4)) IN.knockE = true;
      if (edge(6)) IN.feintE = true;
      if ([0, 1, 2, 3, 4, 6].some(edge)) IN.anyE = true;
    }
    if (edge(9)) togglePause();
    pad.shoot = btn(1);
    pad.curl = btn(3);
    pad.sprint = btn(5) || btn(7);
    pad.prev = gp.buttons.map(b => b.pressed);
  }
  function mergeInput() {
    let x = 0, y = 0;
    if (K.left.some(k => keys.has(k))) x -= 1;
    if (K.right.some(k => keys.has(k))) x += 1;
    if (K.up.some(k => keys.has(k))) y -= 1;
    if (K.down.some(k => keys.has(k))) y += 1;
    if (Math.hypot(joy.x, joy.y) > 0.18) { x = joy.x; y = joy.y; }
    if (Math.hypot(pad.x, pad.y) > 0.2) { x = pad.x; y = pad.y; }
    IN.x = x; IN.y = y;
    IN.shoot = SHOOT.some(k => keys.has(k)) || tShoot || pad.shoot;
    IN.sprint = SPRINT.some(k => keys.has(k)) || tSprint || pad.sprint;
    IN.curl = CURL.some(k => keys.has(k)) || tCurl || pad.curl;
  }

  // ---------- ciclo ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pollPad(); mergeInput();
    if (Net.isGuest()) {
      // chi è stato sfidato non simula: riceve lo stato dall'altro giocatore
      acc = 0;
      Net.frame(dt);
    } else {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 5) { step(DT); acc -= DT; n++; }
      if (n === 5) acc = 0;
      Net.frame(dt);
    }
    if (pendingBreak && now >= pendingBreak.at) { const f = pendingBreak.final; pendingBreak = null; showBreak(f); }
    render(dt);
    updateBoard();
    if (Sound.ctx) Sound.crowd(G.excite, G.mode === 'attract' || !!screen);
    requestAnimationFrame(frame);
  }

  rInit($('cv'));
  window.addEventListener('resize', rResize);
  if (window.ResizeObserver) new ResizeObserver(rResize).observe($('cv'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { RD.key = ''; });
  syncSound();
  Net.init({
    show,
    netChanged() { if (screen === 'scrOnline') renderOnline(); },
    netStatus(msg) { netStatusMsg = msg; if (screen === 'scrOnline') renderOnline(); },
    enterMatch() {
      Sound.unlock(); Sound.quiet = false;
      keys.clear(); pendingBreak = null; RD.snap = true;
      show(null); updateBoard(true);
    },
    onlineHalf: showOnlineHalf,
    onlineEnd: showOnlineEnd,
    backToLobby: openOnline
  });
  League.init({
    save: () => save, persist, show, startMatch, crestEl, toMenu,
    click: () => Sound.click()
  });
  startAttract();
  updateCupNote();
  show('scrMenu');
  requestAnimationFrame(t => { last = t; frame(t); });

  // accesso per test e debug dalla console
  window.CN = { G, IN, RD, Net, step, startMatch, toMenu, openOnline, fast(n) { for (let i = 0; i < n; i++) step(DT); } };
})();
