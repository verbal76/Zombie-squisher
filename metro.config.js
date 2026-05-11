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
// fix ships in the embedded bundle (OTAs are not reliably reaching some
// devices; baking the fix into the APK avoids the OTA dependency).

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
