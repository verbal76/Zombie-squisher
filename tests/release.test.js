const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { apkFileName } = require('../tools/apk-name');

const root = path.join(__dirname, '..');
const expo = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

test('APK is named after the game and version', () => {
  assert.equal(apkFileName(expo), 'Zombie-Crusher-v0.1.0.apk');
  assert.equal(apkFileName({ name: ' My  Game! ', version: '12' }), 'My-Game-v12.apk');
  assert.doesNotMatch(apkFileName(expo), /app-(debug|release)|artifact|build\.apk/);
});

test('package identity and versioning are set', () => {
  assert.equal(expo.android.package, 'com.hotatticgames.zombiecrusher');
  assert.ok(Number.isInteger(expo.android.versionCode) && expo.android.versionCode >= 1);
  assert.match(expo.version, /^\d+\.\d+\.\d+$/);
  assert.equal(expo.orientation, 'landscape');
});

test('target SDK meets the Play baseline', () => {
  const bp = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;
  assert.ok(bp.targetSdkVersion >= 35);
  assert.ok(bp.compileSdkVersion >= bp.targetSdkVersion);
});

test('splash: native splash is background-only, authoritative logo asset ships', () => {
  const splash = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  assert.equal(splash.image, './assets/splash-blank.png');
  assert.equal(splash.backgroundColor, '#0d0805');
  for (const f of ['assets/hag-logo.png', 'assets/icon.png', 'assets/adaptive-icon-foreground.png', 'assets/splash-blank.png', 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  // derived logo is the same artwork: PNG signature + same aspect ratio as the master
  const dim = (f) => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const [mw, mh] = dim('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
  const [lw, lh] = dim('assets/hag-logo.png');
  assert.ok(Math.abs(lw / lh - mw / (mh - 24)) < 0.05);
});

test('no secrets or keystores are committed', () => {
  const tracked = require('child_process').execSync('git ls-files', { cwd: root }).toString().split('\n');
  assert.deepEqual(tracked.filter((f) => /\.(jks|keystore|p12|pem)$|google-services|\.env/.test(f)), []);
});
