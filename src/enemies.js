// Enemy definitions and AI behaviours.

import { angleTo, angleDiff, rand, damp, TAU, clamp } from './math.js';
import { moveCircle, lineOfSight } from './collision.js';
import { BOSS_TYPES, updateBoss } from './bosses.js';

export const ENEMY_TYPES = {
  typo: {
    name: 'TYPO', desc: 'Swarms toward you. Weak alone, deadly in packs.',
    hp: 14, speed: 80, r: 10, xp: 1, score: 10, cost: 1, color: '#ff5a6e', shape: 'blob', behavior: 'chase',
  },
  backspace: {
    name: 'BACKSPACE', desc: 'Winds up, then charges in a straight line. Sidestep or dash.',
    hp: 24, speed: 58, r: 12, xp: 2, score: 25, cost: 2, color: '#ff9a3c', shape: 'arrow', behavior: 'dasher', knockResist: 0.7,
  },
  caret: {
    name: 'CARET', desc: 'Keeps its distance and fires slow bolts. Dash through them.',
    hp: 16, speed: 64, r: 11, xp: 2, score: 25, cost: 2, color: '#b98cff', shape: 'tri', behavior: 'shooter',
  },
  null: {
    name: 'NULL', desc: 'Rushes in and self-destructs. Kill it first and it blows up its friends.',
    hp: 10, speed: 112, r: 9, xp: 1, score: 15, cost: 1.5, color: '#ffe14d', shape: 'ring', behavior: 'bomber',
  },
  spam: {
    name: 'SPAM', desc: 'Splits into three fast SPAMLETS when destroyed.',
    hp: 34, speed: 54, r: 15, xp: 2, score: 30, cost: 3, color: '#5dff8f', shape: 'blob', behavior: 'chase', split: 'spamlet', knockResist: 0.6,
  },
  spamlet: {
    name: 'SPAMLET', desc: 'Tiny and fast.',
    hp: 7, speed: 120, r: 7, xp: 1, score: 5, cost: 0.5, color: '#9dffb9', shape: 'blob', behavior: 'chase',
  },
  shift: {
    name: 'SHIFT', desc: 'Shielded from the front. Flank it, or DASH into it to break the shield.',
    hp: 46, speed: 50, r: 14, xp: 3, score: 40, cost: 3, color: '#4db8ff', shape: 'square', behavior: 'shield', knockResist: 0.4,
  },
  cron: {
    name: 'CRON', desc: 'Summons TYPOs on a schedule and blinks away when you get close.',
    hp: 52, speed: 52, r: 13, xp: 4, score: 60, cost: 5, color: '#ff5ad8', shape: 'hex', behavior: 'summoner', knockResist: 0.6,
  },
  ...BOSS_TYPES,
};
for (const [id, t] of Object.entries(ENEMY_TYPES)) t.id = id;

export function createEnemy(w, typeId, x, y, o = {}) {
  const t = ENEMY_TYPES[typeId];
  const elite = !!o.elite;
  const hpScale = t.isBoss ? w.diff.enemyHp : w.enemyHpScale;
  const hp = t.hp * hpScale * (elite ? 2.6 : 1);
  return {
    type: t, id: w.nextId++, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: t.r * (elite ? 1.3 : 1), hp, maxHp: hp,
    speed: t.speed * w.diff.speed * (1 + 0.025 * w.info.index) * (elite ? 1.08 : 1),
    elite, isBoss: !!t.isBoss, dead: false, t: rand(0, 10), state: t.isBoss ? 'intro' : 'move',
    timer: t.isBoss ? 1.6 : rand(0.4, 1.2), cd: rand(0.8, 2.2), flash: 0, stun: 0,
    facing: angleTo(x, y, w.player.x, w.player.y), aim: 0, shieldUp: true, shieldT: 0, blinkCd: 2,
    strafe: Math.random() < 0.5 ? -1 : 1, phase: 1, hitWall: false,
  };
}

function steer(e, dx, dy, speed, dt, rate = 8) {
  const k = damp(rate, dt);
  e.vx += (dx * speed - e.vx) * k;
  e.vy += (dy * speed - e.vy) * k;
}

