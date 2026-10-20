'use strict';
// Suoni sintetizzati: niente file esterni
const Sound = {
  ctx: null, master: null, sfx: null, noise: null, crowdGain: null, crowdFilter: null,
  muted: false, quiet: true, lastKick: 0,

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      } catch (e) { this.ctx = null; return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.6 + last * 3; }
      this.startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  },
  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 0.45;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.crowdGain = g; this.crowdFilter = f;
  },
  // livello 0..1: quanto è vicina l'azione a una porta
  crowd(level, inMenu) {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    const v = inMenu ? 0.035 : 0.06 + level * 0.16;
    this.crowdGain.gain.setTargetAtTime(v, t, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(560 + level * 380, t, 0.4);
  },
  ok() { return this.ctx && !this.muted && !this.quiet; },
  tone(f0, f1, dur, type, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
  burst(dur, freq, q, vol, type = 'bandpass', attack = 0.01, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return f;
  },
  kick(speed) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastKick < 0.04) return;
    this.lastKick = now;
    const v = clamp(speed / 1000, 0.12, 0.6);
    this.tone(150, 50, 0.11, 'sine', v);
    this.burst(0.05, 1800, 0.8, v * 0.35, 'bandpass', 0.002);
  },
  head() { if (this.ok()) { this.tone(240, 120, 0.08, 'sine', 0.25); this.burst(0.05, 900, 1, 0.15, 'bandpass', 0.002); } },
  post() {
    if (!this.ok()) return;
    this.tone(880, 860, 0.7, 'triangle', 0.22);
    this.tone(1320, 1290, 0.5, 'sine', 0.12);
    this.tone(2140, 2100, 0.3, 'sine', 0.06);
  },
  whistle(n = 1, long = false) {
    if (!this.ok()) return;
    for (let i = 0; i < n; i++) {
      const d = long && i === n - 1 ? 0.85 : 0.26, at = i * 0.36;
      this.tone(2900, 2820, d, 'square', 0.035, at);
      this.tone(3050, 2980, d, 'square', 0.02, at);
    }
  },
  roar() {
    if (!this.ok()) return;
    const f = this.burst(3.2, 700, 0.5, 0.55, 'bandpass', 0.35);
    f.frequency.setValueAtTime(600, this.ctx.currentTime);
    f.frequency.linearRampToValueAtTime(1100, this.ctx.currentTime + 1.2);
    this.burst(2.4, 2400, 0.7, 0.12, 'bandpass', 0.2, 0.1);
  },
  ooh() {
    if (!this.ok()) return;
    const f = this.burst(1.3, 500, 2.5, 0.3, 'bandpass', 0.15);
    f.frequency.setValueAtTime(420, this.ctx.currentTime);
    f.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 1.2);
  },
  net() { if (this.ok()) this.burst(0.35, 3200, 0.6, 0.18, 'highpass', 0.01); },
  swish() {
    if (!this.ok()) return;
    const f = this.burst(0.22, 1400, 1.2, 0.16, 'bandpass', 0.03);
    f.frequency.setValueAtTime(900, this.ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(3200, this.ctx.currentTime + 0.2);
  },
  click() { if (this.ctx && !this.muted) this.tone(660, 520, 0.05, 'sine', 0.08); }
};
