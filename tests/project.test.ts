import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const pkg = JSON.parse(read('package.json'));
const apkName = require('../tools/apk-name.js');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test('identity: package id and EAS project are preserved so installs update in place', () => {
  assert.equal(app.android.package, 'com.verbal76.zombiesquisher');
  assert.equal(app.name, 'Zombie Squisher');
  assert.equal(app.slug, 'zombie');
  assert.equal(app.owner, 'hot-attic-games');
  assert.equal(app.extra.eas.projectId, '9b498cb4-2cf6-4604-8d25-3b2d6be0add7');
  assert.equal(app.orientation, 'landscape');
});

test('versioning: version matches package.json, versionCode is above the shipped 1, OTA runtime tracks version', () => {
  assert.equal(pkg.version, app.version);
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.ok(app.android.versionCode >= 2, 'APK build #76 shipped versionCode 1');
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.notEqual(app.version, '1.0.0', 'native runtime changed (SDK 54): old installs must not receive this OTA');
});

test('APK file name is <GameName>-v<version>.apk', () => {
  assert.equal(apkName.apkFileName(app), `Zombie-Squisher-v${app.version}.apk`);
  assert.doesNotMatch(apkName.apkFileName(app), /app-(debug|release)|artifact|build\.apk/);
});

test('Android baseline: target/compile SDK >= 36, no unneeded permissions', () => {
  const bp = app.plugins.find((p: any) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;
  assert.ok(bp.targetSdkVersion >= 35);
  assert.ok(bp.compileSdkVersion >= bp.targetSdkVersion);
  assert.ok(!('kotlinVersion' in bp), 'Kotlin pin must stay removed: SDK 54 manages it');
  for (const perm of ['SYSTEM_ALERT_WINDOW', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK']) {
    assert.ok(app.android.blockedPermissions.includes(`android.permission.${perm}`), perm);
  }
});

test('splash: native splash is background-only; authoritative HAG logo ships in-app', () => {
  const splash = app.plugins.find((p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  assert.equal(splash.image, './assets/brand/splash-blank.png');
  assert.equal(splash.backgroundColor, '#0d0805');
  assert.equal(app.icon, './assets/brand/icon.png');
  const dim = (f: string) => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const [mw, mh] = dim('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
  const [lw, lh] = dim('assets/brand/hag-logo.png');
  assert.ok(Math.abs(lw / lh - mw / (mh - 24)) < 0.05, 'derived logo must keep the master artwork aspect');
  assert.match(read('src/components/HagSplash.tsx'), /hag-logo\.png/);
  assert.match(read('App.tsx'), /<HagSplash/);
});

test('brand assets are complete, valid PNGs', () => {
  execSync('node scripts/check-brand-assets.mjs', { cwd: root, stdio: 'pipe' });
});

test('every asset required by source code exists (no missing-asset crash at runtime)', () => {
  const files = walk(path.join(root, "src")).concat(path.join(root, 'App.tsx')).filter((f) => /\.(ts|tsx)$/.test(f));
  let checked = 0;
  for (const f of files) {
    // strip comments so documentation examples (e.g. assets/X.glb) are not treated as requires
    const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const target = path.resolve(path.dirname(f), m[1]);
      if (/\.(glb|png|jpg|ogg|mp3|ttf)$/.test(target)) {
        assert.ok(fs.existsSync(target), `${path.relative(root, f)} requires missing ${path.relative(root, target)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} asset requires found`);
});

test('every vehicle and character has a model registered', () => {
  const objects = read('src/data/objects.ts');
  const types = read('src/types.ts');
  const ids = [...types.match(/export type VehicleId =([\s\S]*?);/)![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.equal(ids.length, 10);
  const block = objects.match(/VEHICLE_GLB[\s\S]*?\n};/)![0];
  for (const id of ids) assert.match(block, new RegExp(`\\b${id}:`), `vehicle ${id} has no GLB`);
});

test('GLB files are not compressed away: no-compress plugin present and uses androidResources', () => {
  assert.ok(app.plugins.includes('./plugins/with-no-compress-glb.js'));
  const plugin = read('plugins/with-no-compress-glb.js');
  assert.match(plugin, /noCompress 'glb'/);
  assert.match(plugin, /androidResources/);
});

test('OTA safety: only the legacy pipeline branch can publish, and package.json/app.json changes never OTA', () => {
  const eas = read('.github/workflows/eas-update.yml');
  assert.match(eas, /branches:\s*\n\s*- 'Github-build-pipeline-zombie-crusher'/);
  for (const f of ['package.json', 'app.json', 'eas.json']) assert.ok(eas.includes(`- '${f}'`), f);
});

test('no secrets, keystores or env files are tracked', () => {
  const tracked = execSync('git ls-files', { cwd: root }).toString().split('\n');
  assert.deepEqual(tracked.filter((f) => /\.(jks|keystore|p12|pem|key)$|google-services|(^|\/)\.env/.test(f)), []);
});
