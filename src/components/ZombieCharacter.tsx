import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { Box3, Object3D, Vector3 } from 'three';
import { Zombie } from '../types';
import { ZOMBIE_DEFS } from '../data/zombies';
import { pickCharacterIdForZombie } from '../assets/characters';
import { loadCharacter } from '../render/loadCharacter';

// 20% bigger than the previous 8 -> 10. Walkers render around ~20-30 units tall
// depending on the model's natural height; bosses at 1.75x.
const BASE_SCALE = 10;
const BOSS_SCALE = BASE_SCALE * 1.75;

interface Props {
  z: Zombie;
}

export function ZombieCharacter({ z }: Props) {
  const groupRef = useRef<any>(null);
  const [model, setModel] = useState<Object3D | null>(null);
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
        // Per-model bbox: lift the group so the model's feet sit on the
        // ground regardless of how the Kenney GLB authored its origin.
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
    const side = z.size * 1.75;
    const height = isBoss ? 35 : 20;
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
