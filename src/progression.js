// Meta progression: high scores, unlocks and lifetime stats (persisted). Also the XP curve.

import { load, save, remove } from './storage.js';

const DEFAULT_META = () => ({
  highscores: [],
  unlocks: {},
  stats: { runs: 0, kills: 0, victories: 0, bestArena: 0, bossesDefeated: 0, playTime: 0, bestCombo: 0 },
});

function loadMeta() {
  const d = DEFAULT_META();
  const m = load('meta', null);
  if (!m) return d;
  return {
    highscores: Array.isArray(m.highscores) ? m.highscores : [],
    unlocks: { ...m.unlocks },
    stats: { ...d.stats, ...m.stats },
  };
}

export const meta = loadMeta();

export function saveMeta() {
  save('meta', meta);
}

export function resetProgress() {
  Object.assign(meta, DEFAULT_META());
  remove('meta');
}

export function xpToNext(level) {
  return Math.round(5 + level * 4 + Math.pow(level, 1.55) * 1.4);
}

export function bestScore() {
  return meta.highscores[0]?.score ?? 0;
}

export function qualifies(score) {
  if (score <= 0) return false;
  return meta.highscores.length < 10 || score > meta.highscores[meta.highscores.length - 1].score;
}

/** Returns the rank (0-based) of the inserted entry. */
export function addHighScore(entry) {
  meta.highscores.push(entry);
  meta.highscores.sort((a, b) => b.score - a.score);
  meta.highscores = meta.highscores.slice(0, 10);
  saveMeta();
  return meta.highscores.indexOf(entry);
}

export function isUnlocked(key) {
  return !key || !!meta.unlocks[key];
}

/** Unlock something; returns true the first time. */
export function unlock(key) {
  if (meta.unlocks[key]) return false;
  meta.unlocks[key] = true;
  saveMeta();
  return true;
}

export function recordRun(run) {
  const s = meta.stats;
  s.runs++;
  s.kills += run.kills;
  s.bestArena = Math.max(s.bestArena, run.arenaIndex + 1);
  s.bossesDefeated += run.bossesDefeated;
  s.playTime += run.time;
  s.bestCombo = Math.max(s.bestCombo, run.maxCombo);
  if (run.victory) s.victories++;
  saveMeta();
}
