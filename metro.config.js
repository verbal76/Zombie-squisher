// Metro config bump only -- fires android-build workflow so a fresh
// APK ships the latest src/** state (GUNS on/off toggle button above
// the LEFT arrow, side-impact damage rule, per-hit horde slowdown).
// No source changes in this commit.
//
// 2026-05-13n: APK trigger for GUNS toggle button + side-hit damage
// + per-hit slowdown.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

if (!config.resolver.assetExts.includes('glb')) {
  config.resolver.assetExts.push('glb');
}
if (!config.resolver.assetExts.includes('gltf')) {
  config.resolver.assetExts.push('gltf');
}

module.exports = config;
