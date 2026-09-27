// World rendering: arena, entities, projectiles and effects. (HUD lives in ui/hud.js.)

import { TILE, VIEW_W, VIEW_H, FONT_DISPLAY, FONT_MONO, PALETTE } from './config.js';
import { TAU } from './math.js';
import { settings } from './settings.js';
import { PICKUP_STYLE } from './pickups.js';
import { SPECIALS } from './abilities.js';
import { ENEMY_TYPES } from './enemies.js';

// ---------------------------------------------------------------- helpers
export function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba(color, 0.9));
  grad.addColorStop(0.35, rgba(color, 0.35));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

export function glow(ctx, x, y, r, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- arena background (cached)
function buildBackground(w, scale) {
  const c = document.createElement('canvas');
  c.width = VIEW_W * scale;
  c.height = VIEW_H * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const th = w.info.theme;
  const { grid } = w;
  g.fillStyle = th.floor;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let r = 0; r < grid.rows; r++) {
    for (let col = 0; col < grid.cols; col++) {
      const i = r * grid.cols + col;
      const x = col * TILE;
      const y = r * TILE;
      if (grid.tiles[i] === 0) {
        if ((r + col) % 2 === 0) {
          g.fillStyle = th.floor2;
          g.fillRect(x, y, TILE, TILE);
        }
        g.fillStyle = rgba(th.accent, 0.05);
        g.fillRect(x + TILE / 2 - 1, y + TILE / 2 - 1, 2, 2);
      }
    }
  }
  // Keycap walls
  for (let r = 0; r < grid.rows; r++) {
    for (let col = 0; col < grid.cols; col++) {
      const i = r * grid.cols + col;
      if (grid.tiles[i] !== 1) continue;
      const x = col * TILE;
      const y = r * TILE;
      const border = r === 0 || col === 0 || r === grid.rows - 1 || col === grid.cols - 1;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(g, x + 1, y + 3, TILE - 2, TILE - 2, 5);
      g.fill();
      g.fillStyle = border ? shade(th.wall, -0.25) : th.wall;
      roundRect(g, x + 1, y + 1, TILE - 2, TILE - 2, 5);
      g.fill();
      g.fillStyle = border ? shade(th.wallTop, -0.25) : th.wallTop;
      roundRect(g, x + 4, y + 2, TILE - 8, TILE - 9, 4);
      g.fill();
      g.strokeStyle = rgba('#ffffff', border ? 0.04 : 0.08);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 7, y + 2.5);
      g.lineTo(x + TILE - 7, y + 2.5);
      g.stroke();
      const label = w.arena.labels[i];
      if (label && !border) {
        g.fillStyle = rgba(th.accent, 0.35);
        g.font = `600 9px ${FONT_MONO}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(label, x + 7, y + 5);
      }
    }
  }
  // Inner edge glow along walls
  g.strokeStyle = rgba(th.accent, 0.12);
  g.lineWidth = 1;
  for (let r = 1; r < grid.rows - 1; r++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      if (grid.tiles[r * grid.cols + col] !== 0) continue;
      const x = col * TILE;
      const y = r * TILE;
      g.beginPath();
      if (grid.tiles[(r - 1) * grid.cols + col] === 1) { g.moveTo(x, y + 0.5); g.lineTo(x + TILE, y + 0.5); }
      if (grid.tiles[(r + 1) * grid.cols + col] === 1) { g.moveTo(x, y + TILE - 0.5); g.lineTo(x + TILE, y + TILE - 0.5); }
      if (grid.tiles[r * grid.cols + col - 1] === 1) { g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + TILE); }
      if (grid.tiles[r * grid.cols + col + 1] === 1) { g.moveTo(x + TILE - 0.5, y); g.lineTo(x + TILE - 0.5, y + TILE); }
      g.stroke();
    }
  }
  const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.65);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  return c;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------- main entry
export function renderWorld(ctx, w, scale) {
  if (!w.bgCache || w.bgScale !== scale) {
    w.bgCache = buildBackground(w, scale);
    w.bgScale = scale;
  }
  const fx = w.effects;
  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);
  ctx.drawImage(w.bgCache, 0, 0, VIEW_W, VIEW_H);

  const time = w.time;
  drawInteractables(ctx, w, time);
  drawPickups(ctx, w, time);
  drawSpawns(ctx, w);
  drawHazardsUnder(ctx, w, time);
  for (const e of w.enemies) drawShadow(ctx, e.x, e.y + e.r * 0.7, e.r);
  for (const e of w.enemies) drawEnemy(ctx, w, e, time);
  drawPlayer(ctx, w, time);
  drawSlashes(ctx, w);
  drawProjectiles(ctx, w);
  drawBolts(ctx, w);
  drawHazardsOver(ctx, w, time);
  drawParticles(ctx, fx);
  drawTexts(ctx, fx);
  ctx.restore();

  if (w.enemyTimeScale < 0.95) {
    ctx.fillStyle = rgba('#7dff6a', (1 - w.enemyTimeScale) * 0.08);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (fx.flash > 0) {
    ctx.fillStyle = rgba(fx.flashColor, Math.min(0.6, fx.flash));
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  const p = w.player;
  if (p.alive && p.hp === 1) {
    const a = 0.12 + Math.sin(time * 5) * 0.06;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.6);
    g.addColorStop(0, 'rgba(255,0,60,0)');
    g.addColorStop(1, `rgba(255,0,60,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawShadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.9, r * 0.35, 0, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- pieces
function drawInteractables(ctx, w, t) {
  for (const it of w.interactables) {
    if (it.used && it.kind !== 'exit') continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (it.kind === 'exit') {
      glow(ctx, it.x, it.y, 60, PALETTE.accent, 0.6 + Math.sin(t * 4) * 0.15);
      ctx.restore();
      ctx.save();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(PALETTE.accent, 0.8 - i * 0.2);
        ctx.lineWidth = 3 - i;
        ctx.beginPath();
        ctx.ellipse(it.x, it.y, 22 + i * 6 + Math.sin(t * 3 + i) * 2, 22 + i * 6, t * (1 + i * 0.5), 0, TAU * 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 11px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', it.x, it.y + 4);
    } else if (it.kind === 'cache') {
      glow(ctx, it.x, it.y, 34, PALETTE.gold, 0.5);
      ctx.restore();
      ctx.save();
      const bob = Math.sin(t * 3) * 2;
      ctx.fillStyle = '#3a2d0a';
      roundRect(ctx, it.x - 13, it.y - 11 + bob, 26, 22, 5);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, it.x - 11, it.y - 11 + bob, 22, 17, 4);
      ctx.fill();
      ctx.fillStyle = '#3a2d0a';
      ctx.font = `700 12px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', it.x, it.y + 2 + bob);
    } else if (it.kind === 'shrine') {
      glow(ctx, it.x, it.y, 36, PALETTE.hot, 0.45 + Math.sin(t * 2) * 0.1);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = PALETTE.hot;
      ctx.lineWidth = 2;
      poly(ctx, it.x, it.y, 14, 3, -Math.PI / 2 + Math.sin(t) * 0.2);
      ctx.stroke();
      poly(ctx, it.x, it.y, 14, 3, Math.PI / 2 + Math.sin(t) * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPickups(ctx, w, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const it of w.pickups) {
    const st = PICKUP_STYLE[it.kind];
    glow(ctx, it.x, it.y, it.r * 3, st.color, it.life < 3 ? (Math.sin(t * 20) > 0 ? 0.7 : 0.2) : 0.7);
  }
  ctx.restore();
  for (const it of w.pickups) {
    const st = PICKUP_STYLE[it.kind];
    const bob = it.magnet ? 0 : Math.sin(t * 5 + it.x) * 1.5;
    ctx.fillStyle = st.color;
    if (it.kind === 'xp') {
      poly(ctx, it.x, it.y + bob, it.r, 4, t * 3 + it.y);
      ctx.fill();
    } else if (it.kind === 'heart') {
      drawHeart(ctx, it.x, it.y + bob, it.r * 1.1, st.color);
    } else if (it.kind === 'battery') {
      ctx.fillRect(it.x - 4, it.y - 6 + bob, 8, 12);
      ctx.fillStyle = '#3a2d0a';
      ctx.fillRect(it.x - 2, it.y - 3 + bob, 4, 6);
    } else {
      ctx.lineWidth = 3;
      ctx.strokeStyle = st.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y + bob, 5, Math.PI, 0);
      ctx.stroke();
    }
  }
}

export function drawHeart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.8);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.8);
  ctx.fill();
}

function drawSpawns(ctx, w) {
  for (const s of w.spawns) {
    const k = 1 - s.t / s.max;
    const col = ENEMY_TYPES[s.type].color;
    ctx.strokeStyle = rgba(col, 0.3 + k * 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 18 * (1 - k) + 6, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s.x, s.y, 16 + k * 10, col, k * 0.8);
    ctx.restore();
    ctx.fillStyle = rgba(col, 0.6);
    ctx.fillRect(s.x - 1, s.y - 8, 2, 16);
    ctx.fillRect(s.x - 8, s.y - 1, 16, 2);
  }
}

function drawHazardsUnder(ctx, w, t) {
  for (const h of w.hazards) {
    if (h.kind === 'marker') {
      const k = h.t / h.dur;
      ctx.strokeStyle = rgba(h.color, 0.4 + k * 0.5);
      ctx.fillStyle = rgba(h.color, 0.08 + k * 0.15);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * (1 - k), 0, TAU);
      ctx.stroke();
    } else if (h.kind === 'trail') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, h.x, h.y, h.r * 1.6, h.color, 0.5 * (1 - h.t / h.dur));
      ctx.restore();
    }
  }
}

function drawHazardsOver(ctx, w, t) {
  for (const h of w.hazards) {
    if (h.kind === 'shock') {
      const a = Math.max(0, 1 - h.r / h.maxR);
      ctx.strokeStyle = rgba(h.color, 0.35 * a);
      ctx.lineWidth = h.width + 8;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.9 * a);
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (h.kind === 'laser') {
      const live = h.t > h.warn;
      ctx.save();
      ctx.lineCap = 'round';
      if (!live) {
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = rgba(PALETTE.hot, 0.35 + 0.35 * Math.sin(h.t * 25));
        ctx.lineWidth = 2;
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(h.color, 0.35);
        ctx.lineWidth = h.width + 12;
        ctx.beginPath();
        ctx.moveTo(h.owner.x, h.owner.y);
        ctx.lineTo(h.ex, h.ey);
        ctx.stroke();
        ctx.strokeStyle = '#e6f0ff';
        ctx.lineWidth = h.width * 0.6;
      }
      ctx.beginPath();
      ctx.moveTo(h.owner.x, h.owner.y);
      ctx.lineTo(h.ex, h.ey);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawEnemy(ctx, w, e, t) {
  const tp = e.type;
  const col = e.flash > 0 ? '#ffffff' : tp.color;
  const lift = e.height ?? 0;
  const x = e.x;
  const y = e.y - lift;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, e.r * 2.4, tp.color, e.isBoss ? 0.5 : 0.35);
  ctx.restore();

  // Telegraphs
  if (e.state === 'wind' && (tp.behavior === 'dasher' || e.isBoss)) {
    const len = e.isBoss ? 320 : 220;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = rgba(PALETTE.hot, 0.5 + 0.4 * Math.sin(t * 30));
    ctx.lineWidth = e.isBoss ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.aim) * len, y + Math.sin(e.aim) * len);
    ctx.stroke();
    ctx.restore();
  }
  if (e.state === 'fuse') {
    const k = 1 - e.timer / 0.7;
    ctx.strokeStyle = rgba(PALETTE.hot, 0.3 + k * 0.6);
    ctx.fillStyle = rgba(PALETTE.hot, 0.05 + k * 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 78, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  const wob = settings.reducedMotion ? 0 : Math.sin(e.t * 9) * 0.08;
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  switch (tp.shape) {
    case 'blob': {
      ctx.beginPath();
      ctx.ellipse(x, y, e.r * (1 + wob), e.r * (1 - wob), 0, 0, TAU);
      ctx.fill();
      eyes(ctx, x, y, e, w);
      break;
    }
    case 'arrow': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.facing);
      const s = e.state === 'wind' ? 1 + Math.sin(t * 40) * 0.06 : 1;
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(e.r * 1.3, 0);
      ctx.lineTo(e.r * 0.2, -e.r);
      ctx.lineTo(-e.r, -e.r * 0.8);
      ctx.lineTo(-e.r, e.r * 0.8);
      ctx.lineTo(e.r * 0.2, e.r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a0d05';
      ctx.font = `700 ${Math.round(e.r)}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', -e.r * 0.2, 1);
      ctx.restore();
      break;
    }
    case 'tri': {
      poly(ctx, x, y, e.r * 1.2, 3, e.facing);
      ctx.fill();
      if (e.state === 'aim') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x + Math.cos(e.facing) * e.r, y + Math.sin(e.facing) * e.r, 14, '#ffffff', 0.9);
        ctx.restore();
      }
      break;
    }
    case 'ring': {
      const fuse = e.state === 'fuse' && Math.sin(t * 40) > 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = fuse ? '#ffffff' : col;
      ctx.beginPath();
      ctx.arc(x, y, e.r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - e.r, y + e.r);
      ctx.lineTo(x + e.r, y - e.r);
      ctx.stroke();
      break;
    }
    case 'square': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.facing);
      roundRect(ctx, -e.r, -e.r, e.r * 2, e.r * 2, 4);
      ctx.fill();
      if (e.shieldUp) {
        ctx.strokeStyle = e.flash > 0 ? '#ffffff' : '#bfe6ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 6, -1.1, 1.1);
        ctx.stroke();
      }
      ctx.fillStyle = '#06142a';
      ctx.font = `700 ${Math.round(e.r * 1.1)}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.rotate(-e.facing);
      ctx.fillText('⇧', 0, 1);
      ctx.restore();
      break;
    }
    case 'hex': {
      poly(ctx, x, y, e.r * 1.1, 6, e.t * 0.8);
      ctx.fill();
      ctx.strokeStyle = '#2a0520';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(e.t * 3) * e.r * 0.7, y + Math.sin(e.t * 3) * e.r * 0.7);
      ctx.stroke();
      if (e.state === 'cast') {
        ctx.strokeStyle = rgba(tp.color, 0.7);
        ctx.beginPath();
        ctx.arc(x, y, e.r + 8 + (1 - e.timer / 0.8) * 16, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'boss_caps':
      drawCapsBoss(ctx, e, x, y, col, t);
      break;
    case 'boss_macro':
      drawMacroBoss(ctx, e, x, y, col, t);
      break;
    case 'boss_kernel':
      drawKernelBoss(ctx, e, x, y, col, t);
      break;
  }

  if (e.elite) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, e.r + 5, t * 2, t * 2 + TAU * 0.7);
    ctx.stroke();
  }
  if (e.stun > 0 && !e.isBoss) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * TAU) / 3;
      ctx.fillRect(x + Math.cos(a) * e.r - 1.5, y - e.r - 6 + Math.sin(a) * 3 - 1.5, 3, 3);
    }
  }
  if (!e.isBoss && e.hp < e.maxHp) {
    const wdt = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - wdt / 2, y - e.r - 7, wdt, 3);
    ctx.fillStyle = tp.color;
    ctx.fillRect(x - wdt / 2, y - e.r - 7, wdt * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function eyes(ctx, x, y, e, w) {
  const p = w.player;
  const a = Math.atan2(p.y - y, p.x - x);
  const ox = Math.cos(a) * e.r * 0.25;
  const oy = Math.sin(a) * e.r * 0.25;
  ctx.fillStyle = '#12050a';
  const s = Math.max(1.5, e.r * 0.22);
  ctx.fillRect(x - e.r * 0.4 + ox - s / 2, y - e.r * 0.15 + oy - s / 2, s, s * 1.3);
  ctx.fillRect(x + e.r * 0.4 + ox - s / 2, y - e.r * 0.15 + oy - s / 2, s, s * 1.3);
}

function drawCapsBoss(ctx, b, x, y, col, t) {
  const r = b.r * (1 + (b.height ?? 0) / 300);
  if (b.height) drawShadow(ctx, b.x, b.y + b.r * 0.6, b.r * (1 - b.height / 200));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x - r, y - r + 6, r * 2, r * 2, 10);
  ctx.fill();
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#123a66';
  roundRect(ctx, x - r, y - r, r * 2, r * 2, 10);
  ctx.fill();
  ctx.fillStyle = col;
  roundRect(ctx, x - r + 5, y - r + 3, r * 2 - 10, r * 2 - 14, 8);
  ctx.fill();
  ctx.fillStyle = '#062038';
  ctx.font = `700 ${Math.round(r * 0.9)}px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⇪', x, y - 4);
  const on = b.phase >= 2 || Math.sin(t * 3) > 0;
  ctx.fillStyle = on ? '#6dff9a' : '#0a3a1a';
  ctx.beginPath();
  ctx.arc(x + r - 12, y - r + 11, 4, 0, TAU);
  ctx.fill();
  if (b.state === 'recover') {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 11px ${FONT_DISPLAY}`;
    ctx.fillText('VULNERABLE', x, y - r - 12);
  }
}

function drawMacroBoss(ctx, b, x, y, col, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#3a0a33';
  poly(ctx, 0, 0, b.r * 1.1, 8, t * 0.5);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  poly(ctx, 0, 0, b.r * 1.1, 8, t * 0.5);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 0.45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff2a4d';
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 0.2 * (1 + Math.sin(t * 6) * 0.2), 0, TAU);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = t * (b.phase >= 2 ? 2.4 : 1.4) + (i * TAU) / 6;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * b.r * 1.6, Math.sin(a) * b.r * 1.6, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawKernelBoss(ctx, b, x, y, col, t) {
  const wdt = b.r * 2.3;
  const h = b.r * 1.7;
  ctx.fillStyle = '#111';
  roundRect(ctx, x - wdt / 2 - 4, y - h / 2 - 4, wdt + 8, h + 8, 6);
  ctx.fill();
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : b.phase >= 3 ? '#b3122a' : '#1f4fd1';
  roundRect(ctx, x - wdt / 2, y - h / 2, wdt, h, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(b.r * 0.8)}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(':(', x - wdt / 2 + 8, y - 8);
  ctx.font = `600 7px ${FONT_MONO}`;
  ctx.fillText(`${Math.floor((1 - b.hp / b.maxHp) * 100)}% complete`, x - wdt / 2 + 8, y + h / 2 - 12);
  ctx.fillStyle = rgba('#ffffff', 0.08);
  for (let i = 0; i < h; i += 3) ctx.fillRect(x - wdt / 2, y - h / 2 + ((i + t * 30) % h), wdt, 1);
}

function drawPlayer(ctx, w, t) {
  const p = w.player;
  if (!p.alive) return;
  for (const g of p.ghosts) {
    ctx.fillStyle = rgba(p.color, (g.life / g.max) * 0.35);
    ctx.beginPath();
    ctx.arc(g.x, g.y, p.r, 0, TAU);
    ctx.fill();
  }
  drawShadow(ctx, p.x, p.y + p.r * 0.8, p.r);
  const blink = p.invuln > 0 && p.dash.t <= 0 && Math.sin(t * 40) > 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, p.x, p.y, 34, p.color, 0.55);
  ctx.restore();
  if (p.specialActive) {
    const sp = SPECIALS[p.specialActive.id];
    if (p.specialActive.id === 'whirlwind') {
      const R = 84 * p.stats.area;
      ctx.strokeStyle = rgba(sp.color, 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = t * 14 + (i * TAU) / 4;
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.8, a, a + 0.6);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = rgba(sp.color, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8 + Math.sin(t * 10) * 2, 0, TAU);
      ctx.stroke();
    }
  }
  if (blink) return;
  // Body: a tiny keycap
  const s = p.r * 1.25;
  const squash = p.dash.t > 0 ? 0.8 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.dash.t > 0) ctx.rotate(Math.atan2(p.dash.dy, p.dash.dx));
  ctx.scale(p.dash.t > 0 ? 1.25 : 1, squash);
  ctx.fillStyle = p.hurtT > 0 ? PALETTE.hot : '#0b1830';
  roundRect(ctx, -s, -s, s * 2, s * 2, 4);
  ctx.fill();
  ctx.fillStyle = p.hurtT > 0 ? '#ffffff' : p.color;
  roundRect(ctx, -s + 2, -s + 1, s * 2 - 4, s * 2 - 5, 3);
  ctx.fill();
  ctx.restore();
  // Blade: points where you aim
  const a = p.facing;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(a) * (p.r + 3), p.y + Math.sin(a) * (p.r + 3));
  ctx.lineTo(p.x + Math.cos(a) * (p.r + 12), p.y + Math.sin(a) * (p.r + 12));
  ctx.stroke();
}

function drawSlashes(ctx, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of w.slashes) {
    const k = s.life / s.max;
    const sweep = 1 - k;
    const a0 = s.angle - s.arc / 2;
    const a1 = a0 + s.arc * Math.min(1, sweep * 2.2);
    ctx.fillStyle = rgba(s.color, 0.5 * k);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.range, a0, a1);
    ctx.arc(s.x, s.y, s.range * 0.55, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.9 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.range, a0, a1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectiles(ctx, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of w.projectiles) glow(ctx, b.x, b.y, b.r * 3.2, b.color, b.team === 'enemy' ? 0.8 : 0.6);
  ctx.restore();
  ctx.lineCap = 'round';
  for (const b of w.projectiles) {
    if (b.team === 'player') {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const tl = b.kind === 'wave' ? 4 : 14;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.r * (b.kind === 'wave' ? 1 : 1.4);
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / sp) * tl, b.y - (b.vy / sp) * tl);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (b.kind === 'wave') {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, Math.atan2(b.vy, b.vx) - 1.2, Math.atan2(b.vy, b.vx) + 1.2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
      ctx.fill();
    }
  }
}

function drawBolts(ctx, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  for (const b of w.bolts) {
    const k = b.life / b.max;
    for (const [wd, col] of [[6, rgba(b.color, 0.4 * k)], [2, rgba('#ffffff', k)]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = wd;
      ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const a = b.pts[i];
        const c = b.pts[i + 1];
        if (i === 0) ctx.moveTo(a.x, a.y);
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const f = s / segs;
          const jx = s === segs ? 0 : (Math.random() - 0.5) * 14;
          const jy = s === segs ? 0 : (Math.random() - 0.5) * 14;
          ctx.lineTo(a.x + (c.x - a.x) * f + jx, a.y + (c.y - a.y) * f + jy);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawParticles(ctx, fx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.particles) {
    const k = p.life / p.max;
    ctx.fillStyle = rgba(p.color, Math.min(1, k * 1.4));
    const s = p.size * (0.4 + k * 0.6);
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max;
    ctx.strokeStyle = rgba(r.color, (1 - k) * 0.8);
    ctx.lineWidth = r.width * (1 - k * 0.5);
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(0.1, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3))), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTexts(ctx, fx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of fx.texts) {
    const k = t.life / t.max;
    const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = `${t.weight} ${Math.round(t.size * pop)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(t.str, t.x + 1, t.y + 1.5);
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
