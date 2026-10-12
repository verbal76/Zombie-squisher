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

// Desktop (Windows / Linux / Steam Deck) runs the same React Native + three.js code as a web build inside an Electron
// shell. On the web platform ONLY, react-three-fiber's DOM renderer replaces its expo-gl one; Android/iOS resolve
// exactly as before (verified by an unchanged Android bundle hash, see docs/DESKTOP.md).
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === '@react-three/fiber/native') moduleName = '@react-three/fiber';
    if (moduleName === 'expo-file-system/legacy') {
      return { type: 'sourceFile', filePath: require('path').join(__dirname, 'src/platform/web/expoFileSystemLegacy.ts') };
    }
  }
  return (upstreamResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
