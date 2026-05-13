import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { Object3D } from 'three';
import { Zombie } from '../types';
import { ZOMBIE_DEFS } from '../data/zombies';
import { pickCharacterIdForZombie } from '../assets/characters';
import { loadCharacter } from '../render/loadCharacter';

// World-unit scale we render Kenney models at. Kenney characters are ~2
// units tall in local frame. At BASE_SCALE = 24, walkers render at ~48
// units tall -- slightly taller than the typical car (~40 units tall
// after fitScaleFor).
const BASE_SCALE = 24;
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
    // not at the feet. Lift by `scale` so feet sit on the ground plane.
    groupRef.current.position.set(z.x, scale, z.y);
    if (z.vx !== 0 || z.vy !== 0) {
      groupRef.current.rotation.y = Math.atan2(z.vx, -z.vy);
    }
  });

  if (!model) {
    // Box fallback while async loading or if load fails. Heights match
    // the GLB scale so both render consistently on the ground.
    const side = z.size * 4;
    const height = isBoss ? 84 : 48;
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
