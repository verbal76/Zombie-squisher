import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, UpdateInput, World, MAX_ACTIVE_ZOMBIES, MAX_BLOOD_SPOTS, GearState } from '../src/game/engine';
import { DEFAULT_PROGRESS, applyKills, sanitizeProgress } from '../src/store/progressLogic';
import { VEHICLE_LIST } from '../src/data/vehicles';
import { WEAPON_LIST, ABILITY_LIST } from '../src/data/weapons';
import { SIDE_MOD_LIST } from '../src/data/sideMods';
import { Progress } from '../src/types';

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Every number in the world must stay finite and every collection bounded, whatever the player does. */
function assertInvariants(w: World, tag: string) {
  for (const k of ['carX', 'carY', 'heading', 'forwardV', 'carVx', 'carVy', 'hp', 'maxHp', 'momentum', 'shake', 'speed', 'angularVelocity', 'steeringAngle'] as const) {
    assert.ok(Number.isFinite(w[k]), `${tag}: ${k} = ${w[k]}`);
  }
  assert.ok(w.hp >= 0 && w.hp <= w.maxHp + 1e-6, `${tag}: hp ${w.hp}/${w.maxHp}`);
  assert.ok(w.zombies.length <= MAX_ACTIVE_ZOMBIES + 1, `${tag}: zombies ${w.zombies.length}`);   // +1: a boss may spawn past the cap
  assert.ok(w.bloodSpots.length <= MAX_BLOOD_SPOTS, `${tag}: blood ${w.bloodSpots.length}`);
  assert.ok(w.projectiles.length < 400, `${tag}: projectiles ${w.projectiles.length}`);
  assert.ok(w.kills >= 0 && Number.isInteger(w.kills) && w.streak >= 0 && w.bestStreak >= w.streak);
  assert.ok(Math.abs(w.carVx) < 5000 && Math.abs(w.carVy) < 5000, `${tag}: velocity blew up`);
  for (const z of w.zombies) assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.hp), `${tag}: zombie ${z.id}`);
  const ids = new Set(w.zombies.map((z) => z.id));
  assert.equal(ids.size, w.zombies.length, `${tag}: duplicate zombie ids`);
}

function loadout(r: () => number): Progress {
  const p: Progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  p.selectedVehicle = pick(VEHICLE_LIST).id;
  p.selectedWeapon = pick(WEAPON_LIST).id;
  p.selectedAbility = pick(ABILITY_LIST).id;
  p.selectedSideMod = pick(SIDE_MOD_LIST).id;
  for (const v of VEHICLE_LIST) p.upgrades[v.id] = { speed: Math.floor(r() * 6), armor: Math.floor(r() * 6), handling: Math.floor(r() * 6), acceleration: Math.floor(r() * 6) };
  return p;
}

test('soak: 40 random loadouts x 4000 frames of random mashing keep every invariant (no NaN, bounded collections)', () => {
  const orig = Math.random;
  try {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 7919);
      Math.random = rng(seed);
      const p = loadout(r);
      const w = createWorld(1200, 1200, p);
      let input: UpdateInput = { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: true, triggerAbility: false };
      for (let f = 0; f < 4000 && !w.gameOver; f++) {
        if (f % 7 === 0) {                                    // rapid, unpredictable input changes
          const gears: GearState[] = ['forward', 'reverse', 'neutral'];
          input = { steerLeft: r() < 0.4, steerRight: r() < 0.4, gear: gears[Math.floor(r() * 3)], turbo: r() < 0.3, fire: r() < 0.8, triggerAbility: r() < 0.1 };
        }
        // frame times from 144 fps up to the loop's 50 ms cap, including hitches
        const dt = r() < 0.05 ? 0.05 : 1 / (30 + r() * 114);
        step(w, dt, input, p);
        if (f % 97 === 0) assertInvariants(w, `seed ${seed} frame ${f}`);
      }
      assertInvariants(w, `seed ${seed} end`);
    }
  } finally { Math.random = orig; }
});

test('soak: dt extremes (tiny, zero, huge) never corrupt the simulation', () => {
  const p = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  const w = createWorld(1200, 1200, p);
  const input: UpdateInput = { steerLeft: false, steerRight: true, gear: 'forward', turbo: true, fire: true, triggerAbility: false };
  for (const dt of [0, 1e-9, 1e-4, 0.016, 0.05, 0.05, 1e-6, 0.033]) for (let i = 0; i < 200; i++) step(w, dt, input, p);
  assertInvariants(w, 'dt extremes');
});

test('repeated runs: restart 200 times with no state leaking between worlds', () => {
  const p: Progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  let prog = p;
  for (let run = 0; run < 200; run++) {
    const w = createWorld(1200, 1200, prog);
    assert.equal(w.kills, 0); assert.equal(w.zombies.length, 0); assert.equal(w.bloodSpots.length, 0);
    assert.equal(w.projectiles.length, 0); assert.equal(w.streak, 0); assert.equal(w.gameOver, false); assert.equal(w.shotCount, 0);
    for (let f = 0; f < 120; f++) step(w, 1 / 60, { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: true, triggerAbility: false }, prog);
    prog = applyKills(prog, w.kills);
    prog = sanitizeProgress(JSON.parse(JSON.stringify(prog)));      // save/load round trip every run
  }
  assert.ok(prog.lifetimeKills >= prog.totalKills);
});

test('the hatchback survives roughly 10 direct hits as the design doc promises', () => {
  const p: Progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  const w = createWorld(1200, 1200, p);
  w.spawnTimer = 1e9;
  let hits = 0;
  while (w.hp > 0 && hits < 200) {
    w.zombies.push({ id: w.nextEntityId++, x: w.carX, y: w.carY - 30, vx: 0, vy: 0, hp: 1e6, maxHp: 1e6, kind: 'walker', size: 14, attackCooldown: 0 });
    w.carVy = -200; w.forwardV = 200; w.invuln = 0;
    step(w, 1 / 60, { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: false, triggerAbility: false }, p);
    w.zombies.length = 0; hits++;
  }
  // design: "starter vehicle survives roughly 10 direct zombie impacts" (master-design.md, Vehicle Damage System)
  assert.ok(hits >= 8 && hits <= 40, `starter car died after ${hits} bumper hits`);
});
