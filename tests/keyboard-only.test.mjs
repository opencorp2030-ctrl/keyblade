// End-to-end test: plays KEYBLADE in a real Chromium using ONLY the keyboard.
// The mouse API is never called. Game state is read through a read-only hook exposed with ?test.
//
//   npm install && npx playwright install chromium   (first time only)
//   npm test                 # full suite (menus, combat, pause, upgrades, death/restart, full completion)
//   QUICK=1 npm test         # skip the full 9-arena completion run

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;
const BASE = `http://localhost:${PORT}/index.html`;
const SHOTS = join(root, 'tests', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(600);

const browser = await chromium.launch();
const errors = [];

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Guard: fail loudly if anything in this test ever uses the mouse.
  page.mouse.click = page.mouse.move = page.mouse.down = page.mouse.up = () => {
    throw new Error('Mouse used in a keyboard-only test!');
  };
  await page.goto(`${BASE}?${query}`);
  await page.waitForFunction(() => window.__keyblade?.game?.top);
  await sleep(400);
  return page;
}

const top = (page) => page.evaluate(() => window.__keyblade.game.top.constructor.name);
const state = (page) =>
  page.evaluate(() => {
    const s = window.__keyblade.scene;
    if (!s) return null;
    const w = s.world;
    const p = w.player;
    return {
      x: p.x, y: p.y, hp: p.hp, alive: p.alive, meter: p.meter, weapon: p.weapon, arena: w.run.arenaIndex,
      phase: w.phase, kills: w.run.kills, dashes: w.run.dashes, specials: w.run.specialsUsed, level: w.run.level,
      upgrades: w.run.upgradeLog.length, score: w.run.score, victory: w.run.victory,
      enemies: w.enemies.map((e) => ({ x: e.x, y: e.y, boss: e.isBoss })),
      interactables: w.interactables.filter((i) => !i.used).map((i) => ({ kind: i.kind, x: i.x, y: i.y })),
      // Next waypoint toward the first unused interactable, via BFS on the tile grid (test bot navigation only).
      waypoint: (() => {
        const it = w.interactables.find((i) => !i.used && i.kind === 'cache') ?? w.interactables.find((i) => !i.used && i.kind === 'exit');
        if (!it) return null;
        const g = w.grid, T = 30, C = g.cols;
        const start = Math.floor(p.y / T) * C + Math.floor(p.x / T);
        const goal = Math.floor(it.y / T) * C + Math.floor(it.x / T);
        const prev = new Int32Array(g.tiles.length).fill(-1);
        const q = [start]; prev[start] = start;
        while (q.length) {
          const i = q.shift();
          if (i === goal) break;
          for (const n of [i - 1, i + 1, i - C, i + C]) {
            if (n < 0 || n >= g.tiles.length || g.tiles[n] === 1 || prev[n] !== -1) continue;
            prev[n] = i; q.push(n);
          }
        }
        if (prev[goal] === -1 || goal === start) return { x: it.x, y: it.y };
        let cur = goal;
        while (prev[cur] !== start) cur = prev[cur];
        return { x: (cur % C + 0.5) * T, y: (Math.floor(cur / C) + 0.5) * T };
      })(),
    };
  });
const press = async (page, key, n = 1) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await sleep(90);
  }
};
async function waitFor(page, fn, timeout = 60000, poll = 200) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(poll);
  }
  return false;
}

