// The live simulation of one arena. Owns every entity and exposes the API that
// enemies, bosses, weapons and abilities use to affect the game.

import { TILE, PALETTE, TOTAL_ARENAS } from './config.js';
import { RNG, rand, damp, TAU, dist } from './math.js';
import { lineOfSight, solid } from './collision.js';
import { arenaInfo, generateArena, computeFlow, flowDir, floorCells } from './levels.js';
import { createEnemy, updateEnemy, ENEMY_TYPES } from './enemies.js';
import { WaveDirector } from './waves.js';
import { createPlayer, updatePlayer, equip } from './player.js';
import { updateProjectiles, fireEnemyBullet, WEAPONS, WEAPON_ORDER } from './weapons.js';
import { updateHazards } from './hazards.js';
import { dropPickup, updatePickups } from './pickups.js';
import { explode, hurtPlayer, healPlayer, comboTier } from './combat.js';
import { Effects } from './effects.js';
import { xpToNext, unlock } from './progression.js';
import { audio } from './audio.js';

export class World {
  constructor(game, run, hooks, opts = {}) {
    this.game = game;
    this.run = run;
    this.hooks = hooks;
    this.godMode = !!opts.godMode;
    this.diff = run.difficulty;
    this.effects = new Effects();
    this.rng = new RNG(run.seed ^ 0x9e3779b9);
    this.nextId = 1;
    if (!run.player) run.player = createPlayer(run);
    this.player = run.player;
    if (opts.damageMul) this.player.stats.dmgMul *= opts.damageMul;
    this.loadArena(run.arenaIndex);
  }

  loadArena(index) {
    const run = this.run;
    run.arenaIndex = index;
    this.info = arenaInfo(index);
    const arena = generateArena(new RNG(run.seed + index * 7919), this.info);
    this.arena = arena;
    this.grid = arena.grid;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.spawns = [];
    this.slashes = [];
    this.bolts = [];
    this.hazards = [];
    this.interactables = [];
    this.timers = [];
    this.time = 0;
    this.enemyTimeScale = 1;
    this.enemyTimeTarget = 1;
    this.timeScale = 1;
    this.slowmo = 0;
    this.arenaHits = 0;
    this.phase = 'fight';
    this.bannerData = null;
    this.calloutData = null;
    this.boss = null;
    this.prompt = null;
    this.bgCache = null;
    this.enemyHpScale = this.diff.enemyHp * (1 + 0.14 * index);
    this.enemyCap = 14 + index * 3;
    this.effects.clear();

    const p = this.player;
    p.x = arena.spawnX;
    p.y = arena.spawnY;
    p.vx = p.vy = 0;
    p.dash.t = 0;
    p.history.length = 0;
    p.invuln = 1;
    if (p.specialActive) p.specialActive.t = 0;

    this.flow = computeFlow(this.grid, p.x, p.y);
    this.flowAcc = 0;
    this.director = new WaveDirector(this);
    audio.setTrack(this.info.isBoss ? 'boss' : `sector${this.info.sector}`);
    const sectorStart = this.info.local === 0;
    this.banner(
      sectorStart ? `SECTOR ${this.info.sector + 1}: ${this.info.theme.name}` : `ARENA ${this.info.label}`,
      this.info.isBoss ? `${this.info.name} — BOSS` : this.info.name,
      this.info.theme.accent,
      2.4,
    );
  }

  // ------------------------------------------------------------------ helpers used everywhere
  sfx(name, opts) {
    audio.play(name, opts);
  }

  later(t, fn) {
    this.timers.push({ t, fn });
  }

  banner(title, sub = '', color = PALETTE.ink, dur = 1.8) {
    this.bannerData = { title, sub, color, t: 0, dur };
    this.game.announce(`${title}. ${sub}`);
  }

  callout(text, color = PALETTE.gold) {
    this.calloutData = { text, color, t: 0, dur: 1.1 };
  }

