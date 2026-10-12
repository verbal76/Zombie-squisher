// Pure three.js helpers for instanced zombie rendering (no React / Expo imports, unit tested).
import { BufferAttribute, BufferGeometry, Color, Matrix4, Object3D } from 'three';
import { ZombieKind } from '../types';

export interface MergedCharacter {
  geometry: BufferGeometry;
  /** Lowest Y of the merged mesh in model space (feet), used to stand models on the ground. */
  minY: number;
  triangles: number;
}

/**
 * Collapses every mesh of a (vertex-coloured) character into ONE non-indexed geometry with
 * position + color attributes, baking each node's transform. A Kenney character is 6 separate
 * primitives; as one geometry it is 1 draw call per instanced batch instead of 6 per zombie.
 */
export function mergeCharacterGeometry(root: Object3D): MergedCharacter {
  root.updateMatrixWorld(true);
  const positions: Float32Array[] = [];
  const colors: Float32Array[] = [];
  let vertexCount = 0;

  root.traverse((node: any) => {
    if (!node.isMesh || !node.geometry) return;
    let g: BufferGeometry = node.geometry.clone();
    g.applyMatrix4(node.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    const pa = new Float32Array(p.count * 3);
    const ca = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      pa[i * 3] = p.getX(i); pa[i * 3 + 1] = p.getY(i); pa[i * 3 + 2] = p.getZ(i);
      if (c) { ca[i * 3] = c.getX(i); ca[i * 3 + 1] = c.getY(i); ca[i * 3 + 2] = c.getZ(i); }
      else { ca[i * 3] = ca[i * 3 + 1] = ca[i * 3 + 2] = 0.53; }
    }
    positions.push(pa); colors.push(ca);
    vertexCount += p.count;
  });

  if (vertexCount === 0) throw new Error('character has no mesh geometry');
  const P = new Float32Array(vertexCount * 3);
  const C = new Float32Array(vertexCount * 3);
  let off = 0;
  for (let i = 0; i < positions.length; i++) { P.set(positions[i], off); C.set(colors[i], off); off += positions[i].length; }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(P, 3));
  geometry.setAttribute('color', new BufferAttribute(C, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, minY: geometry.boundingBox!.min.y, triangles: vertexCount / 3 };
}

/** Writes a Y-rotation * uniform-scale * translation matrix (x, y, z) into `out`. */
export function composeZombieMatrix(out: Matrix4, x: number, y: number, z: number, headingY: number, scale: number): Matrix4 {
  const c = Math.cos(headingY) * scale;
  const s = Math.sin(headingY) * scale;
  return out.set(
    c, 0, s, x,
    0, scale, 0, y,
    -s, 0, c, z,
    0, 0, 0, 1,
  );
}

/** Flat (ground-aligned) disc matrix: a unit circle in the XY plane lying on the ground at height y. */
export function composeGroundDiscMatrix(out: Matrix4, x: number, y: number, z: number, radius: number): Matrix4 {
  return out.set(
    radius, 0, 0, x,
    0, 0, radius, y,
    0, -radius, 0, z,
    0, 0, 0, 1,
  );
}

/** Heading (about Y) that faces a zombie's velocity; keeps `fallback` when it is standing still. */
export function headingFromVelocity(vx: number, vy: number, fallback = 0): number {
  return vx === 0 && vy === 0 ? fallback : Math.atan2(vx, -vy);
}

// Multiplied with the baked vertex colours so each zombie kind reads differently at a glance
// (all kinds share the same Kenney body). White leaves the original colours untouched.
export const ZOMBIE_TINT: Record<ZombieKind, Color> = {
  walker: new Color(1, 1, 1),
  runner: new Color(1.0, 0.82, 0.62),
  brute: new Color(0.72, 0.5, 0.5),
  spitter: new Color(0.7, 1.0, 0.62),
  boss: new Color(1.0, 0.45, 0.45),
};
