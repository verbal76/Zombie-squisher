import AsyncStorage from '@react-native-async-storage/async-storage';
import { Progress, VehicleId, WeaponId, AbilityId, SideModId, UpgradeStats } from '../types';
import { VEHICLES, VEHICLE_LIST } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';

const KEY = 'zs:progress:v2';

const ZERO: UpgradeStats = { speed: 0, armor: 0, handling: 0, acceleration: 0 };

const allUpgrades: Record<VehicleId, UpgradeStats> = VEHICLE_LIST.reduce((acc, v) => {
  acc[v.id] = { ...ZERO };
  return acc;
}, {} as Record<VehicleId, UpgradeStats>);

export const DEFAULT_PROGRESS: Progress = {
  totalKills: 0,
  bestRunKills: 0,
  unlockedVehicles: ['hatchback'],
  unlockedWeapons: ['none'],
  unlockedAbilities: ['none'],
  unlockedSideMods: ['none'],
  selectedVehicle: 'hatchback',
  selectedWeapon: 'none',
  selectedAbility: 'none',
  selectedSideMod: 'none',
  upgrades: allUpgrades,
};

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT_PROGRESS);
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const merged: Progress = {
      ...DEFAULT_PROGRESS,
      ...parsed,
      upgrades: { ...DEFAULT_PROGRESS.upgrades, ...(parsed.upgrades ?? {}) },
    };
    if (!VEHICLES[merged.selectedVehicle]) merged.selectedVehicle = 'hatchback';
    return merged;
  } catch {
    return clone(DEFAULT_PROGRESS);
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
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
