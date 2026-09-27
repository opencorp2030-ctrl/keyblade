// Run state: everything that belongs to one attempt, from the first arena to death or victory.

import { DIFFICULTIES } from './config.js';
import { xpToNext } from './progression.js';

export function createRun(character, difficultyId, seed = (Math.random() * 2 ** 31) >>> 0) {
  const weapons = { edge: 0, pulse: 0, scatter: 0, arc: 0 };
  weapons[character.weapon] = 1;
  return {
    character,
    difficulty: DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal,
    seed,
    arenaIndex: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    pendingLevels: 0,
    rerolls: 2,
    kills: 0,
    time: 0,
    damageDealt: 0,
    hitsTaken: 0,
    dashes: 0,
    dodges: 0,
    specialsUsed: 0,
    bossesDefeated: 0,
    weapons,
    upgrades: {},
    upgradeLog: [],
    victory: false,
    player: null, // persists across arenas
  };
}
