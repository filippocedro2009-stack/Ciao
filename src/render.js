'use strict';
// Disegno su canvas: stadio prerenderizzato, linee vettoriali, giocatori animati, HUD
const RD = { cv: null, ctx: null, dpr: 1, w: 1, h: 1, cam: { x: CX, y: CY, vw: 1000 }, stands: null, pitch: null,
  key: '', snap: true, touch: false, trail: [] };
const DISPLAY = '"Teko", "Arial Narrow", sans-serif', BODY = '"Barlow", "Segoe UI", system-ui, sans-serif';
const LIGHTS = [[0.72, 0.69], [-0.72, 0.69], [0.72, -0.69], [-0.72, -0.69]];
const P3 = (x, y, z) => [x, y - z * ZK];
const ADS = ['CALCIO NOTTURNO', 'PIZZERIA DA GINO', 'FORZA RAGAZZI', 'CAFFÈ CENTRALE', 'RADIO STADIO', 'GELATERIA LUNA'];
const AD_COLS = [['#13284a', '#f4c64f'], ['#7d1912', '#ffffff'], ['#0f3d24', '#e8f5e9'], ['#f2b632', '#16181b'], ['#22262c', '#7cc4ef'], ['#5a2a7a', '#ffffff']];

function rInit(cv) { RD.cv = cv; RD.ctx = cv.getContext('2d'); rResize(); }
function rResize() {
  const r = RD.cv.getBoundingClientRect();
  RD.dpr = Math.min(window.devicePixelRatio || 1, 2);
  RD.w = Math.max(1, r.width); RD.h = Math.max(1, r.height);
  RD.cv.width = Math.round(RD.w * RD.dpr); RD.cv.height = Math.round(RD.h * RD.dpr);
}

