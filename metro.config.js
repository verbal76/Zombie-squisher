// Metro config — bump only to fire android-build alongside eas-update.
// Bump history collapsed; latest:
//   2026-05-13l: chase cam (NFS-style behind-the-car view). Camera sits
//   ~110 units behind the car at ~65 units height, looks ~150 units
//   ahead. Camera-tracked heading lerps toward world.heading at 4/sec
//   so turns swing the view smoothly. Replaces the pure top-down
//   camera. FOV bumped to 65 for chase-cam peripheral visibility. Sky
//   color changed from greenish to bluish since the camera now sees
//   the horizon.

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
