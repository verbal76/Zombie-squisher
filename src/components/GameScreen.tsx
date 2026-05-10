import React, { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Canvas, useThree } from '@react-three/fiber/native';
import { Progress, Vehicle, Zombie, Projectile } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { ZOMBIE_DEFS } from '../data/zombies';
import { World, createWorld, step } from '../game/engine';
import { Thumbstick } from './Thumbstick';
import { AboutModal } from './AboutModal';

interface Props {
  progress: Progress;
  onEnd: (kills: number) => void;
}

const ARENA_W = 1200;
const ARENA_H = 1200;
const CAR_DEPTH = 18;
const ZOMBIE_DEPTH = 16;
const BOSS_DEPTH = 28;
const CAR_LIFT = 1;

const WHEEL_SIZE = 170;
const BTN_SIZE = 78;
const BTN_GAP = 12;
const MARGIN = 24;

const HUD_TOP = (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44) + 8;

const CAM_OFFSET_X = 800;
const CAM_HEIGHT = 1600;
const CAM_OFFSET_Z = 800;
const CAM_FOV = 50;

const CAMERA_CONFIG = {
  position: [ARENA_W / 2 + CAM_OFFSET_X, CAM_HEIGHT, ARENA_H / 2 + CAM_OFFSET_Z] as [number, number, number],
  fov: CAM_FOV,
  near: 1,
  far: 6000,
};

const HUD_TICK_MS = 100;

const BTN_GAS_X = 0;
const BTN_GAS_Y = BTN_SIZE + BTN_GAP;
const BTN_FIRE_X = BTN_SIZE + BTN_GAP;
const BTN_FIRE_Y = 0;
const BTN_BRAKE_X = BTN_SIZE + BTN_GAP;
const BTN_BRAKE_Y = BTN_SIZE + BTN_GAP;
const CLUSTER_W = BTN_SIZE * 2 + BTN_GAP;
const CLUSTER_H = BTN_SIZE * 2 + BTN_GAP;

