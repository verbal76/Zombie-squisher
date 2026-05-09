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
  carVx: number;
  carVy: number;
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
  /** Next kill threshold at which a miniboss spawns. */
  nextBossKills: number;
}

export interface DerivedStats {
  speed: number;
  armor: number;
  handling: number;
  bumperDamage: number;
}

export function deriveStats(p: Progress): { vehicle: Vehicle; stats: DerivedStats; weapon: Weapon } {
  const vehicle = VEHICLES[p.selectedVehicle];
  const weapon = WEAPONS[p.selectedWeapon];
  const u = p.upgrades[vehicle.id] ?? { speed: 0, armor: 0, handling: 0 };
  const stats: DerivedStats = {
    speed: vehicle.baseSpeed + u.speed * 25,
    armor: vehicle.baseArmor + u.armor * 35,
    handling: vehicle.baseHandling + u.handling * 30,
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
    carY: height - 140,
    carVx: 0,
    carVy: 0,
    scroll: 0,
    speed: stats.speed,
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
  };
}

export interface UpdateInput {
  steer: number;
  steerY: number;
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

  // Movement model: thumbstick is a 2D direction vector. The car only moves
  // when the player is holding GAS. BRAKE hard-zeroes velocity (no drift).
  // No auto-movement — release everything and the car coasts to a stop.
  if (input.brake) {
    world.carVx = 0;
    world.carVy = 0;
  } else {
    const driving = input.throttle;
    const targetVx = driving ? input.steer * stats.speed * nitroMul : 0;
    const targetVy = driving ? input.steerY * stats.speed * nitroMul : 0;
    const tween = driving ? 18 : 6;
    world.carVx += (targetVx - world.carVx) * Math.min(1, dt * tween);
    world.carVy += (targetVy - world.carVy) * Math.min(1, dt * tween);
  }
  world.carX += world.carVx * dt;
  world.carY += world.carVy * dt;
  const halfW = vehicle.width / 2;
  const halfH = vehicle.height / 2;
  if (world.carX < halfW + 10) {
    world.carX = halfW + 10;
    world.carVx = 0;
  }
  if (world.carX > world.width - halfW - 10) {
    world.carX = world.width - halfW - 10;
    world.carVx = 0;
  }
  if (world.carY < halfH + 60) {
    world.carY = halfH + 60;
    world.carVy = 0;
  }
  if (world.carY > world.height - halfH - 20) {
    world.carY = world.height - halfH - 20;
    world.carVy = 0;
  }

  world.speed = Math.hypot(world.carVx, world.carVy);
  world.scroll -= world.carVy * dt;
  const bumperBonus = isNitro ? 2 : 1;

  world.spawnTimer -= dt;
  const spawnEvery = Math.max(0.08, 1.2 - world.wave * 0.05);
  while (world.spawnTimer <= 0) {
    spawnZombie(world, false);
    world.spawnTimer += spawnEvery;
  }

  if (world.wave >= 8 && world.kills >= world.nextBossKills) {
    spawnZombie(world, true);
    world.nextBossKills += 200 + world.wave * 30;
  }

  // Move zombies — they chase the car in 2D (no more world auto-scroll).
  for (const z of world.zombies) {
    z.y += z.vy * dt;
    z.x += z.vx * dt;
    const chasePull = z.kind === 'boss' ? 12 : 40;
    const dx = world.carX - z.x;
    const dy = world.carY - z.y;
    z.x += Math.sign(dx) * Math.min(Math.abs(dx), chasePull * dt);
    z.y += Math.sign(dy) * Math.min(Math.abs(dy), chasePull * dt);
  }

  // Fire weapon — only while the player is holding the fire button.
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

  // Blood stays on the ground (no auto-scroll); just fade.
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
    if (z.hp <= 0) continue;
    const def = ZOMBIE_DEFS[z.kind];

