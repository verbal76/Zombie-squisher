import { ZombieKind } from '../types';

export interface ZombieDef {
  kind: ZombieKind;
  hp: number;
  speed: number;
  size: number;
  color: string;
  ringColor?: string;
  weight: number;
  minWave: number;
  contactDamage: number;
}

export const ZOMBIE_DEFS: Record<ZombieKind, ZombieDef> = {
  walker: {
    kind: 'walker',
    hp: 20,
    speed: 30,
    size: 14,
    color: '#7aa872',
    weight: 70,
    minWave: 0,
    contactDamage: 4,
  },
  runner: {
    kind: 'runner',
    hp: 15,
    speed: 90,
    size: 12,
    color: '#c98a4a',
    weight: 25,
    minWave: 2,
    contactDamage: 3,
  },
  brute: {
    kind: 'brute',
    hp: 140,
    speed: 25,
    size: 22,
    color: '#5a3a3a',
    weight: 8,
    minWave: 5,
    contactDamage: 12,
  },
  spitter: {
    kind: 'spitter',
    hp: 40,
    speed: 50,
    size: 16,
    color: '#a55a9a',
    weight: 10,
    minWave: 8,
    contactDamage: 8,
  },
  boss: {
    kind: 'boss',
    hp: 800,
    speed: 22,
    size: 36,
    color: '#5a1a3a',
    ringColor: '#ffd24a',
    weight: 0, // never randomly picked; spawned deterministically
    minWave: 8,
    contactDamage: 30,
  },
};

export function pickZombieKind(wave: number, rand = Math.random): ZombieKind {
  const eligible = Object.values(ZOMBIE_DEFS).filter((d) => d.minWave <= wave && d.weight > 0);
  const total = eligible.reduce((s, d) => s + d.weight, 0);
  let r = rand() * total;
  for (const d of eligible) {
    r -= d.weight;
    if (r <= 0) return d.kind;
  }
  return 'walker';
}
