// Scene stack, main loop, canvas scaling, transitions and screen-reader announcements.

import { VIEW_W, VIEW_H, PALETTE } from './config.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { settings } from './settings.js';

export class Game {
  constructor(canvas, announcer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.announcer = announcer;
    this.input = new Input();
    this.audio = audio;
    this.stack = [];
    this.fade = null; // { t, dur, fn, phase: 'out'|'in' }
    this.time = 0;
    this.fps = 60;
    this.frames = 0;
    this.fpsAcc = 0;
    this.scale = 1;
    this.last = 0;
    this.params = new URLSearchParams(location.search);
  }

  start(firstScene) {
    this.input.attach();
    this.input.on((ev) => this.onKey(ev));
    this.input.onBlur = () => this.top?.onBlur?.();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setScene(firstScene);
    requestAnimationFrame((ts) => this.loop(ts));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    this.scale = s * dpr;
    this.canvas.width = Math.round(VIEW_W * this.scale);
    this.canvas.height = Math.round(VIEW_H * this.scale);
    this.canvas.style.width = `${Math.round(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.round(VIEW_H * s)}px`;
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  setScene(scene) {
    for (const s of this.stack) s.exit?.();
    this.stack = [scene];
    scene.enter?.();
  }

  push(scene) {
    this.stack.push(scene);
    scene.enter?.();
  }

  pop() {
    const s = this.stack.pop();
    s?.exit?.();
    this.top?.resume?.();
    return s;
  }

  /** Fade out, run fn (usually a scene change), fade back in. */
  transition(fn, dur = 0.28) {
    if (this.fade) return;
    const d = settings.reducedMotion ? 0.12 : dur;
    this.fade = { t: 0, dur: d, fn, phase: 'out' };
  }

  announce(msg) {
    if (!this.announcer) return;
    this.announcer.textContent = '';
    // Let the DOM clear first so identical consecutive messages are still read out.
    requestAnimationFrame(() => (this.announcer.textContent = msg));
  }

  onKey(ev) {
    audio.unlock();
    if (this.fade) return;
    this.top?.onKey?.(ev);
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.time += dt;
    this.frames++;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsAcc);
      this.frames = 0;
      this.fpsAcc = 0;
    }
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (f.phase === 'out' && f.t >= f.dur) {
        f.fn();
        f.phase = 'in';
        f.t = 0;
      } else if (f.phase === 'in' && f.t >= f.dur) {
        this.fade = null;
      }
    }
    // Physics in sub-steps of at most 1/60 s for stable collisions.
    const top = this.top;
    if (!top) return;
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) top.update?.(dt / steps);
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].overlay) start--;
    for (let i = start; i < this.stack.length; i++) this.stack[i].render(ctx, this);
    if (this.fade) {
      const f = this.fade;
      const k = f.phase === 'out' ? f.t / f.dur : 1 - f.t / f.dur;
      ctx.fillStyle = `rgba(3,4,10,${Math.min(1, Math.max(0, k))})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
