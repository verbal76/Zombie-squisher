// Metro config — enables full package.json `exports` field resolution so
// modern ESM-only deps (three.js 0.150+) bundle correctly. Without this,
// three's submodule imports inside @react-three/fiber fail to resolve and
// the Metro graph build dies with an unhelpful stack trace.

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
