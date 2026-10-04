import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { createGame, step, CAR_RADIUS, ZOMBIE_RADIUS } from './src/game/engine';
import Controls from './src/components/Controls';
import HagSplash, { SPLASH_BG } from './src/components/HagSplash';
import Menu from './src/components/Menu';

const GRID = 120;

function Game({ onExit, onGameOver }) {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const game = useRef(createGame());
  const input = useRef({ left: false, right: false, gas: false, brake: false }).current;
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const reported = useRef(false);
  const [, setTick] = useState(0);

  const setPause = useCallback((p) => {
    paused.current = p;
    input.left = input.right = input.gas = input.brake = false;
    setPaused(p);
  }, [input]);

  // Auto-pause when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && setPause(true));
    return () => sub.remove();
  }, [setPause]);

  useEffect(() => {
    let raf;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused.current) {
        const g = game.current;
        step(g, { steer: (input.right ? 1 : 0) - (input.left ? 1 : 0), gas: input.gas, brake: input.brake }, dt);
        if (g.over && !reported.current) {
          reported.current = true;
          onGameOver(g.kills);
        }
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [input, onGameOver]);

  const restart = () => {
    game.current = createGame();
    reported.current = false;
    setPause(false);
  };

  const g = game.current;
  const cx = width / 2;
  const cy = height / 2;
  const sx = (x) => cx + (x - g.car.x);
  const sy = (y) => cy + (y - g.car.y);

  // Scrolling ground markers give a sense of speed.
  const ox = -(((g.car.x % GRID) + GRID) % GRID);
  const oy = -(((g.car.y % GRID) + GRID) % GRID);
  const dots = [];
  for (let x = ox; x < width + GRID; x += GRID) {
    for (let y = oy; y < height + GRID; y += GRID) {
      dots.push(<View key={`${x}_${y}`} style={[styles.dot, { left: x, top: y }]} />);
    }
  }

  const rot = `${g.car.angle}rad`;
  return (
    <View style={styles.root}>
      {dots}
      {g.splats.map((s, i) => (
        <View key={`s${i}_${s.x}`} style={[styles.splat, { left: sx(s.x) - 9, top: sy(s.y) - 9, opacity: Math.min(1, s.ttl / 2) }]} />
      ))}
      {g.zombies.map((z) => {
        const x = sx(z.x), y = sy(z.y);
        if (x < -20 || x > width + 20 || y < -20 || y > height + 20) return null;
        return (
          <View key={z.id} style={[styles.zombie, { left: x - ZOMBIE_RADIUS, top: y - ZOMBIE_RADIUS }]}>
            <View style={styles.eye} />
            <View style={[styles.eye, { right: 3, left: undefined }]} />
          </View>
        );
      })}
      <View style={[styles.car, { left: cx - 24, top: cy - CAR_RADIUS, transform: [{ rotate: rot }] }]}>
        <View style={styles.windshield} />
        <View style={styles.headlight} />
      </View>
      <View style={[styles.hudRow, { top: insets.top + 8, left: insets.left + 16, right: insets.right + 16 }]} pointerEvents="box-none">
        <Text style={styles.hud}>Kills: {g.kills}</Text>
        <View style={styles.hpBar}><View style={[styles.hpFill, { width: `${g.car.health}%` }]} /></View>
        <Pressable accessibilityLabel="Pause" onPress={() => setPause(true)} style={styles.pauseBtn}>
          <Text style={styles.hud}>II</Text>
        </Pressable>
      </View>
      <Controls input={input} insets={insets} />
      {isPaused && !g.over && (
        <View style={styles.overlay}>
          <Text style={styles.overText}>PAUSED</Text>
          <Pressable style={styles.overBtn} onPress={() => setPause(false)}><Text style={styles.overBtnText}>RESUME</Text></Pressable>
          <Pressable style={styles.overBtn} onPress={onExit}><Text style={styles.overBtnText}>QUIT</Text></Pressable>
        </View>
      )}
      {g.over && (
        <View style={styles.overlay}>
          <Text style={styles.overText}>GAME OVER</Text>
          <Text style={styles.overSub}>{g.kills} zombies crushed</Text>
          <Pressable style={styles.overBtn} onPress={restart}><Text style={styles.overBtnText}>PLAY AGAIN</Text></Pressable>
          <Pressable style={styles.overBtn} onPress={onExit}><Text style={styles.overBtnText}>MENU</Text></Pressable>
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [best, setBest] = useState(0);
  const onSplashDone = useCallback(() => setScreen('menu'), []);
  const onGameOver = useCallback((kills) => setBest((b) => Math.max(b, kills)), []);
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: SPLASH_BG }}>
      <StatusBar hidden />
      {screen === 'splash' && <HagSplash onDone={onSplashDone} />}
      {screen === 'menu' && <Menu best={best} onPlay={() => setScreen('game')} />}
      {screen === 'game' && <Game onExit={() => setScreen('menu')} onGameOver={onGameOver} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2b3a2b', overflow: 'hidden' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  splat: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#4f7a2a' },
  zombie: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#7ec850', borderWidth: 2, borderColor: '#3d6b24' },
  eye: { position: 'absolute', top: 4, left: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: '#111' },
  car: { position: 'absolute', width: 48, height: 36, borderRadius: 8, backgroundColor: '#d9534f', borderWidth: 2, borderColor: '#5a1414' },
  windshield: { position: 'absolute', left: 24, top: 4, width: 10, height: 24, borderRadius: 3, backgroundColor: '#1d2840' },
  headlight: { position: 'absolute', right: 0, top: 4, width: 3, height: 24, backgroundColor: '#ffe9a0' },
  hudRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 16 },
  hud: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  hpBar: { flex: 1, maxWidth: 220, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#5cb85c' },
  pauseBtn: { marginLeft: 'auto', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  overText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  overSub: { color: '#cfe8c0', fontSize: 20 },
  overBtn: { minWidth: 220, minHeight: 52, borderRadius: 12, backgroundColor: '#d9534f', alignItems: 'center', justifyContent: 'center' },
  overBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
