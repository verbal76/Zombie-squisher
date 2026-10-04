// Decodes a PNG asset via upng-js into a CPU byte buffer and exposes a
// sampler closure (u, v) -> [r, g, b] in LINEAR color space.
//
// Why: see bug #6 of docs/glb-render-pipeline.md. expo-gl's DataTexture
// upload path produces black meshes on device in some renderer/format
// combination we never fully nailed down. The reliable fix is to skip
// the GPU texture entirely and bake colors into the geometry's "color"
// BufferAttribute at load time, then render with
// MeshBasicMaterial({ vertexColors: true }).
//
// Also handles bug #10 (sRGB double-encoding). The bytes in a PNG are
// sRGB-encoded values. The renderer has outputColorSpace=SRGBColorSpace
// so it gamma-encodes its output. If we pass raw byte/255 as a vertex
// color, the bytes get encoded a second time -- midtones lift, darks
// flatten. We pre-linearize via a 256-entry LUT before writing into the
// color BufferAttribute, so the renderer's output encoding lands back
// on the original sRGB byte value.
//
// Bug #7 corollary: we do NOT flip v. Kenney palette swatches start at
// top-left, so low u + low v should sample the top-left swatch directly.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
// @ts-ignore upng-js has no @types, treat as any.
import UPNG from 'upng-js';

// Precomputed sRGB -> linear LUT. byte (0..255) -> linear float (0..1).
const SRGB_TO_LINEAR: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

export interface PaletteSampler {
  width: number;
  height: number;
  /** First 12 bytes of the decoded RGBA buffer, for on-device diagnostic. */
  firstBytes: number[];
  /**
   * Sample at UV in [0,1] per axis. Returns linear-space [r,g,b] floats
   * suitable for direct write into a BufferAttribute consumed by a
   * vertexColors=true material under SRGBColorSpace output.
   */
  sample: (u: number, v: number) => [number, number, number];
}

const cache: Map<number, PaletteSampler> = new Map();
const loading: Map<number, Promise<PaletteSampler>> = new Map();

async function decodeOnce(mod: number): Promise<PaletteSampler> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('palette: no URI');

  // Read the PNG as base64 -> ArrayBuffer (same Android-safe path as the
  // GLB loader; expo-image / TextureLoader's URL-based fetch is unreliable).
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  const img = UPNG.decode(bytes.buffer);
  // UPNG.toRGBA8 returns an array of ArrayBuffers, one per frame. We always
  // want the first frame.
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const w = img.width as number;
  const h = img.height as number;

  const firstBytes = Array.from(rgba.subarray(0, 12));

  const sample = (u: number, v: number): [number, number, number] => {
    let x = Math.floor(u * w);
    let y = Math.floor(v * h);
    if (x < 0) x = 0; else if (x >= w) x = w - 1;
    if (y < 0) y = 0; else if (y >= h) y = h - 1;
    const i = (y * w + x) * 4;
    return [
      SRGB_TO_LINEAR[rgba[i]],
      SRGB_TO_LINEAR[rgba[i + 1]],
      SRGB_TO_LINEAR[rgba[i + 2]],
    ];
  };

  return { width: w, height: h, firstBytes, sample };
}

export async function getPaletteSampler(mod: number): Promise<PaletteSampler> {
  const cached = cache.get(mod);
  if (cached) return cached;
  let inFlight = loading.get(mod);
  if (!inFlight) {
    inFlight = decodeOnce(mod).then((p) => {
      cache.set(mod, p);
      return p;
    });
    loading.set(mod, inFlight);
  }
  return inFlight;
}
