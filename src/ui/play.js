// In-game scenes: the play scene itself plus pause, info (I), level-up and end-of-run overlays.

import { PALETTE, VIEW_W, VIEW_H, TOTAL_ARENAS, COMBO_TIERS } from '../config.js';
import { clamp, easeOutBack, damp, TAU } from '../math.js';
import { settings, saveSettings } from '../settings.js';
import { audio } from '../audio.js';
import { createRun } from '../state.js';
import { World } from '../world.js';
import { bufferAction, switchWeapon } from '../player.js';
import { renderWorld } from '../render.js';
import { WEAPONS, WEAPON_ORDER } from '../weapons.js';
import { SPECIALS } from '../abilities.js';
import { ENEMY_TYPES } from '../enemies.js';
import { rollUpgrades, applyUpgrade, RARITY } from '../upgrades.js';
import { recordRun, qualifies, addHighScore, unlock, meta } from '../progression.js';
import { renderHUD } from './hud.js';
import { Menu } from './menu.js';
import { text, keycap, hintBar, panel, paragraph, rgba, roundRect, dimBackground, title, measure, wrapLines } from './draw.js';
import { MainMenuScene, CharSelectScene, SettingsScene, ControlsScene, HowToScene, ConfirmScene } from './menus.js';

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- play
export class PlayScene {
  constructor(game, character, difficultyId) {
    this.game = game;
    this.character = character;
    this.difficultyId = difficultyId;
    const test = game.params.get('test');
    this.opts = { godMode: test === 'god', damageMul: test === 'god' ? 25 : 1 };
    this.run = createRun(character, difficultyId);
    const startArena = Number(game.params.get('arena'));
    if (test && startArena > 0) this.run.arenaIndex = clamp(startArena - 1, 0, TOTAL_ARENAS - 1);
    this.ended = false;
    this.world = new World(game, this.run, {
      onLevelUp: () => this.game.push(new LevelUpScene(this.game, this)),
      onDeath: () => this.endRun(false),
      onExit: () => this.nextArena(),
    }, this.opts);
    if (test && window.__keyblade) window.__keyblade.scene = this;
  }

  enter() {
    const k = (a) => this.game.input.keyOf(a);
    this.game.announce(
      `Run started as ${this.character.name}. Move with arrows or ${['up', 'left', 'down', 'right'].map((a) => k(a)).join(' ')}, ` +
      `${k('dash')} to dash, ${k('special')} for special, 1 to 4 to switch weapons, ${k('interact')} to interact, ${k('info')} for info, Escape to pause.`,
    );
  }

  nextArena() {
    const run = this.run;
    if (run.arenaIndex >= TOTAL_ARENAS - 1) {
      run.victory = true;
      this.endRun(true);
      return;
    }
    this.game.transition(() => this.world.loadArena(run.arenaIndex + 1), 0.4);
  }

  endRun(victory) {
    if (this.ended) return;
    this.ended = true;
    const run = this.run;
    if (victory) {
      const bonus = Math.round((this.world.player.hp * 1000 + Math.max(0, 1500 - run.time) * 5) * run.difficulty.score);
      run.victoryBonus = bonus;
      run.score += bonus;
      run.newUnlock = unlock('victory');
    }
    recordRun(run);
    this.game.push(new EndScene(this.game, this, victory));
  }

  restart() {
    this.game.transition(() => this.game.setScene(new PlayScene(this.game, this.character, this.difficultyId)), 0.25);
  }

  update(dt) {
    this.world.update(dt);
  }

  render(ctx, game) {
    renderWorld(ctx, this.world, game.scale);
    renderHUD(ctx, this.world, game);
  }

  onBlur() {
    if (this.world.player.alive && !this.ended) this.game.push(new PauseScene(this.game, this));
  }

  onKey(ev) {
    const a = ev.actions;
    const p = this.world.player;
    if (ev.repeat) return;
    if (a.has('pause')) {
      audio.play('select');
      this.game.push(new PauseScene(this.game, this));
      return;
    }
    if (a.has('info')) {
      audio.play('select');
      this.game.push(new InfoScene(this.game, this));
      return;
    }
    if (!p.alive) {
      if (a.has('restart')) this.restart();
      return;
    }
    if (a.has('dash')) bufferAction(p, 'dash');
    if (a.has('special')) bufferAction(p, 'special');
    if (a.has('interact')) bufferAction(p, 'interact');
    for (let i = 1; i <= 4; i++) if (a.has(`w${i}`)) switchWeapon(this.world, i);
  }
}

