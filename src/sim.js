'use strict';
// Stato dei comandi: riempito da ui.js. I campi che finiscono con E sono pressioni singole.
const IN = { x: 0, y: 0, shoot: false, sprint: false, passE: false, lobE: false, shootE: false, anyE: false };

const G = {
  mode: 'attract', phase: 'idle', phaseT: 0, paused: false, time: 0,
  // user: la squadra di chi guarda; humans: le squadre guidate da persone; hs: stato di controllo per squadra
  teams: [], players: [], ball: null, user: null, humans: [], hs: [mkHS(IN), mkHS(IN)],
  clock: 0, len: 240, half: 1, firstKick: 0, diff: 'normale', tickN: 0,
  sp: null, next: null,
  stats: [], ticker: [], parts: [], rec: [], recGoal: 0, replay: null, goalInfo: null,
  shake: 0, netKick: null, excite: 0, shootout: null, chase: [null, null], chase2: [null, null],
  cards: 0, hooks: {}
};

const STATES = ['ok', 'slide', 'down', 'dive', 'cele'];

function mkHS(inp) { return { ctrl: null, charging: false, charge: 0, passHint: null, lockT: 0, pressT: 0, inp }; }
const isHuman = ti => G.humans.includes(ti);
const isCtrl = p => isHuman(p.ti) && G.hs[p.ti].ctrl === p;
// il giocatore che guida chi guarda lo schermo
const localCtrl = () => G.user !== null && G.hs[G.user] ? G.hs[G.user].ctrl : null;

// ---------- utilità di squadra ----------
const tX = (team, x) => team.dir > 0 ? x : FW - x;
const ownGoalX = team => team.dir > 0 ? 0 : FW;
const oppGoalX = team => team.dir > 0 ? FW : 0;
function inBox(team, x, y) {
  const t = tX(team, x);
  return t >= -20 && t <= BOX_D && Math.abs(y - CY) <= BOX_W / 2;
}
function say(text) {
  G.tickN++;
  G.ticker.push({ text, t: G.time });
  if (G.ticker.length > 3) G.ticker.shift();
}
function mates(p) { return G.players.filter(q => q.ti === p.ti && q !== p); }
function foes(p) { return G.players.filter(q => q.ti !== p.ti); }
function nearestFoeDist(p) {
  let d = 1e9;
  for (const o of G.players) if (o.ti !== p.ti) d = Math.min(d, dist(o, p));
  return d;
}
function laneBlocked(x1, y1, x2, y2, ti, r) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  for (const o of G.players) {
    if (o.ti === ti) continue;
    const t = clamp(((o.x - x1) * dx + (o.y - y1) * dy) / l2, 0, 1);
    if (Math.hypot(x1 + dx * t - o.x, y1 + dy * t - o.y) < r) return true;
  }
  return false;
}
// stima se un avversario arriva sulla traiettoria prima del pallone
function passSpeed(d) { return clamp(Math.sqrt(260 * 260 + 2 * ROLL * d), 320, 900); }
function passSafe(p, tx, ty) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, v0 = passSpeed(d);
  const avg = (v0 + Math.sqrt(Math.max(0, v0 * v0 - 2 * ROLL * d))) / 2;
  for (const o of G.players) {
    if (o.ti === p.ti || o.state !== 'ok') continue;
    const t = clamp(((o.x - p.x) * dx + (o.y - p.y) * dy) / (d * d), 0, 0.88);
    const r = Math.hypot(p.x + dx * t - o.x, p.y + dy * t - o.y);
    const ballT = t * d / avg;
    if ((r - PR - BR) / o.speed + 0.12 < ballT || r < PR + BR + 6) return false;
  }
  return true;
}
function leadPoint(q, lob) {
  const lead = lob ? 0.55 : 0.4;
  return { x: clamp(q.x + q.vx * lead, -10, FW + 10), y: clamp(q.y + q.vy * lead, 10, FH - 10) };
}
function minuteNow() {
  const h = G.len / 2;
  const m = G.half === 1 ? G.clock / h * 45 : 45 + (G.clock - h) / h * 45;
  return Math.min(G.half === 1 ? 45 : 90, Math.floor(m) + 1);
}

// ---------- creazione partita ----------
function makeTeam(def, idx, kitName, skill) {
  return { def, idx, kit: def[kitName], gkShirt: def.gk, dir: idx === 0 ? 1 : -1, score: 0, skill };
}
function makeStats() { return { shots: 0, onTarget: 0, passes: 0, passOk: 0, corners: 0, fouls: 0, poss: 0, saves: 0 }; }

function makePlayers() {
  G.players = [];
  for (const team of G.teams) {
    const rng = seeded(hashStr(team.def.id) + 11);
    const names = shuffle(SURNAMES, rng);
    FORM.forEach((f, i) => {
      const sk = team.skill;
      G.players.push({
        team, ti: team.idx, i, role: f.role, n: f.n, name: names[i], hx: f.x, hy: f.y,
        x: tX(team, f.x), y: f.y, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: team.dir, fy: 0,
        kickCd: 0, immune: 0, hold: 0, think: rnd(0.4), stamina: 1, sprinting: false,
        state: 'ok', stateT: 0, anim: rnd(6), jump: 0, kickAnim: 0, celebrate: false, diveAt: -1, pen: null,
        runT: rnd(1, 4), runTo: null,
        speed: 176 * (0.88 + 0.14 * sk) * (f.role === 'att' ? 1.04 : f.role === 'gk' ? 0.95 : 1),
        tackleP: 0.014 + 0.034 * sk, thinkInt: clamp(0.62 - 0.32 * sk, 0.2, 0.5),
        save: clamp(0.4 + 0.44 * sk, 0.38, 0.93), skill: sk,
        skin: SKINS[(rng() * SKINS.length) | 0], hair: HAIRS[(rng() * HAIRS.length) | 0]
      });
    });
  }
}

function newMatch(o) {
  const A = teamById(o.home), B = teamById(o.away);
  const clash = colorDist(A.home.shirt, B.home.shirt) < 130;
  const attract = o.mode === 'attract', online = o.mode === 'online';
  const skA = attract ? 0.86 + (A.rating - 3) * 0.05 : 0.9 + (A.rating - 3) * 0.05;
  const skB = (attract ? 0.86 : online ? 0.9 : DIFFS[o.diff].skill) + (B.rating - 3) * 0.05;
  G.teams = [makeTeam(A, 0, 'home', skA), makeTeam(B, 1, clash ? 'away' : 'home', skB)];
  G.mode = o.mode; G.diff = o.diff || 'normale'; G.len = o.len;
  G.user = attract ? null : o.user !== undefined ? o.user : 0;
  G.humans = attract ? [] : online ? [0, 1] : [0];
  G.hs = [mkHS(o.inputs ? o.inputs[0] : IN), mkHS(o.inputs ? o.inputs[1] : IN)];
  G.stats = [makeStats(), makeStats()];
  G.clock = 0; G.half = 1; G.ticker = []; G.parts = []; G.rec = []; G.replay = null;
  G.shootout = null; G.goalInfo = null; G.sp = null; G.next = null;
  G.netKick = null; G.paused = false; G.cards = 0; G.result = null; G.forfeit = null;
  G.ball = { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0, owner: null, target: null, lastTouch: null,
    passFrom: null, shot: null, spin: 0, ang: 0, trail: [] };
  makePlayers();
  G.firstKick = Math.random() < 0.5 ? 0 : 1;
  if (o.noStart) return;
  if (o.mode === 'shootout') {
    say('Sfida ai rigori: cinque tiri a testa');
    startShootout();
  } else {
    setPiece('kickoff', G.firstKick);
    say(`${A.name} contro ${B.name}`);
    Sound.whistle(1, true);
  }
}

