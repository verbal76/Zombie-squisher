import { Progress, VehicleId, WeaponId, AbilityId, SideModId, UpgradeStats } from '../types';
import { VEHICLES, VEHICLE_LIST } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';

const ZERO: UpgradeStats = { speed: 0, armor: 0, handling: 0, acceleration: 0 };

const allUpgrades: Record<VehicleId, UpgradeStats> = VEHICLE_LIST.reduce((acc, v) => {
  acc[v.id] = { ...ZERO };
  return acc;
}, {} as Record<VehicleId, UpgradeStats>);

export const DEFAULT_PROGRESS: Progress = {
  totalKills: 0,
  bestRunKills: 0,
  unlockedVehicles: ['hatchback'],
  unlockedWeapons: ['none', 'mg'],
  unlockedAbilities: ['none'],
  unlockedSideMods: ['none'],
  selectedVehicle: 'hatchback',
  selectedWeapon: 'mg',
  selectedAbility: 'none',
  selectedSideMod: 'none',
  upgrades: allUpgrades,
};

/** Rebuilds a safe Progress from whatever was persisted (older versions, partial or corrupt data). */
export function sanitizeProgress(raw: unknown): Progress {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return clone(DEFAULT_PROGRESS);
  const parsed = raw as Partial<Progress>;

  const backfilledUpgrades: Record<VehicleId, UpgradeStats> = VEHICLE_LIST.reduce((acc, v) => {
    acc[v.id] = { ...ZERO, ...(parsed.upgrades?.[v.id] ?? {}) };
    return acc;
  }, {} as Record<VehicleId, UpgradeStats>);

  const merged: Progress = {
    ...DEFAULT_PROGRESS,
    ...parsed,
    upgrades: backfilledUpgrades,
  };

  if (!VEHICLES[merged.selectedVehicle]) merged.selectedVehicle = 'hatchback';
  if (!Array.isArray(merged.unlockedVehicles) || merged.unlockedVehicles.length === 0) {
    merged.unlockedVehicles = ['hatchback'];
  }
  if (!merged.unlockedVehicles.includes(merged.selectedVehicle)) merged.selectedVehicle = 'hatchback';
  if (!Array.isArray(merged.unlockedSideMods)) merged.unlockedSideMods = ['none'];
  if (!Array.isArray(merged.unlockedAbilities)) merged.unlockedAbilities = ['none'];
  if (!SIDE_MODS[merged.selectedSideMod]) merged.selectedSideMod = 'none';
  if (!ABILITIES[merged.selectedAbility]) merged.selectedAbility = 'none';
  if (!Number.isFinite(merged.totalKills) || merged.totalKills < 0) merged.totalKills = 0;
  if (!Number.isFinite(merged.bestRunKills) || merged.bestRunKills < 0) merged.bestRunKills = 0;

  const unlockedWeapons = new Set<WeaponId>(Array.isArray(merged.unlockedWeapons) ? merged.unlockedWeapons : []);
  unlockedWeapons.add('none');
  unlockedWeapons.add('mg');
  merged.unlockedWeapons = Array.from(unlockedWeapons);

  if (!WEAPONS[merged.selectedWeapon] || merged.selectedWeapon === 'none') merged.selectedWeapon = 'mg';

  return merged;
}

export function applyKills(p: Progress, kills: number): Progress {
  const totalKills = p.totalKills + kills;
  const bestRunKills = Math.max(p.bestRunKills, kills);

  const unlockedWeapons = new Set(p.unlockedWeapons);
  for (const w of Object.values(WEAPONS)) {
    if (totalKills >= w.unlockKills) unlockedWeapons.add(w.id as WeaponId);
  }

  const unlockedAbilities = new Set(p.unlockedAbilities);
  for (const a of Object.values(ABILITIES)) {
    if (totalKills >= a.unlockKills) unlockedAbilities.add(a.id as AbilityId);
  }

  const unlockedSideMods = new Set(p.unlockedSideMods);
  for (const s of Object.values(SIDE_MODS)) {
    if (totalKills >= s.unlockKills) unlockedSideMods.add(s.id as SideModId);
  }

  return {
    ...p,
    totalKills,
    bestRunKills,
    unlockedWeapons: Array.from(unlockedWeapons),
    unlockedAbilities: Array.from(unlockedAbilities),
    unlockedSideMods: Array.from(unlockedSideMods),
  };
}

export function buyVehicle(p: Progress, id: VehicleId): Progress | null {
  const v = VEHICLES[id];
  if (!v) return null;
  if (p.unlockedVehicles.includes(id)) return null;
  if (p.totalKills < v.killCost) return null;

  return {
    ...p,
    totalKills: p.totalKills - v.killCost,
    unlockedVehicles: [...p.unlockedVehicles, id],
    selectedVehicle: id,
  };
}

export const UPGRADE_COSTS = [100, 400, 1200, 3500, 10000];
export const MAX_UPGRADE = UPGRADE_COSTS.length;

export function upgradeCost(level: number): number | null {
  if (level >= MAX_UPGRADE) return null;
  return UPGRADE_COSTS[level];
}

export function buyUpgrade(p: Progress, id: VehicleId, stat: keyof UpgradeStats): Progress | null {
  const cur = p.upgrades[id]?.[stat] ?? 0;
  const cost = upgradeCost(cur);
  if (cost === null) return null;
  if (p.totalKills < cost) return null;

  return {
    ...p,
    totalKills: p.totalKills - cost,
    upgrades: {
      ...p.upgrades,
      [id]: { ...(p.upgrades[id] ?? ZERO), [stat]: cur + 1 },
    },
  };
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
