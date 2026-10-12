// Builds the 18 zombie geometries from the build-time bake (tools/bake-characters.ts).
// Synchronous and allocation-light: no file reads, no GLB parsing, no PNG decoding at runtime.
import { BufferAttribute, BufferGeometry } from 'three';
import baked from '../assets/baked/zombieModels.json';
import { CHARACTER_IDS } from '../assets/characters';
import { MergedCharacter } from './hordeGeometry';

// sRGB byte -> linear float. The renderer encodes output as sRGB, so vertex colours must be linear
// (docs/glb-render-pipeline.md bug #10); same LUT the old runtime palette sampler used.
const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

export function buildZombieModels(data = baked): MergedCharacter[] {
  if (data.version !== 1) throw new Error(`unsupported zombie model format ${data.version}`);
  const positions = new Float32Array(data.positions);
  return CHARACTER_IDS.map((id) => {
    const bytes = (data.colors as Record<string, number[]>)[id];
    if (!bytes || bytes.length !== positions.length) throw new Error(`zombie model ${id}: bad colour data`);
    const colors = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) colors[i] = SRGB_TO_LINEAR[bytes[i]];
    const geometry = new BufferGeometry();
    // positions are shared (same typed array); only the colour attribute differs per variant
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, minY: data.minY, triangles: data.triangles };
  });
}