// ---------- sfondo prerenderizzato ----------
function buildBackground() {
  const fontsOk = !document.fonts || document.fonts.status === 'loaded';
  const key = G.teams.map(t => t.def.id + t.kit.shirt).join('|') + fontsOk;
  if (key === RD.key) return;
  RD.key = key;
  RD.stands = buildStands();
  RD.pitch = buildPitch();
}
function buildStands() {
  const W = FW + 2 * MX, H = FH + 2 * MY;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.translate(MX, MY);
  g.fillStyle = '#0a1310'; g.fillRect(-MX, -MY, W, H);
  const rng = seeded(hashStr(RD.key));
  const fans = [G.teams[0].kit.shirt, G.teams[0].kit.trim, G.teams[1].kit.shirt, G.teams[1].kit.trim];
  const neutral = ['#2a2f33', '#3b3328', '#5b4a3a', '#1e2428', '#46505a', '#6d5c4a', '#202020', '#7a7f86'];
  const person = (x, y, homeBias) => {
    const r = rng();
    if (r < 0.08) return;
    let col;
    if (r < 0.58) { const home = rng() < homeBias; col = fans[(home ? 0 : 2) + (rng() < 0.72 ? 0 : 1)]; }
    else col = neutral[(rng() * neutral.length) | 0];
    g.fillStyle = col; g.fillRect(x - 2.6, y - 1.5, 5.2, 5);
    g.fillStyle = SKINS[(rng() * SKINS.length) | 0]; g.fillRect(x - 1.6, y - 4.6, 3.2, 3.2);
  };
  // tribune lunghe (sopra e sotto)
  for (const top of [true, false]) {
    for (let r = 0; r < 12; r++) {
      const y = top ? -124 - r * 9.5 : FH + 124 + r * 9.5;
      g.fillStyle = r % 2 ? '#131c19' : '#17221e';
      g.fillRect(-MX, y - 5, W, 9.5);
      for (let x = -MX + 6; x < FW + MX - 4; x += 8) {
        if (((x + MX) % 270) < 12) continue;
        person(x + rng() * 1.5, y + rng() * 1.2, x < CX ? 0.68 : 0.32);
      }
    }
  }
  // curve dietro le porte
  for (const left of [true, false]) {
    for (let r = 0; r < 12; r++) {
      const x = left ? -134 - r * 9.5 : FW + 134 + r * 9.5;
      g.fillStyle = r % 2 ? '#131c19' : '#17221e';
      g.fillRect(x - 5, -118, 9.5, FH + 236);
      for (let y = -112; y < FH + 114; y += 8) {
        if (((y + 120) % 250) < 12) continue;
        person(x + rng() * 1.2, y + rng() * 1.5, left ? 0.82 : 0.18);
      }
    }
  }
  // ombra verso l'esterno
  const sh = g.createRadialGradient(CX, CY, 700, CX, CY, 1300);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = sh; g.fillRect(-MX, -MY, W, H);
  // torri dei riflettori
  for (const [lx, ly] of [[-200, -190], [FW + 200, -190], [-200, FH + 190], [FW + 200, FH + 190]]) {
    const glow = g.createRadialGradient(lx, ly, 4, lx, ly, 130);
    glow.addColorStop(0, 'rgba(255,250,225,0.55)'); glow.addColorStop(1, 'rgba(255,250,225,0)');
    g.fillStyle = glow; g.fillRect(lx - 130, ly - 130, 260, 260);
    g.fillStyle = '#2b3330'; g.fillRect(lx - 22, ly - 14, 44, 28);
    g.fillStyle = '#fffbea';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(lx - 19 + i * 10, ly - 11 + j * 11, 8, 9);
  }
  return c;
}
function buildPitch() {
  const X0 = -130, Y0 = -125, W = FW + 260, H = FH + 250, S = 1.25;
  const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
  const g = c.getContext('2d');
  g.scale(S, S); g.translate(-X0, -Y0);
  g.fillStyle = '#121b18'; g.fillRect(X0, Y0, W, H);
  // erba con strisce di taglio
  const ax = -100, ay = -94, aw = FW + 200, ah = FH + 188, n = 22, sw = aw / n;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#2b6b37' : '#30773d'; g.fillRect(ax + i * sw, ay, sw + 0.5, ah); }
  for (let j = 0; j < 12; j++) { g.fillStyle = j % 2 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.03)'; g.fillRect(ax, ay + j * ah / 12, aw, ah / 12); }
  const rng = seeded(77);
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(190,230,150,0.05)';
    g.fillRect(ax + rng() * aw, ay + rng() * ah, 1.6, 1.6);
  }
  // zone consumate
  const wear = (x, y, r, a) => {
    const w = g.createRadialGradient(x, y, 2, x, y, r);
    w.addColorStop(0, `rgba(120,98,60,${a})`); w.addColorStop(1, 'rgba(120,98,60,0)');
    g.fillStyle = w; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  wear(22, CY, 60, 0.38); wear(FW - 22, CY, 60, 0.38); wear(CX, CY, 40, 0.2);
  wear(PEN_D, CY, 22, 0.25); wear(FW - PEN_D, CY, 22, 0.25);
  // luce dei riflettori e vignetta
  for (const [lx, ly] of [[-120, -120], [FW + 120, -120], [-120, FH + 120], [FW + 120, FH + 120]]) {
    const l = g.createRadialGradient(lx, ly, 50, lx, ly, 950);
    l.addColorStop(0, 'rgba(255,250,215,0.10)'); l.addColorStop(1, 'rgba(255,250,215,0)');
    g.fillStyle = l; g.fillRect(ax, ay, aw, ah);
  }
  const v = g.createRadialGradient(CX, CY, 300, CX, CY, 1000);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = v; g.fillRect(ax, ay, aw, ah);
  // cartelloni
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 17px ${DISPLAY}`;
  let k = 0;
  const board = (x, y, w, h, vertical) => {
    const [bg, ink] = AD_COLS[k % AD_COLS.length], text = ADS[k % ADS.length]; k++;
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.12)'; vertical ? g.fillRect(x, y, 2, h) : g.fillRect(x, y, w, 2);
    g.save(); g.translate(x + w / 2, y + h / 2); if (vertical) g.rotate(x < CX ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = ink; g.fillText(text, 0, 1.5); g.restore();
  };
  for (let x = -120; x < FW + 120; x += 240) { board(x + 2, -119, 236, 20, false); board(x + 2, FH + 99, 236, 20, false); }
  for (let y = -100; y < FH + 100; y += 220) {
    if (Math.abs(y + 110 - CY) < 150) continue;
    board(-124, y + 2, 20, 216, true); board(FW + 104, y + 2, 20, 216, true);
  }
  return c;
}

// ---------- camera ----------
function updateCam(dt) {
  const b = G.ball, cam = RD.cam;
  let tx = b.x, ty = b.y - b.z * ZK * 0.5;
  if (G.phase === 'play') {
    if (b.owner) tx += b.owner.team.dir * 70;
    else { tx += clamp(b.vx * 0.2, -130, 130); ty += clamp(b.vy * 0.15, -80, 80); }
  }
  const gi = G.goalInfo;
  if (G.phase === 'goal' && gi && gi.scorer && !gi.own) { tx = lerp(b.x, gi.scorer.x, 0.55); ty = lerp(b.y, gi.scorer.y, 0.55); }
  if (G.shootout) { tx = FW - 250; ty = CY; }
  else if (G.phase === 'set' && G.sp && G.sp.type === 'corner') { tx = lerp(b.x, b.x < CX ? 150 : FW - 150, 0.45); ty = lerp(b.y, CY, 0.55); }
  let vw = clamp(RD.w * 1.45, 560, 1060);
  vw = Math.max(vw, 470 * RD.w / RD.h);
  if (G.phase === 'goal' || G.phase === 'replay') vw *= 0.84;
  if (G.shootout) vw *= 0.9;
  if (RD.snap) { cam.x = tx; cam.y = ty; cam.vw = vw; RD.snap = false; }
  else {
    const k = 1 - Math.exp(-dt * (G.phase === 'replay' ? 6 : 3.4));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.vw += (vw - cam.vw) * (1 - Math.exp(-dt * 2));
  }
  const vh = cam.vw * RD.h / RD.w;
  const minX = -MX + cam.vw / 2, maxX = FW + MX - cam.vw / 2;
  const minY = -MY + vh / 2, maxY = FH + MY - vh / 2;
  cam.x = minX > maxX ? CX : clamp(cam.x, minX, maxX);
  cam.y = minY > maxY ? CY : clamp(cam.y, minY, maxY);
}

// ---------- campo e porte ----------
function drawLines(c) {
  c.strokeStyle = 'rgba(240,245,236,0.86)'; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath();
  c.rect(0, 0, FW, FH);
  c.moveTo(CX, 0); c.lineTo(CX, FH);
  c.moveTo(CX + CIRCLE_R, CY); c.arc(CX, CY, CIRCLE_R, 0, TAU);
  const r = 92, a = Math.acos((BOX_D - PEN_D) / r);
  for (const side of [0, 1]) {
    c.rect(side ? FW - BOX_D : 0, CY - BOX_W / 2, BOX_D, BOX_W);
    c.rect(side ? FW - SIX_D : 0, CY - SIX_W / 2, SIX_D, SIX_W);
    const px = side ? FW - PEN_D : PEN_D, a0 = side ? Math.PI - a : -a;
    c.moveTo(px + Math.cos(a0) * r, CY + Math.sin(a0) * r);
    c.arc(px, CY, r, a0, a0 + 2 * a);
  }
  c.moveTo(14, 0); c.arc(0, 0, 14, 0, Math.PI / 2);
  c.moveTo(FW, 14); c.arc(FW, 0, 14, Math.PI / 2, Math.PI);
  c.moveTo(0, FH - 14); c.arc(0, FH, 14, -Math.PI / 2, 0);
  c.moveTo(FW - 14, FH); c.arc(FW, FH, 14, Math.PI, Math.PI * 1.5);
  c.stroke();
  c.fillStyle = 'rgba(240,245,236,0.9)';
  for (const [x, rr] of [[CX, 4.5], [PEN_D, 3.5], [FW - PEN_D, 3.5]]) { c.beginPath(); c.arc(x, CY, rr, 0, TAU); c.fill(); }
}
function mesh(c, f, nu, nv) {
  c.beginPath();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const [x, y] = f(i / nu, j / nv); j ? c.lineTo(x, y) : c.moveTo(x, y); }
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [x, y] = f(i / nu, j / nv); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
}
function drawGoal(c, side, front) {
  const gx = side ? FW : 0, s = side ? 1 : -1, bx = gx + s * GOAL_D;
  const y0 = CY - GH, y1 = CY + GH, H = BAR_H, Hb = BAR_H * 0.8;
  const nk = G.netKick && G.netKick.x === gx && G.netKick.t < 2.5 ? G.netKick : null;
  const bulge = (y, v) => {
    if (!nk) return 0;
    const A = 15 * Math.exp(-nk.t * 2.2) * (0.6 + 0.4 * Math.cos(nk.t * 11));
    return A * Math.exp(-((y - nk.y) ** 2) / (2 * 40 * 40)) * Math.sin(Math.PI * clamp(v * 1.1, 0, 1));
  };
  c.lineWidth = 1;
  if (!front) {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.moveTo(gx, y0); c.lineTo(bx, y0); c.lineTo(bx, y1); c.lineTo(gx, y1); c.fill();
    c.strokeStyle = 'rgba(232,238,232,0.30)';
    mesh(c, (u, v) => { const y = lerp(y0, y1, u); return P3(bx + s * bulge(y, v), y, v * Hb); }, 14, 5);
    mesh(c, (u, v) => P3(lerp(gx, bx, u), y0, v * lerp(H, Hb, u)), 4, 5);
    mesh(c, (u, v) => P3(lerp(gx, bx, u), y1, v * lerp(H, Hb, u)), 4, 5);
    c.strokeStyle = 'rgba(200,205,205,0.7)'; c.lineWidth = 2;
    c.beginPath();
    for (const y of [y0, y1]) { const [ax, ay] = P3(bx, y, 0), [cx2, cy2] = P3(bx, y, Hb); c.moveTo(ax, ay); c.lineTo(cx2, cy2); }
    c.stroke();
  } else {
    c.strokeStyle = 'rgba(232,238,232,0.22)';
    mesh(c, (u, v) => P3(lerp(gx, bx, v), lerp(y0, y1, u), lerp(H, Hb, v)), 14, 4);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 6;
    const frame = () => {
      c.beginPath();
      const a = P3(gx, y0, 0), b2 = P3(gx, y0, H), d = P3(gx, y1, H), e = P3(gx, y1, 0);
      c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]);
      c.stroke();
    };
    c.save(); c.translate(1.5, 1.5); frame(); c.restore();
    c.strokeStyle = '#f7f9f6'; c.lineWidth = 4.5; frame();
    c.lineCap = 'butt';
  }
}
function drawFlags(c) {
  for (const [x, y] of [[0, 0], [FW, 0], [0, FH], [FW, FH]]) {
    const [tx, ty] = P3(x, y, 36);
    c.strokeStyle = '#e9ecef'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke();
    const w = Math.sin(G.time * 6 + x) * 3;
    c.fillStyle = '#f4c64f';
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 13 + w * 0.3, ty + 3 + w); c.lineTo(tx, ty + 9); c.fill();
  }
}

// ---------- giocatori e pallone ----------
function shirtPattern(c, pattern, trim) {
  if (pattern === 'plain') return;
  c.save();
  c.beginPath(); c.ellipse(0, 0, 6.6, 10.6, 0, 0, TAU); c.clip();
  c.fillStyle = trim;
  if (pattern === 'stripes') for (let y = -10; y <= 10; y += 5) c.fillRect(-8, y - 1.2, 16, 2.4);
  else if (pattern === 'hoops') for (let x = -6; x <= 6; x += 4.5) c.fillRect(x - 1.1, -12, 2.2, 24);
  else if (pattern === 'sash') { c.beginPath(); c.moveTo(-8, -12); c.lineTo(-3, -12); c.lineTo(8, 12); c.lineTo(3, 12); c.closePath(); c.fill(); }
  else if (pattern === 'halves') c.fillRect(-8, 0, 16, 12);
  c.restore();
}
function limb(c, x1, y1, x2, y2, w, col) {
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function drawPlayer(c, p) {
  const team = p.team, kit = team.kit, gk = p.role === 'gk';
  const shirt = gk ? team.gkShirt : kit.shirt, trim = gk ? '#1b1f22' : kit.trim;
  const socks = gk ? '#22272b' : kit.socks, pattern = gk ? 'plain' : kit.pattern;
  const hand = gk ? '#e9f2f8' : p.skin, handR = gk ? 2.9 : 2.2;
  const sp = Math.hypot(p.vx, p.vy), run = Math.min(1, sp / 150), sw = Math.sin(p.anim) * run;
  let jz = 0;
  if (p.jump > 0) jz = Math.sin((1 - p.jump / 0.35) * Math.PI) * 20;
  else if (p.celebrate) jz = Math.abs(Math.sin(G.time * 9 + p.i)) * 9;
  c.save();
  c.translate(p.x, p.y - jz * ZK);
  c.lineCap = 'round';
  const body = (bx = 0, rx = 6.6, ry = 10.6) => {
    c.save(); c.translate(bx, 0);
    c.fillStyle = shirt; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill();
    shirtPattern(c, pattern, trim);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.stroke();
    c.strokeStyle = trim; c.lineWidth = 1.6; c.beginPath(); c.arc(2.4, 0, 3.6, -1.15, 1.15); c.stroke();
    c.restore();
  };
  const head = (hx = 0.8) => { dot(c, hx, 0, 5.1, p.skin); dot(c, hx - 1.9, 0, 4.4, p.hair); };
  if (p.state === 'dive') {
    c.rotate(p.diveDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (const s of [-1, 1]) { limb(c, -5, s * 3.5, -17, s * 4, 4.2, socks); dot(c, -18.5, s * 4, 2.4, '#121416'); }
    for (const s of [-1, 1]) { limb(c, 2, s * 6, 15, s * 5, 3.6, shirt); dot(c, 16, s * 5, handR, hand); }
    body(0, 10.5, 7.5); head(7.5);
  } else if (p.state === 'down') {
    c.rotate(Math.atan2(p.fy, p.fx));
    for (const s of [-1, 1]) { limb(c, -6, s * 3.5, -19, s * 5, 4.2, socks); dot(c, -20, s * 5, 2.4, '#121416'); }
    for (const s of [-1, 1]) { limb(c, 0, s * 8, 2, s * 15, 3.6, shirt); dot(c, 2, s * 15.5, handR, hand); }
    body(-1, 9.5, 7.5); head(8);
  } else if (p.state === 'slide') {
    c.rotate(Math.atan2(p.fy, p.fx));
    for (const s of [-1, 1]) { limb(c, 2, s * 3.5, 17, s * 2.5, 4.4, socks); dot(c, 18.5, s * 2.5, 2.5, '#121416'); }
    limb(c, -3, -9, -10, -13, 3.6, shirt); dot(c, -10.5, -13.5, handR, hand);
    body(-3, 7, 10); head(-1.5);
  } else {
    c.rotate(Math.atan2(p.fy, p.fx));
    for (const s of [-1, 1]) {
      const kick = p.kickAnim > 0 && s === 1 ? 11 * (p.kickAnim / 0.22) : 0;
      const fx = s * sw * 9 + kick;
      if (Math.abs(fx) > 0.5) limb(c, 0, s * 4.2, fx, s * 4.2, 4.4, socks);
      dot(c, fx + 1.6, s * 4.2, 2.4, '#121416');
    }
    for (const s of [-1, 1]) {
      const hx = p.celebrate ? 5 : -s * sw * 7, hy = p.celebrate ? s * 17 : s * 11.6;
      limb(c, 0, s * 9.4, hx, hy, 3.6, shirt);
      dot(c, hx, hy, handR, hand);
    }
    body(); head();
  }
  c.restore();
}
function drawShadows(c) {
  c.fillStyle = 'rgba(0,0,0,0.085)';
  for (const p of G.players) {
    const lie = p.state !== 'ok';
    for (const [lx, ly] of LIGHTS) {
      c.beginPath(); c.ellipse(p.x + lx * 10, p.y + ly * 8, lie ? 15 : 13, 5, Math.atan2(ly, lx), 0, TAU); c.fill();
    }
  }
  c.fillStyle = 'rgba(0,0,0,0.2)';
  for (const p of G.players) { c.beginPath(); c.ellipse(p.x, p.y + 1, 11, 9, 0, 0, TAU); c.fill(); }
  const b = G.ball, k = 1 - Math.min(0.75, b.z / 140);
  c.fillStyle = `rgba(0,0,0,${0.09 * k})`;
  for (const [lx, ly] of LIGHTS) { c.beginPath(); c.ellipse(b.x + lx * (3 + b.z * 0.45), b.y + ly * (3 + b.z * 0.4), BR * 1.2, BR * 0.6, Math.atan2(ly, lx), 0, TAU); c.fill(); }
  c.fillStyle = `rgba(0,0,0,${0.3 * k})`;
  c.beginPath(); c.ellipse(b.x, b.y + 1, BR * (0.6 + 0.4 * k), BR * 0.7 * (0.6 + 0.4 * k), 0, 0, TAU); c.fill();
}
function drawBall(c) {
  const b = G.ball, sy = b.y - b.z * ZK, r = BR * (1 + b.z / 320);
  const s = Math.hypot(b.vx, b.vy);
  if (s > 1) b.ang = Math.atan2(b.vy, b.vx);
  const g = c.createRadialGradient(b.x - r * 0.35, sy - r * 0.4, r * 0.15, b.x, sy, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#bfc6cb');
  c.fillStyle = g; c.beginPath(); c.arc(b.x, sy, r, 0, TAU); c.fill();
  c.save(); c.translate(b.x, sy); c.rotate(b.ang || 0);
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
  c.fillStyle = '#1d2327';
  const span = r * 3.9;
  for (let k = -1; k <= 1; k++) {
    const raw = ((b.spin * r * 0.9 + k * r * 1.3) % span + span) % span - span / 2;
    const fx = Math.sqrt(Math.max(0, 1 - (raw / r) ** 2));
    c.beginPath(); c.ellipse(raw, k * r * 0.55, r * 0.34 * fx + 0.2, r * 0.34, 0, 0, TAU); c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8;
  c.beginPath(); c.arc(b.x, sy, r, 0, TAU); c.stroke();
}
function drawTrail(c) {
  const b = G.ball, s = Math.hypot(b.vx, b.vy);
  if (s > 620 && !b.owner) RD.trail.push([b.x, b.y - b.z * ZK]);
  else if (RD.trail.length) RD.trail.shift();
  if (RD.trail.length > 9) RD.trail.shift();
  if (RD.trail.length < 2) return;
  c.lineCap = 'round';
  for (let i = 1; i < RD.trail.length; i++) {
    const [x1, y1] = RD.trail[i - 1], [x2, y2] = RD.trail[i];
    c.strokeStyle = `rgba(255,255,240,${0.06 + i * 0.035})`; c.lineWidth = 2 + i * 0.7;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
}
function drawParts(c) {
  for (const q of G.parts) {
    const a = Math.min(1, q.life * 2);
    c.globalAlpha = a; c.fillStyle = q.col;
    if (q.kind === 'conf') {
      c.save(); c.translate(q.x, q.y - q.z * ZK); c.rotate(q.r);
      c.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2 * (0.4 + Math.abs(Math.sin(q.r * 2))));
      c.restore();
    } else c.fillRect(q.x - q.s / 2, q.y - q.z * ZK - q.s / 2, q.s, q.s);
  }
  c.globalAlpha = 1;
}
function drawFlashes(c) {
  if (G.phase !== 'goal') return;
  for (let i = 0; i < 7; i++) {
    const top = Math.random() < 0.5;
    const x = rnd(-MX, FW + MX), y = top ? rnd(-MY, -125) : rnd(FH + 125, FH + MY);
    const r = rnd(4, 11);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ---------- indicatori nel mondo ----------
function drawMarkers(c) {
  if (!(G.phase === 'play' || G.phase === 'set')) return;
  for (const ti of G.humans) {
    const q = G.hs[ti] && G.hs[ti].ctrl;
    if (!q) continue;
    // il tuo giocatore in oro, quello dell'avversario online nel colore della sua maglia
    c.strokeStyle = ti === G.user ? '#f4c64f' : teamInk(q.team); c.lineWidth = ti === G.user ? 2.5 : 2;
    c.beginPath(); c.ellipse(q.x, q.y + 2, 18, 13, 0, 0, TAU); c.stroke();
  }
  const p = localCtrl(), h = G.user !== null && G.hs[G.user] ? G.hs[G.user].passHint : null;
  if (h && G.phase === 'play' && p && G.ball.owner === p) {
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.setLineDash([5, 5]);
    c.beginPath(); c.ellipse(h.x, h.y + 2, 17, 12, 0, 0, TAU); c.stroke();
    c.setLineDash([]);
  }
}
function drawTags(c) {
  const p = localCtrl(), hs = G.user !== null ? G.hs[G.user] : null;
  if (!p || !(G.phase === 'play' || G.phase === 'set')) return;
  const top = p.y - 28;
  c.fillStyle = '#f4c64f';
  c.beginPath(); c.moveTo(p.x, top + 6); c.lineTo(p.x - 6, top - 3); c.lineTo(p.x + 6, top - 3); c.fill();
  c.font = `600 12px ${BODY}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const label = `${p.n} ${p.name}`;
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(label, p.x, top - 7);
  c.fillStyle = '#ffffff'; c.fillText(label, p.x, top - 7);
  if (hs.charging && hs.charge > 0) {
    const w = 40, x = p.x - w / 2, y = top - 30;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 1, y - 1, w + 2, 7);
    c.fillStyle = hs.charge > 0.82 ? '#e8483c' : '#f4c64f'; c.fillRect(x, y, w * hs.charge, 5);
  }
  if (p.stamina < 0.98) {
    const w = 28, x = p.x - w / 2, y = p.y + 19;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 1, y - 1, w + 2, 5);
    c.fillStyle = p.stamina < 0.25 ? '#e8483c' : '#7fd38a'; c.fillRect(x, y, w * p.stamina, 3);
  }
  const sp = G.sp;
  if (sp && sp.taker === p && G.user === sp.ti) {
    const bx = sp.x, by = sp.y, L = 120;
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2.5; c.setLineDash([8, 6]);
    c.beginPath(); c.moveTo(bx + p.fx * 12, by + p.fy * 12); c.lineTo(bx + p.fx * L, by + p.fy * L); c.stroke();
    c.setLineDash([]);
    const ex = bx + p.fx * (L + 10), ey = by + p.fy * (L + 10);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - p.fx * 14 - p.fy * 7, ey - p.fy * 14 + p.fx * 7); c.lineTo(ex - p.fx * 14 + p.fy * 7, ey - p.fy * 14 - p.fx * 7); c.fill();
    const h = choosePassTarget(p, p.fx, p.fy);
    if (h) {
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.setLineDash([5, 5]);
      c.beginPath(); c.ellipse(h.x, h.y + 2, 17, 12, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    }
  }
}

