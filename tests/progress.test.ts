import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROGRESS, applyKills, buyUpgrade, buyVehicle, sanitizeProgress, upgradeCost, MAX_UPGRADE } from '../src/store/progressLogic';
import { VEHICLES } from '../src/data/vehicles';
import { WEAPONS } from '../src/data/weapons';

const fresh = () => JSON.parse(JSON.stringify(DEFAULT_PROGRESS));

test('default progress is a valid starting state', () => {
  const p = fresh();
  assert.equal(p.selectedVehicle, 'hatchback');
  assert.ok(p.unlockedVehicles.includes('hatchback'));
  assert.equal(VEHICLES[p.selectedVehicle as keyof typeof VEHICLES].killCost, 0);
});

test('applyKills accumulates totals/best and unlocks weapons at thresholds', () => {
  let p = applyKills(fresh(), 120);
  assert.equal(p.totalKills, 120);
  assert.equal(p.bestRunKills, 120);
  p = applyKills(p, 30);
  assert.equal(p.totalKills, 150);
  assert.equal(p.bestRunKills, 120);
  const flame = WEAPONS.flame;
  const q = applyKills(fresh(), flame.unlockKills);
  assert.ok(q.unlockedWeapons.includes('flame'));
});

test('buyVehicle spends kills, unlocks and selects; refuses when poor or already owned', () => {
  const poor = fresh();
  assert.equal(buyVehicle(poor, 'sedan'), null);
  const rich = { ...fresh(), totalKills: 1000 };
  const bought = buyVehicle(rich, 'sedan')!;
  assert.equal(bought.totalKills, 1000 - VEHICLES.sedan.killCost);
  assert.ok(bought.unlockedVehicles.includes('sedan'));
  assert.equal(bought.selectedVehicle, 'sedan');
  assert.equal(buyVehicle(bought, 'sedan'), null);
});

test('buyUpgrade charges the tier cost, caps at MAX_UPGRADE, never goes negative', () => {
  let p = { ...fresh(), totalKills: 1_000_000 };
  for (let i = 0; i < MAX_UPGRADE; i++) {
    const cost = upgradeCost(i)!;
    const before = p.totalKills;
    p = buyUpgrade(p, 'hatchback', 'speed')!;
    assert.equal(before - p.totalKills, cost);
  }
  assert.equal(p.upgrades.hatchback.speed, MAX_UPGRADE);
  assert.equal(buyUpgrade(p, 'hatchback', 'speed'), null);
  assert.equal(buyUpgrade({ ...fresh(), totalKills: 99 }, 'hatchback', 'armor'), null);
});

test('sanitizeProgress repairs corrupt or outdated saves', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}]) {
    const p = sanitizeProgress(bad);
    assert.equal(p.selectedVehicle, 'hatchback');
    assert.ok(p.unlockedWeapons.includes('mg'));
  }
  const p = sanitizeProgress({ selectedVehicle: 'nope', selectedWeapon: 'none', totalKills: -5, unlockedVehicles: [], upgrades: { hatchback: { speed: 3 } } });
  assert.equal(p.selectedVehicle, 'hatchback');
  assert.equal(p.selectedWeapon, 'mg');
  assert.equal(p.totalKills, 0);
  assert.equal(p.upgrades.hatchback.speed, 3);
  assert.equal(p.upgrades.hatchback.armor, 0);
  assert.ok(p.upgrades.tank, 'every vehicle gets an upgrade record');
  // selected vehicle that is not unlocked falls back instead of letting players drive for free
  assert.equal(sanitizeProgress({ selectedVehicle: 'tank', unlockedVehicles: ['hatchback'] }).selectedVehicle, 'hatchback');
});

import { spentKills, UPGRADE_COSTS } from '../src/store/progressLogic';

test('lifetimeKills never decreases: buying vehicles/upgrades spends the bank but not unlock progress', () => {
  let p = applyKills(fresh(), 1500);                 // bank 1500, lifetime 1500
  assert.equal(p.lifetimeKills, 1500);
  p = buyVehicle(p, 'sedan')!; p = buyUpgrade(p, 'sedan', 'speed')!; p = buyUpgrade(p, 'sedan', 'speed')!;
  assert.equal(p.totalKills, 1500 - VEHICLES.sedan.killCost - UPGRADE_COSTS[0] - UPGRADE_COSTS[1]);
  assert.equal(p.lifetimeKills, 1500, 'spending leaves lifetime untouched');
  p = applyKills(p, 10);
  assert.equal(p.lifetimeKills, 1510);
});

test('regression: spending the bank must not stop weapons unlocking (unlocks used the spendable balance)', () => {
  const flame = WEAPONS.flame.unlockKills;
  // earn just under the threshold, spend most of it, then earn a little more: lifetime now crosses the threshold
  let p = applyKills(fresh(), flame - 50);
  p = buyVehicle(p, 'sedan')!;                         // bank drops far below the threshold
  assert.ok(p.totalKills < flame - 50);
  assert.ok(!p.unlockedWeapons.includes('flame'));
  p = applyKills(p, 60);                               // lifetime = flame + 10, bank is still tiny
  assert.ok(p.totalKills < flame);
  assert.ok(p.unlockedWeapons.includes('flame'), 'lifetime kills unlock the flamethrower');
});

test('migration from a pre-lifetimeKills save reconstructs lifetime exactly (bank + everything spent)', () => {
  const old: any = { ...fresh(), totalKills: 777, unlockedVehicles: ['hatchback', 'sedan', 'coupe'], selectedVehicle: 'coupe' };
  delete old.lifetimeKills;
  old.upgrades = { ...old.upgrades, sedan: { speed: 3, armor: 0, handling: 1, acceleration: 0 }, coupe: { speed: 0, armor: 2, handling: 0, acceleration: 0 } };
  const expectedSpent = VEHICLES.sedan.killCost + VEHICLES.coupe.killCost
    + (UPGRADE_COSTS[0] + UPGRADE_COSTS[1] + UPGRADE_COSTS[2]) + UPGRADE_COSTS[0]      // sedan speed x3, handling x1
    + (UPGRADE_COSTS[0] + UPGRADE_COSTS[1]);                                           // coupe armor x2
  assert.equal(spentKills(old), expectedSpent);
  const p = sanitizeProgress(old);
  assert.equal(p.lifetimeKills, 777 + expectedSpent);
  // idempotent and never below the bank
  assert.equal(sanitizeProgress(p).lifetimeKills, p.lifetimeKills);
  assert.equal(sanitizeProgress({ ...p, lifetimeKills: 5 }).lifetimeKills, 777 + expectedSpent);
  assert.equal(sanitizeProgress({ ...p, lifetimeKills: 'x' }).lifetimeKills, 777 + expectedSpent);
});

test('existing players keep every unlock they had earned (migration does not re-lock content)', () => {
  const old: any = { ...fresh(), totalKills: 40, unlockedWeapons: ['none', 'mg', 'flame'], selectedWeapon: 'flame' };
  delete old.lifetimeKills;
  const p = sanitizeProgress(old);
  assert.ok(p.unlockedWeapons.includes('flame') && p.selectedWeapon === 'flame');
});
