// Developer-only UI harness: renders the pure-UI screens with mock data so layouts can be reviewed at any
// aspect ratio / safe-area inset in a browser (react-native-web) without a device. NOT part of the shipped app:
// index.ts only loads it when EXPO_PUBLIC_UI_GALLERY=1 (the require is dead-code-eliminated otherwise).
// Usage: EXPO_PUBLIC_UI_GALLERY=1 npx expo export --platform web, then open index.html?screen=menu&insets=24,48,24,48
import React, { useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createWorld } from '../game/engine';
import { DEFAULT_PROGRESS } from '../store/progressLogic';
import { DEFAULT_SETTINGS, Settings } from '../store/settingsLogic';
import { VEHICLES } from '../data/vehicles';
import { ABILITIES } from '../data/weapons';
import { computeControlLayout } from '../game/controls';
import { MenuScreen } from '../components/MenuScreen';
import { GarageScreen } from '../components/GarageScreen';
import { GameOverScreen } from '../components/GameOverScreen';
import { GameHud, PauseOverlay } from '../components/GameHud';
import { ControlInput, ControlPad } from '../components/ControlPad';
import { AboutModal } from '../components/AboutModal';
import { HagSplash } from '../components/HagSplash';
import { Progress } from '../types';

const noop = () => {};

function mockProgress(): Progress {
  const p: Progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  p.totalKills = 1234; p.lifetimeKills = 3100; p.bestRunKills = 456;
  p.unlockedVehicles = ['hatchback', 'sedan', 'coupe'];
  p.selectedVehicle = 'sedan';
  p.unlockedWeapons = ['none', 'mg', 'flame']; p.selectedWeapon = 'mg';
  p.unlockedSideMods = ['none', 'swords']; p.unlockedAbilities = ['none', 'nitro']; p.selectedAbility = 'nitro';
  p.upgrades.sedan = { speed: 2, armor: 1, handling: 0, acceleration: 3 };
  return p;
}

export function UiGallery() {
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const screen = q.get('screen') ?? 'menu';
  const [t, r, b, l] = (q.get('insets') ?? '0,0,0,0').split(',').map(Number);
  const insets = { top: t, right: r, bottom: b, left: l };
  const { width, height } = useWindowDimensions();
  const progress = useMemo(mockProgress, []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [p, setP] = useState(progress);
  const input = useRef<ControlInput>({ steerLeft: false, steerRight: false, turbo: false, gear: 'forward', autoFire: true });
  const world = useMemo(() => {
    const w = createWorld(1200, 1200, progress);
    w.zombies.push({ id: 1, x: w.carX + 60, y: w.carY - 80, vx: 0, vy: 0, hp: 310, maxHp: 520, kind: 'boss', size: 22, attackCooldown: 0 });
    w.kills = 87; w.wave = 3; w.hp = Number(q.get('hp') ?? 22); w.streak = 12; w.momentum = 0.8; w.abilityCooldown = 2500;
    return w;
  }, [progress]);
  const layout = computeControlLayout(width, height, insets);
  const vehicle = VEHICLES[progress.selectedVehicle];

  let body: React.ReactNode;
  switch (screen) {
    case 'menu': body = <MenuScreen progress={progress} onPlay={noop} onGarage={noop} settings={settings} onSettings={setSettings} />; break;
    case 'garage': body = <GarageScreen progress={p} onChange={setP} onBack={noop} />; break;
    case 'gameover': body = <GameOverScreen kills={312} beforeProgress={progress} afterProgress={{ ...progress, unlockedWeapons: [...progress.unlockedWeapons, 'rockets'] }} onRetry={noop} onMenu={noop} />; break;
    case 'splash': body = <HagSplash onDone={noop} />; break;
    case 'about': body = <View style={{ flex: 1, backgroundColor: '#222' }}><AboutModal visible onClose={noop} /></View>; break;
    case 'pause':
    case 'hud':
      body = (
        <View style={{ flex: 1, backgroundColor: q.get('bg') ?? '#5b7a43' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '38%', backgroundColor: '#88a0cc' }} />
          <GameHud world={world} vehicle={vehicle} ability={ABILITIES[progress.selectedAbility]} abilityEquipped insets={insets} onPause={noop} onAbout={noop} onAbility={noop} />
          <ControlPad layout={layout} input={input} releaseSignal={0} />
          {screen === 'pause' && <PauseOverlay settings={settings} onSettings={setSettings} onResume={noop} onEndRun={noop} />}
        </View>
      );
      break;
    default: body = null;
  }
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height }, insets }} style={{ flex: 1, backgroundColor: '#000' }}>
      {body}
    </SafeAreaProvider>
  );
}
