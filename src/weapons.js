// The four weapons (keys 1-4) and projectile simulation.
// Weapons auto-fire; the player's job is positioning, dashing and *switching* between them.
// Every weapon keeps its own cooldown, so weaving 1-2-3-4 is how you maximise damage.

import { PALETTE } from './config.js';
import { angleTo, angleDiff, rand, TAU } from './math.js';
import { damageEnemy, hurtPlayer } from './combat.js';
import { solidAt, overlap } from './collision.js';

export const WEAPONS = {
  edge: {
    slot: 1, name: 'EDGE', color: '#4de3ff', rate: 0.42, range: 66, dmg: 13,
    desc: 'Wide melee slash. Parries bullets and knocks enemies back.',
    perks: ['', 'Longer reach', 'Wider 160° arc', 'Double slash', 'Slashes launch a blade wave'],
  },
  pulse: {
    slot: 2, name: 'PULSE', color: '#7dff6a', rate: 0.2, range: 380, dmg: 6.5,
    desc: 'Rapid long-range bolts. Great for picking off shooters.',
    perks: ['', 'Twin bolts', 'Bolts pierce +1', 'Triple bolts', '+25% fire rate'],
  },
  scatter: {
    slot: 3, name: 'SCATTER', color: '#ffb347', rate: 0.78, range: 200, dmg: 5.5,
    desc: 'Short-range cone of pellets. Devastating point blank.',
    perks: ['', '+2 pellets', 'Longer range, harder knockback', '+2 pellets', 'Pellets pierce +1'],
  },
  arc: {
    slot: 4, name: 'ARC', color: '#c38bff', rate: 0.62, range: 240, dmg: 10,
    desc: 'Chain lightning that jumps between enemies.',
    perks: ['', '+1 chain', 'Stuns briefly', '+2 chains', 'Strikes twice'],
  },
};

export const WEAPON_ORDER = ['edge', 'pulse', 'scatter', 'arc'];
export const MAX_WEAPON_LEVEL = 5;

export function weaponRange(p, id) {
  const def = WEAPONS[id];
  const lvl = p.run.weapons[id];
  if (id === 'edge') return (def.range + (lvl >= 2 ? 14 : 0)) * p.stats.area;
  if (id === 'scatter') return def.range * (lvl >= 3 ? 1.3 : 1);
  return def.range;
}

export function weaponCooldown(p, id) {
  const lvl = p.run.weapons[id];
  let cd = WEAPONS[id].rate / p.stats.rateMul;
  if (id === 'pulse' && lvl >= 5) cd /= 1.25;
  if (p.specialActive?.id === 'overclock') cd *= 0.5;
  return cd;
}

function damageFor(p, id, swap) {
  const lvl = p.run.weapons[id];
  let d = WEAPONS[id].dmg * p.stats.dmgMul * (1 + 0.2 * (lvl - 1));
  if (swap) d *= 1 + p.stats.swapBonus;
  return d;
}

