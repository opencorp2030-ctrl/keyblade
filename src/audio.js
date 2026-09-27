// WebAudio synth: every sound effect and all music are generated at runtime (no asset files).
// The AudioContext is created on the first key press (browsers require a user gesture).

import { settings } from './settings.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Minimum milliseconds between two plays of the same effect (prevents ear-splitting stacks).
const RATE_LIMIT = { hit: 35, pulse: 45, xp: 25, kill: 30, enemyShot: 60, block: 60, move: 20 };

const SFX = {
  move: (a) => a.tone({ type: 'triangle', f: 540, dur: 0.045, vol: 0.05 }),
  select: (a) => {
    a.tone({ type: 'square', f: 660, f2: 990, dur: 0.07, vol: 0.06 });
    a.tone({ type: 'triangle', f: 1320, dur: 0.08, vol: 0.04, when: 0.04 });
  },
  back: (a) => a.tone({ type: 'square', f: 520, f2: 260, dur: 0.09, vol: 0.06 }),
  deny: (a) => {
    a.tone({ type: 'square', f: 180, dur: 0.07, vol: 0.07 });
    a.tone({ type: 'square', f: 150, dur: 0.09, vol: 0.07, when: 0.08 });
  },
  slash: (a) => {
    a.noise({ dur: 0.1, vol: 0.2, filter: 4200, f2: 900, type: 'bandpass', q: 1.2 });
    a.tone({ type: 'sawtooth', f: 320, f2: 110, dur: 0.08, vol: 0.04 });
  },
  pulse: (a) => a.tone({ type: 'square', f: 980, f2: 320, dur: 0.07, vol: 0.035 }),
  scatter: (a) => {
    a.noise({ dur: 0.16, vol: 0.28, filter: 1400, f2: 300, type: 'lowpass' });
    a.tone({ type: 'sawtooth', f: 200, f2: 55, dur: 0.12, vol: 0.06 });
  },
  arc: (a) => {
    a.tone({ type: 'sawtooth', f: 1400, f2: 180, dur: 0.14, vol: 0.05 });
    a.noise({ dur: 0.12, vol: 0.12, filter: 5000, type: 'highpass' });
  },
  swap: (a) => a.tone({ type: 'triangle', f: 700, f2: 1400, dur: 0.06, vol: 0.05 }),
  hit: (a, o = {}) => a.tone({ type: 'square', f: 240 * (o.pitch || 1), f2: 90, dur: 0.05, vol: 0.06 }),
  crit: (a) => {
    a.tone({ type: 'square', f: 520, f2: 180, dur: 0.07, vol: 0.08 });
    a.noise({ dur: 0.05, vol: 0.12, filter: 6000, type: 'highpass' });
  },
  block: (a) => a.tone({ type: 'triangle', f: 1800, f2: 1500, dur: 0.05, vol: 0.05 }),
  kill: (a, o = {}) => {
    const p = o.pitch || 1;
    a.noise({ dur: 0.12, vol: 0.14, filter: 2400, f2: 400, type: 'lowpass' });
    a.tone({ type: 'triangle', f: 330 * p, f2: 660 * p, dur: 0.09, vol: 0.07 });
  },
  dash: (a) => a.noise({ dur: 0.17, vol: 0.18, filter: 600, f2: 3200, type: 'bandpass', q: 2 }),
  recharge: (a) => a.tone({ type: 'sine', f: 1200, dur: 0.05, vol: 0.03 }),
  dodge: (a) => {
    a.tone({ type: 'triangle', f: 1046, dur: 0.06, vol: 0.06 });
    a.tone({ type: 'triangle', f: 1568, dur: 0.08, vol: 0.05, when: 0.05 });
  },
  hurt: (a) => {
    a.tone({ type: 'sawtooth', f: 220, f2: 50, dur: 0.32, vol: 0.2 });
    a.noise({ dur: 0.25, vol: 0.25, filter: 1200, type: 'lowpass' });
  },
  xp: (a, o = {}) => a.tone({ type: 'sine', f: 880 * (o.pitch || 1), dur: 0.05, vol: 0.035 }),
  pickup: (a) => {
    a.tone({ type: 'square', f: 784, dur: 0.07, vol: 0.05 });
    a.tone({ type: 'square', f: 1175, dur: 0.1, vol: 0.05, when: 0.07 });
  },
  heal: (a) => [523, 659, 784].forEach((f, i) => a.tone({ type: 'triangle', f, dur: 0.12, vol: 0.07, when: i * 0.06 })),
  levelup: (a) =>
    [523, 659, 784, 1046, 1318].forEach((f, i) => a.tone({ type: 'square', f, dur: 0.14, vol: 0.05, when: i * 0.055 })),
  choose: (a) => [784, 1175, 1568].forEach((f, i) => a.tone({ type: 'triangle', f, dur: 0.12, vol: 0.07, when: i * 0.05 })),
  special: (a) => {
    a.tone({ type: 'sawtooth', f: 110, f2: 880, dur: 0.45, vol: 0.12 });
    a.noise({ dur: 0.5, vol: 0.2, filter: 300, f2: 6000, type: 'bandpass', q: 0.8 });
  },
  explode: (a) => {
    a.noise({ dur: 0.55, vol: 0.4, filter: 900, f2: 80, type: 'lowpass' });
    a.tone({ type: 'sine', f: 140, f2: 35, dur: 0.45, vol: 0.3 });
  },
  enemyShot: (a) => a.tone({ type: 'triangle', f: 460, f2: 240, dur: 0.09, vol: 0.04 }),
  telegraph: (a) => a.tone({ type: 'sine', f: 300, f2: 600, dur: 0.25, vol: 0.05 }),
  spawn: (a) => a.tone({ type: 'sine', f: 200, f2: 420, dur: 0.2, vol: 0.03 }),
  wave: (a) => [392, 523, 659].forEach((f, i) => a.tone({ type: 'sawtooth', f, dur: 0.18, vol: 0.05, when: i * 0.09 })),
  clear: (a) => [523, 659, 784, 1046].forEach((f, i) => a.tone({ type: 'square', f, dur: 0.2, vol: 0.05, when: i * 0.08 })),
  portal: (a) => {
    a.tone({ type: 'sine', f: 220, f2: 1760, dur: 0.6, vol: 0.12 });
    a.noise({ dur: 0.6, vol: 0.1, filter: 800, f2: 5000, type: 'bandpass' });
  },
  combo: (a, o = {}) => a.tone({ type: 'square', f: 660 * (o.pitch || 1), f2: 1320 * (o.pitch || 1), dur: 0.12, vol: 0.06 }),
  comboLost: (a) => a.tone({ type: 'sawtooth', f: 400, f2: 120, dur: 0.25, vol: 0.05 }),
  bossRoar: (a) => {
    a.tone({ type: 'sawtooth', f: 90, f2: 45, dur: 1.1, vol: 0.22 });
    a.tone({ type: 'square', f: 93, f2: 44, dur: 1.1, vol: 0.12 });
    a.noise({ dur: 1, vol: 0.2, filter: 500, type: 'lowpass' });
  },
  slam: (a) => {
    a.tone({ type: 'sine', f: 90, f2: 30, dur: 0.5, vol: 0.4 });
    a.noise({ dur: 0.35, vol: 0.3, filter: 600, type: 'lowpass' });
  },
  laser: (a) => a.tone({ type: 'sawtooth', f: 70, f2: 60, dur: 0.6, vol: 0.12 }),
  gameover: (a) => [392, 330, 262, 196].forEach((f, i) => a.tone({ type: 'triangle', f, dur: 0.35, vol: 0.1, when: i * 0.22 })),
  victory: (a) =>
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => a.tone({ type: 'square', f, dur: 0.22, vol: 0.06, when: i * 0.12 })),
};

