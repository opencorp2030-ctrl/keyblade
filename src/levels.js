// Procedural arena generation and the enemy navigation flow field.

import { COLS, ROWS, TILE, SECTORS, ARENAS_PER_SECTOR } from './config.js';
import { makeGrid, solid } from './collision.js';

const SHAPES = [
  [[0, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1]],
];

export const ARENA_NAMES = [
  ['ESC CORRIDOR', 'SHIFT YARDS', 'CAPS LOCK KEEP'],
  ['F-KEY FOUNDRY', 'MEDIA ROW', 'MACRO SANCTUM'],
  ['NUMLOCK DEPTHS', 'OPERATOR PITS', 'KERNEL CORE'],
];

export function arenaInfo(index) {
  const sector = Math.floor(index / ARENAS_PER_SECTOR);
  const local = index % ARENAS_PER_SECTOR;
  return {
    index,
    sector,
    local,
    isBoss: local === ARENAS_PER_SECTOR - 1,
    label: `${sector + 1}-${local + 1}`,
    name: ARENA_NAMES[sector][local],
    theme: SECTORS[sector],
  };
}

export function generateArena(rng, info) {
  const cx = COLS / 2;
  const cy = ROWS / 2;
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = makeGrid(COLS, ROWS);
    const set = (c, r) => {
      if (c > 0 && r > 0 && c < COLS - 1 && r < ROWS - 1) grid.tiles[r * COLS + c] = 1;
    };
    for (let c = 0; c < COLS; c++) {
      grid.tiles[c] = 1;
      grid.tiles[(ROWS - 1) * COLS + c] = 1;
    }
    for (let r = 0; r < ROWS; r++) {
      grid.tiles[r * COLS] = 1;
      grid.tiles[r * COLS + COLS - 1] = 1;
    }

    const place = (c, r, sym) => {
      set(c, r);
      if (sym === 'quad' || sym === 'mirrorX') set(COLS - 1 - c, r);
      if (sym === 'quad' || sym === 'mirrorY') set(c, ROWS - 1 - r);
      if (sym === 'quad' || sym === 'point') set(COLS - 1 - c, ROWS - 1 - r);
    };

    if (info.isBoss) {
      // Boss arenas stay open: four pillars give cover without trapping big bosses.
      for (const [c, r] of [[7, 4], [7, 12]]) {
        for (const [sx, sy] of SHAPES[1]) place(c + sx, r + sy, 'mirrorX');
      }
    } else {
      const sym = rng.pick(['quad', 'mirrorX', 'mirrorY', 'point']);
      const count = rng.int(4, 6) + info.sector;
      for (let k = 0; k < count; k++) {
        const shape = rng.pick(SHAPES);
        const maxC = sym === 'mirrorY' ? COLS - 5 : cx - 2;
        const maxR = sym === 'mirrorX' ? ROWS - 5 : cy - 2;
        const ox = rng.int(2, maxC);
        const oy = rng.int(2, maxR);
        const flip = rng.chance(0.5);
        for (const [sx, sy] of shape) place(ox + (flip ? sy : sx), oy + (flip ? sx : sy), sym);
      }
    }

    // Keep the player's spawn area clear.
    for (let r = cy - 2; r <= cy + 1; r++) for (let c = cx - 3; c <= cx + 2; c++) grid.tiles[r * COLS + c] = 0;

    // Fill any floor that is unreachable from the centre so nothing can hide there.
    const reach = computeFlow(grid, cx * TILE, cy * TILE);
    let floor = 0;
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === 0) {
        if (reach[i] < 0) grid.tiles[i] = 1;
        else floor++;
      }
    }
    if (floor < (COLS - 2) * (ROWS - 2) * 0.74 && attempt < 39) continue;

    const letters = info.theme.letters;
    const labels = new Array(grid.tiles.length);
    for (let i = 0; i < labels.length; i++) labels[i] = rng.chance(0.28) ? letters[rng.int(0, letters.length - 1)] : '';

    return { grid, spawnX: cx * TILE, spawnY: cy * TILE, labels };
  }
  throw new Error('arena generation failed');
}

/** BFS distance (in tiles) from the target to every floor tile. -1 = unreachable. */
export function computeFlow(grid, tx, ty, out) {
  const { cols, rows } = grid;
  const n = cols * rows;
  const flow = out && out.length === n ? out : new Int16Array(n);
  flow.fill(-1);
  const sc = Math.floor(tx / TILE);
  const sr = Math.floor(ty / TILE);
  if (solid(grid, sc, sr)) return flow;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const start = sr * cols + sc;
  flow[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const c = i % cols;
    const r = (i - c) / cols;
    const d = flow[i] + 1;
    if (c > 0 && grid.tiles[i - 1] === 0 && flow[i - 1] < 0) { flow[i - 1] = d; queue[tail++] = i - 1; }
    if (c < cols - 1 && grid.tiles[i + 1] === 0 && flow[i + 1] < 0) { flow[i + 1] = d; queue[tail++] = i + 1; }
    if (r > 0 && grid.tiles[i - cols] === 0 && flow[i - cols] < 0) { flow[i - cols] = d; queue[tail++] = i - cols; }
    if (r < rows - 1 && grid.tiles[i + cols] === 0 && flow[i + cols] < 0) { flow[i + cols] = d; queue[tail++] = i + cols; }
  }
  return flow;
}

/** Direction to walk from (x, y) to follow the flow field downhill. */
export function flowDir(grid, flow, x, y) {
  const { cols } = grid;
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  const here = flow[r * cols + c];
  if (here === undefined || here < 0) return null;
  let best = here;
  let bx = 0;
  let by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nc = c + dx;
      const nr = r + dy;
      if (solid(grid, nc, nr)) continue;
      // No corner cutting on diagonals.
      if (dx && dy && (solid(grid, c + dx, r) || solid(grid, c, r + dy))) continue;
      const v = flow[nr * cols + nc];
      if (v >= 0 && v < best) {
        best = v;
        bx = dx;
        by = dy;
      }
    }
  }
  if (!bx && !by) return null;
  const tx = (c + bx + 0.5) * TILE - x;
  const ty = (r + by + 0.5) * TILE - y;
  const l = Math.hypot(tx, ty) || 1;
  return { x: tx / l, y: ty / l };
}

/** All walkable tile centres, optionally filtered. */
export function floorCells(grid, filter) {
  const out = [];
  for (let r = 1; r < grid.rows - 1; r++) {
    for (let c = 1; c < grid.cols - 1; c++) {
      if (grid.tiles[r * grid.cols + c] !== 0) continue;
      const x = (c + 0.5) * TILE;
      const y = (r + 0.5) * TILE;
      if (!filter || filter(x, y)) out.push({ x, y });
    }
  }
  return out;
}