export function fireWeapon(w, p, id, angle) {
  const swap = p.swapBonus;
  p.swapBonus = false;
  const lvl = p.run.weapons[id];
  const dmg = damageFor(p, id, swap);
  if (swap) {
    w.effects.text(p.x, p.y - 24, 'SWAP STRIKE', { color: PALETTE.gold, size: 12, life: 0.6 });
    w.effects.ring(p.x, p.y, { r0: 8, r1: 46, life: 0.25, color: PALETTE.gold, width: 2 });
  }
  switch (id) {
    case 'edge':
      slash(w, p, angle, dmg, lvl, swap);
      if (lvl >= 4) w.later(0.12, () => p.alive && slash(w, p, angle + 0.35, dmg * 0.7, lvl, false));
      break;
    case 'pulse': {
      const n = 1 + (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0) + p.stats.projBonus;
      const pierce = (lvl >= 3 ? 1 : 0) + p.stats.pierce;
      for (let i = 0; i < n; i++) {
        const a = angle + (i - (n - 1) / 2) * 0.1;
        shoot(w, p, a, 640, { dmg, r: 4, pierce, life: weaponRange(p, id) / 640, color: WEAPONS.pulse.color, knock: 90, kind: 'bolt' });
      }
      w.sfx('pulse');
      break;
    }
    case 'scatter': {
      const n = 5 + (lvl >= 2 ? 2 : 0) + (lvl >= 4 ? 2 : 0) + p.stats.projBonus * 2;
      const pierce = (lvl >= 5 ? 1 : 0) + p.stats.pierce;
      const range = weaponRange(p, id);
      for (let i = 0; i < n; i++) {
        const a = angle + (i / (n - 1) - 0.5) * 0.62 + rand(-0.04, 0.04);
        const s = rand(470, 570);
        shoot(w, p, a, s, { dmg, r: 3.5, pierce, life: range / s, color: WEAPONS.scatter.color, knock: lvl >= 3 ? 230 : 150, kind: 'pellet' });
      }
      p.vx -= Math.cos(angle) * 60;
      p.vy -= Math.sin(angle) * 60;
      w.effects.shake(0.06);
      w.sfx('scatter');
      break;
    }
    case 'arc':
      chainLightning(w, p, angle, dmg, lvl);
      if (lvl >= 5) w.later(0.16, () => p.alive && chainLightning(w, p, angle, dmg * 0.6, lvl));
      break;
  }
  w.effects.burst(p.x + Math.cos(angle) * 12, p.y + Math.sin(angle) * 12, {
    count: 3, color: WEAPONS[id].color, speed: 120, life: 0.18, angle, spread: 0.8, size: 2,
  });
}

function shoot(w, p, a, speed, o) {
  w.projectiles.push({
    team: 'player', x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, ox: p.x, oy: p.y,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, hit: new Set(), ...o,
  });
}

function slash(w, p, angle, dmg, lvl, swap) {
  const range = weaponRange(p, 'edge');
  const arc = ((lvl >= 3 ? 160 : 115) * Math.PI) / 180;
  const color = swap ? PALETTE.gold : WEAPONS.edge.color;
  w.slashes.push({ x: p.x, y: p.y, angle, arc, range, life: 0.17, max: 0.17, color, follow: p });
  for (const e of w.enemies) {
    if (e.dead || e.spawning) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > range + e.r) continue;
    const a = angleTo(p.x, p.y, e.x, e.y);
    if (d > e.r && Math.abs(angleDiff(angle, a)) > arc / 2 + Math.atan2(e.r, d)) continue;
    damageEnemy(w, e, dmg, { kx: Math.cos(a) * 300, ky: Math.sin(a) * 300, fromX: p.x, fromY: p.y, source: 'edge' });
  }
  // Parry: the slash deletes enemy bullets inside the arc.
  let parried = 0;
  for (const b of w.projectiles) {
    if (b.team !== 'enemy' || b.dead) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d > range + 6) continue;
    if (Math.abs(angleDiff(angle, angleTo(p.x, p.y, b.x, b.y))) > arc / 2) continue;
    b.dead = true;
    parried++;
    w.effects.burst(b.x, b.y, { count: 5, color: '#ffffff', speed: 150, life: 0.2, size: 2 });
  }
  if (parried) {
    w.effects.text(p.x, p.y - 28, 'PARRY', { color: '#ffffff', size: 12, life: 0.5 });
    p.meter = Math.min(100, p.meter + 3 * parried);
  }
  if (lvl >= 5) {
    shoot(w, p, angle, 430, { dmg: dmg * 0.6, r: 11, pierce: 99, life: 0.5, color, knock: 120, kind: 'wave' });
  }
  w.effects.shake(0.035);
  w.sfx('slash');
}