// Music: tiny 16-step sequencer. Chords are semitone offsets from the track root (minor keys).
const TRACKS = {
  menu: { bpm: 92, root: 45, prog: [0, -4, -2, -5], bass: 'soft', drums: false, arpWave: 'triangle', arpVol: 0.03 },
  sector0: { bpm: 124, root: 45, prog: [0, -4, -2, -5], bass: 'drive', drums: true, arpWave: 'square', arpVol: 0.018 },
  sector1: { bpm: 132, root: 43, prog: [0, 3, -2, -4], bass: 'drive', drums: true, arpWave: 'square', arpVol: 0.018 },
  sector2: { bpm: 138, root: 41, prog: [0, -2, -4, -5], bass: 'drive', drums: true, arpWave: 'sawtooth', arpVol: 0.014 },
  boss: { bpm: 150, root: 40, prog: [0, 1, 0, -2], bass: 'boss', drums: true, arpWave: 'sawtooth', arpVol: 0.016 },
  victory: { bpm: 110, root: 48, prog: [0, 5, 7, 3], bass: 'soft', drums: true, arpWave: 'triangle', arpVol: 0.03, major: true },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.trackId = null;
    this.step = 0;
    this.nextTime = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this._schedule(), 25);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.sfxBus.gain.value = settings.sfx;
    this.musicBus.gain.value = settings.music * 0.6;
  }

  tone({ type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.1, attack = 0.004, when = 0, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, ctx.currentTime + when);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.2, filter = 2000, f2 = null, type = 'lowpass', q = 1, when = 0, bus = this.sfxBus }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(filter, t);
    if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, opts) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const limit = RATE_LIMIT[name] ?? 16;
    if (this.last[name] && now - this.last[name] < limit) return;
    this.last[name] = now;
    SFX[name]?.(this, opts);
  }

  setTrack(id) {
    if (this.trackId === id) return;
    this.trackId = id;
    this.step = 0;
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const tr = TRACKS[this.trackId];
    if (!tr) {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / tr.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this._playStep(tr, this.step, this.nextTime - ctx.currentTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  _playStep(tr, step, when, stepDur) {
    const bus = this.musicBus;
    const s = step % 16;
    const bar = Math.floor(step / 16) % tr.prog.length;
    const root = tr.root + tr.prog[bar];
    const third = tr.major ? 4 : 3;
    const chord = [0, third, 7, 12];

    // Bass
    if (tr.bass === 'soft' && s % 8 === 0) {
      this.tone({ type: 'triangle', f: midi(root), dur: stepDur * 7, vol: 0.12, attack: 0.05, when, bus });
    } else if (tr.bass === 'drive' && s % 2 === 0) {
      const oct = s % 8 === 6 ? 12 : 0;
      this.tone({ type: 'sawtooth', f: midi(root + oct), dur: stepDur * 1.6, vol: 0.06, when, bus });
    } else if (tr.bass === 'boss') {
      const pat = [0, 0, 12, 0, 0, 13, 0, 12];
      this.tone({ type: 'sawtooth', f: midi(root + pat[s % 8]), dur: stepDur * 0.9, vol: 0.055, when, bus });
    }

    // Arpeggio
    const arpNote = root + 24 + chord[(s + Math.floor(s / 4)) % 4];
    if (tr.bass === 'soft' ? s % 2 === 0 : true) {
      this.tone({ type: tr.arpWave, f: midi(arpNote), dur: stepDur * 0.9, vol: tr.arpVol, when, bus });
    }

    // Drums
    if (!tr.drums) return;
    if (s % 4 === 0) this.tone({ type: 'sine', f: 150, f2: 42, dur: 0.16, vol: 0.32, when, bus });
    if (s % 8 === 4) this.noise({ dur: 0.12, vol: 0.12, filter: 1800, type: 'bandpass', when, bus });
    if (s % 2 === 1) this.noise({ dur: 0.03, vol: 0.045, filter: 7000, type: 'highpass', when, bus });
  }
}

export const audio = new AudioEngine();
