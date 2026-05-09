import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Progress, Vehicle, Zombie, Projectile } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { ZOMBIE_DEFS } from '../data/zombies';
import { World, createWorld, step } from '../game/engine';
import { SteeringWheel } from './SteeringWheel';

interface Props {
  progress: Progress;
  onEnd: (kills: number) => void;
}

const ARENA_W = 1200;
const ARENA_H = 1200;
const CAR_DEPTH = 18;
const ZOMBIE_DEPTH = 16;
const BOSS_DEPTH = 28;

const WHEEL_SIZE = 150;
const BTN_SIZE = 78;
const BTN_GAP = 12;
const MARGIN = 24;

export function GameScreen({ progress, onEnd }: Props) {
  useWindowDimensions();

  const worldRef = useRef<World>(createWorld(ARENA_W, ARENA_H, progress));
  const wheelRef = useRef(0);
  const throttleRef = useRef(false);
  const brakeRef = useRef(false);
  const fireRef = useRef(false);
  const abilityTriggerRef = useRef(false);
  const [, setTick] = useState(0);
  const [exited, setExited] = useState(false);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      step(w, dt, {
        wheel: wheelRef.current,
        throttle: throttleRef.current,
        brake: brakeRef.current,
        fire: fireRef.current,
        triggerAbility: abilityTriggerRef.current,
      }, progress);
      abilityTriggerRef.current = false;
      setTick((t) => (t + 1) % 1000000);
      if (w.gameOver && !exited) {
        setExited(true);
        setTimeout(() => onEnd(w.kills), 800);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [progress, exited, onEnd]);

  const w = worldRef.current;
  const hpPct = Math.max(0, w.hp / Math.max(1, w.maxHp));
  const cdPct = ability.cooldownMs > 0 ? 1 - w.abilityCooldown / ability.cooldownMs : 1;

  return (
    <View style={styles.root}>
      <Canvas
        style={StyleSheet.absoluteFill}
        gl={{ antialias: true }}
        camera={{ position: [w.carX, 80, w.carY + 120], fov: 55, near: 1, far: 3000 }}
      >
        <color attach="background" args={['#1a1a1a']} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[400, 600, 200]} intensity={0.9} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ARENA_W / 2, 0, ARENA_H / 2]}>
          <planeGeometry args={[ARENA_W, ARENA_H]} />
          <meshStandardMaterial color={'#3a4a2e'} />
        </mesh>

        <mesh position={[ARENA_W / 2, 8, 0]}>
          <boxGeometry args={[ARENA_W, 16, 6]} />
          <meshStandardMaterial color={'#2a1f15'} />
        </mesh>
        <mesh position={[ARENA_W / 2, 8, ARENA_H]}>
          <boxGeometry args={[ARENA_W, 16, 6]} />
          <meshStandardMaterial color={'#2a1f15'} />
        </mesh>
        <mesh position={[0, 8, ARENA_H / 2]}>
          <boxGeometry args={[6, 16, ARENA_H]} />
          <meshStandardMaterial color={'#2a1f15'} />
        </mesh>
        <mesh position={[ARENA_W, 8, ARENA_H / 2]}>
          <boxGeometry args={[6, 16, ARENA_H]} />
          <meshStandardMaterial color={'#2a1f15'} />
        </mesh>

        <ChaseCamera worldRef={worldRef} />
        <CarMesh worldRef={worldRef} vehicle={vehicle} />

        {w.zombies.map((z) => (
          <ZombieMesh key={z.id} z={z} />
        ))}
        {w.projectiles.map((pr) => (
          <ProjectileMesh key={pr.id} pr={pr} />
        ))}
      </Canvas>

      <View style={[styles.hud, { top: 12, left: 12, right: 12 }]} pointerEvents="none">
        <View style={styles.hudRow}>
          <Text style={styles.hudKills}>KILLS {w.kills}</Text>
          <Text style={styles.hudWave}>WAVE {w.wave + 1}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
        </View>
      </View>

      <View style={[styles.wheelWrap, { left: MARGIN, bottom: MARGIN }]}>
        <SteeringWheel size={WHEEL_SIZE} onChange={(t) => (wheelRef.current = t)} />
      </View>

      <View
        style={[styles.cluster, { right: MARGIN, bottom: MARGIN, width: BTN_SIZE * 2 + BTN_GAP, height: BTN_SIZE * 2 + BTN_GAP }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPressIn={() => (fireRef.current = true)}
          onPressOut={() => (fireRef.current = false)}
          style={[styles.btn, styles.btnFire, { left: 0, top: 0, width: BTN_SIZE, height: BTN_SIZE }]}
        >
          <Text style={styles.btnText}>FIRE</Text>
        </Pressable>
        <Pressable
          onPressIn={() => (brakeRef.current = true)}
          onPressOut={() => (brakeRef.current = false)}
          style={[styles.btn, styles.btnBrake, { left: 0, top: BTN_SIZE + BTN_GAP, width: BTN_SIZE, height: BTN_SIZE }]}
        >
          <Text style={styles.btnText}>BRAKE</Text>
        </Pressable>
        <Pressable
          onPressIn={() => (throttleRef.current = true)}
          onPressOut={() => (throttleRef.current = false)}
          style={[styles.btn, styles.btnGas, { left: BTN_SIZE + BTN_GAP, top: BTN_SIZE + BTN_GAP, width: BTN_SIZE, height: BTN_SIZE }]}
        >
          <Text style={styles.btnText}>GAS</Text>
        </Pressable>
      </View>

      {progress.selectedAbility !== 'none' && (
        <Pressable
          onPress={() => { abilityTriggerRef.current = true; }}
          style={[styles.abilityBtn, w.abilityCooldown > 0 && styles.abilityBtnDisabled]}
        >
          <Text style={styles.abilityText}>{ability.name}</Text>
          <View style={styles.abilityCdBar}>
            <View style={[styles.abilityCdFill, { width: `${cdPct * 100}%` }]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function ChaseCamera({ worldRef }: { worldRef: React.MutableRefObject<World> }) {
  useFrame(({ camera }) => {
    const w = worldRef.current;
    const dist = 130;
    const height = 90;
    const tx = w.carX - Math.sin(w.heading) * dist;
    const tz = w.carY + Math.cos(w.heading) * dist;
    camera.position.x += (tx - camera.position.x) * 0.15;
    camera.position.y += (height - camera.position.y) * 0.15;
    camera.position.z += (tz - camera.position.z) * 0.15;
    camera.lookAt(w.carX, 0, w.carY);
  });
  return null;
}

function CarMesh({ worldRef, vehicle }: { worldRef: React.MutableRefObject<World>; vehicle: Vehicle }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const w = worldRef.current;
    if (!ref.current) return;
    ref.current.position.set(w.carX, CAR_DEPTH / 2, w.carY);
    ref.current.rotation.y = -w.heading;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[vehicle.width, CAR_DEPTH, vehicle.height]} />
        <meshStandardMaterial color={vehicle.color} />
      </mesh>
      <mesh position={[0, CAR_DEPTH * 0.5 + 3, -vehicle.height * 0.15]}>
        <boxGeometry args={[vehicle.width * 0.7, 6, vehicle.height * 0.4]} />
        <meshStandardMaterial color={'#1a2a3a'} />
      </mesh>
      <mesh position={[0, 0, -vehicle.height / 2 - 2]}>
        <boxGeometry args={[vehicle.width * 0.95, CAR_DEPTH * 0.6, 4]} />
        <meshStandardMaterial color={'#999'} />
      </mesh>
    </group>
  );
}

function ZombieMesh({ z }: { z: Zombie }) {
  const def = ZOMBIE_DEFS[z.kind];
  const isBoss = z.kind === 'boss';
  const depth = isBoss ? BOSS_DEPTH : ZOMBIE_DEPTH;
  const side = z.size * 2;
  return (
    <mesh position={[z.x, depth / 2, z.y]}>
      <boxGeometry args={[side, depth, side]} />
      <meshStandardMaterial color={def.color} />
    </mesh>
  );
}

function ProjectileMesh({ pr }: { pr: Projectile }) {
  const style = projectileBoxStyle(pr.kind);
  return (
    <mesh position={[pr.x, 12, pr.y]}>
      <boxGeometry args={[style.size, style.size, style.size]} />
      <meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={0.5} />
    </mesh>
  );
}

function projectileBoxStyle(kind: string) {
  switch (kind) {
    case 'flame': return { size: 12, color: '#ff7a1a' };
    case 'rocket': return { size: 8, color: '#ff3a3a' };
    case 'laser': return { size: 6, color: '#9cf2ff' };
    default: return { size: 5, color: '#ffd24a' };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  hud: { position: 'absolute' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hudKills: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  hudWave: { color: '#ffd24a', fontWeight: '900', fontSize: 16 },
  hpBar: { marginTop: 6, height: 10, backgroundColor: '#2a0e0e', borderRadius: 5, overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#e34a4a' },
  wheelWrap: { position: 'absolute' },
  cluster: { position: 'absolute' },
  btn: { position: 'absolute', borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  btnGas: { backgroundColor: 'rgba(60,180,90,0.85)', borderColor: '#0a3a18' },
  btnBrake: { backgroundColor: 'rgba(220,80,80,0.85)', borderColor: '#3a0a0a' },
  btnFire: { backgroundColor: 'rgba(255,180,40,0.9)', borderColor: '#3a2a00' },
  btnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  abilityBtn: { position: 'absolute', right: 16, top: 80, backgroundColor: '#222', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 2, borderColor: '#ffd24a' },
  abilityBtnDisabled: { opacity: 0.5, borderColor: '#555' },
  abilityText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 1 },
  abilityCdBar: { marginTop: 6, height: 4, width: 90, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  abilityCdFill: { height: '100%', backgroundColor: '#ffd24a' },
});
