// Boss definitions and their attack state machines.
// Bosses only talk to the world through its API (spawn, fire, hazards), so they stay self-contained.

import { PALETTE, COLS, ROWS, TILE } from './config.js';
import { rand, damp, TAU, angleTo } from './math.js';
import { resolveCircle } from './collision.js';
import { addShockwave, addLaser, addMarker } from './hazards.js';

export const BOSS_TYPES = {
  caps: {
    name: 'CAPS LOCK', title: 'THE LOUD ONE', desc: 'Charges, leaps and slams. DASH through its shockwaves.',
    hp: 950, speed: 70, r: 32, xp: 60, score: 5000, color: '#4db8ff', shape: 'boss_caps', behavior: 'boss',
    isBoss: true, knockResist: 0.03, unlock: 'boss1',
  },
  macro: {
    name: 'THE MACRO', title: 'RECORDS EVERYTHING', desc: 'Bullet spirals, radial bursts and teleports.',
    hp: 1500, speed: 90, r: 30, xp: 90, score: 9000, color: '#ff5ad8', shape: 'boss_macro', behavior: 'boss',
    isBoss: true, knockResist: 0.03, unlock: 'boss2',
  },
  kernel: {
    name: 'KERNEL PANIC', title: 'THE BLUE SCREEN', desc: 'Sweeping lasers, bullet walls and homing orbs.',
    hp: 2500, speed: 60, r: 40, xp: 140, score: 15000, color: '#4d8bff', shape: 'boss_kernel', behavior: 'boss',
    isBoss: true, knockResist: 0.02, unlock: 'boss3',
  },
};

export const BOSS_FOR_SECTOR = ['caps', 'macro', 'kernel'];

const CENTER = { x: (COLS / 2) * TILE, y: (ROWS / 2) * TILE };

function steer(b, dx, dy, speed, dt, rate = 5) {
  const k = damp(rate, dt);
  b.vx += (dx * speed - b.vx) * k;
  b.vy += (dy * speed - b.vy) * k;
}

function moveToward(b, x, y, speed, dt) {
  const dx = x - b.x;
  const dy = y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) steer(b, 0, 0, 0, dt);
  else steer(b, dx / d, dy / d, Math.min(speed, d * 3), dt);
}

function summonRing(w, types, dist = 140) {
  for (let i = 0; i < types.length; i++) {
    const pt = w.randomFloorPoint(dist);
    w.queueSpawn(types[i], pt.x, pt.y, { delay: 0.8 });
  }
}

function checkPhase(w, b, thresholds, onPhase) {
  const frac = b.hp / b.maxHp;
  const next = thresholds.filter((t) => frac < t).length + 1;
  if (next > b.phase) {
    b.phase = next;
    onPhase(next);
  }
}

