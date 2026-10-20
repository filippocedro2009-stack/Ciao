'use strict';
// Modalità online. Sala d'attesa e partite in tempo reale con la capability "room" (solo presence:
// funziona per chiunque possa aprire la pagina), classifica Elo con la capability "db".
// In partita chi lancia la sfida fa da arbitro: simula tutto e manda lo stato; l'altro manda i comandi.
const Net = (() => {
  const RANK = 'ranking';
  const START = 1000;
  const TIERS = [
    { min: 1500, name: 'Campione', col: '#f4c64f' },
    { min: 1350, name: 'Platino', col: '#9fd8e8' },
    { min: 1200, name: 'Oro', col: '#e8b93a' },
    { min: 1050, name: 'Argento', col: '#c9d1d6' },
    { min: 900, name: 'Bronzo', col: '#cd8a54' },
    { min: -1e9, name: 'Esordiente', col: '#8fa49a' }
  ];
  const PH = ['set', 'play', 'dead', 'goal', 'replay', 'break', 'idle'];
  const SPT = ['kickoff', 'throw', 'corner', 'goalkick', 'freekick', 'penalty'];
  const tierOf = r => TIERS.find(t => r >= t.min);
  const now = () => performance.now();
  const rid = () => Array.from({ length: 10 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[(Math.random() * 33) | 0]).join('');

  const S = {
    tried: false, room: null, db: null, user: null, uid: null, myPeer: null,
    me: null, writeOk: null, wq: Promise.resolve(),
    team: 'lido', len: 240, lobbyOn: false,
    challenge: null, answer: null, incoming: null, declined: new Set(), notice: '',
    peers: [], names: {}, match: null, lbUnsub: null
  };
  let UI = null;

  // ---------- avvio ----------
  async function init(ui) {
    UI = ui;
    if (!window.claude || typeof window.claude.use !== 'function') { S.tried = true; UI.netChanged(); return; }
    try {
      const [room, db, user] = await Promise.all([
        window.claude.use('room'), window.claude.use('db'), window.claude.use('user')
      ]);
      S.room = room; S.db = db; S.user = user;
      if (user) S.uid = await user.id();
      if (room) room.onPeers(onLobbyPeers, () => { S.room = null; UI.netChanged(); });
      if (db && S.uid) await loadMe();
    } catch (e) { /* online non disponibile in questa vista */ }
    if (!S.me) S.me = blank();
    S.tried = true;
    UI.netChanged();
  }

  // ---------- classifica ----------
  function blank() {
    return { rating: START, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: '', team: S.team, pending: null, updated: 0 };
  }
  async function loadMe() {
    try {
      const snap = await S.db.doc(`${RANK}/${S.uid}`).get();
      S.me = snap.exists ? Object.assign(blank(), snap.data()) : blank();
      if (S.me.team && TEAMS.some(t => t.id === S.me.team)) S.team = S.me.team;
      if (S.me.pending) {
        // l'ultima partita è stata abbandonata: la sconfitta resta registrata
        S.me = Object.assign({}, S.me, { pending: null });
        saveMe(S.me);
      }
    } catch (e) { S.me = blank(); }
  }
  function saveMe(data) {
    if (!S.db || !S.uid) return Promise.resolve(false);
    // una scrittura alla volta sullo stesso documento
    S.wq = S.wq.then(() => S.db.doc(`${RANK}/${S.uid}`).set(data).then(() => { S.writeOk = true; return true; }, () => { S.writeOk = false; return false; }));
    return S.wq;
  }
  function applyResult(base, oppR, score, gf, ga) {
    const E = 1 / (1 + Math.pow(10, (oppR - base.rating) / 400));
    const K = base.played < 10 ? 40 : 28;
    const mark = score === 1 ? 'V' : score === 0.5 ? 'N' : 'P';
    return Object.assign({}, base, {
      rating: Math.round(base.rating + K * (score - E)),
      played: base.played + 1,
      w: base.w + (score === 1 ? 1 : 0), d: base.d + (score === 0.5 ? 1 : 0), l: base.l + (score === 0 ? 1 : 0),
      gf: base.gf + gf, ga: base.ga + ga,
      form: (mark + (base.form || '')).slice(0, 5),
      team: S.team, updated: Date.now()
    });
  }
  function watchBoard(cb) {
    unwatchBoard();
    if (!S.db) { cb(null); return; }
    S.lbUnsub = S.db.collection(RANK).orderBy('rating', 'desc').limit(60).onSnapshot(async snap => {
      const rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(r => r.played > 0);
      let ps = {};
      if (S.user && rows.length) { try { ps = await S.user.profiles(rows.map(r => r.id)); } catch (e) { ps = {}; } }
      cb(rows.map(r => Object.assign(r, { name: (ps[r.id] && ps[r.id].name) || 'Giocatore', me: r.id === S.uid })));
    }, () => cb(null));
  }
  function unwatchBoard() { if (S.lbUnsub) { S.lbUnsub(); S.lbUnsub = null; } }

  // ---------- sala d'attesa ----------
  function myRating() { return S.me ? S.me.rating : START; }
  function lobbyPresence() {
    if (!S.room) return;
    const cn = S.lobbyOn ? {
      v: 1, team: S.team, r: myRating(), busy: S.match ? 1 : 0,
      ch: S.challenge ? { to: S.challenge.to, id: S.challenge.id, len: S.challenge.len } : null,
      ans: S.answer
    } : null;
    S.room.presence({ cn }).catch(() => {});
  }
  function openLobby() { S.lobbyOn = true; S.notice = ''; lobbyPresence(); UI.netChanged(); }
  function closeLobby() {
    S.lobbyOn = false; S.challenge = null; S.answer = null; S.incoming = null;
    lobbyPresence();
  }
  function setTeam(id) { S.team = id; lobbyPresence(); }
  function setLen(v) { S.len = v; }

  function resolveNames(peers) {
    if (!S.user) return;
    const ids = peers.map(p => p.by).filter(b => b && !(b in S.names));
    if (!ids.length) return;
    for (const id of ids) S.names[id] = '';
    S.user.profiles(ids).then(ps => {
      for (const id of ids) S.names[id] = (ps[id] && ps[id].name) || '';
      UI.netChanged();
    }).catch(() => {});
  }
  const nameOf = by => (by && S.names[by]) || 'Giocatore';

  function onLobbyPeers(change) {
    const me = change.peers.find(p => p.sameTab);
    if (me) S.myPeer = me.peer;
    S.peers = change.peers.filter(p => !p.isMe && p.kind === 'viewer' && p.presence && p.presence.cn && p.presence.cn.v === 1);
    resolveNames(S.peers);
    if (!S.match) {
      // una sfida per me?
      const inc = S.peers.find(p => p.presence.cn.ch && p.presence.cn.ch.to === S.myPeer && !S.declined.has(p.presence.cn.ch.id));
      S.incoming = inc && S.lobbyOn ? { peer: inc.peer, by: inc.by, id: String(inc.presence.cn.ch.id), len: inc.presence.cn.ch.len, team: inc.presence.cn.team, r: inc.presence.cn.r } : null;
      // risposta alla mia sfida?
      if (S.challenge) {
        const t = S.peers.find(p => p.peer === S.challenge.to);
        const ans = t && t.presence.cn.ans;
        if (!t) { S.challenge = null; S.notice = 'Il giocatore sfidato è uscito dalla sala.'; lobbyPresence(); }
        else if (ans && ans.to === S.myPeer && ans.id === S.challenge.id) {
          const id = S.challenge.id, len = S.challenge.len;
          S.challenge = null;
          if (ans.ok) startMatch('host', t, id, len);
          else { S.notice = `${nameOf(t.by)} ha rifiutato la sfida.`; lobbyPresence(); }
        }
      }
    }
    UI.netChanged();
  }
  function challenge(peer) {
    if (!S.room || S.match || S.challenge) return;
    const t = S.peers.find(p => p.peer === peer);
    if (!t || t.presence.cn.busy) return;
    S.challenge = { to: peer, id: rid(), len: S.len, at: now() };
    S.answer = null; S.notice = '';
    lobbyPresence(); UI.netChanged();
  }
  function cancelChallenge() { S.challenge = null; lobbyPresence(); UI.netChanged(); }
  function accept() {
    const inc = S.incoming;
    if (!inc || S.match) return;
    const t = S.peers.find(p => p.peer === inc.peer);
    if (!t) { S.incoming = null; UI.netChanged(); return; }
    S.answer = { to: inc.peer, id: inc.id, ok: 1 };
    S.challenge = null;
    startMatch('guest', t, inc.id, inc.len);
  }
  function decline() {
    const inc = S.incoming;
    if (!inc) return;
    S.declined.add(inc.id);
    S.answer = { to: inc.peer, id: inc.id, ok: 0 };
    S.incoming = null;
    lobbyPresence(); UI.netChanged();
  }

  // ---------- partita ----------
  async function startMatch(role, opp, id, len) {
    const cn = opp.presence.cn;
    const m = S.match = {
      id, role, len: LENGTHS.some(l => l.v === len) ? len : 240, room: null, started: false, done: false,
      opp: { peer: opp.peer, by: opp.by, team: TEAMS.some(t => t.id === cn.team) ? cn.team : 'lupi', r: Number(cn.r) || START },
      joinedAt: now(), lastSeen: now(), lastSnapAt: now(), seq: 0, lastQ: 0, tickN: -1,
      cnt: null, pc: 0, lc: 0, sc: 0, lastIn: '', lastPhase: null, ranked: false, base: null, end: null
    };
    S.incoming = null;
    lobbyPresence();
    UI.netStatus('Collegamento alla partita…');
    try { m.room = await S.room.join('cn-' + id); }
    catch (e) { endWithError('Non riesco ad aprire la partita. Riprova tra poco.'); return; }
    if (S.match !== m) { m.room.leave().catch(() => {}); return; }
    m.room.presence({ hello: { role, team: S.team, r: myRating() } }).catch(() => {});
    m.room.onPeers(ch => onMatchPeers(m, ch), () => { if (S.match === m && !m.done) endWithError('La connessione alla partita si è interrotta.'); });
  }
  function oppPeer(m, peers) { return (peers || m.room.peers()).find(p => p.peer === m.opp.peer); }
  function onMatchPeers(m, ch) {
    if (S.match !== m) return;
    const o = oppPeer(m, ch.peers);
    if (!o) return;
    m.lastSeen = now();
    const pr = o.presence || {};
    if (m.role === 'host') {
      if (!m.started && pr.hello) hostStart(m);
      if (m.started && Array.isArray(pr.i)) readInput(m, pr.i);
    } else if (pr.s && typeof pr.s === 'object') {
      applySnap(m, pr.s);
    }
  }
  function oppLabel(m) { return `${nameOf(m.opp.by)} (${teamById(m.opp.team).short})`; }
  function hostStart(m) {
    m.started = true;
    m.remote = { x: 0, y: 0, shoot: false, sprint: false, passE: false, lobE: false, shootE: false, anyE: false };
    newMatch({ home: S.team, away: m.opp.team, mode: 'online', len: m.len, user: 0, inputs: [IN, m.remote] });
    afterStart(m);
  }
  function guestStart(m) {
    m.started = true;
    newMatch({ home: m.opp.team, away: S.team, mode: 'online', len: m.len, user: 1, noStart: true });
    G.phase = 'set';
    afterStart(m);
  }
  function afterStart(m) {
    G.netInfo = { left: `Tu (${teamById(S.team).short})`, right: oppLabel(m), lag: 0 };
    beginRanked(m);
    UI.enterMatch();
    lobbyPresence();
  }
  function beginRanked(m) {
    m.base = Object.assign(blank(), S.me || {});
    m.ranked = !!(S.db && S.uid);
    if (!m.ranked) return;
    // la sconfitta viene scritta subito: se chiudi la pagina a metà partita, resta
    const pending = applyResult(m.base, m.opp.r, 0, 0, 0);
    pending.pending = { id: m.id };
    saveMe(pending);
  }
  function finishRanked(m, score, gf, ga) {
    if (m.end) return m.end;
    let final = null;
    if (m.ranked) {
      final = applyResult(m.base, m.opp.r, score, gf, ga);
      final.pending = null;
      S.me = final;
      saveMe(final);
    }
    m.end = { score, gf, ga, before: m.base.rating, after: final ? final.rating : m.base.rating, ranked: m.ranked, record: final };
    return m.end;
  }

  // ---------- comandi dell'avversario (arbitro) ----------
  function readInput(m, i) {
    const r = m.remote;
    r.x = clamp((Number(i[0]) || 0) / 100, -1, 1); r.y = clamp((Number(i[1]) || 0) / 100, -1, 1);
    const f = Number(i[2]) || 0;
    r.shoot = !!(f & 1); r.sprint = !!(f & 2);
    const c = [i[3], i[4], i[5]].map(v => Number(v) || 0);
    if (m.cnt) {
      if (c[0] !== m.cnt[0]) r.passE = true;
      if (c[1] !== m.cnt[1]) r.lobE = true;
      if (c[2] !== m.cnt[2]) r.shootE = true;
    }
    m.cnt = c;
  }

  // ---------- stato della partita ----------
  function encodeSnap(m) {
    const b = G.ball, ps = G.players, idx = p => p ? ps.indexOf(p) : -1;
    const P = [];
    for (const p of ps) {
      const st = (p.celebrate ? 4 : Math.max(0, STATES.indexOf(p.state))) + (p.jump > 0 ? 8 : 0) + (p.kickAnim > 0 ? 16 : 0) + (p.diveDir > 0 ? 32 : 0);
      P.push(Math.round(p.x), Math.round(p.y), Math.round(Math.atan2(p.fy, p.fx) * 100), Math.round(Math.hypot(p.vx, p.vy)), st, Math.round(p.stamina * 20));
    }
    const last = G.ticker[G.ticker.length - 1];
    const s = {
      q: ++m.seq, ph: PH.indexOf(G.phase), k: Math.round(G.clock * 10), h: G.half,
      sc: [G.teams[0].score, G.teams[1].score], d: G.teams[0].dir,
      b: [Math.round(b.x), Math.round(b.y), Math.round(b.z), Math.round(b.vx), Math.round(b.vy), idx(b.owner)],
      p: P,
      c: [idx(G.hs[0].ctrl), idx(G.hs[1].ctrl)],
      g: G.hs.map(h => h.charging ? Math.round(h.charge * 100) : -1),
      t: [G.tickN, last ? last.text : '']
    };
    if (G.sp) s.sp = [SPT.indexOf(G.sp.type), G.sp.ti, Math.round(G.sp.x), Math.round(G.sp.y), idx(G.sp.taker)];
    if (G.phase === 'goal' && G.goalInfo) s.gi = [G.goalInfo.ti, idx(G.goalInfo.scorer), G.goalInfo.own ? 1 : 0, G.goalInfo.minute];
    if (G.shootout) {
      const so = G.shootout, enc = k => k.map(v => v ? 1 : 0).join('');
      s.so = [enc(so.kicks[0]), enc(so.kicks[1]), so.turn, so.done ? 1 : 0, so.winner === null ? -1 : so.winner];
    }
    if (G.netKick && G.netKick.t < 2.5) s.nk = [G.netKick.x, Math.round(G.netKick.y), Math.round(G.netKick.t * 100)];
    if (G.shake > 0.05) s.sk = Math.round(G.shake * 100);
    if (G.phase === 'break') {
      s.st = G.stats.map(x => [x.shots, x.onTarget, x.passes, x.passOk, x.corners, x.fouls, x.poss, x.saves]);
      s.pt = Math.round(G.phaseT * 10);
      if (G.result) s.rs = G.result.winner;
    }
    return s;
  }
  function applySnap(m, s) {
    if (!(s.q > m.lastQ) || !Array.isArray(s.p) || s.p.length !== 6 * FORM.length * 2) return;
    m.lastQ = s.q; m.lastSnapAt = now();
    if (!m.started) guestStart(m);
    const prevPhase = G.phase, prevScore = G.teams.map(t => t.score);
    const prevSpeed = Math.hypot(G.ball.vx, G.ball.vy);
    G.phase = PH[s.ph] || 'play';
    G.clock = (Number(s.k) || 0) / 10; G.half = s.h === 2 ? 2 : 1;
    G.teams[0].score = Number(s.sc[0]) || 0; G.teams[1].score = Number(s.sc[1]) || 0;
    G.teams[0].dir = s.d < 0 ? -1 : 1; G.teams[1].dir = -G.teams[0].dir;
    const ps = G.players;
    ps.forEach((p, k) => {
      const o = k * 6, st = s.p[o + 4] | 0;
      p.tx = s.p[o]; p.ty = s.p[o + 1]; p.ta = s.p[o + 2] / 100; p.tsp = s.p[o + 3];
      const code = st & 7;
      p.celebrate = code === 4;
      p.state = code === 4 ? 'ok' : STATES[code] || 'ok';
      if (st & 8 && p.jump <= 0) p.jump = 0.35;
      if (st & 16 && p.kickAnim <= 0) p.kickAnim = 0.22;
      p.diveDir = st & 32 ? 1 : -1;
      p.stamina = (s.p[o + 5] || 0) / 20;
      if (p.x === undefined || Number.isNaN(p.x)) { p.x = p.tx; p.y = p.ty; }
    });
    const b = G.ball;
    b.tx = s.b[0]; b.ty = s.b[1]; b.z = Math.max(0, s.b[2] || 0); b.vx = s.b[3] || 0; b.vy = s.b[4] || 0;
    b.owner = ps[s.b[5]] || null;
    G.hs[0].ctrl = ps[s.c[0]] || null; G.hs[1].ctrl = ps[s.c[1]] || null;
    G.hs.forEach((h, i) => { const g = s.g ? s.g[i] : -1; h.charging = g >= 0; h.charge = Math.max(0, g) / 100; });
    if (Array.isArray(s.t) && s.t[0] !== m.tickN) {
      m.tickN = s.t[0];
      if (s.t[1]) { G.ticker.push({ text: String(s.t[1]).slice(0, 120), t: G.time }); if (G.ticker.length > 3) G.ticker.shift(); tickerSound(String(s.t[1])); }
    }
    G.sp = s.sp ? { type: SPT[s.sp[0]] || 'kickoff', ti: s.sp[1], x: s.sp[2], y: s.sp[3], taker: ps[s.sp[4]] || null, t: 1 } : null;
    if (s.gi) {
      const key = s.gi.join();
      if (!G.goalInfo || G.goalInfo.key !== key) G.goalInfo = { ti: s.gi[0], scorer: ps[s.gi[1]] || null, own: !!s.gi[2], minute: s.gi[3], t: G.time, key };
    } else if (G.phase !== 'goal') G.goalInfo = null;
    if (s.so) {
      const dec = str => String(str).split('').map(c => c === '1');
      G.shootout = { kicks: [dec(s.so[0]), dec(s.so[1])], turn: s.so[2], done: !!s.so[3], winner: s.so[4] < 0 ? null : s.so[4] };
    } else G.shootout = null;
    if (s.nk && (!G.netKick || Math.abs(G.netKick.t - s.nk[2] / 100) > 0.4)) G.netKick = { x: s.nk[0], y: s.nk[1], t: s.nk[2] / 100 };
    if (s.sk) G.shake = Math.max(G.shake, s.sk / 100);
    if (s.st) G.stats = s.st.map(a => ({ shots: a[0], onTarget: a[1], passes: a[2], passOk: a[3], corners: a[4], fouls: a[5], poss: a[6], saves: a[7] }));
    if (s.pt !== undefined) G.phaseT = s.pt / 10;
    G.result = s.rs !== undefined ? { winner: s.rs } : null;
    // effetti che il simulatore produrrebbe in locale
    const scored = [0, 1].find(i => G.teams[i].score > prevScore[i]);
    if (scored !== undefined) { Sound.roar(); Sound.net(); confetti(b.tx < CX ? 20 : FW - 20, CY, G.teams[scored]); }
    if (G.shootout && G.phase === 'goal' && prevPhase !== 'goal') { Sound.roar(); Sound.net(); confetti(FW - 20, CY, G.teams[G.shootout.turn]); }
    if (prevPhase !== G.phase) {
      if (G.phase === 'dead' && prevPhase === 'play') Sound.whistle(1);
      if (G.phase === 'break') Sound.whistle(G.half === 1 ? 2 : 3, true);
      if (G.phase === 'set' && G.sp && G.sp.type === 'kickoff') Sound.whistle(1);
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (!b.owner && sp > prevSpeed + 220 && G.phase === 'play') Sound.kick(sp);
  }
  function tickerSound(t) {
    if (/Palo|Traversa/.test(t)) Sound.post();
    else if (/Parata|Respinge|sbagliato|soffio|rigore!/i.test(t)) Sound.ooh();
  }
  function guestStep(dt) {
    G.time += dt;
    updateParts(dt);
    G.shake = Math.max(0, G.shake - dt * 2.2);
    if (G.netKick) G.netKick.t += dt;
    const k = 1 - Math.exp(-dt * 16);
    for (const p of G.players) {
      if (p.tx === undefined) continue;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 160) { p.x = p.tx; p.y = p.ty; } else { p.x += dx * k; p.y += dy * k; }
      p.fx = Math.cos(p.ta); p.fy = Math.sin(p.ta);
      p.vx = p.fx * p.tsp; p.vy = p.fy * p.tsp;
      p.anim += p.tsp * dt * 0.085;
      p.jump = Math.max(0, p.jump - dt); p.kickAnim = Math.max(0, p.kickAnim - dt);
    }
    const b = G.ball;
    if (b.tx !== undefined) {
      // il pallone continua sulla sua traiettoria tra un aggiornamento e l'altro
      if (!b.owner && G.phase === 'play') { b.tx += b.vx * dt; b.ty += b.vy * dt; }
      const dx = b.tx - b.x, dy = b.ty - b.y;
      if (Math.abs(dx) + Math.abs(dy) > 140) { b.x = b.tx; b.y = b.ty; }
      else { const kb = 1 - Math.exp(-dt * 22); b.x += dx * kb; b.y += dy * kb; }
      b.spin += Math.hypot(b.vx, b.vy) * dt / BR;
    }
    const me = G.hs[G.user];
    if (me && me.ctrl && b.owner === me.ctrl) {
      const l = Math.hypot(IN.x, IN.y);
      me.passHint = choosePassTarget(me.ctrl, l > 0.2 ? IN.x / l : me.ctrl.fx, l > 0.2 ? IN.y / l : me.ctrl.fy);
    } else if (me) me.passHint = null;
    const dg = Math.min(Math.hypot(b.x, b.y - CY), Math.hypot(FW - b.x, b.y - CY));
    G.excite = lerp(G.excite, G.phase === 'goal' ? 1 : clamp(1 - dg / 420, 0, 1), dt * 2);
  }
  function sendInput(m) {
    if (IN.passE) m.pc = (m.pc + 1) % 1000;
    if (IN.lobE) m.lc = (m.lc + 1) % 1000;
    if (IN.shootE) m.sc = (m.sc + 1) % 1000;
    IN.passE = IN.lobE = IN.shootE = IN.anyE = false;
    const i = [Math.round(IN.x * 100), Math.round(IN.y * 100), (IN.shoot ? 1 : 0) | (IN.sprint ? 2 : 0), m.pc, m.lc, m.sc];
    const key = i.join();
    if (key !== m.lastIn) { m.lastIn = key; m.room.presence({ i }).catch(() => {}); }
  }

  // ---------- ciclo per fotogramma ----------
  function frame(dt) {
    const m = S.match;
    if (S.challenge && now() - S.challenge.at > 30000) { S.challenge = null; S.notice = 'Nessuna risposta alla sfida.'; lobbyPresence(); UI.netChanged(); }
    if (!m || !m.room || m.done) return;
    const t = now();
    if (!m.started) {
      if (t - m.joinedAt > 15000) endWithError('L\'avversario non si è collegato alla partita.');
      return;
    }
    if (m.role === 'host') {
      m.room.presence({ s: encodeSnap(m) }).catch(() => {});
      G.netInfo.lag = oppPeer(m) ? 0 : (t - m.lastSeen) / 1000;
    } else {
      sendInput(m);
      guestStep(dt);
      G.netInfo.lag = (t - m.lastSnapAt) / 1000;
    }
    // l'avversario sparito per più di 8 secondi perde a tavolino
    if (oppPeer(m)) m.goneAt = null;
    else if (!m.goneAt) m.goneAt = t;
    else if (t - m.goneAt > 8000) return forfeitWin(m);
    // intervallo e fine partita, per entrambi i lati
    const phase = G.phase === 'break' ? (G.result ? 'end' : 'half') : 'live';
    if (phase !== m.lastPhase) {
      if (phase === 'half') UI.onlineHalf();
      else if (phase === 'end') finishNormal(m);
      else if (m.lastPhase === 'half') UI.show(null);
      m.lastPhase = phase;
    }
  }
  function finishNormal(m) {
    m.done = true;
    const mine = G.user, w = G.result.winner;
    const score = w === -1 ? 0.5 : w === mine ? 1 : 0;
    // il risultato arriva anche dopo qualche fotogramma all'avversario: resto nella stanza un attimo
    const end = finishRanked(m, score, G.teams[mine].score, G.teams[1 - mine].score);
    setTimeout(() => leaveMatch(m), 2500);
    UI.onlineEnd(Object.assign({ forfeit: false, opp: oppLabel(m) }, end));
  }
  function forfeitWin(m) {
    m.done = true;
    G.phase = 'break'; G.result = { winner: G.user };
    const end = finishRanked(m, 1, G.teams[G.user].score, G.teams[1 - G.user].score);
    leaveMatch(m);
    UI.onlineEnd(Object.assign({ forfeit: 'win', opp: oppLabel(m) }, end));
  }
  function quit() {
    const m = S.match;
    if (!m) return;
    m.done = true;
    if (m.ranked && !m.end) {
      // la sconfitta scritta all'inizio resta valida
      const lost = applyResult(m.base, m.opp.r, 0, 0, 0);
      lost.pending = null; S.me = lost; saveMe(lost);
    }
    leaveMatch(m);
  }
  function leaveMatch(m) {
    if (m.room) m.room.leave().catch(() => {});
    if (S.match === m) S.match = null;
    S.answer = null;
    G.netInfo = null;
    lobbyPresence();
  }
  function endWithError(msg) {
    const m = S.match;
    if (m) { m.done = true; if (m.room) m.room.leave().catch(() => {}); }
    S.match = null; S.answer = null; S.notice = msg;
    lobbyPresence();
    UI.backToLobby();
  }

  return {
    init, openLobby, closeLobby, challenge, cancelChallenge, accept, decline, setTeam, setLen, quit,
    watchBoard, unwatchBoard, frame, tierOf, START,
    isGuest: () => !!(S.match && S.match.role === 'guest' && S.match.started && !S.match.done),
    inMatch: () => !!(S.match && S.match.started && !S.match.done),
    state: () => ({
      tried: S.tried, online: !!S.room, ranked: !!(S.db && S.uid), writeOk: S.writeOk,
      me: S.me || blank(), team: S.team, len: S.len, notice: S.notice,
      peers: S.peers.map(p => ({ peer: p.peer, name: nameOf(p.by), guest: p.guest, team: p.presence.cn.team, r: Number(p.presence.cn.r) || START, busy: !!p.presence.cn.busy })),
      incoming: S.incoming ? Object.assign({ name: nameOf(S.incoming.by) }, S.incoming) : null,
      challenge: S.challenge ? Object.assign({ name: nameOf((S.peers.find(p => p.peer === S.challenge.to) || {}).by) }, S.challenge) : null,
      connecting: !!(S.match && !S.match.started)
    })
  };
})();
