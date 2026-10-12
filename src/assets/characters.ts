// Zombie character variants. The Kenney source models live in assets-source/characters/ and are baked at build
// time into src/assets/baked/zombieModels.json by tools/bake-characters.ts (so nothing here is bundled or parsed
// at runtime).

export const CHARACTER_IDS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export function zombieVariantIndex(zombieId: number): number {
  return zombieId % CHARACTER_IDS.length;
}

export function pickCharacterIdForZombie(zombieId: number): CharacterId {
  return CHARACTER_IDS[zombieVariantIndex(zombieId)];
}
