// Front-end screens: main menu, character select, how to play, controls, settings, high scores,
// and a reusable confirm dialog. All keyboard-only.

import { PALETTE, VIEW_W, VIEW_H, DIFFICULTIES, DIFFICULTY_ORDER, FONT_DISPLAY } from '../config.js';
import { rand, TAU, clamp, damp } from '../math.js';
import { settings, saveSettings, resetSettings, SHAKE_LABELS } from '../settings.js';
import { ACTION_LABELS, REBINDABLE } from '../input.js';
import { audio } from '../audio.js';
import { CHARACTERS } from '../characters.js';
import { meta, isUnlocked, resetProgress } from '../progression.js';
import { WEAPONS } from '../weapons.js';
import { SPECIALS } from '../abilities.js';
import { ENEMY_TYPES } from '../enemies.js';
import { Menu } from './menu.js';
import { text, keycap, hintBar, panel, paragraph, rgba, roundRect, bar, title, dimBackground, measure } from './draw.js';
import { PlayScene } from './play.js';

// ---------------------------------------------------------------- animated backdrop
const KEYS = 'QWERTYUIOPASDFGHJKLZXCVBNM1234'.split('');
class Backdrop {
  constructor() {
    this.caps = Array.from({ length: 34 }, () => this.spawn(true));
  }
  spawn(initial) {
    return {
      x: rand(0, VIEW_W), y: initial ? rand(0, VIEW_H) : -30, s: rand(14, 30), v: rand(12, 40),
      r: rand(-0.4, 0.4), vr: rand(-0.3, 0.3), k: KEYS[Math.floor(rand(0, KEYS.length))], a: rand(0.05, 0.18),
    };
  }
  update(dt) {
    const still = settings.reducedMotion;
    for (let i = 0; i < this.caps.length; i++) {
      const c = this.caps[i];
      if (still) continue;
      c.y += c.v * dt;
      c.r += c.vr * dt;
      if (c.y > VIEW_H + 30) this.caps[i] = this.spawn(false);
    }
  }
  render(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#070916');
    g.addColorStop(1, '#0c0717');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = 'rgba(77,227,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < VIEW_W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, VIEW_H);
      ctx.stroke();
    }
    for (const c of this.caps) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.r);
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#2a3363';
      roundRect(ctx, -c.s / 2, -c.s / 2, c.s, c.s, 4);
      ctx.fill();
      ctx.fillStyle = '#9fb4ff';
      ctx.font = `700 ${Math.round(c.s * 0.45)}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.k, 0, 1);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
export const backdrop = new Backdrop();

class Screen {
  constructor(game) {
    this.game = game;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    backdrop.update(dt);
    this.menu?.update(dt);
  }
  onKey(ev) {
    this.menu?.onKey(ev);
  }
  back() {
    this.game.transition(() => this.game.setScene(new MainMenuScene(this.game)), 0.18);
  }
  /** Replace {action} placeholders with the player's current key for that action. */
  keys(str) {
    return str.replace(/\{(\w+)\}/g, (_, a) => this.game.input.keyOf(a));
  }
}

// ---------------------------------------------------------------- main menu
export class MainMenuScene extends Screen {
  constructor(game, focus = 0) {
    super(game);
    const go = (fn) => () => game.transition(fn, 0.2);
    this.menu = new Menu(game, [
      { label: 'PLAY', hint: 'Choose a character and start a run', activate: go(() => game.setScene(new CharSelectScene(game))) },
      { label: 'HOW TO PLAY', hint: 'Goal, combat and tips', activate: go(() => game.setScene(new HowToScene(game))) },
      { label: 'CONTROLS', hint: 'View and rebind every key', activate: go(() => game.setScene(new ControlsScene(game))) },
      { label: 'SETTINGS', hint: 'Audio, screen shake, reduced motion, difficulty…', activate: go(() => game.setScene(new SettingsScene(game))) },
      { label: 'HIGH SCORES', hint: 'Top 10 runs and lifetime stats', activate: go(() => game.setScene(new HighScoresScene(game))) },
    ], { y: 262, width: 300, spacing: 40 });
    this.menu.focus(focus, true);
  }
  enter() {
    audio.setTrack('menu');
    this.game.announce('KEYBLADE. Main menu. Use arrow keys or W and S to move, Enter to select. Play is focused.');
  }
  render(ctx) {
    backdrop.render(ctx, this.t);
    const t = this.t;
    const cx = VIEW_W / 2;
    const ty = 150;
    // Title with chromatic split
    const jitter = settings.reducedMotion ? 0 : Math.sin(t * 1.3) * 1.5 + (Math.random() < 0.02 ? rand(-4, 4) : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    text(ctx, 'KEYBLADE', cx - 3 + jitter, ty, { size: 88, color: 'rgba(255,77,122,0.7)', align: 'center', weight: 700, shadow: false });
    text(ctx, 'KEYBLADE', cx + 3 - jitter, ty, { size: 88, color: 'rgba(77,227,255,0.7)', align: 'center', weight: 700, shadow: false });
    ctx.restore();
    text(ctx, 'KEYBLADE', cx, ty, { size: 88, color: '#ffffff', align: 'center', weight: 700 });
    text(ctx, 'A KEYBOARD-ONLY ARCADE SURVIVAL GAME', cx, ty + 34, { size: 15, color: PALETTE.accent, align: 'center', weight: 700 });
    this.menu.render(ctx);
    hintBar(ctx, [[['↑', '↓'], 'NAVIGATE'], [['ENTER'], 'SELECT']], VIEW_H - 48);
    text(ctx, 'No mouse. No Tab key. Just you and the keyboard.', cx, VIEW_H - 10, { size: 12, color: PALETTE.faint, align: 'center', weight: 600, shadow: false });
  }
}

// ---------------------------------------------------------------- character select
export class CharSelectScene extends Screen {
  constructor(game) {
    super(game);
    this.index = Math.max(0, CHARACTERS.findIndex((c) => c.id === settings.lastCharacter));
    this.slide = this.index;
  }
  enter() {
    this.announceChar();
  }
  get diffId() {
    return settings.difficulty;
  }
  availableDiffs() {
    return DIFFICULTY_ORDER.filter((d) => d !== 'nightmare' || meta.stats.victories > 0);
  }
  announceChar() {
    const c = CHARACTERS[this.index];
    const locked = !isUnlocked(c.unlock);
    this.game.announce(
      `${c.name}, ${c.title}. ${locked ? `Locked. ${c.unlockText}` : `${c.desc} Weapon ${WEAPONS[c.weapon].name}. Special ${SPECIALS[c.special].name}.`} ` +
      `Difficulty ${DIFFICULTIES[this.diffId].name}. Left and right to choose character, up and down for difficulty, Enter to start.`,
    );
  }
  onKey(ev) {
    const n = CHARACTERS.length;
    if (ev.nav === 'left' || ev.nav === 'right') {
      this.index = (this.index + (ev.nav === 'left' ? -1 : 1) + n) % n;
      audio.play('move');
      this.announceChar();
    } else if (ev.nav === 'up' || ev.nav === 'down') {
      const list = this.availableDiffs();
      const i = Math.max(0, list.indexOf(settings.difficulty));
      settings.difficulty = list[clamp(i + (ev.nav === 'up' ? -1 : 1), 0, list.length - 1)];
      saveSettings();
      audio.play('move');
      this.announceChar();
    } else if (ev.digit >= 1 && ev.digit <= n) {
      this.index = ev.digit - 1;
      audio.play('move');
      this.announceChar();
    } else if (ev.nav === 'confirm' && !ev.repeat) {
      const c = CHARACTERS[this.index];
      if (!isUnlocked(c.unlock)) {
        audio.play('deny');
        this.shake = 0.3;
        return;
      }
      audio.play('choose');
      settings.lastCharacter = c.id;
      saveSettings();
      this.game.transition(() => this.game.setScene(new PlayScene(this.game, c, settings.difficulty)), 0.35);
    } else if (ev.nav === 'back' && !ev.repeat) {
      audio.play('back');
      this.back();
    }
  }
  update(dt) {
    super.update(dt);
    this.slide += (this.index - this.slide) * damp(14, dt);
    this.shake = Math.max(0, (this.shake ?? 0) - dt);
  }
  render(ctx) {
    backdrop.render(ctx, this.t);
    title(ctx, 'CHOOSE YOUR KEY', 58);
    const cw = 196;
    const gap = 16;
    const total = CHARACTERS.length * cw + (CHARACTERS.length - 1) * gap;
    const x0 = VIEW_W / 2 - total / 2;
    CHARACTERS.forEach((c, i) => {
      const sel = i === this.index;
      const locked = !isUnlocked(c.unlock);
      const x = x0 + i * (cw + gap) + (sel && this.shake ? Math.sin(this.t * 80) * 4 : 0);
      const y = 92 - (sel ? 8 : 0);
      const h = 330;
      panel(ctx, x, y, cw, h, { color: sel ? c.color : '#ffffff', border: sel ? 0.9 : 0.1, fill: sel ? 'rgba(12,16,36,0.95)' : 'rgba(8,10,22,0.8)' });
      if (sel) {
        ctx.strokeStyle = rgba(c.color, 0.35);
        ctx.lineWidth = 6;
        roundRect(ctx, x - 3, y - 3, cw + 6, h + 6, 14);
        ctx.stroke();
      }
      keycap(ctx, String(i + 1), x + 10, y + 10, { size: 11, h: 20, minW: 20, active: sel, accent: c.color });
      // Portrait: big keycap in the character colour
      const px = x + cw / 2;
      const py = y + 82;
      const bob = settings.reducedMotion || !sel ? 0 : Math.sin(this.t * 4) * 4;
      ctx.fillStyle = locked ? '#1a1d30' : '#0b1830';
      roundRect(ctx, px - 36, py - 36 + bob, 72, 72, 12);
      ctx.fill();
      ctx.fillStyle = locked ? '#2a2f4a' : c.color;
      roundRect(ctx, px - 31, py - 35 + bob, 62, 60, 10);
      ctx.fill();
      text(ctx, locked ? '?' : c.name[0], px, py + 8 + bob, { size: 36, color: '#05060d', align: 'center', weight: 700, shadow: false });
      text(ctx, c.name, px, y + 150, { size: 22, color: locked ? PALETTE.faint : '#fff', align: 'center', weight: 700 });
      text(ctx, locked ? 'LOCKED' : c.title.toUpperCase(), px, y + 170, { size: 11, color: locked ? PALETTE.faint : c.color, align: 'center', weight: 700 });
      if (locked) {
        paragraph(ctx, c.unlockText, x + 16, y + 206, cw - 32, { size: 13, color: PALETTE.dim });
        return;
      }
      const stats = [
        ['HP', c.hp / 7],
        ['SPEED', (c.speed - 140) / 60],
        ['DASH', c.dashCharges / 2],
      ];
      stats.forEach(([k, v], j) => {
        text(ctx, k, x + 16, y + 200 + j * 18, { size: 10, color: PALETTE.dim, weight: 700, shadow: false });
        bar(ctx, x + 64, y + 193 + j * 18, cw - 82, 7, v, c.color);
      });
      text(ctx, `[${WEAPONS[c.weapon].slot}] ${WEAPONS[c.weapon].name}`, x + 16, y + 268, { size: 12, color: WEAPONS[c.weapon].color, weight: 700, shadow: false });
      text(ctx, `[${this.game.input.keyOf('special')}] ${SPECIALS[c.special].name}`, x + 16, y + 286, { size: 12, color: SPECIALS[c.special].color, weight: 700, shadow: false });
      if (sel) paragraph(ctx, c.desc, x + 16, y + 306, cw - 24, { size: 11, color: PALETTE.dim });
    });
    // Difficulty selector
    const d = DIFFICULTIES[this.diffId];
    const dy = 446;
    text(ctx, 'DIFFICULTY', VIEW_W / 2, dy, { size: 11, color: PALETTE.dim, align: 'center', weight: 700 });
    text(ctx, `▲  ${d.name}  ▼`, VIEW_W / 2, dy + 22, { size: 18, color: d.id === 'story' ? PALETTE.good : d.id === 'normal' ? PALETTE.accent : PALETTE.hot, align: 'center', weight: 700 });
    hintBar(ctx, [[['←', '→'], 'CHARACTER'], [['↑', '↓'], 'DIFFICULTY'], [['ENTER'], 'START'], [['ESC'], 'BACK']]);
  }
}

// ---------------------------------------------------------------- how to play
const HOWTO_PAGES = [
  {
    title: 'THE GOAL',
    body: [
      'The keyboard has been overrun by corrupted keys. Fight through 3 sectors of 3 arenas each: two arenas of enemy waves, then a boss.',
      'Clear every wave, then walk to the EXIT portal and press {interact}. Beat the final boss, KERNEL PANIC, to win.',
      'You keep your level, weapons and upgrades between arenas. Die and the run is over — press {restart} to go again instantly.',
    ],
  },
  {
    title: 'COMBAT',
    body: [
      'Your weapons fire automatically at the nearest enemy. Your job: move, dash and choose the right weapon.',
      '{dash} dashes. You are invincible while dashing and you damage everything you pass through. Dashing through bullets or shockwaves is a PERFECT DODGE: it charges your special.',
      '1–4 switch weapons. Every weapon cools down separately, and the first shot after a switch is a SWAP STRIKE (+60% damage). Weave between weapons to shred enemies.',
      '{special} fires your special once the meter is full. It fills as you deal damage, kill and dodge.',
    ],
  },
  {
    title: 'SCORE & PROGRESSION',
    body: [
      'Kills in quick succession build a COMBO. Higher combos multiply your score up to x5. Getting hit resets it.',
      'Enemies drop XP. Level up to pick 1 of 3 random upgrades (press 1, 2 or 3). Press {interact} on the upgrade screen to reroll.',
      'After each arena, press {interact} on the golden CACHE for a new weapon or supplies. Red shrines trade 1 HP for an extra upgrade.',
      'Beat bosses to unlock a new character. Win once to unlock NIGHTMARE difficulty. Press {info} at any time to see your build.',
    ],
  },
  {
    title: 'ENEMIES',
    enemies: ['typo', 'backspace', 'caret', 'null', 'spam', 'shift', 'cron'],
  },
];

export class HowToScene extends Screen {
  constructor(game, onBack) {
    super(game);
    this.overlay = !!onBack;
    this.page = 0;
    this.onBackFn = onBack;
  }
  enter() {
    this.announcePage();
  }
  announcePage() {
    const p = HOWTO_PAGES[this.page];
    const body = p.body ? p.body.map((b) => this.keys(b)).join(' ') : p.enemies.map((id) => `${ENEMY_TYPES[id].name}: ${ENEMY_TYPES[id].desc}`).join(' ');
    this.game.announce(`How to play, page ${this.page + 1} of ${HOWTO_PAGES.length}: ${p.title}. ${body} Left and right to change page, Escape to go back.`);
  }
  onKey(ev) {
    if (ev.nav === 'left' || ev.nav === 'right' || (ev.nav === 'confirm' && !ev.repeat)) {
      const dir = ev.nav === 'left' ? -1 : 1;
      const next = clamp(this.page + dir, 0, HOWTO_PAGES.length - 1);
      if (ev.nav === 'confirm' && this.page === HOWTO_PAGES.length - 1) return this.leave();
      if (next !== this.page) {
        this.page = next;
        audio.play('move');
        this.announcePage();
      }
    } else if (ev.nav === 'back' && !ev.repeat) {
      this.leave();
    }
  }
  leave() {
    audio.play('back');
    if (this.onBackFn) this.onBackFn();
    else this.back();
  }
  render(ctx) {
    if (!this.onBackFn) backdrop.render(ctx, this.t);
    else dimBackground(ctx, 0.9);
    const p = HOWTO_PAGES[this.page];
    title(ctx, p.title, 64);
    panel(ctx, 110, 92, VIEW_W - 220, 360);
    if (p.body) {
      let y = 130;
      for (const para of p.body) y += paragraph(ctx, this.keys(para), 140, y, VIEW_W - 280, { size: 16, color: PALETTE.ink }) + 14;
    } else {
      p.enemies.forEach((id, i) => {
        const e = ENEMY_TYPES[id];
        const y = 124 + i * 46;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(150, y, 10, 0, TAU);
        ctx.fill();
        text(ctx, e.name, 176, y + 5, { size: 15, color: e.color, weight: 700 });
        paragraph(ctx, e.desc, 300, y + 5, VIEW_W - 430, { size: 14, color: PALETTE.ink });
      });
    }
    // page dots
    HOWTO_PAGES.forEach((_, i) => {
      ctx.fillStyle = i === this.page ? PALETTE.accent : PALETTE.faint;
      ctx.beginPath();
      ctx.arc(VIEW_W / 2 + (i - (HOWTO_PAGES.length - 1) / 2) * 18, 472, i === this.page ? 5 : 3.5, 0, TAU);
      ctx.fill();
    });
    hintBar(ctx, [[['←', '→'], 'PAGE'], [['ESC'], 'BACK']]);
  }
}

// ---------------------------------------------------------------- controls (view + rebind)
export class ControlsScene extends Screen {
  constructor(game, onBack) {
    super(game);
    this.overlay = !!onBack;
    this.onBackFn = onBack;
    this.capturing = null;
    this.message = '';
    const input = game.input;
    const items = REBINDABLE.map((action) => ({
      label: ACTION_LABELS[action].toUpperCase(),
      value: () => (this.capturing === action ? 'PRESS A KEY…' : this.bindingText(action)),
      hint: 'ENTER to rebind this key',
      activate: () => this.capture(action),
    }));
    items.push({ label: 'RESET TO DEFAULTS', activate: () => { input.resetBindings(); this.flash('Controls reset to defaults.'); } });
    items.push({ label: 'BACK', activate: () => this.leave() });
    this.menu = new Menu(game, items, { x: 300, y: 112, width: 440, spacing: 34, onBack: () => this.leave() });
  }
  enter() {
    this.game.announce('Controls. Up and down to choose an action, Enter to rebind it, Escape to go back.');
  }
  bindingText(action) {
    const input = this.game.input;
    return input.bindings[action].map((c) => input.label(c)).join(' / ');
  }
  capture(action) {
    this.capturing = action;
    this.game.announce(`Press the new key for ${ACTION_LABELS[action]}. Escape cancels.`);
    this.game.input.beginCapture((code) => {
      this.capturing = null;
      if (!code) return this.flash('Cancelled.');
      if (this.game.input.isForbidden(code)) {
        audio.play('deny');
        return this.flash(code === 'Tab' ? 'Tab is not allowed in KEYBLADE.' : 'That key is reserved. Pick another.');
      }
      this.game.input.rebind(action, code);
      audio.play('select');
      this.flash(`${ACTION_LABELS[action]} is now ${this.game.input.label(code)}.`);
    });
  }
  flash(msg) {
    this.message = msg;
    this.msgT = 2.5;
    this.game.announce(msg);
  }
  update(dt) {
    super.update(dt);
    this.msgT = Math.max(0, (this.msgT ?? 0) - dt);
  }
  leave() {
    if (this.onBackFn) this.onBackFn();
    else this.back();
  }
  render(ctx) {
    if (!this.onBackFn) backdrop.render(ctx, this.t);
    else dimBackground(ctx, 0.92);
    title(ctx, 'CONTROLS', 56);
    this.menu.render(ctx);
    // Fixed keys column
    const x = 560;
    panel(ctx, x, 92, 360, 380);
    text(ctx, 'FIXED KEYS', x + 20, 122, { size: 13, color: PALETTE.accent, weight: 700 });
    const input = this.game.input;
    const rows = [
      [['1', '2', '3', '4'], 'Select weapon'],
      [['ESC', 'P'], 'Pause'],
      [['ENTER'], 'Confirm'],
      [['↑', '↓', '←', '→'], 'Move / navigate menus'],
      [['ESC', 'BKSP'], 'Back in menus'],
      [[input.keyOf('interact')], 'Reroll on upgrade screen'],
      [['1', '2', '3'], 'Pick an upgrade card'],
    ];
    rows.forEach(([keys, label], i) => {
      let kx = x + 20;
      const y = 142 + i * 38;
      for (const k of keys) kx += keycap(ctx, k, kx, y, { size: 11, h: 24, minW: 24 }) + 5;
      text(ctx, label, x + 190, y + 17, { size: 13, color: PALETTE.ink, weight: 600, shadow: false });
    });
    text(ctx, 'The Tab key is never used.', x + 20, 440, { size: 12, color: PALETTE.dim, weight: 600, shadow: false });
    text(ctx, 'Keys follow your keyboard layout (AZERTY friendly).', x + 20, 458, { size: 12, color: PALETTE.dim, weight: 600, shadow: false });
    if (this.msgT > 0) text(ctx, this.message, VIEW_W / 2, 488, { size: 14, color: PALETTE.gold, align: 'center', weight: 700 });
    hintBar(ctx, [[['↑', '↓'], 'NAVIGATE'], [['ENTER'], 'REBIND'], [['ESC'], 'BACK']]);
  }
  onKey(ev) {
    if (this.capturing) return;
    super.onKey(ev);
  }
}

// ---------------------------------------------------------------- settings
export class SettingsScene extends Screen {
  constructor(game, onBack) {
    super(game);
    this.overlay = !!onBack;
    this.onBackFn = onBack;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const vol = (key) => ({
      label: key === 'master' ? 'MASTER VOLUME' : key === 'music' ? 'MUSIC VOLUME' : 'SFX VOLUME',
      value: () => pct(settings[key]),
      repeatable: true,
      adjust: (d) => {
        settings[key] = clamp(Math.round((settings[key] + d * 0.1) * 10) / 10, 0, 1);
        saveSettings();
        audio.applyVolumes();
        if (key !== 'music') audio.play('pickup');
      },
    });
    const toggle = (label, key, hint) => ({
      label, hint, value: () => (settings[key] ? 'ON' : 'OFF'),
      adjust: () => {
        settings[key] = !settings[key];
        saveSettings();
      },
    });
    this.menu = new Menu(game, [
      vol('master'),
      vol('music'),
      vol('sfx'),
      {
        label: 'SCREEN SHAKE', value: () => (settings.reducedMotion ? 'OFF (REDUCED MOTION)' : SHAKE_LABELS[settings.shake]),
        adjust: (d) => {
          settings.shake = (settings.shake + d + 3) % 3;
          saveSettings();
        },
      },
      toggle('REDUCED MOTION', 'reducedMotion', 'Removes shake, flashes, most particles and animated backgrounds'),
      toggle('DAMAGE NUMBERS', 'damageNumbers'),
      {
        label: 'AIM MODE', value: () => (settings.aimMode === 'auto' ? 'AUTO (NEAREST)' : 'FACING'),
        hint: 'AUTO targets the nearest enemy. FACING fires where you move.',
        adjust: () => {
          settings.aimMode = settings.aimMode === 'auto' ? 'facing' : 'auto';
          saveSettings();
        },
      },
      {
        label: 'DIFFICULTY', value: () => DIFFICULTIES[settings.difficulty].name,
        hint: 'Applies to the next run',
        adjust: (d) => {
          const list = DIFFICULTY_ORDER.filter((x) => x !== 'nightmare' || meta.stats.victories > 0);
          const i = Math.max(0, list.indexOf(settings.difficulty));
          settings.difficulty = list[(i + d + list.length) % list.length];
          saveSettings();
        },
      },
      toggle('SHOW FPS', 'showFps'),
      { label: 'CONTROLS…', activate: () => game.push(new ControlsScene(game, () => game.pop())) },
      {
        label: 'RESET ALL SETTINGS',
        activate: () => game.push(new ConfirmScene(game, 'Reset all settings and key bindings?', () => {
          resetSettings();
          game.input.resetBindings();
          audio.applyVolumes();
        })),
      },
      {
        label: 'ERASE PROGRESS',
        hint: 'Deletes high scores and unlocks',
        activate: () => game.push(new ConfirmScene(game, 'Erase all high scores and unlocks?', () => resetProgress())),
      },
      { label: 'BACK', activate: () => this.leave() },
    ], { y: 96, width: 520, spacing: 31, onBack: () => this.leave() });
  }
  enter() {
    this.game.announce('Settings. Up and down to choose, left and right to change, Escape to go back.');
  }
  leave() {
    if (this.onBackFn) this.onBackFn();
    else this.back();
  }
  render(ctx) {
    if (!this.onBackFn) backdrop.render(ctx, this.t);
    else dimBackground(ctx, 0.92);
    title(ctx, 'SETTINGS', 56);
    this.menu.render(ctx);
    hintBar(ctx, [[['↑', '↓'], 'NAVIGATE'], [['←', '→'], 'CHANGE'], [['ENTER'], 'SELECT'], [['ESC'], 'BACK']]);
  }
}

// ---------------------------------------------------------------- high scores
export class HighScoresScene extends Screen {
  enter() {
    const top = meta.highscores[0];
    this.game.announce(top ? `High scores. Best: ${top.name}, ${top.score} points. Escape to go back.` : 'High scores. No runs recorded yet. Escape to go back.');
  }
  onKey(ev) {
    if ((ev.nav === 'back' || ev.nav === 'confirm') && !ev.repeat) {
      audio.play('back');
      this.back();
    }
  }
  render(ctx) {
    backdrop.render(ctx, this.t);
    title(ctx, 'HIGH SCORES', 56);
    panel(ctx, 110, 84, 500, 380);
    const cols = [140, 190, 330, 440, 540];
    ['#', 'NAME', 'SCORE', 'KEY', 'REACHED'].forEach((h, i) =>
      text(ctx, h, cols[i], 114, { size: 11, color: PALETTE.dim, weight: 700, align: i === 2 ? 'left' : 'left' }));
    const list = meta.highscores;
    if (!list.length) text(ctx, 'No runs yet. Go make history.', 360, 260, { size: 16, color: PALETTE.dim, align: 'center' });
    list.forEach((h, i) => {
      const y = 146 + i * 30;
      const color = i === 0 ? PALETTE.gold : PALETTE.ink;
      text(ctx, String(i + 1), cols[0], y, { size: 15, color, weight: 700, mono: true });
      text(ctx, h.name, cols[1], y, { size: 15, color, weight: 700, mono: true });
      text(ctx, String(h.score).padStart(7, '0'), cols[2], y, { size: 15, color, weight: 700, mono: true });
      text(ctx, h.character, cols[3], y, { size: 13, color: PALETTE.dim, weight: 700 });
      text(ctx, h.victory ? 'VICTORY' : `ARENA ${h.arena}`, cols[4], y, { size: 13, color: h.victory ? PALETTE.good : PALETTE.dim, weight: 700 });
    });
    panel(ctx, 630, 84, 220, 380);
    text(ctx, 'LIFETIME', 650, 114, { size: 11, color: PALETTE.dim, weight: 700 });
    const s = meta.stats;
    const mins = Math.floor(s.playTime / 60);
    [
      ['RUNS', s.runs], ['VICTORIES', s.victories], ['KILLS', s.kills], ['BOSSES', s.bossesDefeated],
      ['BEST COMBO', s.bestCombo], ['BEST ARENA', s.bestArena], ['TIME PLAYED', `${mins}m`],
    ].forEach(([k, v], i) => {
      text(ctx, k, 650, 150 + i * 40, { size: 12, color: PALETTE.dim, weight: 700 });
      text(ctx, String(v), 830, 150 + i * 40, { size: 16, color: PALETTE.ink, weight: 700, align: 'right', mono: true });
    });
    hintBar(ctx, [[['ESC'], 'BACK']]);
  }
}

// ---------------------------------------------------------------- confirm dialog (overlay)
export class ConfirmScene {
  constructor(game, question, onYes, onNo) {
    this.game = game;
    this.question = question;
    this.onYes = onYes;
    this.onNo = onNo;
    this.overlay = true;
    this.choice = 1; // default to NO so a stray ENTER is harmless
    this.t = 0;
  }
  enter() {
    this.game.announce(`${this.question} No is selected. Left or right to choose, Enter to confirm, Escape for no.`);
  }
  update(dt) {
    this.t += dt;
  }
  onKey(ev) {
    if (ev.nav === 'left' || ev.nav === 'right') {
      this.choice = 1 - this.choice;
      audio.play('move');
      this.game.announce(this.choice === 0 ? 'Yes' : 'No');
    } else if (ev.nav === 'confirm' && !ev.repeat && ev.code !== 'Space') {
      this.game.pop();
      if (this.choice === 0) {
        audio.play('select');
        this.onYes?.();
      } else {
        audio.play('back');
        this.onNo?.();
      }
    } else if (ev.nav === 'back' && !ev.repeat) {
      audio.play('back');
      this.game.pop();
      this.onNo?.();
    }
  }
  render(ctx) {
    dimBackground(ctx, 0.6);
    const w = 460;
    const x = VIEW_W / 2 - w / 2;
    const y = VIEW_H / 2 - 80;
    panel(ctx, x, y, w, 160, { color: PALETTE.hot, border: 0.8 });
    paragraph(ctx, this.question, VIEW_W / 2, y + 46, w - 60, { size: 18, color: '#fff', weight: 700, align: 'center' });
    ['YES', 'NO'].forEach((lbl, i) => {
      const bx = VIEW_W / 2 + (i === 0 ? -110 : 20);
      const sel = this.choice === i;
      ctx.fillStyle = sel ? (i === 0 ? PALETTE.hot : PALETTE.accent) : 'rgba(255,255,255,0.06)';
      roundRect(ctx, bx, y + 94, 90, 36, 8);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, lbl, bx + 45, y + 118, { size: 16, color: sel ? '#05060d' : PALETTE.dim, align: 'center', weight: 700, shadow: false });
    });
    text(ctx, '←/→ choose · ENTER confirm · ESC cancel', VIEW_W / 2, y + 150, { size: 11, color: PALETTE.dim, align: 'center', weight: 600, shadow: false });
  }
}

export { measure };
