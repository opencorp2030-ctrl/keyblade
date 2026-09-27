// The player: movement, dash, weapon switching/firing, specials and interaction.
// Discrete key presses are *buffered* for a few frames so inputs are never eaten.

import { damp, len, rand } from './math.js';
import { moveCircle } from './collision.js';
import { settings } from './settings.js';
import { WEAPONS, WEAPON_ORDER, fireWeapon, weaponCooldown, weaponRange, nearestTarget } from './weapons.js';
import { tryActivateSpecial, updateSpecial } from './abilities.js';
import { damageEnemy } from './combat.js';
import { addTrail } from './hazards.js';

const DASH_TIME = 0.15;
const DASH_SPEED = 700;
const BUFFER = 0.15;

export function createPlayer(run) {
  const ch = run.character;
  const hp = Math.max(2, ch.hp + run.difficulty.playerHp);
  return {
    run, x: 0, y: 0, vx: 0, vy: 0, r: 9, faceX: 1, faceY: 0, facing: 0,
    hp, maxHp: hp, invuln: 0, hurtT: 0, alive: true,
    color: ch.color, special: ch.special,
    dash: { t: 0, charges: ch.dashCharges, max: ch.dashCharges, cd: 0, dx: 1, dy: 0, hit: new Set(), trailAcc: 0 },
    buffers: { dash: 0, special: 0, interact: 0 },
    weapon: ch.weapon, cooldowns: { edge: 0, pulse: 0, scatter: 0, arc: 0 },
    swapT: 0, swapBonus: false, lastSwap: -9, meter: 0, specialActive: null,
    history: [], histAcc: 0, ghosts: [], anim: 0,
    stats: {
      dmgMul: 1, rateMul: 1, speed: ch.speed, dashCd: ch.dashCd, dashDmg: 14, dashReach: 6, trail: false,
      magnet: 70, meterGain: 1, crit: 0.05, critMul: 2, pierce: 0, projBonus: 0, comboWindow: 2.6,
      swapBonus: 0.6, swapCd: 0.9, thorns: false, leech: false, knock: 1, area: 1,
    },
  };
}

export function bufferAction(p, action) {
  p.buffers[action] = BUFFER;
}

/** Switch to weapon slot (1-4). Rewards switching with a SWAP STRIKE. */
export function switchWeapon(w, slot) {
  const p = w.player;
  const id = WEAPON_ORDER[slot - 1];
  if (!id || !p.alive) return;
  if (w.run.weapons[id] === 0) {
    w.effects.text(p.x, p.y - 26, `${WEAPONS[id].name} LOCKED`, { color: '#7c84a8', size: 12, life: 0.6 });
    w.sfx('deny');
    return;
  }
  if (id === p.weapon) return;
  equip(w, id);
}

export function equip(w, id, announce = false) {
  const p = w.player;
  p.weapon = id;
  p.swapT = 0.08;
  if (w.time - p.lastSwap > p.stats.swapCd) p.swapBonus = true;
  p.lastSwap = w.time;
  w.sfx('swap');
  w.effects.text(p.x, p.y - 30, WEAPONS[id].name, { color: WEAPONS[id].color, size: announce ? 18 : 13, life: announce ? 1.2 : 0.55 });
}

