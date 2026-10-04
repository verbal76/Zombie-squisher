import Constants from 'expo-constants';

// Non-sensitive identity of the installed build, shown on the About screen.
export function getBuildInfo() {
  const cfg = Constants.expoConfig || {};
  return {
    name: cfg.name || 'Zombie Crusher',
    version: cfg.version || '0.0.0',
    versionCode: cfg.android?.versionCode ?? 0,
    sourceSha: cfg.extra?.sourceSha || 'local',
  };
}
