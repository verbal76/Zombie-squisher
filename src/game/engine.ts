import { BloodSpot, Progress, Projectile, ProjectileKind, Vehicle, Weapon, Zombie } from '../types';
import { VEHICLES } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { ZOMBIE_DEFS, pickZombieKind } from '../data/zombies';

export type GearState = 'forward' | 'reverse' | 'neutral';

export interface World {
  width: number;
  height: number;
  carX: number;
  carY: number;
  heading: number;
  forwardV: number;
  brakeHoldTimer: number;
  carVx: number;
  carVy: number;
  steeringAngle: number;
  angularVelocity: number;
  lastGear: GearState;
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
  streak: number;
  bestStreak: number;
  streakIdleTimer: number;
  streakBannerKind: StreakBannerKind;
  streakBannerAt: number;
  momentum: number;
}

export type StreakBannerKind = 'spree' | 'reaper' | 'breaker' | 'apocalypse' | null;
export const KILL_SPEED = 50;

// Streak threshold at which zombies switch from chase mode to flee mode.
export const ZOMBIE_FLEE_STREAK = 10;

// Hard cap on active zombies. With the 100x spawn rate (per request) the
// world fills up fast; capping prevents unbounded growth that would tank
// performance. 500 lets the horde feel dense without crashing the render.
export const MAX_ACTIVE_ZOMBIES = 500;

// Each zombie struck by the front/rear bumper bleeds this fraction off
// the car's speed (cumulative across all zombies hit this tick). Plowing
// into a large horde can stall the car out -- per design request.
const PER_HIT_SLOW = 0.97;

