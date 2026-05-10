// Async loader + cache for the embedded character GLBs. The bytes ship as
// chunked base64 strings in src/assets/character-{letter}.ts — concat the
// chunks, atob to a binary string, copy into an ArrayBuffer, then hand off
// to three.js's GLTFLoader. Each call returns a fresh `clone(true)` of the
// cached scene so spawned zombies don't share a transform with each other.
//
// Animations on the original scene are NOT preserved on clones today —
// when we wire AnimationMixer in a later slice, hold onto `gltf.animations`
// per character.

import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_B64_CHUNKS, CharacterId } from '../assets/characters';

const cache: Partial<Record<CharacterId, Group>> = {};
const loading: Partial<Record<CharacterId, Promise<Group>>> = {};

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // atob is available on hermes / RN's modern JSC.
  const binary = (typeof atob === 'function')
    ? atob(b64)
    : (globalThis as any).Buffer.from(b64, 'base64').toString('binary');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function loadOnce(id: CharacterId): Promise<Group> {
  const chunks = CHARACTER_B64_CHUNKS[id];
  if (!chunks) throw new Error(`character ${id}: missing b64 chunks`);
  const b64 = chunks.join('');
  const buffer = base64ToArrayBuffer(b64);
  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject);
  });
  return gltf.scene as Group;
}

export async function loadCharacter(id: CharacterId): Promise<Object3D> {
  if (cache[id]) return cache[id]!.clone(true);
  if (!loading[id]) {
    loading[id] = loadOnce(id).then((s) => {
      cache[id] = s;
      return s;
    });
  }
  const s = await loading[id]!;
  return s.clone(true);
}
