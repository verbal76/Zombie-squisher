// Expo config plugin: tell Android's AAPT not to compress .glb/.gltf
// binaries. Without this, AAPT silently corrupts the bytes in the packaged
// APK and GLTFLoader.parse throws "Unsupported version" or similar on
// every model -- works in Expo Go (assets served from a dev server) but
// dies on installed APK builds.
//
// See bug #2 of docs/glb-render-pipeline.md.
//
// The plugin runs at `expo prebuild` time and inserts an aaptOptions
// block inside android/app/build.gradle's top-level `android { }` block.
// Idempotent: detects its own SENTINEL and skips if already injected.

const { withAppBuildGradle } = require('@expo/config-plugins');

const SENTINEL = "noCompress 'glb'";
const INJECT = `\n    aaptOptions {\n        noCompress 'glb', 'gltf'\n    }\n`;

function withNoCompressGlb(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      console.warn('with-no-compress-glb: app/build.gradle is not groovy, skipping');
      return cfg;
    }
    if (cfg.modResults.contents.includes(SENTINEL)) return cfg;

    // Insert immediately inside the first `android {` block. The regex
    // matches the opening brace and we append our block right after it.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /android\s*\{/,
      (match) => match + INJECT,
    );
    return cfg;
  });
}

module.exports = withNoCompressGlb;
