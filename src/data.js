'use strict';
// Campo da calcio a 7 in unità logiche (1 unità ≈ 4,5 cm)
const FW = 1440, FH = 900, CX = FW / 2, CY = FH / 2;
const GOAL_W = 150, GH = GOAL_W / 2, GOAL_D = 42, BAR_H = 62;
const BOX_D = 230, BOX_W = 560, SIX_D = 80, SIX_W = 270, PEN_D = 155, CIRCLE_R = 125;
const MX = 250, MY = 230;            // mondo oltre le linee: pista, cartelloni, tribune
const PR = 13, BR = 6.5, ZK = 0.6;   // raggio giocatore, raggio pallone, proiezione dell'altezza
const GRAV = 1500, ROLL = 290, DT = 1 / 60;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sgn = v => v < 0 ? -1 : 1;

function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffle(arr, r = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function colorDist(a, b) { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function luma(h) { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function inkOn(h) { return luma(h) > 0.6 ? '#10161a' : '#ffffff'; }

// skill: qualità della CPU; guard: quanto la CPU riesce a rubarti palla mentre la porti tu
const DIFFS = {
  facile: { label: 'Facile', skill: 0.55, guard: 0.3 },
  normale: { label: 'Normale', skill: 0.82, guard: 0.55 },
  difficile: { label: 'Difficile', skill: 1.02, guard: 0.8 }
};
const LENGTHS = [
  { v: 120, label: '2 min' },
  { v: 240, label: '4 min' },
  { v: 360, label: '6 min' }
];

// Squadre di fantasia. pattern: plain, stripes, hoops, sash, halves
const TEAMS = [
  { id: 'lido', name: 'Azzurri del Lido', short: 'LID', rating: 4, gk: '#f4c64f',
    home: { shirt: '#2f7fe0', trim: '#ffffff', socks: '#2f7fe0', pattern: 'plain' },
    away: { shirt: '#f2f3ee', trim: '#2f7fe0', socks: '#f2f3ee', pattern: 'plain' } },
  { id: 'lupi', name: 'Lupi Rossi', short: 'LUP', rating: 4, gk: '#3fbf7f',
    home: { shirt: '#d7362c', trim: '#f6c543', socks: '#7d1912', pattern: 'sash' },
    away: { shirt: '#22262c', trim: '#d7362c', socks: '#22262c', pattern: 'plain' } },
  { id: 'zebre', name: 'Zebre Notturne', short: 'ZEB', rating: 5, gk: '#9b6ad6',
    home: { shirt: '#f2f2ee', trim: '#16181b', socks: '#16181b', pattern: 'stripes' },
    away: { shirt: '#e8a33d', trim: '#16181b', socks: '#16181b', pattern: 'plain' } },
  { id: 'vipere', name: 'Vipere Verdi', short: 'VIP', rating: 3, gk: '#e86a3a',
    home: { shirt: '#1f9a55', trim: '#0f1a14', socks: '#1f9a55', pattern: 'hoops' },
    away: { shirt: '#f2efe6', trim: '#1f9a55', socks: '#f2efe6', pattern: 'plain' } },
  { id: 'leoni', name: "Leoni d'Oro", short: 'LEO', rating: 3, gk: '#3aa0e8',
    home: { shirt: '#f2b632', trim: '#1a2a4a', socks: '#1a2a4a', pattern: 'plain' },
    away: { shirt: '#1a2a4a', trim: '#f2b632', socks: '#1a2a4a', pattern: 'plain' } },
  { id: 'delfini', name: 'Delfini Celesti', short: 'DEL', rating: 2, gk: '#f06b8b',
    home: { shirt: '#7cc4ef', trim: '#ffffff', socks: '#ffffff', pattern: 'halves' },
    away: { shirt: '#0f2c4a', trim: '#7cc4ef', socks: '#0f2c4a', pattern: 'plain' } },
  { id: 'tori', name: 'Tori Granata', short: 'TOR', rating: 3, gk: '#d9d94a',
    home: { shirt: '#7c1f2b', trim: '#f3eee6', socks: '#7c1f2b', pattern: 'plain' },
    away: { shirt: '#f3eee6', trim: '#7c1f2b', socks: '#f3eee6', pattern: 'plain' } },
  { id: 'corvi', name: 'Corvi Viola', short: 'COR', rating: 2, gk: '#4ad1a6',
    home: { shirt: '#6a3fb5', trim: '#f4f1fa', socks: '#2a1a4a', pattern: 'stripes' },
    away: { shirt: '#f4f1fa', trim: '#6a3fb5', socks: '#f4f1fa', pattern: 'plain' } }
];
const teamById = id => TEAMS.find(t => t.id === id) || TEAMS[0];

// Modulo 1-2-3-1 in coordinate di squadra (x dalla propria porta)
const FORM = [
  { role: 'gk', x: 30, y: CY, n: 1 },
  { role: 'def', x: 290, y: CY - 175, n: 3 },
  { role: 'def', x: 290, y: CY + 175, n: 5 },
  { role: 'mid', x: 560, y: CY - 270, n: 7 },
  { role: 'mid', x: 520, y: CY, n: 8 },
  { role: 'mid', x: 560, y: CY + 270, n: 11 },
  { role: 'att', x: 700, y: CY, n: 9 }
];

const SURNAMES = ['Rossi', 'Bianchi', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo',
  'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana',
  'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile',
  'Vitale', 'Serra', 'Coppola', 'De Santis', "D'Angelo", 'Marchetti', 'Parisi', 'Villa', 'Ferri', 'Fabbri',
  'Marini', 'Grasso', 'Valentini', 'Messina', 'Sala', 'Gatti', 'Pellegrini', 'Palumbo', 'Sanna', 'Farina',
  'Monti', 'Cattaneo', 'Morelli', 'Amato', 'Silvestri', 'Mazza', 'Testa', 'Carbone', 'Benedetti', 'Barone',
  'Caputo', 'Guerra', 'Palmieri', 'Bernardi', 'Fiore', 'De Rosa', 'Bellini', 'Basile', 'Riva', 'Donati',
  'Piras', 'Sartori', 'Neri', 'Milani', 'Pagano', 'Orlando', 'Sorrentino', 'Cocco', 'Melis', 'Russo'];
const SKINS = ['#f1c9a5', '#e0ac7e', '#c68a5a', '#8d5a3b', '#5c3a24', '#f5d6bc', '#d49a6a'];
const HAIRS = ['#1d1510', '#3b2414', '#6b4423', '#a8752f', '#d9b26a', '#0d0d0d', '#5a5a5a', '#2b1d14'];

// ---------- attributi dei giocatori (20-99) ----------
// vel velocità, tir tiro, pas passaggio, dif contrasto, res resistenza, por portiere
const ATTRS = [['vel', 'Velocità', 'Vel'], ['tir', 'Tiro', 'Tir'], ['pas', 'Passaggio', 'Pas'], ['dif', 'Contrasto', 'Con'], ['res', 'Resistenza', 'Res'], ['por', 'Portiere', 'Por']];
const ROLE_NAMES = { gk: 'Portiere', def: 'Difensore', mid: 'Centrocampista', att: 'Attaccante' };
const ROLE_SHORT = { gk: 'POR', def: 'DIF', mid: 'CEN', att: 'ATT' };
function attrsFromSkill(sk, role, r = Math.random) {
  const base = 40 + 40 * sk, j = () => Math.round((r() - 0.5) * 8);
  const a = { vel: base + j(), tir: base + j(), pas: base + j(), dif: base + j(), res: base + j(), por: 30 + j() };
  if (role === 'att') { a.tir += 8; a.vel += 4; a.dif -= 10; }
  else if (role === 'mid') { a.pas += 6; a.res += 4; }
  else if (role === 'def') { a.dif += 8; a.tir -= 8; a.vel -= 2; }
  else { a.por = base + 4 + j(); a.vel -= 6; a.tir -= 15; a.dif -= 10; }
  for (const k in a) a[k] = clamp(Math.round(a[k]), 20, 99);
  return a;
}
// valutazione complessiva pesata sul ruolo
function overall(a, role) {
  const w = role === 'gk' ? { por: 0.7, pas: 0.1, vel: 0.1, res: 0.1 }
    : role === 'def' ? { dif: 0.4, vel: 0.2, pas: 0.15, res: 0.15, tir: 0.1 }
    : role === 'mid' ? { pas: 0.35, res: 0.2, vel: 0.15, tir: 0.15, dif: 0.15 }
    : { tir: 0.4, vel: 0.3, pas: 0.15, res: 0.1, dif: 0.05 };
  let s = 0;
  for (const k in w) s += (a[k] || 0) * w[k];
  return Math.round(s);
}

// ---------- personalizzazione del club ----------
const PALETTE = [
  ['#f2f3ee', 'Bianco'], ['#16181b', 'Nero'], ['#2f7fe0', 'Azzurro'], ['#7cc4ef', 'Celeste'],
  ['#0f2c4a', 'Blu notte'], ['#d7362c', 'Rosso'], ['#7c1f2b', 'Granata'], ['#f6c543', 'Giallo'],
  ['#e8a33d', 'Arancio'], ['#1f9a55', 'Verde'], ['#0f3d24', 'Verde scuro'], ['#6a3fb5', 'Viola'],
  ['#e86a9a', 'Rosa'], ['#8a8f96', 'Grigio'], ['#5c3a24', 'Marrone'], ['#3ccfc0', 'Turchese']
];
const PATTERNS = [['plain', 'Tinta unita'], ['stripes', 'Strisce'], ['hoops', 'Cerchi'], ['sash', 'Fascia'], ['halves', 'Metà']];
const CREST_SHAPES = [['shield', 'Scudo'], ['round', 'Tondo'], ['diamond', 'Rombo'], ['badge', 'Stemma']];
const CREST_FILLS = [['plain', 'Pieno'], ['split', 'Diviso'], ['stripes', 'Strisce'], ['band', 'Banda']];
const CREST_SYMBOLS = [['star', 'Stella'], ['ball', 'Pallone'], ['bolt', 'Fulmine'], ['crown', 'Corona'], ['moon', 'Luna'], ['none', 'Nessuno']];

let crestSeq = 0;
// stemma disegnato in SVG a partire dalle scelte del club
function crestSVG(cr, short) {
  const id = 'cr' + (++crestSeq);
  const shapes = {
    shield: 'M8 6H92V62Q92 94 50 112Q8 94 8 62Z',
    round: 'M50 8A50 50 0 1 1 49.9 8Z',
    diamond: 'M50 2L98 58L50 114L2 58Z',
    badge: 'M22 4H78L96 22V78L50 114L4 78V22Z'
  };
  const d = shapes[cr.shape] || shapes.shield;
  let fill = `<rect width="100" height="116" fill="${cr.c1}"/>`;
  if (cr.fill === 'split') fill += `<rect x="50" width="50" height="116" fill="${cr.c2}"/>`;
  else if (cr.fill === 'stripes') for (let x = 14; x < 100; x += 28) fill += `<rect x="${x}" width="14" height="116" fill="${cr.c2}"/>`;
  else if (cr.fill === 'band') fill += `<path d="M-10 70L70 -10H100V8L18 116H-10Z" fill="${cr.c2}"/>`;
  const sc = cr.sc || '#f6c543';
  const sym = {
    star: `<path d="M50 24L56.5 39.5L73 41L60.5 52L64.5 68L50 59.5L35.5 68L39.5 52L27 41L43.5 39.5Z" fill="${sc}"/>`,
    ball: `<circle cx="50" cy="46" r="20" fill="#f7f7f2" stroke="#16181b" stroke-width="2"/><path d="M50 36L59 42.5L55.5 53H44.5L41 42.5Z" fill="#16181b"/>`,
    bolt: `<path d="M56 22L36 50H49L43 72L65 42H52Z" fill="${sc}"/>`,
    crown: `<path d="M30 60V34L40 46L50 28L60 46L70 34V60Z" fill="${sc}"/><rect x="30" y="61" width="40" height="6" fill="${sc}"/>`,
    moon: `<path d="M58 24A23 23 0 1 0 58 68A18 18 0 1 1 58 24Z" fill="${sc}"/>`,
    none: ''
  }[cr.symbol] || '';
  const text = String(short || '').slice(0, 3).replace(/[<>&"]/g, '');
  return `<svg viewBox="0 0 100 116" role="img" aria-label="Stemma ${text}"><defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${fill}</g>${sym}` +
    `<rect x="26" y="78" width="48" height="20" rx="3" fill="rgba(8,14,12,0.7)"/>` +
    `<text x="50" y="93.5" text-anchor="middle" font-family="Teko, 'Arial Narrow', sans-serif" font-weight="600" font-size="19" letter-spacing="1" fill="#ffffff">${text}</text>` +
    `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="3"/></svg>`;
}
