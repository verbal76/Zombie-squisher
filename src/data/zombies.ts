import { ZombieKind } from '../types';

export interface ZombieDef {
  kind: ZombieKind;
  hp: number;
  speed: number;
  size: number;
  color: string;
  weight: number;
  minWave: number;
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
  },
  runner: {
    kind: 'runner',
    hp: 15,
    speed: 90,
    size: 12,
    color: '#c98a4a',
    weight: 25,
    minWave: 2,
  },
  brute: {
    kind: 'brute',
    hp: 120,
    speed: 25,
    size: 22,
    color: '#5a3a3a',
    weight: 8,
    minWave: 5,
  },
  spitter: {
    kind: 'spitter',
    hp: 35,
    speed: 50,
    size: 16,
    color: '#a55a9a',
    weight: 10,
    minWave: 8,
  },
};

export function pickZombieKind(wave: number, rand = Math.random): ZombieKind {
  const eligible = Object.values(ZOMBIE_DEFS).filter((d) => d.minWave <= wave);
  const total = eligible.reduce((s, d) => s + d.weight, 0);
  let r = rand() * total;
  for (const d of eligible) {
    r -= d.weight;
    if (r <= 0) return d.kind;
  }
  return 'walker';
}
