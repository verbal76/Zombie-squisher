export type VehicleId =
  | 'hatchback'
  | 'sedan'
  | 'coupe'
  | 'race'
  | 'pickup'
  | 'police'
  | 'ambulance'
  | 'taxi'
  | 'truck'
  | 'tank';
export type WeaponId = 'none' | 'mg' | 'flame' | 'rockets' | 'laser';
export type AbilityId = 'none' | 'nitro' | 'shield' | 'emp';
export type SideModId = 'none' | 'swords' | 'grinders';
export type ZombieKind = 'walker' | 'runner' | 'brute' | 'spitter' | 'boss';

export interface Vehicle {
  id: VehicleId;
  name: string;
  color: string;
  /** Placeholder string for the Kenney asset path you'll wire in later. */
  assetKey: string;
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

export interface SideMod {
  id: SideModId;
  name: string;
  unlockKills: number;
  damage: number;
  reach: number;
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
  unlockedSideMods: SideModId[];
  selectedVehicle: VehicleId;
  selectedWeapon: WeaponId;
  selectedAbility: AbilityId;
  selectedSideMod: SideModId;
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
  maxHp: number;
}

export type ProjectileKind = 'mg' | 'flame' | 'rocket' | 'laser';

export interface Projectile extends Entity {
  damage: number;
  life: number;
  kind: ProjectileKind;
}

export interface BloodSpot {
  id: number;
  x: number;
  y: number;
  size: number;
  alpha: number;
}