// ---------- palla: tocchi e calci ----------
function release(p) {
  const b = G.ball;
  b.owner = null; b.target = null; b.passFrom = null; b.shot = null; b.lastTouch = p;
  p.kickCd = 0.28; p.hold = 0; p.immune = 0;
  resetCharge();
}
function resetCharge() { for (const h of G.hs) { h.charging = false; h.charge = 0; } }
function kickBall(p, dx, dy, speed, vz) {
  const b = G.ball, l = Math.hypot(dx, dy) || 1;
  release(p);
  b.z = Math.max(0.5, b.z);
  b.vx = dx / l * speed; b.vy = dy / l * speed; b.vz = vz;
  p.fx = dx / l; p.fy = dy / l; p.kickAnim = 0.22;
  Sound.kick(speed);
  dust(b.x, b.y, speed > 700 ? 6 : 3);
}
function passTo(p, q, lob) {
  const { x: tx, y: ty } = leadPoint(q, lob);
  const d = Math.hypot(tx - p.x, ty - p.y);
  const throwIn = G.sp && G.sp.type === 'throw';
  if (lob) {
    const T = clamp(0.5 + d / 850, 0.65, 1.45);
    kickBall(p, tx - p.x, ty - p.y, Math.min(d / T, throwIn ? 520 : 900), GRAV * T / 2);
  } else {
    const speed = Math.min(passSpeed(d), throwIn ? 540 : 900);
    kickBall(p, tx - p.x, ty - p.y, speed, 0);
  }
  G.ball.target = q; G.ball.passFrom = p;
  G.stats[p.ti].passes++;
}
function passInto(p, ax, ay, lob) {
  if (lob) kickBall(p, ax, ay, 520, GRAV * 0.55);
  else kickBall(p, ax, ay, 470, 0);
  G.ball.passFrom = p;
  G.stats[p.ti].passes++;
}
function shootAt(p, dx, dy, power) {
  const speed = 520 + 620 * power;
  const vz = 25 + 430 * Math.pow(power, 2.6) + rnd(0, 25);
  kickBall(p, dx, dy, speed, vz);
  G.ball.shot = { team: p.ti, by: p };
  G.stats[p.ti].shots++;
  if (!G.shootout) say(`Tiro di ${p.name}!`);
}
function userShoot(p, power) {
  let ax = p.fx, ay = p.fy;
  const og = oppGoalX(p.team);
  if ((og - p.x) * ax > 0 && Math.abs(og - p.x) < 760) {
    const t = (og - p.x) / ax, yHit = p.y + ay * t;
    if (Math.abs(yHit - CY) < GH + 230) {
      const ty = clamp(yHit, CY - GH + 13, CY + GH - 13);
      let gx = og - p.x, gy = ty - p.y;
      const l = Math.hypot(gx, gy); gx /= l; gy /= l;
      ax = lerp(ax, gx, 0.8); ay = lerp(ay, gy, 0.8);
    }
  }
  const err = power * power * 0.075 * (1.25 - p.skill);
  const a = Math.atan2(ay, ax) + rnd(-err, err);
  shootAt(p, Math.cos(a), Math.sin(a), power);
}
function aiShoot(p) {
  const og = oppGoalX(p.team);
  const gk = G.players.find(q => q.ti !== p.ti && q.role === 'gk');
  let side = gk ? (gk.y > CY ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
  if (Math.random() < 0.22) side = -side;
  const err = (1.15 - p.skill) * 55;
  const ty = CY + side * (GH - 14 - rnd(20)) + rnd(-err, err);
  const d = Math.hypot(og - p.x, ty - p.y);
  const power = clamp(0.48 + d / 950 + rnd(0.2), 0.45, 0.93);
  shootAt(p, og - p.x, ty - p.y, power);
}
function take(p) {
  const b = G.ball;
  if (b.passFrom && b.passFrom.ti === p.ti && b.passFrom !== p) G.stats[p.ti].passOk++;
  b.owner = p; b.target = null; b.passFrom = null; b.shot = null; b.lastTouch = p;
  b.vx = b.vy = b.vz = 0; b.z = 0;
  p.hold = 0;
  p.immune = p.role === 'gk' && inBox(p.team, p.x, p.y) ? 99 : 0.45;
  p.think = p.thinkInt * 0.6;
  resetCharge();
}
function block(p) {
  const b = G.ball, d = Math.hypot(b.x - p.x, b.y - p.y) || 1;
  const nx = (b.x - p.x) / d, ny = (b.y - p.y) / d, dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
  b.vx *= 0.42; b.vy *= 0.42; b.vz = Math.abs(b.vz) * 0.3 + 30;
  b.x = p.x + nx * (PR + BR + 4); b.y = p.y + ny * (PR + BR + 4);
  if (b.shot && b.shot.team !== p.ti) say(`Tiro respinto da ${p.name}`);
  b.lastTouch = p; b.target = null; b.shot = null; b.passFrom = null;
  p.kickCd = 0.22;
  Sound.kick(260);
}
function parry(p) {
  const b = G.ball, s = Math.hypot(b.vx, b.vy), dir = p.team.dir;
  b.vx = dir * s * rnd(0.22, 0.42);
  b.vy = (b.y >= p.y ? 1 : -1) * s * rnd(0.3, 0.5);
  b.vz = rnd(90, 230);
  b.lastTouch = p; b.shot = null; b.target = null; b.passFrom = null;
  p.kickCd = 0.45;
  Sound.kick(520);
  G.shake = Math.max(G.shake, 0.25);
}
function header(p) {
  const b = G.ball, team = p.team, og = oppGoalX(team);
  p.jump = 0.35; p.kickCd = 0.45;
  const dG = Math.hypot(og - p.x, CY - p.y);
  let dx, dy, sp, vz, shot = false;
  if (dG < 400) {
    const ty = CY + rnd(-GH + 14, GH - 14);
    dx = og - p.x; dy = ty - p.y; sp = 430 + rnd(200) * p.skill; vz = rnd(-60, 70); shot = true;
  } else {
    dx = team.dir; dy = rnd(-0.7, 0.7); sp = 330 + rnd(150); vz = 120 + rnd(120);
  }
  const l = Math.hypot(dx, dy);
  b.vx = dx / l * sp; b.vy = dy / l * sp; b.vz = vz;
  b.lastTouch = p; b.target = null; b.passFrom = null; b.shot = shot ? { team: p.ti, by: p } : null;
  if (shot) { G.stats[p.ti].shots++; say(`Colpo di testa di ${p.name}!`); }
  Sound.head();
}

// ---------- contatti con la palla ----------
function contacts() {
  const b = G.ball, s = Math.hypot(b.vx, b.vy);
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (p.kickCd > 0 || p.state === 'down') continue;
    const hands = p.role === 'gk' && inBox(p.team, p.x, p.y);
    const reach = p.state === 'dive' ? PR + BR + 15 : hands ? PR + BR + 6 : PR + BR + 3;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < reach && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const p = best, hands = p.role === 'gk' && inBox(p.team, p.x, p.y);
  const zTop = hands ? (p.state === 'dive' ? 88 : 76) : 24;
  if (b.z > zTop) {
    if (!hands && b.z < 64 && s > 120 && p.state === 'ok') header(p);
    return;
  }
  if (p.state === 'slide') {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    b.vx = p.vx / sp * 300 + b.vx * 0.2; b.vy = p.vy / sp * 300 + b.vy * 0.2; b.vz = 40;
    b.lastTouch = p; b.target = null; b.shot = null; b.passFrom = null;
    p.kickCd = 0.5;
    Sound.kick(300); dust(b.x, b.y, 5);
    return;
  }
  if (hands) {
    // tuffo al limite: a volte il pallone passa oltre la punta delle dita
    if (p.state === 'dive' && bd > PR + BR + 7 && s > 450 && Math.random() < 0.3) { p.kickCd = 0.3; return; }
    const shot = b.shot && b.shot.team !== p.ti;
    const pc = s < 360 ? 1 : clamp(p.save * (1.32 - s / 1500), 0.12, 0.97);
    if (shot) { G.stats[b.shot.team].onTarget++; G.stats[p.ti].saves++; }
    if (Math.random() < pc) {
      take(p);
      if (shot) { say(`Parata di ${p.name}!`); Sound.ooh(); }
    } else {
      parry(p);
      if (shot) { say(`Respinge ${p.name}!`); Sound.ooh(); }
    }
    return;
  }
  const ctrl = b.target === p ? 780 : 380 + 120 * p.skill;
  if (s < ctrl) take(p); else block(p);
}

function tackles() {
  const b = G.ball, o = b.owner;
  if (o.immune > 0) return;
  for (const p of G.players) {
    if (p.ti === o.ti || p.kickCd > 0 || p.state === 'down' || p.state === 'dive') continue;
    const dBall = Math.hypot(p.x - b.x, p.y - b.y);
    if (p.state === 'slide') {
      if (dBall < PR + BR + 7) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        release(o); o.kickCd = 0.6;
        b.vx = p.vx / sp * 260; b.vy = p.vy / sp * 260; b.vz = 30; b.lastTouch = p;
        p.kickCd = 0.3;
        Sound.kick(300); dust(b.x, b.y, 6);
        say(`Scivolata pulita di ${p.name}`);
        return;
      }
      if (dist(p, o) < PR * 2 + 2) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const behind = (p.vx * o.fx + p.vy * o.fy) / sp > 0.35;
        if (Math.random() < (behind ? 0.85 : 0.45)) { foul(p, o, behind); return; }
      }
      continue;
    }
    const front = ((p.x - o.x) * o.fx + (p.y - o.y) * o.fy) / (dist(p, o) || 1) > 0.3;
    const guard = isCtrl(o) ? (G.mode === 'online' ? 0.55 : (DIFFS[G.diff] || DIFFS.normale).guard) : 1;
    if (dBall < PR + BR + 2 && Math.random() < p.tackleP * (front ? 1 : 0.45) * guard) {
      take(p); o.kickCd = 0.5;
      return;
    }
  }
}

function foul(p, o, behind) {
  const b = G.ball;
  G.stats[p.ti].fouls++;
  o.state = 'down'; o.stateT = 1.0; o.vx *= 0.3; o.vy *= 0.3;
  b.owner = null; b.vx = o.vx; b.vy = o.vy;
  const pen = inBox(p.team, o.x, o.y);
  say(`Fallo di ${p.name}!`);
  if (behind && Math.random() < 0.45) { say(`Cartellino giallo per ${p.name}`); G.cards = G.time; }
  Sound.whistle(1);
  const fx = clamp(o.x, 20, FW - 20), fy = clamp(o.y, 20, FH - 20), ti = o.ti;
  G.phase = 'dead'; G.phaseT = 1.4;
  G.next = pen ? () => setPiece('penalty', ti) : () => setPiece('freekick', ti, fx, fy);
  if (pen) { say('Calcio di rigore!'); Sound.ooh(); }
}

function doSlide(p, ax, ay) {
  if (p.state !== 'ok' || p.stamina < 0.12 || p.slideCd > 0) return;
  const l = Math.hypot(ax, ay) || 1;
  ax /= l; ay /= l;
  p.state = 'slide'; p.stateT = 0.42; p.slideCd = 0.8;
  p.vx = ax * p.speed * 2.05; p.vy = ay * p.speed * 2.05;
  p.fx = ax; p.fy = ay;
  p.stamina -= 0.1;
  dust(p.x, p.y, 5);
}

