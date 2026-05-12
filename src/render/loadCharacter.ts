// Loads a character GLB from assets/ as a binary file via expo-asset and
// hands it to three.js GLTFLoader. The character texture is loaded
// separately and grafted onto every mesh's material because the GLB's
// internal texture URI ("Textures/texture-X.png") won't resolve in our
// flat-layout assets/ directory.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { BufferAttribute, Group, MeshBasicMaterial, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_GLB, CHARACTER_TEX, CharacterId } from '../assets/characters';
import { Diag } from '../debug/diagnostics';
import { getPaletteSampler, PaletteSampler } from './paletteSampler';

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

// Bake per-vertex colors into every mesh in the scene by sampling the
// character's palette PNG at each vertex's UV. Then replace the material
// with MeshBasicMaterial(vertexColors=true) so no GPU texture is ever
// uploaded. See bug #6 of docs/glb-render-pipeline.md.
function bakeVertexColors(scene: Group, sampler: PaletteSampler): void {
  scene.traverse((node: any) => {
    if (!node.isMesh || !node.geometry) return;
    const geom = node.geometry;
    const uv = geom.getAttribute('uv');
    if (!uv) {
      node.material = new MeshBasicMaterial({ color: 0x888888 });
      return;
    }
    const count = uv.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const rgb = sampler.sample(u, v);
      colors[i * 3]     = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }
    geom.setAttribute('color', new BufferAttribute(colors, 3));
    node.material = new MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
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

  // CRITICAL: null every texture slot on every parsed material BEFORE the
  // scene reaches the renderer. GLTFLoader creates THREE.Texture instances
  // pointing at the GLB's internal images, but in React Native there's no
  // Image constructor so those textures' .image stays undefined. The
  // renderer's compile/upload path runs before any later .map swap and
  // crashes in getDimensions() on image.width. Nulling these refs first
  // means even if our own texture attach below fails, the scene is still
  // safe to render.
  //
  // We also disable frustumCulled per bug #9 of glb-render-pipeline.md:
  // after scaling/centering, a mesh's boundingSphere can end up degenerate
  // and three's culler then decides "off-screen" every frame, silently
  // hiding the mesh. For small scenes culling buys nothing.
  //
  // Recompute boundingBox + boundingSphere after stripping so any later
  // transforms operate on fresh bounds.
  const textureKeys = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap',
    'envMap', 'lightMap', 'specularMap',
    'gradientMap', 'matcap',
    'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap',
    'sheenColorMap', 'sheenRoughnessMap',
    'transmissionMap', 'thicknessMap',
    'iridescenceMap', 'iridescenceThicknessMap',
    'anisotropyMap',
  ];
  gltf.scene.traverse((node: any) => {
    if (node.isMesh) {
      node.frustumCulled = false;
      if (node.material) {
        for (const key of textureKeys) {
          if (node.material[key]) node.material[key] = null;
        }
        node.material.needsUpdate = true;
      }
      if (node.geometry) {
        node.geometry.computeBoundingBox();
        node.geometry.computeBoundingSphere();
      }
    }
  });

  // Bake vertex colors from this character's palette PNG.
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
    loading[id] = loading[id] = loadOnce(id).then((s) => {
      cache[id] = s;
      return s;
    });
  }
  const s = await loading[id]!;
  Diag.loadModel();
  return s.clone(true);
}