// ---------------------------------------------------------------- pause
export class PauseScene {
  constructor(game, play) {
    this.game = game;
    this.play = play;
    this.overlay = true;
    this.t = 0;
    const back = () => game.pop();
    this.menu = new Menu(game, [
      { label: 'RESUME', activate: () => this.resume() },
      {
        label: 'RESTART RUN',
        activate: () => game.push(new ConfirmScene(game, 'Restart this run from arena 1-1?', () => {
          game.pop();
          play.restart();
        })),
      },
      { label: 'SETTINGS', activate: () => game.push(new SettingsScene(game, back)) },
      { label: 'CONTROLS', activate: () => game.push(new ControlsScene(game, back)) },
      { label: 'HOW TO PLAY', activate: () => game.push(new HowToScene(game, back)) },
      {
        label: 'QUIT TO MAIN MENU',
        activate: () => game.push(new ConfirmScene(game, 'Abandon this run and return to the main menu?', () => {
          recordRun(play.run);
          game.transition(() => game.setScene(new MainMenuScene(game)));
        })),
      },
    ], { y: 214, width: 320, spacing: 42, onBack: () => this.resume() });
  }
  enter() {
    this.game.announce('Paused. Resume is focused. Up and down to choose, Enter to select, Escape to resume.');
  }
  resume() {
    this.game.pop();
    this.game.announce('Resumed.');
  }
  update(dt) {
    this.t += dt;
    this.menu.update(dt);
  }
  onKey(ev) {
    if (ev.code === 'KeyP' && !ev.repeat) return this.resume();
    if (ev.actions.has('info') && !ev.repeat) return this.game.push(new InfoScene(this.game, this.play));
    this.menu.onKey(ev);
  }
  render(ctx) {
    dimBackground(ctx, 0.7);
    title(ctx, 'PAUSED', 120, { size: 44 });
    const run = this.play.run;
    text(ctx, `${this.play.world.info.label} ${this.play.world.info.name}  ·  SCORE ${run.score}  ·  ${fmtTime(run.time)}`, VIEW_W / 2, 164, {
      size: 13, color: PALETTE.dim, align: 'center', weight: 700,
    });
    this.menu.render(ctx);
    hintBar(ctx, [[['↑', '↓'], 'NAVIGATE'], [['ENTER'], 'SELECT'], [['ESC'], 'RESUME'], [[this.game.input.keyOf('info')], 'INFO']]);
  }
}