// ---------- fisica ----------
function cooldowns(dt) {
  for (const p of G.players) {
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.immune = Math.max(0, p.immune - dt);
    p.think -= dt;
    p.jump = Math.max(0, p.jump - dt);
    p.kickAnim = Math.max(0, p.kickAnim - dt);
    p.slideCd = Math.max(0, (p.slideCd || 0) - dt);
    if (p.state !== 'ok' && p.state !== 'cele') {
      p.stateT -= dt;
      if (p.stateT <= 0) {
        if (p.state === 'slide') { p.state = 'down'; p.stateT = 0.3; }
        else if (p.state === 'dive') { p.state = 'down'; p.stateT = 0.45; }
        else p.state = 'ok';
      }
    }
    const moving = Math.hypot(p.vx, p.vy) > 60;
    if (p.sprinting && moving) p.stamina = Math.max(0, p.stamina - 0.24 * dt);
    else p.stamina = Math.min(1, p.stamina + 0.1 * dt);
  }
}

function physicsPlayers(dt) {
  const b = G.ball;
  for (const p of G.players) {
    if (p.state === 'slide') {
      const k = 1 - 2.2 * dt; p.vx *= k; p.vy *= k;
      if (Math.random() < 0.3) dust(p.x + p.fx * 10, p.y + p.fy * 10, 1);
    } else if (p.state === 'down') {
      const k = Math.max(0, 1 - 8 * dt); p.vx *= k; p.vy *= k;
    } else if (p.state === 'dive') {
      const k = 1 - 1.4 * dt; p.vx *= k; p.vy *= k;
    } else {
      const ax = p.dvx - p.vx, ay = p.dvy - p.vy, al = Math.hypot(ax, ay);
      const maxA = (b.owner === p ? 1250 : 1700) * dt;
      if (al > maxA) { p.vx += ax / al * maxA; p.vy += ay / al * maxA; } else { p.vx = p.dvx; p.vy = p.dvy; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const sp = Math.hypot(p.vx, p.vy);
    if (!isCtrl(p) && p.state === 'ok' && sp > 30) {
      const k = Math.min(1, dt * 10);
      let fx = lerp(p.fx, p.vx / sp, k), fy = lerp(p.fy, p.vy / sp, k);
      const l = Math.hypot(fx, fy) || 1;
      p.fx = fx / l; p.fy = fy / l;
    }
    p.anim += sp * dt * 0.085;
    p.x = clamp(p.x, -50, FW + 50); p.y = clamp(p.y, -45, FH + 45);
  }
  const ps = G.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j];
    const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = PR * 2 - 1;
    if (d > 0 && d < min) {
      const push = (min - d) / 2, nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
    }
  }
}

function ballPhysics(dt, inNet) {
  const b = G.ball, px = b.x;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.z > 0 || b.vz > 0) {
    b.vz -= GRAV * dt; b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -90) { b.vz = -b.vz * 0.45; b.vx *= 0.84; b.vy *= 0.84; } else b.vz = 0;
    }
  }
  const s = Math.hypot(b.vx, b.vy);
  if (b.z === 0 && s > 0) { const ns = Math.max(0, s - ROLL * dt); b.vx *= ns / s; b.vy *= ns / s; }
  else if (s > 0) { const k = 1 - 0.08 * dt; b.vx *= k; b.vy *= k; }
  b.spin += s * dt / BR;
  if (s < 25 && b.z === 0) b.target = null;

  if (inNet) {
    const left = b.x < CX, back = left ? -GOAL_D + BR : FW + GOAL_D - BR;
    if (left ? b.x < back : b.x > back) { b.x = back; b.vx *= -0.25; b.vy *= 0.6; }
    if (Math.abs(b.y - CY) > GH - BR) { b.y = CY + sgn(b.y - CY) * (GH - BR); b.vy *= -0.3; }
    if (b.z > BAR_H - BR) { b.z = BAR_H - BR; b.vz = -Math.abs(b.vz) * 0.3; }
    return;
  }
  // pali e traversa
  if (b.z < BAR_H + BR) {
    for (const gx of [0, FW]) {
      for (const py of [CY - GH, CY + GH]) {
        const dx = b.x - gx, dy = b.y - py, d = Math.hypot(dx, dy);
        if (d > 0 && d < BR + 4 && b.z < BAR_H) {
          const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
          b.x = gx + nx * (BR + 4); b.y = py + ny * (BR + 4);
          if (dot < 0) {
            b.vx = (b.vx - 2 * dot * nx) * 0.7; b.vy = (b.vy - 2 * dot * ny) * 0.7;
            postHit();
          }
        }
      }
      const crossed = (px - gx) * (b.x - gx) <= 0 && px !== b.x;
      if (crossed && Math.abs(b.y - CY) < GH && Math.abs(b.z - BAR_H) < BR + 3) {
        b.x = px; b.vx = -b.vx * 0.5;
        b.vz = b.z < BAR_H ? -Math.abs(b.vz) * 0.4 - 80 : Math.abs(b.vz) * 0.5 + 90;
        postHit(true);
      }
    }
  }
}
function postHit(bar) {
  Sound.post();
  G.shake = Math.max(G.shake, 0.35);
  if (G.ball.shot) say(bar ? 'Traversa!' : 'Palo!');
  G.ball.shot = null;
}

function ballUpdate(dt) {
  const b = G.ball;
  if (b.owner) {
    const o = b.owner;
    o.hold += dt;
    const sp = Math.hypot(o.vx, o.vy);
    const gkHold = o.role === 'gk' && o.immune > 50;
    const off = gkHold ? PR - 2 : PR + BR + 1 + Math.max(0, Math.sin(o.anim * 0.5)) * 4 * Math.min(1, sp / 150);
    b.x = o.x + o.fx * off; b.y = o.y + o.fy * off; b.z = gkHold ? 14 : 0;
    b.vx = o.vx; b.vy = o.vy; b.vz = 0;
    b.spin += sp * dt / BR;
    tackles();
    return;
  }
  ballPhysics(dt, false);
  contacts();
}

// ---------- regole ----------
function rules() {
  const b = G.ball;
  const inMouth = Math.abs(b.y - CY) < GH - BR * 0.4;
  if (inMouth && b.z < BAR_H) {
    if (b.x < -BR) return goalScored(G.teams.find(t => t.dir < 0).idx);
    if (b.x > FW + BR) return goalScored(G.teams.find(t => t.dir > 0).idx);
  }
  const out = b.y < -BR || b.y > FH + BR || b.x < -BR || b.x > FW + BR;
  if (!out) return;
  if (G.shootout) return shootoutResult(false);
  const lt = b.lastTouch ? b.lastTouch.ti : 0;
  if (b.owner) { const o = b.owner; b.owner = null; b.vx = o.vx; b.vy = o.vy; }
  const nearMiss = b.shot && Math.abs(b.y - CY) < GH + 90;
  if (b.y < -BR || b.y > FH + BR) {
    const ti = 1 - lt, tx = clamp(b.x, 25, FW - 25), ty = b.y < 0 ? 0 : FH;
    return deadBall(() => setPiece('throw', ti, tx, ty), `Rimessa laterale: ${G.teams[ti].def.name}`);
  }
  const side = b.x < 0 ? 0 : FW;
  const def = G.teams.find(t => ownGoalX(t) === side), att = G.teams[1 - def.idx];
  const yy = b.y;
  if (nearMiss) { say('Fuori di un soffio!'); Sound.ooh(); }
  if (lt === def.idx) {
    G.stats[att.idx].corners++;
    deadBall(() => setPiece('corner', att.idx, side, yy), `Calcio d'angolo per ${att.def.name}`);
  } else {
    deadBall(() => setPiece('goalkick', def.idx, side, yy), `Rinvio dal fondo per ${def.def.name}`);
  }
}
function deadBall(next, msg, delay = 1.1) {
  G.phase = 'dead'; G.phaseT = delay; G.next = next;
  if (msg) say(msg);
  Sound.whistle(1);
}

function goalScored(ti) {
  const b = G.ball;
  if (b.owner) { const o = b.owner; b.owner = null; b.vx = o.vx * 1.2; b.vy = o.vy * 1.2; }
  if (G.shootout) return shootoutResult(true);
  const sc = b.lastTouch, own = !!sc && sc.ti !== ti;
  G.teams[ti].score++;
  if (b.shot && b.shot.team === ti) G.stats[ti].onTarget++;
  G.goalInfo = { ti, scorer: sc, own, minute: minuteNow(), t: G.time };
  G.phase = 'goal'; G.phaseT = 3.0; G.recGoal = G.rec.length;
  G.netKick = { x: b.x < CX ? 0 : FW, y: b.y, t: 0 };
  G.shake = 1;
  confetti(b.x < CX ? 20 : FW - 20, CY, G.teams[ti]);
  Sound.roar(); Sound.net();
  say(own ? `Autogol di ${sc.name}!` : `GOL! Segna ${sc ? sc.name : ''} (${G.teams[ti].def.short})`);
  for (const p of G.players) {
    p.celebrate = false;
    if (p.state === 'dive' || p.state === 'slide') continue;
    p.state = 'ok';
  }
  if (sc && !own) sc.celebrate = true;
  if (G.hooks.score) G.hooks.score();
}

