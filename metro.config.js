// Metro config bump only -- fires android-build workflow so a fresh
// APK ships the latest src/** state (chase cam + corner-clustered
// button layout + smaller zombies + Ocean Spore physics + landscape
// lock). No source changes in this commit.
//
// 2026-05-13m: APK trigger for corner-clustered button layout
// (bddbf1b5) and zombie scale 12 (4b5c37bb). If OTA isn't applying
// reliably, a fresh APK install guarantees the latest code is what
// runs.

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