function chainLightning(w, p, angle, dmg, lvl) {
  const range = weaponRange(p, 'arc');
  const chains = 3 + (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 2 : 0) + p.stats.projBonus;
  const jump = 115 * p.stats.area;
  // First target: nearest enemy roughly in the aim direction.
  let first = null;
  let best = Infinity;
  for (const e of w.enemies) {
    if (e.dead || e.spawning || e.airborne) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > range + e.r) continue;
    if (Math.abs(angleDiff(angle, angleTo(p.x, p.y, e.x, e.y))) > 0.6) continue;
    if (d < best) {
      best = d;
      first = e;
    }
  }
  const pts = [{ x: p.x, y: p.y }];
  if (!first) {
    pts.push({ x: p.x + Math.cos(angle) * 60, y: p.y + Math.sin(angle) * 60 });
    w.bolts.push({ pts, life: 0.1, max: 0.1, color: WEAPONS.arc.color });
    return;
  }
  const hit = new Set();
  let cur = first;
  let d = dmg;
  for (let i = 0; i <= chains && cur; i++) {
    hit.add(cur);
    pts.push({ x: cur.x, y: cur.y });
    const prev = pts[pts.length - 2];
    const a = angleTo(prev.x, prev.y, cur.x, cur.y);
    damageEnemy(w, cur, d, { kx: Math.cos(a) * 110, ky: Math.sin(a) * 110, fromX: prev.x, fromY: prev.y, stun: lvl >= 3 ? 0.35 : 0, source: 'arc' });
    d *= 0.85;
    let next = null;
    let nd = jump;
    for (const e of w.enemies) {
      if (e.dead || e.spawning || hit.has(e)) continue;
      const dd = Math.hypot(e.x - cur.x, e.y - cur.y);
      if (dd < nd) {
        nd = dd;
        next = e;
      }
    }
    cur = next;
  }
  w.bolts.push({ pts, life: 0.14, max: 0.14, color: WEAPONS.arc.color });
  w.sfx('arc');
}

export function fireEnemyBullet(w, x, y, angle, speed, o = {}) {
  w.projectiles.push({
    team: 'enemy', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: o.r ?? 5, life: o.life ?? 6, color: o.color ?? PALETTE.hot, homing: o.homing ?? 0, speed,
    kind: o.kind ?? 'orb', ignoreWalls: o.ignoreWalls ?? false,
  });
}

export function updateProjectiles(w, dt) {
  const p = w.player;
  const ets = w.enemyTimeScale;
  for (const b of w.projectiles) {
    if (b.dead) continue;
    const step = b.team === 'enemy' ? dt * ets : dt;
    b.life -= step;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    if (b.homing && p.alive) {
      const cur = Math.atan2(b.vy, b.vx);
      const want = angleTo(b.x, b.y, p.x, p.y);
      const na = cur + Math.max(-b.homing * step, Math.min(b.homing * step, angleDiff(cur, want)));
      b.vx = Math.cos(na) * b.speed;
      b.vy = Math.sin(na) * b.speed;
    }
    b.x += b.vx * step;
    b.y += b.vy * step;
    if (!b.ignoreWalls && solidAt(w.grid, b.x, b.y)) {
      b.dead = true;
      w.effects.burst(b.x - b.vx * step, b.y - b.vy * step, { count: 4, color: b.color, speed: 90, life: 0.2, size: 2 });
      continue;
    }
    if (b.team === 'player') {
      for (const e of w.enemies) {
        if (e.dead || e.spawning || e.airborne || b.hit.has(e)) continue;
        if (!overlap(b, e)) continue;
        b.hit.add(e);
        const sp = Math.hypot(b.vx, b.vy) || 1;
        damageEnemy(w, e, b.dmg, { kx: (b.vx / sp) * b.knock, ky: (b.vy / sp) * b.knock, fromX: b.ox, fromY: b.oy, source: b.kind });
        if (b.pierce-- <= 0) {
          b.dead = true;
          break;
        }
      }
    } else if (p.alive && overlap(b, p, -2)) {
      if (p.dash.t > 0) {
        b.dead = true;
        w.onPerfectDodge(b);
      } else if (hurtPlayer(w, b)) {
        b.dead = true;
      }
    }
  }
  w.projectiles = w.projectiles.filter((b) => !b.dead);
}

export function nearestTarget(w, x, y, range) {
  let best = null;
  let bd = range;
  for (const e of w.enemies) {
    if (e.dead || e.spawning || e.airborne) continue;
    const d = Math.hypot(e.x - x, e.y - y) - e.r;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export { TAU };
