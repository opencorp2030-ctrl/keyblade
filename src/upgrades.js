// Level-up upgrade pool. Three random cards are offered each level.

import { WEAPONS, WEAPON_ORDER, MAX_WEAPON_LEVEL } from './weapons.js';
import { healPlayer } from './combat.js';

export const RARITY = {
  common: { weight: 10, color: '#9fb4ff', label: 'COMMON' },
  rare: { weight: 5, color: '#4de3ff', label: 'RARE' },
  epic: { weight: 2, color: '#ff5ad8', label: 'EPIC' },
};

const U = (id, name, desc, rarity, max, apply, cond) => ({ id, name, desc, rarity, max, apply, cond });

export const UPGRADES = [
  U('dmg', 'HEAVY KEYCAPS', '+15% damage.', 'common', 8, (w, p) => (p.stats.dmgMul += 0.15)),
  U('rate', 'LINEAR SWITCHES', '+12% attack speed.', 'common', 8, (w, p) => (p.stats.rateMul += 0.12)),
  U('speed', 'LOW PROFILE', '+8% move speed.', 'common', 4, (w, p) => (p.stats.speed *= 1.08)),
  U('hp', 'SPARE KEY', '+1 max HP and heal 1.', 'rare', 4, (w, p) => {
    p.maxHp++;
    healPlayer(w, 1, '+1 MAX HP');
  }),
  U('heal', 'HOT SWAP', 'Heal 2 HP.', 'common', 99, (w) => healPlayer(w, 2, '+2 HP'), (w, p) => p.hp < p.maxHp),
  U('dashcd', 'DEBOUNCE', '-15% dash cooldown.', 'common', 4, (w, p) => (p.stats.dashCd *= 0.85)),
  U('dashcharge', 'DOUBLE TAP', '+1 dash charge.', 'rare', 2, (w, p) => {
    p.dash.max++;
    p.dash.charges++;
  }),
  U('dashdmg', 'KEYSTROKE', 'Dash deals +100% damage and hits a wider area.', 'common', 3, (w, p) => {
    p.stats.dashDmg *= 2;
    p.stats.dashReach += 6;
  }),
  U('trail', 'AFTERIMAGE', 'Dashing leaves a trail of burning afterimages.', 'epic', 1, (w, p) => (p.stats.trail = true)),
  U('magnet', 'MAGNETIC PCB', '+50% pickup radius.', 'common', 3, (w, p) => (p.stats.magnet *= 1.5)),
  U('meter', 'MACRO RECORDER', 'Special charges 25% faster.', 'common', 4, (w, p) => (p.stats.meterGain += 0.25)),
  U('crit', 'LUCKY KEY', '+8% critical hit chance.', 'common', 5, (w, p) => (p.stats.crit += 0.08)),
  U('critdmg', 'CLICKY SWITCHES', 'Critical hits deal +60% damage.', 'rare', 3, (w, p) => (p.stats.critMul += 0.6)),
  U('pierce', 'N-KEY ROLLOVER', 'Projectiles pierce +1 enemy.', 'rare', 3, (w, p) => (p.stats.pierce += 1)),
  U('multishot', 'CHORD', '+1 PULSE bolt, +2 SCATTER pellets, +1 ARC chain.', 'rare', 3, (w, p) => (p.stats.projBonus += 1)),
  U('combo', 'STICKY KEYS', 'Combo window lasts +1s longer.', 'common', 3, (w, p) => (p.stats.comboWindow += 1)),
  U('swap', 'HOTKEYS', 'SWAP STRIKE bonus +40% and recharges faster.', 'rare', 3, (w, p) => {
    p.stats.swapBonus += 0.4;
    p.stats.swapCd *= 0.7;
  }),
  U('thorns', 'SPIKED CAPS', 'Getting hit releases a damaging shockwave.', 'rare', 1, (w, p) => (p.stats.thorns = true)),
  U('leech', 'AUTOSAVE', 'Heal 1 HP every 60 kills.', 'epic', 1, (w, p) => (p.stats.leech = true)),
  U('knock', 'SPACE BAR', '+40% knockback.', 'common', 3, (w, p) => (p.stats.knock += 0.4)),
  U('area', 'WIDE LAYOUT', '+15% melee reach, blast and chain radius.', 'common', 3, (w, p) => (p.stats.area += 0.15)),
];

function weaponCards(run) {
  const out = [];
  for (const id of WEAPON_ORDER) {
    const lvl = run.weapons[id];
    const def = WEAPONS[id];
    if (lvl === 0) {
      out.push({
        id: `w:${id}`, name: `UNLOCK ${def.name}`, desc: `${def.desc} Select it with ${def.slot}.`, rarity: 'rare',
        weapon: id, weight: 7,
      });
    } else if (lvl < MAX_WEAPON_LEVEL) {
      out.push({
        id: `w:${id}`, name: `${def.name} LV ${lvl + 1}`, desc: `${def.perks[lvl]}. +20% ${def.name} damage.`, rarity: 'common',
        weapon: id, weight: 6,
      });
    }
  }
  return out;
}

export function rollUpgrades(w, n = 3) {
  const { run, player: p } = w;
  const pool = [
    ...UPGRADES.filter((u) => (run.upgrades[u.id] ?? 0) < u.max && (!u.cond || u.cond(w, p))),
    ...weaponCards(run),
  ];
  const picks = [];
  while (picks.length < n && pool.length) {
    const u = w.rng.weighted(pool, (x) => x.weight ?? RARITY[x.rarity].weight);
    picks.push(u);
    pool.splice(pool.indexOf(u), 1);
  }
  return picks;
}

export function applyUpgrade(w, card) {
  const { run, player: p } = w;
  if (card.weapon) {
    run.weapons[card.weapon]++;
    if (run.weapons[card.weapon] === 1) w.equipWeapon(card.weapon, true);
  } else {
    card.apply(w, p);
    run.upgrades[card.id] = (run.upgrades[card.id] ?? 0) + 1;
  }
  run.upgradeLog.push(card.name);
}
