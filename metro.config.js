// Metro config — enables full package.json `exports` field resolution so
// modern ESM-only deps (three.js 0.150+) bundle correctly. Without this,
// three's submodule imports inside @react-three/fiber fail to resolve and
// the Metro graph build dies with an unhelpful stack trace.
//
// Also registers .glb / .gltf as bundled asset extensions so
// `require('../../assets/character-a.glb')` resolves to an Expo Asset
// module reference rather than failing the build.
// Build trigger: 2026-05-10 / driving overhaul slice (build #45).
// Bump 2026-05-11: force fresh APK so the fetch()->expo-file-system GLB
// fix ships in the embedded bundle.
// Bump 2026-05-12: trigger APK so the GLB-JSON full-texture-strip fix
// ships embedded.
// Bump 2026-05-13a: trigger APK so the bicycle-model steering rewrite
// ships embedded.
// Bump 2026-05-13b: trigger APK so the Mario-Kart steering rewrite
// ships embedded.
// Bump 2026-05-13c: trigger APK so the SINGLE-STICK control scheme
// ships embedded.
// Bump 2026-05-13d: trigger APK so the PHYSICAL VEHICLE MODEL ships
// embedded.
// Bump 2026-05-13e: trigger APK so the AUTO-FIRE testing toggle +
// reverse-gate stick mapping (deliberate 30deg down-cone for brake/
// reverse) ships embedded.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// Allow Metro to bundle 3D model formats so `require('../assets/characters/x.glb')`
// returns an Expo Asset module reference instead of failing the build.
if (!config.resolver.assetExts.includes('glb')) {
  config.resolver.assetExts.push('glb');
}
if (!config.resolver.assetExts.includes('gltf')) {
  config.resolver.assetExts.push('gltf');
}

module.exports = config;
