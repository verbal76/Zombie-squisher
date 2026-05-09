import { Progress, Projectile, Vehicle, Weapon, Zombie } from '../types';
import { VEHICLES } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { ZOMBIE_DEFS, pickZombieKind } from '../data/zombies';

export interface World {
  width: number;
  height: number;
  carX: number;
  carY: number;
  carVx: number;
  scroll: number;
  speed: number;
  zombies: Zombie[];
  projectiles: Projectile[];
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
  const u = p.upgrades[vehicle.id];
  const stats: DerivedStats = {
    speed: vehicle.baseSpeed + u.speed * 25,
    armor: vehicle.baseArmor + u.armor * 30,
    handling: vehicle.baseHandling + u.handling * 30,
    bumperDamage: 50 + u.armor * 8,
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
    scroll: 0,
    speed: stats.speed,
    zombies: [],
    projectiles: [],
    hp: stats.armor,
    maxHp: stats.armor,
    kills: 0,
    wave: 0,
    spawnTimer: 0.4,
    fireTimer: 0,
    abilityCooldown: 0,
    abilityActive: 0,
    invuln: 0,
    nextEntityId: 1,
    shake: 0,
    gameOver: false,
  };
}

export interface UpdateInput {
  steer: number; // -1 left .. 1 right
  triggerAbility: boolean;
}

export function step(world: World, dt: number, input: UpdateInput, p: Progress): void {
  if (world.gameOver) return;
  const { vehicle, stats, weapon } = deriveStats(p);

  // Wave scaling
  world.wave = Math.floor(world.kills / 25);

  // Ability handling
  if (world.abilityActive > 0) world.abilityActive = Math.max(0, world.abilityActive - dt * 1000);
  if (world.abilityCooldown > 0) world.abilityCooldown = Math.max(0, world.abilityCooldown - dt * 1000);
  if (world.invuln > 0) world.invuln = Math.max(0, world.invuln - dt * 1000);
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 60);

  if (input.triggerAbility && world.abilityCooldown <= 0 && p.selectedAbility !== 'none') {
    const a = ABILITIES[p.selectedAbility];
    world.abilityActive = a.durationMs;
    world.abilityCooldown = a.cooldownMs;
    if (p.selectedAbility === 'emp') {
      // stun = kill weak zombies, slow strong ones
      for (const z of world.zombies) {
        if (z.hp <= 40) z.hp = 0;
        else z.vy *= 0.2;
      }
      world.shake = 12;
    }
    if (p.selectedAbility === 'shield') world.invuln = a.durationMs;
  }

  const isNitro = world.abilityActive > 0 && p.selectedAbility === 'nitro';
  const speedMul = isNitro ? 2 : 1;
  const bumperBonus = isNitro ? 2 : 1;
  const isShielded = world.invuln > 0;

  // Car movement (lateral)
  const targetVx = input.steer * stats.handling * speedMul;
  world.carVx += (targetVx - world.carVx) * Math.min(1, dt * 8);
  world.carX += world.carVx * dt;
  const halfW = vehicle.width / 2;
  if (world.carX < halfW + 10) {
    world.carX = halfW + 10;
    world.carVx = 0;
  }
  if (world.carX > world.width - halfW - 10) {
    world.carX = world.width - halfW - 10;
    world.carVx = 0;
  }

  // Scroll the world (forward speed)
  const fwd = stats.speed * speedMul;
  world.speed = fwd;
  world.scroll += fwd * dt;

  // Spawn zombies
  world.spawnTimer -= dt;
  const spawnEvery = Math.max(0.08, 0.6 - world.wave * 0.04);
  while (world.spawnTimer <= 0) {
    spawnZombie(world);
    world.spawnTimer += spawnEvery;
  }

  // Move zombies (relative to scrolling road; they appear to come toward car)
  for (const z of world.zombies) {
    z.y += (fwd + z.vy) * dt;
    z.x += z.vx * dt;
    // Drift toward player slightly
    const dx = world.carX - z.x;
    z.x += Math.sign(dx) * Math.min(Math.abs(dx), 20 * dt);
  }

  // Fire weapon
  if (weapon.id !== 'none') {
    world.fireTimer -= dt * 1000;
    while (world.fireTimer <= 0) {
      fireWeapon(world, weapon, vehicle);
      world.fireTimer += weapon.fireRateMs;
    }
  }

  // Move projectiles
  for (const pr of world.projectiles) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
  }

  // Collisions: car vs zombies
  const carBox = {
    x1: world.carX - vehicle.width / 2,
    x2: world.carX + vehicle.width / 2,
    y1: world.carY - vehicle.height / 2,
    y2: world.carY + vehicle.height / 2,
  };

  for (const z of world.zombies) {
    if (z.hp <= 0) continue;
    if (z.x + z.size < carBox.x1 || z.x - z.size > carBox.x2) continue;
    if (z.y + z.size < carBox.y1 || z.y - z.size > carBox.y2) continue;
    // squish
    const dmg = stats.bumperDamage * bumperBonus;
    z.hp -= dmg;
    if (z.hp <= 0) {
      world.kills += 1;
      world.shake = Math.min(20, world.shake + 3);
    } else if (!isShielded) {
      // some damage to car for surviving brutes
      world.hp -= 4;
      world.invuln = 200;
    }
  }

  // Projectile vs zombies
  for (const pr of world.projectiles) {
    if (pr.life <= 0) continue;
    for (const z of world.zombies) {
      if (z.hp <= 0) continue;
      const dx = pr.x - z.x;
      const dy = pr.y - z.y;
      if (dx * dx + dy * dy < (z.size + 4) * (z.size + 4)) {
        z.hp -= pr.damage;
        pr.life = -1;
        if (z.hp <= 0) world.kills += 1;
        break;
      }
    }
  }

  // Zombies past the car damage you (you didn't squish them, they ran past you and hit your sides)
  for (const z of world.zombies) {
    if (z.hp <= 0) continue;
    if (z.y > world.height + 30) {
      // off screen behind, no penalty
    }
  }

  // Cleanup
  world.zombies = world.zombies.filter((z) => z.hp > 0 && z.y < world.height + 50);
  world.projectiles = world.projectiles.filter((p) => p.life > 0 && p.y > -20 && p.y < world.height + 20);

  if (world.hp <= 0) {
    world.hp = 0;
    world.gameOver = true;
  }
}

