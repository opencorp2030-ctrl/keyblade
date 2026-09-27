// UI drawing primitives: text, keycaps, panels, hint bars.

import { FONT_DISPLAY, FONT_MONO, PALETTE, VIEW_W, VIEW_H } from '../config.js';
import { roundRect, rgba, glow } from '../render.js';

export { roundRect, rgba, glow };

export function text(ctx, str, x, y, o = {}) {
  const { size = 16, color = PALETTE.ink, align = 'left', baseline = 'alphabetic', weight = 600, mono = false, alpha = 1, shadow = true, maxWidth } = o;
  ctx.font = `${weight} ${size}px ${mono ? FONT_MONO : FONT_DISPLAY}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(str, x + 1, y + 2, maxWidth);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y, maxWidth);
  ctx.globalAlpha = 1;
}

export function measure(ctx, str, size = 16, weight = 600, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? FONT_MONO : FONT_DISPLAY}`;
  return ctx.measureText(str).width;
}

/** Draw a keyboard key. Returns its width so callers can lay out rows of keys. */
export function keycap(ctx, label, x, y, o = {}) {
  const { size = 13, color = PALETTE.ink, active = false, pressed = false, minW = 26, h = 26, alpha = 1, accent = PALETTE.accent } = o;
  ctx.font = `700 ${size}px ${FONT_MONO}`;
  const w = Math.max(minW, ctx.measureText(label).width + 14);
  const dy = pressed ? 2 : 0;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = active ? rgba(accent, 0.55) : 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y + 3, w, h, 5);
  ctx.fill();
  ctx.fillStyle = active ? accent : '#1b2140';
  roundRect(ctx, x, y + dy, w, h - 1, 5);
  ctx.fill();
  ctx.fillStyle = active ? '#ffffff' : '#262e57';
  roundRect(ctx, x + 3, y + dy + 1.5, w - 6, h - 8, 4);
  ctx.fill();
  ctx.fillStyle = active ? '#05060d' : color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + dy + (h - 6) / 2 + 1);
  ctx.globalAlpha = 1;
  return w;
}

export function keycapWidth(ctx, label, size = 13, minW = 26) {
  ctx.font = `700 ${size}px ${FONT_MONO}`;
  return Math.max(minW, ctx.measureText(label).width + 14);
}

export function panel(ctx, x, y, w, h, o = {}) {
  const { color = PALETTE.accent, fill = PALETTE.panel, radius = 12, border = 0.35 } = o;
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = rgba(color, border);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Bottom hint bar: [[keys], label] pairs, e.g. [['↑','↓'], 'NAVIGATE']. */
export function hintBar(ctx, hints, y = VIEW_H - 34, o = {}) {
  const gap = 22;
  const parts = hints.map(([keys, label]) => {
    const kw = keys.reduce((s, k) => s + keycapWidth(ctx, k, 11, 22) + 4, 0);
    return { keys, label, w: kw + 4 + measure(ctx, label, 12, 700) };
  });
  const total = parts.reduce((s, p) => s + p.w, 0) + gap * (parts.length - 1);
  let x = (o.x ?? VIEW_W / 2) - total / 2;
  for (const p of parts) {
    for (const k of p.keys) x += keycap(ctx, k, x, y, { size: 11, h: 22, minW: 22, alpha: 0.95 }) + 4;
    text(ctx, p.label, x + 2, y + 15, { size: 12, color: PALETTE.dim, weight: 700, shadow: false });
    x += p.w - p.keys.reduce((s, k) => s + keycapWidth(ctx, k, 11, 22) + 4, 0) + gap;
  }
}

export function wrapLines(ctx, str, maxWidth, size = 14, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT_DISPLAY}`;
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function paragraph(ctx, str, x, y, maxWidth, o = {}) {
  const { size = 14, lineHeight = size * 1.45, color = PALETTE.ink, weight = 500, align = 'left' } = o;
  const lines = wrapLines(ctx, str, maxWidth, size, weight);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineHeight, { size, color, weight, align, shadow: false }));
  return lines.length * lineHeight;
}

export function dimBackground(ctx, a = 0.72) {
  ctx.fillStyle = `rgba(3,4,10,${a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.08)') {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
}

export function title(ctx, str, y, o = {}) {
  const { size = 34, color = PALETTE.ink, accent = PALETTE.accent } = o;
  text(ctx, str, VIEW_W / 2, y, { size, color, align: 'center', weight: 700 });
  const w = measure(ctx, str, size, 700);
  ctx.fillStyle = accent;
  ctx.fillRect(VIEW_W / 2 - w / 2, y + 8, w, 2);
}
