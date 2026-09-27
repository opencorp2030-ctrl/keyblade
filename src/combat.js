// Damage, death, scoring, combo and player-hurt logic. Everything that "hits" goes through here.

import { COMBO_TIERS, PALETTE } from './config.js';
import { angleTo, angleDiff, rand, TAU } from './math.js';
import { settings } from './settings.js';

export function comboTier(combo) {
  let tier = COMBO_TIERS[0];
  for (const t of COMBO_TIERS) if (combo >= t[0]) tier = t;
  return tier;
}

export function damageEnemy(w, e, amount, o = {}) {
  if (e.dead || e.spawning || e.airborne) return 0;
  const p = w.player;
  const t = e.type;
  let dmg = amount;
  let crit = !!o.crit;
  if (!crit && o.canCrit !== false && Math.random() < p.stats.crit) crit = true;
  if (crit) dmg *= p.stats.critMul;

  let blocked = false;
  if (t.behavior === 'shield' && e.shieldUp) {
    if (o.source === 'dash' || o.source === 'special') {
      e.shieldUp = false;
      e.shieldT = 3.2;
      w.effects.text(e.x, e.y - e.r - 10, 'SHIELD BROKEN', { color: PALETTE.gold, size: 12 });
      w.effects.burst(e.x, e.y, { count: 10, color: '#bfe6ff', speed: 200, life: 0.4 });
    } else if (o.fromX !== undefined) {
      const a = angleTo(e.x, e.y, o.fromX, o.fromY);
      if (Math.abs(angleDiff(e.facing, a)) < 1.1) {
        dmg *= 0.15;
        blocked = true;
      }
    }
  }
  if (e.isBoss) dmg *= e.damageTaken ?? 1;

  e.hp -= dmg;
  e.flash = 0.09;
  w.run.damageDealt += dmg;
  const gain = dmg * 0.3 * p.stats.meterGain * (e.isBoss ? 0.45 : 1);
  if (!p.specialActive) p.meter = Math.min(100, p.meter + gain);

  if (o.kx !== undefined && !blocked) {
    const resist = t.knockResist ?? 1;
    const k = (o.knock ?? 1) * p.stats.knock * resist;
    e.kx += o.kx * k;
    e.ky += o.ky * k;
  }
  if (o.stun && !e.isBoss) e.stun = Math.max(e.stun, o.stun);

  if (settings.damageNumbers) {
    w.effects.text(e.x, e.y - e.r, blocked ? 'BLOCK' : Math.max(1, Math.round(dmg)), {
      color: blocked ? PALETTE.dim : crit ? PALETTE.gold : '#ffffff',
      size: crit ? 18 : blocked ? 11 : 13,
    });
  }
  w.sfx(blocked ? 'block' : crit ? 'crit' : 'hit', { pitch: rand(0.9, 1.2) });
  const a = o.kx !== undefined ? Math.atan2(o.ky, o.kx) : rand(0, TAU);
  w.effects.burst(e.x, e.y, { count: crit ? 7 : 4, color: blocked ? '#bfe6ff' : t.color, speed: 190, life: 0.28, size: 2.5, angle: a, spread: 1.4 });

  if (e.hp <= 0) killEnemy(w, e, o);
  return dmg;
}

