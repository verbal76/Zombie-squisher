import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { InstancedMesh, Matrix4 } from 'three';
import { World, MAX_BLOOD_SPOTS } from '../game/engine';
import { composeGroundDiscMatrix } from '../render/hordeGeometry';

const M = new Matrix4();
const START_ALPHA = 0.85;

/** All blood decals in a single draw call. They fade by shrinking (instances have no per-instance opacity). */
export function BloodSplats({ world }: { world: World }) {
  const mesh = useRef<InstancedMesh | null>(null);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const spots = world.bloodSpots;
    const n = Math.min(spots.length, MAX_BLOOD_SPOTS);
    for (let i = 0; i < n; i++) {
      const b = spots[i];
      const life = Math.max(0, Math.min(1, b.alpha / START_ALPHA));
      composeGroundDiscMatrix(M, b.x, 0.5, b.y, b.size * (0.35 + 0.65 * life));
      m.setMatrixAt(i, M);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_BLOOD_SPOTS]} frustumCulled={false}>
      <circleGeometry args={[1, 10]} />
      <meshBasicMaterial color="#3a0a0a" />
    </instancedMesh>
  );
}
