// Asset registry for the Kenney character GLBs (with zombified textures
// already baked in by `scripts/embed-zombie-textures.mjs`). Each character's
// GLB ships as base64 chunks in a sibling `character-{letter}.ts` module so
// the entire game travels as text-bundlable source — no binary push needed.
// The runtime concatenates and decodes on first load via `loadCharacter()`.
//
// Letters O and L are the pre-made green zombies; the rest had their peach
// or brown skin tones remapped to zombie green at build time, and the
// non-human variants (D, G, H) had the zombie-O head texture grafted on.

import { CHARACTER_A_B64_CHUNKS } from './character-a';
import { CHARACTER_B_B64_CHUNKS } from './character-b';
import { CHARACTER_C_B64_CHUNKS } from './character-c';
import { CHARACTER_D_B64_CHUNKS } from './character-d';
import { CHARACTER_E_B64_CHUNKS } from './character-e';
import { CHARACTER_F_B64_CHUNKS } from './character-f';
import { CHARACTER_G_B64_CHUNKS } from './character-g';
import { CHARACTER_I_B64_CHUNKS } from './character-i';
import { CHARACTER_J_B64_CHUNKS } from './character-j';
import { CHARACTER_K_B64_CHUNKS } from './character-k';
import { CHARACTER_L_B64_CHUNKS } from './character-l';
import { CHARACTER_M_B64_CHUNKS } from './character-m';
import { CHARACTER_N_B64_CHUNKS } from './character-n';
import { CHARACTER_O_B64_CHUNKS } from './character-o';
import { CHARACTER_P_B64_CHUNKS } from './character-p';
import { CHARACTER_Q_B64_CHUNKS } from './character-q';
import { CHARACTER_R_B64_CHUNKS } from './character-r';

export const CHARACTER_IDS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_B64_CHUNKS: Record<CharacterId, readonly string[]> = {
  a: CHARACTER_A_B64_CHUNKS,
  b: CHARACTER_B_B64_CHUNKS,
  c: CHARACTER_C_B64_CHUNKS,
  d: CHARACTER_D_B64_CHUNKS,
  e: CHARACTER_E_B64_CHUNKS,
  f: CHARACTER_F_B64_CHUNKS,
  g: CHARACTER_G_B64_CHUNKS,
  i: CHARACTER_I_B64_CHUNKS,
  j: CHARACTER_J_B64_CHUNKS,
  k: CHARACTER_K_B64_CHUNKS,
  l: CHARACTER_L_B64_CHUNKS,
  m: CHARACTER_M_B64_CHUNKS,
  n: CHARACTER_N_B64_CHUNKS,
  o: CHARACTER_O_B64_CHUNKS,
  p: CHARACTER_P_B64_CHUNKS,
  q: CHARACTER_Q_B64_CHUNKS,
  r: CHARACTER_R_B64_CHUNKS,
};

// Pick a stable character variant from a zombie id. Spreads the variants
// roughly evenly across spawned zombies; runner / brute / spitter / boss
// can override this with a fixed pick if we want kind-specific looks.
export function pickCharacterIdForZombie(zombieId: number): CharacterId {
  return CHARACTER_IDS[zombieId % CHARACTER_IDS.length];
}
