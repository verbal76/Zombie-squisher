import { SideMod, SideModId } from '../types';

export const SIDE_MODS: Record<SideModId, SideMod> = {
  none: {
    id: 'none',
    name: 'No Side Mod',
    unlockKills: 0,
    damage: 0,
    reach: 0,
    description: 'Stock vehicle. Squish with the bumper.',
  },
  swords: {
    id: 'swords',
    name: 'Mounted Swords',
    unlockKills: 750,
    damage: 80,
    reach: 22,
    description: 'Twin blades on the doors. Slice anything that brushes the sides.',
  },
  grinders: {
    id: 'grinders',
    name: 'Bone Grinders',
    unlockKills: 4000,
    damage: 200,
    reach: 30,
    description: 'Spinning serrated wheels. Clears whole sidewalks.',
  },
};

export const SIDE_MOD_LIST: SideMod[] = Object.values(SIDE_MODS);
