export type VehicleId = 'hatchback' | 'pickup' | 'muscle' | 'tank' | 'apc';
export type WeaponId = 'none' | 'mg' | 'flame' | 'rockets' | 'laser';
export type AbilityId = 'none' | 'nitro' | 'shield' | 'emp';
export type ZombieKind = 'walker' | 'runner' | 'brute' | 'spitter';

export interface Vehicle {
  id: VehicleId;
  name: string;
  color: string;
  baseSpeed: number;
  baseArmor: number;
  baseHandling: number;
  killCost: number;
  width: number;
  height: number;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  unlockKills: number;
  fireRateMs: number;
  damage: number;
  description: string;
}

export interface Ability {
  id: AbilityId;
  name: string;
  unlockKills: number;
  cooldownMs: number;
  durationMs: number;
  description: string;
}

export interface UpgradeStats {
  speed: number;
  armor: number;
  handling: number;
}

export interface Progress {
  totalKills: number;
  bestRunKills: number;
  unlockedVehicles: VehicleId[];
  unlockedWeapons: WeaponId[];
  unlockedAbilities: AbilityId[];
  selectedVehicle: VehicleId;
  selectedWeapon: WeaponId;
  selectedAbility: AbilityId;
  upgrades: Record<VehicleId, UpgradeStats>;
}

export interface Entity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
}

export interface Zombie extends Entity {
  kind: ZombieKind;
  size: number;
}

export interface Projectile extends Entity {
  damage: number;
  life: number;
}
