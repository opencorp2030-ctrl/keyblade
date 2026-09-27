// Area hazards: boss shockwaves, lasers, telegraph markers and the AFTERIMAGE trail.
// Each hazard has update(w, h, dt) -> false when finished. Rendering lives in render.js.

import { hurtPlayer, damageEnemy } from './combat.js';
import { pointSegDist, raycast } from './collision.js';

/** Expanding ring. The player must DASH through it (dash i-frames) or be outside it. */
export function addShockwave(w, x, y, o = {}) {
  w.hazards.push({
    kind: 'shock', x, y, r: 12, speed: o.speed ?? 260, maxR: o.maxR ?? 560, width: o.width ?? 16,
    color: o.color ?? '#4db8ff', hit: false,
    update(w, h, dt) {
      h.r += h.speed * dt * w.enemyTimeScale;
      const p = w.player;
      if (!h.hit && p.alive) {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (Math.abs(d - h.r) < h.width / 2 + p.r - 3) {
          if (p.dash.t > 0) {
            h.hit = true;
            w.onPerfectDodge(p);
          } else if (hurtPlayer(w, h)) h.hit = true;
        }
      }
      return h.r < h.maxR;
    },
  });
}

/** Rotating beam anchored to an entity. Telegraphs (thin, harmless) before it fires. */
export function addLaser(w, owner, angle, o = {}) {
  w.hazards.push({
    kind: 'laser', owner, angle, spin: o.spin ?? 0.7, warn: o.warn ?? 1.0, dur: o.dur ?? 2.6, t: 0,
    width: o.width ?? 9, color: o.color ?? '#4d8bff', ex: owner.x, ey: owner.y, sounded: false,
    update(w, h, dt) {
      const s = dt * w.enemyTimeScale;
      h.t += s;
      if (h.owner.dead) return false;
      const live = h.t > h.warn;
      if (live) h.angle += h.spin * s;
      else h.angle += h.spin * s * 0.15;
      const end = raycast(w.grid, h.owner.x, h.owner.y, h.angle);
      h.ex = end.x;
      h.ey = end.y;
      if (live && !h.sounded) {
        h.sounded = true;
        w.sfx('laser');
        w.effects.shake(0.2);
      }
      const p = w.player;
      if (live && p.alive && p.dash.t <= 0) {
        if (pointSegDist(p.x, p.y, h.owner.x, h.owner.y, h.ex, h.ey) < h.width / 2 + p.r - 2) hurtPlayer(w, h.owner);
      }
      return h.t < h.warn + h.dur;
    },
  });
}

/** Purely visual warning circle (e.g. where a boss will land). */
export function addMarker(w, x, y, o = {}) {
  w.hazards.push({
    kind: 'marker', x, y, r: o.r ?? 40, t: 0, dur: o.dur ?? 0.8, color: o.color ?? '#ff4d7a', follow: o.follow ?? null,
    update(w, h, dt) {
      h.t += dt;
      if (h.follow) {
        h.x = h.follow.x;
        h.y = h.follow.y;
      }
      return h.t < h.dur;
    },
  });
}

/** AFTERIMAGE upgrade: a burning ghost that damages enemies standing in it. */
export function addTrail(w, x, y, dmg) {
  w.hazards.push({
    kind: 'trail', x, y, r: 16, t: 0, dur: 1.2, acc: 0, color: '#ff9a3c',
    update(w, h, dt) {
      h.t += dt;
      h.acc -= dt;
      if (h.acc <= 0) {
        h.acc = 0.2;
        for (const e of w.enemies) {
          if (e.dead || e.spawning) continue;
          if (Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) damageEnemy(w, e, dmg, { canCrit: false, source: 'trail' });
        }
      }
      return h.t < h.dur;
    },
  });
}

export function updateHazards(w, dt) {
  w.hazards = w.hazards.filter((h) => h.update(w, h, dt));
}
