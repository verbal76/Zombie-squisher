// Loads a Kenney vehicle GLB from assets/ and applies the shared colormap.png
// texture atlas. All Kenney vehicle GLBs reference their texture by a relative
// URI that won't resolve in our flat assets/ layout, so we use the same
// stripExternalImageUris → manual texture attach pattern as loadCharacter.ts.
//
// Scale note: Kenney vehicle GLBs are approximately 1 unit wide × 0.5 tall ×
// 2 units long in GLB space. The caller provides a `scale` that maps those
// units to game-world units. CarMesh uses `vehicle.width` as the X scale basis.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLORMAP_TEX } from '../data/objects';
import { Diag } from '../debug/diagnostics';
import { getPaletteSampler } from './paletteSampler';
import { base64ToArrayBuffer, bakeVertexColors, prepareScene, stripExternalImageUris } from './glbCommon';


async function readBufferFromUri(uri: string): Promise<ArrayBuffer> {
  // fetch() of file:// URIs is unreliable on Android (empty body / hangs).
  // Read via expo-file-system as base64, then decode to ArrayBuffer using
  // Hermes' global atob.
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(b64);
}

const cache: Map<number, Group> = new Map();
const loading: Map<number, Promise<Group>> = new Map();

async function loadOnce(mod: number): Promise<Group> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('vehicle GLB: no URI');
  const raw = await readBufferFromUri(uri);
  const patched = stripExternalImageUris(raw);

  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(patched, '', resolve, reject);
  });

  // CRITICAL: null every texture slot on every parsed material BEFORE the
  // scene reaches the renderer. GLTFLoader creates THREE.Texture instances
  // pointing at the GLB's internal images, but in React Native there's no
  // Image constructor so those textures' .image stays undefined. The
  // renderer's compile/upload path runs before any later .map swap and
  // crashes in getDimensions() on image.width. Nulling these refs first
  // means even if our own colormap attach below fails, the scene is still
  // safe to render.
  //
  // We also disable frustumCulled per bug #9 of glb-render-pipeline.md:
  // after scaling/centering, a mesh's boundingSphere can end up degenerate
  // and three's culler then decides "off-screen" every frame, silently
  // hiding the mesh. For small scenes culling buys nothing.
  //
  // Recompute boundingBox + boundingSphere after stripping so any later
  // transforms operate on fresh bounds.
  prepareScene(gltf.scene);

  try {
    const palette = await getPaletteSampler(COLORMAP_TEX);
    bakeVertexColors(gltf.scene, palette);
  } catch (err) {
    console.warn('vehicle GLB: vertex color bake failed', err);
  }

  return gltf.scene as Group;
}

// Load a vehicle GLB by its Metro asset module reference (the number returned
// by require('../../assets/X.glb')). Result is cached; every call after the
// first returns a clone so callers can modify transforms independently.
export async function loadVehicleGLB(mod: number): Promise<Object3D> {
  Diag.attemptModel();
  if (cache.has(mod)) {
    Diag.loadModel();
    return cache.get(mod)!.clone(true);
  }
  if (!loading.has(mod)) {
    loading.set(
      mod,
      loadOnce(mod).then((scene) => {
        cache.set(mod, scene);
        return scene;
      }),
    );
  }
  try {
    const scene = await loading.get(mod)!;
    Diag.loadModel();
    return scene.clone(true);
  } catch (err) {
    Diag.setLoadError(`vehicle ${mod}`, err);
    throw err;
  }
}