// ---------- calci piazzati ----------
const SP_LABEL = {
  kickoff: "Calcio d'inizio", throw: 'Rimessa laterale', corner: "Calcio d'angolo",
  goalkick: 'Rinvio dal fondo', freekick: 'Calcio di punizione', penalty: 'Calcio di rigore'
};
function nearestOf(arr, x, y) {
  let best = null, bd = 1e9;
  for (const p of arr) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return best;
}
function setPiece(type, ti, x = CX, y = CY) {
  const team = G.teams[ti], b = G.ball;
  const sp = { type, ti, x, y, t: 0, delay: type === 'kickoff' ? 1.0 : rnd(1.0, 1.7), taker: null, targets: new Map(), tele: false };
  const ms = G.players.filter(p => p.ti === ti), fs = G.players.filter(p => p.ti !== ti);
  const field = ms.filter(p => p.role !== 'gk');
  for (const p of G.players) {
    p.state = 'ok'; p.stateT = 0; p.celebrate = false; p.diveAt = -1; p.pen = null;
    p.kickCd = 0; p.immune = 0; p.hold = 0; p.jump = 0; p.runTo = null;
  }
  const og = oppGoalX(team), gx = ownGoalX(team), dir = team.dir;
  const T = (p, tx, ty) => { if (p) sp.targets.set(p, { x: tx, y: clamp(ty, -20, FH + 20) }); };
  let fx = dir, fy = 0;
  switch (type) {
    case 'kickoff': {
      x = CX; y = CY; sp.tele = true;
      sp.taker = ms.find(p => p.role === 'att');
      for (const p of G.players) {
        let kx = Math.min(p.hx * 0.9, CX - 30);
        const ky = p.hy;
        if (p.ti !== ti && Math.hypot(CX - kx, CY - ky) < CIRCLE_R + 16) kx = CX - CIRCLE_R - 16;
        T(p, tX(p.team, kx), ky);
      }
      const mc = ms.find(p => p.role === 'mid' && p.hy === CY);
      T(mc, tX(team, CX - 80), CY + 50);
      break;
    }
    case 'throw': {
      sp.taker = nearestOf(field, x, y);
      fx = 0; fy = y < CY ? 1 : -1;
      const others = field.filter(p => p !== sp.taker).sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y));
      if (others[0]) T(others[0], clamp(x + dir * 140, 60, FW - 60), y < CY ? 120 : FH - 120);
      if (others[1]) T(others[1], clamp(x - dir * 110, 60, FW - 60), y < CY ? 210 : FH - 210);
      for (const p of fs) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 100 && p.role !== 'gk') { const k = 100 / (d || 1); T(p, x + (p.x - x) * k, y + (p.y - y) * k); }
      }
      break;
    }
    case 'corner': {
      sp.tele = true;
      const sy = y < CY ? -1 : 1;
      x = og === 0 ? 4 : FW - 4; y = sy < 0 ? 4 : FH - 4;
      sp.taker = nearestOf(field.filter(p => p.role === 'mid'), x, y) || nearestOf(field, x, y);
      fx = -dir; fy = -sy;
      const spots = [[og - dir * 70, CY + sy * 55], [og - dir * 150, CY - sy * 10], [og - dir * 105, CY - sy * 95], [og - dir * 280, CY + sy * 30]];
      const rest = field.filter(p => p !== sp.taker);
      const fwd = rest.filter(p => p.role !== 'def'), backs = rest.filter(p => p.role === 'def');
      fwd.forEach((p, i) => { const s = spots[i] || spots[3]; T(p, s[0] + rnd(-12, 12), s[1] + rnd(-12, 12)); });
      backs.forEach((p, i) => T(p, tX(team, 640), CY + (i ? 170 : -170)));
      const fgk = fs.find(p => p.role === 'gk');
      T(fgk, og - dir * 10, CY + sy * 18);
      const mark = [[og - dir * 30, CY + sy * 85], ...spots.map(s => [s[0] + dir * 24, s[1] + 8])];
      fs.filter(p => p.role !== 'gk').forEach((p, i) => { const s = mark[i] || [og - dir * 340, CY]; T(p, s[0], s[1]); });
      break;
    }
    case 'goalkick': {
      sp.taker = ms.find(p => p.role === 'gk');
      x = gx + dir * (SIX_D - 15); y = CY + (y < CY ? -70 : 70);
      for (const p of field) T(p, tX(team, p.hx * 0.8 + 70), p.hy);
      for (const p of fs) if (p.role !== 'gk') T(p, tX(p.team, clamp(p.hx + 280, 0, FW - BOX_D - 70)), p.hy);
      break;
    }
    case 'freekick': {
      sp.taker = nearestOf(field, x, y);
      const gdx = og - x, gdy = CY - y, dG = Math.hypot(gdx, gdy);
      fx = gdx / dG; fy = gdy / dG;
      const wall = [];
      if (dG < 430) {
        const wx = x + fx * 100, wy = y + fy * 100;
        const cand = fs.filter(p => p.role !== 'gk').sort((a, c) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(c.x - wx, c.y - wy));
        for (let k = 0; k < 2 && cand[k]; k++) {
          const off = (k - 0.5) * (PR * 2 + 1);
          T(cand[k], wx - fy * off, wy + fx * off); wall.push(cand[k]);
        }
      }
      for (const p of fs) {
        if (wall.includes(p) || p.role === 'gk') continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 110) { const k = 110 / (d || 1); T(p, x + (p.x - x) * k, y + (p.y - y) * k); }
      }
      if (dG < 560) {
        const fwd = field.filter(p => p !== sp.taker && p.role !== 'def');
        fwd.slice(0, 2).forEach((p, i) => T(p, og - dir * (120 + i * 60), CY + (i ? 70 : -60)));
      }
      break;
    }
    case 'penalty': {
      sp.tele = true;
      x = og - dir * PEN_D; y = CY;
      sp.taker = G.shootout ? shootoutTaker(ti) : ms.find(p => p.role === 'att');
      const fgk = fs.find(p => p.role === 'gk');
      T(fgk, og - dir * 6, CY);
      let k = 0;
      for (const p of G.players) {
        if (p === sp.taker || p === fgk) continue;
        if (G.shootout) {
          const a = k / 12 * TAU;
          T(p, CX + Math.cos(a) * 70, CY + Math.sin(a) * 70);
        } else {
          T(p, og - dir * (BOX_D + 35 + (k % 2) * 40), CY - 250 + k * 46);
        }
        k++;
      }
      sp.delay = rnd(1.2, 1.8);
      break;
    }
  }
  sp.x = x; sp.y = y;
  const t = sp.taker;
  const fl = Math.hypot(fx, fy) || 1;
  t.fx = fx / fl; t.fy = fy / fl;
  t.x = x - t.fx * (PR + BR + 1); t.y = y - t.fy * (PR + BR + 1);
  t.vx = t.vy = t.dvx = t.dvy = 0; t.immune = 99;
  sp.targets.delete(t);
  if (sp.tele) for (const [p, tg] of sp.targets) { p.x = tg.x; p.y = tg.y; p.vx = p.vy = 0; }
  Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, owner: t, target: null, shot: null, passFrom: null, lastTouch: t });
  b.trail.length = 0;
  G.sp = sp; G.phase = 'set'; resetCharge();
  for (const hi of G.humans) {
    const h = G.hs[hi];
    if (hi === ti) { h.ctrl = t; h.lockT = 0; }
    else h.ctrl = nearestOf(G.players.filter(p => p.ti === hi && p.role !== 'gk'), x, y);
  }
  if (type === 'penalty' && !G.shootout) say(`Sul dischetto ${t.name}`);
  if (type === 'kickoff' && G.mode !== 'attract') say(`${SP_LABEL.kickoff}: ${team.def.name}`);
}

function setUpdate(dt) {
  const sp = G.sp, b = G.ball, t = sp.taker;
  sp.t += dt;
  cooldowns(dt);
  for (const p of G.players) {
    if (p === t) continue;
    if (p.state !== 'ok') { p.dvx = p.dvy = 0; continue; }
    const tg = sp.targets.get(p);
    if (tg) { seek(p, tg.x, tg.y, 1.15); if (Math.hypot(tg.x - p.x, tg.y - p.y) < 6) faceTo(p, b.x, b.y); continue; }
    if (G.shootout) { p.dvx = p.dvy = 0; continue; }
    if (p.role === 'gk') { aiGK(p, dt); continue; }
    if (p.ti === sp.ti) aiSupport(p, dt); else aiShape(p);
    if (p.ti !== sp.ti) {
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (d < 100) seek(p, sp.x + (p.x - sp.x) / (d || 1) * 110, sp.y + (p.y - sp.y) / (d || 1) * 110, 1);
    }
  }
  t.vx = t.vy = t.dvx = t.dvy = 0;
  if (isHuman(sp.ti)) {
    const h = G.hs[sp.ti], inp = h.inp;
    const d = inputDir(inp);
    if (sp.type === 'penalty') {
      // su e giù scelgono l'angolo della porta
      const og = oppGoalX(t.team), ty = CY + clamp(d.y, -1, 1) * (GH - 11);
      const ax = og - sp.x, ay = ty - sp.y, l = Math.hypot(ax, ay);
      const k = Math.min(1, dt * 9);
      t.fx = lerp(t.fx, ax / l, k); t.fy = lerp(t.fy, ay / l, k);
      const nl = Math.hypot(t.fx, t.fy) || 1; t.fx /= nl; t.fy /= nl;
    } else if (Math.hypot(d.x, d.y) > 0.3) {
      let ax = d.x, ay = d.y;
      if (sp.type === 'throw' || sp.type === 'corner') {
        const inY = sp.y < CY ? 1 : -1;
        if (ay * inY < 0.12) ay = 0.12 * inY;
      }
      if (sp.type === 'corner') { const inX = sp.x < CX ? 1 : -1; if (ax * inX < 0.12) ax = 0.12 * inX; }
      const l = Math.hypot(ax, ay);
      const k = Math.min(1, dt * 9);
      let nx = lerp(t.fx, ax / l, k), ny = lerp(t.fy, ay / l, k);
      const nl = Math.hypot(nx, ny) || 1;
      t.fx = nx / nl; t.fy = ny / nl;
    }
    if (sp.t > 0.45) {
      if (inp.passE) { setKick('pass'); return; }
      if (inp.lobE) { setKick('lob'); return; }
      if (inp.shootE) h.charging = true;
      if (h.charging) {
        if (inp.shoot) h.charge = Math.min(1, h.charge + dt / 0.7);
        else { setKick('shoot', Math.max(0.35, h.charge)); return; }
      }
    }
  } else if (sp.t > sp.delay) {
    aiSetKick(sp);
    return;
  }
  t.x = sp.x - t.fx * (PR + BR + 1); t.y = sp.y - t.fy * (PR + BR + 1);
  physicsPlayers(dt);
  t.x = sp.x - t.fx * (PR + BR + 1); t.y = sp.y - t.fy * (PR + BR + 1);
  b.x = sp.x; b.y = sp.y; b.z = sp.type === 'throw' ? 22 : 0;
}