// ---------------------------------------------------------------- info (I)
export class InfoScene {
  constructor(game, play) {
    this.game = game;
    this.play = play;
    this.overlay = true;
    this.page = 0;
  }
  enter() {
    const run = this.play.run;
    const p = this.play.world.player;
    const weapons = WEAPON_ORDER.filter((id) => run.weapons[id] > 0).map((id) => `${WEAPONS[id].name} level ${run.weapons[id]}`).join(', ');
    this.game.announce(
      `Game info. Level ${run.level}. Health ${p.hp} of ${p.maxHp}. Score ${run.score}. Weapons: ${weapons}. ` +
      `Upgrades: ${run.upgradeLog.join(', ') || 'none'}. Press I or Escape to close. Left and right switch page.`,
    );
  }
  update() {}
  onKey(ev) {
    if (ev.repeat) return;
    if (ev.actions.has('info') || ev.nav === 'back' || ev.nav === 'confirm') {
      audio.play('back');
      this.game.pop();
    } else if (ev.nav === 'left' || ev.nav === 'right') {
      this.page = 1 - this.page;
      audio.play('move');
    }
  }
  render(ctx) {
    dimBackground(ctx, 0.84);
    const w = this.play.world;
    const run = this.play.run;
    const p = w.player;
    title(ctx, this.page === 0 ? 'YOUR BUILD' : 'FIELD GUIDE', 50);
    if (this.page === 0) {
      // Left: stats
      panel(ctx, 40, 76, 280, 400);
      const s = p.stats;
      const rows = [
        ['CHARACTER', run.character.name], ['LEVEL', run.level], ['HP', `${p.hp} / ${p.maxHp}`],
        ['DAMAGE', `x${s.dmgMul.toFixed(2)}`], ['ATTACK SPEED', `x${s.rateMul.toFixed(2)}`], ['MOVE SPEED', Math.round(s.speed)],
        ['CRIT', `${Math.round(s.crit * 100)}% · x${s.critMul.toFixed(1)}`], ['DASH', `${p.dash.max} · ${s.dashCd.toFixed(2)}s`],
        ['PICKUP RADIUS', Math.round(s.magnet)], ['COMBO WINDOW', `${s.comboWindow.toFixed(1)}s`],
        ['KILLS', run.kills], ['BEST COMBO', run.maxCombo], ['TIME', fmtTime(run.time)],
      ];
      rows.forEach(([k, v], i) => {
        text(ctx, k, 60, 106 + i * 28, { size: 12, color: PALETTE.dim, weight: 700 });
        text(ctx, String(v), 300, 106 + i * 28, { size: 13, color: PALETTE.ink, weight: 700, align: 'right', mono: true });
      });
      // Middle: weapons + special
      panel(ctx, 336, 76, 290, 400);
      text(ctx, 'WEAPONS', 356, 104, { size: 12, color: PALETTE.accent, weight: 700 });
      WEAPON_ORDER.forEach((id, i) => {
        const def = WEAPONS[id];
        const lvl = run.weapons[id];
        const y = 124 + i * 64;
        keycap(ctx, String(def.slot), 356, y, { size: 11, h: 22, minW: 22, active: p.weapon === id, accent: def.color });
        text(ctx, lvl ? `${def.name}  LV ${lvl}` : `${def.name}  (LOCKED)`, 388, y + 16, { size: 14, color: lvl ? def.color : PALETTE.faint, weight: 700 });
        const perks = def.perks.slice(1, lvl).filter(Boolean).join(' · ') || (lvl ? 'Base' : 'Find it in a cache or level-up');
        paragraph(ctx, perks, 388, y + 36, 220, { size: 11, color: PALETTE.dim });
      });
      const sp = SPECIALS[p.special];
      text(ctx, `[${this.game.input.keyOf('special')}] ${sp.name}`, 356, 400, { size: 13, color: sp.color, weight: 700 });
      paragraph(ctx, sp.desc, 356, 420, 250, { size: 11, color: PALETTE.dim });
      // Right: upgrades
      panel(ctx, 642, 76, 278, 400);
      text(ctx, 'UPGRADES', 662, 104, { size: 12, color: PALETTE.accent, weight: 700 });
      const counts = {};
      for (const n of run.upgradeLog) counts[n] = (counts[n] ?? 0) + 1;
      const entries = Object.entries(counts);
      if (!entries.length) text(ctx, 'None yet — level up!', 662, 132, { size: 13, color: PALETTE.dim });
      entries.slice(0, 16).forEach(([n, c], i) =>
        text(ctx, `${n}${c > 1 ? `  x${c}` : ''}`, 662, 132 + i * 21, { size: 12, color: PALETTE.ink, weight: 600 }));
    } else {
      panel(ctx, 40, 76, 560, 400);
      text(ctx, 'ENEMIES', 60, 104, { size: 12, color: PALETTE.accent, weight: 700 });
      const ids = ['typo', 'backspace', 'caret', 'null', 'spam', 'shift', 'cron'];
      ids.forEach((id, i) => {
        const e = ENEMY_TYPES[id];
        const y = 130 + i * 48;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(70, y - 4, 8, 0, TAU);
        ctx.fill();
        text(ctx, e.name, 88, y, { size: 13, color: e.color, weight: 700 });
        paragraph(ctx, e.desc, 190, y, 390, { size: 12, color: PALETTE.ink });
      });
      panel(ctx, 616, 76, 304, 400);
      text(ctx, 'COMBO MULTIPLIERS', 636, 104, { size: 12, color: PALETTE.accent, weight: 700 });
      COMBO_TIERS.slice(1).forEach(([min, mult, name], i) => {
        text(ctx, `${min}+`, 636, 132 + i * 24, { size: 13, color: PALETTE.ink, weight: 700, mono: true });
        text(ctx, `x${mult}  ${name}`, 700, 132 + i * 24, { size: 13, color: PALETTE.gold, weight: 700 });
      });
      text(ctx, 'TIPS', 636, 280, { size: 12, color: PALETTE.accent, weight: 700 });
      let y = 300;
      for (const tip of [
        'Dash through bullets and shockwaves for PERFECT DODGES.',
        'Switch weapons often: SWAP STRIKE adds +60% damage.',
        'Kill NULLs early — they explode on their friends.',
        'Dash into SHIFT to break its shield.',
      ]) y += paragraph(ctx, `• ${tip}`, 636, y, 270, { size: 12, color: PALETTE.ink }) + 4;
    }
    hintBar(ctx, [[[this.game.input.keyOf('info'), 'ESC'], 'CLOSE'], [['←', '→'], this.page === 0 ? 'FIELD GUIDE' : 'YOUR BUILD']], VIEW_H - 50);
  }
}

