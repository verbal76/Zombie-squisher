// Build-time bake of the 18 Kenney zombie characters into src/assets/baked/zombieModels.json.
//
// Why: at runtime each character used to be a GLB parse + a 1024x1024 PNG decode in JavaScript (upng) just to
// sample palette colours per vertex, ~4 MB of RGBA per variant, done lazily while the player was driving.
// All 18 variants share one mesh and differ only by palette, so the result is tiny: one position buffer and
// 18 colour arrays. Run:  node --import tsx tools/bake-characters.ts   (tests fail if the committed JSON is stale)
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore upng-js has no types
import UPNG from 'upng-js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stripExternalImageUris, prepareScene, bakeVertexColors } from '../src/render/glbCommon';
import { mergeCharacterGeometry } from '../src/render/hordeGeometry';

export const CHARACTER_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 18).split('');
export const BAKED_PATH = 'src/assets/baked/zombieModels.json';

export interface BakedZombieModels {
  /** Format version; bump when the layout changes. */
  version: 1;
  triangles: number;
  /** minY of the model in model space (feet). */
  minY: number;
  /** Flat xyz triples, 4 decimals. Shared by every variant. */
  positions: number[];
  /** Per character letter: flat rgb triples as sRGB bytes (0-255), one per vertex. */
  colors: Record<string, number[]>;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d + 0; // "+ 0" normalises -0 (JSON drops the sign)

function samplerFor(pngPath: string) {
  const buf = fs.readFileSync(pngPath);
  const img = UPNG.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const w = img.width as number, h = img.height as number;
  // returns sRGB 0..1 (the runtime linearises with a LUT); same indexing as the old paletteSampler
  return {
    sample(u: number, v: number): [number, number, number] {
      const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      const i = (y * w + x) * 4;
      return [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255];
    },
  };
}

export async function bakeCharacters(root: string): Promise<BakedZombieModels> {
  let positions: number[] | null = null;
  let triangles = 0, minY = 0;
  const colors: Record<string, number[]> = {};
  for (const l of CHARACTER_LETTERS) {
    const glb = fs.readFileSync(path.join(root, `assets-source/characters/character-${l}.glb`));
    const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(stripExternalImageUris(buf), '', res, rej));
    prepareScene(gltf.scene);
    bakeVertexColors(gltf.scene, samplerFor(path.join(root, `assets-source/characters/texture-${l}.png`)));
    const m = mergeCharacterGeometry(gltf.scene);
    const pos = Array.from(m.geometry.getAttribute('position').array as Float32Array, (n) => round(n));
    if (positions === null) { positions = pos; triangles = m.triangles; minY = round(m.minY); }
    else {
      if (pos.length !== positions.length || pos.some((v, i) => Math.abs(v - positions![i]) > 1e-3)) {
        throw new Error(`character ${l} has different geometry from the others; baked format assumes one shared mesh`);
      }
    }
    colors[l] = Array.from(m.geometry.getAttribute('color').array as Float32Array, (n) => Math.round(n * 255));
  }
  return { version: 1, triangles, minY, positions: positions!, colors };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  bakeCharacters(root).then((b) => {
    fs.mkdirSync(path.join(root, 'src/assets/baked'), { recursive: true });
    fs.writeFileSync(path.join(root, BAKED_PATH), JSON.stringify(b) + '\n');
    console.log(`baked ${Object.keys(b.colors).length} characters, ${b.triangles} triangles, ${(JSON.stringify(b).length / 1024).toFixed(1)} KB -> ${BAKED_PATH}`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
