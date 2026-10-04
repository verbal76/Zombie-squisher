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