export function updatePlayer(w, dt) {
  const p = w.player;
  p.anim += dt;
  for (const k in p.buffers) p.buffers[k] = Math.max(0, p.buffers[k] - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.ghosts = p.ghosts.filter((g) => (g.life -= dt) > 0);
  if (!p.alive) return;

  const input = w.game.input;
  const ax = input.axis();
  const moving = ax.x !== 0 || ax.y !== 0;
  if (moving) {
    p.faceX = ax.x;
    p.faceY = ax.y;
    p.facing = Math.atan2(ax.y, ax.x);
  }

  // Dash
  const d = p.dash;
  if (p.buffers.dash > 0 && d.charges > 0 && d.t <= 0) startDash(w, p, moving ? ax : { x: p.faceX, y: p.faceY });
  if (d.charges < d.max) {
    d.cd -= dt;
    if (d.cd <= 0) {
      d.charges++;
      d.cd = p.stats.dashCd;
      w.sfx('recharge');
    }
  }

  if (d.t > 0) {
    d.t -= dt;
    p.vx = d.dx * DASH_SPEED;
    p.vy = d.dy * DASH_SPEED;
    moveCircle(p, p.vx * dt, p.vy * dt, w.grid);
    dashHits(w, p);
    p.ghosts.push({ x: p.x, y: p.y, life: 0.22, max: 0.22 });
    if (p.stats.trail) {
      d.trailAcc -= dt;
      if (d.trailAcc <= 0) {
        d.trailAcc = 0.035;
        addTrail(w, p.x, p.y, 6 * p.stats.dmgMul);
      }
    }
    if (d.t <= 0) {
      p.vx *= 0.35;
      p.vy *= 0.35;
    }
  } else {
    const speed = p.stats.speed * (p.specialActive?.id === 'whirlwind' ? 1.15 : 1);
    const k = damp(moving ? 18 : 12, dt);
    p.vx += (ax.x * speed - p.vx) * k;
    p.vy += (ax.y * speed - p.vy) * k;
    moveCircle(p, p.vx * dt, p.vy * dt, w.grid);
  }

  // Weapons: every weapon cools down in the background; only the equipped one fires.
  for (const id of WEAPON_ORDER) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt);
  if (p.swapT > 0) p.swapT -= dt;
  else tryFire(w, p);

  // Special
  if (p.buffers.special > 0) {
    p.buffers.special = 0;
    tryActivateSpecial(w, p);
  }
  updateSpecial(w, p, dt);

  // Interact
  if (p.buffers.interact > 0) {
    if (w.tryInteract()) p.buffers.interact = 0;
  }

  // Position history for REWIND (2 seconds)
  p.histAcc -= dt;
  if (p.histAcc <= 0) {
    p.histAcc = 0.05;
    p.history.push({ x: p.x, y: p.y });
    if (p.history.length > 40) p.history.shift();
  }
}

function startDash(w, p, dir) {
  const d = p.dash;
  const l = len(dir.x, dir.y) || 1;
  d.dx = dir.x / l;
  d.dy = dir.y / l;
  d.t = DASH_TIME;
  if (d.charges === d.max) d.cd = p.stats.dashCd;
  d.charges--;
  d.hit = new Set();
  d.trailAcc = 0;
  p.buffers.dash = 0;
  p.invuln = Math.max(p.invuln, 0.05);
  w.run.dashes++;
  w.sfx('dash');
  w.effects.burst(p.x, p.y, { count: 10, color: p.color, speed: 180, life: 0.3, angle: Math.atan2(-d.dy, -d.dx), spread: 1.2 });
}

function dashHits(w, p) {
  const d = p.dash;
  for (const e of w.enemies) {
    if (e.dead || e.spawning || e.airborne || d.hit.has(e)) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > p.r + e.r + p.stats.dashReach) continue;
    d.hit.add(e);
    damageEnemy(w, e, p.stats.dashDmg * p.stats.dmgMul, { kx: d.dx * 260, ky: d.dy * 260, source: 'dash', fromX: p.x, fromY: p.y });
    w.effects.freeze(0.03);
  }
}

function tryFire(w, p) {
  const id = p.weapon;
  if (p.cooldowns[id] > 0) return;
  const range = weaponRange(p, id);
  let angle;
  if (settings.aimMode === 'facing') {
    if (!nearestTarget(w, p.x, p.y, range * 1.3)) return;
    angle = p.facing;
  } else {
    const target = nearestTarget(w, p.x, p.y, range + (id === 'edge' ? 6 : 20));
    if (!target) return;
    // Lead moving targets slightly with projectile weapons.
    const lead = id === 'pulse' || id === 'scatter' ? Math.hypot(target.x - p.x, target.y - p.y) / 600 : 0;
    angle = Math.atan2(target.y + target.vy * lead - p.y, target.x + target.vx * lead - p.x);
  }
  fireWeapon(w, p, id, angle + rand(-0.015, 0.015));
  p.cooldowns[id] = weaponCooldown(p, id);
  if (id !== 'edge') {
    p.facing = angle;
  }
}
