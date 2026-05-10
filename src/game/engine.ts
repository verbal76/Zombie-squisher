import { BloodSpot, Progress, Projectile, ProjectileKind, Vehicle, Weapon, Zombie } from '../types';
import { VEHICLES } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { ZOMBIE_DEFS, pickZombieKind } from '../data/zombies';

export interface World {
  width: number;
  height: number;
  carX: number;
  carY: number;
  /** Heading in radians. 0 = facing toward -Y (up the screen). */
  heading: number;
  /** Forward speed scalar in heading direction. Negative = reversing. */
  forwardV: number;
  /** Seconds the brake has been held while fully stopped (drives reverse engagement). */
  brakeHoldTimer: number;
  carVx: number;
  carVy: number;
  /** Smoothed steering input -1..1 (lags raw wheel input to model wheel inertia). */
  steeringAngle: number;
  scroll: number;
  speed: number;
  zombies: Zombie[];
  projectiles: Projectile[];
  bloodSpots: BloodSpot[];
  hp: number;
  maxHp: number;
  kills: number;
  wave: number;
  spawnTimer: number;
  fireTimer: number;
  abilityCooldown: number;
  abilityActive: number;
  invuln: number;
  nextEntityId: number;
  shake: number;
  gameOver: boolean;
  nextBossKills: number;
  /** Current kill streak (resets on hit, on idle for 3s, or on slow contact). */
  streak: number;
  /** Best streak this run, for HUD display. */
  bestStreak: number;
  /** Seconds since last kill; used to time-out the streak. */
  streakIdleTimer: number;
  /** Active streak-milestone banner; consumed by the HUD when shown. */
  streakBannerKind: StreakBannerKind;
  /** performance.now() at which the banner was last triggered. */
  streakBannerAt: number;
  /** Smoothed normalized momentum 0..1 for HUD bar. */
  momentum: number;
}

export type StreakBannerKind = 'spree' | 'reaper' | 'breaker' | 'apocalypse' | null;
export const KILL_SPEED = 50;

export interface DerivedStats {
  speed: number;
  armor: number;
  handling: number;
  acceleration: number;
  brakeStrength: number;
  bumperDamage: number;
}

export function deriveStats(p: Progress): { vehicle: Vehicle; stats: DerivedStats; weapon: Weapon } {
  const vehicle = VEHICLES[p.selectedVehicle];
  const weapon = WEAPONS[p.selectedWeapon];
  // Spread defaults FIRST, then overlay saved upgrades. Guards against saved
  // progress objects that pre-date a field addition (e.g. before the
  // `acceleration` field was added to UpgradeStats). Without this, an old
  // save with `{speed:0, armor:0, handling:0}` would leave u.acceleration
  // undefined → vehicle.baseAcceleration + undefined * 40 = NaN, which
  // cascades through forwardV/heading/carX/carY and breaks the entire game.
  const u = { speed: 0, armor: 0, handling: 0, acceleration: 0, ...(p.upgrades[vehicle.id] ?? {}) };
  const acceleration = vehicle.baseAcceleration + u.acceleration * 40;
  const stats: DerivedStats = {
    speed: vehicle.baseSpeed + u.speed * 25,
    armor: vehicle.baseArmor + u.armor * 35,
    handling: vehicle.baseHandling + u.handling * 30,
    acceleration,
    brakeStrength: acceleration * 2.2,
    bumperDamage: 50 + u.armor * 10,
  };
  return { vehicle, stats, weapon };
}

export function createWorld(width: number, height: number, p: Progress): World {
  const { stats } = deriveStats(p);
  return {
    width,
    height,
    carX: width / 2,
    carY: height / 2,
    heading: 0,
    forwardV: 0,
    brakeHoldTimer: 0,
    carVx: 0,
    carVy: 0,
    steeringAngle: 0,
    scroll: 0,
    speed: 0,
    zombies: [],
    projectiles: [],
    bloodSpots: [],
    hp: stats.armor,
    maxHp: stats.armor,
    kills: 0,
    wave: 0,
    spawnTimer: 1.0,
    fireTimer: 0,
    abilityCooldown: 0,
    abilityActive: 0,
    invuln: 0,
    nextEntityId: 1,
    shake: 0,
    gameOver: false,
    nextBossKills: 200,
    streak: 0,
    bestStreak: 0,
    streakIdleTimer: 0,
    streakBannerKind: null,
    streakBannerAt: 0,
    momentum: 0,
  };
}