// ---------- HUD a schermo ----------
function pill(c, x, y, w, h, r, fill) {
  c.fillStyle = fill; c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  c.fill();
}
function teamInk(team) { return luma(team.kit.shirt) < 0.16 ? team.kit.trim : team.kit.shirt; }
function drawRadar(c) {
  const rw = RD.w < 520 ? 100 : 150, rh = rw * FH / FW, rx = RD.w - rw - 12, ry = 12, sx = rw / FW;
  pill(c, rx - 5, ry - 5, rw + 10, rh + 10, 6, 'rgba(6,12,10,0.66)');
  c.strokeStyle = 'rgba(238,242,234,0.35)'; c.lineWidth = 1;
  c.strokeRect(rx, ry, rw, rh);
  c.beginPath(); c.moveTo(rx + rw / 2, ry); c.lineTo(rx + rw / 2, ry + rh);
  c.moveTo(rx + rw / 2 + CIRCLE_R * sx, ry + rh / 2); c.arc(rx + rw / 2, ry + rh / 2, CIRCLE_R * sx, 0, TAU);
  c.rect(rx, ry + (CY - BOX_W / 2) * sx, BOX_D * sx, BOX_W * sx);
  c.rect(rx + rw - BOX_D * sx, ry + (CY - BOX_W / 2) * sx, BOX_D * sx, BOX_W * sx);
  c.stroke();
  const cam = RD.cam, vh = cam.vw * RD.h / RD.w;
  c.strokeStyle = 'rgba(244,198,79,0.35)';
  c.strokeRect(rx + clamp((cam.x - cam.vw / 2) * sx, 0, rw), ry + clamp((cam.y - vh / 2) * sx, 0, rh),
    Math.min(rw, cam.vw * sx), Math.min(rh, vh * sx));
  for (const p of G.players) {
    const x = rx + clamp(p.x, 0, FW) * sx, y = ry + clamp(p.y, 0, FH) * sx;
    const mine = p === localCtrl();
    dot(c, x, y, mine ? 3.8 : 2.7, teamInk(p.team));
    if (mine) { c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 3.8, 0, TAU); c.stroke(); }
  }
  dot(c, rx + clamp(G.ball.x, 0, FW) * sx, ry + clamp(G.ball.y, 0, FH) * sx, 2.3, '#ffffff');
}
function drawTicker(c) {
  const last = G.ticker[G.ticker.length - 1];
  if (!last) return;
  const age = G.time - last.t;
  if (age > 4) return;
  const fs = clamp(RD.w / 58, 12, 16);
  c.font = `600 ${fs}px ${BODY}`;
  const w = c.measureText(last.text).width + 24, h = fs + 14;
  const x = RD.w / 2 - w / 2, y = RD.h - h - 12;
  c.globalAlpha = Math.min(1, (4 - age) * 2);
  pill(c, x, y, w, h, h / 2, 'rgba(6,12,10,0.72)');
  c.fillStyle = '#eef2ea'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(last.text, RD.w / 2, y + h / 2 + 1);
  c.globalAlpha = 1;
}
function chip(c, text, y, col, size) {
  c.font = `600 ${size}px ${DISPLAY}`;
  const w = c.measureText(text).width + 26, h = size + 6;
  pill(c, RD.w / 2 - w / 2, y, w, h, 4, 'rgba(6,12,10,0.74)');
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, RD.w / 2, y + h / 2 + size * 0.1);
  return y + h;
}
function hintLine(c, text, y) {
  const fs = clamp(RD.w / 64, 11, 14);
  c.font = `600 ${fs}px ${BODY}`;
  const w = c.measureText(text).width + 20;
  pill(c, RD.w / 2 - w / 2, y, w, fs + 10, 4, 'rgba(6,12,10,0.6)');
  c.fillStyle = '#c9d6cf'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, RD.w / 2, y + (fs + 10) / 2 + 1);
}
function drawShootout(c) {
  const so = G.shootout;
  const n = Math.max(5, so.kicks[0].length, so.kicks[1].length);
  const r = 7, gap = 19, labelW = 46, w = labelW + n * gap + 14, h = 58;
  const x = RD.w / 2 - w / 2, y = 12;
  pill(c, x, y, w, h, 6, 'rgba(6,12,10,0.76)');
  for (let t = 0; t < 2; t++) {
    const yy = y + 17 + t * 24;
    c.font = `600 20px ${DISPLAY}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = teamInk(G.teams[t]); c.fillText(G.teams[t].def.short, x + 10, yy + 2);
    for (let i = 0; i < n; i++) {
      const cx = x + labelW + i * gap + r, k = so.kicks[t][i];
      c.lineWidth = 2;
      if (k === true) dot(c, cx, yy, r, '#55c46a');
      else if (k === false) {
        dot(c, cx, yy, r, '#e8483c');
        c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(cx - 3, yy - 3); c.lineTo(cx + 3, yy + 3); c.moveTo(cx + 3, yy - 3); c.lineTo(cx - 3, yy + 3); c.stroke();
      } else { c.strokeStyle = 'rgba(238,242,234,0.4)'; c.beginPath(); c.arc(cx, yy, r - 1, 0, TAU); c.stroke(); }
    }
  }
}
function drawNetBadge(c) {
  const n = G.netInfo;
  if (!n) return;
  const fs = clamp(RD.w / 70, 11, 14);
  c.font = `600 ${fs}px ${BODY}`;
  const text = `${n.left} · ${n.right}`;
  const w = c.measureText(text).width + 22, h = fs + 12;
  pill(c, 12, 12, w, h, 4, 'rgba(6,12,10,0.74)');
  c.fillStyle = '#eef2ea'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(text, 23, 12 + h / 2 + 1);
  if (n.lag > 1.5) {
    const t = 'Connessione instabile…';
    const tw = c.measureText(t).width + 22;
    pill(c, 12, 18 + h, tw, h, 4, 'rgba(232,72,60,0.85)');
    c.fillStyle = '#ffffff'; c.fillText(t, 23, 18 + h + h / 2 + 1);
  }
}
function drawHUD(c) {
  if (G.mode === 'attract') return;
  drawRadar(c);
  if (G.mode === 'online' && G.phase !== 'replay') drawNetBadge(c);
  if (G.shootout) drawShootout(c);
  const top = G.shootout ? 80 : 12;
  if (G.phase === 'set' && G.sp && G.sp.type !== 'kickoff') {
    const y = chip(c, SP_LABEL[G.sp.type].toUpperCase(), top, '#f4c64f', 22);
    if (G.user === G.sp.ti && G.sp.type === 'penalty') {
      hintLine(c, RD.touch ? 'Joystick su o giù per scegliere l\'angolo · Tiro' : '↑ o ↓ per scegliere l\'angolo · Spazio tira', y + 6);
    } else if (G.user === G.sp.ti) {
      hintLine(c, RD.touch ? 'Mira col joystick · Passa · Lancio · Tiro' : 'Mira con le frecce · X passa · C lancia · Spazio tira', y + 6);
    } else if (G.sp.type === 'penalty') {
      hintLine(c, RD.touch ? 'Tieni il joystick su o giù per tuffarti' : 'Tieni ↑ o ↓ per scegliere dove tuffarti', y + 6);
    }
  }
  if (G.phase === 'replay') {
    const blink = Math.sin(G.time * 6) > 0;
    pill(c, 12, 12, 98, 30, 4, 'rgba(6,12,10,0.74)');
    if (blink) dot(c, 27, 27, 5, '#e8483c');
    c.font = `600 22px ${DISPLAY}`; c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('REPLAY', 38, 29);
    if (G.mode !== 'online') hintLine(c, RD.touch ? 'Tocca per saltare' : 'Premi un tasto per saltare', RD.h - 40);
  }
  if (G.phase === 'goal') {
    const gi = G.goalInfo;
    const age = G.shootout ? 3 - G.phaseT : G.time - (gi ? gi.t : 0);
    const s = Math.min(1, age * 4), fs = Math.min(RD.w * 0.17, 150) * (0.6 + 0.4 * s);
    c.save();
    c.translate(RD.w / 2, RD.h * 0.42);
    c.rotate(-0.05);
    c.font = `600 ${fs}px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const ti = gi ? gi.ti : G.shootout ? G.shootout.turn : 0;
    c.lineWidth = fs * 0.08; c.strokeStyle = G.teams[ti].kit.shirt; c.lineJoin = 'round';
    const word = G.shootout ? 'SEGNATO!' : 'GOL!';
    c.strokeText(word, 0, 0);
    c.fillStyle = '#ffffff'; c.fillText(word, 0, 0);
    c.restore();
    if (gi && gi.scorer) {
      const t = gi.own ? `Autogol di ${gi.scorer.name} · ${gi.minute}'` : `${gi.scorer.name} · ${gi.minute}'`;
      chip(c, t, RD.h * 0.42 + fs * 0.45, '#f4c64f', 24);
    }
  }
  if (G.phase !== 'replay') drawTicker(c);
}

