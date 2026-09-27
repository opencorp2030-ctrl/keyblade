// Keyboard input: action bindings, held-key state, menu navigation and key rebinding.
//
// Design notes:
// - We bind physical key positions (KeyboardEvent.code) so WASD works on AZERTY/QWERTZ too,
//   and we show the *actual* printed key label via navigator.keyboard.getLayoutMap() when available.
// - The Tab key is never used (Hack Club Tabbed rule). We swallow it so it can't move browser focus.
// - There are intentionally no mouse handlers anywhere in the game.

import { settings, saveSettings } from './settings.js';

export const ACTION_LABELS = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  dash: 'Dash',
  interact: 'Interact',
  special: 'Special ability',
  w1: 'Weapon 1',
  w2: 'Weapon 2',
  w3: 'Weapon 3',
  w4: 'Weapon 4',
  pause: 'Pause',
  confirm: 'Confirm',
  restart: 'Restart (after death)',
  info: 'Show / hide game info',
};

export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  dash: ['Space'],
  interact: ['KeyE'],
  special: ['KeyQ'],
  w1: ['Digit1', 'Numpad1'],
  w2: ['Digit2', 'Numpad2'],
  w3: ['Digit3', 'Numpad3'],
  w4: ['Digit4', 'Numpad4'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  restart: ['KeyR'],
  info: ['KeyI'],
};

/** Actions whose primary key the player may rebind. Secondary keys (arrows, numpad) stay. */
export const REBINDABLE = ['up', 'down', 'left', 'right', 'dash', 'interact', 'special', 'info', 'restart'];

/** Keys that can never be bound: Tab (Tabbed rule), menu keys, and OS/browser keys. */
const FORBIDDEN = new Set([
  'Tab', 'Escape', 'Enter', 'NumpadEnter', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
  'ContextMenu', 'CapsLock', 'F5', 'F11', 'F12', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
]);

/** Browser keys we never swallow. */
const PASSTHROUGH = new Set(['F5', 'F11', 'F12']);

/** Fixed menu navigation keys (always work, in addition to the player's movement bindings). */
const NAV_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  back: ['Escape', 'Backspace'],
};

const NAMED = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', Delete: 'DEL', Insert: 'INS', Home: 'HOME',
  End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
};

function cloneBindings(b) {
  const out = {};
  for (const k of Object.keys(DEFAULT_BINDINGS)) out[k] = [...(b?.[k] ?? DEFAULT_BINDINGS[k])];
  return out;
}

export class Input {
  constructor() {
    this.held = new Set();
    this.bindings = cloneBindings(settings.bindings);
    this.listeners = [];
    this.capture = null;
    this.layoutMap = null;
    this.onBlur = null;
    this.lastKeyTime = 0;
  }

  attach() {
    window.addEventListener('keydown', (e) => this._down(e), { capture: true });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.code === 'Tab') e.preventDefault();
    }, { capture: true });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.onBlur?.();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.held.clear();
        this.onBlur?.();
      }
    });
    try {
      navigator.keyboard?.getLayoutMap?.().then((m) => (this.layoutMap = m)).catch(() => {});
    } catch {
      /* not supported: fall back to code names */
    }
  }

  on(fn) {
    this.listeners.push(fn);
  }

  _down(e) {
    // Tab is not part of KEYBLADE. Swallow it so focus can never leave the game.
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    // Leave browser/OS shortcuts (Cmd+R, Ctrl+W, ...) alone.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (PASSTHROUGH.has(e.code)) return;
    e.preventDefault();
    this.lastKeyTime = performance.now();

    if (this.capture) {
      if (e.repeat) return;
      const cb = this.capture;
      this.capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }

    if (!e.repeat) this.held.add(e.code);
    const ev = {
      code: e.code,
      repeat: e.repeat,
      nav: this.navFor(e.code),
      actions: this.actionsFor(e.code),
      digit: this.digitFor(e.code),
    };
    for (const fn of this.listeners) fn(ev);
  }

  actionsFor(code) {
    const out = new Set();
    for (const [action, codes] of Object.entries(this.bindings)) if (codes.includes(code)) out.add(action);
    return out;
  }

  navFor(code) {
    for (const [nav, codes] of Object.entries(NAV_KEYS)) if (codes.includes(code)) return nav;
    for (const dir of ['up', 'down', 'left', 'right']) if (this.bindings[dir].includes(code)) return dir;
    return null;
  }

  digitFor(code) {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    return m ? Number(m[1]) : null;
  }

  down(action) {
    for (const c of this.bindings[action]) if (this.held.has(c)) return true;
    return false;
  }

  /** Movement vector from held keys, normalized. */
  axis() {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  /** Printable label for a key code, respecting the user's keyboard layout. */
  label(code) {
    if (!code) return '—';
    if (NAMED[code]) return NAMED[code];
    // Number keys always read as numbers (AZERTY prints & é " ' on them, but they still send Digit1-4).
    if (code.startsWith('Digit')) return code.slice(5);
    const mapped = this.layoutMap?.get?.(code);
    if (mapped && mapped.trim()) return mapped.toUpperCase();
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
    return code.toUpperCase();
  }

  /** Label of the primary key for an action. */
  keyOf(action) {
    return this.label(this.bindings[action]?.[0]);
  }

  beginCapture(cb) {
    this.capture = cb;
  }

  isForbidden(code) {
    return FORBIDDEN.has(code);
  }

  /** Rebind the primary key of an action; swaps with any action already using that key. */
  rebind(action, code) {
    if (!REBINDABLE.includes(action) || FORBIDDEN.has(code)) return false;
    const old = this.bindings[action][0];
    for (const [other, codes] of Object.entries(this.bindings)) {
      if (other === action) continue;
      const i = codes.indexOf(code);
      if (i === -1) continue;
      // Swap with other rebindable actions; fixed actions (pause, weapons) just lose the extra key.
      if (REBINDABLE.includes(other) && i === 0) codes[i] = old;
      else codes.splice(i, 1);
    }
    const mine = this.bindings[action];
    const dup = mine.indexOf(code);
    if (dup > 0) mine.splice(dup, 1);
    mine[0] = code;
    this.persist();
    return true;
  }

  resetBindings() {
    this.bindings = cloneBindings(null);
    this.persist();
  }

  persist() {
    settings.bindings = cloneBindings(this.bindings);
    saveSettings();
  }
}
