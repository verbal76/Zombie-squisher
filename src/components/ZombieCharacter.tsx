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
    groupRef.current.position.set(z.x, 0, z.y);
    if (z.vx !== 0 || z.vy !== 0) {
      groupRef.current.rotation.y = Math.atan2(z.vx, -z.vy);
    }
  });

  if (!model) {
    // Box fallback while async loading or if load fails entirely.
    // Bumped to match the new BASE_SCALE so the fallback isn't tiny.
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
