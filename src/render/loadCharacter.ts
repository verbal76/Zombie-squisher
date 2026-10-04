// Loads a character GLB from assets/ as a binary file via expo-asset and
// hands it to three.js GLTFLoader. The character texture is loaded
// separately and grafted onto every mesh's material because the GLB's
// internal texture URI ("Textures/texture-X.png") won't resolve in our
// flat-layout assets/ directory.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_GLB, CHARACTER_TEX, CharacterId } from '../assets/characters';
import { Diag } from '../debug/diagnostics';
import { getPaletteSampler } from './paletteSampler';
import { base64ToArrayBuffer, bakeVertexColors, prepareScene, stripExternalImageUris } from './glbCommon';


const cache: Partial<Record<CharacterId, Group>> = {};
const loading: Partial<Record<CharacterId, Promise<Group>>> = {};

async function fetchBuffer(uri: string): Promise<ArrayBuffer> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(b64);
}

async function loadOnce(id: CharacterId): Promise<Group> {
  const glbAsset = Asset.fromModule(CHARACTER_GLB[id]);
  await glbAsset.downloadAsync();
  const glbUri = glbAsset.localUri ?? glbAsset.uri;
  if (!glbUri) throw new Error(`character ${id}: no GLB URI`);
  const raw = await fetchBuffer(glbUri);
  const patched = stripExternalImageUris(raw);

  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(patched, '', resolve, reject);
  });

  prepareScene(gltf.scene);

  try {
    const palette = await getPaletteSampler(CHARACTER_TEX[id]);
    bakeVertexColors(gltf.scene, palette);
  } catch (err) {
    console.warn(`character ${id}: vertex color bake failed`, err);
  }

  return gltf.scene as Group;
}

export async function loadCharacter(id: CharacterId): Promise<Object3D> {
  Diag.attemptModel();
  if (cache[id]) {
    Diag.loadModel();
    return cache[id]!.clone(true);
  }
  if (!loading[id]) {
    loading[id] = loadOnce(id).then((s) => {
      cache[id] = s;
      return s;
    });
  }
  try {
    const s = await loading[id]!;
    Diag.loadModel();
    return s.clone(true);
  } catch (err) {
    Diag.setLoadError(`character ${id}`, err);
    throw err;
  }
}
