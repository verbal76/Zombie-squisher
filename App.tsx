// CRITICAL: _polyfills MUST be the very first import. It sets
// navigator.userAgent before any module imports GLTFLoader (which would
// otherwise crash in Hermes). See src/_polyfills.ts for details.
import './src/_polyfills';

import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as Updates from 'expo-updates';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Progress } from './src/types';
import { applyKills, loadProgress, saveProgress } from './src/store/progress';
import { DEFAULT_SETTINGS, Settings, loadSettings, saveSettings } from './src/store/settings';
import { MenuScreen } from './src/components/MenuScreen';
import { GameScreen } from './src/components/GameScreen';
import { GarageScreen } from './src/components/GarageScreen';
import { GameOverScreen } from './src/components/GameOverScreen';
import { HagSplash, SPLASH_BG } from './src/components/HagSplash';
import { installGlobalErrorHandler } from './src/debug/diagnostics';

installGlobalErrorHandler();

// Keep the (background-colour-only) native splash up until the branded screen has laid out.
SplashScreen.preventAutoHideAsync().catch(() => {});

type Scene =
  | { name: 'splash' }
  | { name: 'menu' }
  | { name: 'game' }
  | { name: 'garage' }
  | { name: 'gameover'; kills: number; before: Progress };

export default function App() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scene, setScene] = useState<Scene>({ name: 'splash' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    loadProgress().then(setProgress);
    loadSettings().then((s) => { setSettings(s); setSettingsLoaded(true); });
    checkOtaUpdate().then((ready) => { if (ready) setOtaReady(true); });
  }, []);

  // Leave the splash once the branded screen has played AND the save has loaded.
  useEffect(() => {
    if (scene.name === 'splash' && splashDone && progress && settingsLoaded) setScene({ name: 'menu' });
  }, [scene.name, splashDone, progress, settingsLoaded]);

  // A downloaded OTA is applied only from the menu, never mid-run.
  useEffect(() => {
    if (otaReady && scene.name === 'menu') Updates.reloadAsync().catch(() => {});
  }, [otaReady, scene.name]);

  useEffect(() => {
    if (progress) saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (settingsLoaded) saveSettings(settings);
  }, [settings, settingsLoaded]);

  if (scene.name === 'splash' || !progress || !settingsLoaded) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: SPLASH_BG }}>
        <StatusBar style="light" />
        {!splashDone
          ? <HagSplash onDone={onSplashDone} />
          : (
            <View style={{ flex: 1, backgroundColor: SPLASH_BG, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color="#ffd24a" size="large" />
            </View>
          )}
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style="light" />
      {scene.name === 'menu' && (
        <MenuScreen
          progress={progress}
          onPlay={() => setScene({ name: 'game' })}
          onGarage={() => setScene({ name: 'garage' })}
          settings={settings}
          onSettings={setSettings}
        />
      )}
      {scene.name === 'game' && (
        <GameScreen
          progress={progress}
          settings={settings}
          onSettings={setSettings}
          onEnd={(kills) => {
            const before = progress;
            const next = applyKills(progress, kills);
            setProgress(next);
            setScene({ name: 'gameover', kills, before });
          }}
        />
      )}
      {scene.name === 'garage' && (
        <GarageScreen progress={progress} onChange={setProgress} onBack={() => setScene({ name: 'menu' })} />
      )}
      {scene.name === 'gameover' && (
        <GameOverScreen
          kills={scene.kills}
          beforeProgress={scene.before}
          afterProgress={progress}
          onRetry={() => setScene({ name: 'game' })}
          onMenu={() => setScene({ name: 'garage' })}
        />
      )}
    </SafeAreaProvider>
  );
}

// Downloads an OTA if one is available. Returns true when a new update is ready to
// be applied; the caller decides when to reload (never in the middle of a run).
async function checkOtaUpdate(): Promise<boolean> {
  try {
    if (__DEV__) return false;
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    return fetched.isNew === true;
  } catch {
    return false;
  }
}
