// Loads a character GLB from assets/ as a binary file via expo-asset and
// hands it to three.js GLTFLoader. The character texture is loaded
// separately and grafted onto every mesh's material because the GLB's
// internal texture URI ("Textures/texture-X.png") won't resolve in our
// flat-layout assets/ directory.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { Group, Object3D, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_GLB, CHARACTER_TEX, CharacterId } from '../assets/characters';

const cache: Partial<Record<CharacterId, Group>> = {};
const loading: Partial<Record<CharacterId, Promise<Group>>> = {};

async function fetchBuffer(uri: string): Promise<ArrayBuffer> {
  // fetch() of file:// URIs is unreliable on Android (empty body / hangs).
  // Read via expo-file-system as base64, then decode to ArrayBuffer using
  // Hermes' global atob.
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes.buffer;
}

// Remove `images[i].uri` entries from the GLB's JSON header so GLTFLoader
// doesn't try to fetch missing relative URIs (which would either error or
// hang). Returns a new ArrayBuffer with the patched JSON; the binary chunk
// is copied through unchanged.
function stripExternalImageUris(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) return buffer; // not a GLB; pass through
  const totalLen = view.getUint32(8, true);
  const jsonLen = view.getUint32(12, true);
  // 12-byte header, 4-byte json-length, 4-byte json-type
  const jsonStart = 20;
  const jsonBytes = new Uint8Array(buffer, jsonStart, jsonLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const gltf = JSON.parse(jsonStr);
  let touched = false;
  if (Array.isArray(gltf.images)) {
    for (const img of gltf.images) {
      if (img && typeof img.uri === 'string') {
        delete img.uri;
        touched = true;
      }
    }
  }
  if (!touched) return buffer;

  let newJson = JSON.stringify(gltf);
  while (newJson.length % 4 !== 0) newJson += ' ';
  const newJsonBytes = new TextEncoder().encode(newJson);

  const binChunkOffset = 20 + jsonLen;
  const binChunkLen = totalLen - binChunkOffset;
  const binBytes = new Uint8Array(buffer, binChunkOffset, binChunkLen);

  const newTotal = 12 + 8 + newJsonBytes.length + binBytes.length;
  const out = new Uint8Array(newTotal);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, newTotal, true);
  outView.setUint32(12, newJsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(newJsonBytes, 20);
  out.set(binBytes, 20 + newJsonBytes.length);
  return out.buffer;
}

async function loadTextureFromAsset(mod: number): Promise<Texture | null> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) return null;
  return new Promise<Texture>((resolve, reject) => {
    new TextureLoader().load(uri, resolve, undefined, reject);
  });
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

  // Apply the matching texture to every mesh in the model.
  try {
    const tex = await loadTextureFromAsset(CHARACTER_TEX[id]);
    if (tex) {
      tex.flipY = false; // glTF convention
      tex.needsUpdate = true;
      gltf.scene.traverse((node: any) => {
        if (node.isMesh && node.material) {
          node.material.map = tex;
          node.material.needsUpdate = true;
        }
      });
    }
  } catch (err) {
    console.warn(`character ${id}: texture attach failed`, err);
  }

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
