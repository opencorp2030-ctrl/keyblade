// Boot: wait for the display font (so canvas text doesn't flash), then start at the main menu.

import { Game } from './game.js';
import { MainMenuScene } from './ui/menus.js';

async function boot() {
  const canvas = document.getElementById('game');
  const announcer = document.getElementById('sr');
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 20px "Chakra Petch"'), document.fonts.load('600 20px "Chakra Petch"')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const game = new Game(canvas, announcer);
  game.start(new MainMenuScene(game));
  // Read-only hook for the automated keyboard-only test (tests/keyboard-only.test.mjs).
  if (game.params.has('test')) window.__keyblade = { game };
  canvas.focus({ preventScroll: true });
  document.getElementById('loading')?.remove();
}

boot();
