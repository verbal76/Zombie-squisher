import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, deriveStats, step, MAX_ACTIVE_ZOMBIES, KILL_SPEED, UpdateInput, World } from '../src/game/engine';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';
import { Progress, Zombie } from '../src/types';

const IDLE: UpdateInput = { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: false, triggerAbility: false };
const prog = (over: Partial<Progress> = {}): Progress => ({ ...JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), ...over });
const newWorld = (p = prog()) => createWorld(1200, 1200, p);

// Deterministic Math.random for reproducible spawns.
function seeded(seed = 7) {
  const orig = Math.random;
  let s = seed;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return () => { Math.random = orig; };
}

function zombieAt(w: World, dx: number, dy: number, over: Partial<Zombie> = {}): Zombie {
  const z: Zombie = { id: w.nextEntityId++, x: w.carX + dx, y: w.carY + dy, vx: 0, vy: 0, hp: 10, maxHp: 10, kind: 'walker', size: 14, attackCooldown: 0, ...over };
  w.zombies.push(z);
  return z;
}

const noSpawns = (w: World) => { w.spawnTimer = 1e9; };

test('new world starts alive, empty and at the arena centre', () => {
  const w = newWorld();
  assert.equal(w.kills, 0);
  assert.equal(w.zombies.length, 0);
  assert.equal(w.gameOver, false);
  assert.equal(w.hp, w.maxHp);
  assert.ok(w.maxHp > 0);
});

test('deriveStats never yields NaN for partial/missing upgrade data (regression: spread overwrote defaults)', () => {
  const p = prog();
  // Persisted save from an older build: upgrades entry missing fields / undefined values.
  (p.upgrades as any).hatchback = { speed: 2, armor: undefined };
  const { stats } = deriveStats(p);
  for (const [k, v] of Object.entries(stats)) assert.ok(Number.isFinite(v), `${k} is ${v}`);
  delete (p.upgrades as any).hatchback;
  for (const v of Object.values(deriveStats(p).stats)) assert.ok(Number.isFinite(v));
});

test('car accelerates forward and respects its top speed', () => {
  const w = newWorld();
  noSpawns(w);
  for (let i = 0; i < 600; i++) step(w, 1 / 60, IDLE, prog());
  const { stats } = deriveStats(prog());
  assert.ok(w.forwardV > stats.speed * 0.9);
  assert.ok(w.forwardV <= stats.speed * 1.01);
  assert.ok(w.carY < 600, 'car should have driven toward -Y (forward)');
});

test('bumper impact at speed kills the zombie, counts a kill, streak and blood', () => {
  const w = newWorld();
  noSpawns(w);
  w.carVy = -200; w.forwardV = 200;
  const z = zombieAt(w, 0, -30);
  step(w, 1 / 60, IDLE, prog());
  assert.ok(z.hp <= 0);
  assert.equal(w.kills, 1);
  assert.equal(w.streak, 1);
  assert.ok(w.bloodSpots.length > 0);
  assert.equal(w.zombies.length, 0);
});

test('slow contact hurts the car instead of killing', () => {
  const w = newWorld();
  noSpawns(w);
  zombieAt(w, 0, -30);
  const hp0 = w.hp;
  for (let i = 0; i < 60; i++) step(w, 1 / 60, { ...IDLE, gear: 'neutral' }, prog());
  assert.equal(w.kills, 0);
  assert.ok(w.hp < hp0);
});

test('side hit at impact speed damages the car and does not kill', () => {
  const w = newWorld();
  noSpawns(w);
  w.carVy = -200; w.forwardV = 200;
  const z = zombieAt(w, 22, 0);
  const hp0 = w.hp;
  step(w, 1 / 60, IDLE, prog());
  assert.ok(z.hp > 0);
  assert.ok(w.hp < hp0);
});

test('EMP kills are counted (regression: EMP zeroed hp without registering the kill)', () => {
  const p = prog({ selectedAbility: 'emp', unlockedAbilities: ['none', 'emp'] });
  const w = newWorld(p);
  noSpawns(w);
  zombieAt(w, 300, 300, { maxHp: 30, hp: 30 });
  zombieAt(w, -300, 300, { maxHp: 30, hp: 30 });
  step(w, 1 / 60, { ...IDLE, triggerAbility: true }, p);
  assert.equal(w.kills, 2);
  assert.equal(w.zombies.length, 0);
  assert.ok(w.streak >= 2);
});

test('side-mod damage is frame-rate independent (regression: applied per frame)', () => {
  const p = prog({ selectedSideMod: 'swords', unlockedSideMods: ['none', 'swords'] });
  const run = (fps: number) => {
    const w = newWorld(p);
    noSpawns(w);
    // Zombie parked in the right-side blade box; huge hp so it survives the whole second.
    const z = zombieAt(w, 40, 0, { hp: 1e6, maxHp: 1e6 });
    const dt = 1 / fps;
    for (let i = 0; i < fps; i++) { z.x = w.carX + 40; z.y = w.carY; z.vx = z.vy = 0; step(w, dt, { ...IDLE, gear: 'neutral' }, p); }
    return 1e6 - z.hp;
  };
  const at60 = run(60);
  const at20 = run(20);
  assert.ok(at60 > 0);
  assert.ok(Math.abs(at60 - at20) / at60 < 0.05, `60fps=${at60} 20fps=${at20}`);
});

test('zombie population is capped and survives long frames (no unbounded growth)', () => {
  const restore = seeded();
  try {
    const w = newWorld();
    w.hp = w.maxHp = 1e9;
    for (let i = 0; i < 2000; i++) step(w, 0.05, IDLE, prog()); // max dt the game loop allows
    assert.ok(w.zombies.length <= MAX_ACTIVE_ZOMBIES);
    assert.ok(w.projectiles.length < 200);
  } finally { restore(); }
});

test('game over freezes the simulation', () => {
  const w = newWorld();
  noSpawns(w);
  w.hp = 0.001;
  zombieAt(w, 0, -30);
  for (let i = 0; i < 120; i++) step(w, 1 / 60, { ...IDLE, gear: 'neutral' }, prog());
  assert.equal(w.gameOver, true);
  assert.equal(w.hp, 0);
  const x = w.carX, kills = w.kills;
  step(w, 1, IDLE, prog());
  assert.equal(w.carX, x);
  assert.equal(w.kills, kills);
});

test('bosses appear after wave 8 and kill threshold', () => {
  const restore = seeded(3);
  try {
    const w = newWorld();
    w.hp = w.maxHp = 1e9;
    w.kills = 250; // wave 10
    step(w, 1 / 60, IDLE, prog());
    assert.ok(w.zombies.some((z) => z.kind === 'boss'));
  } finally { restore(); }
});

test('KILL_SPEED is positive and below every vehicle top speed (kills are always possible)', async () => {
  const { VEHICLE_LIST } = await import('../src/data/vehicles');
  for (const v of VEHICLE_LIST) assert.ok(KILL_SPEED < v.baseSpeed, v.id);
});