    if (z.x + z.size > carBox.x1 && z.x - z.size < carBox.x2 && z.y + z.size > carBox.y1 && z.y - z.size < carBox.y2) {
      const dmg = stats.bumperDamage * bumperBonus;
      z.hp -= dmg;
      if (z.hp <= 0) {
        world.kills += 1;
        spawnBlood(world, z);
        world.shake = Math.min(20, world.shake + 2);
      }
      if (!isShielded && world.invuln <= 0) {
        world.hp -= def.contactDamage;
        world.invuln = 180;
      }
      continue;
    }

    if (sideBoxL && hits(z, sideBoxL)) {
      z.hp -= sideMod.damage;
      if (z.hp <= 0) {
        world.kills += 1;
        spawnBlood(world, z);
      }
      continue;
    }
    if (sideBoxR && hits(z, sideBoxR)) {
      z.hp -= sideMod.damage;
      if (z.hp <= 0) {
        world.kills += 1;
        spawnBlood(world, z);
      }
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
        if (z.hp <= 0) {
          world.kills += 1;
          spawnBlood(world, z);
        }
        if (pr.kind !== 'laser') break;
      }
    }
  }

  world.zombies = world.zombies.filter((z) => z.hp > 0 && z.y < world.height + 50 && z.x > -120 && z.x < world.width + 120);
  world.projectiles = world.projectiles.filter((p) => p.life > 0 && p.y > -40 && p.y < world.height + 40 && p.x > -40 && p.x < world.width + 40);
  world.bloodSpots = world.bloodSpots.filter((b) => b.alpha > 0 && b.y < world.height + 40);

  if (world.hp <= 0) {
    world.hp = 0;
    world.gameOver = true;
  }
}

function hits(z: Zombie, box: { x1: number; x2: number; y1: number; y2: number }): boolean {
  return z.x + z.size > box.x1 && z.x - z.size < box.x2 && z.y + z.size > box.y1 && z.y - z.size < box.y2;
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

function spawnZombie(world: World, forceBoss: boolean): void {
  const kind = forceBoss ? 'boss' : pickZombieKind(world.wave);
  const def = ZOMBIE_DEFS[kind];
  const sideChance = Math.min(0.45, 0.1 + world.wave * 0.025);
  const r = Math.random();
  let x: number;
  let y: number;
  let vx = 0;
  let vy = def.speed;
  if (forceBoss || r > sideChance * 2) {
    x = 30 + Math.random() * (world.width - 60);
    y = -20 - Math.random() * 40;
    vx = (Math.random() - 0.5) * 30;
  } else if (r > sideChance) {
    x = -20;
    y = 60 + Math.random() * (world.height * 0.55);
    vx = def.speed * 0.6;
    vy = def.speed * 0.4;
  } else {
    x = world.width + 20;
    y = 60 + Math.random() * (world.height * 0.55);
    vx = -def.speed * 0.6;
    vy = def.speed * 0.4;
  }
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
  };
  world.zombies.push(z);
}

function fireWeapon(world: World, weapon: Weapon, vehicle: Vehicle): void {
  const ox = world.carX;
  const oy = world.carY - vehicle.height / 2;
  switch (weapon.id) {
    case 'mg':
      world.projectiles.push(makeProj(world, 'mg', ox, oy, 0, -700, weapon.damage, 1.2));
      break;
    case 'flame':
      for (let i = -1; i <= 1; i++) {
        world.projectiles.push(makeProj(world, 'flame', ox, oy, i * 80, -380, weapon.damage, 0.45));
      }
      break;
    case 'rockets':
      world.projectiles.push(makeProj(world, 'rocket', ox - 12, oy, -20, -520, weapon.damage, 1.5));
      world.projectiles.push(makeProj(world, 'rocket', ox + 12, oy, 20, -520, weapon.damage, 1.5));
      world.shake = Math.min(20, world.shake + 5);
      break;
    case 'laser':
      world.projectiles.push(makeProj(world, 'laser', ox, oy, 0, -1400, weapon.damage, 0.4));
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
