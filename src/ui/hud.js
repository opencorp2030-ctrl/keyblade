// In-game HUD. Every element shows the key that controls it.

import { PALETTE, VIEW_W, VIEW_H } from '../config.js';
import { TAU, clamp, easeOutBack } from '../math.js';
import { settings } from '../settings.js';
import { WEAPONS, WEAPON_ORDER, weaponCooldown } from '../weapons.js';
import { SPECIALS } from '../abilities.js';
import { comboTier } from '../combat.js';
import { bestScore } from '../progression.js';
import { drawHeart } from '../render.js';
import { text, keycap, bar, roundRect, rgba, panel, measure } from './draw.js';

/** Fade HUD blocks when the player walks underneath them. */
function fadeFor(p, x, y, w, h) {
  return p.x > x - 20 && p.x < x + w + 20 && p.y > y - 20 && p.y < y + h + 20 ? 0.3 : 1;
}

export function renderHUD(ctx, w, game) {
  const p = w.player;
  const run = w.run;
  const input = game.input;
  const t = w.time;

  // ---- top-left: health, dash, special
  let a = fadeFor(p, 8, 6, 250, 72);
  ctx.globalAlpha = a;
  panel(ctx, 8, 6, 250, 72, { fill: 'rgba(5,6,13,0.72)', border: 0.2 });
  for (let i = 0; i < p.maxHp; i++) {
    const full = i < p.hp;
    const hx = 26 + i * 22;
    const beat = full && p.hp === 1 ? 1 + Math.sin(t * 10) * 0.12 : 1;
    drawHeart(ctx, hx, 22, 7.5 * beat, full ? PALETTE.hot : '#2a1a26');
  }
  // Dash pips
  const dashKey = input.keyOf('dash');
  const kw = keycap(ctx, dashKey, 16, 36, { size: 10, h: 18, minW: 20 });
  for (let i = 0; i < p.dash.max; i++) {
    const x = 16 + kw + 8 + i * 22;
    const ready = i < p.dash.charges;
    ctx.fillStyle = ready ? p.color : 'rgba(255,255,255,0.1)';
    roundRect(ctx, x, 38, 18, 12, 3);
    ctx.fill();
    if (!ready && i === p.dash.charges) {
      const frac = 1 - p.dash.cd / p.stats.dashCd;
      ctx.fillStyle = rgba(p.color, 0.5);
      roundRect(ctx, x, 38, 18 * clamp(frac, 0, 1), 12, 3);
      ctx.fill();
    }
  }
  // Special meter
  const sp = SPECIALS[p.special];
  const ready = p.meter >= 100 && !p.specialActive;
  keycap(ctx, input.keyOf('special'), 16, 56, { size: 10, h: 18, minW: 20, active: ready, accent: sp.color });
  const frac = p.specialActive ? p.specialActive.t / p.specialActive.max : p.meter / 100;
  bar(ctx, 46, 60, 130, 8, frac, ready ? (Math.sin(t * 8) > 0 ? '#ffffff' : sp.color) : rgba(sp.color, 0.8));
  text(ctx, ready ? `${sp.name} READY` : sp.name, 184, 68, { size: 10, color: ready ? sp.color : PALETTE.dim, weight: 700, shadow: false });
  ctx.globalAlpha = 1;

  // ---- top-centre: arena + wave or boss bar
  const boss = w.boss && !w.boss.dead ? w.boss : null;
  if (boss) {
    const bw = 380;
    const bx = VIEW_W / 2 - bw / 2;
    a = fadeFor(p, bx, 6, bw, 40);
    ctx.globalAlpha = a;
    text(ctx, boss.type.name, VIEW_W / 2, 20, { size: 13, color: boss.type.color, align: 'center', weight: 700 });
    bar(ctx, bx, 26, bw, 10, boss.hp / boss.maxHp, boss.flash > 0 ? '#ffffff' : boss.type.color, 'rgba(255,255,255,0.1)');
    for (const th of boss.type.id === 'kernel' ? [0.6, 0.25] : [0.5]) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx + bw * th - 1, 26, 2, 10);
    }
    ctx.globalAlpha = 1;
  } else {
    a = fadeFor(p, VIEW_W / 2 - 110, 6, 220, 40);
    ctx.globalAlpha = a;
    text(ctx, `${w.info.label}  ${w.info.name}`, VIEW_W / 2, 20, { size: 12, color: w.info.theme.accent, align: 'center', weight: 700 });
    const label = w.phase === 'exit' ? `EXIT OPEN — ${input.keyOf('interact')} TO ENTER` : w.director.label;
    text(ctx, label, VIEW_W / 2, 40, { size: 16, color: PALETTE.ink, align: 'center', weight: 700 });
    ctx.globalAlpha = 1;
  }

  // ---- top-right: score + combo
  a = fadeFor(p, VIEW_W - 220, 6, 212, 80);
  ctx.globalAlpha = a;
  text(ctx, String(run.score).padStart(7, '0'), VIEW_W - 16, 30, { size: 24, color: PALETTE.ink, align: 'right', weight: 700, mono: true });
  const hi = Math.max(bestScore(), run.score);
  text(ctx, `HI ${String(hi).padStart(7, '0')}`, VIEW_W - 16, 46, { size: 11, color: PALETTE.dim, align: 'right', weight: 700, mono: true });
  if (run.combo > 1) {
    const tier = comboTier(run.combo);
    const pulse = 1 + Math.max(0, run.comboTimer - p.stats.comboWindow + 0.2) * 1.5;
    const size = Math.round(18 * pulse);
    text(ctx, `${run.combo} COMBO`, VIEW_W - 16, 70, { size, color: tier[1] > 1 ? PALETTE.gold : PALETTE.ink, align: 'right', weight: 700 });
    if (tier[1] > 1) text(ctx, `x${tier[1]}`, VIEW_W - 16 - measure(ctx, `${run.combo} COMBO`, size, 700) - 8, 70, { size: 14, color: PALETTE.hot, align: 'right', weight: 700 });
    bar(ctx, VIEW_W - 130, 76, 114, 3, run.comboTimer / p.stats.comboWindow, PALETTE.gold);
  }
  ctx.globalAlpha = 1;

  // ---- bottom-left: weapons 1-4
  const wy = VIEW_H - 52;
  a = fadeFor(p, 8, wy - 6, 300, 52);
  ctx.globalAlpha = a;
  WEAPON_ORDER.forEach((id, i) => {
    const def = WEAPONS[id];
    const lvl = run.weapons[id];
    const x = 12 + i * 72;
    const sel = p.weapon === id;
    const locked = lvl === 0;
    ctx.fillStyle = sel ? rgba(def.color, 0.22) : 'rgba(5,6,13,0.72)';
    roundRect(ctx, x, wy - (sel ? 4 : 0), 66, 44, 7);
    ctx.fill();
    ctx.strokeStyle = sel ? def.color : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.stroke();
    keycap(ctx, input.label(input.bindings[`w${i + 1}`][0]), x + 4, wy + 4 - (sel ? 4 : 0), { size: 10, h: 18, minW: 18, active: sel, accent: def.color });
    if (locked) {
      text(ctx, 'LOCKED', x + 33, wy + 36, { size: 9, color: PALETTE.faint, align: 'center', weight: 700 });
    } else {
      text(ctx, def.name, x + 33, wy + 36 - (sel ? 4 : 0), { size: 11, color: sel ? '#fff' : PALETTE.dim, align: 'center', weight: 700 });
      for (let l = 0; l < lvl; l++) {
        ctx.fillStyle = def.color;
        ctx.fillRect(x + 28 + l * 7, wy + 12 - (sel ? 4 : 0), 5, 5);
      }
      const cd = p.cooldowns[id] / weaponCooldown(p, id);
      if (cd > 0.02) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, x, wy - (sel ? 4 : 0), 66 * clamp(cd, 0, 1), 44, 7);
        ctx.fill();
      }
    }
  });
  ctx.globalAlpha = 1;

  // ---- bottom: XP bar and level
  const xpFrac = run.xp / run.xpNext;
  bar(ctx, 310, VIEW_H - 14, VIEW_W - 460, 6, xpFrac, PALETTE.accent);
  text(ctx, `LV ${run.level}`, 310, VIEW_H - 20, { size: 11, color: PALETTE.accent, weight: 700 });

  // ---- bottom-right: shortcut reminders
  a = fadeFor(p, VIEW_W - 150, VIEW_H - 40, 140, 34);
  ctx.globalAlpha = a * 0.9;
  let x = VIEW_W - 144;
  x += keycap(ctx, input.keyOf('info'), x, VIEW_H - 34, { size: 10, h: 18, minW: 18 }) + 4;
  text(ctx, 'INFO', x, VIEW_H - 21, { size: 10, color: PALETTE.dim, weight: 700, shadow: false });
  x += 36;
  x += keycap(ctx, 'ESC', x, VIEW_H - 34, { size: 10, h: 18, minW: 18 }) + 4;
  text(ctx, 'PAUSE', x, VIEW_H - 21, { size: 10, color: PALETTE.dim, weight: 700, shadow: false });
  ctx.globalAlpha = 1;

  // ---- interaction prompt
  if (w.prompt) {
    const it = w.prompt;
    const label = it.label;
    const tw = measure(ctx, label, 12, 700) + 40;
    const px = it.x - tw / 2;
    const py = it.y - 58;
    panel(ctx, px, py, tw, 28, { fill: 'rgba(5,6,13,0.9)', color: PALETTE.gold, border: 0.7, radius: 8 });
    keycap(ctx, input.keyOf('interact'), px + 5, py + 3, { size: 11, h: 21, minW: 20, active: Math.sin(t * 6) > 0, accent: PALETTE.gold });
    text(ctx, label, px + 32, py + 18, { size: 12, color: '#fff', weight: 700, shadow: false });
  }

  // ---- off-screen style arrow to the exit when it's far away
  const exit = w.interactables.find((i) => i.kind === 'exit' && !i.used);
  if (exit && Math.hypot(exit.x - p.x, exit.y - p.y) > 120 && p.alive) {
    const ang = Math.atan2(exit.y - p.y, exit.x - p.x);
    const ax = p.x + Math.cos(ang) * 34;
    const ay = p.y + Math.sin(ang) * 34;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = rgba(PALETTE.accent, 0.6 + Math.sin(t * 6) * 0.3);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- banner (centre)
  const b = w.bannerData;
  if (b) {
    const k = b.t / b.dur;
    const inK = settings.reducedMotion ? 1 : easeOutBack(clamp(b.t / 0.35, 0, 1));
    const alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(3,4,10,0.55)';
    ctx.fillRect(0, VIEW_H / 2 - 110, VIEW_W, 74);
    ctx.fillStyle = b.color;
    ctx.fillRect(VIEW_W / 2 - 200 * inK, VIEW_H / 2 - 110, 400 * inK, 2);
    ctx.fillRect(VIEW_W / 2 - 200 * inK, VIEW_H / 2 - 38, 400 * inK, 2);
    text(ctx, b.title, VIEW_W / 2, VIEW_H / 2 - 70, { size: Math.round(30 * (0.7 + inK * 0.3)), color: b.color, align: 'center', weight: 700 });
    if (b.sub) text(ctx, b.sub, VIEW_W / 2, VIEW_H / 2 - 47, { size: 14, color: PALETTE.ink, align: 'center', weight: 600 });
    ctx.globalAlpha = 1;
  }

  // ---- callout (combo tiers, specials, unlocks)
  const c = w.calloutData;
  if (c) {
    const k = c.t / c.dur;
    const s = settings.reducedMotion ? 1 : 1 + Math.max(0, 0.2 - c.t) * 2;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    text(ctx, c.text, VIEW_W / 2, VIEW_H / 2 + 90, { size: Math.round(24 * s), color: c.color, align: 'center', weight: 700 });
    ctx.globalAlpha = 1;
  }

  if (settings.showFps) text(ctx, `${game.fps} FPS`, VIEW_W - 16, VIEW_H - 44, { size: 10, color: PALETTE.dim, align: 'right', mono: true });
}

export { TAU };
