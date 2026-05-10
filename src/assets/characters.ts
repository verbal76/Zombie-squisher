// Asset registry for the Kenney character GLBs (with zombified textures
// already baked in by `scripts/embed-zombie-textures.mjs`). Each entry maps
// to a `require()`d Expo asset module so Metro bundles the .glb at build time.
//
// Letters O and L are the pre-made green zombies; the rest had their peach
// or brown skin tones remapped to zombie green at build time.

export const CHARACTER_IDS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_MODULES: Record<CharacterId, number> = {
  a: require('../../assets/characters/embedded/charactera.glb'),
  b: require('../../assets/characters/embedded/characterb.glb'),
  c: require('../../assets/characters/embedded/characterc.glb'),
  d: require('../../assets/characters/embedded/characterd.glb'),
  e: require('../../assets/characters/embedded/charactere.glb'),
  f: require('../../assets/characters/embedded/characterf.glb'),
  g: require('../../assets/characters/embedded/characterg.glb'),
  i: require('../../assets/characters/embedded/characteri.glb'),
  j: require('../../assets/characters/embedded/characterj.glb'),
  k: require('../../assets/characters/embedded/characterk.glb'),
  l: require('../../assets/characters/embedded/characterl.glb'),
  m: require('../../assets/characters/embedded/characterm.glb'),
  n: require('../../assets/characters/embedded/charactern.glb'),
  o: require('../../assets/characters/embedded/charactero.glb'),
  p: require('../../assets/characters/embedded/characterp.glb'),
  q: require('../../assets/characters/embedded/characterq.glb'),
  r: require('../../assets/characters/embedded/characterr.glb'),
};

// Pick a stable character variant from a zombie id. Spreads the variants
// roughly evenly across spawned zombies; runner / brute / spitter / boss
// can override this with a fixed pick if we want kind-specific looks.
export function pickCharacterIdForZombie(zombieId: number): CharacterId {
  return CHARACTER_IDS[zombieId % CHARACTER_IDS.length];
}
