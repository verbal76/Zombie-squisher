import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { Box3, Object3D, Vector3 } from 'three';
import { StyleSheet } from 'react-native';
import { Vehicle, Projectile } from '../types';
import { World, TUNING } from '../game/engine';
import { VEHICLE_GLB } from '../data/objects';
import { loadVehicleGLB } from '../render/loadVehicle';
import { getGrassTexture } from '../render/grassTexture';
import { Diag } from '../debug/diagnostics';
import { ZombieHorde } from './ZombieHorde';
import { BloodSplats } from './BloodSplats';

const ARENA_W = 1200;
const ARENA_H = 1200;
const CAR_DEPTH = 18;
const CAR_LIFT = 1;

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


/** The 3D world: ground, skyline, car, horde, blood and projectiles, with the chase camera. No HUD or input. */
export function GameScene({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  return (
    <Canvas style={StyleSheet.absoluteFillObject} gl={{ antialias: true }} camera={CAMERA_CONFIG}>
      <FrameProbe />
      <color attach="background" args={['#88a0cc']} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[400, 600, 200]} intensity={0.6} />

      <CameraTracker world={world} vehicle={vehicle} />
      <Horizon world={world} />
      <GrassGround world={world} />
      <CarMesh world={world} vehicle={vehicle} />
      <BloodSplats world={world} />
      <ZombieHorde world={world} />
      {world.projectiles.map((pr) => (
        <ProjectileMesh key={pr.id} pr={pr} />
      ))}
    </Canvas>
  );
}
