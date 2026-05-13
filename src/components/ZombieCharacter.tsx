import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { Box3, Object3D, Vector3 } from 'three';
import { Zombie } from '../types';
import { ZOMBIE_DEFS } from '../data/zombies';
import { pickCharacterIdForZombie } from '../assets/characters';
import { loadCharacter } from '../render/loadCharacter';

// World-unit scale we render Kenney models at. Shrunk 30% from 12 -> 8.
// Walkers now render at roughly 16-24 units tall depending on the model's
// natural height; bosses at 1.75x that.
const BASE_SCALE = 8;
const BOSS_SCALE = BASE_SCALE * 1.75;

interface Props {
  z: Zombie;
}

export function ZombieCharacter({ z }: Props) {
  const groupRef = useRef<any>(null);
  const [model, setModel] = useState<Object3D | null>(null);
  // Y offset to put the model's feet on the ground. Computed per-model
  // from its bounding box because Kenney character GLBs have INCONSISTENT
  // origin placement: some have origin at center of the model, others at
  // feet, others somewhere else entirely. A single hardcoded offset can't
  // serve all of them -- which is why the zombies kept ending up
  // waist-deep or floating depending on which character spawned.
  const [feetLift, setFeetLift] = useState<number>(0);
  const def = ZOMBIE_DEFS[z.kind];
  const isBoss = z.kind === 'boss';
  const scale = isBoss ? BOSS_SCALE : BASE_SCALE * (z.size / 14);

  useEffect(() => {
    let mounted = true;
    const id = pickCharacterIdForZombie(z.id);
    loadCharacter(id)
      .then((m) => {
        if (!mounted) return;
        // Measure local-frame bounding box. After scaling by `scale`,
        // the world-space bottom of the model sits at bbox.min.y * scale
        // relative to the group origin. To put the feet on the ground
        // plane (world y=0), we shift the group up by -bbox.min.y * scale.
        //   model origin at center  -> bbox.min.y negative -> lift positive
        //   model origin at feet    -> bbox.min.y ~ 0       -> lift ~ 0
        //   model origin at top     -> bbox.min.y very neg  -> lift large
        // Either way the feet end up on the ground.
        const bbox = new Box3().setFromObject(m);
        setFeetLift(-bbox.min.y * scale);
        setModel(m);
      })
      .catch((err) => {
        console.warn('character load failed', id, err?.message ?? err);
      });
    return () => { mounted = false; };
  }, [z.id, scale]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(z.x, feetLift, z.y);
    if (z.vx !== 0 || z.vy !== 0) {
      groupRef.current.rotation.y = Math.atan2(z.vx, -z.vy);
    }
  });

  if (!model) {
    // Box fallback while async loading or if load fails. Origin of a
    // three.js boxGeometry is the CENTER -- so position.y = height/2
    // puts the bottom on the ground.
    const side = z.size * 1.5;
    const height = isBoss ? 28 : 16;
    return (
      <mesh ref={groupRef} position={[z.x, height / 2, z.y]}>
        <boxGeometry args={[side, height, side]} />
        <meshLambertMaterial color={def.color} />
      </mesh>
    );
  }

  return (
    <group ref={groupRef} scale={scale}>
      <primitive object={model} />
    </group>
  );
}