function setKick(kind, power) {
  const sp = G.sp, t = sp.taker;
  const a = { x: t.fx, y: t.fy };
  if (kind === 'pass' || kind === 'lob') {
    const q = choosePassTarget(t, a.x, a.y);
    if (q) passTo(t, q, kind === 'lob'); else passInto(t, a.x, a.y, kind === 'lob');
  } else if (sp.type === 'throw') {
    passInto(t, a.x, a.y, true);
  } else {
    userShoot(t, power);
  }
  afterSetKick(sp, t);
}
function afterSetKick(sp, t) {
  G.phase = 'play'; G.sp = null;
  t.kickCd = 0.45; t.immune = 0;
  if (sp.type === 'throw') G.ball.z = 22;
  if (sp.type === 'penalty') {
    const gk = G.players.find(p => p.ti !== sp.ti && p.role === 'gk');
    penaltyReact(gk);
    if (G.shootout) { t.kickCd = 99; G.shootout.kickT = 0; }
  }
}
function aiSetKick(sp) {
  const t = sp.taker, team = t.team, og = oppGoalX(team);
  const ms = G.players.filter(p => p.ti === t.ti && p !== t && p.role !== 'gk' && p.state === 'ok');
  const byOpen = arr => arr.slice().sort((a, c) => nearestFoeDist(c) - nearestFoeDist(a));
  switch (sp.type) {
    case 'penalty': penaltyShot(t); break;
    case 'corner': {
      const inBoxMates = ms.filter(q => inBox(G.teams[1 - t.ti], q.x, q.y));
      if (inBoxMates.length && Math.random() < 0.8) passTo(t, pick(inBoxMates), true);
      else passTo(t, nearestOf(ms, t.x, t.y), false);
      break;
    }
    case 'goalkick': {
      const far = ms.filter(q => q.role !== 'def');
      if (far.length && Math.random() < 0.65) passTo(t, pick(far), true);
      else passTo(t, byOpen(ms.filter(q => q.role === 'def'))[0] || ms[0], false);
      break;
    }
    case 'freekick': {
      const dG = Math.hypot(og - sp.x, CY - sp.y);
      if (dG < 340 && Math.random() < 0.7) aiShoot(t);
      else {
        const box = ms.filter(q => inBox(G.teams[1 - t.ti], q.x, q.y));
        if (box.length && dG < 600) passTo(t, pick(box), true);
        else {
          const open = ms.filter(q => !laneBlocked(t.x, t.y, q.x, q.y, t.ti, 24) && dist(q, t) < 520);
          passTo(t, byOpen(open)[0] || nearestOf(ms, t.x, t.y), false);
        }
      }
      break;
    }
    case 'kickoff': passTo(t, nearestOf(ms, t.x, t.y), false); break;
    case 'throw': {
      const open = ms.filter(q => dist(q, t) < 320 && !laneBlocked(t.x, t.y, q.x, q.y, t.ti, 22));
      const q = byOpen(open)[0] || nearestOf(ms, t.x, t.y);
      passTo(t, q, dist(q, t) > 220);
      break;
    }
  }
  afterSetKick(sp, t);
}
function penaltyShot(t) {
  const og = oppGoalX(t.team);
  const r = Math.random();
  const side = r < 0.14 ? 0 : r < 0.57 ? -1 : 1;
  const ty = CY + side * (GH - 14 - rnd(18));
  shootAt(t, og - t.x, ty - t.y, rnd(0.5, 0.82));
}
function penaltyReact(gk) {
  const b = G.ball;
  let side;
  if (isHuman(gk.ti)) {
    const iy = G.hs[gk.ti].inp.y;
    side = Math.abs(iy) > 0.3 ? sgn(iy) : 0;
  } else {
    const t = (ownGoalX(gk.team) - b.x) / (b.vx || 1);
    const py = b.y + b.vy * t;
    const real = Math.abs(py - CY) < 22 ? 0 : sgn(py - CY);
    side = Math.random() < 0.12 + 0.2 * gk.skill ? real : pick([-1, 0, 1]);
  }
  gk.pen = { side, at: G.time + rnd(0.08, 0.17) };
}

// ---------- rigori ----------
function startShootout() {
  G.shootout = { kicks: [[], []], turn: G.firstKick, kickT: 0, done: false, winner: null };
  for (const team of G.teams) team.score = team.score || 0;
  shootoutKick();
}
function shootoutTaker(ti) {
  const order = ['att', 'mid', 'mid', 'mid', 'def', 'def'];
  const pool = G.players.filter(p => p.ti === ti && p.role !== 'gk')
    .sort((a, c) => order.indexOf(a.role) - order.indexOf(c.role) || c.n - a.n);
  return pool[G.shootout.kicks[ti].length % pool.length];
}
function shootoutKick() {
  const so = G.shootout, ti = so.turn;
  G.teams[ti].dir = 1; G.teams[1 - ti].dir = -1;
  setPiece('penalty', ti);
  so.kickT = 0; so.resolved = false;
  say(`Rigore ${so.kicks[ti].length + 1}: ${G.sp.taker.name} (${G.teams[ti].def.short})`);
}
function shootoutResult(scored) {
  const so = G.shootout;
  if (so.resolved) return;
  so.resolved = true;
  so.kicks[so.turn].push(scored);
  const b = G.ball;
  if (scored) {
    G.phase = 'goal'; G.phaseT = 1.8; G.goalInfo = null;
    G.netKick = { x: b.x < CX ? 0 : FW, y: b.y, t: 0 };
    confetti(FW - 20, CY, G.teams[so.turn]);
    Sound.roar(); Sound.net();
    say('Rigore segnato!');
  } else {
    G.phase = 'dead'; G.phaseT = 1.6;
    Sound.ooh();
    say('Rigore sbagliato!');
  }
  G.next = afterShootoutKick;
}
function shootoutDecided() {
  const so = G.shootout;
  const a = so.kicks[0].filter(Boolean).length, c = so.kicks[1].filter(Boolean).length;
  const ka = so.kicks[0].length, kc = so.kicks[1].length;
  if (ka <= 5 && kc <= 5) {
    if (a + (5 - ka) < c || c + (5 - kc) < a) return true;
    return ka === 5 && kc === 5 && a !== c;
  }
  return ka === kc && a !== c;
}
function afterShootoutKick() {
  const so = G.shootout;
  if (shootoutDecided()) {
    so.done = true;
    const a = so.kicks[0].filter(Boolean).length, c = so.kicks[1].filter(Boolean).length;
    so.winner = a > c ? 0 : 1;
    say(`${G.teams[so.winner].def.name} vince ai rigori!`);
    return finishMatch();
  }
  so.turn = 1 - so.turn;
  shootoutKick();
}
function shootoutWatch(dt) {
  const so = G.shootout, b = G.ball;
  so.kickT += dt;
  const gkHas = b.owner && b.owner.role === 'gk';
  const stopped = !b.owner && b.z === 0 && Math.hypot(b.vx, b.vy) < 25;
  const away = !b.owner && b.vx < -40 && b.x < FW - 230;
  if (gkHas || stopped || away || so.kickT > 3.2) shootoutResult(false);
}

// ---------- tempo ----------
function tickClock(dt) {
  if (G.shootout || G.mode === 'shootout') return;
  G.clock += dt;
  if (G.clock >= G.len / 2 * G.half) endHalf();
}
function endHalf() {
  G.sp = null;
  if (G.half === 1) {
    G.phase = 'break'; G.phaseT = G.mode === 'online' ? 7 : 2.5;
    Sound.whistle(2, true);
    say('Fine del primo tempo');
    if (G.hooks.halftime) G.hooks.halftime();
    return;
  }
  if (G.mode === 'cup' && G.teams[0].score === G.teams[1].score) {
    Sound.whistle(3, true);
    say('Parità: si va ai calci di rigore!');
    G.phase = 'dead'; G.phaseT = 2.6;
    G.next = startShootout;
    return;
  }
  Sound.whistle(3, true);
  finishMatch();
}
function finishMatch() {
  G.phase = 'break'; G.phaseT = 4;
  say('Fischio finale');
  const s0 = G.teams[0].score, s1 = G.teams[1].score;
  let w = s0 > s1 ? 0 : s1 > s0 ? 1 : -1;
  if (G.shootout && G.shootout.done) w = G.shootout.winner;
  G.result = { winner: w };
  if (G.hooks.fulltime) G.hooks.fulltime();
}
function secondHalf() {
  G.half = 2;
  for (const t of G.teams) t.dir *= -1;
  setPiece('kickoff', 1 - G.firstKick);
  Sound.whistle(1, true);
  say('Inizia il secondo tempo');
}

