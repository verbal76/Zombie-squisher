import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { BoxGeometry, InstancedMesh, Matrix4, Object3D } from 'three';
import { World, MAX_ACTIVE_ZOMBIES } from '../game/engine';
import { CHARACTER_IDS, zombieVariantIndex } from '../assets/characters';
import { ZOMBIE_DEFS } from '../data/zombies';
import { buildZombieModels } from '../render/zombieModels';
import { Diag } from '../debug/diagnostics';
import { ZOMBIE_TINT, composeZombieMatrix, headingFromVelocity } from '../render/hordeGeometry';

const BASE_SCALE = 10;
const BOSS_SCALE = BASE_SCALE * 1.75;
const VARIANTS = CHARACTER_IDS.length;

const scaleFor = (kind: string, size: number) => (kind === 'boss' ? BOSS_SCALE : BASE_SCALE * (size / 14));

const M = new Matrix4();
const counts = new Int32Array(VARIANTS);
const boxGeom = new BoxGeometry(1, 1, 1);
const dummy = new Object3D();

/**
 * Renders every zombie with one InstancedMesh per character variant (18 draw calls total regardless of
 * how many zombies exist) from a single useFrame, instead of one React component + 6 meshes per zombie
 * (~3000 draw calls at the 500-zombie cap). No per-zombie React state exists, so the HUD tick no longer
 * reconciles hundreds of elements.
 */
export function ZombieHorde({ world }: { world: World }) {
  // Built once, synchronously, from the committed bake (no async loading state, no model-load hitch).
  const variants = useMemo(() => {
    try {
      const models = buildZombieModels();
      models.forEach(() => { Diag.attemptModel(); Diag.loadModel(); });
      return models;
    } catch (err) {
      Diag.setLoadError('zombie models', err);
      return null; // coloured boxes keep the horde visible
    }
  }, []);
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const fallback = useRef<InstancedMesh | null>(null);

  useFrame(() => {
    const zs = world.zombies;
    if (variants) {
      counts.fill(0);
      for (const z of zs) {
        const vi = zombieVariantIndex(z.id);
        const mesh = meshes.current[vi];
        if (!mesh) continue;
        const idx = counts[vi];
        if (idx >= MAX_ACTIVE_ZOMBIES) continue;
        counts[vi] = idx + 1;
        const scale = scaleFor(z.kind, z.size);
        composeZombieMatrix(M, z.x, -variants[vi].minY * scale, z.y, headingFromVelocity(z.vx, z.vy), scale);
        mesh.setMatrixAt(idx, M);
        mesh.setColorAt(idx, ZOMBIE_TINT[z.kind]);
      }
      for (let vi = 0; vi < VARIANTS; vi++) {
        const mesh = meshes.current[vi];
        if (!mesh) continue;
        mesh.count = counts[vi];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    } else if (fallback.current) {
      // Models still loading (or all failed): coloured boxes so the horde is never invisible.
      const mesh = fallback.current;
      let n = 0;
      for (const z of zs) {
        if (n >= MAX_ACTIVE_ZOMBIES) break;
        const side = z.size * 1.75;
        const height = z.kind === 'boss' ? 35 : 20;
        dummy.position.set(z.x, height / 2, z.y);
        dummy.scale.set(side, height, side);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, ZOMBIE_DEFS[z.kind] ? new (ZOMBIE_TINT.walker.constructor as any)(ZOMBIE_DEFS[z.kind].color) : ZOMBIE_TINT.walker);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  if (!variants) {
    return (
      <instancedMesh
        ref={(m) => { fallback.current = m; if (m) m.setColorAt(0, ZOMBIE_TINT.walker); }}
        args={[boxGeom, undefined, MAX_ACTIVE_ZOMBIES]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>
    );
  }
  return (
    <>
      {variants.map((v, i) => (
        <instancedMesh
          key={i}
          ref={(m) => { meshes.current[i] = m; if (m && !m.instanceColor) m.setColorAt(0, ZOMBIE_TINT.walker); }}
          args={[v.geometry, undefined, MAX_ACTIVE_ZOMBIES]}
          frustumCulled={false}
        >
          <meshBasicMaterial vertexColors />
        </instancedMesh>
      ))}
    </>
  );
}
