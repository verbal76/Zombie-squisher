import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Progress } from '../types';
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

const WHEEL_SIZE = 150;
const BTN_SIZE = 78;
const BTN_GAP = 12;
const MARGIN = 24;

export function GameScreen({ progress, onEnd }: Props) {
  const { width: WIN_W, height: WIN_H } = useWindowDimensions();

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

  // Camera follow: offset the world so the car stays centered on screen.
  const camX = WIN_W / 2 - w.carX;
  const camY = WIN_H / 2 - w.carY;

  const headingDeg = (w.heading * 180) / Math.PI;
  const carWidth = vehicle.width;
  const carHeight = vehicle.height;
  const carDark = shade(vehicle.color, -0.5);

  return (
    <View style={styles.root}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: ARENA_W,
          height: ARENA_H,
          transform: [{ translateX: camX }, { translateY: camY }],
        }}
      >
        <View style={styles.ground} />

        <View style={[styles.wall, { left: 0, top: -6, width: ARENA_W, height: 6 }]} />
        <View style={[styles.wall, { left: 0, top: ARENA_H, width: ARENA_W, height: 6 }]} />
        <View style={[styles.wall, { left: -6, top: 0, width: 6, height: ARENA_H }]} />
        <View style={[styles.wall, { left: ARENA_W, top: 0, width: 6, height: ARENA_H }]} />

        {w.bloodSpots.map((b) => (
          <View
            key={b.id}
            style={{
              position: 'absolute',
              left: b.x - b.size / 2,
              top: b.y - b.size / 2,
              width: b.size,
              height: b.size,
              borderRadius: b.size / 2,
              backgroundColor: '#5a0a14',
              opacity: Math.max(0, Math.min(0.85, b.alpha)),
            }}
          />
        ))}

        {w.zombies.map((z) => {
          const def = ZOMBIE_DEFS[z.kind];
          const isBoss = z.kind === 'boss';
          const side = z.size * 2;
          const depth = isBoss ? 12 : 7;
          const dark = shade(def.color, -0.45);
          return (
            <React.Fragment key={z.id}>
              <View
                style={{
                  position: 'absolute',
                  left: z.x - z.size + depth * 0.4,
                  top: z.y - z.size + depth,
                  width: side,
                  height: side,
                  backgroundColor: dark,
                  borderRadius: 3,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: z.x - z.size,
                  top: z.y - z.size,
                  width: side,
                  height: side,
                  borderRadius: 3,
                  backgroundColor: def.color,
                  borderWidth: isBoss ? 3 : 2,
                  borderColor: def.ringColor ?? '#1a1a1a',
                }}
              >
                {isBoss && (
                  <View style={{ position: 'absolute', left: -4, right: -4, bottom: -10, height: 4, backgroundColor: '#2a0e0e', borderRadius: 2 }}>
                    <View style={{ width: `${Math.max(0, (z.hp / z.maxHp) * 100)}%`, height: '100%', backgroundColor: '#ff5555' }} />
                  </View>
                )}
              </View>
            </React.Fragment>
          );
        })}

        {w.projectiles.map((pr) => {
          const ps = projectileStyle(pr.kind);
          return (
            <View
              key={pr.id}
              style={{
                position: 'absolute',
                left: pr.x - ps.w / 2,
                top: pr.y - ps.h / 2,
                width: ps.w,
                height: ps.h,
                backgroundColor: ps.color,
                borderRadius: ps.r,
                opacity: ps.opacity,
              }}
            />
          );
        })}

        <View
          style={{
            position: 'absolute',
            left: w.carX - carWidth / 2,
            top: w.carY - carHeight / 2,
            width: carWidth,
            height: carHeight,
            transform: [{ rotate: `${headingDeg}deg` }],
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 5,
              top: 8,
              width: carWidth,
              height: carHeight,
              backgroundColor: carDark,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: '#000',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: carWidth,
              height: carHeight,
              backgroundColor: vehicle.color,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: w.invuln > 0 ? '#4ad1ff' : '#000',
            }}
          >
            <View style={styles.bumperFront} />
            <View style={styles.windshield} />
          </View>
        </View>
      </View>

      <View style={[styles.hud, { top: 12, left: 12, right: 12 }]} pointerEvents="none">
        <View style={styles.hudRow}>
          <Text style={styles.hudKills}>KILLS {w.kills}</Text>
          <Text style={styles.hudWave}>WAVE {w.wave + 1}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
        </View>
      </View>

      <View style={{ position: 'absolute', left: MARGIN, bottom: MARGIN }}>
        <SteeringWheel size={WHEEL_SIZE} onChange={(t) => (wheelRef.current = t)} />
      </View>

      <View
        style={{
          position: 'absolute',
          right: MARGIN,
          bottom: MARGIN,
          width: BTN_SIZE * 2 + BTN_GAP,
          height: BTN_SIZE * 2 + BTN_GAP,
        }}
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

function projectileStyle(kind: string) {
  switch (kind) {
    case 'flame': return { w: 14, h: 18, color: '#ff7a1a', r: 7, opacity: 0.85 };
    case 'rocket': return { w: 6, h: 16, color: '#ff3a3a', r: 3, opacity: 1 };
    case 'laser': return { w: 4, h: 36, color: '#9cf2ff', r: 2, opacity: 0.9 };
    default: return { w: 4, h: 12, color: '#ffd24a', r: 2, opacity: 1 };
  }
}

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.replace('#', ''));
  if (!m) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(parseInt(m[1], 16) * (1 + amount));
  const g = clamp(parseInt(m[2], 16) * (1 + amount));
  const b = clamp(parseInt(m[3], 16) * (1 + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  ground: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ARENA_W,
    height: ARENA_H,
    backgroundColor: '#3a4a2e',
  },
  wall: { position: 'absolute', backgroundColor: '#2a1f15' },
  windshield: {
    position: 'absolute',
    top: 12,
    left: 6,
    right: 6,
    height: 18,
    backgroundColor: '#3aa0c8',
    borderRadius: 3,
    opacity: 0.7,
  },
  bumperFront: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: '#999',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  hud: { position: 'absolute' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hudKills: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  hudWave: { color: '#ffd24a', fontWeight: '900', fontSize: 16 },
  hpBar: { marginTop: 6, height: 10, backgroundColor: '#2a0e0e', borderRadius: 5, overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#e34a4a' },
  btn: { position: 'absolute', borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  btnGas: { backgroundColor: 'rgba(60,180,90,0.85)', borderColor: '#0a3a18' },
  btnBrake: { backgroundColor: 'rgba(220,80,80,0.85)', borderColor: '#3a0a0a' },
  btnFire: { backgroundColor: 'rgba(255,180,40,0.9)', borderColor: '#3a2a00' },
  btnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  abilityBtn: {
    position: 'absolute',
    right: 16,
    top: 80,
    backgroundColor: '#222',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffd24a',
  },
  abilityBtnDisabled: { opacity: 0.5, borderColor: '#555' },
  abilityText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 1 },
  abilityCdBar: { marginTop: 6, height: 4, width: 90, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  abilityCdFill: { height: '100%', backgroundColor: '#ffd24a' },
});
