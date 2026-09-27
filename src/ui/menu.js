// Keyboard menu widget. ↑/↓ (or W/S) moves focus, ←/→ adjusts values, ENTER activates, ESC goes back.
// Focus is always visible (animated highlight + brackets) and announced to screen readers.

import { PALETTE, VIEW_W } from '../config.js';
import { damp } from '../math.js';
import { audio } from '../audio.js';
import { text, roundRect, rgba, measure } from './draw.js';

export class Menu {
  /**
   * items: { label, value?(): string, adjust?(dir), activate?(), disabled?(): bool, hint?: string }
   */
  constructor(game, items, o = {}) {
    this.game = game;
    this.items = items;
    this.x = o.x ?? VIEW_W / 2;
    this.y = o.y ?? 200;
    this.width = o.width ?? 360;
    this.spacing = o.spacing ?? 42;
    this.onBack = o.onBack ?? null;
    this.allowSpace = o.allowSpace ?? true;
    this.index = 0;
    this.focusY = this.y;
    this.t = 0;
    this.pulse = 0;
    this.skipDisabled(1);
  }

  get current() {
    return this.items[this.index];
  }

  isDisabled(item) {
    return item.disabled?.() ?? false;
  }

  skipDisabled(dir) {
    for (let n = 0; n < this.items.length && this.isDisabled(this.items[this.index]); n++) {
      this.index = (this.index + dir + this.items.length) % this.items.length;
    }
  }

  focus(i, silent = false) {
    this.index = i;
    this.skipDisabled(1);
    if (!silent) this.announce();
  }

  announce() {
    const it = this.current;
    const label = typeof it.label === 'function' ? it.label() : it.label;
    const v = it.value ? `, ${it.value()}` : '';
    const how = it.adjust ? '. Left or right to change' : '';
    this.game.announce(`${label}${v}${how}. ${this.index + 1} of ${this.items.length}. ${it.hint ?? ''}`);
  }

  onKey(ev) {
    if (!this.allowSpace && ev.code === 'Space') return false;
    const nav = ev.nav;
    if (nav === 'up' || nav === 'down') {
      const dir = nav === 'up' ? -1 : 1;
      this.index = (this.index + dir + this.items.length) % this.items.length;
      this.skipDisabled(dir);
      audio.play('move');
      this.announce();
      return true;
    }
    if ((nav === 'left' || nav === 'right') && this.current.adjust) {
      if (ev.repeat && !this.current.repeatable) return true;
      this.current.adjust(nav === 'left' ? -1 : 1);
      this.pulse = 1;
      audio.play('move');
      this.announce();
      return true;
    }
    if (nav === 'confirm' && !ev.repeat) {
      const it = this.current;
      this.pulse = 1;
      if (it.activate) {
        audio.play('select');
        it.activate();
      } else if (it.adjust) {
        it.adjust(1);
        audio.play('move');
        this.announce();
      }
      return true;
    }
    if (nav === 'back' && !ev.repeat && this.onBack) {
      audio.play('back');
      this.onBack();
      return true;
    }
    return false;
  }

  update(dt) {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.focusY += (this.y + this.index * this.spacing - this.focusY) * damp(22, dt);
  }

  render(ctx) {
    const w = this.width;
    const left = this.x - w / 2;
    // focus highlight
    const fy = this.focusY - 17;
    const grow = this.pulse * 6;
    ctx.fillStyle = rgba(PALETTE.accent, 0.14);
    roundRect(ctx, left - grow, fy - grow / 2, w + grow * 2, 34 + grow, 8);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.accent, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    const bob = Math.sin(this.t * 6) * 3;
    text(ctx, '▶', left - 20 + bob, this.focusY + 5, { size: 14, color: PALETTE.accent, align: 'center', shadow: false });
    text(ctx, '◀', left + w + 20 - bob, this.focusY + 5, { size: 14, color: PALETTE.accent, align: 'center', shadow: false });

    this.items.forEach((it, i) => {
      const y = this.y + i * this.spacing;
      const focused = i === this.index;
      const dis = this.isDisabled(it);
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const color = dis ? PALETTE.faint : focused ? '#ffffff' : PALETTE.dim;
      if (it.value) {
        text(ctx, label, left + 16, y + 6, { size: 16, color, weight: 700 });
        const v = it.value();
        const vx = left + w - 16;
        text(ctx, v, vx - (it.adjust ? 18 : 0), y + 6, { size: 15, color: focused ? PALETTE.accent : PALETTE.dim, align: 'right', weight: 700, mono: true });
        if (it.adjust && focused) {
          const vw = measure(ctx, v, 15, 700, true);
          text(ctx, '‹', vx - vw - 30, y + 6, { size: 18, color: PALETTE.accent, align: 'center' });
          text(ctx, '›', vx - 6, y + 6, { size: 18, color: PALETTE.accent, align: 'center' });
        }
      } else {
        text(ctx, label, this.x, y + 6, { size: 18, color, align: 'center', weight: 700 });
      }
    });
    const hint = this.current?.hint;
    if (hint) text(ctx, hint, this.x, this.y + this.items.length * this.spacing + 8, { size: 13, color: PALETTE.dim, align: 'center', weight: 500 });
  }
}