export const TUNING = {
  ZOMBIE_MOVE_LERP_K: 3.0,
  SPAWN_RING_RADIUS: 750,
  SPAWN_MIN_DIST: 30,
  SPAWN_MAX_RETRIES: 4,
  ZOOM_CONSIDERATION_RADIUS: 1500,
  ZOOM_SIZE_THRESHOLD: 20,
  ZOOM_SIZE_AT_MIN: 36,
  ZOOM_BOSS_BONUS: 0.45,
  CAMERA_ZOOM_K: 1.5,
} as const;

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
    angularVelocity: 0,
    lastGear: 'forward',
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
  steerLeft: boolean;
  steerRight: boolean;
  gear: GearState;
  turbo: boolean;
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

  if (world.streak > 0) {
    world.streakIdleTimer += dt;
    if (world.streakIdleTimer > 3.0) world.streak = 0;
  }

  if (input.triggerAbility && world.abilityCooldown <= 0 && p.selectedAbility !== 'none') {
    const ability = ABILITIES[p.selectedAbility];
    world.abilityActive = ability.durationMs;
    world.abilityCooldown = ability.cooldownMs;

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

    if (p.selectedAbility === 'shield') {
      world.invuln = ability.durationMs;
    }
  }

  const isNitro = world.abilityActive > 0 && p.selectedAbility === 'nitro';
  const nitroMul = isNitro ? 1.8 : 1;
  const isShielded = world.invuln > 0 && p.selectedAbility === 'shield' && world.abilityActive > 0;

  const TURBO_MULTIPLIER = 1.5;
  const FORWARD_K = 2.5;
  const BRAKE_K   = 8.0;
  const LAT_GRIP_STRAIGHT = 6.0;
  const LAT_GRIP_TURN     = 2.5;
  const COAST_DAMP        = 0.5;
  const SKID_INJECTION    = 35;

  const turboMul = input.turbo ? TURBO_MULTIPLIER : 1;
  const maxSpeed = stats.speed * nitroMul * turboMul;
  const maxReverseSpeed = stats.speed * 0.4 * turboMul;

  const rawSteer = (input.steerLeft ? -1 : 0) + (input.steerRight ? 1 : 0);

  const steerLerp = 1 - Math.pow(0.04, dt);
  world.steeringAngle += (rawSteer - world.steeringAngle) * steerLerp;

  const speedMag = Math.hypot(world.carVx, world.carVy);
  const speedRatio = Math.min(1, speedMag / Math.max(1, stats.speed));
  const speedTurnFactor = Math.min(1, speedMag / 70);
  const lowSpeedTurnBoost = 0.25;
  const turnAuthority = lowSpeedTurnBoost + (1 - lowSpeedTurnBoost) * speedTurnFactor;
  const handlingFactor = Math.max(0.75, Math.min(1.35, stats.handling / 280));
  const highSpeedLimit = 1 - 0.45 * speedRatio;
  const baseTurn = 2.75 * handlingFactor * highSpeedLimit;
  const maxTurnNow = baseTurn * turnAuthority;
  const omegaForFrame = rawSteer * maxTurnNow;

  world.heading += omegaForFrame * dt;
  world.angularVelocity = omegaForFrame;

  const sinH = Math.sin(world.heading);
  const cosH = Math.cos(world.heading);
  const fX = sinH;
  const fY = -cosH;
  const rX = cosH;
  const rY = sinH;
  let vFwd = world.carVx * fX + world.carVy * fY;
  let vLat = world.carVx * rX + world.carVy * rY;

  if (input.gear !== world.lastGear) {
    const movingFast = Math.abs(vFwd) > 50;
    const flipped =
      (input.gear === 'forward' && vFwd < -5) ||
      (input.gear === 'reverse' && vFwd > 5);
    if (movingFast && flipped) {
      const skidDir = rawSteer !== 0 ? rawSteer : (Math.random() < 0.5 ? -1 : 1);
      vLat += skidDir * SKID_INJECTION;
      world.shake = Math.max(world.shake, 3);
    }
    world.lastGear = input.gear;
  }

  let targetSpeed = 0;
  if (input.gear === 'forward') targetSpeed = maxSpeed;
  else if (input.gear === 'reverse') targetSpeed = -maxReverseSpeed;

  if (input.gear === 'neutral') {
    vFwd *= Math.max(0, 1 - COAST_DAMP * dt);
    if (Math.abs(vFwd) < 0.5) vFwd = 0;
  } else {
    const opposing = Math.sign(targetSpeed) !== Math.sign(vFwd) && Math.abs(vFwd) > 1;
    const lerpK = opposing ? BRAKE_K : FORWARD_K;
    vFwd = vFwd + (targetSpeed - vFwd) * (1 - Math.exp(-lerpK * dt));
  }

  const turningFactor = Math.min(1, Math.abs(rawSteer));
  const latK = LAT_GRIP_STRAIGHT - (LAT_GRIP_STRAIGHT - LAT_GRIP_TURN) * turningFactor;
  vLat = vLat + (0 - vLat) * (1 - Math.exp(-latK * dt));

  world.carVx = fX * vFwd + rX * vLat;
  world.carVy = fY * vFwd + rY * vLat;
  world.carX += world.carVx * dt;
  world.carY += world.carVy * dt;

  world.forwardV = vFwd;
  world.speed = world.forwardV;

  const speedNow = Math.hypot(world.carVx, world.carVy);
  const targetMomentum = Math.min(1, speedNow / Math.max(1, stats.speed));
  const momentumLerp = 1 - Math.pow(0.1, dt);
  world.momentum += (targetMomentum - world.momentum) * momentumLerp;

  const bumperBonus = isNitro ? 2 : 1;

  // === Spawn rate ===
  // Per request: 100x previous spawn rate. The previous formula gave
  // spawnEvery = max(0.08, 1.2 - wave*0.05). Now divided by 100 with
  // a slightly larger floor (0.008 s) so the loop stays bounded even
  // at high waves. The MAX_ACTIVE_ZOMBIES cap prevents unbounded
  // growth when the player can't kill them fast enough.
  world.spawnTimer -= dt;
  const spawnEvery = Math.max(0.008, (1.2 - world.wave * 0.05) / 100);

  while (world.spawnTimer <= 0) {
    if (world.zombies.length < MAX_ACTIVE_ZOMBIES) {
      spawnZombie(world, false);
    }
    world.spawnTimer += spawnEvery;
  }

  if (world.wave >= 8 && world.kills >= world.nextBossKills) {
    spawnZombie(world, true);
    world.nextBossKills += 200 + world.wave * 30;
  }

  const zombieMoveAlpha = 1 - Math.exp(-TUNING.ZOMBIE_MOVE_LERP_K * dt);

  for (const z of world.zombies) {
    const dx = world.carX - z.x;
    const dy = world.carY - z.y;
    const dst = Math.hypot(dx, dy) || 1;
    const def = ZOMBIE_DEFS[z.kind];
    const intent = intentFor(z, dst, world.streak);

    const targetVx = (dx / dst) * def.speed * intent;
    const targetVy = (dy / dst) * def.speed * intent;

    z.vx += (targetVx - z.vx) * zombieMoveAlpha;
    z.vy += (targetVy - z.vy) * zombieMoveAlpha;
    z.x += z.vx * dt;
    z.y += z.vy * dt;
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

  for (const z of world.zombies) {
    if (z.attackCooldown > 0) {
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
    }
  }

  const carSpeed = Math.hypot(world.carVx, world.carVy);
  const isImpact = carSpeed >= KILL_SPEED;

  for (const z of world.zombies) {
    if (z.hp <= 0) continue;

    const def = ZOMBIE_DEFS[z.kind];

    if (z.x + z.size > carBox.x1 && z.x - z.size < carBox.x2 && z.y + z.size > carBox.y1 && z.y - z.size < carBox.y2) {
      // Decide bumper hit vs side hit using the zombie's position in
      // car-local coordinates (fX/fY = car forward, rX/rY = car right).
      // A side hit damages the car even at impact speed -- only a direct
      // front/rear bumper contact at >= KILL_SPEED kills the zombie.
      const cdx = z.x - world.carX;
      const cdy = z.y - world.carY;
      const localFwd = cdx * fX + cdy * fY;
      const localLat = cdx * rX + cdy * rY;
      const isSideHit = Math.abs(localLat) > Math.abs(localFwd);
      const isBumperImpact = isImpact && !isSideHit;

      if (isBumperImpact) {
        const speedScale = Math.max(1, Math.min(2, carSpeed / Math.max(1, stats.speed * 0.4)));
        z.hp -= stats.bumperDamage * bumperBonus * speedScale;

        const inv = 1 / Math.max(1, carSpeed);
        const knockback = 80 + speedScale * 40;

        z.vx += (world.carVx * inv) * knockback;
        z.vy += (world.carVy * inv) * knockback;

        // Per-hit slowdown: every zombie struck bleeds momentum so a
        // dense horde can stall the car.
        world.forwardV *= PER_HIT_SLOW;
        world.carVx   *= PER_HIT_SLOW;
        world.carVy   *= PER_HIT_SLOW;

        if (z.hp <= 0) {
          world.shake = Math.min(24, world.shake + 2 + speedScale);
          registerKill(world, z);
        }

        if (!isShielded && world.invuln <= 0) {
          world.hp -= def.contactDamage * 0.4;
          world.invuln = 120;
        }
      } else {
        // Side hit (any speed) OR slow contact at the bumper. Either
        // way the car takes damage and bleeds speed; the zombie keeps
        // walking.
        world.carVx *= Math.pow(0.4, dt);
        world.carVy *= Math.pow(0.4, dt);
        world.forwardV *= Math.pow(0.4, dt);

        if (z.attackCooldown <= 0) {
          if (!isShielded) {
            world.hp -= def.contactDamage * 0.6;
          }

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

        if (pr.kind !== 'laser') {
          pr.life = -1;
        }

        if (z.hp <= 0) {
          registerKill(world, z);
        }

        if (pr.kind !== 'laser') break;
      }
    }
  }

  const despawnSq = 1400 * 1400;

  world.zombies = world.zombies.filter((z) => {
    if (z.hp <= 0) return false;

    const dx = z.x - world.carX;
    const dy = z.y - world.carY;

    return dx * dx + dy * dy < despawnSq;
  });

  world.projectiles = world.projectiles.filter((p) => p.life > 0);
  world.bloodSpots = world.bloodSpots.filter((b) => b.alpha > 0);

  if (world.hp <= 0) {
    world.hp = 0;
    world.gameOver = true;
  }
}

function hits(z: Zombie, box: { x1: number; x2: number; y1: number; y2: number }): boolean {
  return z.x + z.size > box.x1 && z.x - z.size < box.x2 && z.y + z.size > box.y1 && z.y - z.size < box.y2;
}

function registerKill(world: World, z: Zombie): void {
  world.kills += 1;
  world.streak += 1;

  if (world.streak > world.bestStreak) {
    world.bestStreak = world.streak;
  }

  world.streakIdleTimer = 0;
  spawnBlood(world, z);

  if (world.streak >= 10) {
    world.hp = Math.min(world.maxHp, world.hp + 0.3);
  }

  const prev = world.streak - 1;
  let banner: StreakBannerKind = null;

  if (prev < 100 && world.streak >= 100) banner = 'apocalypse';
  else if (prev < 50 && world.streak >= 50) banner = 'breaker';
  else if (prev < 25 && world.streak >= 25) banner = 'reaper';
  else if (prev < 10 && world.streak >= 10) banner = 'spree';

  if (banner) {
    world.streakBannerKind = banner;
    world.streakBannerAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
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

function intentFor(z: Zombie, dst: number, streak: number): number {
  if (streak >= ZOMBIE_FLEE_STREAK) {
    return -1.1;
  }
  switch (z.kind) {
    case 'runner':
      return 1.1;
    case 'brute':
      return 0.85;
    case 'boss':
      return 0.9;
    case 'spitter':
      return 1.0;
    case 'walker':
    default:
      return 1.0;
  }
}

function spawnZombie(world: World, forceBoss: boolean): void {
  const kind = forceBoss ? 'boss' : pickZombieKind(world.wave);
  const def = ZOMBIE_DEFS[kind];

  let x = 0;
  let y = 0;
  const minDistSq = TUNING.SPAWN_MIN_DIST * TUNING.SPAWN_MIN_DIST;

  for (let attempt = 0; attempt <= TUNING.SPAWN_MAX_RETRIES; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    x = world.carX + Math.cos(angle) * TUNING.SPAWN_RING_RADIUS;
    y = world.carY + Math.sin(angle) * TUNING.SPAWN_RING_RADIUS;

    let tooClose = false;

    for (const other of world.zombies) {
      const dx = x - other.x;
      const dy = y - other.y;

      if (dx * dx + dy * dy < minDistSq) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) break;
  }

  const dx = world.carX - x;
  const dy = world.carY - y;
  const dist = Math.hypot(dx, dy) || 1;

  const vx = (dx / dist) * def.speed * 0.5;
  const vy = (dy / dist) * def.speed * 0.5;
  const hp = def.hp + world.wave * (kind === 'boss' ? 40 : 4);

  const z: Zombie = {
    id: world.nextEntityId++,
    x,
    y,
    vx,
    vy,
    hp,
    maxHp: hp,
    kind,
    size: def.size,
    attackCooldown: 0,
  };

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
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);

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
  return {
    id: world.nextEntityId++,
    x,
    y,
    vx,
    vy,
    hp: 1,
    damage,
    life,
    kind,
  };
}
