// Juice: particles, floating numbers, rings, screen shake, flashes and hit-stop.

import { settings, shakeScale } from './settings.js';
import { rand, TAU } from './math.js';

const MAX_PARTICLES = 900;

export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.trauma = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.hitstop = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  get density() {
    return settings.reducedMotion ? 0.35 : 1;
  }

  burst(x, y, o = {}) {
    const {
      count = 10, color = '#fff', speed = 160, life = 0.5, size = 3, spread = TAU, angle = 0,
      drag = 4, gravity = 0, shape = 'dot',
    } = o;
    const n = Math.ceil(count * this.density);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.35, 1);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(0.6, 1), max: life, size: size * rand(0.6, 1.2), color, drag, gravity, shape,
        rot: rand(0, TAU), vr: rand(-10, 10),
      });
    }
  }

  text(x, y, str, o = {}) {
    const { color = '#fff', size = 14, life = 0.75, vy = -46, weight = 700 } = o;
    if (this.texts.length > 80) this.texts.shift();
    this.texts.push({ x: x + rand(-6, 6), y, str: String(str), color, size, life, max: life, vy, weight });
  }

  ring(x, y, o = {}) {
    const { r0 = 4, r1 = 60, life = 0.35, color = '#fff', width = 3 } = o;
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * shakeScale());
  }

  flashScreen(color = '#fff', amount = 0.4) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, settings.reducedMotion ? amount * 0.25 : amount);
  }

  freeze(t) {
    this.hitstop = Math.max(this.hitstop, t);
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 12;
    this.shakeX = s ? rand(-s, s) : 0;
    this.shakeY = s ? rand(-s, s) : 0;
    this.flash = Math.max(0, this.flash - dt * 2.5);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.trauma = 0;
    this.flash = 0;
  }
}