// ---------------------------------------------------------------- CAPS LOCK
function caps(w, b, dt, ctx) {
  checkPhase(w, b, [0.5], () => {
    w.callout('CAPS LOCK IS ON', PALETTE.hot);
    w.sfx('bossRoar');
    w.effects.shake(0.6);
    summonRing(w, ['typo', 'typo', 'typo', 'typo']);
    b.state = 'roar';
    b.timer = 1.0;
    b.airborne = false;
  });
  const p2 = b.phase >= 2;
  b.timer -= dt;
  switch (b.state) {
    case 'intro':
    case 'roar':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) {
        b.state = 'stalk';
        b.timer = 2.2;
      }
      break;
    case 'stalk':
      steer(b, ctx.nx, ctx.ny, b.speed * (p2 ? 1.35 : 1), dt);
      if (b.timer <= 0) {
        b.charges = p2 ? 4 : 3;
        b.state = 'wind';
        b.timer = 0.6;
        w.sfx('telegraph');
      }
      break;
    case 'wind':
      steer(b, 0, 0, 0, dt, 10);
      if (b.timer > 0.2) b.aim = ctx.angle;
      if (b.timer <= 0) {
        b.state = 'charge';
        b.timer = 0.6;
        b.hitWall = false;
      }
      break;
    case 'charge':
      b.vx = Math.cos(b.aim) * (p2 ? 600 : 520);
      b.vy = Math.sin(b.aim) * (p2 ? 600 : 520);
      if (b.hitWall || b.timer <= 0) {
        if (b.hitWall) {
          w.effects.shake(0.4);
          w.sfx('slam');
          w.effects.burst(b.x, b.y, { count: 20, color: b.type.color, speed: 260, life: 0.5 });
          if (p2) addShockwave(w, b.x, b.y, { speed: 240, maxR: 220, color: b.type.color });
        }
        b.vx *= 0.2;
        b.vy *= 0.2;
        b.state = 'afterCharge';
        b.timer = 0.3;
      }
      break;
    case 'afterCharge':
      steer(b, 0, 0, 0, dt, 10);
      if (b.timer <= 0) {
        b.charges--;
        if (b.charges > 0) {
          b.state = 'wind';
          b.timer = p2 ? 0.4 : 0.5;
          w.sfx('telegraph');
        } else {
          b.state = 'jump';
          b.timer = 0.95;
          b.jumpFrom = { x: b.x, y: b.y };
          b.target = { x: w.player.x, y: w.player.y };
          b.airborne = true;
          addMarker(w, b.target.x, b.target.y, { r: b.r + 10, dur: 0.95, follow: null, color: PALETTE.hot });
          b.marker = w.hazards[w.hazards.length - 1];
        }
      }
      break;
    case 'jump': {
      const t = 1 - b.timer / 0.95;
      if (t < 0.5) {
        b.target.x = w.player.x;
        b.target.y = w.player.y;
        b.marker.x = b.target.x;
        b.marker.y = b.target.y;
      }
      b.vx = b.vy = 0;
      const e = t * t * (3 - 2 * t);
      b.x = b.jumpFrom.x + (b.target.x - b.jumpFrom.x) * e;
      b.y = b.jumpFrom.y + (b.target.y - b.jumpFrom.y) * e;
      b.height = Math.sin(Math.min(1, t) * Math.PI) * 80;
      if (b.timer <= 0) {
        b.airborne = false;
        b.height = 0;
        resolveCircle(b, w.grid);
        w.effects.shake(0.75);
        w.effects.flashScreen('#ffffff', 0.15);
        w.sfx('slam');
        w.effects.burst(b.x, b.y, { count: 30, color: b.type.color, speed: 320, life: 0.6 });
        addShockwave(w, b.x, b.y, { color: b.type.color });
        if (p2) w.later(0.4, () => !b.dead && addShockwave(w, b.x, b.y, { color: PALETTE.hot, speed: 300 }));
        if (p2 && w.livingEnemies() < 8) summonRing(w, ['typo', 'typo', 'null']);
        b.state = 'recover';
        b.timer = 1.1;
        b.damageTaken = 1.3;
      }
      break;
    }
    case 'recover':
      steer(b, 0, 0, 0, dt, 10);
      if (b.timer <= 0) {
        b.damageTaken = 1;
        b.state = 'stalk';
        b.timer = p2 ? 1.6 : 2.2;
      }
      break;
  }
}

// ---------------------------------------------------------------- THE MACRO
function macro(w, b, dt, ctx) {
  checkPhase(w, b, [0.5], () => {
    w.callout('RECORDING... PLAYBACK x2', PALETTE.hot);
    w.sfx('bossRoar');
    w.effects.shake(0.5);
  });
  const p2 = b.phase >= 2;
  b.timer -= dt;
  b.spin = (b.spin ?? 0) + dt * 0.6;
  switch (b.state) {
    case 'intro':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) pickMacro(w, b);
      break;
    case 'drift':
      moveToward(b, b.dest.x, b.dest.y, b.speed, dt);
      if (b.timer <= 0) pickMacro(w, b);
      break;
    case 'spiral': {
      steer(b, 0, 0, 0, dt);
      b.acc -= dt;
      if (b.acc <= 0) {
        b.acc = p2 ? 0.07 : 0.085;
        const arms = p2 ? 5 : 3;
        b.spiral += 0.22 * b.spinDir;
        for (let i = 0; i < arms; i++) w.fireEnemyBullet(b.x, b.y, b.spiral + (i * TAU) / arms, 150, { color: b.type.color });
        w.sfx('enemyShot');
      }
      if (b.timer <= 0) toDrift(w, b);
      break;
    }
    case 'burst':
      steer(b, 0, 0, 0, dt);
      b.acc -= dt;
      if (b.acc <= 0 && b.volleys > 0) {
        b.acc = 0.55;
        b.volleys--;
        const n = p2 ? 24 : 18;
        const off = b.volleys * 0.5 * (TAU / n);
        for (let i = 0; i < n; i++) w.fireEnemyBullet(b.x, b.y, off + (i * TAU) / n, 140, { color: '#ffb3f0', r: 6 });
        w.effects.ring(b.x, b.y, { r0: b.r, r1: b.r * 2.2, life: 0.25, color: b.type.color });
        w.sfx('enemyShot');
      }
      if (b.volleys <= 0 && b.acc <= 0) toDrift(w, b);
      break;
    case 'blinkWarn':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) {
        w.effects.burst(b.x, b.y, { count: 24, color: b.type.color, speed: 220, life: 0.4 });
        b.x = b.dest.x;
        b.y = b.dest.y;
        b.vx = b.vy = 0;
        w.effects.ring(b.x, b.y, { r0: 60, r1: 4, life: 0.3, color: b.type.color, width: 4 });
        b.state = 'blinkFire';
        b.timer = 0.35;
        b.volleys = p2 ? 2 : 1;
      }
      break;
    case 'blinkFire':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) {
        if (b.volleys-- > 0) {
          const n = p2 ? 7 : 5;
          for (let i = 0; i < n; i++) w.fireEnemyBullet(b.x, b.y, ctx.angle + (i - (n - 1) / 2) * 0.16, 230, { color: PALETTE.hot });
          w.sfx('enemyShot');
          b.timer = 0.35;
        } else toDrift(w, b);
      }
      break;
    case 'summon':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) {
        if (w.livingEnemies() < 10) summonRing(w, p2 ? ['caret', 'caret', 'typo', 'typo', 'null'] : ['caret', 'typo', 'typo']);
        toDrift(w, b);
      }
      break;
  }
}

