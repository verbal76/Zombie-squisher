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
    unlockKills: 100,
    fireRateMs: 110,
    damage: 25,
    description: 'Forward-firing MG. Steady stream of lead.',
  },
  flame: {
    id: 'flame',
    name: 'Flamethrower',
    unlockKills: 500,
    fireRateMs: 50,
    damage: 14,
    description: 'PLACEHOLDER ART. Short cone of fire that cooks crowds fast.',
  },
  rockets: {
    id: 'rockets',
    name: 'Roof Rockets',
    unlockKills: 1500,
    fireRateMs: 900,
    damage: 140,
    description: 'Splash damage. Clears the road.',
  },
  laser: {
    id: 'laser',
    name: 'Plasma Lance',
    unlockKills: 5000,
    fireRateMs: 250,
    damage: 90,
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
    unlockKills: 200,
    cooldownMs: 6000,
    durationMs: 1500,
    description: '2x speed and bumper damage.',
  },
  shield: {
    id: 'shield',
    name: 'Energy Shield',
    unlockKills: 1000,
    cooldownMs: 12000,
    durationMs: 3000,
    description: 'Ignore damage briefly.',
  },
  emp: {
    id: 'emp',
    name: 'EMP Pulse',
    unlockKills: 3000,
    cooldownMs: 15000,
    durationMs: 200,
    description: 'Stun every zombie on screen.',
  },
};

export const ABILITY_LIST: Ability[] = Object.values(ABILITIES);
