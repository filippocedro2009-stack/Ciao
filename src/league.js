'use strict';
// Campionato: il tuo club contro 7 squadre, andata e ritorno. Crediti per allenare e comprare giocatori,
// divisa e stemma su misura. Tutto resta salvato nel browser.
const League = (() => {
  const MD = 14;
  const PRIZES = [1500, 1000, 750, 550, 400, 300, 200, 120];
  const DIFF_OFF = { facile: -0.1, normale: 0, difficile: 0.08 };
  let U = null;
  let draft = null, clubMode = 'edit', buying = null, resetAsk = false;

  const L = () => U.save().league;
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('it-IT');
  const uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- dati ----------
  function defaultClub() {
    return {
      name: 'Notturna FC', short: 'NOT', gk: '#f6c543',
      kit: {
        home: { shirt: '#2f7fe0', trim: '#f2f3ee', socks: '#2f7fe0', pattern: 'stripes' },
        away: { shirt: '#f2f3ee', trim: '#2f7fe0', socks: '#f2f3ee', pattern: 'plain' }
      },
      crest: { shape: 'shield', fill: 'split', c1: '#2f7fe0', c2: '#f2f3ee', symbol: 'star', sc: '#f6c543' }
    };
  }
  function freshName(taken) {
    for (let k = 0; k < 50; k++) { const n = pick(SURNAMES); if (!taken.includes(n)) return n; }
    return pick(SURNAMES);
  }
  function newRoster() {
    const taken = [];
    return FORM.map(f => {
      const name = freshName(taken); taken.push(name);
      return { n: f.n, role: f.role, name, a: attrsFromSkill(0.55, f.role), skin: pick(SKINS), hair: pick(HAIRS) };
    });
  }
  function baseStr(id, season) {
    return clamp(0.62 + (teamById(id).rating - 3) * 0.06 + (season - 1) * 0.035 + rnd(-0.03, 0.03), 0.5, 1.12);
  }
  function makeFixtures(keys) {
    const n = keys.length, arr = shuffle(keys), rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const md = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        md.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(md);
      arr.splice(1, 0, arr.pop());
    }
    return rounds.concat(rounds.map(md => md.map(([a, b]) => [b, a])));
  }
  function newLeague(club, diff, len) {
    const cpu = shuffle(TEAMS.map(t => t.id)).slice(0, 7);
    const str = {};
    for (const id of cpu) str[id] = baseStr(id, 1);
    const lg = {
      v: 1, season: 1, trophies: 0, credits: 400, club, players: newRoster(), cpu, str,
      fixtures: makeFixtures(['me', ...cpu]), results: [], md: 0, diff, len, market: [], ended: false,
      history: [], last: null, seasonEnd: null
    };
    lg.market = genMarket(lg);
    return lg;
  }
  const teamName = (lg, k) => k === 'me' ? lg.club.name : teamById(k).name;
  const teamShort = (lg, k) => k === 'me' ? lg.club.short : teamById(k).short;
  const teamColor = (lg, k) => k === 'me' ? lg.club.kit.home.shirt : teamById(k).home.shirt;
  function clubSkill(lg) {
    return lg.players.reduce((t, p) => t + clamp((overall(p.a, p.role) - 40) / 40, 0.3, 1.4), 0) / lg.players.length;
  }
  function clubOverall(lg) { return Math.round(lg.players.reduce((t, p) => t + overall(p.a, p.role), 0) / lg.players.length); }
  function strOf(lg, k) { return k === 'me' ? clubSkill(lg) : lg.str[k] + (DIFF_OFF[lg.diff] || 0); }
  function poisson(l) {
    let k = 0, p = Math.exp(-l), s = p;
    const u = Math.random();
    while (u > s && k < 8) { k++; p *= l / k; s += p; }
    return k;
  }
  function simScore(lg, h, a) {
    const d = strOf(lg, h) - strOf(lg, a);
    return [poisson(clamp(1.45 + d * 2.4, 0.2, 3.6)), poisson(clamp(1.2 - d * 2.4, 0.2, 3.6))];
  }
  function table(lg) {
    const rows = {};
    for (const k of ['me', ...lg.cpu]) rows[k] = { k, g: 0, v: 0, n: 0, p: 0, gf: 0, gs: 0, pt: 0, form: '' };
    const add = (r, f, s) => {
      r.g++; r.gf += f; r.gs += s;
      if (f > s) { r.v++; r.pt += 3; r.form = 'V' + r.form; } else if (f === s) { r.n++; r.pt++; r.form = 'N' + r.form; } else { r.p++; r.form = 'P' + r.form; }
    };
    lg.results.forEach((res, md) => {
      if (!res) return;
      res.forEach((r, i) => { if (!r) return; const [h, a] = lg.fixtures[md][i]; add(rows[h], r[0], r[1]); add(rows[a], r[1], r[0]); });
    });
    return Object.values(rows).sort((x, y) => y.pt - x.pt || (y.gf - y.gs) - (x.gf - x.gs) || y.gf - x.gf);
  }
  function nextFixture(lg) {
    const md = lg.fixtures[lg.md];
    if (!md) return null;
    const i = md.findIndex(f => f.includes('me'));
    const [h, a] = md[i];
    return { i, home: h === 'me', opp: h === 'me' ? a : h };
  }
  function playerValue(a, role) {
    return Math.max(80, Math.round(Math.pow(Math.max(0, overall(a, role) - 40), 1.6) * 6 / 10) * 10);
  }
  function trainCost(v) { return 25 + Math.max(0, v - 45) * 4; }
  function genMarket(lg) {
    const avg = clubOverall(lg), taken = lg.players.map(p => p.name), out = [];
    for (let i = 0; i < 4; i++) {
      const role = pick(['def', 'mid', 'mid', 'att', 'att', 'gk']);
      const target = clamp(avg + rnd(-3, 13), 45, 95);
      const a = attrsFromSkill((target - 40) / 40 - 0.05, role);
      const name = freshName(taken); taken.push(name);
      out.push({ id: uid(), role, name, a, skin: pick(SKINS), hair: pick(HAIRS), price: playerValue(a, role) });
    }
    return out;
  }

  // ---------- risultati ----------
  function recordMatch(gUser, gOpp, simulated) {
    const lg = L(), f = nextFixture(lg);
    if (!f || lg.ended) return null;
    const res = lg.results[lg.md] = lg.results[lg.md] || new Array(lg.fixtures[lg.md].length).fill(null);
    res[f.i] = f.home ? [gUser, gOpp] : [gOpp, gUser];
    lg.fixtures[lg.md].forEach(([h, a], i) => { if (i !== f.i) res[i] = simScore(lg, h, a); });
    let credits = (gUser > gOpp ? 250 : gUser === gOpp ? 120 : 60) + 30 * gUser + (gOpp === 0 ? 50 : 0);
    if (simulated) credits = Math.round(credits * 0.6);
    lg.credits += credits;
    // chi gioca davvero fa esperienza
    const grown = [];
    if (!simulated) {
      for (const p of lg.players) {
        if (Math.random() > 0.2) continue;
        const keys = p.role === 'gk' ? ['por', 'res', 'pas'] : p.role === 'def' ? ['dif', 'vel', 'res'] : p.role === 'mid' ? ['pas', 'res', 'tir'] : ['tir', 'vel', 'pas'];
        const k = pick(keys);
        if (p.a[k] < 99) { p.a[k]++; grown.push(`${p.name} +1 ${ATTRS.find(x => x[0] === k)[1].toLowerCase()}`); }
      }
    }
    const outcome = gUser > gOpp ? 'Vittoria' : gUser === gOpp ? 'Pareggio' : 'Sconfitta';
    lg.last = { credits, grown, text: `${outcome} ${gUser}-${gOpp} contro ${teamName(lg, f.opp)}${simulated ? ' (simulata)' : ''}` };
    lg.md++;
    lg.market = genMarket(lg);
    if (lg.md >= MD) endSeason(lg);
    U.persist();
    return lg.last;
  }
  function endSeason(lg) {
    const pos = table(lg).findIndex(r => r.k === 'me');
    const prize = PRIZES[pos] || 100;
    lg.credits += prize;
    if (pos === 0) lg.trophies++;
    lg.history.push({ season: lg.season, pos: pos + 1 });
    lg.ended = true;
    lg.seasonEnd = { pos: pos + 1, prize };
  }
  function newSeason() {
    const lg = L();
    lg.season++;
    for (const id of lg.cpu) lg.str[id] = clamp(lg.str[id] + 0.03 + rnd(-0.04, 0.04), 0.5, 1.15);
    lg.fixtures = makeFixtures(['me', ...lg.cpu]);
    lg.results = []; lg.md = 0; lg.ended = false; lg.seasonEnd = null; lg.last = null;
    lg.market = genMarket(lg);
    U.persist();
    renderHub();
  }

  // ---------- squadra in campo ----------
  function clubDef(lg, opp) {
    const c = lg.club;
    let home = Object.assign({}, c.kit.home), away = Object.assign({}, c.kit.away);
    // se le prime maglie si somigliano, il tuo club indossa la seconda
    if (opp && colorDist(home.shirt, teamById(opp).home.shirt) < 130) [home, away] = [away, home];
    return { id: 'me-' + hashStr(c.name), name: c.name, short: c.short, rating: 3, gk: c.gk, home, away, crest: c.crest, roster: lg.players };
  }
  function play() {
    const lg = L(), f = nextFixture(lg);
    if (!f) return;
    U.startMatch({ mode: 'league', homeDef: clubDef(lg, f.opp), away: f.opp, cpuSkill: strOf(lg, f.opp), diff: lg.diff, len: lg.len });
  }
  function simulate() {
    const lg = L(), f = nextFixture(lg);
    if (!f) return;
    const [h, a] = simScore(lg, f.home ? 'me' : f.opp, f.home ? f.opp : 'me');
    recordMatch(f.home ? h : a, f.home ? a : h, true);
    U.click();
    renderHub();
  }

  // ---------- schermate ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function crestFor(lg, k, cls) {
    if (k === 'me') { const d = el('div', 'crest svgcrest ' + (cls || '')); d.innerHTML = crestSVG(lg.club.crest, lg.club.short); return d; }
    return U.crestEl(teamById(k), cls);
  }
  function open() {
    const lg = L();
    if (!lg) { openClub('create'); return; }
    resetAsk = false;
    renderHub();
    U.show('scrLeague');
  }
  function renderHub() {
    const lg = L();
    $('lgCrest').innerHTML = crestSVG(lg.club.crest, lg.club.short);
    $('lgName').textContent = lg.club.name;
    $('lgKicker').textContent = `Campionato · Stagione ${lg.season}`;
    $('lgSub').textContent = `Giornata ${Math.min(lg.md + 1, MD)} di ${MD} · ${fmt(lg.credits)} crediti · valutazione ${clubOverall(lg)} · scudetti ${lg.trophies}`;
    const next = $('lgNext');
    next.innerHTML = '';
    if (lg.last) {
      const n = el('p', 'lglast');
      n.append(el('b', '', lg.last.text), document.createTextNode(` · +${fmt(lg.last.credits)} crediti`));
      if (lg.last.grown.length) n.append(el('span', 'grown', ` · Crescono: ${lg.last.grown.join(', ')}`));
      next.append(n);
    }
    if (lg.ended) {
      const se = lg.seasonEnd;
      const box = el('div', 'lgcard');
      box.append(el('h3', '', se.pos === 1 ? 'Campioni! Scudetto vinto' : `Fine stagione: ${se.pos}° posto`));
      box.append(el('p', 'sub', `Premio di fine stagione: ${fmt(se.prize)} crediti. Le altre squadre si rinforzano per la prossima stagione.`));
      box.append(btn('Nuova stagione', 'primary', newSeason));
      next.append(box);
    } else {
      const f = nextFixture(lg);
      const box = el('div', 'lgcard');
      const vs = el('div', 'lgvs');
      const meSide = el('div', 'side'), oppSide = el('div', 'side');
      meSide.append(crestFor(lg, 'me', 'mini'), el('span', 'nm', lg.club.name));
      const st = strOf(lg, f.opp), stars = clamp(Math.round((st - 0.45) / 0.14), 1, 5);
      oppSide.append(crestFor(lg, f.opp, 'mini'), el('span', 'nm', teamName(lg, f.opp)), el('span', 'stars', '★'.repeat(stars) + '☆'.repeat(5 - stars)));
      vs.append(meSide, el('span', 'vs', f.home ? 'in casa' : 'in trasferta'), oppSide);
      box.append(vs);
      const row = el('div', 'row');
      row.append(btn('Gioca la partita', 'primary', play), btn('Simula il risultato', 'ghost', simulate));
      box.append(row, el('p', 'note', 'La partita simulata vale il 60% dei crediti e non fa crescere i giocatori.'));
      next.append(box);
    }
    // classifica
    const tb = $('lgTable');
    tb.innerHTML = '';
    const head = el('thead'), hr = el('tr');
    for (const h of ['#', 'Squadra', 'G', 'V', 'N', 'P', 'DR', 'Pt']) hr.append(el('th', '', h));
    head.append(hr);
    const body = el('tbody');
    table(lg).forEach((r, i) => {
      const tr = el('tr', r.k === 'me' ? 'me' : '');
      const who = el('td', 'who');
      const d = el('span', 'dotc'); d.style.background = teamColor(lg, r.k);
      who.append(d, el('span', 'nm', teamName(lg, r.k)));
      const dr = r.gf - r.gs;
      tr.append(el('td', 'pos', String(i + 1)), who, el('td', '', String(r.g)), el('td', '', String(r.v)), el('td', '', String(r.n)), el('td', '', String(r.p)), el('td', '', (dr > 0 ? '+' : '') + dr), el('td', 'pts', String(r.pt)));
      body.append(tr);
    });
    tb.append(head, body);
    // ultima giornata
    const rs = $('lgRes');
    rs.innerHTML = '';
    const lastMd = lg.md - 1;
    if (lastMd >= 0 && lg.results[lastMd]) {
      rs.append(el('h3', '', `Giornata ${lastMd + 1}`));
      lg.fixtures[lastMd].forEach(([h, a], i) => {
        const r = lg.results[lastMd][i];
        const line = el('div', 'lgline' + (h === 'me' || a === 'me' ? ' me' : ''));
        line.append(el('span', 'nm', teamShort(lg, h)), el('b', '', `${r[0]} – ${r[1]}`), el('span', 'nm', teamShort(lg, a)));
        rs.append(line);
      });
    } else rs.append(el('p', 'note', 'I risultati della giornata compaiono qui dopo la prima partita.'));
    $('lgResetAsk').hidden = !resetAsk;
    $('lgReset').hidden = resetAsk;
  }

  function openSquad() { buying = null; renderSquad(); U.show('scrSquad'); }
  function renderSquad() {
    const lg = L();
    $('sqSub').textContent = `${fmt(lg.credits)} crediti. Ogni punto costa di più man mano che l'abilità cresce.`;
    const tb = $('sqTable');
    tb.innerHTML = '';
    const head = el('thead'), hr = el('tr');
    for (const h of ['#', 'Giocatore', 'Val', ...ATTRS.map(a => a[2])]) hr.append(el('th', '', h));
    head.append(hr);
    const body = el('tbody');
    lg.players.forEach(p => {
      const tr = el('tr');
      const who = el('td', 'who');
      who.append(el('span', 'nm', p.name), el('span', 'tag', ROLE_SHORT[p.role]));
      tr.append(el('td', 'pos', String(p.n)), who, el('td', 'pts', String(overall(p.a, p.role))));
      for (const [k, label] of ATTRS) {
        const td = el('td', 'attr');
        const relevant = p.role === 'gk' ? k !== 'tir' && k !== 'dif' : k !== 'por';
        if (!relevant) { td.append(el('span', 'muted', '–')); tr.append(td); continue; }
        const v = p.a[k], cost = trainCost(v);
        td.append(el('span', 'v', String(v)));
        const b = btn('+', 'plus', () => {
          if (lg.credits < cost || p.a[k] >= 99) return;
          lg.credits -= cost; p.a[k]++;
          U.persist(); U.click(); renderSquad();
        });
        b.disabled = lg.credits < cost || v >= 99;
        b.title = `Allena ${label.toLowerCase()}: ${cost} crediti`;
        b.setAttribute('aria-label', `Allena ${label.toLowerCase()} di ${p.name}, ${cost} crediti`);
        td.append(b);
        tr.append(td);
      }
      body.append(tr);
    });
    tb.append(head, body);
  }

  function openMarket() { buying = null; renderMarket(); U.show('scrMarket'); }
  function renderMarket() {
    const lg = L();
    $('mkSub').textContent = `${fmt(lg.credits)} crediti. Il mercato si rinnova dopo ogni giornata. Chi compri prende il posto di un giocatore dello stesso ruolo, ceduto al 40% del suo valore.`;
    const list = $('mkList');
    list.innerHTML = '';
    if (!lg.market.length) list.append(el('p', 'note', 'Nessun giocatore disponibile: torna dopo la prossima giornata.'));
    for (const m of lg.market) {
      const card = el('div', 'mkcard');
      const top = el('div', 'mktop');
      top.append(el('span', 'nm', m.name), el('span', 'tag', ROLE_NAMES[m.role]), el('span', 'ovr', String(overall(m.a, m.role))));
      const attrs = el('div', 'mkattrs');
      for (const [k, , short] of ATTRS) {
        if (m.role === 'gk' ? k === 'tir' || k === 'dif' : k === 'por') continue;
        attrs.append(el('span', '', `${short} ${m.a[k]}`));
      }
      const buy = el('div', 'mkbuy');
      buy.append(el('span', 'price', `${fmt(m.price)} crediti`));
      if (buying === m.id) {
        const pickRow = el('div', 'mkswap');
        pickRow.append(el('span', 'note', 'Al posto di:'));
        lg.players.forEach((p, pi) => {
          if (p.role !== m.role) return;
          const sale = Math.round(playerValue(p.a, p.role) * 0.4);
          const net = m.price - sale;
          const b = btn(`${p.name} (${overall(p.a, p.role)}) · lo cedi per ${fmt(sale)}, spendi ${fmt(net)}`, '', () => {
            if (lg.credits < net) return;
            lg.credits -= net;
            lg.players[pi] = { n: p.n, role: m.role, name: m.name, a: m.a, skin: m.skin, hair: m.hair };
            lg.market = lg.market.filter(x => x.id !== m.id);
            buying = null;
            U.persist(); U.click(); renderMarket();
          });
          b.disabled = lg.credits < net;
          pickRow.append(b);
        });
        pickRow.append(btn('Annulla', 'ghost', () => { buying = null; renderMarket(); }));
        buy.append(pickRow);
      } else {
        buy.append(btn('Compra', 'primary small', () => { buying = m.id; renderMarket(); }));
      }
      card.append(top, attrs, buy);
      list.append(card);
    }
  }

  // ---------- club e divisa ----------
  function openClub(mode) {
    clubMode = mode;
    const lg = L();
    draft = JSON.parse(JSON.stringify(lg && mode === 'edit' ? lg.club : defaultClub()));
    draft.diff = lg ? lg.diff : 'normale';
    draft.len = lg ? lg.len : 120;
    $('clKicker').textContent = mode === 'create' ? 'Nuovo campionato' : 'Campionato';
    $('clTitle').textContent = mode === 'create' ? 'Fonda il tuo club' : 'Club e divisa';
    $('clSave').textContent = mode === 'create' ? 'Inizia il campionato' : 'Salva';
    renderClub();
    U.show('scrClub');
  }
  function swatches(label, value, onPick) {
    const g = el('div', 'clfield');
    g.append(el('div', 'label', label));
    const row = el('div', 'swatches');
    for (const [hex, name] of PALETTE) {
      const b = el('button', 'sw');
      b.type = 'button'; b.style.background = hex; b.title = name;
      b.setAttribute('aria-label', `${label}: ${name}`);
      b.setAttribute('aria-pressed', String(hex === value));
      b.addEventListener('click', () => { onPick(hex); renderClub(); });
      row.append(b);
    }
    g.append(row);
    return g;
  }
  function choice(label, items, value, onPick) {
    const g = el('div', 'clfield');
    g.append(el('div', 'label', label));
    const seg = el('div', 'seg');
    for (const [v, name] of items) {
      const b = el('button', '', name);
      b.type = 'button'; b.setAttribute('aria-pressed', String(v === value));
      b.addEventListener('click', () => { onPick(v); renderClub(); });
      seg.append(b);
    }
    g.append(seg);
    return g;
  }
  function textField(label, value, max, onInput, upper) {
    const g = el('div', 'clfield');
    const id = 'cl' + label.replace(/\W/g, '');
    const l = el('label', 'label', label); l.htmlFor = id;
    const inp = el('input');
    inp.id = id; inp.type = 'text'; inp.maxLength = max; inp.value = value; inp.autocomplete = 'off';
    inp.addEventListener('input', () => {
      if (upper) inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      onInput(inp.value); drawPreview();
    });
    g.append(l, inp);
    return g;
  }
  function section(title, ...fields) {
    const s = el('fieldset', 'clsec');
    s.append(el('legend', '', title), ...fields);
    return s;
  }
  function renderClub() {
    const c = draft, form = $('clForm');
    const focusId = document.activeElement && document.activeElement.id;
    form.innerHTML = '';
    form.append(section('Nome',
      textField('Nome del club', c.name, 20, v => { c.name = v; }),
      textField('Sigla (3 lettere)', c.short, 3, v => { c.short = v; }, true)));
    form.append(section('Prima maglia',
      swatches('Colore', c.kit.home.shirt, v => { c.kit.home.shirt = v; }),
      swatches('Dettagli', c.kit.home.trim, v => { c.kit.home.trim = v; }),
      swatches('Calzettoni', c.kit.home.socks, v => { c.kit.home.socks = v; }),
      choice('Motivo', PATTERNS, c.kit.home.pattern, v => { c.kit.home.pattern = v; })));
    form.append(section('Seconda maglia',
      swatches('Colore', c.kit.away.shirt, v => { c.kit.away.shirt = v; }),
      swatches('Dettagli', c.kit.away.trim, v => { c.kit.away.trim = v; }),
      swatches('Calzettoni', c.kit.away.socks, v => { c.kit.away.socks = v; }),
      choice('Motivo', PATTERNS, c.kit.away.pattern, v => { c.kit.away.pattern = v; }),
      swatches('Maglia del portiere', c.gk, v => { c.gk = v; })));
    form.append(section('Stemma',
      choice('Forma', CREST_SHAPES, c.crest.shape, v => { c.crest.shape = v; }),
      choice('Sfondo', CREST_FILLS, c.crest.fill, v => { c.crest.fill = v; }),
      swatches('Colore principale', c.crest.c1, v => { c.crest.c1 = v; }),
      swatches('Secondo colore', c.crest.c2, v => { c.crest.c2 = v; }),
      choice('Simbolo', CREST_SYMBOLS, c.crest.symbol, v => { c.crest.symbol = v; }),
      swatches('Colore del simbolo', c.crest.sc, v => { c.crest.sc = v; })));
    if (clubMode === 'create') {
      form.append(section('Partite',
        choice('Difficoltà', Object.entries(DIFFS).map(([v, d]) => [v, d.label]), c.diff, v => { c.diff = v; }),
        choice('Durata', LENGTHS.map(l => [l.v, l.label]), c.len, v => { c.len = v; })));
    }
    if (focusId) { const f = document.getElementById(focusId); if (f && f.tagName === 'INPUT') { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
    drawPreview();
  }
  function drawPreview() {
    const c = draft;
    $('clCrest').innerHTML = crestSVG(c.crest, c.short || '???');
    const cv = $('clCanvas'), ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = 240, h = 120;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2b6b37'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#30773d'; ctx.fillRect(0, 0, w / 3, h); ctx.fillRect(2 * w / 3, 0, w / 3, h);
    const kits = [[c.kit.home, 'field'], [c.kit.away, 'field'], [c.kit.home, 'gk']];
    kits.forEach(([kit, role], i) => {
      const p = {
        team: { kit, gkShirt: c.gk }, role: role === 'gk' ? 'gk' : 'mid', i,
        x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: -1, anim: 0, jump: 0, kickAnim: 0, celebrate: false, state: 'ok',
        skin: SKINS[i + 1], hair: HAIRS[i]
      };
      ctx.save();
      ctx.translate(40 + i * 80, 64); ctx.scale(2.6, 2.6);
      drawPlayer(ctx, p);
      ctx.restore();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `600 11px ${BODY}`; ctx.textAlign = 'center';
    ['Casa', 'Trasferta', 'Portiere'].forEach((t, i) => ctx.fillText(t, 40 + i * 80, 112));
  }
  function saveClub() {
    const c = draft;
    c.name = (c.name || '').trim().slice(0, 20) || 'Notturna FC';
    c.short = (c.short || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'NOT';
    const { diff, len } = c;
    delete c.diff; delete c.len;
    const save = U.save();
    if (clubMode === 'create' || !save.league) save.league = newLeague(c, diff, len);
    else save.league.club = c;
    U.persist();
    open();
  }
  function cancelClub() { if (L()) open(); else U.toMenu(); }
  function askReset(on) { resetAsk = on; renderHub(); }
  function reset() { U.save().league = null; U.persist(); resetAsk = false; openClub('create'); }

  function init(api) {
    U = api;
    $('lgSquad').addEventListener('click', openSquad);
    $('lgMarket').addEventListener('click', openMarket);
    $('lgClub').addEventListener('click', () => openClub('edit'));
    $('lgMenu').addEventListener('click', () => U.toMenu());
    $('lgReset').addEventListener('click', () => askReset(true));
    $('lgResetNo').addEventListener('click', () => askReset(false));
    $('lgResetYes').addEventListener('click', reset);
    $('sqBack').addEventListener('click', open);
    $('mkBack').addEventListener('click', open);
    $('clSave').addEventListener('click', saveClub);
    $('clCancel').addEventListener('click', cancelClub);
  }

  return { init, open, recordMatch, clubDef, note: () => (L() && L().last) || null, exists: () => !!L(), MD };
})();