function toDrift(w, b) {
  b.state = 'drift';
  b.timer = b.phase >= 2 ? 1.0 : 1.5;
  b.dest = w.randomFloorPoint(160, 60);
}

function pickMacro(w, b) {
  const options = ['spiral', 'burst', 'blink', 'summon'].filter((o) => o !== b.last);
  const pick = options[Math.floor(Math.random() * options.length)];
  b.last = pick;
  if (pick === 'spiral') {
    b.state = 'spiral';
    b.timer = 3.2;
    b.acc = 0;
    b.spiral = rand(0, TAU);
    b.spinDir = Math.random() < 0.5 ? 1 : -1;
  } else if (pick === 'burst') {
    b.state = 'burst';
    b.volleys = 3;
    b.acc = 0.3;
  } else if (pick === 'blink') {
    b.state = 'blinkWarn';
    b.timer = 0.7;
    b.dest = w.randomFloorPoint(170, 60);
    addMarker(w, b.dest.x, b.dest.y, { r: b.r + 6, dur: 0.7, color: b.type.color });
  } else {
    b.state = 'summon';
    b.timer = 0.8;
    w.effects.ring(b.x, b.y, { r0: 10, r1: 90, life: 0.8, color: b.type.color, width: 3 });
  }
}

// ---------------------------------------------------------------- KERNEL PANIC
function kernel(w, b, dt, ctx) {
  checkPhase(w, b, [0.6, 0.25], (phase) => {
    w.callout(phase === 2 ? 'FATAL EXCEPTION' : 'SYSTEM HALTED — ENRAGED', PALETTE.hot);
    w.sfx('bossRoar');
    w.effects.shake(0.7);
    w.effects.flashScreen('#4d8bff', 0.3);
    summonRing(w, phase === 2 ? ['null', 'null', 'shift'] : ['cron', 'null', 'null', 'null']);
  });
  b.timer -= dt;
  const ph = b.phase;
  switch (b.state) {
    case 'intro':
    case 'center':
      moveToward(b, CENTER.x, CENTER.y, b.speed, dt);
      if (b.timer <= 0) pickKernel(w, b, ctx);
      break;
    case 'laser':
      moveToward(b, CENTER.x, CENTER.y, 30, dt);
      if (b.timer <= 0) toRest(b);
      break;
    case 'grid':
      steer(b, ctx.nx, ctx.ny, 25, dt);
      b.acc -= dt;
      if (b.acc <= 0 && b.volleys > 0) {
        b.acc = ph >= 3 ? 0.75 : 0.95;
        b.volleys--;
        bulletWall(w, ph);
      }
      if (b.volleys <= 0 && b.acc <= 0) toRest(b);
      break;
    case 'homing':
      steer(b, 0, 0, 0, dt);
      b.acc -= dt;
      if (b.acc <= 0 && b.volleys > 0) {
        b.acc = 0.35;
        b.volleys--;
        const a = ctx.angle + rand(-1.4, 1.4);
        w.fireEnemyBullet(b.x, b.y, a, 125, { color: '#9ec0ff', r: 7, homing: 1.9, life: 4.5, kind: 'homing' });
        w.sfx('enemyShot');
      }
      if (b.volleys <= 0 && b.acc <= 0) toRest(b);
      break;
    case 'nova':
      steer(b, 0, 0, 0, dt);
      b.acc -= dt;
      if (b.acc <= 0 && b.volleys > 0) {
        b.acc = 0.5;
        b.volleys--;
        const n = 30;
        const off = b.volleys * (TAU / n / 2);
        for (let i = 0; i < n; i++) w.fireEnemyBullet(b.x, b.y, off + (i * TAU) / n, 150, { color: '#4d8bff', r: 6 });
        w.effects.ring(b.x, b.y, { r0: b.r, r1: b.r * 2.5, life: 0.3, color: '#4d8bff', width: 4 });
        w.sfx('enemyShot');
      }
      if (b.volleys <= 0 && b.acc <= 0) toRest(b);
      break;
    case 'summon':
      steer(b, 0, 0, 0, dt);
      if (b.timer <= 0) {
        if (w.livingEnemies() < 10) summonRing(w, ph >= 2 ? ['null', 'null', 'null', 'cron'] : ['null', 'null', 'typo', 'typo']);
        toRest(b);
      }
      break;
    case 'rest':
      steer(b, ctx.nx, ctx.ny, 35, dt);
      if (b.timer <= 0) {
        b.state = 'center';
        b.timer = 0.9;
      }
      break;
  }
}

