// Metro config — enables full package.json `exports` field resolution so
// modern ESM-only deps (three.js 0.150+) bundle correctly. Without this,
// three's submodule imports inside @react-three/fiber fail to resolve and
// the Metro graph build dies with an unhelpful stack trace.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

module.exports = config;
