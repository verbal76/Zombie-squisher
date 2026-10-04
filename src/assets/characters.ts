// Asset registry for the Kenney character GLBs that ship as real binaries
// in the repo at assets/character-{letter}.glb (uploaded via the GitHub web
// UI, not embedded as base64). Metro picks them up because metro.config.js
// adds 'glb' to resolver.assetExts.
//
// The GLBs reference their textures by relative URI (Textures/texture-X.png)
// which won't resolve at runtime; loadCharacter() strips the URIs before
// parsing and attaches the texture manually from CHARACTER_TEX.
//
// Letters O and L are the pre-made green zombies. The others render with
// their original Kenney textures for now (a runtime or build-time recolor
// pass to zombify their skin can come in a later slice).

export const CHARACTER_IDS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_GLB: Record<CharacterId, number> = {
  a: require('../../assets/character-a.glb'),
  b: require('../../assets/character-b.glb'),
  c: require('../../assets/character-c.glb'),
  d: require('../../assets/character-d.glb'),
  e: require('../../assets/character-e.glb'),
  f: require('../../assets/character-f.glb'),
  g: require('../../assets/character-g.glb'),
  h: require('../../assets/character-h.glb'),
  i: require('../../assets/character-i.glb'),
  j: require('../../assets/character-j.glb'),
  k: require('../../assets/character-k.glb'),
  l: require('../../assets/character-l.glb'),
  m: require('../../assets/character-m.glb'),
  n: require('../../assets/character-n.glb'),
  o: require('../../assets/character-o.glb'),
  p: require('../../assets/character-p.glb'),
  q: require('../../assets/character-q.glb'),
  r: require('../../assets/character-r.glb'),
};

export const CHARACTER_TEX: Record<CharacterId, number> = {
  a: require('../../assets/texture-a.png'),
  b: require('../../assets/texture-b.png'),
  c: require('../../assets/texture-c.png'),
  d: require('../../assets/texture-d.png'),
  e: require('../../assets/texture-e.png'),
  f: require('../../assets/texture-f.png'),
  g: require('../../assets/texture-g.png'),
  h: require('../../assets/texture-h.png'),
  i: require('../../assets/texture-i.png'),
  j: require('../../assets/texture-j.png'),
  k: require('../../assets/texture-k.png'),
  l: require('../../assets/texture-l.png'),
  m: require('../../assets/texture-m.png'),
  n: require('../../assets/texture-n.png'),
  o: require('../../assets/texture-o.png'),
  p: require('../../assets/texture-p.png'),
  q: require('../../assets/texture-q.png'),
  r: require('../../assets/texture-r.png'),
};

// Pick a stable character variant from a zombie id.
export function pickCharacterIdForZombie(zombieId: number): CharacterId {
  return CHARACTER_IDS[zombieId % CHARACTER_IDS.length];
}