export function GameScreen({ progress, onEnd }: Props) {
  const worldRef = useRef<World>(createWorld(ARENA_W, ARENA_H, progress));
  const wheelRef = useRef(0);
  const throttleRef = useRef(false);
  const brakeRef = useRef(false);
  const fireRef = useRef(false);
  const abilityTriggerRef = useRef(false);
  const [, setTick] = useState(0);
  const [exited, setExited] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastHudTick = last;
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
      if (now - lastHudTick >= HUD_TICK_MS) {
        lastHudTick = now;
        setTick((t) => (t + 1) % 1000000);
      }
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

  const updateClusterFromTouches = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    let fire = false;
    let gas = false;
    let brake = false;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      const x = t.locationX;
      const y = t.locationY;
      if (x >= BTN_FIRE_X && x <= BTN_FIRE_X + BTN_SIZE && y >= BTN_FIRE_Y && y <= BTN_FIRE_Y + BTN_SIZE) fire = true;
      if (x >= BTN_GAS_X && x <= BTN_GAS_X + BTN_SIZE && y >= BTN_GAS_Y && y <= BTN_GAS_Y + BTN_SIZE) gas = true;
      if (x >= BTN_BRAKE_X && x <= BTN_BRAKE_X + BTN_SIZE && y >= BTN_BRAKE_Y && y <= BTN_BRAKE_Y + BTN_SIZE) brake = true;
    }
    fireRef.current = fire;
    throttleRef.current = gas;
    brakeRef.current = brake;
  };
  const releaseAllButtons = () => {
    fireRef.current = false;
    throttleRef.current = false;
    brakeRef.current = false;
  };

  const dbgCar = `car (${w.carX.toFixed(0)}, ${w.carY.toFixed(0)})  hd=${w.heading.toFixed(2)}  v=${w.forwardV.toFixed(0)}`;
  const dbgZ = `z=${w.zombies.length}  pr=${w.projectiles.length}  hp=${w.hp.toFixed(0)}/${w.maxHp.toFixed(0)}`;

  return (
    <View style={styles.root}>
      <Canvas
        style={StyleSheet.absoluteFill}
        gl={{ antialias: true }}
        camera={CAMERA_CONFIG}
      >
        <color attach="background" args={['#3a4a2e']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[400, 600, 200]} intensity={0.6} />

        <CameraTracker carX={w.carX} carY={w.carY} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ARENA_W / 2, 0, ARENA_H / 2]}>
          <planeGeometry args={[6000, 6000]} />
          <meshLambertMaterial color={'#3a4a2e'} />
        </mesh>

        <CarMesh carX={w.carX} carY={w.carY} heading={w.heading} vehicle={vehicle} />

        {w.zombies.map((z) => (
          <ZombieMesh key={z.id} z={z} />
        ))}
        {w.projectiles.map((pr) => (
          <ProjectileMesh key={pr.id} pr={pr} />
        ))}
      </Canvas>

      <View style={[styles.hud, { top: HUD_TOP, left: 12, right: 60 }]} pointerEvents="none">
        <View style={styles.hudRow}>
          <Text style={styles.hudKills}>KILLS {w.kills}</Text>
          <Text style={styles.hudWave}>WAVE {w.wave + 1}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
        </View>
        <Text style={styles.dbg}>{dbgCar}</Text>
        <Text style={styles.dbg}>{dbgZ}</Text>
      </View>

      <Pressable style={[styles.gear, { top: HUD_TOP - 2 }]} onPress={() => setAboutOpen(true)} hitSlop={8}>
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <View style={{ position: 'absolute', left: MARGIN, bottom: MARGIN }}>
        <Thumbstick size={WHEEL_SIZE} onChange={(t) => (wheelRef.current = t)} />
      </View>

      <View
        style={{
          position: 'absolute',
          right: MARGIN,
          bottom: MARGIN,
          width: CLUSTER_W,
          height: CLUSTER_H,
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={updateClusterFromTouches}
        onResponderMove={updateClusterFromTouches}
        onResponderRelease={releaseAllButtons}
        onResponderTerminate={releaseAllButtons}
      >
        <View pointerEvents="none" style={[styles.btn, styles.btnFire, { left: BTN_FIRE_X, top: BTN_FIRE_Y, width: BTN_SIZE, height: BTN_SIZE }]}>
          <Text style={styles.btnText}>FIRE</Text>
        </View>
        <View pointerEvents="none" style={[styles.btn, styles.btnGas, { left: BTN_GAS_X, top: BTN_GAS_Y, width: BTN_SIZE, height: BTN_SIZE }]}>
          <Text style={styles.btnText}>GAS</Text>
        </View>
        <View pointerEvents="none" style={[styles.btn, styles.btnBrake, { left: BTN_BRAKE_X, top: BTN_BRAKE_Y, width: BTN_SIZE, height: BTN_SIZE }]}>
          <Text style={styles.btnText}>BRAKE</Text>
        </View>
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

      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </View>
  );
}

function CameraTracker({ carX, carY }: { carX: number; carY: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(carX + CAM_OFFSET_X, CAM_HEIGHT, carY + CAM_OFFSET_Z);
    camera.lookAt(carX, 0, carY);
  });
  return null;
}

function CarMesh({ carX, carY, heading, vehicle }: {
  carX: number; carY: number; heading: number; vehicle: Vehicle;
}) {
  return (
    <group position={[carX, CAR_DEPTH / 2 + CAR_LIFT, carY]} rotation={[0, -heading, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[vehicle.width, CAR_DEPTH, vehicle.height]} />
        <meshLambertMaterial color={vehicle.color} />
      </mesh>
      <mesh position={[0, 0, -vehicle.height / 2 - 2]}>
        <boxGeometry args={[vehicle.width * 0.95, CAR_DEPTH * 0.6, 4]} />
        <meshLambertMaterial color={'#999'} />
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
      <meshLambertMaterial color={def.color} />
    </mesh>
  );
}

function ProjectileMesh({ pr }: { pr: Projectile }) {
  const style = projectileBoxStyle(pr.kind);
  return (
    <mesh position={[pr.x, 12, pr.y]}>
      <boxGeometry args={[style.size, style.size, style.size]} />
      <meshBasicMaterial color={style.color} />
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
  dbg: { color: '#9ff', fontFamily: 'Courier', fontSize: 11, marginTop: 4 },
  gear: { position: 'absolute', right: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(26,26,26,0.85)', borderWidth: 2, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  gearIcon: { color: '#ffd24a', fontSize: 22, lineHeight: 26 },
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
