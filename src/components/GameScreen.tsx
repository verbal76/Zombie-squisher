import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Progress } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { ZOMBIE_DEFS } from '../data/zombies';
import { World, createWorld, step } from '../game/engine';

interface Props {
  progress: Progress;
  onEnd: (kills: number) => void;
}

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');

export function GameScreen({ progress, onEnd }: Props) {
  const playW = WIN_W;
  const playH = WIN_H - 120;
  const worldRef = useRef<World>(createWorld(playW, playH, progress));
  const steerRef = useRef(0);
  const abilityTriggerRef = useRef(false);
  const [, setTick] = useState(0);
  const [exited, setExited] = useState(false);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];
  const sideMod = SIDE_MODS[progress.selectedSideMod];

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      step(w, dt, { steer: steerRef.current, triggerAbility: abilityTriggerRef.current }, progress);
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

  const onTouch = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const center = playW / 2;
    const norm = Math.max(-1, Math.min(1, (x - center) / (playW / 2)));
    steerRef.current = norm;
  };
  const onTouchEnd = () => {
    steerRef.current = 0;
  };

  const w = worldRef.current;

  const hpPct = Math.max(0, w.hp / Math.max(1, w.maxHp));
  const cdPct = ability.cooldownMs > 0 ? 1 - w.abilityCooldown / ability.cooldownMs : 1;

  const lanePixels = useMemo(() => {
    const stripeH = 40;
    const stripes: { y: number }[] = [];
    const offset = w.scroll % stripeH;
    for (let y = -stripeH; y < playH + stripeH; y += stripeH) {
      stripes.push({ y: y + offset });
    }
    return stripes;
  }, [w.scroll, playH]);

  const shakeX = w.shake ? (Math.random() - 0.5) * w.shake : 0;
  const shakeY = w.shake ? (Math.random() - 0.5) * w.shake : 0;

  return (
    <View style={styles.root}>
      <Pressable
        style={[styles.play, { width: playW, height: playH, transform: [{ translateX: shakeX }, { translateY: shakeY }] }]}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <View style={[styles.shoulder, { left: 0 }]} />
        <View style={[styles.shoulder, { right: 0 }]} />
        {lanePixels.map((s, i) => (
          <View key={i} style={[styles.laneStripe, { top: s.y, left: playW / 2 - 3 }]} />
        ))}

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
          return (
            <View
              key={z.id}
              style={{
                position: 'absolute',
                left: z.x - z.size,
                top: z.y - z.size,
                width: z.size * 2,
                height: z.size * 2,
                borderRadius: z.size,
                backgroundColor: def.color,
                borderWidth: isBoss ? 3 : 2,
                borderColor: def.ringColor ?? '#1a1a1a',
              }}
            >
              {isBoss && (
                <View
                  style={{
                    position: 'absolute',
                    left: -4,
                    right: -4,
                    bottom: -10,
                    height: 4,
                    backgroundColor: '#2a0e0e',
                    borderRadius: 2,
                  }}
                >
                  <View
                    style={{
                      width: `${Math.max(0, (z.hp / z.maxHp) * 100)}%`,
                      height: '100%',
                      backgroundColor: '#ff5555',
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}

        {w.projectiles.map((pr) => {
          const style = projectileStyle(pr.kind);
          return (
            <View
              key={pr.id}
              style={{
                position: 'absolute',
                left: pr.x - style.w / 2,
                top: pr.y - style.h / 2,
                width: style.w,
                height: style.h,
                backgroundColor: style.color,
                borderRadius: style.r,
                opacity: style.opacity,
              }}
            />
          );
        })}

        <View
          style={{
            position: 'absolute',
            left: w.carX - vehicle.width / 2,
            top: w.carY - vehicle.height / 2,
            width: vehicle.width,
            height: vehicle.height,
            backgroundColor: vehicle.color,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: w.invuln > 0 ? '#4ad1ff' : '#000',
          }}
        >
          <View style={styles.windshield} />
          <View style={styles.bumper} />
        </View>
        {sideMod.reach > 0 && (
          <>
            <View
              style={{
                position: 'absolute',
                left: w.carX - vehicle.width / 2 - sideMod.reach,
                top: w.carY - vehicle.height / 2 + 10,
                width: sideMod.reach,
                height: vehicle.height - 20,
                backgroundColor: '#bfbfbf',
                borderWidth: 1,
                borderColor: '#222',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: w.carX + vehicle.width / 2,
                top: w.carY - vehicle.height / 2 + 10,
                width: sideMod.reach,
                height: vehicle.height - 20,
                backgroundColor: '#bfbfbf',
                borderWidth: 1,
                borderColor: '#222',
              }}
            />
          </>
        )}
      </Pressable>

      <View style={styles.hud}>
        <View style={styles.hudRow}>
          <Text style={styles.hudKills}>KILLS {w.kills}</Text>
          <Text style={styles.hudWave}>WAVE {w.wave + 1}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
        </View>
      </View>

      {progress.selectedAbility !== 'none' && (
        <Pressable
          onPress={() => {
            abilityTriggerRef.current = true;
          }}
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
    case 'flame':
      return { w: 14, h: 18, color: '#ff7a1a', r: 7, opacity: 0.85 };
    case 'rocket':
      return { w: 6, h: 16, color: '#ff3a3a', r: 3, opacity: 1 };
    case 'laser':
      return { w: 4, h: 36, color: '#9cf2ff', r: 2, opacity: 0.9 };
    default:
      return { w: 4, h: 12, color: '#ffd24a', r: 2, opacity: 1 };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  play: { backgroundColor: '#1a1a1a', overflow: 'hidden' },
  shoulder: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    backgroundColor: '#3a3a2a',
  },
  laneStripe: {
    position: 'absolute',
    width: 6,
    height: 24,
    backgroundColor: '#d8c060',
    borderRadius: 2,
  },
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
  bumper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#999',
  },
  hud: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
  },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hudKills: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  hudWave: { color: '#ffd24a', fontWeight: '900', fontSize: 16 },
  hpBar: {
    marginTop: 6,
    height: 10,
    backgroundColor: '#2a0e0e',
    borderRadius: 5,
    overflow: 'hidden',
  },
  hpFill: { height: '100%', backgroundColor: '#e34a4a' },
  abilityBtn: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffd24a',
  },
  abilityBtnDisabled: { opacity: 0.5, borderColor: '#555' },
  abilityText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 1 },
  abilityCdBar: {
    marginTop: 6,
    height: 4,
    width: 90,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  abilityCdFill: { height: '100%', backgroundColor: '#ffd24a' },
});
