'use strict';
/* 空洞余响 — WebAudio 程序化音效 */

const AUDIO = {
  ctx: null, master: null, noiseBuf: null, muted: false,
  droneOsc: [], droneFilter: null, droneGain: null,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      /* 白噪声缓冲 */
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startDrone();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  /* 环境低鸣 */
  startDrone() {
    const c = this.ctx;
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0.045;
    this.droneFilter = c.createBiquadFilter();
    this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 220;
    this.droneFilter.connect(this.droneGain); this.droneGain.connect(this.master);
    for (const [f, det] of [[55, 0], [55.7, 3], [82.5, -4]]) {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
      o.connect(this.droneFilter); o.start();
      this.droneOsc.push(o);
    }
    /* 风声 */
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.016;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lg = c.createGain(); lg.gain.value = 0.01;
    lfo.connect(lg); lg.connect(wg.gain);
    src.connect(bp); bp.connect(wg); wg.connect(this.master);
    src.start(); lfo.start();
  },
  drone(theme) {
    if (!this.ctx) return;
    const f = { pale: 200, cross: 230, fungal: 320, abyss: 140, arena: 240, throne: 170 }[theme] || 220;
    this.droneFilter.frequency.linearRampToValueAtTime(f, this.ctx.currentTime + 1.2);
  },

  tone(o) {
    const c = this.ctx, t = c.currentTime;
    const osc = c.createOscillator(), gn = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(o.vol, t + (o.atk || 0.008));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(gn); gn.connect(this.master);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },
  noise(o) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.dur);
    f.Q.value = o.q || 1;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(o.vol, t + (o.atk || 0.006));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(gn); gn.connect(this.master);
    src.start(t); src.stop(t + o.dur + 0.05);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    this.resume();
    switch (name) {
      case 'jump': this.tone({ type: 'sine', f0: 280, f1: 480, dur: 0.13, vol: 0.12 }); break;
      case 'djump': this.tone({ type: 'sine', f0: 420, f1: 760, dur: 0.16, vol: 0.12 }); this.noise({ f0: 1200, f1: 2400, dur: 0.12, vol: 0.05 }); break;
      case 'land': this.noise({ f0: 300, f1: 120, dur: 0.09, vol: 0.08 }); break;
      case 'dash': this.noise({ f0: 1400, f1: 260, dur: 0.18, vol: 0.16 }); break;
      case 'dashBig': this.noise({ f0: 1800, f1: 200, dur: 0.3, vol: 0.2 }); break;
      case 'slash': this.noise({ f0: 2600, f1: 700, dur: 0.1, vol: 0.2, q: 1.4 }); this.tone({ type: 'sine', f0: 900, f1: 300, dur: 0.07, vol: 0.05 }); break;
      case 'slashBig': this.noise({ f0: 2200, f1: 300, dur: 0.26, vol: 0.3, q: 1 }); this.tone({ type: 'sine', f0: 500, f1: 120, dur: 0.2, vol: 0.14 }); break;
      case 'hit': this.noise({ f0: 500, f1: 180, dur: 0.08, vol: 0.22 }); this.tone({ type: 'sine', f0: 180, f1: 70, dur: 0.1, vol: 0.16 }); break;
      case 'bossHit': this.noise({ f0: 400, f1: 120, dur: 0.12, vol: 0.26 }); this.tone({ type: 'sine', f0: 130, f1: 55, dur: 0.16, vol: 0.22 }); break;
      case 'kill': this.noise({ f0: 900, f1: 200, dur: 0.2, vol: 0.14 }); break;
      case 'hurt': this.tone({ type: 'sawtooth', f0: 320, f1: 90, dur: 0.32, vol: 0.2 }); this.noise({ f0: 800, f1: 200, dur: 0.2, vol: 0.12 }); break;
      case 'death': this.tone({ type: 'sine', f0: 240, f1: 40, dur: 1.3, vol: 0.24 }); this.noise({ f0: 600, f1: 80, dur: 1, vol: 0.1 }); break;
      case 'pogo': this.tone({ type: 'sine', f0: 500, f1: 830, dur: 0.1, vol: 0.12 }); break;
      case 'heal': this.tone({ type: 'sine', f0: 520, f1: 900, dur: 0.5, vol: 0.14 }); this.tone({ type: 'sine', f0: 780, f1: 1350, dur: 0.5, vol: 0.07 }); break;
      case 'spell': this.noise({ f0: 400, f1: 2200, dur: 0.26, vol: 0.16 }); this.tone({ type: 'sine', f0: 260, f1: 90, dur: 0.24, vol: 0.12 }); break;
      case 'spell2': this.tone({ type: 'sine', f0: 700, f1: 320, dur: 0.14, vol: 0.09 }); break;
      case 'blink': this.tone({ type: 'sine', f0: 900, f1: 2400, dur: 0.12, vol: 0.07 }); break;
      case 'geo': this.tone({ type: 'triangle', f0: 1350, f1: 1500, dur: 0.05, vol: 0.06 }); break;
      case 'bench': this.tone({ type: 'sine', f0: 660, dur: 0.5, vol: 0.1 }); this.tone({ type: 'sine', f0: 990, dur: 0.7, vol: 0.07 }); break;
      case 'fly': this.noise({ f0: 1000, f1: 1600, dur: 0.14, vol: 0.06 }); break;
      case 'warn': this.tone({ type: 'square', f0: 180, f1: 240, dur: 0.12, vol: 0.07 }); break;
      case 'roar': this.tone({ type: 'sawtooth', f0: 110, f1: 46, dur: 0.9, vol: 0.3 }); this.noise({ f0: 220, f1: 60, dur: 0.8, vol: 0.2, ftype: 'lowpass' }); break;
      case 'roar2': this.tone({ type: 'sawtooth', f0: 140, f1: 70, dur: 0.4, vol: 0.2 }); break;
      case 'slam': this.noise({ f0: 240, f1: 60, dur: 0.3, vol: 0.3, ftype: 'lowpass' }); this.tone({ type: 'sine', f0: 90, f1: 38, dur: 0.3, vol: 0.26 }); break;
      case 'gate': this.noise({ f0: 160, f1: 60, dur: 0.5, vol: 0.28, ftype: 'lowpass' }); break;
      case 'orb': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone({ type: 'sine', f0: f, dur: 0.7, vol: 0.1 }), i * 110)); break;
      case 'ui': this.tone({ type: 'sine', f0: 800, dur: 0.06, vol: 0.05 }); break;
    }
  },
};
