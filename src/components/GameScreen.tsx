import React, { useEffect, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { Box3, Object3D, Vector3 } from 'three';
import { Progress, Vehicle, Projectile, BloodSpot } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { World, createWorld, step, KILL_SPEED, StreakBannerKind, TUNING, GearState } from '../game/engine';
import { VEHICLE_GLB } from '../data/objects';
import { loadVehicleGLB } from '../render/loadVehicle';
import { AboutModal } from './AboutModal';
import { ZombieCharacter } from './ZombieCharacter';
import { getGrassTexture } from '../render/grassTexture';
import { Diag } from '../debug/diagnostics';

interface Props {
  progress: Progress;
  onEnd: (kills: number) => void;
}

const ARENA_W = 1200;
const ARENA_H = 1200;
const CAR_DEPTH = 18;
const CAR_LIFT = 1;

const HUD_TOP = (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44) + 8;

const CHASE_DISTANCE   = 140;
const CHASE_HEIGHT     = 85;
const CHASE_LOOK_AHEAD = 240;
const CHASE_HEADING_K  = 4.0;
const CAM_FOV = 65;

const CAMERA_CONFIG = {
  position: [ARENA_W / 2, CHASE_HEIGHT, ARENA_H / 2 + CHASE_DISTANCE] as [number, number, number],
  fov: CAM_FOV,
  near: 1,
  far: 6000,
};

const HUD_TICK_MS = 100;

// === Button layout ===
//   bottom-left:   [ ◀ LEFT ] [ F ]
//   right column:   [ TURBO ]                       (stacked above the RIGHT arrow)
//                  [ R ] [ ▶ RIGHT ]
const ARROW_BTN_SIZE = 88;
const MID_BTN_SIZE   = 68;
const INTRA_CLUSTER_GAP = 14;
const INTRA_VERTICAL_GAP = 12; // vertical gap between TURBO and the right-arrow it sits above
const EDGE_MARGIN = 16;
const BUTTON_ROW_BOTTOM = 22;
const BUTTON_ROW_HITSLOP = 22;
// Container extends taller to accommodate the TURBO stacked above the bottom row.
const CONTROL_OVERLAY_H = ARROW_BTN_SIZE + MID_BTN_SIZE + INTRA_VERTICAL_GAP + BUTTON_ROW_BOTTOM * 2;

type TouchKind = 'steerLeft' | 'steerRight' | 'gearForward' | 'gearReverse' | 'turbo';
interface TouchState { kind: TouchKind; }

const HOLD_KINDS = new Set<TouchKind>(['steerLeft', 'steerRight', 'turbo']);
const TAP_KINDS  = new Set<TouchKind>(['gearForward', 'gearReverse']);

// === Static horizon buildings ===
const HORIZON_BUILDING_COUNT = 56;
const HORIZON_MIN_DIST = 1800;
const HORIZON_MAX_DIST = 2600;
const HORIZON_BUILDING_COLORS = [
  '#2a3744', '#3a4250', '#404a58', '#2d3340', '#4a4754',
  '#383448', '#2a3a50', '#403838', '#384858', '#2e3e4a',
];

interface HorizonBuilding {
  dx: number;
  dy: number;
  width: number;
  height: number;
  depth: number;
  color: string;
}

const HORIZON_BUILDINGS: HorizonBuilding[] = (() => {
  const out: HorizonBuilding[] = [];
  for (let i = 0; i < HORIZON_BUILDING_COUNT; i++) {
    const angle = (i / HORIZON_BUILDING_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.20;
    const dist = HORIZON_MIN_DIST + Math.random() * (HORIZON_MAX_DIST - HORIZON_MIN_DIST);
    out.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      width:  90 + Math.random() * 180,
      height: 80 + Math.random() * 320,
      depth:  90 + Math.random() * 180,
      color:  HORIZON_BUILDING_COLORS[i % HORIZON_BUILDING_COLORS.length],
    });
  }
  return out;
})();

