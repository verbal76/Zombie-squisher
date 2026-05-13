// Metro config — enables full package.json `exports` field resolution so
// modern ESM-only deps (three.js 0.150+) bundle correctly.
//
// Also registers .glb / .gltf as bundled asset extensions.
//
// Bump history (build triggers):
//   2026-05-10 / driving overhaul slice (build #45)
//   2026-05-11..13 / various engine, control, and physics pushes
//   2026-05-13j: camera lookahead + live physics debug HUD
//   2026-05-13k: FRZ-STYLE 5-BUTTON CONTROL SCHEME
//     [<-] [F] [TURBO] [R] [->] across the bottom. Auto-fire always on
//     (Vampire-Survivors-style). Joystick + throttleAxis pipeline removed.
//     New engine inputs: steerLeft, steerRight, gear (forward|reverse|
//     neutral), turbo. Slamming F<->R while moving fast triggers a
//     transmission jam: BRAKE_K decel + lateral skid injection.

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
