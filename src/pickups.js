// XP shards, hearts, batteries and magnets.

import { PALETTE } from './config.js';
import { rand, TAU } from './math.js';
import { healPlayer } from './combat.js';
import { resolveCircle } from './collision.js';

export const PICKUP_STYLE = {
  xp: { color: '#4de3ff', r: 4 },
  heart: { color: '#ff4d7a', r: 7 },
  battery: { color: '#ffd24d', r: 6 },
  magnet: { color: '#c38bff', r: 7 },
};

export function dropPickup(w, kind, x, y, value = 1) {
  const a = rand(0, TAU);
  const s = rand(40, 150);
  w.pickups.push({
    kind, x, y, value, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
    r: PICKUP_STYLE[kind].r + (kind === 'xp' && value > 1 ? 2 : 0), magnet: false, life: kind === 'xp' ? 60 : 20,
  });
}

export function updatePickups(w, dt) {
  const p = w.player;
  const run = w.run;
  let xpStreak = 0;
  for (const it of w.pickups) {
    it.t += dt;
    it.life -= dt;
    const dx = p.x - it.x;
    const dy = p.y - it.y;
    const d = Math.hypot(dx, dy) || 1;
    if (p.alive && (it.magnet || d < p.stats.magnet)) {
      it.magnet = true;
      const pull = 520 + it.t * 200;
      it.vx += (dx / d) * pull * dt * 4;
      it.vy += (dy / d) * pull * dt * 4;
      const sp = Math.hypot(it.vx, it.vy);
      const max = 460 + it.t * 100;
      if (sp > max) {
        it.vx *= max / sp;
        it.vy *= max / sp;
      }
    } else {
      const k = Math.exp(-5 * dt);
      it.vx *= k;
      it.vy *= k;
    }
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (!it.magnet) resolveCircle(it, w.grid);

    if (p.alive && d < p.r + it.r + 4) {
      it.dead = true;
      collect(w, it, xpStreak++);
    } else if (it.life <= 0) it.dead = true;
  }
  w.pickups = w.pickups.filter((it) => !it.dead);
  if (xpStreak) run.xpChime = Math.min(2, (run.xpChime ?? 1) + 0.03 * xpStreak);
}

function collect(w, it, streak) {
  const p = w.player;
  const fx = w.effects;
  switch (it.kind) {
    case 'xp':
      w.addXp(it.value);
      if (streak < 3) w.sfx('xp', { pitch: w.run.xpChime ?? 1 });
      fx.burst(it.x, it.y, { count: 2, color: PICKUP_STYLE.xp.color, speed: 60, life: 0.2, size: 2 });
      break;
    case 'heart':
      if (!healPlayer(w, 1)) w.run.score += 100;
      break;
    case 'battery':
      p.meter = Math.min(100, p.meter + 35);
      fx.text(p.x, p.y - 22, '+35% SPECIAL', { color: PALETTE.gold, size: 13 });
      w.sfx('pickup');
      break;
    case 'magnet':
      for (const o of w.pickups) if (o.kind === 'xp') o.magnet = true;
      fx.text(p.x, p.y - 22, 'MAGNET', { color: PICKUP_STYLE.magnet.color, size: 14 });
      fx.ring(p.x, p.y, { r0: 10, r1: 400, life: 0.5, color: PICKUP_STYLE.magnet.color, width: 2 });
      w.sfx('pickup');
      break;
  }
}
