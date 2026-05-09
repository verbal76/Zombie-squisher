import { Weapon, WeaponId, Ability, AbilityId } from '../types';

export const WEAPONS: Record<WeaponId, Weapon> = {
  none: {
    id: 'none',
    name: 'No Weapon',
    unlockKills: 0,
    fireRateMs: 0,
    damage: 0,
    description: 'Just the bumper. Squish at will.',
  },
  mg: {
    id: 'mg',
    name: 'Hood Machine Gun',
    unlockKills: 50,
    fireRateMs: 110,
    damage: 25,
    description: 'Forward-firing MG. Steady stream of lead.',
  },
  flame: {
    id: 'flame',
    name: 'Flamethrower',
    unlockKills: 250,
    fireRateMs: 60,
    damage: 12,
    description: 'Short-range cone. Cooks crowds fast.',
  },
  rockets: {
    id: 'rockets',
    name: 'Roof Rockets',
    unlockKills: 750,
    fireRateMs: 900,
    damage: 120,
    description: 'Splash damage. Clears the road.',
  },
  laser: {
    id: 'laser',
    name: 'Plasma Lance',
    unlockKills: 2500,
    fireRateMs: 250,
    damage: 80,
    description: 'Punches through whole rows.',
  },
};

export const WEAPON_LIST: Weapon[] = Object.values(WEAPONS);

export const ABILITIES: Record<AbilityId, Ability> = {
  none: {
    id: 'none',
    name: 'No Ability',
    unlockKills: 0,
    cooldownMs: 0,
    durationMs: 0,
    description: 'Pure driving skill.',
  },
  nitro: {
    id: 'nitro',
    name: 'Nitro Boost',
    unlockKills: 100,
    cooldownMs: 6000,
    durationMs: 1500,
    description: '2x speed and bumper damage.',
  },
  shield: {
    id: 'shield',
    name: 'Energy Shield',
    unlockKills: 500,
    cooldownMs: 12000,
    durationMs: 3000,
    description: 'Ignore damage briefly.',
  },
  emp: {
    id: 'emp',
    name: 'EMP Pulse',
    unlockKills: 1500,
    cooldownMs: 15000,
    durationMs: 200,
    description: 'Stun every zombie on screen.',
  },
};

export const ABILITY_LIST: Ability[] = Object.values(ABILITIES);
