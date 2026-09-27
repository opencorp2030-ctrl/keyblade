// Global tuning constants. Everything that is "a number you might tweak" lives here.

export const VIEW_W = 960;
export const VIEW_H = 540;
export const TILE = 30;
export const COLS = 32;
export const ROWS = 18;

export const ARENAS_PER_SECTOR = 3; // the last arena of each sector is a boss arena
export const WAVES_PER_ARENA = 3;
export const TOTAL_ARENAS = 9;

export const FONT_DISPLAY = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const PALETTE = {
  bg: '#05060d',
  ink: '#e9ecff',
  dim: '#7c84a8',
  faint: '#3a4166',
  accent: '#4de3ff',
  hot: '#ff4d7a',
  gold: '#ffd24d',
  good: '#6dff9a',
  panel: 'rgba(10, 12, 28, 0.86)',
};

export const SECTORS = [
  { name: 'HOME ROW', floor: '#0b0e1d', floor2: '#0e1226', wall: '#1d2446', wallTop: '#2a3363', accent: '#4de3ff', letters: 'ASDFGHJKL' },
  { name: 'FUNCTION ROW', floor: '#140a1a', floor2: '#190d21', wall: '#3a1a3f', wallTop: '#55265c', accent: '#ff5ad8', letters: 'F1F2F3F4F5F6F7F8F9' },
  { name: 'NUMPAD ABYSS', floor: '#141004', floor2: '#1a1506', wall: '#3d3212', wallTop: '#5a4a1c', accent: '#ffd24d', letters: '0123456789+-*/' },
];

export const DIFFICULTIES = {
  story: { id: 'story', name: 'STORY', enemyHp: 0.6, budget: 0.7, speed: 0.9, score: 0.5, playerHp: 2 },
  normal: { id: 'normal', name: 'NORMAL', enemyHp: 1, budget: 1, speed: 1, score: 1, playerHp: 0 },
  hard: { id: 'hard', name: 'HARD', enemyHp: 1.3, budget: 1.3, speed: 1.08, score: 1.6, playerHp: 0 },
  nightmare: { id: 'nightmare', name: 'NIGHTMARE', enemyHp: 1.6, budget: 1.6, speed: 1.15, score: 2.5, playerHp: -1 },
};
export const DIFFICULTY_ORDER = ['story', 'normal', 'hard', 'nightmare'];

// Combo multiplier tiers: [minimum combo, multiplier, callout]
export const COMBO_TIERS = [
  [0, 1, ''],
  [10, 1.5, 'NICE'],
  [25, 2, 'COMBO!'],
  [50, 3, 'RAMPAGE'],
  [100, 4, 'UNSTOPPABLE'],
  [200, 5, 'KEYBLADE MASTER'],
];
