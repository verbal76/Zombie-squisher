import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const PIPELINE = 'Github-build-pipeline-zombie-crusher';
const WF_DIR = path.join(root, '.github/workflows');
const workflows = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'));
const names = require('../tools/release-names.js');
const { assemble } = require('../tools/assemble-release.js');

/** Top-level event names under `on:` */
function events(text: string): string[] {
  const m = text.match(/^on:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)/m);
  return m ? [...m[1].matchAll(/^ {2}([a-z_]+):/gm)].map((x) => x[1]) : [];
}

// ---- nothing publishes or builds expensively on repository events -----------------------------------------------------

test('every workflow is manual or lightweight: only ci.yml runs on events (pull requests), build-apk.yml is reusable', () => {
  for (const f of workflows) {
    const ev = events(read(`.github/workflows/${f}`));
    if (f === 'ci.yml') assert.deepEqual(ev, ['pull_request', 'workflow_dispatch']);
    else if (f === 'build-apk.yml') assert.deepEqual(ev, ['workflow_call']);
    else assert.deepEqual(ev, ['workflow_dispatch'], `${f} must be workflow_dispatch only`);
  }
});

test('only build.yml creates releases/tags, only eas-update.yml runs `eas update`, only build-apk.yml and build.yml run `eas build`', () => {
  for (const f of workflows) {
    const text = read(`.github/workflows/${f}`);
    if (f !== 'build.yml') assert.ok(!/action-gh-release|gh release create|tools\/tag-release\.sh|git push/.test(text), `${f} must not create releases or tags`);
    if (f !== 'eas-update.yml') assert.ok(!/eas update\b/.test(text), `${f} must not publish an OTA`);
    if (!['build-apk.yml', 'build.yml'].includes(f)) assert.ok(!/eas build\b/.test(text), `${f} must not run native builds`);
    assert.ok(!/steamcmd|upload-google-play|r0adkll\/upload-google-play|SteamPipe upload/i.test(text), `${f} must not upload to Steam or Google Play`);
  }
});

test('nothing outside build.yml has write access to contents; build-apk.yml (reusable) never publishes', () => {
  for (const f of workflows) if (f !== 'build.yml') assert.doesNotMatch(read(`.github/workflows/${f}`), /contents:\s*write/, `${f}`);
  assert.doesNotMatch(read('.github/workflows/build-apk.yml'), /action-gh-release|eas update|git push/);
});

