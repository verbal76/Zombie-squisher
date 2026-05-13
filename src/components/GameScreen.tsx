import React, { useEffect, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { Box3, Object3D, Vector3 } from 'three';
import { Progress, Vehicle, Projectile, BloodSpot } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { World, createWorld, step, KILL_SPEED, StreakBannerKind, TUNING } from '../game/engine';
import { VEHICLE_GLB } from '../data/objects';
import { loadVehicleGLB } from '../render/loadVehicle';
import { Thumbstick, ThumbstickHandle } from './Thumbstick';
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

const WHEEL_SIZE = 170;
const BTN_SIZE = 78;
const BTN_GAP = 12;
const MARGIN = 24;

const HUD_TOP = (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44) + 8;

// Pure top-down camera. Setting CAM_OFFSET_X and CAM_OFFSET_Z to 0 puts
// the camera directly over the car (no isometric tilt). CAM_HEIGHT
// controls how zoomed-in we are; lower = closer.
const CAM_OFFSET_X = 0;
const CAM_HEIGHT = 900;
const CAM_OFFSET_Z = 0;
const CAM_FOV = 50;

const CAMERA_CONFIG = {
  position: [ARENA_W / 2 + CAM_OFFSET_X, CAM_HEIGHT, ARENA_H / 2 + CAM_OFFSET_Z] as [number, number, number],
  fov: CAM_FOV,
  near: 1,
  far: 6000,
};

const HUD_TICK_MS = 100;

// Single-stick controls: stick Y is the throttle/brake/reverse axis, stick X
// is the turn axis. The right-side cluster now only hosts the FIRE button;
// the ability button stays in its top-right slot.
const BTN_FIRE_X = 0;
const BTN_FIRE_Y = 0;
const CLUSTER_W = BTN_SIZE;
const CLUSTER_H = BTN_SIZE;

const STICK_KNOB_SIZE = Math.round(WHEEL_SIZE * 0.42);
const STICK_MAX_OFFSET = WHEEL_SIZE / 2 - STICK_KNOB_SIZE / 2 - 4;
const STICK_GRAB_RADIUS = WHEEL_SIZE / 2 + 24;
const CONTROL_OVERLAY_H = Math.max(WHEEL_SIZE, CLUSTER_H) + MARGIN * 2;

const AUTO_FIRE_FOR_TESTING = true;

// Reverse engagement requires a deliberate stick-down within a narrow cone
// of straight-down, with a minimum magnitude. Sideways/diagonal stick is
// pure steering and produces zero throttle, so the player can carve turns
// without accidentally braking.
const REVERSE_GATE_DEGREES = 30;
const REVERSE_MIN_PULL = 0.25;
const STICK_CENTER_DEADZONE = 0.15;

function throttleAxisFromStick(cx: number, cy: number): number {
  const nx = Math.max(-1, Math.min(1, cx / STICK_MAX_OFFSET));
  const ny = Math.max(-1, Math.min(1, cy / STICK_MAX_OFFSET));
  const magnitude = Math.min(1, Math.hypot(nx, ny));

  if (magnitude < STICK_CENTER_DEADZONE) return 0;

  // Stick up (ny < 0) is forward throttle. Magnitude is the Y component so
  // diagonal pushes still throttle, just at reduced gain.
  if (ny < 0) {
    return Math.min(1, -ny);
  }

  // Stick down: only engage brake/reverse when the player aims for it. Must
  // be within a narrow cone of straight-down AND past the minimum pull.
  const angleFromDownDegrees = Math.abs(Math.atan2(nx, ny)) * 180 / Math.PI;
  const insideReverseGate = angleFromDownDegrees <= REVERSE_GATE_DEGREES;

  if (insideReverseGate && magnitude >= REVERSE_MIN_PULL) {
    return -Math.min(1, ny);
  }

  return 0;
}

export function GameScreen({ progress, onEnd }: Props) {
  const worldRef = useRef<World>(createWorld(ARENA_W, ARENA_H, progress));
  const wheelRef = useRef(0);
  // Single-stick throttle axis. Positive = forward throttle, negative = brake/reverse.
  // Magnitude (0..1) is proportional to how far the stick is pushed.
  const throttleAxisRef = useRef(0);
  const fireRef = useRef(AUTO_FIRE_FOR_TESTING);
  const abilityTriggerRef = useRef(false);
  const [, setTick] = useState(0);
  const [exited, setExited] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];

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
        wheel: wheelRef.current,
        throttleAxis: throttleAxisRef.current,
        fire: AUTO_FIRE_FOR_TESTING || fireRef.current,
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

  const stickRef = useRef<ThumbstickHandle>(null);
  const overlayLayoutRef = useRef({ width: 0, height: CONTROL_OVERLAY_H });

  const updateFromTouches = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    const overlayW = overlayLayoutRef.current.width;
    const overlayH = overlayLayoutRef.current.height;

    const stickCx = MARGIN + WHEEL_SIZE / 2;
    const stickCy = overlayH - MARGIN - WHEEL_SIZE / 2;
    const clusterX0 = overlayW - MARGIN - CLUSTER_W;
    const clusterY0 = overlayH - MARGIN - CLUSTER_H;

    let fire = false;
    let stickFound = false;

    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      const x = t.locationX;
      const y = t.locationY;

      if (!stickFound) {
        const dx = x - stickCx;
        const dy = y - stickCy;
        if (Math.hypot(dx, dy) <= STICK_GRAB_RADIUS) {
          let cx = dx;
          let cy = dy;
          const dist = Math.hypot(cx, cy);
          if (dist > STICK_MAX_OFFSET && dist > 0) {
            cx = (cx / dist) * STICK_MAX_OFFSET;
            cy = (cy / dist) * STICK_MAX_OFFSET;
          }
          stickRef.current?.setKnob(cx, cy);
          wheelRef.current = Math.max(-1, Math.min(1, cx / STICK_MAX_OFFSET));
          throttleAxisRef.current = throttleAxisFromStick(cx, cy);
          stickFound = true;
          continue;
        }
      }

      const bx = x - clusterX0;
      const by = y - clusterY0;
      if (bx >= 0 && bx <= CLUSTER_W && by >= 0 && by <= CLUSTER_H) {
        if (bx >= BTN_FIRE_X && bx <= BTN_FIRE_X + BTN_SIZE && by >= BTN_FIRE_Y && by <= BTN_FIRE_Y + BTN_SIZE) fire = true;
      }
    }

    if (!stickFound) {
      stickRef.current?.springHome();
      wheelRef.current = 0;
      throttleAxisRef.current = 0;
    }

    fireRef.current = AUTO_FIRE_FOR_TESTING || fire;
  };

  const releaseAllControls = () => {
    stickRef.current?.springHome();
    wheelRef.current = 0;
    throttleAxisRef.current = 0;
    fireRef.current = AUTO_FIRE_FOR_TESTING;
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
        <FrameProbe />
        <color attach="background" args={['#3a4a2e']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[400, 600, 200]} intensity={0.6} />

        <CameraTracker world={w} vehicle={vehicle} />

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
        <Text style={styles.dbg}>{dbgCar}</Text>
        <Text style={styles.dbg}>{dbgZ}</Text>
      </View>

      <StreakBanner world={w} />

      <Pressable style={[styles.gear, { top: HUD_TOP - 2 }]} onPress={() => setAboutOpen(true)} hitSlop={8}>
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: CONTROL_OVERLAY_H,
        }}
        onLayout={(e) => {
          overlayLayoutRef.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={updateFromTouches}
        onResponderMove={updateFromTouches}
        onResponderRelease={releaseAllControls}
        onResponderTerminate={releaseAllControls}
      >
        <View style={{ position: 'absolute', left: MARGIN, bottom: MARGIN }}>
          <Thumbstick ref={stickRef} size={WHEEL_SIZE} />
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: MARGIN,
            bottom: MARGIN,
            width: CLUSTER_W,
            height: CLUSTER_H,
          }}
        >
          <View style={[styles.btn, styles.btnFire, { left: BTN_FIRE_X, top: BTN_FIRE_Y, width: BTN_SIZE, height: BTN_SIZE }]}>
            <Text style={styles.btnText}>{AUTO_FIRE_FOR_TESTING ? 'AUTO' : 'FIRE'}</Text>
          </View>
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

