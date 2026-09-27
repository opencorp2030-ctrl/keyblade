// Tile grid collision, circle movement with wall sliding, line of sight and shape tests.

import { TILE } from './config.js';
import { clamp } from './math.js';

export function makeGrid(cols, rows) {
  return { cols, rows, tiles: new Uint8Array(cols * rows) };
}

export function solid(grid, c, r) {
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return true;
  return grid.tiles[r * grid.cols + c] === 1;
}

export function solidAt(grid, x, y) {
  return solid(grid, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Push a circle entity {x, y, r} out of any solid tiles. Returns true if it touched a wall. */
export function resolveCircle(ent, grid) {
  const r = ent.r;
  const c0 = Math.floor((ent.x - r) / TILE);
  const c1 = Math.floor((ent.x + r) / TILE);
  const r0 = Math.floor((ent.y - r) / TILE);
  const r1 = Math.floor((ent.y + r) / TILE);
  let hit = false;
  for (let rr = r0; rr <= r1; rr++) {
    for (let cc = c0; cc <= c1; cc++) {
      if (!solid(grid, cc, rr)) continue;
      const rx = cc * TILE;
      const ry = rr * TILE;
      const nx = clamp(ent.x, rx, rx + TILE);
      const ny = clamp(ent.y, ry, ry + TILE);
      const dx = ent.x - nx;
      const dy = ent.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        ent.x += (dx / d) * (r - d);
        ent.y += (dy / d) * (r - d);
      } else {
        // Centre is inside the tile: push out through the nearest edge.
        const left = ent.x - rx;
        const right = rx + TILE - ent.x;
        const top = ent.y - ry;
        const bottom = ry + TILE - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = rx - r;
        else if (m === right) ent.x = rx + TILE + r;
        else if (m === top) ent.y = ry - r;
        else ent.y = ry + TILE + r;
      }
    }
  }
  return hit;
}

/** Move with sub-steps so fast things (dashes) never tunnel through walls. */
export function moveCircle(ent, dx, dy, grid) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (ent.r * 0.5)));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    ent.x += dx / steps;
    ent.y += dy / steps;
    if (resolveCircle(ent, grid)) hit = true;
  }
  return hit;
}

export function lineOfSight(grid, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(d / (TILE / 3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAt(grid, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

export function pointSegDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export function overlap(a, b, extra = 0) {
  const r = a.r + b.r + extra;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < r * r;
}

/** Cast a ray until it hits a wall; returns the end point (used for lasers). */
export function raycast(grid, x, y, angle, maxDist = 2000) {
  const step = TILE / 4;
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  let d = 0;
  while (d < maxDist) {
    d += step;
    if (solidAt(grid, x + cx * d, y + cy * d)) break;
  }
  return { x: x + cx * d, y: y + cy * d, d };
}