test('OTA requires the release branch and an explicit typed confirmation, and runs the tests first', () => {
  const wf = read('.github/workflows/eas-update.yml');
  assert.match(wf, /refs\/heads\/\$RELEASE_BRANCH/);
  assert.match(wf, /RELEASE_BRANCH:\s*Github-build-pipeline-zombie-crusher/);
  assert.match(wf, /PUBLISH-OTA/);
  assert.ok(wf.indexOf('PUBLISH-OTA') < wf.indexOf('actions/checkout'), 'authorization is checked before anything is fetched');
  assert.ok(wf.indexOf('npm run check') < wf.indexOf('eas update --non-interactive'), 'tests must pass before an OTA is published');
  assert.doesNotMatch(wf.split('Publish update')[1].split('run: |')[1], /\$\{\{\s*(inputs|github\.event\.inputs)/, 'no direct input interpolation inside the publish script');
});

// ---- the primary build workflow ---------------------------------------------------------------------------------------

test('build.yml inputs follow the studio standard and default to local_only', () => {
  const wf = read('.github/workflows/build.yml');
  for (const input of ['platform', 'source_sha', 'build_number', 'destination']) assert.match(wf, new RegExp(`^      ${input}:`, 'm'), `input ${input}`);
  assert.match(wf, /options: \[all, android, windows, linux\]/);
  assert.match(wf, /options: \[local_only, github_releases\]\s*\n\s*default: local_only/);
});

test('build.yml plan: validates the SHA, lineage for releases, build-number uniqueness, and runs the tests once', () => {
  const plan = read('.github/workflows/build.yml').split('\n  android:')[0];
  assert.match(plan, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(plan, /git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(plan, /release-names\.js validate/);
  assert.match(plan, /merge-base --is-ancestor "\$SOURCE_SHA" "origin\/\$RELEASE_BRANCH"/);
  assert.match(plan, /RELEASE_BRANCH:\s*Github-build-pipeline-zombie-crusher/);
  assert.match(plan, /npm run check/);
});

test('build.yml publishing: only for github_releases; assemble (same SHA proof) -> tag -> release -> tag re-check; prerelease; one release', () => {
  const wf = read('.github/workflows/build.yml');
  const pub = wf.slice(wf.indexOf('\n  publish:'));
  assert.match(pub, /if:\s*\$\{\{\s*inputs\.destination == 'github_releases'\s*\}\}/);
  assert.match(pub, /needs:\s*\[plan, assemble\]/);
  assert.match(pub, /contents:\s*write/);
  assert.equal((wf.match(/contents:\s*write/g) ?? []).length, 1, 'contents: write only on the publish job');
  assert.equal((wf.match(/action-gh-release/g) ?? []).length, 1, 'exactly one release is created');
  const order = ['tools/tag-release.sh "build-', 'softprops/action-gh-release', 'tag-release.sh --check'].map((s) => pub.indexOf(s));
  assert.ok(order.every((i) => i > 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(pub, /target_commitish:\s*\$\{\{\s*needs\.plan\.outputs\.sha\s*\}\}/);
  assert.match(pub, /prerelease:\s*true/);
  assert.match(pub, /make_latest:\s*false/);
  const asm = wf.slice(wf.indexOf('\n  assemble:'), wf.indexOf('\n  publish:'));
  assert.match(asm, /tools\/assemble-release\.js --sha "\$\{\{ needs\.plan\.outputs\.sha \}\}" --build/);
  assert.match(asm, /--require "\$\{\{ needs\.plan\.outputs\.require \}\}"/);
});

test('build.yml builds each platform only when selected and verifies the packages', () => {
  const wf = read('.github/workflows/build.yml');
  assert.match(wf, /android:[\s\S]*if:\s*\$\{\{\s*needs\.plan\.outputs\.android == 'true'/);
  assert.match(wf, /verify-desktop-package\.js dist-linux/);
  assert.match(wf, /verify-desktop-package\.js dist-windows/);
  assert.match(wf, /windows_smoke:[\s\S]*default: false/, 'the billed 2x Windows runner is opt-in');
  assert.match(wf, /desktop-smoke\.mjs/);
  assert.match(wf, /desktop-restart-test\.mjs/);
});

// ---- naming, numbering, assembly ----------------------------------------------------------------------------------

test('studio naming: Game Title Build NN APK.apk / EXE.zip / Linux.tar.gz, tag build-NN, release title', () => {
  assert.equal(names.artifactName('android', 77), 'Zombie Squisher Build 77 APK.apk');
  assert.equal(names.artifactName('windows', 77), 'Zombie Squisher Build 77 EXE.zip');
  assert.equal(names.artifactName('linux', 77), 'Zombie Squisher Build 77 Linux.tar.gz');
  assert.equal(names.releaseTitle(77), 'Zombie Squisher Build 77');
  assert.equal(names.releaseTag(77), 'build-77');
  assert.throws(() => names.artifactName('android', 0)); assert.throws(() => names.artifactName('mac', 1)); assert.throws(() => names.releaseTag(1.5));
});

test('build numbers are monotonic and never reused (historical apk-build-76 counts)', () => {
  assert.equal(names.highestUsed(['apk-build-17', 'apk-build-76', 'v1', 'build-3']), 76);
  assert.equal(names.validateNewBuildNumber(77, ['apk-build-76']), null);
  assert.match(names.validateNewBuildNumber(76, ['apk-build-76']), /greater than/);
  assert.match(names.validateNewBuildNumber(50, ['apk-build-76']), /greater than/);
  assert.match(names.validateNewBuildNumber(80, ['apk-build-76', 'build-80']), /already used/);
  assert.equal(names.validateNewBuildNumber(1, []), null);
});

function fixture(build: number, sha: string, tweak: (platform: string, m: any) => void = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-'));
  const specs: Array<[string, string, string]> = [['android', 'Zombie-Squisher-v1.1.0.apk', 'build-manifest.json'], ['windows', 'win.zip', 'win.zip.manifest.json'], ['linux', 'lin.tar.gz', 'lin.tar.gz.manifest.json']];
  for (const [platform, file, mf] of specs) {
    const d = path.join(dir, `part-${platform}`); fs.mkdirSync(d);
    const bytes = Buffer.from(`${platform}-bytes`);
    fs.writeFileSync(path.join(d, file), bytes);
    const m = { platform, sourceSha: sha, commit: sha, buildNumber: build, appVersion: '1.1.0', artifact: file, artifactSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      builtAt: '2026-01-01T00:00:00Z', profile: platform === 'android' ? 'preview' : 'desktop', runtimeVersion: '1.1.0', toolchain: { reactNative: '0.81.5', expo: '54.0.37' }, ...(platform === 'android' ? {} : { electron: '38.3.0' }) };
    tweak(platform, m);
    fs.writeFileSync(path.join(d, mf), JSON.stringify(m));
  }
  return dir;
}
const SHA = 'e'.repeat(40);

test('assemble-release: one SHA + one build number -> standard names, build-manifest.json and verifiable checksums.sha256', () => {
  const dir = fixture(77, SHA); const out = path.join(dir, 'release');
  const r = assemble({ sha: SHA, build: 77, required: ['android', 'windows', 'linux'], out, dirs: [dir] });
  assert.deepEqual(r.errs, []);
  assert.deepEqual(fs.readdirSync(out).sort(), ['Zombie Squisher Build 77 APK.apk', 'Zombie Squisher Build 77 EXE.zip', 'Zombie Squisher Build 77 Linux.tar.gz', 'build-manifest.json', 'checksums.sha256']);
  const man = JSON.parse(fs.readFileSync(path.join(out, 'build-manifest.json'), 'utf8'));
  assert.equal(man.sourceSha, SHA); assert.equal(man.buildNumber, 77); assert.equal(man.tag, 'build-77'); assert.equal(man.complete, true);
  assert.equal(man.artifacts.length, 3); for (const a of man.artifacts) { assert.ok(a.sha256 && a.size > 0 && a.engine && a.builtAt && a.configuration); }
  // checksums.sha256 verifies with the standard tool
  const res = spawnSync('sha256sum', ['-c', 'checksums.sha256'], { cwd: out, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('assemble-release: refuses mixed sources, wrong build number, tampered or missing artifacts; marks partial builds', () => {
  const run = (build: number, tweak: any, required = ['android', 'windows', 'linux']) => { const d = fixture(build, SHA, tweak); return assemble({ sha: SHA, build, required, out: path.join(d, 'release'), dirs: [d] }); };
  assert.ok(run(77, (p: string, m: any) => { if (p === 'windows') { m.sourceSha = 'f'.repeat(40); } }).errs.some((e: string) => /windows: sourceSha/.test(e)), 'one platform from another commit');
  assert.ok(run(77, (p: string, m: any) => { if (p === 'linux') m.commit = 'f'.repeat(40); }).errs.some((e: string) => /linux: embedded commit/.test(e)));
  assert.ok(run(77, (p: string, m: any) => { if (p === 'android') m.buildNumber = 76; }).errs.some((e: string) => /build number 76 != 77/.test(e)));
  assert.ok(run(77, (p: string, m: any) => { if (p === 'linux') m.artifactSha256 = '0'.repeat(64); }).errs.some((e: string) => /digest/.test(e)), 'tampered artifact');
  assert.ok(run(77, (p: string, m: any) => { if (p === 'windows') m.dirtyTree = true; }).errs.some((e: string) => /dirty/.test(e)));
  const d = fixture(77, SHA); fs.rmSync(path.join(d, 'part-windows'), { recursive: true });
  assert.ok(assemble({ sha: SHA, build: 77, required: ['android', 'windows', 'linux'], out: path.join(d, 'release'), dirs: [d] }).errs.some((e: string) => /missing platform: windows/.test(e)));
  const partial = assemble({ sha: SHA, build: 77, required: ['android', 'linux'], out: path.join(d, 'release'), dirs: [d] });
  assert.deepEqual(partial.errs, []); assert.equal(partial.manifest.complete, false, 'a partial build is never presented as a complete release');
});

// ---- tags and manifests -------------------------------------------------------------------------------------------------

test('every artifact carries a build manifest produced from the same SHA the run builds', () => {
  assert.match(read('.github/workflows/build-apk.yml'), /tools\/build-manifest\.js/);
  assert.match(read('.github/workflows/build.yml'), /tools\/build-manifest\.js "dist\/\$NAME" production/);
  assert.match(read('desktop/build.mjs'), /tools\/build-manifest\.js/);
  const gen = read('scripts/write-build-info.mjs');
  for (const k of ['platform', 'runtimeVersion', 'toolchain', 'builtAt', 'commit', 'branch', 'buildNumber']) assert.ok(gen.includes(k), `build info must record ${k}`);
});

test('build-manifest: refuses to record a build whose embedded commit is not the run SHA', () => {
  const { makeManifest } = require('../tools/build-manifest.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  const info = path.join(dir, 'build-info.ts'); const art = path.join(dir, 'Game-v1.apk');
  fs.writeFileSync(art, 'apk-bytes');
  fs.writeFileSync(info, `export const BUILD_INFO: BuildInfo = ${JSON.stringify({ commit: SHA, branch: 'x', platform: 'android' })};\n`);
  const ok = makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: { GITHUB_SHA: SHA, GITHUB_REF: 'refs/heads/x' } });
  assert.equal(ok.sourceSha, SHA); assert.equal(ok.artifactSha256, crypto.createHash('sha256').update('apk-bytes').digest('hex'));
  assert.throws(() => makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: { GITHUB_SHA: 'f'.repeat(40) } }), /!= GITHUB_SHA/);
  assert.throws(() => makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: {} }), /GITHUB_SHA is not set/);
});

test('tag-release.sh: tags the built commit, refuses to move a tag, and --check catches a tag on the wrong commit', () => {
  const sh = path.join(root, 'tools/tag-release.sh');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-'));
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const bare = path.join(tmp, 'remote.git'); const work = path.join(tmp, 'work');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare); git(tmp, 'clone', '-q', bare, work);
  fs.writeFileSync(path.join(work, 'a'), '1'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'one'); git(work, 'push', '-q', 'origin', 'HEAD:main');
  const defaultHead = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', '-b', 'release'); fs.writeFileSync(path.join(work, 'a'), '2'); git(work, 'commit', '-qam', 'two');
  const built = git(work, 'rev-parse', 'HEAD'); assert.notEqual(built, defaultHead);
  const run = (...a: string[]) => spawnSync('bash', [sh, ...a], { cwd: work, encoding: 'utf8' });
  assert.equal(run('build-1', built).status, 0, 'creates the tag');
  assert.equal(git(work, 'ls-remote', 'origin', 'refs/tags/build-1').split(/\s/)[0], built, 'on the built commit, not the default branch head');
  assert.equal(run('--check', 'build-1', built).status, 0);
  assert.equal(run('build-1', built).status, 0, 'idempotent');
  assert.notEqual(run('--check', 'build-1', defaultHead).status, 0);
  assert.notEqual(run('build-1', defaultHead).status, 0, 'never re-points an existing tag');
  assert.notEqual(run('--check', 'missing', built).status, 0);
  assert.notEqual(run('build-2', 'main').status, 0, 'a branch name is not a source');
  git(work, 'checkout', '-q', '-b', 'other', defaultHead);
  assert.notEqual(run('build-3', built).status, 0, 'HEAD must be the commit being tagged');
});

test('branch ledger exists and accounts for every branch the audit found', () => {
  const ledger = read('docs/BRANCH_LEDGER.md');
  for (const b of [PIPELINE, 'checkpoint/pre-resurrection-7004f7d', 'archive/scratch-rewrite-97a5729', 'claude/fix-bounding-box-controls-7LQLQ', 'claude/fix-build-artifacts-visibility-rwXqU', 'claude/github-game-builds-AAswD', 'main']) assert.ok(ledger.includes(b), `ledger must account for ${b}`);
});