export interface UpdateInput {
  /** -1..1 — turn input from steering wheel (negative = left). */
  wheel: number;
  throttle: boolean;
  brake: boolean;
  fire: boolean;
  triggerAbility: boolean;
}

export function step(world: World, dt: number, input: UpdateInput, p: Progress): void {
  if (world.gameOver) return;
  const { vehicle, stats, weapon } = deriveStats(p);
  const sideMod = SIDE_MODS[p.selectedSideMod];

  world.wave = Math.floor(world.kills / 25);

  if (world.abilityActive > 0) world.abilityActive = Math.max(0, world.abilityActive - dt * 1000);
  if (world.abilityCooldown > 0) world.abilityCooldown = Math.max(0, world.abilityCooldown - dt * 1000);
  if (world.invuln > 0) world.invuln = Math.max(0, world.invuln - dt * 1000);
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 60);

  // Streak times out after 3s of no kill.
  if (world.streak > 0) {
    world.streakIdleTimer += dt;
    if (world.streakIdleTimer > 3.0) world.streak = 0;
  }

  if (input.triggerAbility && world.abilityCooldown <= 0 && p.selectedAbility !== 'none') {
    const a = ABILITIES[p.selectedAbility];
    world.abilityActive = a.durationMs;
    world.abilityCooldown = a.cooldownMs;
    if (p.selectedAbility === 'emp') {
      for (const z of world.zombies) {
        if (z.kind === 'boss') {
          z.hp -= 200;
        } else if (z.maxHp <= 60) {
          z.hp = 0;
        } else {
          z.vy *= 0.2;
        }
      }
      world.shake = 14;
    }
    if (p.selectedAbility === 'shield') world.invuln = a.durationMs;
  }

  const isNitro = world.abilityActive > 0 && p.selectedAbility === 'nitro';
  const nitroMul = isNitro ? 1.8 : 1;
  const isShielded = world.invuln > 0 && p.selectedAbility === 'shield' && world.abilityActive > 0;

  const maxSpeed = stats.speed * nitroMul;
  const maxReverseSpeed = stats.speed * 0.5;
  const REVERSE_HOLD_SECONDS = 0.5;

  // Simcade car model. Velocity has lateral momentum (vR), but tire grip is
  // strong: lat decays fast so the body realigns with heading. Steering input
  // is smoothed (wheel inertia). Acceleration tapers near top speed (torque
  // curve). Steering response is responsive at low speed and progressively
  // duller at high speed, so you can't zigzag at full throttle.
  const sinH = Math.sin(world.heading);
  const cosH = Math.cos(world.heading);
  const fwdX = sinH;
  const fwdY = -cosH;
  const rightX = cosH;
  const rightY = sinH;

  let vF = world.carVx * fwdX + world.carVy * fwdY;
  let vR = world.carVx * rightX + world.carVy * rightY;

  // Throttle / brake / coast on forward component.
  if (input.brake) {
    if (vF > 0) {
      vF = Math.max(0, vF - stats.brakeStrength * dt);
      if (vF === 0) world.brakeHoldTimer = 0;
    } else if (vF === 0) {
      world.brakeHoldTimer += dt;
      if (world.brakeHoldTimer >= REVERSE_HOLD_SECONDS) {
        vF = -stats.acceleration * dt;
      }
    } else {
      vF = Math.max(-maxReverseSpeed, vF - stats.acceleration * dt);
    }
  } else if (input.throttle) {
    // Torque curve: full thrust at low speed, tapering to ~30% at top so
    // launches feel strong and top speed takes effort.
    const speedFrac = Math.min(1, Math.abs(vF) / Math.max(1, maxSpeed));
    const torqueFactor = 1 - 0.7 * speedFrac;
    vF = Math.min(maxSpeed, vF + stats.acceleration * nitroMul * torqueFactor * dt);
    world.brakeHoldTimer = 0;
  } else {
    vF *= Math.pow(0.5, dt / 1.5);
    if (Math.abs(vF) < 1) vF = 0;
    world.brakeHoldTimer = 0;
  }

  // Tire grip on lateral velocity. Strong but not absolute: ~2% remains/sec,
  // so a hard turn at speed leaves a brief sense of weight before realigning.
  vR *= Math.pow(0.02, dt);

  // Smooth the wheel input toward the raw stick value to model wheel inertia.
  // ~85% closure per second feels responsive without twitching.
  const steerLerp = 1 - Math.pow(0.15, dt);
  world.steeringAngle += (input.wheel - world.steeringAngle) * steerLerp;

  // Speed-sensitive steering: full response below ~25% of max speed, then
  // tapers down to ~30% at top speed. Below crawl speed, response ramps up
  // from 0 so the car can't pivot in place.
  const absVF = Math.abs(vF);
  const speedNorm = Math.min(1, absVF / Math.max(1, stats.speed));
  let speedSteer: number;
  if (speedNorm < 0.05) {
    speedSteer = speedNorm / 0.05;
  } else if (speedNorm < 0.25) {
    speedSteer = 1;
  } else {
    speedSteer = 1 - ((speedNorm - 0.25) / 0.75) * 0.7;
  }
  // Flip steering when reversing so wheel-right always sends the car right.
  const steerSign = vF >= 0 ? 1 : -1;
  const turnRate = world.steeringAngle * steerSign * (stats.handling / 150) * speedSteer;
  world.heading += turnRate * dt;

  // Recompose velocity from new heading + (vF, vR).
  const newSinH = Math.sin(world.heading);
  const newCosH = Math.cos(world.heading);
  world.carVx = vF * newSinH + vR * newCosH;
  world.carVy = vF * -newCosH + vR * newSinH;
  world.forwardV = vF;
  world.carX += world.carVx * dt;
  world.carY += world.carVy * dt;

  world.speed = world.forwardV;
  // Smooth normalized momentum 0..1 for HUD readout (keeps bar from jittering).
  const speedNow = Math.hypot(world.carVx, world.carVy);
  const targetMomentum = Math.min(1, speedNow / Math.max(1, stats.speed));
  const mLerp = 1 - Math.pow(0.1, dt);
  world.momentum += (targetMomentum - world.momentum) * mLerp;
  const bumperBonus = isNitro ? 2 : 1;

  world.spawnTimer -= dt;
  const spawnEvery = Math.max(0.08, 1.2 - world.wave * 0.05);
  while (world.spawnTimer <= 0) { spawnZombie(world, false); world.spawnTimer += spawnEvery; }
  if (world.wave >= 8 && world.kills >= world.nextBossKills) {
    spawnZombie(world, true);
    world.nextBossKills += 200 + world.wave * 30;
  }

  for (const z of world.zombies) {
    z.y += z.vy * dt;
    z.x += z.vx * dt;
    const chasePull = z.kind === 'boss' ? 12 : 40;
    const dx = world.carX - z.x;
    const dy = world.carY - z.y;
    z.x += Math.sign(dx) * Math.min(Math.abs(dx), chasePull * dt);
    z.y += Math.sign(dy) * Math.min(Math.abs(dy), chasePull * dt);
  }

  if (weapon.id !== 'none' && input.fire) {
    world.fireTimer -= dt * 1000;
    while (world.fireTimer <= 0) {
      fireWeapon(world, weapon, vehicle);
      world.fireTimer += weapon.fireRateMs;
    }
  } else if (world.fireTimer < 0) {
    world.fireTimer = 0;
  }

  for (const pr of world.projectiles) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
  }

  for (const b of world.bloodSpots) {
    b.alpha -= dt * 0.15;
  }

  const carBox = {
    x1: world.carX - vehicle.width / 2,
    x2: world.carX + vehicle.width / 2,
    y1: world.carY - vehicle.height / 2,
    y2: world.carY + vehicle.height / 2,
  };
  const sideBoxL = sideMod.reach > 0 && {
    x1: carBox.x1 - sideMod.reach,
    x2: carBox.x1,
    y1: carBox.y1 + 10,
    y2: carBox.y2 - 10,
  };
  const sideBoxR = sideMod.reach > 0 && {
    x1: carBox.x2,
    x2: carBox.x2 + sideMod.reach,
    y1: carBox.y1 + 10,
    y2: carBox.y2 - 10,
  };

  // Decay per-zombie attack cooldowns (used for cluster damage).
  for (const z of world.zombies) {
    if (z.attackCooldown > 0) z.attackCooldown = Math.max(0, z.attackCooldown - dt);
  }

  const carSpeed = Math.hypot(world.carVx, world.carVy);
  const isImpact = carSpeed >= KILL_SPEED;

  for (const z of world.zombies) {
    if (z.hp <= 0) continue;
    const def = ZOMBIE_DEFS[z.kind];

    if (z.x + z.size > carBox.x1 && z.x - z.size < carBox.x2 && z.y + z.size > carBox.y1 && z.y - z.size < carBox.y2) {
      if (isImpact) {
        // Real ram: damage scales with impact speed; zombie gets knockback impulse.
        const speedScale = Math.max(1, Math.min(2, carSpeed / Math.max(1, stats.speed * 0.4)));
        z.hp -= stats.bumperDamage * bumperBonus * speedScale;
        const inv = 1 / Math.max(1, carSpeed);
        const kb = 80 + speedScale * 40;
        z.vx += (world.carVx * inv) * kb;
        z.vy += (world.carVy * inv) * kb;
        if (z.hp <= 0) {
          world.shake = Math.min(24, world.shake + 2 + speedScale);
          registerKill(world, z);
        }
        if (!isShielded && world.invuln <= 0) {
          world.hp -= def.contactDamage * 0.4;
          world.invuln = 120;
        }
      } else {
        // Slow / stalled: zombie does NOT die. Pushes the car (drag) and damages it.
        world.carVx *= Math.pow(0.4, dt);
        world.carVy *= Math.pow(0.4, dt);
        if (z.attackCooldown <= 0) {
          if (!isShielded) world.hp -= def.contactDamage * 0.6;
          z.attackCooldown = 0.5;
          world.shake = Math.min(20, world.shake + 0.6);
        }
        world.streak = 0;
      }
      continue;
    }

    if (sideBoxL && hits(z, sideBoxL)) {
      z.hp -= sideMod.damage;
      if (z.hp <= 0) registerKill(world, z);
      continue;
    }
    if (sideBoxR && hits(z, sideBoxR)) {
      z.hp -= sideMod.damage;
      if (z.hp <= 0) registerKill(world, z);
    }
  }

  for (const pr of world.projectiles) {
    if (pr.life <= 0) continue;
    for (const z of world.zombies) {
      if (z.hp <= 0) continue;
      const dx = pr.x - z.x;
      const dy = pr.y - z.y;
      if (dx * dx + dy * dy < (z.size + 4) * (z.size + 4)) {
        z.hp -= pr.damage;
        if (pr.kind !== 'laser') pr.life = -1;
        if (z.hp <= 0) registerKill(world, z);
        if (pr.kind !== 'laser') break;
      }
    }
  }

  const despawnSq = 1400 * 1400;
  world.zombies = world.zombies.filter((z) => {
    if (z.hp <= 0) return false;
    const ddx = z.x - world.carX;
    const ddy = z.y - world.carY;
    return ddx * ddx + ddy * ddy < despawnSq;
  });
  world.projectiles = world.projectiles.filter((p) => p.life > 0);
  world.bloodSpots = world.bloodSpots.filter((b) => b.alpha > 0);

  if (world.hp <= 0) { world.hp = 0; world.gameOver = true; }
}

