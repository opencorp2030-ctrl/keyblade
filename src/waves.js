// Wave director: decides what spawns, when, and when an arena is cleared.

import { WAVES_PER_ARENA, PALETTE } from './config.js';
import { ENEMY_TYPES } from './enemies.js';
import { BOSS_FOR_SECTOR } from './bosses.js';

// Arena index from which each enemy starts appearing, and how common it is.
const UNLOCK_AT = { typo: 0, backspace: 0, null: 1, caret: 1, spam: 3, shift: 3, cron: 4 };
const WEIGHT = { typo: 10, backspace: 5, null: 4, caret: 5, spam: 4, shift: 3, cron: 2 };

export class WaveDirector {
  constructor(w) {
    this.w = w;
    this.info = w.info;
    this.total = this.info.isBoss ? 1 : WAVES_PER_ARENA;
    this.wave = 0;
    this.state = 'intro';
    this.timer = 2.2;
    this.queue = [];
    this.burstTimer = 0;
    this.boss = null;
  }

  get label() {
    if (this.info.isBoss) return 'BOSS';
    if (this.state === 'done') return 'CLEARED';
    return `WAVE ${Math.max(1, this.wave)}/${this.total}`;
  }

  update(dt) {
    const w = this.w;
    if (this.state === 'intro' || this.state === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.start(this.wave + 1);
    } else if (this.state === 'fight') {
      if (this.info.isBoss) return; // the world tells us when the boss dies
      if (this.queue.length) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0 && w.livingEnemies() < w.enemyCap) {
          this.spawnBurst();
          this.burstTimer = this.interval;
        }
      } else if (w.livingEnemies() === 0 && w.spawns.length === 0) {
        this.cleared();
      }
    }
  }

  start(n) {
    const w = this.w;
    this.wave = n;
    this.state = 'fight';
    this.hitsAtStart = w.arenaHits;
    if (this.info.isBoss) {
      const id = BOSS_FOR_SECTOR[this.info.sector];
      this.boss = w.spawnBoss(id);
      return;
    }
    const idx = this.info.index;
    let budget = (7 + idx * 3.2 + (n - 1) * 3.5) * w.diff.budget;
    const pool = Object.keys(UNLOCK_AT).filter((k) => UNLOCK_AT[k] <= idx);
    const eliteChance = this.info.sector * 0.06 + (n === this.total ? 0.04 : 0);
    this.queue = [];
    while (budget > 0.5) {
      const type = w.rng.weighted(pool, (k) => WEIGHT[k]);
      const elite = this.info.sector > 0 && w.rng.chance(eliteChance);
      this.queue.push({ type, elite });
      budget -= ENEMY_TYPES[type].cost * (elite ? 2.5 : 1);
    }
    w.rng.shuffle(this.queue);
    this.burstSize = 3 + Math.floor(idx / 2);
    this.interval = Math.max(1.3, 2.6 - idx * 0.15);
    this.burstTimer = 0;
    w.banner(`WAVE ${n}`, `${this.total - n === 0 ? 'FINAL WAVE' : `${this.total - n} more after this`}`, this.info.theme.accent);
    w.sfx('wave');
  }

  spawnBurst() {
    const w = this.w;
    const anchor = w.randomFloorPoint(240);
    const n = Math.min(this.queue.length, this.burstSize);
    for (let i = 0; i < n; i++) {
      const { type, elite } = this.queue.shift();
      const pt = w.nearFloorPoint(anchor.x, anchor.y, 55);
      w.queueSpawn(type, pt.x, pt.y, { elite });
    }
  }

  cleared() {
    const w = this.w;
    const run = w.run;
    const flawless = w.arenaHits === this.hitsAtStart;
    let bonus = Math.round(200 * this.wave * (1 + this.info.index * 0.3) * w.diff.score);
    if (flawless) bonus = Math.round(bonus * 1.5);
    run.score += bonus;
    if (this.wave >= this.total) {
      this.state = 'done';
      w.onArenaCleared(bonus, flawless);
    } else {
      this.state = 'break';
      this.timer = 2.4;
      w.banner(flawless ? 'FLAWLESS WAVE' : 'WAVE CLEARED', `+${bonus}`, flawless ? PALETTE.gold : PALETTE.good);
      w.sfx('clear');
    }
  }

  bossDefeated() {
    this.state = 'done';
  }
}
