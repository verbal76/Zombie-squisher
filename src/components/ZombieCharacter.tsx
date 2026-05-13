import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { Object3D } from 'three';
import { Zombie } from '../types';
import { ZOMBIE_DEFS } from '../data/zombies';
import { pickCharacterIdForZombie } from '../assets/characters';
import { loadCharacter } from '../render/loadCharacter';

// World-unit scale we render Kenney models at. The blocky models are ~2 units
// tall in their own coordinate space. Bumped 4x for chase-cam visibility:
// from a behind-the-car perspective, the walkers were too small to read at
// any meaningful range. Walkers now render at ~64 units tall on the ground,
// bosses at ~112 units.
const BASE_SCALE = 32;
const BOSS_SCALE = BASE_SCALE * 1.75;

interface Props {
  z: Zombie;
}

export function ZombieCharacter({ z }: Props) {
  const groupRef = useRef<any>(null);
  const [model, setModel] = useState<Object3D | null>(null);
  const def = ZOMBIE_DEFS[z.kind];
  const isBoss = z.kind === 'boss';
  const scale = isBoss ? BOSS_SCALE : BASE_SCALE * (z.size / 14);

  useEffect(() => {
    let mounted = true;
    const id = pickCharacterIdForZombie(z.id);
    loadCharacter(id)
      .then((m) => {
        if (mounted) setModel(m);
      })
      .catch((err) => {
        console.warn('character load failed', id, err?.message ?? err);
      });
    return () => { mounted = false; };
  }, [z.id]);

  useFrame(() => {
    if (!groupRef.current) return;
    // Kenney character GLBs have their origin at the CENTER of the model,
    // not at the feet. Setting Y=0 sinks the model half-below the ground.
    // Lift by `scale` -- the Kenney characters are ~2 units tall in their
    // own coordinate space, so the scaled model is ~scale*2 units tall and
    // half of that (= scale) is the offset from center-origin to feet.
    // The box fallback uses the same offset (height/2 = scale) so both
    // branches sit on the ground consistently.
    groupRef.current.position.set(z.x, scale, z.y);
    if (z.vx !== 0 || z.vy !== 0) {
      groupRef.current.rotation.y = Math.atan2(z.vx, -z.vy);
    }
  });

  if (!model) {
    // Box fallback while async loading or if load fails entirely.
    // height/2 puts the bottom of the box on the ground -- but the useFrame
    // above also sets position to (x, scale, y) which is the same value
    // (scale == height/2 for both walker and boss tiers), so it's consistent.
    const side = z.size * 8;
    const height = isBoss ? 112 : 64;
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
