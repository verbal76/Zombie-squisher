import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Progress } from '../types';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { World, createWorld, step, deriveStats } from '../game/engine';
import { computeControlLayout } from '../game/controls';
import { Diag } from '../debug/diagnostics';
import { AudioDirector } from '../audio/audioDirector';
import { createExpoAudioBackend } from '../audio/expoAudioBackend';
import { SoundId } from '../audio/soundIds';
import { Settings } from '../store/settingsLogic';
import { AboutModal } from './AboutModal';
import { ControlInput, ControlPad } from './ControlPad';
import { GameHud, PauseOverlay } from './GameHud';
import { GameScene } from './GameScene';

interface Props {
  progress: Progress;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onEnd: (kills: number) => void;
}

const ARENA_W = 1200;
const ARENA_H = 1200;
const HUD_TICK_MS = 100;
const END_DELAY_MS = 800;

// Developer-only readouts (engine/input/zombie counts) are never shown to players.
const SHOW_DEBUG = __DEV__;

const WEAPON_SOUND: Partial<Record<string, SoundId>> = { mg: 'shot_mg', flame: 'flame', rockets: 'rocket', laser: 'laser' };
const ABILITY_SOUND: Partial<Record<string, SoundId>> = { nitro: 'nitro', shield: 'shield', emp: 'emp' };

/**
 * Coordinates one run: owns the simulation loop, pause / lifecycle, audio and the About modal, and composes
 * the scene (3D), HUD and touch pad. Presentation lives in GameScene / GameHud / ControlPad, input maths in
 * game/controls.ts, game rules in game/engine.ts.
 */
export function GameScreen({ progress, settings, onSettings, onEnd }: Props) {
  const worldRef = useRef<World | null>(null);
  if (worldRef.current === null) worldRef.current = createWorld(ARENA_W, ARENA_H, progress);
  const insets = useSafeAreaInsets();
  const { width: sw, height: sh } = useWindowDimensions();

  const input = useRef<ControlInput>({ steerLeft: false, steerRight: false, turbo: false, gear: 'forward', autoFire: true });
  const abilityTrigger = useRef(false);
  const pausedRef = useRef(false);
  const endedRef = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const directorRef = useRef<AudioDirector | null>(null);
  const maxSpeedRef = useRef(deriveStats(progress).stats.speed);

  const [paused, setPausedState] = useState(false);
  const [releaseSignal, setReleaseSignal] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [, setTick] = useState(0);

  const vehicle = VEHICLES[progress.selectedVehicle];
  const ability = ABILITIES[progress.selectedAbility];
  const layout = useMemo(() => computeControlLayout(sw, sh, insets), [sw, sh, insets]);

  const setPaused = (p: boolean) => {
    pausedRef.current = p;
    if (p) directorRef.current?.pause(); else directorRef.current?.resume();
    if (p) setReleaseSignal((n) => n + 1);       // nothing may stay held while paused
    setPausedState(p);
  };

  // Simulation loop. Stable for the life of the screen; everything it needs is read through refs.
  useEffect(() => {
    Diag.resetFrames();
    Diag.clearRenderError();
    let raf = 0;
    let last = performance.now();
    let lastHudTick = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current!;
      if (!pausedRef.current) {
        const i = input.current;
        step(w, dt, {
          steerLeft: i.steerLeft, steerRight: i.steerRight, gear: i.gear, turbo: i.turbo,
          fire: i.autoFire, triggerAbility: abilityTrigger.current,
        }, progressRef.current);
        abilityTrigger.current = false;
        directorRef.current?.update({ world: w, maxSpeed: maxSpeedRef.current, ability: progressRef.current.selectedAbility });
      }
      if (now - lastHudTick >= HUD_TICK_MS) {
        lastHudTick = now;
        setTick((t) => (t + 1) % 1000000);
      }
      if (w.gameOver && !endedRef.current) {
        endedRef.current = true;
        endTimer.current = setTimeout(() => onEndRef.current(w.kills), END_DELAY_MS);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  // Audio: created once per run and always released on exit. Failures only log (the director disables itself).
  useEffect(() => {
    let d: AudioDirector | null = null;
    try {
      d = new AudioDirector(
        createExpoAudioBackend(), settingsRef.current, undefined, undefined,
        (where, err) => console.warn('audio', where, (err as Error)?.message ?? err),
      );
      d.start(worldRef.current!);
      const p = progressRef.current;
      const warm = (['squish_1', 'squish_2', 'hit_1', 'streak', 'gameover', 'ui_click', WEAPON_SOUND[p.selectedWeapon], ABILITY_SOUND[p.selectedAbility]] as (SoundId | undefined)[])
        .filter((x): x is SoundId => !!x);
      d.prewarm(warm);
    } catch (err) {
      console.warn('audio init failed', (err as Error)?.message ?? err);
      d = null;
    }
    directorRef.current = d;
    return () => { d?.dispose(); directorRef.current = null; };
  }, []);

  useEffect(() => { directorRef.current?.setSettings(settings); }, [settings]);

  // Auto-pause whenever the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') setPaused(true); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = worldRef.current!;
  const debug = SHOW_DEBUG ? [
    `hd=${(w.heading * 180 / Math.PI).toFixed(0)}°  vF=${w.forwardV.toFixed(0)}  ω=${w.angularVelocity.toFixed(2)}`,
    `L=${+input.current.steerLeft}  R=${+input.current.steerRight}  gear=${input.current.gear}  turbo=${+input.current.turbo}  guns=${+input.current.autoFire}`,
    `z=${w.zombies.length}  pr=${w.projectiles.length}  hp=${w.hp.toFixed(0)}/${w.maxHp.toFixed(0)}`,
  ] : undefined;

  return (
    <View style={styles.root}>
      <GameScene world={w} vehicle={vehicle} />
      <GameHud
        world={w}
        vehicle={vehicle}
        ability={ability}
        abilityEquipped={progress.selectedAbility !== 'none'}
        insets={insets}
        debug={debug}
        onPause={() => setPaused(true)}
        onAbout={() => { setPaused(true); setAboutOpen(true); }}
        onAbility={() => { if (!pausedRef.current) abilityTrigger.current = true; }}
      />
      <ControlPad layout={layout} input={input} releaseSignal={releaseSignal} />
      {paused && !aboutOpen && !w.gameOver && (
        <PauseOverlay
          settings={settings}
          onSettings={onSettings}
          onResume={() => { directorRef.current?.click(); setPaused(false); }}
          onEndRun={() => { setPaused(false); w.hp = 0; w.gameOver = true; }}
        />
      )}
      <AboutModal visible={aboutOpen} onClose={() => { setAboutOpen(false); setPaused(false); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
});