// ---------- registrazione e replay ----------
function record() {
  const ps = G.players, b = G.ball;
  const f = new Float32Array(4 + ps.length * 8);
  f[0] = b.x; f[1] = b.y; f[2] = b.z; f[3] = b.spin;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k], o = 4 + k * 8;
    f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.fx; f[o + 3] = p.fy;
    f[o + 4] = p.vx; f[o + 5] = p.vy; f[o + 6] = p.anim;
    f[o + 7] = p.celebrate ? 4 : STATES.indexOf(p.state) + (p.jump > 0 ? 10 : 0);
  }
  G.rec.push(f);
  if (G.rec.length > 480) { G.rec.shift(); G.recGoal--; }
}
function applyFrame(f) {
  const b = G.ball;
  b.x = f[0]; b.y = f[1]; b.z = f[2]; b.spin = f[3]; b.owner = null;
  G.players.forEach((p, k) => {
    const o = 4 + k * 8;
    p.x = f[o]; p.y = f[o + 1]; p.fx = f[o + 2]; p.fy = f[o + 3];
    p.vx = f[o + 4]; p.vy = f[o + 5]; p.anim = f[o + 6];
    let s = f[o + 7];
    p.jump = s >= 10 ? 0.17 : 0; if (s >= 10) s -= 10;
    p.celebrate = s === 4;
    p.state = s === 4 ? 'ok' : STATES[s] || 'ok';
  });
}
function startReplay() {
  const from = Math.max(0, G.recGoal - 230), to = Math.min(G.rec.length, G.recGoal + 55);
  const frames = G.rec.slice(from, to);
  if (frames.length < 40) return afterGoal();
  G.replay = { frames, i: 0, prev: { x: G.ball.x, y: G.ball.y } };
  G.phase = 'replay';
  G.parts = [];
}
function replayUpdate(dt) {
  const r = G.replay;
  r.i += dt * 60 * 0.55;
  const skip = IN.anyE && G.mode !== 'attract' && G.mode !== 'online';
  if (skip || r.i >= r.frames.length - 1) { G.replay = null; return afterGoal(); }
  const f = r.frames[Math.floor(r.i)];
  const pb = { x: G.ball.x, y: G.ball.y };
  applyFrame(f);
  // velocità del pallone stimata per la scia
  G.ball.vx = (G.ball.x - pb.x) / dt; G.ball.vy = (G.ball.y - pb.y) / dt;
}
function afterGoal() {
  G.rec = [];
  const gi = G.goalInfo;
  setPiece('kickoff', gi ? 1 - gi.ti : 0);
  Sound.whistle(1);
}

// ---------- particelle ----------
function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    G.parts.push({ x, y, z: 2, vx: rnd(-70, 70), vy: rnd(-70, 70), vz: rnd(40, 150), life: rnd(0.3, 0.6),
      col: pick(['#4f8a35', '#6f9c45', '#7a6440', '#3d6e2b']), s: rnd(1.4, 2.8), kind: 'dust' });
  }
  if (G.parts.length > 500) G.parts.splice(0, G.parts.length - 500);
}
function confetti(x, y, team) {
  const cols = [team.kit.shirt, team.kit.trim, '#f4c64f', '#ffffff'];
  for (let i = 0; i < 110; i++) {
    G.parts.push({ x: x + rnd(-40, 40), y: y + rnd(-100, 100), z: rnd(30, 110), vx: rnd(-180, 180), vy: rnd(-180, 180),
      vz: rnd(120, 420), life: rnd(1.8, 3.0), col: pick(cols), s: rnd(2.5, 4.5), kind: 'conf', r: rnd(TAU), vr: rnd(-12, 12) });
  }
}
function updateParts(dt) {
  for (const q of G.parts) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.kind === 'conf') {
      q.vz -= 380 * dt; q.vz = Math.max(q.vz, -70); q.vx *= 1 - 1.2 * dt; q.vy *= 1 - 1.2 * dt; q.r += q.vr * dt;
    } else q.vz -= 900 * dt;
    if (q.z < 0) { q.z = 0; q.vz = 0; q.vx *= 0.5; q.vy *= 0.5; }
  }
  G.parts = G.parts.filter(q => q.life > 0);
}

// ---------- controllo del giocatore ----------
function inputDir(inp) {
  let x = inp.x, y = inp.y;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
function choosePassTarget(p, ax, ay) {
  let best = null, bs = -1e9;
  for (const q of G.players) {
    if (q.ti !== p.ti || q === p || q.state !== 'ok') continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d < 40 || d > 950) continue;
    const dot = (dx * ax + dy * ay) / d;
    if (dot < 0.5) continue;
    if (q.role === 'gk' && dot < 0.88) continue;
    const lp = leadPoint(q, false);
    const s = dot * 2.2 - d / 650 - (passSafe(p, lp.x, lp.y) ? 0 : 0.45);
    if (s > bs) { bs = s; best = q; }
  }
  return best;
}
function pickControlled(ti, dt) {
  const h = G.hs[ti], b = G.ball;
  h.lockT = Math.max(0, h.lockT - dt);
  h.pressT = Math.max(0, h.pressT - dt);
  if (b.owner && b.owner.ti === ti) {
    if (b.owner.role !== 'gk') h.ctrl = b.owner;
    return;
  }
  if (!b.owner && b.target && b.target.ti === ti && b.target.role !== 'gk') { h.ctrl = b.target; return; }
  const px = b.x + b.vx * 0.3, py = b.y + b.vy * 0.3;
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (p.ti !== ti || p.role === 'gk') continue;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bd) { bd = d; best = p; }
  }
  const c = h.ctrl;
  if (!c || c.ti !== ti || c.role === 'gk') { h.ctrl = best; return; }
  if (h.lockT > 0) return;
  if (Math.hypot(c.x - px, c.y - py) > bd + 70) h.ctrl = best;
}
function userControl(ti, dt) {
  const h = G.hs[ti], inp = h.inp, p = h.ctrl, b = G.ball;
  if (!p) return;
  const has = b.owner === p;
  const d = inputDir(inp), dl = Math.hypot(d.x, d.y);
  if (p.state !== 'ok') { h.passHint = null; return; }
  p.sprinting = inp.sprint && p.stamina > 0.04 && dl > 0.1;
  const sp = p.speed * (has ? 0.93 : 1) * (p.sprinting ? 1.32 : 1);
  p.dvx = d.x * sp; p.dvy = d.y * sp;
  if (dl > 0.2) {
    const k = has ? Math.min(1, dt * 14) : 1;
    let fx = lerp(p.fx, d.x / dl, k), fy = lerp(p.fy, d.y / dl, k);
    const l = Math.hypot(fx, fy) || 1;
    p.fx = fx / l; p.fy = fy / l;
  }
  if (has) {
    const ax = dl > 0.2 ? d.x / dl : p.fx, ay = dl > 0.2 ? d.y / dl : p.fy;
    h.passHint = choosePassTarget(p, ax, ay);
    if (inp.passE) {
      if (h.passHint) passTo(p, h.passHint, false); else passInto(p, ax, ay, false);
    } else if (inp.lobE) {
      if (h.passHint) passTo(p, h.passHint, true); else passInto(p, ax, ay, true);
    } else {
      if (inp.shootE) h.charging = true;
      if (h.charging) {
        if (inp.shoot) h.charge = Math.min(1, h.charge + dt / 0.7);
        else userShoot(p, Math.max(0.35, h.charge));
      }
    }
  } else {
    h.passHint = null;
    h.charging = false; h.charge = 0;
    if (inp.shootE) doSlide(p, dl > 0.2 ? d.x : p.fx, dl > 0.2 ? d.y : p.fy);
    if (inp.passE) {
      let best = null, bd = 1e9;
      for (const q of G.players) {
        if (q.ti !== ti || q.role === 'gk' || q === p) continue;
        const dd = dist(q, b);
        if (dd < bd) { bd = dd; best = q; }
      }
      if (best) { h.ctrl = best; h.lockT = 0.9; }
    }
    if (inp.lobE) { h.pressT = 2.2; if (ti === G.user) say('Pressing!'); }
  }
}