function toRest(b) {
  b.state = 'rest';
  b.timer = b.phase >= 3 ? 0.5 : 0.9;
}

function pickKernel(w, b, ctx) {
  const ph = b.phase;
  const options = ['laser', 'grid', 'homing', 'summon'];
  if (ph >= 2) options.push('nova', 'laser');
  const filtered = options.filter((o) => o !== b.last);
  const pick = filtered[Math.floor(Math.random() * filtered.length)];
  b.last = pick;
  b.acc = 0.2;
  if (pick === 'laser') {
    const beams = ph === 1 ? 2 : ph === 2 ? 3 : 4;
    const spin = (Math.random() < 0.5 ? 1 : -1) * (ph >= 3 ? 0.85 : 0.65);
    const base = ctx.angle + Math.PI / beams;
    for (let i = 0; i < beams; i++) addLaser(w, b, base + (i * TAU) / beams, { spin, warn: 1.1, dur: 2.8 });
    b.state = 'laser';
    b.timer = 4.0;
    w.sfx('telegraph');
  } else if (pick === 'grid') {
    b.state = 'grid';
    b.volleys = ph >= 3 ? 4 : 3;
  } else if (pick === 'homing') {
    b.state = 'homing';
    b.volleys = 3 + ph;
  } else if (pick === 'nova') {
    b.state = 'nova';
    b.volleys = 2;
  } else {
    b.state = 'summon';
    b.timer = 0.9;
    w.effects.ring(b.x, b.y, { r0: 10, r1: 100, life: 0.9, color: '#4d8bff', width: 3 });
  }
}

/** A wall of bullets sweeping across the arena, with a gap to slip (or dash) through. */
function bulletWall(w, phase) {
  const side = Math.floor(Math.random() * 4);
  const speed = phase >= 3 ? 175 : 145;
  const horizontal = side < 2; // travels along x
  const span = horizontal ? ROWS * TILE : COLS * TILE;
  const spacing = 34;
  const count = Math.floor(span / spacing);
  const gapStart = 1 + Math.floor(Math.random() * (count - 5));
  for (let i = 0; i < count; i++) {
    if (i >= gapStart && i < gapStart + 3) continue;
    const along = (i + 0.5) * spacing;
    let x, y, a;
    if (side === 0) { x = TILE * 1.2; y = along; a = 0; }
    else if (side === 1) { x = COLS * TILE - TILE * 1.2; y = along; a = Math.PI; }
    else if (side === 2) { x = along; y = TILE * 1.2; a = Math.PI / 2; }
    else { x = along; y = ROWS * TILE - TILE * 1.2; a = -Math.PI / 2; }
    w.fireEnemyBullet(x, y, a, speed, { color: '#7aa8ff', r: 6, ignoreWalls: true, life: 9, kind: 'wall' });
  }
  w.sfx('telegraph');
}

const AI = { caps, macro, kernel };

export function updateBoss(w, b, dt, ctx) {
  AI[b.type.id](w, b, dt, ctx);
  b.facing = angleTo(b.x, b.y, w.player.x, w.player.y);
}