/** Hold movement keys toward a target point (pure keyboard steering). */
const held = new Set();
async function steer(page, dx, dy) {
  const want = new Set();
  if (dx < -8) want.add('ArrowLeft');
  if (dx > 8) want.add('ArrowRight');
  if (dy < -8) want.add('ArrowUp');
  if (dy > 8) want.add('ArrowDown');
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function releaseAll(page) {
  for (const k of held) await page.keyboard.up(k);
  held.clear();
}

try {
  // ------------------------------------------------------------ 1. menus, keyboard only
  const page = await open('test=1');
  await page.screenshot({ path: join(SHOTS, '01-main-menu.png') });
  check('Game loads straight to the main menu', (await top(page)) === 'MainMenuScene');

  await press(page, 'Tab', 3);
  check('Tab key does nothing (focus stays in game)', (await top(page)) === 'MainMenuScene' &&
    (await page.evaluate(() => document.activeElement === document.body || document.activeElement.id === 'game')));

  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await sleep(500);
  check('How to Play opens with ↓ + ENTER', (await top(page)) === 'HowToScene');
  await press(page, 'ArrowRight', 3);
  await page.screenshot({ path: join(SHOTS, '02-how-to-play.png') });
  await press(page, 'Escape');
  await sleep(500);

  await press(page, 'ArrowDown', 2);
  await press(page, 'Enter');
  await sleep(500);
  check('Controls screen opens', (await top(page)) === 'ControlsScene');
  // Rebind DASH (5th row) to L, verify, then reset to defaults.
  await press(page, 'ArrowDown', 4);
  await press(page, 'Enter');
  await press(page, 'KeyL');
  const dashKey = await page.evaluate(() => window.__keyblade.game.input.bindings.dash[0]);
  check('Keyboard-only key rebinding works', dashKey === 'KeyL', `dash bound to ${dashKey}`);
  await press(page, 'Enter');
  await press(page, 'Tab');
  const tabRejected = await page.evaluate(() => window.__keyblade.game.input.bindings.dash[0]);
  await press(page, 'Escape'); // cancel capture if still active
  check('Tab cannot be bound to an action', tabRejected !== 'Tab');
  await page.screenshot({ path: join(SHOTS, '03-controls.png') });
  // Focus is on DASH (row 5). ↑ wraps around: 5 → 1 → BACK → RESET TO DEFAULTS.
  await press(page, 'ArrowUp', 6);
  await press(page, 'Enter');
  check('Reset controls to defaults', (await page.evaluate(() => window.__keyblade.game.input.bindings.dash[0])) === 'Space');
  await press(page, 'Escape');
  await sleep(500);

  await press(page, 'ArrowDown', 3);
  await press(page, 'Enter');
  await sleep(500);
  check('Settings screen opens', (await top(page)) === 'SettingsScene');
  await press(page, 'ArrowDown', 4); // REDUCED MOTION
  await press(page, 'ArrowRight');
  const rm = await page.evaluate(() => JSON.parse(localStorage.getItem('keyblade:settings')).reducedMotion);
  await press(page, 'ArrowRight');
  const rm2 = await page.evaluate(() => JSON.parse(localStorage.getItem('keyblade:settings')).reducedMotion);
  check('Reduced motion toggles with ←/→ and persists', rm !== rm2);
  await page.screenshot({ path: join(SHOTS, '04-settings.png') });
  await press(page, 'Escape');
  await sleep(500);

  await press(page, 'ArrowDown', 4);
  await press(page, 'Enter');
  await sleep(500);
  check('High scores screen opens', (await top(page)) === 'HighScoresScene');
  await press(page, 'Escape');
  await sleep(500);

  // ------------------------------------------------------------ 2. character select + play
  await press(page, 'Enter'); // PLAY (menu focus returns to top)
  await sleep(500);
  check('Character select opens from PLAY', (await top(page)) === 'CharSelectScene');
  await press(page, 'ArrowRight');
  await press(page, 'ArrowLeft');
  await page.screenshot({ path: join(SHOTS, '05-character-select.png') });
  await press(page, 'Enter');
  await sleep(900);
  check('ENTER starts the run', (await top(page)) === 'PlayScene');

  let s0 = await state(page);
  await page.keyboard.down('KeyD');
  await sleep(500);
  await page.keyboard.up('KeyD');
  let s1 = await state(page);
  check('WASD moves the player', s1.x > s0.x + 40, `Δx=${(s1.x - s0.x).toFixed(0)}`);
  await page.keyboard.down('ArrowLeft');
  await sleep(500);
  await page.keyboard.up('ArrowLeft');
  const s2 = await state(page);
  check('Arrow keys move the player', s2.x < s1.x - 40);

  await press(page, 'Space');
  await sleep(200);
  check('SPACE dashes', (await state(page)).dashes >= 1);

  const combat = await waitFor(page, async () => (await state(page)).kills >= 3, 40000);
  check('Combat works (enemies killed by auto-firing weapon)', combat, `kills=${(await state(page)).kills}`);
  await page.screenshot({ path: join(SHOTS, '06-combat.png') });

  await press(page, 'Digit3');
  check('Locked weapon slot refuses to switch', (await state(page)).weapon === 'edge');

  await press(page, 'KeyI');
  check('I opens the game info overlay', (await top(page)) === 'InfoScene');
  await press(page, 'ArrowRight');
  await page.screenshot({ path: join(SHOTS, '07-info.png') });
  await press(page, 'KeyI');
  check('I closes the game info overlay', (await top(page)) === 'PlayScene');

  await press(page, 'Escape');
  check('ESC pauses', (await top(page)) === 'PauseScene');
  const pausedAt = (await page.evaluate(() => window.__keyblade.scene.world.time));
  await sleep(500);
  const stillPaused = (await page.evaluate(() => window.__keyblade.scene.world.time));
  check('Game time is frozen while paused', pausedAt === stillPaused);
  await page.screenshot({ path: join(SHOTS, '08-pause.png') });
  await press(page, 'Enter'); // RESUME
  check('ENTER on RESUME unpauses', (await top(page)) === 'PlayScene');

  // Fight on until a level up, dashing around; pick with 1.
  const lvl = await waitFor(page, async () => {
    const t = await top(page);
    if (t === 'LevelUpScene') return true;
    await page.keyboard.press(Math.random() < 0.5 ? 'Space' : 'KeyQ');
    return false;
  }, 90000, 400);
  check('Level-up screen appears', lvl);
  if (lvl) {
    await sleep(600);
    await page.screenshot({ path: join(SHOTS, '09-level-up.png') });
    await press(page, 'KeyE'); // reroll
    const rerolls = await page.evaluate(() => window.__keyblade.scene.run.rerolls);
    check('E rerolls upgrade cards', rerolls === 1);
    await press(page, 'Digit1');
    await sleep(500);
    check('Pressing 1 picks an upgrade', (await state(page)).upgrades >= 1);
  }

  // Special: wait for the meter, press Q.
  const meterFull = await waitFor(page, async () => {
    if ((await top(page)) === 'LevelUpScene') await press(page, 'Digit1');
    return (await state(page)).meter >= 100;
  }, 90000, 300);
  if (meterFull) {
    await press(page, 'KeyQ');
    await sleep(200);
  }
  const specialOk = (await state(page)).specials >= 1;
  if (specialOk) check('Q triggers the special ability', true);
  else console.log('   (player died before the special meter filled; Q is checked again in the god-mode run)');

  // Death: stop dodging and let the swarm win.
  const died = await waitFor(page, async () => {
    if ((await top(page)) === 'LevelUpScene') await press(page, 'Digit1');
    const st = await state(page);
    if (st && st.phase === 'exit') {
      // arena cleared before dying: walk into the next one via the exit
      const ex = st.interactables.find((i) => i.kind === 'exit');
      if (ex) {
        const wp = st.waypoint ?? ex;
        await steer(page, wp.x - st.x, wp.y - st.y);
        if (Math.hypot(ex.x - st.x, ex.y - st.y) < 30) await press(page, 'KeyE');
      }
    } else await releaseAll(page);
    return (await top(page)) === 'EndScene';
  }, 240000, 250);
  await releaseAll(page);
  check('Death leads to the game over screen', died);
  if (died) {
    await sleep(900);
    await page.screenshot({ path: join(SHOTS, '10-game-over.png') });
    const needsInitials = await page.evaluate(() => window.__keyblade.game.top.phase === 'initials');
    if (needsInitials) {
      await press(page, 'ArrowUp', 2);
      await press(page, 'ArrowRight');
      await press(page, 'ArrowDown');
      await press(page, 'Enter');
      const hs = await page.evaluate(() => JSON.parse(localStorage.getItem('keyblade:meta')).highscores.length);
      check('High score initials entry saves with arrows + ENTER', hs >= 1);
    }
    await press(page, 'KeyR');
    await sleep(900);
    const st = await state(page);
    check('R restarts a fresh run', (await top(page)) === 'PlayScene' && st.kills === 0 && st.alive);
  }
  await page.close();

  // ------------------------------------------------------------ 3. full completion (god mode, keyboard steering)
  if (!process.env.QUICK) {
    const g = await open('test=god');
    await press(g, 'Enter'); // PLAY
    await sleep(500);
    await press(g, 'Enter'); // start with the selected character
    await sleep(900);
    const qOk = await waitFor(g, async () => {
      if ((await top(g)) === 'LevelUpScene') await press(g, 'Digit1');
      const st = await state(g);
      if (st.meter >= 100) await press(g, 'KeyQ');
      return st.specials >= 1;
    }, 60000, 250);
    if (!specialOk) check('Q triggers the special ability', qOk);
    const t0 = Date.now();
    let lastArena = -1;
    let bossShot = false;
    const done = await waitFor(g, async () => {
      const t = await top(g);
      if (t === 'LevelUpScene') {
        await press(g, 'Digit1');
        return false;
      }
      if (t === 'EndScene') return true;
      if (t !== 'PlayScene') return false;
      const st = await state(g);
      if (st.arena !== lastArena) {
        lastArena = st.arena;
        console.log(`   … arena ${st.arena + 1}/9 at ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      if (!bossShot && st.enemies.some((e) => e.boss)) {
        bossShot = true;
        await sleep(1500);
        await g.screenshot({ path: join(SHOTS, '11-boss.png') });
      }
      if (st.phase === 'exit') {
        const target = st.interactables.find((i) => i.kind === 'cache') ?? st.interactables.find((i) => i.kind === 'exit');
        if (target) {
          const wp = st.waypoint ?? target;
          await steer(g, wp.x - st.x, wp.y - st.y);
          if (Math.hypot(target.x - st.x, target.y - st.y) < 34) await g.keyboard.press('KeyE');
        }
      } else if (st.enemies.length) {
        // Circle-strafe around the nearest enemy and dash now and then.
        const e = st.enemies.reduce((a, b) => (Math.hypot(a.x - st.x, a.y - st.y) < Math.hypot(b.x - st.x, b.y - st.y) ? a : b));
        const dx = e.x - st.x;
        const dy = e.y - st.y;
        const d = Math.hypot(dx, dy);
        if (d > 70) await steer(g, dx, dy);
        else await steer(g, -dy, dx);
        if (Math.random() < 0.08) await g.keyboard.press('Space');
        if (st.meter >= 100) await g.keyboard.press('KeyQ');
        if (Math.random() < 0.05) await g.keyboard.press(`Digit${1 + Math.floor(Math.random() * 4)}`);
      } else await steer(g, 480 - st.x, 270 - st.y);
      return false;
    }, 15 * 60000, 120);
    await releaseAll(g);
    const victory = done && (await g.evaluate(() => window.__keyblade.game.top.victory));
    await sleep(1000);
    await g.screenshot({ path: join(SHOTS, '12-victory.png') });
    check('The game can be completed (all 9 arenas + 3 bosses → victory)', victory, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
    await g.close();
  }

  check('No JavaScript errors in the browser console', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Test run crashed', false, String(e));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in tests/screenshots/`);
process.exit(failed.length ? 1 : 0);
