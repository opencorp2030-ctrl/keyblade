// Q specials. The meter fills from dealing damage, killing and perfect dodges.

import { PALETTE } from './config.js';
import { TAU, rand } from './math.js';
import { damageEnemy, explode, healPlayer } from './combat.js';

export const SPECIALS = {
  whirlwind: {
    name: 'WHIRLWIND',
    desc: 'Spin a ring of blades around you for 2.5s. Shreds crowds and bullets.',
    color: '#4de3ff',
    duration: 2.5,
    start(w, p) {
      w.effects.ring(p.x, p.y, { r0: 10, r1: 110, life: 0.4, color: this.color, width: 5 });
    },
    tick(w, p, s, dt) {
      const radius = 84 * p.stats.area;
      s.acc -= dt;
      if (s.acc <= 0) {
        s.acc = 0.11;
        for (const e of w.enemies) {
          if (e.dead || e.spawning) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d > radius + e.r) continue;
          const nx = (e.x - p.x) / (d || 1);
          const ny = (e.y - p.y) / (d || 1);
          damageEnemy(w, e, 9 * p.stats.dmgMul, { kx: nx * 140, ky: ny * 140, source: 'special', canCrit: true });
        }
      }
      for (const b of w.projectiles) {
        if (b.team === 'enemy' && Math.hypot(b.x - p.x, b.y - p.y) < radius) b.dead = true;
      }
    },
  },
  overclock: {
    name: 'OVERCLOCK',
    desc: 'Slow enemies and their bullets to 30% and double your fire rate for 4.5s.',
    color: '#7dff6a',
    duration: 4.5,
    start(w) {
      w.enemyTimeTarget = 0.3;
    },
    end(w) {
      w.enemyTimeTarget = 1;
    },
  },
  shockwave: {
    name: 'SHOCKWAVE',
    desc: 'Blast everything nearby away, stun it, and erase bullets.',
    color: '#ffb347',
    duration: 0,
    start(w, p) {
      const r = 210 * p.stats.area;
      explode(w, p.x, p.y, r, 42 * p.stats.dmgMul, { color: this.color, stun: 1.6, knock: 650, source: 'special' });
      for (const b of w.projectiles) if (b.team === 'enemy' && Math.hypot(b.x - p.x, b.y - p.y) < r + 40) b.dead = true;
      w.effects.shake(0.7);
    },
  },
  rewind: {
    name: 'REWIND',
    desc: 'Snap back to where you were 2s ago, heal 1 HP and detonate both spots.',
    color: '#c38bff',
    duration: 0,
    start(w, p) {
      const past = p.history[0] ?? { x: p.x, y: p.y };
      explode(w, p.x, p.y, 100 * p.stats.area, 32 * p.stats.dmgMul, { color: this.color, source: 'special' });
      for (let i = p.history.length - 1; i >= 0; i -= 4) {
        const h = p.history[i];
        w.effects.burst(h.x, h.y, { count: 3, color: this.color, speed: 40, life: 0.5, size: 3 });
      }
      p.x = past.x;
      p.y = past.y;
      p.vx = p.vy = 0;
      p.invuln = Math.max(p.invuln, 0.7);
      explode(w, p.x, p.y, 100 * p.stats.area, 32 * p.stats.dmgMul, { color: this.color, source: 'special', quiet: true });
      healPlayer(w, 1, 'UNDO +1');
      p.history.length = 0;
    },
  },
};

export function tryActivateSpecial(w, p) {
  if (p.specialActive) return;
  if (p.meter < 100) {
    w.effects.text(p.x, p.y - 26, `${Math.floor(p.meter)}%`, { color: PALETTE.dim, size: 12, life: 0.5 });
    w.sfx('deny');
    return;
  }
  const def = SPECIALS[p.special];
  p.meter = 0;
  w.sfx('special');
  w.effects.flashScreen(def.color, 0.3);
  w.effects.shake(0.35);
  w.effects.burst(p.x, p.y, { count: 30, color: def.color, speed: 300, life: 0.6, size: 3.5 });
  w.callout(def.name, def.color);
  if (def.duration > 0) p.specialActive = { id: p.special, t: def.duration, max: def.duration, acc: 0 };
  def.start?.(w, p);
  w.run.specialsUsed++;
}

export function updateSpecial(w, p, dt) {
  const s = p.specialActive;
  if (!s) return;
  s.t -= dt;
  const def = SPECIALS[s.id];
  def.tick?.(w, p, s, dt);
  if (Math.random() < 0.5) {
    const a = rand(0, TAU);
    w.effects.burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, { count: 1, color: def.color, speed: 60, life: 0.4, size: 2 });
  }
  if (s.t <= 0) {
    def.end?.(w, p);
    p.specialActive = null;
  }
}