// ---------- intelligenza artificiale ----------
function seek(p, tx, ty, f) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 3) { p.dvx = p.dvy = 0; p.sprinting = false; return; }
  const max = p.speed * f;
  const s = d < 40 ? max * d / 40 : max;
  p.dvx = dx / d * s; p.dvy = dy / d * s;
  p.sprinting = f > 1.05;
}
function faceTo(p, x, y) {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1;
  p.fx = dx / d; p.fy = dy / d;
}
function computeChasers() {
  const b = G.ball;
  G.chase = [null, null]; G.chase2 = [null, null];
  const px = b.x + b.vx * 0.25, py = b.y + b.vy * 0.25;
  for (const team of G.teams) {
    if (b.owner && b.owner.ti === team.idx) continue;
    const cands = G.players.filter(p => p.ti === team.idx && p.role !== 'gk' && p.state === 'ok')
      .map(p => ({ p, t: Math.hypot(p.x - px, p.y - py) / p.speed }))
      .sort((a, c) => a.t - c.t);
    if (!cands.length) continue;
    const bt = tX(team, b.x);
    if (isHuman(team.idx)) {
      const h = G.hs[team.idx], c = h.ctrl;
      const others = cands.filter(k => k.p !== c);
      if (!others.length) continue;
      const ct = c ? Math.hypot(c.x - px, c.y - py) / c.speed : 99;
      if (!b.owner) { if (others[0].t < ct - 0.35) G.chase[team.idx] = others[0].p; }
      else {
        // i compagni aiutano quando il tuo giocatore è lontano o la palla è vicina alla tua porta
        if (h.pressT > 0 || bt < 420 || ct > 1.2) G.chase[team.idx] = others[0].p;
        if (others[1] && bt < 480) G.chase2[team.idx] = others[1].p;
      }
      continue;
    }
    G.chase[team.idx] = cands[0].p;
    if (cands[1] && b.owner && bt < (team.skill > 0.98 ? 520 : 400)) G.chase2[team.idx] = cands[1].p;
  }
}
function ai(p, dt) {
  if (p.state !== 'ok') { p.dvx = p.dvy = 0; p.sprinting = false; return; }
  const b = G.ball;
  if (G.shootout) { if (p.role === 'gk') aiGK(p, dt); else { p.dvx = p.dvy = 0; } return; }
  if (b.owner === p) return aiOwner(p, dt);
  if (p.role === 'gk') return aiGK(p, dt);
  if (!b.owner && b.target === p) return seekBall(p, 1.12);
  if (G.chase[p.ti] === p) return aiPress(p, dt);
  if (G.chase2[p.ti] === p) return aiCover(p);
  if (b.owner && b.owner.ti === p.ti) return aiSupport(p, dt);
  return aiShape(p);
}
function seekBall(p, f) {
  const b = G.ball;
  const t = Math.min(0.9, dist(p, b) / (p.speed * f));
  seek(p, b.x + b.vx * t * 0.75, b.y + b.vy * t * 0.75, f);
}
function aiPress(p, dt) {
  const b = G.ball;
  if (!b.owner) return seekBall(p, 1.12);
  const gx = ownGoalX(p.team);
  const tx = b.x + (gx - b.x) * 0.05 + b.owner.vx * 0.15, ty = b.y + (CY - b.y) * 0.04 + b.owner.vy * 0.15;
  seek(p, tx, ty, 1.08);
  const d = dist(p, b);
  if (d < 62 && d > 26) {
    const dot = ((b.x - p.x) * p.fx + (b.y - p.y) * p.fy) / d;
    const rate = isHuman(p.ti) ? 0.2 : 0.15 + 0.4 * p.skill;
    if (dot > 0.75 && Math.random() < dt * rate) { doSlide(p, b.x - p.x, b.y - p.y); p.slideCd = rnd(2.5, 4.5); }
  }
}
function aiCover(p) {
  const b = G.ball, gx = ownGoalX(p.team);
  seek(p, b.x + (gx - b.x) * 0.35, b.y + (CY - b.y) * 0.35, 1.0);
}
function aiShape(p) {
  const team = p.team, b = G.ball, bt = tX(team, b.x);
  let tx = p.hx * 0.55 + bt * 0.38 - 60;
  let ty = p.hy * 0.72 + b.y * 0.28;
  if (p.role === 'def') {
    tx = Math.min(clamp(p.hx * 0.6 + bt * 0.3 - 50, 90, 500), bt - 70);
    let mark = null, md = 230;
    for (const o of G.players) {
      if (o.ti === p.ti || o.role === 'gk') continue;
      const d = Math.hypot(o.x - tX(team, tx), o.y - ty);
      if (d < md && tX(team, o.x) < 700) { md = d; mark = o; }
    }
    if (mark) {
      const mt = tX(team, mark.x);
      tx = mt - 30; ty = mark.y + (CY - mark.y) * 0.15;
    }
  } else if (p.role === 'mid') {
    tx = clamp(tx, 180, 820);
  } else {
    tx = clamp(tx, 400, 900);
  }
  tx = Math.max(tx, 60);
  seek(p, tX(team, tx), clamp(ty, 40, FH - 40), 0.92);
}
function lastLine(team) {
  // la linea dell'ultimo difensore avversario, in coordinate della squadra che attacca
  let m = CX;
  for (const o of G.players) if (o.ti !== team.idx && o.role !== 'gk') m = Math.max(m, tX(team, o.x));
  return m;
}
function aiSupport(p, dt) {
  const team = p.team, b = G.ball, bt = tX(team, b.x), line = lastLine(team);
  let tx, ty = p.hy * 0.8 + b.y * 0.2;
  if (p.role === 'def') tx = clamp(bt - 170 + (p.hx - 290) * 0.3, 140, 760);
  else if (p.role === 'mid') tx = clamp(bt + 110 + (p.hx - 540) * 0.6, 260, Math.min(FW - 200, line + 20));
  else { tx = clamp(Math.max(bt + 240, line - 15), 450, FW - 120); ty = p.hy * 0.6 + b.y * 0.4; }
  p.runT -= dt;
  if (p.runTo) {
    seek(p, p.runTo.x, p.runTo.y, 1.12);
    if (p.runT <= 0 || Math.hypot(p.runTo.x - p.x, p.runTo.y - p.y) < 20) p.runTo = null;
    return;
  }
  if (p.role !== 'def' && p.runT <= 0 && !G.sp) {
    p.runT = rnd(2.5, 5);
    if (Math.random() < 0.55) {
      p.runTo = { x: tX(team, clamp(Math.max(bt + 160, line + rnd(60, 160)), 300, FW - 110)), y: clamp(p.y + rnd(-170, 170), 80, FH - 80) };
      p.runT = 1.6;
      return;
    }
  }
  let sx = 0, sy = 0;
  for (const q of G.players) {
    if (q.ti !== p.ti || q === p) continue;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
    if (d < 130 && d > 0) { sx += dx / d * (130 - d); sy += dy / d * (130 - d); }
  }
  seek(p, tX(team, tx) + sx * 0.6, clamp(ty + sy * 0.6, 50, FH - 50), 0.95);
}
function aiOwner(p, dt) {
  const team = p.team, b = G.ball;
  if (p.role === 'gk') {
    p.dvx = p.dvy = 0; p.fx = team.dir; p.fy = 0;
    if (p.hold > 1.1) gkDistribute(p);
    return;
  }
  const og = oppGoalX(team), dGoal = Math.hypot(og - p.x, CY - p.y), pt = tX(team, p.x);
  let near = 1e9;
  for (const o of G.players) if (o.ti !== p.ti) near = Math.min(near, dist(o, p));
  if (dGoal < 150 && p.hold > 0.1) return aiShoot(p);
  if (p.think <= 0) {
    p.think = p.thinkInt * rnd(0.7, 1.4);
    const noise = (1.15 - p.skill) * 0.35;
    let aheadFree = true;
    const gdx = og - p.x, gdy = (CY - p.y) * 0.5, gl = Math.hypot(gdx, gdy) || 1;
    for (const o of G.players) {
      if (o.ti === p.ti) continue;
      const rx = o.x - p.x, ry = o.y - p.y, d = Math.hypot(rx, ry);
      if (d < 150 && (rx * gdx + ry * gdy) / (gl * (d || 1)) > 0.35) { aheadFree = false; break; }
    }
    let best = { k: 'dribble', s: 0.45 + (aheadFree ? 0.45 : near > 85 ? 0.1 : -0.2) + rnd(noise) - (p.hold > 3.5 ? 0.3 : 0) };
    if (dGoal < 520 && Math.abs(p.y - CY) < 340) {
      const ex = p.x + (og - p.x) * Math.min(1, 130 / dGoal), ey = p.y + (CY - p.y) * Math.min(1, 130 / dGoal);
      const close = laneBlocked(p.x, p.y, ex, ey, p.ti, 22);
      const blocked = laneBlocked(p.x, p.y, og, CY, p.ti, 18);
      const s = 1.42 - dGoal / 500 - (close ? 0.7 : blocked ? 0.2 : 0) + rnd(noise);
      if (s > best.s) best = { k: 'shoot', s };
    }
    for (const q of G.players) {
      if (q.ti !== p.ti || q === p || q.state !== 'ok') continue;
      if (q.role === 'gk' && !(near < 70 && pt < 400)) continue;
      const d = dist(p, q);
      if (d < 60 || d > 760) continue;
      const lp = leadPoint(q, false);
      if (!passSafe(p, lp.x, lp.y)) continue;
      const prog = (tX(team, lp.x) - pt) / 400;
      const open = Math.min(nearestFoeDist(q), 220) / 220;
      let s = 0.1 + prog * (prog > 0 ? 0.8 : 1.1) + open * 0.3 - d / 2200 + rnd(noise) + (near < 55 ? 0.12 : 0);
      if (q.role === 'gk') s -= 0.5;
      if (s > best.s) best = { k: 'pass', s, q };
    }
    if (pt > FW - 330 && Math.abs(p.y - CY) > 170) {
      const opp = G.teams[1 - p.ti];
      const tg = G.players.filter(q => q.ti === p.ti && q !== p && inBox(opp, q.x, q.y));
      if (tg.length) { const s = 0.8 + rnd(0.25); if (s > best.s) best = { k: 'cross', s, q: pick(tg) }; }
    }
    if (best.k === 'shoot') return aiShoot(p);
    if (best.k === 'pass') return passTo(p, best.q, dist(p, best.q) > 560 && Math.random() < 0.5);
    if (best.k === 'cross') return passTo(p, best.q, true);
  }
  aiDribble(p, near);
}
function aiDribble(p, near) {
  const team = p.team, og = oppGoalX(team);
  let dx = og - p.x, dy = (CY - p.y) * 0.6;
  let l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  let ax = dx, ay = dy;
  for (const o of G.players) {
    if (o.ti === p.ti) continue;
    const rx = o.x - p.x, ry = o.y - p.y, d = Math.hypot(rx, ry);
    if (d > 160 || d === 0) continue;
    const ahead = (rx * dx + ry * dy) / d;
    if (ahead < -0.2) continue;
    const w = (1 - d / 160) * 1.5;
    const lat = rx * -dy + ry * dx;
    const side = lat > 0 ? -1 : 1;
    ax += -dy * side * w - rx / d * w * 0.3;
    ay += dx * side * w - ry / d * w * 0.3;
  }
  if (p.y < 80) ay += 0.9;
  if (p.y > FH - 80) ay -= 0.9;
  l = Math.hypot(ax, ay) || 1;
  ax /= l; ay /= l;
  // non tornare indietro: almeno un po' di avanzamento verso la porta
  const fwd = ax * dx + ay * dy;
  if (fwd < 0.25) { ax += dx * (0.25 - fwd); ay += dy * (0.25 - fwd); }
  l = Math.hypot(ax, ay) || 1;
  const f = near > 140 ? 1.06 : 0.93;
  p.dvx = ax / l * p.speed * f; p.dvy = ay / l * p.speed * f;
  p.sprinting = f > 1;
}
function gkDistribute(p) {
  const ms = G.players.filter(q => q.ti === p.ti && q !== p && q.state === 'ok');
  const open = ms.filter(q => dist(p, q) < 520 && !laneBlocked(p.x, p.y, q.x, q.y, p.ti, 26));
  if (open.length && Math.random() < 0.55) {
    open.sort((a, c) => nearestFoeDist(c) - nearestFoeDist(a));
    passTo(p, open[0], false);
  } else {
    const far = ms.filter(q => q.role !== 'def');
    if (far.length) passTo(p, pick(far), true);
    else kickBall(p, p.team.dir, rnd(-0.4, 0.4), 700, 420);
  }
}
function gkDive(p, py, t) {
  p.state = 'dive'; p.stateT = 0.55;
  const dy = py - p.y;
  const sp = clamp(Math.abs(dy) / Math.max(t, 0.18), 260, 560 * (0.8 + 0.3 * p.skill));
  p.vx = p.team.dir * 35; p.vy = sgn(dy) * sp;
  p.diveDir = sgn(dy); p.diveAt = 1e9;
  dust(p.x, p.y, 4);
}
function aiGK(p, dt) {
  const team = p.team, dir = team.dir, gx = ownGoalX(team), b = G.ball;
  if (p.pen) {
    if (G.time >= p.pen.at) {
      if (p.pen.side) gkDive(p, CY + p.pen.side * (GH - 8), 0.32);
      else { p.diveAt = 1e9; p.penHold = G.time + 0.4; }
      p.pen = null;
    }
    p.dvx = p.dvy = 0;
    return;
  }
  if (p.penHold && G.time < p.penHold) { p.dvx = p.dvy = 0; return; }
  if (!b.owner && b.shot && b.shot.team !== p.ti && b.vx * dir < -150) {
    const lineX = gx + dir * 12, t = (lineX - b.x) / b.vx;
    if (t > 0 && t < 1.2) {
      const py = b.y + b.vy * t;
      if (Math.abs(py - CY) < GH + 30) {
        if (p.diveAt < 0) p.diveAt = G.time + rnd(0.04, 0.18) * (1.35 - p.skill);
        if (G.time >= p.diveAt && Math.abs(py - p.y) > 28 && t < 0.55) return gkDive(p, py, t);
        return seek(p, gx + dir * 14, clamp(py, CY - GH - 10, CY + GH + 10), 1.4);
      }
    }
  }
  if (b.owner || !b.shot) p.diveAt = -1;
  if (!b.owner && inBox(team, b.x, b.y) && b.z < 70) {
    const myT = dist(p, b) / (p.speed * 1.2);
    let oppT = 1e9;
    for (const o of G.players) if (o.ti !== p.ti) oppT = Math.min(oppT, dist(o, b) / o.speed);
    if (myT < oppT * 1.05 || Math.hypot(b.vx, b.vy) < 90) return seek(p, b.x + b.vx * 0.15, b.y + b.vy * 0.15, 1.25);
  }
  let tx, ty;
  if (b.owner && b.owner.ti !== p.ti && inBox(team, b.x, b.y)) {
    tx = gx + (b.x - gx) * 0.45; ty = CY + (b.y - CY) * 0.6;
  } else {
    const ang = Math.atan2(b.y - CY, b.x - gx), db = Math.hypot(b.x - gx, b.y - CY);
    const r = clamp(18 + db * 0.06, 18, 70);
    tx = gx + Math.cos(ang) * r; ty = clamp(CY + Math.sin(ang) * r, CY - GH + 8, CY + GH - 8);
    if ((tx - gx) * dir < 10) tx = gx + dir * 10;
  }
  tx = tX(team, clamp(tX(team, tx), 4, BOX_D - 10));
  ty = clamp(ty, CY - BOX_W / 2 + 10, CY + BOX_W / 2 - 10);
  seek(p, tx, ty, 1.0);
}