  livingEnemies() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n + this.spawns.length;
  }

  pathDir(e, ctx) {
    if (ctx.los && ctx.d < 220) return { x: ctx.nx, y: ctx.ny };
    return flowDir(this.grid, this.flow, e.x, e.y) ?? { x: ctx.nx, y: ctx.ny };
  }

  randomFloorPoint(minDist = 0, margin = 0) {
    const p = this.player;
    const W = this.grid.cols * TILE;
    const H = this.grid.rows * TILE;
    let cells = floorCells(this.grid, (x, y) =>
      dist(x, y, p.x, p.y) >= minDist && x > margin && y > margin && x < W - margin && y < H - margin);
    if (!cells.length) cells = floorCells(this.grid);
    return this.rng.pick(cells);
  }

  nearFloorPoint(x, y, radius) {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const r = rand(0, radius);
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (!solid(this.grid, Math.floor(px / TILE), Math.floor(py / TILE))) return { x: px, y: py };
    }
    return { x, y };
  }

  queueSpawn(type, x, y, o = {}) {
    this.spawns.push({ type, x, y, t: o.delay ?? 0.85, max: o.delay ?? 0.85, elite: !!o.elite });
    this.sfx('spawn');
  }

  spawnEnemy(type, x, y, o = {}) {
    const e = createEnemy(this, type, x, y, o);
    this.enemies.push(e);
    return e;
  }

  spawnBoss(id) {
    const c = { x: (this.grid.cols / 2) * TILE, y: 4 * TILE };
    const b = this.spawnEnemy(id, c.x, c.y);
    this.boss = b;
    this.callout(ENEMY_TYPES[id].name, ENEMY_TYPES[id].color);
    this.banner(ENEMY_TYPES[id].name, ENEMY_TYPES[id].title, ENEMY_TYPES[id].color, 2.2);
    this.sfx('bossRoar');
    this.effects.shake(0.6);
    this.effects.ring(b.x, b.y, { r0: 10, r1: 200, life: 0.7, color: b.type.color, width: 6 });
    return b;
  }

  fireEnemyBullet(x, y, angle, speed, o) {
    fireEnemyBullet(this, x, y, angle, speed, o);
  }

  explode(x, y, r, dmg, o) {
    explode(this, x, y, r, dmg, o);
  }

  drop(kind, x, y, value) {
    dropPickup(this, kind, x, y, value);
  }

  equipWeapon(id, announce) {
    equip(this, id, announce);
    this.game.announce(`${WEAPONS[id].name} equipped. Press ${WEAPONS[id].slot} to select it.`);
  }

  addXp(n) {
    const run = this.run;
    run.xp += n;
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.level++;
      run.xpNext = xpToNext(run.level);
      run.pendingLevels++;
      this.effects.ring(this.player.x, this.player.y, { r0: 10, r1: 90, life: 0.5, color: PALETTE.accent, width: 4 });
      this.sfx('levelup');
    }
  }

  onPerfectDodge(src) {
    const p = this.player;
    this.run.dodges++;
    p.meter = Math.min(100, p.meter + 6 * p.stats.meterGain);
    this.run.comboTimer = Math.max(this.run.comboTimer, p.stats.comboWindow);
    this.effects.text(p.x, p.y - 24, 'DODGE', { color: '#ffffff', size: 12, life: 0.5 });
    this.effects.burst(src.x ?? p.x, src.y ?? p.y, { count: 6, color: '#ffffff', speed: 120, life: 0.25, size: 2 });
    this.sfx('dodge');
  }

  nearestInteractable() {
    const p = this.player;
    let best = null;
    let bd = 44;
    for (const it of this.interactables) {
      if (it.used) continue;
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  tryInteract() {
    const it = this.nearestInteractable();
    if (!it) return false;
    if (it.canUse && !it.canUse(this)) {
      this.sfx('deny');
      this.effects.text(it.x, it.y - 30, it.denyText ?? 'NOT NOW', { color: PALETTE.hot, size: 12 });
      return true;
    }
    it.use(this, it);
    return true;
  }

  // ------------------------------------------------------------------ arena flow
  onArenaCleared(bonus, flawless) {
    this.phase = 'exit';
    this.sfx('clear');
    this.banner(flawless ? 'FLAWLESS CLEAR' : 'ARENA CLEARED', `+${bonus} · find the EXIT and press ${this.game.input.keyOf('interact')}`, flawless ? PALETTE.gold : PALETTE.good, 3);
    for (const it of this.pickups) if (it.kind === 'xp') it.magnet = true;
    this.run.comboTimer = Math.max(this.run.comboTimer, 4);

    const exit = this.randomFloorPoint(180, 90);
    this.interactables.push({
      kind: 'exit', x: exit.x, y: exit.y, label: this.run.arenaIndex === TOTAL_ARENAS - 1 ? 'ESCAPE' : 'ENTER EXIT',
      use: (w, it) => {
        it.used = true;
        w.sfx('portal');
        w.effects.flashScreen('#ffffff', 0.5);
        w.hooks.onExit();
      },
    });
    this.effects.ring(exit.x, exit.y, { r0: 80, r1: 10, life: 0.6, color: PALETTE.accent, width: 4 });

    const cachePt = this.randomFloorPoint(120, 60);
    this.interactables.push({ kind: 'cache', x: cachePt.x, y: cachePt.y, label: 'OPEN CACHE', use: (w, it) => this.openCache(it) });

    if (!this.info.isBoss && this.rng.chance(0.4)) {
      const sp = this.randomFloorPoint(120, 60);
      this.interactables.push({
        kind: 'shrine', x: sp.x, y: sp.y, label: 'SACRIFICE 1 HP FOR AN UPGRADE',
        denyText: 'NEED 2+ HP', canUse: (w) => w.player.hp > 1,
        use: (w, it) => {
          it.used = true;
          w.player.hp--;
          w.effects.flashScreen('#ff2a4d', 0.25);
          w.effects.burst(it.x, it.y, { count: 30, color: '#ff4d7a', speed: 200, life: 0.6 });
          w.sfx('hurt');
          w.run.pendingLevels++;
        },
      });
    }
  }

  openCache(it) {
    it.used = true;
    const run = this.run;
    const fx = this.effects;
    fx.burst(it.x, it.y, { count: 30, color: PALETTE.gold, speed: 240, life: 0.7 });
    fx.ring(it.x, it.y, { r0: 6, r1: 70, life: 0.4, color: PALETTE.gold, width: 3 });
    this.sfx('pickup');
    const locked = WEAPON_ORDER.filter((id) => run.weapons[id] === 0);
    if (locked.length && (this.info.isBoss || this.rng.chance(0.6))) {
      const id = this.rng.pick(locked);
      run.weapons[id] = 1;
      this.callout(`${WEAPONS[id].name} UNLOCKED — PRESS ${WEAPONS[id].slot}`, WEAPONS[id].color);
      this.equipWeapon(id, true);
    } else {
      healPlayer(this, 1);
      this.player.meter = 100;
      run.score += 500;
      fx.text(it.x, it.y - 20, '+500  SPECIAL READY', { color: PALETTE.gold, size: 14, life: 1.2 });
      if (this.info.isBoss) run.pendingLevels++;
    }
  }

  onBossDefeated(b) {
    const run = this.run;
    run.bossesDefeated++;
    run.score += Math.round(b.type.score * this.diff.score * comboTier(run.combo)[1]);
    const newUnlock = unlock(b.type.unlock);
    this.slowmo = 1.4;
    this.effects.flashScreen('#ffffff', 0.8);
    this.effects.shake(1);
    this.sfx('explode');
    for (let i = 0; i < 6; i++) {
      this.later(i * 0.15, () => {
        const a = rand(0, TAU);
        explode(this, b.x + Math.cos(a) * rand(0, 40), b.y + Math.sin(a) * rand(0, 40), 90, 0, { hurtEnemies: false, color: b.type.color, quiet: i % 2 === 1 });
      });
    }
    for (const e of this.enemies) if (!e.dead) {
      e.dead = true;
      this.effects.burst(e.x, e.y, { count: 10, color: e.type.color, speed: 200, life: 0.5 });
    }
    this.spawns.length = 0;
    for (const pr of this.projectiles) if (pr.team === 'enemy') pr.dead = true;
    this.hazards = this.hazards.filter((h) => h.kind === 'trail');
    for (let i = 0; i < b.type.xp; i += 5) this.drop('xp', b.x, b.y, 5);
    this.drop('heart', b.x, b.y);
    this.drop('heart', b.x, b.y);
    this.director.bossDefeated();
    this.later(1.2, () => {
      healPlayer(this, this.player.maxHp, 'FULL HEAL');
      this.onArenaCleared(Math.round(b.type.score * this.diff.score), this.arenaHits === 0);
      if (newUnlock && b.type.unlock === 'boss1') this.callout('NEW CHARACTER UNLOCKED: GLYPH', '#c38bff');
    });
  }

  onPlayerDeath() {
    const p = this.player;
    p.alive = false;
    p.hp = 0;
    this.slowmo = 1.6;
    this.effects.flashScreen('#ff2a4d', 0.7);
    this.effects.shake(1);
    this.effects.burst(p.x, p.y, { count: 60, color: p.color, speed: 340, life: 1.1, size: 4 });
    this.sfx('explode');
    this.sfx('gameover');
    this.later(1.5, () => this.hooks.onDeath());
  }

  // ------------------------------------------------------------------ main update
  update(rawDt) {
    const fx = this.effects;
    fx.update(rawDt);
    if (fx.hitstop > 0) {
      fx.hitstop -= rawDt;
      return;
    }
    if (this.slowmo > 0) this.slowmo -= rawDt;
    const dt = rawDt * (this.slowmo > 0 ? 0.3 : 1);
    this.time += dt;
    this.run.time += dt;
    this.enemyTimeScale += (this.enemyTimeTarget - this.enemyTimeScale) * damp(8, dt);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    const p = this.player;
    this.flowAcc -= dt;
    if (this.flowAcc <= 0 && p.alive) {
      this.flowAcc = 0.2;
      computeFlow(this.grid, p.x, p.y, this.flow);
    }

    this.director.update(dt);

    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const s = this.spawns[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.spawns.splice(i, 1);
        const e = this.spawnEnemy(s.type, s.x, s.y, { elite: s.elite });
        fx.burst(e.x, e.y, { count: 8, color: e.type.color, speed: 120, life: 0.3 });
      }
    }

    updatePlayer(this, dt);

    const edt = dt * this.enemyTimeScale;
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (!e.dead) updateEnemy(this, e, edt);
    }
    this.separate();
    this.contactDamage();

    updateProjectiles(this, dt);
    updateHazards(this, dt);
    updatePickups(this, dt);
    this.run.xpChime = Math.max(1, (this.run.xpChime ?? 1) - dt * 0.5);

    for (const s of this.slashes) {
      s.life -= dt;
      if (s.follow) {
        s.x = s.follow.x;
        s.y = s.follow.y;
      }
    }
    this.slashes = this.slashes.filter((s) => s.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);

    const run = this.run;
    if (run.combo > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) {
        if (run.combo >= 10) fx.text(p.x, p.y - 30, `COMBO ${run.combo}`, { color: PALETTE.dim, size: 12 });
        run.combo = 0;
      }
    }

    const near = this.nearestInteractable();
    this.prompt = near && p.alive ? near : null;

    if (this.bannerData && (this.bannerData.t += rawDt) > this.bannerData.dur) this.bannerData = null;
    if (this.calloutData && (this.calloutData.t += rawDt) > this.calloutData.dur) this.calloutData = null;

    if (run.pendingLevels > 0 && p.alive && this.slowmo <= 0) {
      run.pendingLevels--;
      this.hooks.onLevelUp();
    }
  }

  separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.airborne) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.airborne) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const wa = a.isBoss ? 0.05 : b.isBoss ? 1.95 : 1;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * (2 - wa);
        b.y += ny * push * (2 - wa);
      }
    }
  }

  contactDamage() {
    const p = this.player;
    if (!p.alive) return;
    for (const e of this.enemies) {
      if (e.dead || e.airborne) continue;
      const r = e.r + p.r - 3;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < r * r) {
        if (hurtPlayer(this, e) && !e.isBoss) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kx += Math.cos(a) * 200;
          e.ky += Math.sin(a) * 200;
        }
      }
    }
  }

  hasLineOfSight(a, b) {
    return lineOfSight(this.grid, a.x, a.y, b.x, b.y);
  }
}
