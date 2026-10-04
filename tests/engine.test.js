const test = require('node:test');
const assert = require('node:assert');

let E;
test.before(async () => { E = await import('../src/game/engine.js'); });

// Deterministic rng so spawn positions are reproducible.
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const drive = (g, input, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) E.step(g, input, dt); };

test('new game starts alive with no zombies', () => {
  const g = E.createGame(seeded());
  assert.equal(g.kills, 0);
  assert.equal(g.zombies.length, 0);
  assert.equal(g.car.health, 100);
  assert.equal(g.over, false);
});

test('car accelerates under gas and is speed-capped', () => {
  const g = E.createGame(seeded());
  drive(g, { gas: true, steer: 0 }, 0.5);
  assert.ok(g.car.speed > 100);
  drive(g, { gas: true, steer: 0 }, 5);
  assert.ok(g.car.speed <= 320 + 1e-9);
});

test('car does not turn while stationary', () => {
  const g = E.createGame(seeded());
  const a = g.car.angle;
  E.step(g, { steer: 1, gas: false }, 0.1);
  assert.equal(g.car.angle, a);
});

test('driving over a zombie at speed kills it and counts the kill', () => {
  const g = E.createGame(seeded());
  g.car.speed = 200;
  g.car.angle = 0;
  g.zombies.push({ id: 99, x: 10, y: 0 });
  E.step(g, { gas: false, steer: 0 }, 1 / 60);
  assert.equal(g.kills, 1);
  assert.equal(g.zombies.find((z) => z.id === 99), undefined);
  assert.equal(g.splats.length, 1);
});

test('a stationary car is mauled instead of killing', () => {
  const g = E.createGame(seeded());
  g.zombies.push({ id: 99, x: 5, y: 0 });
  drive(g, { gas: false, steer: 0 }, 1);
  assert.equal(g.kills, 0);
  assert.ok(g.car.health < 100);
});

test('game ends at zero health and freezes state', () => {
  const g = E.createGame(seeded());
  g.car.health = 0.01;
  g.zombies.push({ id: 1, x: 5, y: 0 });
  drive(g, { gas: false, steer: 0 }, 1);
  assert.equal(g.over, true);
  assert.equal(g.car.health, 0);
  const t = g.time;
  E.step(g, { gas: true, steer: 0 }, 1);
  assert.equal(g.time, t);
});

test('spawn pressure escalates and zombies spawn off-screen', () => {
  const g = E.createGame(seeded(7));
  g.car.health = 1e9; // observe spawning without dying
  drive(g, { gas: false, steer: 0 }, 2);
  const early = g.zombies.length;
  for (const z of g.zombies) assert.ok(Math.hypot(z.x, z.y) > 100);
  drive(g, { gas: false, steer: 0 }, 20);
  assert.ok(g.zombies.length > early);
});

test('zombie count and splats are bounded (no unbounded growth)', () => {
  const g = E.createGame(seeded(3));
  g.car.health = 1e9;
  drive(g, { gas: false, steer: 0 }, 300);
  assert.ok(g.zombies.length <= E.MAX_ZOMBIES);
  const kills = (() => { g.car.speed = 200; drive(g, { gas: true, steer: 0.3 }, 60); return g.kills; })();
  assert.ok(g.splats.length <= 40);
  assert.ok(kills > 0);
});

test('scripted bot survives longer than an idle player (playability)', () => {
  const idle = E.createGame(seeded(5));
  drive(idle, { gas: false, steer: 0 }, 120);
  const bot = E.createGame(seeded(5));
  drive(bot, { gas: true, steer: 0.5 }, 120);
  assert.ok(bot.kills > 20, `bot kills ${bot.kills}`);
  assert.ok(bot.time > idle.time);
});
