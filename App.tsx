import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Progress } from './src/types';
import { applyKills, loadProgress, saveProgress } from './src/store/progress';
import { MenuScreen } from './src/components/MenuScreen';
import { GameScreen } from './src/components/GameScreen';
import { GarageScreen } from './src/components/GarageScreen';
import { GameOverScreen } from './src/components/GameOverScreen';

type Scene =
  | { name: 'menu' }
  | { name: 'game' }
  | { name: 'garage' }
  | { name: 'gameover'; kills: number; before: Progress };

export default function App() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scene, setScene] = useState<Scene>({ name: 'menu' });

  useEffect(() => {
    loadProgress().then(setProgress);
    checkOtaUpdate();
  }, []);

  useEffect(() => {
    if (progress) saveProgress(progress);
  }, [progress]);

  if (!progress) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#ffd24a" size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {scene.name === 'menu' && (
        <MenuScreen
          progress={progress}
          onPlay={() => setScene({ name: 'game' })}
          onGarage={() => setScene({ name: 'garage' })}
        />
      )}
      {scene.name === 'game' && (
        <GameScreen
          progress={progress}
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
    </>
  );
}

async function checkOtaUpdate() {
  try {
    if (__DEV__) return;
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {}
}