export function killEnemy(w, e, o = {}) {
  if (e.dead) return;
  e.dead = true;
  const run = w.run;
  const p = w.player;
  const t = e.type;
  if (e.isBoss) {
    w.onBossDefeated(e);
    return;
  }

  run.kills++;
  const prevTier = comboTier(run.combo);
  run.combo++;
  run.comboTimer = p.stats.comboWindow;
  run.maxCombo = Math.max(run.maxCombo, run.combo);
  const tier = comboTier(run.combo);
  if (tier !== prevTier && tier[2]) {
    w.callout(`${tier[2]}  x${tier[1]}`, PALETTE.gold);
    w.sfx('combo', { pitch: 1 + COMBO_TIERS.indexOf(tier) * 0.12 });
  }
  const pts = Math.round(t.score * (e.elite ? 3 : 1) * tier[1] * w.diff.score);
  run.score += pts;
  if (e.elite) w.effects.text(e.x, e.y - 18, `+${pts}`, { color: PALETTE.gold, size: 16, life: 1 });

  const fx = w.effects;
  fx.burst(e.x, e.y, { count: e.elite ? 26 : 14, color: t.color, speed: 240, life: 0.55, size: 3.5 });
  fx.burst(e.x, e.y, { count: 5, color: '#ffffff', speed: 120, life: 0.25, size: 2 });
  fx.ring(e.x, e.y, { r0: e.r * 0.5, r1: e.r * 2.6, life: 0.3, color: t.color, width: 2.5 });
  fx.shake(e.elite ? 0.28 : 0.08);
  fx.freeze(e.elite ? 0.07 : 0.018);
  w.sfx('kill', { pitch: Math.min(2, 1 + run.combo * 0.012) });

  // Drops
  let xp = (t.xp ?? 1) * (e.elite ? 4 : 1);
  while (xp > 0) {
    const v = xp >= 5 ? 5 : 1;
    w.drop('xp', e.x, e.y, v);
    xp -= v;
  }
  const r = Math.random();
  if (r < (e.elite ? 0.3 : 0.022)) w.drop('heart', e.x, e.y);
  else if (r < (e.elite ? 0.45 : 0.04)) w.drop('battery', e.x, e.y);
  else if (r < 0.046) w.drop('magnet', e.x, e.y);

  if (!p.specialActive) p.meter = Math.min(100, p.meter + 2.5 * p.stats.meterGain);

  if (p.stats.leech) {
    run.leechKills = (run.leechKills ?? 0) + 1;
    if (run.leechKills >= 60) {
      run.leechKills = 0;
      healPlayer(w, 1, 'AUTOSAVE');
    }
  }

  if (t.split) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rand(-0.3, 0.3);
      const m = w.spawnEnemy(t.split, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8);
      m.kx = Math.cos(a) * 260;
      m.ky = Math.sin(a) * 260;
    }
  }
  if (t.behavior === 'bomber') {
    // Killing a NULL before it detonates turns it into a weapon against its friends.
    explode(w, e.x, e.y, 80, 26 * p.stats.dmgMul, { hurtPlayer: false, color: t.color });
  }
}

export function explode(w, x, y, radius, dmg, o = {}) {
  const { hurtPlayer: hurtsPlayer = false, hurtEnemies = true, color = '#ffd24d', stun = 0, knock = 380, quiet = false } = o;
  const fx = w.effects;
  fx.ring(x, y, { r0: 6, r1: radius, life: 0.35, color, width: 5 });
  fx.burst(x, y, { count: 22, color, speed: radius * 3.4, life: 0.5, size: 4 });
  fx.burst(x, y, { count: 8, color: '#ffffff', speed: radius * 2, life: 0.3, size: 3 });
  fx.shake(0.3);
  if (!quiet) w.sfx('explode');
  if (hurtEnemies) {
    for (const e of w.enemies) {
      if (e.dead || e.spawning) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius + e.r) continue;
      const nx = (e.x - x) / (d || 1);
      const ny = (e.y - y) / (d || 1);
      damageEnemy(w, e, dmg, { kx: nx * knock, ky: ny * knock, canCrit: false, source: o.source ?? 'explosion', stun });
    }
  }
  if (hurtsPlayer) {
    const p = w.player;
    if (Math.hypot(p.x - x, p.y - y) < radius + p.r) hurtPlayer(w, { x, y });
  }
}

export function healPlayer(w, amount, label = '+HP') {
  const p = w.player;
  if (p.hp >= p.maxHp) return false;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  w.effects.text(p.x, p.y - 20, label, { color: PALETTE.good, size: 15, life: 1 });
  w.effects.burst(p.x, p.y, { count: 14, color: PALETTE.good, speed: 120, life: 0.6, gravity: -120 });
  w.sfx('heal');
  return true;
}

export function hurtPlayer(w, src) {
  const p = w.player;
  const run = w.run;
  if (!p.alive || p.invuln > 0 || p.dash.t > 0 || w.godMode) return false;
  p.hp -= 1;
  p.invuln = 1.15;
  p.hurtT = 0.35;
  run.hitsTaken++;
  w.arenaHits++;
  if (run.combo >= 5) {
    w.effects.text(p.x, p.y - 26, 'COMBO LOST', { color: PALETTE.hot, size: 14, life: 1 });
    w.sfx('comboLost');
  }
  run.combo = 0;
  run.comboTimer = 0;

  const fx = w.effects;
  fx.shake(0.55);
  fx.flashScreen('#ff2a4d', 0.35);
  fx.freeze(0.09);
  fx.burst(p.x, p.y, { count: 20, color: PALETTE.hot, speed: 260, life: 0.5 });
  w.sfx('hurt');

  if (src) {
    const a = Math.atan2(p.y - src.y, p.x - src.x);
    p.vx += Math.cos(a) * 260;
    p.vy += Math.sin(a) * 260;
  }
  // Mercy: clear enemy bullets right next to the player.
  for (const b of w.projectiles) if (b.team === 'enemy' && Math.hypot(b.x - p.x, b.y - p.y) < 70) b.dead = true;

  if (p.stats.thorns) explode(w, p.x, p.y, 110, 30 * p.stats.dmgMul, { color: '#ff9a3c', knock: 500 });

  if (p.hp <= 0) w.onPlayerDeath();
  return true;
}
