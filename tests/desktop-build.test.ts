import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const { verify } = require('../tools/verify-same-source.js');

const SHA = 'c'.repeat(40), OTHER = 'd'.repeat(40);
const man = (platform: string, extra: object = {}) => ({ file: `${platform}.json`, m: { platform, sourceSha: SHA, commit: SHA, appVersion: '1.1.0', artifact: `${platform}.pkg`, artifactSha256: 'x', ...extra } });
const all = () => [man('android'), man('windows'), man('linux')];
const sameDigest = () => 'x';

// ---- coordinated build: one SHA for every platform ---------------------------------------------------------------

test('same-source gate: passes only when android, windows and linux all name the same commit', () => {
  assert.deepEqual(verify(SHA, all(), { digest: sameDigest }), []);
  assert.ok(verify(SHA, [man('android'), man('windows', { sourceSha: OTHER }), man('linux')], { digest: sameDigest }).some((e: string) => /windows: sourceSha/.test(e)));
  assert.ok(verify(SHA, [man('android'), man('windows'), man('linux', { commit: OTHER })], { digest: sameDigest }).some((e: string) => /linux: embedded commit/.test(e)));
  assert.ok(verify(SHA, [man('android'), man('linux')], { digest: sameDigest }).some((e: string) => /missing platform: windows/.test(e)), 'a missing platform fails');
  assert.deepEqual(verify(SHA, [man('android'), man('linux')], { required: ['android', 'linux'], digest: sameDigest }), [], 'a subset run requires only what it asked for');
  assert.ok(verify(SHA, [...all(), man('linux')], { digest: sameDigest }).some((e: string) => /more than one manifest/.test(e)));
  assert.ok(verify(SHA, [man('android'), man('windows', { dirtyTree: true }), man('linux')], { digest: sameDigest }).some((e: string) => /dirty/.test(e)), 'dirty builds never qualify');
  assert.ok(verify(SHA, [man('android'), man('windows', { appVersion: '1.2.0' }), man('linux')], { digest: sameDigest }).some((e: string) => /version/.test(e)));
  assert.ok(verify(SHA, all(), { digest: () => 'tampered' }).some((e: string) => /digest/.test(e)), 'artifact digest is recomputed');
  assert.ok(verify(SHA, all(), { digest: () => null }).some((e: string) => /not found/.test(e)), 'a manifest without its artifact fails');
  assert.ok(verify('main', all(), { digest: sameDigest }).some((e: string) => /40-char/.test(e)));
});

// ---- the Electron shell ------------------------------------------------------------------------------------------