// ---------------------------------------------------------------- level up
export class LevelUpScene {
  constructor(game, play) {
    this.game = game;
    this.play = play;
    this.overlay = true;
    this.t = 0;
    this.lock = 0.45; // ignore keys briefly so held gameplay keys can't pick a card by accident
    this.index = 0;
    this.cards = rollUpgrades(play.world, 3);
    this.chosen = -1;
  }
  enter() {
    audio.play('levelup');
    this.announce(true);
  }
  announce(full) {
    const c = this.cards[this.index];
    const prefix = full
      ? `Level up! Level ${this.play.run.level}. Choose an upgrade: press 1, 2 or 3, or use left and right then Enter. ${this.play.run.rerolls} rerolls left, press ${this.game.input.keyOf('interact')} to reroll. `
      : '';
    this.game.announce(`${prefix}Card ${this.index + 1}: ${c.name}. ${RARITY[c.rarity].label}. ${c.desc}`);
  }
  update(dt) {
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    if (this.chosen >= 0) {
      this.outT = (this.outT ?? 0) + dt;
      if (this.outT > (settings.reducedMotion ? 0.05 : 0.28)) this.game.pop();
    }
  }
  pick(i) {
    if (this.chosen >= 0 || !this.cards[i]) return;
    this.chosen = i;
    applyUpgrade(this.play.world, this.cards[i]);
    audio.play('choose');
    this.game.announce(`${this.cards[i].name} chosen.`);
  }
  onKey(ev) {
    if (this.lock > 0 || ev.repeat || this.chosen >= 0) return;
    if (ev.digit >= 1 && ev.digit <= this.cards.length) return this.pick(ev.digit - 1);
    if (ev.nav === 'left' || ev.nav === 'right') {
      this.index = (this.index + (ev.nav === 'left' ? -1 : 1) + this.cards.length) % this.cards.length;
      audio.play('move');
      this.announce(false);
    } else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
      this.pick(this.index);
    } else if (ev.actions.has('interact')) {
      const run = this.play.run;
      if (run.rerolls <= 0) {
        audio.play('deny');
        this.game.announce('No rerolls left.');
        return;
      }
      run.rerolls--;
      this.cards = rollUpgrades(this.play.world, 3);
      this.index = 0;
      this.t = 0.1;
      audio.play('swap');
      this.announce(false);
    }
  }
  render(ctx) {
    dimBackground(ctx, 0.66);
    const run = this.play.run;
    const inK = settings.reducedMotion ? 1 : clamp(this.t / 0.3, 0, 1);
    title(ctx, `LEVEL ${run.level}`, 92, { size: 38, color: PALETTE.accent });
    text(ctx, 'CHOOSE AN UPGRADE', VIEW_W / 2, 124, { size: 14, color: PALETTE.dim, align: 'center', weight: 700 });
    const cw = 236;
    const gap = 24;
    const x0 = VIEW_W / 2 - (this.cards.length * cw + (this.cards.length - 1) * gap) / 2;
    this.cards.forEach((c, i) => {
      const r = RARITY[c.rarity];
      const sel = i === this.index;
      const k = settings.reducedMotion ? 1 : easeOutBack(clamp((this.t - i * 0.06) / 0.3, 0, 1));
      let y = 160 + (1 - k) * 80 - (sel ? 10 : 0);
      const x = x0 + i * (cw + gap);
      let alpha = Math.min(1, k * 1.5);
      if (this.chosen >= 0) {
        if (i === this.chosen) y -= (this.outT ?? 0) * 60;
        else alpha *= 0.3;
      }
      ctx.globalAlpha = alpha;
      const color = c.weapon ? WEAPONS[c.weapon].color : r.color;
      panel(ctx, x, y, cw, 270, { color, border: sel ? 1 : 0.35, fill: sel ? 'rgba(14,18,40,0.97)' : 'rgba(8,10,22,0.92)' });
      if (sel) {
        ctx.strokeStyle = rgba(color, 0.35 + Math.sin(this.t * 6) * 0.15);
        ctx.lineWidth = 6;
        roundRect(ctx, x - 4, y - 4, cw + 8, 278, 15);
        ctx.stroke();
      }
      keycap(ctx, String(i + 1), x + cw / 2 - 16, y + 16, { size: 16, h: 32, minW: 32, active: sel, accent: color });
      text(ctx, r.label, x + cw / 2, y + 74, { size: 11, color, align: 'center', weight: 700 });
      const lines = wrapLines(ctx, c.name, cw - 30, 20, 700);
      lines.forEach((l, j) => text(ctx, l, x + cw / 2, y + 104 + j * 24, { size: 20, color: '#fff', align: 'center', weight: 700 }));
      paragraph(ctx, c.desc, x + cw / 2, y + 116 + lines.length * 24, cw - 34, { size: 14, color: PALETTE.ink, align: 'center' });
      const owned = c.weapon ? null : run.upgrades[c.id];
      if (owned) text(ctx, `OWNED x${owned}`, x + cw / 2, y + 252, { size: 11, color: PALETTE.dim, align: 'center', weight: 700 });
      ctx.globalAlpha = 1;
    });
    ctx.globalAlpha = inK;
    const input = this.game.input;
    hintBar(ctx, [[['1', '2', '3'], 'PICK'], [['←', '→'], 'BROWSE'], [['ENTER'], 'CONFIRM'], [[input.keyOf('interact')], `REROLL (${run.rerolls})`]], VIEW_H - 76);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- game over / victory
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('');

export class EndScene {
  constructor(game, play, victory) {
    this.game = game;
    this.play = play;
    this.victory = victory;
    this.overlay = true;
    this.t = 0;
    const run = play.run;
    this.qualifies = qualifies(run.score);
    this.phase = this.qualifies ? 'initials' : 'menu';
    const init = (settings.lastInitials ?? 'AAA').split('');
    this.letters = init.map((ch) => Math.max(0, LETTERS.indexOf(ch)));
    this.cursor = 0;
    this.rank = -1;
    this.menu = new Menu(game, [
      { label: 'PLAY AGAIN', hint: `Or press ${game.input.keyOf('restart')} at any time`, activate: () => play.restart() },
      { label: 'CHANGE CHARACTER', activate: () => game.transition(() => game.setScene(new CharSelectScene(game))) },
      { label: 'MAIN MENU', activate: () => game.transition(() => game.setScene(new MainMenuScene(game))) },
    ], { y: 408, width: 300, spacing: 36 });
    if (victory) {
      audio.setTrack('victory');
      audio.play('victory');
    } else {
      audio.setTrack(null);
    }
  }
  enter() {
    const run = this.play.run;
    const head = this.victory ? 'Victory! The keyboard is saved.' : `Game over at arena ${this.play.world.info.label}.`;
    const tail = this.qualifies
      ? 'New high score! Enter your initials: up and down change the letter, left and right move, Enter saves.'
      : `Press ${this.game.input.keyOf('restart')} to restart, or choose an option with up, down and Enter.`;
    this.game.announce(`${head} Score ${run.score}. ${tail}`);
  }
  update(dt) {
    this.t += dt;
    this.play.world.effects.update(dt);
    this.menu.update(dt);
  }
  onKey(ev) {
    if (this.t < 0.6 || ev.repeat && this.phase === 'menu') return;
    if (this.phase === 'initials') {
      if (ev.code === 'ArrowUp' || ev.code === 'KeyW') this.letters[this.cursor] = (this.letters[this.cursor] + 1) % LETTERS.length;
      else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') this.letters[this.cursor] = (this.letters[this.cursor] - 1 + LETTERS.length) % LETTERS.length;
      else if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.cursor = (this.cursor + 2) % 3;
      else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') this.cursor = (this.cursor + 1) % 3;
      else if ((ev.code === 'Enter' || ev.code === 'NumpadEnter') && !ev.repeat) return this.saveScore();
      else return;
      audio.play('move');
      this.game.announce(`${this.name()}. Letter ${this.cursor + 1}: ${LETTERS[this.letters[this.cursor]]}`);
      return;
    }
    if (ev.actions.has('restart')) {
      audio.play('select');
      this.play.restart();
      return;
    }
    this.menu.onKey(ev);
  }
  name() {
    return this.letters.map((i) => LETTERS[i]).join('');
  }
  saveScore() {
    const run = this.play.run;
    const name = this.name();
    settings.lastInitials = name;
    saveSettings();
    this.rank = addHighScore({
      name, score: run.score, character: run.character.name, arena: this.play.world.info.label,
      victory: this.victory, difficulty: run.difficulty.name, date: new Date().toISOString().slice(0, 10),
    });
    this.phase = 'menu';
    audio.play('choose');
    this.game.announce(`Saved as ${name}, rank ${this.rank + 1}. Press ${this.game.input.keyOf('restart')} to play again, or use the menu.`);
  }
  render(ctx) {
    dimBackground(ctx, Math.min(0.9, this.t * 2));
    const run = this.play.run;
    const cx = VIEW_W / 2;
    const k = settings.reducedMotion ? 1 : easeOutBack(clamp(this.t / 0.5, 0, 1));
    if (this.victory) {
      title(ctx, 'ALL KEYS RESTORED', 80, { size: Math.round(42 * k), color: PALETTE.gold, accent: PALETTE.gold });
      text(ctx, 'KERNEL PANIC has been rebooted. The keyboard is yours.', cx, 112, { size: 14, color: PALETTE.ink, align: 'center', weight: 600 });
    } else {
      title(ctx, 'SYSTEM FAILURE', 80, { size: Math.round(42 * k), color: PALETTE.hot, accent: PALETTE.hot });
      text(ctx, `Your run ended in ${this.play.world.info.label} ${this.play.world.info.name}.`, cx, 112, { size: 14, color: PALETTE.ink, align: 'center', weight: 600 });
    }
    text(ctx, String(run.score).padStart(7, '0'), cx, 170, { size: 46, color: '#fff', align: 'center', weight: 700, mono: true });
    if (run.victoryBonus) text(ctx, `includes +${run.victoryBonus} victory bonus`, cx, 192, { size: 12, color: PALETTE.gold, align: 'center', weight: 700 });
    const stats = [
      ['ARENA', this.play.world.info.label], ['LEVEL', run.level], ['KILLS', run.kills], ['BEST COMBO', run.maxCombo],
      ['DODGES', run.dodges], ['TIME', fmtTime(run.time)],
    ];
    const sw = 120;
    stats.forEach(([key, v], i) => {
      const x = cx + (i - (stats.length - 1) / 2) * sw;
      text(ctx, key, x, 226, { size: 11, color: PALETTE.dim, align: 'center', weight: 700 });
      text(ctx, String(v), x, 250, { size: 18, color: PALETTE.ink, align: 'center', weight: 700, mono: true });
    });
    let unlockY = 282;
    if (run.newUnlock) {
      text(ctx, 'NIGHTMARE DIFFICULTY UNLOCKED', cx, unlockY, { size: 14, color: PALETTE.hot, align: 'center', weight: 700 });
      unlockY += 20;
    }
    if (this.phase === 'initials') {
      text(ctx, 'NEW HIGH SCORE — ENTER YOUR INITIALS', cx, 300, { size: 14, color: PALETTE.gold, align: 'center', weight: 700 });
      this.letters.forEach((li, i) => {
        const x = cx + (i - 1) * 64;
        const sel = i === this.cursor;
        ctx.fillStyle = sel ? rgba(PALETTE.gold, 0.2) : 'rgba(255,255,255,0.05)';
        roundRect(ctx, x - 26, 318, 52, 64, 8);
        ctx.fill();
        if (sel) {
          ctx.strokeStyle = PALETTE.gold;
          ctx.lineWidth = 2;
          ctx.stroke();
          text(ctx, '▲', x, 314, { size: 12, color: PALETTE.gold, align: 'center' });
          text(ctx, '▼', x, 398, { size: 12, color: PALETTE.gold, align: 'center' });
        }
        text(ctx, LETTERS[li], x, 364, { size: 36, color: sel ? '#fff' : PALETTE.dim, align: 'center', weight: 700, mono: true });
      });
      hintBar(ctx, [[['↑', '↓'], 'LETTER'], [['←', '→'], 'MOVE'], [['ENTER'], 'SAVE']], VIEW_H - 60);
    } else {
      if (this.rank >= 0) text(ctx, `SAVED AS ${this.name()} — RANK #${this.rank + 1}`, cx, 330, { size: 15, color: PALETTE.gold, align: 'center', weight: 700 });
      else if (meta.highscores.length) text(ctx, `BEST: ${meta.highscores[0].score}`, cx, 330, { size: 13, color: PALETTE.dim, align: 'center', weight: 700 });
      this.menu.render(ctx);
      hintBar(ctx, [[[this.game.input.keyOf('restart')], 'RESTART'], [['↑', '↓'], 'NAVIGATE'], [['ENTER'], 'SELECT']], VIEW_H - 30);
    }
  }
}

export { measure, damp };