// Bumps the global frame counter every render tick and captures the GL
// drawing buffer dimensions on first frame. Anything inside the Canvas
// can call useFrame; this one's job is purely to surface render-loop
// liveness to the diagnostics panel.
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
    tex.offset.set(world.carX / 100, world.carY / 100);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[6000, 6000]} />
      <meshLambertMaterial map={tex} />
    </mesh>
  );
}

// Reference vehicle length the camera was tuned for. Vehicles longer than
// this pull the camera back proportionally so the whole car stays in frame
// and the size hierarchy is visible (tank reads as bigger than hatchback,
// not just same-frame-different-mesh).
const CAM_REFERENCE_LENGTH = 80;

function CameraTracker({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  const zoomState = useRef<number>(1.0);
  const zoomInit = useRef(false);
  // Per-vehicle baseline: longer vehicles pull camera back, floored at 0.85
  // so tiny vehicles don't pinch us in.
  const vehicleZoom = Math.max(0.85, vehicle.height / CAM_REFERENCE_LENGTH);
  useFrame((state, dt) => {
    if (!zoomInit.current) {
      zoomState.current = vehicleZoom;
      zoomInit.current = true;
    }
    // Camera anchors directly to the car position. No velocity lookahead or
    // focal smoothing -- those couple the camera to gas/brake momentum, which
    // made stationary zombies appear to slide along with the car during
    // acceleration and braking.
    //
    // Context-aware zoom is kept: scan zombies within consideration radius for
    // the biggest one. Bosses (size 36) pull the camera back so their full
    // silhouette reads; walkers (size 14) contribute nothing.
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
    // Slow lerp so the zoom doesn't twitch as zombies pop in and out of range.
    const zoomAlpha = 1 - Math.exp(-TUNING.CAMERA_ZOOM_K * dt);
    zoomState.current += (targetZoom - zoomState.current) * zoomAlpha;
    const zoom = zoomState.current;
    // Shake: small random offset scaled by world.shake (kill / explosion impulse).
    const sx = (Math.random() - 0.5) * world.shake * 3;
    const sz = (Math.random() - 0.5) * world.shake * 3;
    // Scale all three offsets (X, Y, Z) by the same zoom factor so the camera
    // angle stays constant -- you only see more of the world, not a different
    // perspective.
    state.camera.position.set(
      world.carX + CAM_OFFSET_X * zoom + sx,
      CAM_HEIGHT * zoom,
      world.carY + CAM_OFFSET_Z * zoom + sz,
    );
    state.camera.lookAt(world.carX, 0, world.carY);
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

// Kenney vehicle GLBs are authored at varying intrinsic sizes (a tank is
// natively much larger than a hatchback). Applying a uniform scale based
// on vehicle.width alone produces inconsistent on-screen footprints. We
// instead auto-fit after load: measure the model's bbox, then scale so
// its longest horizontal axis lands on the game's `vehicle.height` length
// (multiplied by CAR_VISUAL_SCALE). Proportions stay correct per GLB,
// and the rendered footprint matches the gameplay AABB.
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
    outer.current.rotation.y = -world.heading;

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
          // Box fallback while GLB is loading.
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
  // Bar fill is normalized momentum (0..1 of vehicle's gameplay top speed).
  // mph readout is realistic per vehicle.
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
        // Clear the trigger so a future identical kind can re-fire.
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
  btn: { position: 'absolute', borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  btnFire: { backgroundColor: 'rgba(255,180,40,0.9)', borderColor: '#3a2a00' },
  btnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
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