export function GameScreen({ progress, onEnd }: Props) {
  const worldRef = useRef<World>(createWorld(ARENA_W, ARENA_H, progress));
  const steerLeftRef  = useRef(false);
  const steerRightRef = useRef(false);
  const gearRef       = useRef<GearState>('forward');
  const turboRef      = useRef(false);
  const abilityTriggerRef = useRef(false);
  const [gearVisual, setGearVisual] = useState<GearState>('forward');
  const [turboVisual, setTurboVisual] = useState(false);
  const [, setTick] = useState(0);
  const [exited, setExited] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];

  const { width: sw, height: sh } = useWindowDimensions();

  // Bottom row Y (arrows + F + R all share this row's center).
  const rowCenterY = sh - BUTTON_ROW_BOTTOM - ARROW_BTN_SIZE / 2;
  const arrowY = rowCenterY - ARROW_BTN_SIZE / 2;
  const midY   = rowCenterY - MID_BTN_SIZE / 2;

  // Bottom-left cluster.
  const leftArrowX = EDGE_MARGIN;
  const fwdBtnX    = EDGE_MARGIN + ARROW_BTN_SIZE + INTRA_CLUSTER_GAP;

  // Bottom-right cluster.
  const rightArrowX = sw - EDGE_MARGIN - ARROW_BTN_SIZE;
  const revBtnX     = sw - EDGE_MARGIN - ARROW_BTN_SIZE - INTRA_CLUSTER_GAP - MID_BTN_SIZE;

  // TURBO: sits directly ABOVE the right arrow, horizontally centered to it.
  const turboX = rightArrowX + (ARROW_BTN_SIZE - MID_BTN_SIZE) / 2;
  const turboY = arrowY - INTRA_VERTICAL_GAP - MID_BTN_SIZE;

  const btnLayouts: { kind: TouchKind; x: number; y: number; w: number; h: number }[] = [
    { kind: 'steerLeft',   x: leftArrowX,  y: arrowY, w: ARROW_BTN_SIZE, h: ARROW_BTN_SIZE },
    { kind: 'gearForward', x: fwdBtnX,     y: midY,   w: MID_BTN_SIZE,   h: MID_BTN_SIZE   },
    { kind: 'turbo',       x: turboX,      y: turboY, w: MID_BTN_SIZE,   h: MID_BTN_SIZE   },
    { kind: 'gearReverse', x: revBtnX,     y: midY,   w: MID_BTN_SIZE,   h: MID_BTN_SIZE   },
    { kind: 'steerRight',  x: rightArrowX, y: arrowY, w: ARROW_BTN_SIZE, h: ARROW_BTN_SIZE },
  ];

  const touchesRef = useRef<Map<number | string, TouchState>>(new Map());

  useEffect(() => {
    Diag.resetFrames();
    Diag.clearRenderError();
    let raf = 0;
    let last = performance.now();
    let lastHudTick = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      step(w, dt, {
        steerLeft:  steerLeftRef.current,
        steerRight: steerRightRef.current,
        gear:       gearRef.current,
        turbo:      turboRef.current,
        fire:       true,
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

  function classify(x: number, y: number): TouchKind | null {
    for (const b of btnLayouts) {
      if (
        x >= b.x - BUTTON_ROW_HITSLOP && x <= b.x + b.w + BUTTON_ROW_HITSLOP &&
        y >= b.y - BUTTON_ROW_HITSLOP && y <= b.y + b.h + BUTTON_ROW_HITSLOP
      ) {
        return b.kind;
      }
    }
    return null;
  }

  function setHoldState(kind: TouchKind, on: boolean) {
    if (kind === 'steerLeft')  steerLeftRef.current  = on;
    if (kind === 'steerRight') steerRightRef.current = on;
    if (kind === 'turbo') {
      turboRef.current = on;
      setTurboVisual(on);
    }
  }

  function triggerTap(kind: TouchKind) {
    if (kind === 'gearForward') {
      gearRef.current = 'forward';
      setGearVisual('forward');
    } else if (kind === 'gearReverse') {
      gearRef.current = 'reverse';
      setGearVisual('reverse');
    }
  }

  function shouldSetResponder(e: GestureResponderEvent) {
    return classify(e.nativeEvent.pageX, e.nativeEvent.pageY) !== null;
  }

  function processTouches(e: GestureResponderEvent) {
    const active = e.nativeEvent.touches || [];
    const activeIds = new Set(active.map((t) => t.identifier));

    for (const t of active) {
      const id = t.identifier;
      const tx = (t as any).pageX ?? t.pageX;
      const ty = (t as any).pageY ?? t.pageY;
      if (!touchesRef.current.has(id)) {
        const kind = classify(tx, ty);
        if (!kind) continue;
        touchesRef.current.set(id, { kind });
        if (HOLD_KINDS.has(kind)) setHoldState(kind, true);
        else if (TAP_KINDS.has(kind)) triggerTap(kind);
      }
    }

    const ended = (e.nativeEvent.changedTouches || []).filter(
      (t) => !activeIds.has(t.identifier),
    );
    for (const t of ended) {
      const state = touchesRef.current.get(t.identifier);
      if (!state) continue;
      touchesRef.current.delete(t.identifier);
      if (HOLD_KINDS.has(state.kind)) setHoldState(state.kind, false);
    }
  }

  function onResponderRelease() {
    for (const state of Array.from(touchesRef.current.values())) {
      if (HOLD_KINDS.has(state.kind)) setHoldState(state.kind, false);
    }
    touchesRef.current.clear();
  }

  const _sH = Math.sin(w.heading);
  const _cH = Math.cos(w.heading);
  const _vL = w.carVx * _cH + w.carVy * _sH;
  const dbgEng = `hd=${(w.heading * 180 / Math.PI).toFixed(0)}°  vF=${w.forwardV.toFixed(0)}  vL=${_vL.toFixed(0)}  ω=${w.angularVelocity.toFixed(2)}`;
  const dbgInp = `L=${steerLeftRef.current ? 1 : 0}  R=${steerRightRef.current ? 1 : 0}  gear=${gearVisual}  turbo=${turboVisual ? 1 : 0}`;
  const dbgZ = `z=${w.zombies.length}  pr=${w.projectiles.length}  hp=${w.hp.toFixed(0)}/${w.maxHp.toFixed(0)}`;

  return (
    <View style={styles.root}>
      <Canvas
        style={StyleSheet.absoluteFill}
        gl={{ antialias: true }}
        camera={CAMERA_CONFIG}
      >
        <FrameProbe />
        <color attach="background" args={['#88a0cc']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[400, 600, 200]} intensity={0.6} />

        <CameraTracker world={w} vehicle={vehicle} />

        <Horizon world={w} />

        <GrassGround world={w} />

        <CarMesh world={w} vehicle={vehicle} />

        {w.bloodSpots.map((b) => (
          <BloodMesh key={b.id} blood={b} />
        ))}
        {w.zombies.map((z) => (
          <ZombieCharacter key={z.id} z={z} />
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
        <View style={styles.gaugeLabelRow}>
          <Text style={styles.gaugeLabel}>VEHICLE HP</Text>
          <Text style={styles.gaugeReadout}>{Math.round(w.hp)} / {Math.round(w.maxHp)}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
        </View>
        <SpeedBar world={w} vehicle={vehicle} />
        {w.streak > 0 && (
          <Text style={styles.streakText}>STREAK ×{w.streak}</Text>
        )}
        <Text style={styles.dbg}>{dbgEng}</Text>
        <Text style={styles.dbg}>{dbgInp}</Text>
        <Text style={styles.dbg}>{dbgZ}</Text>
      </View>

      <StreakBanner world={w} />

      <Pressable style={[styles.gear, { top: HUD_TOP - 2 }]} onPress={() => setAboutOpen(true)} hitSlop={8}>
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <View
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: CONTROL_OVERLAY_H,
        }}
        onStartShouldSetResponder={shouldSetResponder}
        onMoveShouldSetResponder={shouldSetResponder}
        onResponderGrant={processTouches}
        onResponderMove={processTouches}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={onResponderRelease}
      >
        {btnLayouts.map((b) => {
          const pressed =
            (b.kind === 'steerLeft'   && steerLeftRef.current)  ||
            (b.kind === 'steerRight'  && steerRightRef.current) ||
            (b.kind === 'turbo'       && turboVisual);
          const activeGear =
            (b.kind === 'gearForward' && gearVisual === 'forward') ||
            (b.kind === 'gearReverse' && gearVisual === 'reverse');

          let label = '';
          let extraStyle: any = null;
          if (b.kind === 'steerLeft')   { label = '◀'; extraStyle = pressed ? styles.btnPressed : null; }
          else if (b.kind === 'steerRight') { label = '▶'; extraStyle = pressed ? styles.btnPressed : null; }
          else if (b.kind === 'gearForward') { label = 'F';  extraStyle = activeGear ? styles.btnGearForward : null; }
          else if (b.kind === 'gearReverse') { label = 'R';  extraStyle = activeGear ? styles.btnGearReverse : null; }
          else if (b.kind === 'turbo')       { label = '⚡'; extraStyle = pressed ? styles.btnTurbo : null; }

          const isArrow = b.kind === 'steerLeft' || b.kind === 'steerRight';
          const textStyle = isArrow ? styles.arrowText : styles.midBtnText;

          return (
            <View
              key={b.kind}
              pointerEvents="none"
              style={[
                styles.ctlBtn,
                {
                  left: b.x,
                  top: b.y - (sh - CONTROL_OVERLAY_H),
                  width: b.w,
                  height: b.h,
                  borderRadius: b.w / 2,
                },
                extraStyle,
              ]}
            >
              <Text style={textStyle}>{label}</Text>
            </View>
          );
        })}
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

function FrameProbe() {
  const reported = useRef(false);
  useFrame((state) => {
    Diag.frame();
    if (!reported.current) {
      const w = state.size?.width ?? 0;
      const h = state.size?.height ?? 0;
      Diag.setDrawBuf(Math.round(w), Math.round(h));
      Diag.setScene(state.scene.children.length);
      reported.current = true;
    }
  });
  return null;
}

function GrassGround({ world }: { world: World }) {
  const meshRef = useRef<any>(null);
  const tex = getGrassTexture();
  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.set(world.carX, 0, world.carY);
    tex.offset.set(world.carX / 100, -world.carY / 100);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[6000, 6000]} />
      <meshLambertMaterial map={tex} />
    </mesh>
  );
}

function Horizon({ world }: { world: World }) {
  const groupRef = useRef<any>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(world.carX, 0, world.carY);
  });
  return (
    <group ref={groupRef}>
      {HORIZON_BUILDINGS.map((b, i) => (
        <mesh
          key={i}
          position={[b.dx, b.height / 2, b.dy]}
        >
          <boxGeometry args={[b.width, b.height, b.depth]} />
          <meshLambertMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  );
}

const CAM_REFERENCE_LENGTH = 80;

function CameraTracker({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  const zoomState = useRef<number>(1.0);
  const zoomInit = useRef(false);
  const cameraHeading = useRef<number>(0);
  const cameraHeadingInit = useRef(false);
  const vehicleZoom = Math.max(0.85, vehicle.height / CAM_REFERENCE_LENGTH);

  useFrame((state, dt) => {
    if (!zoomInit.current) {
      zoomState.current = vehicleZoom;
      zoomInit.current = true;
    }
    if (!cameraHeadingInit.current) {
      cameraHeading.current = world.heading;
      cameraHeadingInit.current = true;
    }

    let maxNearbySize = 0;
    const rSq = TUNING.ZOOM_CONSIDERATION_RADIUS * TUNING.ZOOM_CONSIDERATION_RADIUS;
    for (const z of world.zombies) {
      const ddx = z.x - world.carX;
      const ddy = z.y - world.carY;
      if (ddx * ddx + ddy * ddy < rSq && z.size > maxNearbySize) maxNearbySize = z.size;
    }
    const sizeFrac = Math.max(0, Math.min(1,
      (maxNearbySize - TUNING.ZOOM_SIZE_THRESHOLD) /
      (TUNING.ZOOM_SIZE_AT_MIN - TUNING.ZOOM_SIZE_THRESHOLD)
    ));
    const targetZoom = vehicleZoom * (1 + sizeFrac * TUNING.ZOOM_BOSS_BONUS);
    const zoomAlpha = 1 - Math.exp(-TUNING.CAMERA_ZOOM_K * dt);
    zoomState.current += (targetZoom - zoomState.current) * zoomAlpha;
    const zoom = zoomState.current;

    let dh = world.heading - cameraHeading.current;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const hAlpha = 1 - Math.exp(-CHASE_HEADING_K * dt);
    cameraHeading.current += dh * hAlpha;

    const camS = Math.sin(cameraHeading.current);
    const camC = Math.cos(cameraHeading.current);
    const fwdX = camS;
    const fwdZ = -camC;

    const camX = world.carX - fwdX * CHASE_DISTANCE * zoom;
    const camZ = world.carY - fwdZ * CHASE_DISTANCE * zoom;
    const camY = CHASE_HEIGHT * zoom;

    const lookX = world.carX + fwdX * CHASE_LOOK_AHEAD;
    const lookZ = world.carY + fwdZ * CHASE_LOOK_AHEAD;

    const sx = (Math.random() - 0.5) * world.shake * 3;
    const sz = (Math.random() - 0.5) * world.shake * 3;

    state.camera.position.set(camX + sx, camY, camZ + sz);
    state.camera.lookAt(lookX, 0, lookZ);
  });
  return null;
}

function BloodMesh({ blood }: { blood: BloodSpot }) {
  const meshRef = useRef<any>(null);
  const matRef = useRef<any>(null);
  useFrame(() => {
    if (meshRef.current) meshRef.current.position.set(blood.x, 0.5, blood.y);
    if (matRef.current) matRef.current.opacity = Math.max(0, blood.alpha);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[blood.size, 10]} />
      <meshBasicMaterial ref={matRef} color={'#3a0a0a'} transparent opacity={blood.alpha} />
    </mesh>
  );
}

const CAR_VISUAL_SCALE = 1.2;
const MAX_BODY_PITCH = 0.12;
const MAX_BODY_ROLL = 0.14;
const VEH_GLB_Y = CAR_LIFT;

function fitScaleFor(model: Object3D, vehicle: Vehicle): number {
  const bbox = new Box3().setFromObject(model);
  const size = bbox.getSize(new Vector3());
  const naturalLength = Math.max(size.x, size.z);
  if (!Number.isFinite(naturalLength) || naturalLength <= 0) return CAR_VISUAL_SCALE;
  const targetLength = vehicle.height * CAR_VISUAL_SCALE;
  return targetLength / naturalLength;
}

function CarMesh({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  const outer = useRef<any>(null);
  const inner = useRef<any>(null);
  const lastV = useRef(0);
  const pitch = useRef(0);
  const roll = useRef(0);
  const [model, setModel] = useState<Object3D | null>(null);
  const [autoScale, setAutoScale] = useState<number>(CAR_VISUAL_SCALE);

  useEffect(() => {
    let mounted = true;
    const mod = VEHICLE_GLB[vehicle.id];
    loadVehicleGLB(mod)
      .then((m) => {
        if (!mounted) return;
        setAutoScale(fitScaleFor(m, vehicle));
        setModel(m);
      })
      .catch((err) => console.warn('vehicle GLB load failed', vehicle.id, err?.message ?? err));
    return () => { mounted = false; };
  }, [vehicle.id, vehicle.height]);

  useFrame((_, dt) => {
    if (!outer.current || !inner.current) return;
    const carY = model ? VEH_GLB_Y : CAR_DEPTH / 2 + CAR_LIFT;
    outer.current.position.set(world.carX, carY, world.carY);
    outer.current.rotation.y = -world.heading + Math.PI;

    const safeDt = Math.max(0.001, dt);
    const accel = (world.forwardV - lastV.current) / safeDt;
    lastV.current = world.forwardV;

    const targetPitch = Math.max(-MAX_BODY_PITCH, Math.min(MAX_BODY_PITCH, accel * 0.0015));
    const speedNorm = Math.min(1, Math.abs(world.forwardV) / 250);
    const targetRoll = Math.max(-MAX_BODY_ROLL, Math.min(MAX_BODY_ROLL, world.steeringAngle * speedNorm * 0.18));

    const lerp = 1 - Math.pow(0.05, dt);
    pitch.current += (targetPitch - pitch.current) * lerp;
    roll.current += (targetRoll - roll.current) * lerp;

    inner.current.rotation.x = pitch.current;
    inner.current.rotation.z = roll.current;
  });

  return (
    <group ref={outer}>
      <group ref={inner}>
        {model ? (
          <group scale={autoScale}>
            <primitive object={model} />
          </group>
        ) : (
          <group scale={CAR_VISUAL_SCALE}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[vehicle.width, CAR_DEPTH, vehicle.height]} />
              <meshLambertMaterial color={vehicle.color} />
            </mesh>
            <mesh position={[0, 0, -vehicle.height / 2 - 2]}>
              <boxGeometry args={[vehicle.width * 0.95, CAR_DEPTH * 0.6, 4]} />
              <meshLambertMaterial color={'#999'} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

function ProjectileMesh({ pr }: { pr: Projectile }) {
  const meshRef = useRef<any>(null);
  const style = projectileBoxStyle(pr.kind);
  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.set(pr.x, 12, pr.y);
  });
  return (
    <mesh ref={meshRef}>
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

function SpeedBar({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  const fillPct = Math.max(0, Math.min(1, world.momentum)) * 100;
  const tickPct = Math.max(0, Math.min(1, KILL_SPEED / Math.max(1, vehicle.baseSpeed))) * 100;
  const inKillRange = world.momentum * vehicle.baseSpeed >= KILL_SPEED;
  const fillColor = inKillRange ? '#3acb55' : '#e34a4a';
  const mphNow = Math.round(world.momentum * vehicle.topSpeedMph);
  return (
    <>
      <View style={styles.gaugeLabelRow}>
        <Text style={styles.gaugeLabel}>SPEED</Text>
        <Text style={styles.gaugeReadout}>{mphNow} / {vehicle.topSpeedMph} MPH</Text>
      </View>
      <View style={styles.momentumWrap}>
        <View style={[styles.momentumFill, { width: `${fillPct}%`, backgroundColor: fillColor }]} />
        <View style={[styles.momentumTick, { left: `${tickPct}%` }]} />
      </View>
    </>
  );
}

const STREAK_LABELS: Record<Exclude<StreakBannerKind, null>, string> = {
  spree: 'KILLING SPREE',
  reaper: 'ROAD REAPER',
  breaker: 'HORDE BREAKER',
  apocalypse: 'APOCALYPSE ENGINE',
};

function StreakBanner({ world }: { world: World }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visibleKind, setVisibleKind] = useState<StreakBannerKind>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (world.streakBannerKind && world.streakBannerAt !== lastAt.current) {
      lastAt.current = world.streakBannerAt;
      setVisibleKind(world.streakBannerKind);
      opacity.stopAnimation();
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        setVisibleKind(null);
        world.streakBannerKind = null;
      });
    }
  });

  if (!visibleKind) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.streakBanner, { opacity }]}>
      <Text style={styles.streakBannerText}>{STREAK_LABELS[visibleKind]}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  hud: { position: 'absolute' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hudKills: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  hudWave: { color: '#ffd24a', fontWeight: '900', fontSize: 16 },
  hpBar: { marginTop: 2, height: 10, backgroundColor: '#2a0e0e', borderRadius: 5, overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#e34a4a' },
  dbg: { color: '#9ff', fontFamily: 'Courier', fontSize: 11, marginTop: 4 },
  gear: { position: 'absolute', right: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(26,26,26,0.85)', borderWidth: 2, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  gearIcon: { color: '#ffd24a', fontSize: 22, lineHeight: 26 },

  ctlBtn: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.30)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    backgroundColor: 'rgba(34,211,238,0.30)',
    borderColor: 'rgba(34,211,238,0.90)',
  },
  btnGearForward: {
    backgroundColor: 'rgba(34,211,238,0.25)',
    borderColor: '#22d3ee',
  },
  btnGearReverse: {
    backgroundColor: 'rgba(249,115,22,0.25)',
    borderColor: '#f97316',
  },
  btnTurbo: {
    backgroundColor: 'rgba(255,210,74,0.30)',
    borderColor: '#ffd24a',
  },
  arrowText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  midBtnText:  { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },

  abilityBtn: { position: 'absolute', right: 16, top: 80, backgroundColor: '#222', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: '#ffd24a', minWidth: 110, alignItems: 'center' },
  abilityBtnDisabled: { opacity: 0.5, borderColor: '#555' },
  abilityText: { color: '#ffd24a', fontWeight: '800', fontSize: 13 },
  abilityCdBar: { marginTop: 6, height: 4, width: 90, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  abilityCdFill: { height: '100%', backgroundColor: '#ffd24a' },
  momentumWrap: { marginTop: 2, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  momentumFill: { height: '100%' },
  momentumTick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#ffd24a' },
  gaugeLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  gaugeLabel: { color: '#ccc', fontWeight: '700', fontSize: 10, letterSpacing: 1.2 },
  gaugeReadout: { color: '#fff', fontWeight: '700', fontSize: 10, letterSpacing: 0.6 },
  streakText: { color: '#ffd24a', fontWeight: '900', fontSize: 14, marginTop: 4, letterSpacing: 1 },
  streakBanner: { position: 'absolute', top: '32%', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  streakBannerText: { color: '#ffd24a', fontWeight: '900', fontSize: 32, letterSpacing: 3, textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
});