// ---------- ciclo principale ----------
function playUpdate(dt) {
  tickClock(dt);
  if (G.phase !== 'play') return;
  cooldowns(dt);
  for (const ti of G.humans) pickControlled(ti, dt);
  if (!G.shootout) for (const ti of G.humans) userControl(ti, dt);
  computeChasers();
  for (const p of G.players) if (G.shootout || !isCtrl(p)) ai(p, dt);
  physicsPlayers(dt);
  ballUpdate(dt);
  if (G.phase !== 'play') return;
  rules();
  if (G.phase === 'play' && G.shootout) shootoutWatch(dt);
  const b = G.ball;
  if (b.owner) G.stats[b.owner.ti].poss++;
  record();
}
function deadUpdate(dt) {
  G.phaseT -= dt;
  cooldowns(dt);
  for (const p of G.players) {
    if (p.state !== 'ok') continue;
    p.dvx *= 0.9; p.dvy *= 0.9;
    if (p.role !== 'gk') faceTo(p, G.ball.x, G.ball.y);
  }
  physicsPlayers(dt);
  const b = G.ball;
  if (!b.owner) {
    ballPhysics(dt, false);
    const k = 1 - 2.5 * dt; b.vx *= k; b.vy *= k;
  }
  if (G.phaseT <= 0) { const f = G.next; G.next = null; if (f) f(); }
}
function goalUpdate(dt) {
  G.phaseT -= dt;
  cooldowns(dt);
  const gi = G.goalInfo, b = G.ball;
  for (const p of G.players) {
    if (p.state !== 'ok') continue;
    if (gi && gi.scorer && !gi.own && p === gi.scorer) {
      const cx = b.x < CX ? 40 : FW - 40, cy = p.y < CY ? 50 : FH - 50;
      seek(p, cx, cy, 1.15);
    } else if (gi && gi.scorer && !gi.own && p.ti === gi.ti && p.role !== 'gk') {
      seek(p, gi.scorer.x + (p.x - gi.scorer.x) * 0.2, gi.scorer.y + (p.y - gi.scorer.y) * 0.2, 1.05);
      p.celebrate = dist(p, gi.scorer) < 60;
    } else {
      p.dvx *= 0.9; p.dvy *= 0.9;
    }
  }
  physicsPlayers(dt);
  ballPhysics(dt, true);
  if (gi && G.time - gi.t < 0.95) record();
  if (G.phaseT <= 0) {
    if (G.shootout) { const f = G.next; G.next = null; if (f) f(); return; }
    startReplay();
  }
}
function step(dt) {
  if (G.paused) { clearEdges(); return; }
  G.time += dt;
  updateParts(dt);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  if (G.netKick) G.netKick.t += dt;
  switch (G.phase) {
    case 'play': playUpdate(dt); break;
    case 'set': tickClock(dt); if (G.phase === 'set') setUpdate(dt); break;
    case 'dead': deadUpdate(dt); break;
    case 'goal': goalUpdate(dt); break;
    case 'replay': replayUpdate(dt); break;
    case 'break':
      if (G.mode === 'online' && G.half === 1 && !G.result) {
        // in rete l'intervallo dura pochi secondi, poi riparte da solo
        G.phaseT -= dt;
        if (G.phaseT <= 0) secondHalf();
      } else if (G.mode === 'attract') {
        G.phaseT -= dt;
        if (G.phaseT <= 0) { if (G.half === 1) secondHalf(); else if (G.hooks.attractEnd) G.hooks.attractEnd(); }
      }
      break;
  }
  // eccitazione del pubblico: palla vicina a una porta
  const b = G.ball;
  if (b) {
    const dg = Math.min(Math.hypot(b.x, b.y - CY), Math.hypot(FW - b.x, b.y - CY));
    const target = G.phase === 'goal' ? 1 : clamp(1 - dg / 420, 0, 1);
    G.excite = lerp(G.excite, target, dt * 2);
  }
  clearEdges();
}
function clearEdges() {
  for (const inp of [IN, G.hs[0] && G.hs[0].inp, G.hs[1] && G.hs[1].inp]) {
    if (inp) inp.passE = inp.lobE = inp.shootE = inp.anyE = false;
  }
}