test('shell hardening: isolated renderer, private origin only, no path traversal, single instance', () => {
  const main = read('desktop/main.js');
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /startsWith\(GAME_DIR \+ path\.sep\)/, 'path traversal guard');
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /will-navigate[\s\S]*startsWith\(ORIGIN\)/, 'cannot navigate away from the game');
  assert.match(main, /setWindowOpenHandler/);
  assert.doesNotMatch(main, /loadURL\(['"`]https?:/, 'never loads remote content');
  assert.doesNotMatch(main, /webSecurity:\s*false|allowRunningInsecureContent/);
  assert.equal(read('desktop/main.js').includes('devTools: flag('), true, 'devtools are opt-in');
});

test('shell behaviours the Steam checklist needs: fullscreen on Deck, windowed override, suspend/resume, clean quit, crash recovery', () => {
  const main = read('desktop/main.js');
  assert.match(main, /SteamDeck === '1'/);
  assert.match(main, /--windowed|flag\('windowed'\)/);
  assert.match(main, /F11/);
  assert.match(main, /powerMonitor\.on\('suspend'/);
  assert.match(main, /powerMonitor\.on\('resume'/);
  assert.match(main, /flushStorageData/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /autoplay-policy/);
  assert.match(main, /1280/);
  assert.match(main, /800/);
  const pre = read('desktop/preload.js');
  for (const api of ['onSuspend', 'onResume', 'toggleFullscreen', 'quit']) assert.ok(pre.includes(api));
  assert.doesNotMatch(pre, /require\('(fs|child_process)'\)/, 'preload exposes no filesystem or process access');
});

test('packaging script: Linux wrapper passes --no-sandbox and ships no SUID helper; manifest from the shared generator; no publishing', () => {
  const b = read('desktop/build.mjs');
  assert.match(b, /exec "\$HERE\/zombie-squisher-bin" --no-sandbox/);
  assert.match(b, /mode: 0o755/);
  assert.match(b, /chrome-sandbox/);
  assert.match(b, /tools\/build-manifest\.js/);
  assert.match(b, /artifactName\(/);
  assert.match(b, /sha256sum/);
  assert.doesNotMatch(b, /gh release|action-gh-release|steamcmd|eas update|git push/i);
  assert.match(b, /CompanyName: 'Hot Attic Games'/);
});

test('desktop shell keeps its own dependency tree: the Android app package.json is not touched by Electron', () => {
  const pkg = JSON.parse(read('package.json'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const d of ['electron', '@electron/packager', 'resedit']) assert.equal(all[d], undefined, `${d} must live in desktop/package.json only`);
  const d = JSON.parse(read('desktop/package.json'));
  assert.ok(d.devDependencies.electron);
  assert.match(d.devDependencies.electron, /^\d+\.\d+\.\d+$/, 'Electron is pinned to an exact version');
});

test('shell text shown to players is correct: product name and company', () => {
  const d = JSON.parse(read('desktop/package.json'));
  assert.equal(d.productName, 'Zombie Squisher');
  assert.equal(d.author, 'Hot Attic Games');
  assert.match(read('desktop/main.js'), /title: 'Zombie Squisher'/);
});

test('unified build interface: build --platform android|windows|linux|all plans one commit, refuses dirty trees and bad input', async () => {
  const { plan } = await import('../tools/build.mjs');
  assert.deepEqual(plan({ platform: 'linux', buildNumber: 77 }).steps.map((s: any) => s.platform), ['linux']);
  assert.deepEqual(plan({ platform: 'all', buildNumber: 77 }).steps.map((s: any) => s.platform), ['android', 'windows', 'linux']);
  const win = plan({ platform: 'windows', buildNumber: 5 }).steps[0];
  assert.deepEqual(win.args.slice(0, 5), ['desktop/build.mjs', '--platform', 'win32', '--build-number', '5']);
  assert.ok(plan({ platform: 'mac' }).errors.length, 'unknown platform');
  assert.ok(plan({ platform: 'all', buildNumber: 0 }).errors.length, 'bad build number');
  assert.ok(plan({ platform: 'all', dirty: true }).errors.some((e: string) => /uncommitted/.test(e)), 'dirty tree refused');
  assert.deepEqual(plan({ platform: 'all', dirty: true, allowDirty: true }).errors, []);
  assert.equal(JSON.parse(read('package.json')).scripts.build, 'node tools/build.mjs');
  assert.match(read('tools/build-android.sh'), /verify-apk\.sh/);
  assert.match(read('tools/build-android.sh'), /build-manifest\.js/);
});

test('third-party notices: committed file is current, covers every bundled package, and ships in the desktop packages', () => {
  const list = JSON.parse(read('tools/notice-packages.json'));
  const notices = read('THIRD_PARTY_NOTICES.md');
  assert.ok(Object.keys(list).length >= 40);
  for (const name of ['react', 'react-native', 'three', '@react-three/fiber', 'expo', 'react-native-web', 'zustand', 'upng-js']) assert.ok(name in list, `${name} is bundled and must be listed`);
  for (const [name] of Object.entries(list)) {
    const v = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    assert.ok(notices.includes(`| ${name} | ${v} |`), `${name}@${v} missing from the notices summary`);
  }
  assert.match(notices, /Permission is hereby granted, free of charge/);
  assert.doesNotMatch(notices, /Packages without a license file/, 'every bundled package must have a license text (own file or vendored upstream text with its source)');
  const out = require('child_process').spawnSync('node', ['tools/generate-notices.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(read('desktop/build.mjs'), /THIRD_PARTY_NOTICES\.md/);
  assert.match(read('tools/verify-desktop-package.js'), /THIRD_PARTY_NOTICES/);
  const src = JSON.parse(read('tools/license-texts/sources.json'));
  for (const [file, m] of Object.entries<any>(src)) {
    assert.match(m.url, /^https:\/\/raw\.githubusercontent\.com\//);
    assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'tools/license-texts', file))).digest('hex'), m.sha256, `${file} must match its recorded hash`);
  }
});

test('asset provenance doc names the exact evidence gaps and what ships', () => {
  const d = read('docs/THIRD_PARTY_ASSETS.md');
  for (const needle of ['8b549ed', '9b31f8b', 'fb0bcec', 'UnityGLTF', 'hatchback-sports', 'colormap.png', 'character-a..r', 'NOT in the repository']) assert.ok(d.includes(needle), needle);
  for (const f of ['hatchback-sports', 'sedan', 'taxi', 'ambulance']) assert.ok(fs.existsSync(path.join(root, 'assets', `${f}.glb`)));
});
