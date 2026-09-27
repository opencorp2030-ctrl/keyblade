// Player settings, persisted to localStorage.

import { load, save } from './storage.js';

const prefersReduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  shake: 2, // 0 off, 1 low, 2 full
  reducedMotion: prefersReduced,
  damageNumbers: true,
  aimMode: 'auto', // 'auto' = nearest enemy, 'facing' = movement direction
  difficulty: 'normal',
  showFps: false,
  bindings: null, // custom key bindings (see input.js)
};

export const settings = Object.assign({}, DEFAULTS, load('settings', {}));

export function saveSettings() {
  save('settings', settings);
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS, { bindings: null });
  saveSettings();
}

export const SHAKE_LABELS = ['OFF', 'LOW', 'FULL'];

export function shakeScale() {
  if (settings.reducedMotion) return 0;
  return [0, 0.45, 1][settings.shake] ?? 1;
}
