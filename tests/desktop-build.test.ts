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

test('multiplatform workflow: manual, development-only, never publishes, verifies one SHA at the end', () => {
  const wf = read('.github/workflows/multiplatform-build.yml');
  const on = wf.match(/^on:\s*\n((?:[ \t]+.*\n|[ \t]*\n)*)/m)![1];
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['workflow_dispatch']);
  assert.doesNotMatch(wf, /contents:\s*write/);
  assert.doesNotMatch(wf, /action-gh-release|gh release|eas update|git push|steamcmd|upload-google-play/i);
  assert.match(wf, /tools\/verify-same-source\.js "\$\{\{ needs\.source\.outputs\.sha \}\}"/);
  assert.match(wf, /verify-desktop-package\.js dist-linux/);
  assert.match(wf, /verify-desktop-package\.js dist-windows/);
  assert.match(wf, /npm run check/);
  assert.match(wf, /windows_smoke:[\s\S]*default: false/, 'the billed 2x Windows runner is opt-in');
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
  assert.match(b, /ZombieSquisher-v\$\{version\}-\$\{label\}-x64/);
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