function hits(z: Zombie, box: { x1: number; x2: number; y1: number; y2: number }): boolean {
  return z.x + z.size > box.x1 && z.x - z.size < box.x2 && z.y + z.size > box.y1 && z.y - z.size < box.y2;
}

function registerKill(world: World, z: Zombie): void {
  world.kills += 1;
  world.streak += 1;
  if (world.streak > world.bestStreak) world.bestStreak = world.streak;
  world.streakIdleTimer = 0;
  spawnBlood(world, z);
  if (world.streak >= 10) world.hp = Math.min(world.maxHp, world.hp + 0.3);
  const prev = world.streak - 1;
  let banner: StreakBannerKind = null;
  if (prev < 100 && world.streak >= 100) banner = 'apocalypse';
  else if (prev < 50 && world.streak >= 50) banner = 'breaker';
  else if (prev < 25 && world.streak >= 25) banner = 'reaper';
  else if (prev < 10 && world.streak >= 10) banner = 'spree';
  if (banner) {
    world.streakBannerKind = banner;
    world.streakBannerAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
}

function spawnBlood(world: World, z: Zombie): void {
  const count = z.kind === 'boss' ? 6 : z.kind === 'brute' ? 3 : 2;
  for (let i = 0; i < count; i++) {
    world.bloodSpots.push({
      id: world.nextEntityId++,
      x: z.x + (Math.random() - 0.5) * z.size,
      y: z.y + (Math.random() - 0.5) * z.size,
      size: z.size * (0.5 + Math.random() * 0.6),
      alpha: 0.85,
    });
  }
}

const SPAWN_RING_RADIUS = 750;

function spawnZombie(world: World, forceBoss: boolean): void {
  const kind = forceBoss ? 'boss' : pickZombieKind(world.wave);
  const def = ZOMBIE_DEFS[kind];
  const angle = Math.random() * Math.PI * 2;
  const x = world.carX + Math.cos(angle) * SPAWN_RING_RADIUS;
  const y = world.carY + Math.sin(angle) * SPAWN_RING_RADIUS;
  const dx = world.carX - x;
  const dy = world.carY - y;
  const dist = Math.hypot(dx, dy) || 1;
  const vx = (dx / dist) * def.speed * 0.5;
  const vy = (dy / dist) * def.speed * 0.5;
  const hp = def.hp + world.wave * (kind === 'boss' ? 40 : 4);
  const z: Zombie = { id: world.nextEntityId++, x, y, vx, vy, hp, maxHp: hp, kind, size: def.size, attackCooldown: 0 };
  world.zombies.push(z);
}

function fireWeapon(world: World, weapon: Weapon, vehicle: Vehicle): void {
  const fwdX = Math.sin(world.heading);
  const fwdY = -Math.cos(world.heading);
  const muzzleDist = vehicle.height / 2 + 4;
  const ox = world.carX + fwdX * muzzleDist;
  const oy = world.carY + fwdY * muzzleDist;
  switch (weapon.id) {
    case 'mg':
      world.projectiles.push(makeProj(world, 'mg', ox, oy, fwdX * 700, fwdY * 700, weapon.damage, 1.2));
      break;
    case 'flame':
      for (let i = -1; i <= 1; i++) {
        const angle = world.heading + i * 0.25;
        const sx = Math.sin(angle), sy = -Math.cos(angle);
        world.projectiles.push(makeProj(world, 'flame', ox, oy, sx * 380, sy * 380, weapon.damage, 0.45));
      }
      break;
    case 'rockets': {
      const sideX = Math.cos(world.heading);
      const sideY = Math.sin(world.heading);
      world.projectiles.push(makeProj(world, 'rocket', ox - sideX * 12, oy - sideY * 12, fwdX * 520, fwdY * 520, weapon.damage, 1.5));
      world.projectiles.push(makeProj(world, 'rocket', ox + sideX * 12, oy + sideY * 12, fwdX * 520, fwdY * 520, weapon.damage, 1.5));
      world.shake = Math.min(20, world.shake + 5);
      break;
    }
    case 'laser':
      world.projectiles.push(makeProj(world, 'laser', ox, oy, fwdX * 1400, fwdY * 1400, weapon.damage, 0.4));
      break;
  }
}

function makeProj(world: World, kind: ProjectileKind, x: number, y: number, vx: number, vy: number, damage: number, life: number): Projectile {
  return { id: world.nextEntityId++, x, y, vx, vy, hp: 1, damage, life, kind };
}