function render(dt) {
  const c = RD.ctx;
  if (!G.ball || !G.teams.length) return;
  buildBackground();
  updateCam(dt);
  const cam = RD.cam, z = RD.w / cam.vw;
  const shx = G.shake > 0 ? rnd(-1, 1) * G.shake * 7 : 0, shy = G.shake > 0 ? rnd(-1, 1) * G.shake * 7 : 0;
  c.setTransform(RD.dpr, 0, 0, RD.dpr, 0, 0);
  c.fillStyle = '#0a1310'; c.fillRect(0, 0, RD.w, RD.h);
  const ox = RD.w / 2 - cam.x * z + shx, oy = RD.h / 2 - cam.y * z + shy;
  c.setTransform(RD.dpr * z, 0, 0, RD.dpr * z, RD.dpr * ox, RD.dpr * oy);
  const bob = G.phase === 'goal' ? Math.sin(G.time * 14) * 1.6 : 0;
  c.drawImage(RD.stands, -MX, -MY + bob, FW + 2 * MX, FH + 2 * MY);
  c.drawImage(RD.pitch, -130, -125, FW + 260, FH + 250);
  drawFlashes(c);
  drawLines(c);
  drawGoal(c, 0, false); drawGoal(c, 1, false);
  drawShadows(c);
  drawMarkers(c);
  drawTrail(c);
  const ents = G.players.map(p => ({ y: p.y, p }));
  ents.push({ y: G.ball.y + 0.5, ball: true });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.ball ? drawBall(c) : drawPlayer(c, e.p);
  drawGoal(c, 0, true); drawGoal(c, 1, true);
  drawFlags(c);
  drawParts(c);
  drawTags(c);
  c.setTransform(RD.dpr, 0, 0, RD.dpr, 0, 0);
  drawHUD(c);
}
