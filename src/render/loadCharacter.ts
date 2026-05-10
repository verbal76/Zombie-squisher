// Async loader + cache for the embedded character GLBs. Each call returns
// a fresh `clone(true)` of the cached scene so spawned zombies don't share a
// transform with each other. Animations on the original scene are NOT
// preserved on clones today — when we wire AnimationMixer in a later slice,
// hold onto `gltf.animations` per character.

import { Asset } from 'expo-asset';
import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_MODULES, CharacterId } from '../assets/characters';

const cache: Partial<Record<CharacterId, Group>> = {};
const loading: Partial<Record<CharacterId, Promise<Group>>> = {};

async function fetchAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

async function loadOnce(id: CharacterId): Promise<Group> {
  const asset = Asset.fromModule(CHARACTER_MODULES[id]);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error(`character ${id}: no asset URI`);
  const buffer = await fetchAsArrayBuffer(uri);
  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject);
  });
  const scene: Group = gltf.scene;
  // Pre-compute bounding box / scale tuning could go here.
  return scene;
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