function spawnZombie(world: World): void {
  const kind = pickZombieKind(world.wave);
  const def = ZOMBIE_DEFS[kind];
  const x = 30 + Math.random() * (world.width - 60);
  const z: Zombie = {
    id: world.nextEntityId++,
    x,
    y: -20 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 30,
    vy: def.speed, // adds to scroll: faster zombies close the gap quicker
    hp: def.hp + world.wave * 4,
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
      world.projectiles.push(makeProj(world, ox, oy, 0, -700, weapon.damage, 1.2));
      break;
    case 'flame':
      for (let i = -1; i <= 1; i++) {
        world.projectiles.push(makeProj(world, ox, oy, i * 80, -400, weapon.damage, 0.4));
      }
      break;
    case 'rockets':
      world.projectiles.push(makeProj(world, ox - 12, oy, -20, -500, weapon.damage, 1.5));
      world.projectiles.push(makeProj(world, ox + 12, oy, 20, -500, weapon.damage, 1.5));
      world.shake = Math.min(20, world.shake + 5);
      break;
    case 'laser':
      world.projectiles.push(makeProj(world, ox, oy, 0, -1400, weapon.damage, 0.5));
      break;
  }
}

function makeProj(world: World, x: number, y: number, vx: number, vy: number, damage: number, life: number): Projectile {
  return {
    id: world.nextEntityId++,
    x,
    y,
    vx,
    vy,
    hp: 1,
    damage,
    life,
  };
}