const BEHAVIORS = {
  chase(w, e, dt, ctx) {
    const dir = w.pathDir(e, ctx);
    steer(e, dir.x, dir.y, e.speed, dt);
  },

  dasher(w, e, dt, ctx) {
    e.timer -= dt;
    switch (e.state) {
      case 'move': {
        BEHAVIORS.chase(w, e, dt, ctx);
        e.cd -= dt;
        if (e.cd <= 0 && ctx.d < 250 && ctx.los) {
          e.state = 'wind';
          e.timer = 0.62;
          e.aim = ctx.angle;
          w.sfx('telegraph');
        }
        break;
      }
      case 'wind':
        steer(e, 0, 0, 0, dt, 12);
        if (e.timer > 0.22) e.aim = ctx.angle;
        if (e.timer <= 0) {
          e.state = 'charge';
          e.timer = 0.42;
          e.hitWall = false;
        }
        break;
      case 'charge':
        e.vx = Math.cos(e.aim) * 430 * w.diff.speed;
        e.vy = Math.sin(e.aim) * 430 * w.diff.speed;
        if (e.hitWall || e.timer <= 0) {
          if (e.hitWall) {
            w.effects.burst(e.x, e.y, { count: 8, color: e.type.color, speed: 150, life: 0.3 });
            w.effects.shake(0.1);
            e.stun = 0.5;
          }
          e.state = 'recover';
          e.timer = 0.55;
        }
        break;
      case 'recover':
        steer(e, 0, 0, 0, dt, 6);
        if (e.timer <= 0) {
          e.state = 'move';
          e.cd = rand(1.4, 2.6);
        }
        break;
    }
    e.facing = e.state === 'move' ? Math.atan2(e.vy, e.vx) : e.aim;
  },

  shooter(w, e, dt, ctx) {
    const { los, d } = ctx;
    if (e.state === 'aim') {
      steer(e, 0, 0, 0, dt, 10);
      e.timer -= dt;
      e.facing = ctx.angle;
      if (e.timer <= 0) {
        const n = w.info.sector >= 1 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          w.fireEnemyBullet(e.x, e.y, ctx.angle + (i - (n - 1) / 2) * 0.24, 175, { color: e.type.color });
        }
        w.sfx('enemyShot');
        e.state = 'move';
        e.cd = rand(1.8, 2.8);
      }
      return;
    }
    if (!los || d > 290) BEHAVIORS.chase(w, e, dt, ctx);
    else if (d < 150) steer(e, -ctx.nx, -ctx.ny, e.speed, dt);
    else {
      if (Math.random() < dt * 0.4) e.strafe *= -1;
      steer(e, -ctx.ny * e.strafe, ctx.nx * e.strafe, e.speed * 0.6, dt, 4);
    }
    e.facing = ctx.angle;
    e.cd -= dt;
    if (e.cd <= 0 && los && d < 360) {
      e.state = 'aim';
      e.timer = 0.42;
    }
  },

  bomber(w, e, dt, ctx) {
    if (e.state === 'fuse') {
      steer(e, 0, 0, 0, dt, 10);
      e.timer -= dt;
      if (e.timer <= 0) {
        e.dead = true;
        w.explode(e.x, e.y, 78, 22, { hurtPlayer: true, hurtEnemies: true, color: e.type.color });
      }
      return;
    }
    BEHAVIORS.chase(w, e, dt, ctx);
    if (ctx.d < 54) {
      e.state = 'fuse';
      e.timer = 0.7;
      w.sfx('telegraph');
    }
  },

  shield(w, e, dt, ctx) {
    if (!e.shieldUp) {
      e.shieldT -= dt;
      if (e.shieldT <= 0) e.shieldUp = true;
    }
    const turn = 2.3 * dt;
    e.facing += clamp(angleDiff(e.facing, ctx.angle), -turn, turn);
    BEHAVIORS.chase(w, e, dt, ctx);
  },

  summoner(w, e, dt, ctx) {
    const { d, los } = ctx;
    e.blinkCd -= dt;
    if (e.state === 'cast') {
      steer(e, 0, 0, 0, dt, 10);
      e.timer -= dt;
      if (e.timer <= 0) {
        if (w.livingEnemies() < w.enemyCap + 4) {
          for (let i = 0; i < 2; i++) {
            const a = rand(0, TAU);
            w.queueSpawn('typo', e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 28, { delay: 0.45 });
          }
        }
        e.state = 'move';
        e.cd = rand(4, 5.5);
      }
      return;
    }
    if (d < 90 && e.blinkCd <= 0) {
      const to = w.randomFloorPoint(240);
      w.effects.burst(e.x, e.y, { count: 14, color: e.type.color, speed: 160, life: 0.4 });
      e.x = to.x;
      e.y = to.y;
      e.vx = e.vy = 0;
      w.effects.ring(e.x, e.y, { r0: 30, r1: 4, life: 0.3, color: e.type.color });
      e.blinkCd = 4;
    }
    if (d < 170) steer(e, -ctx.nx, -ctx.ny, e.speed, dt);
    else if (d > 260 || !los) BEHAVIORS.chase(w, e, dt, ctx);
    else steer(e, -ctx.ny * e.strafe, ctx.nx * e.strafe, e.speed * 0.4, dt, 3);
    e.cd -= dt;
    if (e.cd <= 0) {
      e.state = 'cast';
      e.timer = 0.8;
    }
  },
};

export function updateEnemy(w, e, dt) {
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  const p = w.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ctx = {
    d, nx: dx / d, ny: dy / d, angle: Math.atan2(dy, dx),
    los: d < 420 && lineOfSight(w.grid, e.x, e.y, p.x, p.y),
  };

  if (e.stun > 0) {
    e.stun -= dt;
    steer(e, 0, 0, 0, dt, 10);
  } else if (e.isBoss) {
    updateBoss(w, e, dt, ctx);
  } else {
    BEHAVIORS[e.type.behavior](w, e, dt, ctx);
  }

  const k = Math.exp(-7 * dt);
  e.kx *= k;
  e.ky *= k;
  if (e.airborne) {
    e.hitWall = false;
    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
  } else {
    e.hitWall = moveCircle(e, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt, w.grid);
  }
}
