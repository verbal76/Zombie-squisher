// Loads a Kenney vehicle GLB from assets/ and applies the shared colormap.png
// texture atlas. All Kenney vehicle GLBs reference their texture by a relative
// URI that won't resolve in our flat assets/ layout, so we use the same
// stripExternalImageUris → manual texture attach pattern as loadCharacter.ts.
//
// Scale note: Kenney vehicle GLBs are approximately 1 unit wide × 0.5 tall ×
// 2 units long in GLB space. The caller provides a `scale` that maps those
// units to game-world units. CarMesh uses `vehicle.width` as the X scale basis.

import { Asset } from 'expo-asset';
import { Group, Object3D, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLORMAP_TEX } from '../data/objects';

const cache: Map<number, Group> = new Map();
const loading: Map<number, Promise<Group>> = new Map();

// Shared colormap texture, loaded once.
let colormapTex: Texture | null = null;
let colormapLoading: Promise<Texture> | null = null;

async function getColormap(): Promise<Texture> {
  if (colormapTex) return colormapTex;
  if (!colormapLoading) {
    colormapLoading = (async () => {
      const asset = Asset.fromModule(COLORMAP_TEX);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) throw new Error('colormap: no URI');
      return new Promise<Texture>((resolve, reject) => {
        new TextureLoader().load(uri, (t) => {
          t.flipY = false;
          t.needsUpdate = true;
          colormapTex = t;
          resolve(t);
        }, undefined, reject);
      });
    })();
  }
  return colormapLoading;
}

// Mirrors the same GLB JSON-patch from loadCharacter.ts — strips images[i].uri
// so GLTFLoader.parse doesn't attempt to fetch relative texture paths.
function stripExternalImageUris(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) return buffer;
  const totalLen = view.getUint32(8, true);
  const jsonLen = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonLen);
  const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));
  let touched = false;
  if (Array.isArray(gltf.images)) {
    for (const img of gltf.images) {
      if (img && typeof img.uri === 'string') { delete img.uri; touched = true; }
    }
  }
  if (!touched) return buffer;

  let newJson = JSON.stringify(gltf);
  while (newJson.length % 4 !== 0) newJson += ' ';
  const newJsonBytes = new TextEncoder().encode(newJson);
  const binChunkOffset = 20 + jsonLen;
  const binBytes = new Uint8Array(buffer, binChunkOffset, totalLen - binChunkOffset);
  const newTotal = 12 + 8 + newJsonBytes.length + binBytes.length;
  const out = new Uint8Array(newTotal);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, newTotal, true);
  dv.setUint32(12, newJsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(newJsonBytes, 20);
  out.set(binBytes, 20 + newJsonBytes.length);
  return out.buffer;
}

async function loadOnce(mod: number): Promise<Group> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('vehicle GLB: no URI');
  const raw = await fetch(uri).then((r) => r.arrayBuffer());
  const patched = stripExternalImageUris(raw);

  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(patched, '', resolve, reject);
  });

  try {
    const tex = await getColormap();
    gltf.scene.traverse((node: any) => {
      if (node.isMesh && node.material) {
        node.material.map = tex;
        node.material.needsUpdate = true;
      }
    });
  } catch (err) {
    console.warn('vehicle GLB: colormap attach failed', err);
  }

  return gltf.scene as Group;
}

// Load a vehicle GLB by its Metro asset module reference (the number returned
// by require('../../assets/X.glb')). Result is cached; every call after the
// first returns a clone so callers can modify transforms independently.
export async function loadVehicleGLB(mod: number): Promise<Object3D> {
  if (cache.has(mod)) return cache.get(mod)!.clone(true);
  if (!loading.has(mod)) {
    loading.set(
      mod,
      loadOnce(mod).then((scene) => {
        cache.set(mod, scene);
        return scene;
      }),
    );
  }
  const scene = await loading.get(mod)!;
  return scene.clone(true);
}
