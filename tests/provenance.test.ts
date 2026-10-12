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

/** Text of the top-level `on:` block of a workflow. */
function onBlock(text: string): string {
  const m = text.match(/^on:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)/m);
  return m ? m[1] : (text.match(/^on:.*$/m)?.[0] ?? '');
}
/** Event names under `on:` (top-level keys of the block). */
function events(text: string): string[] {
  return [...onBlock(text).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
}

// ---- Nothing that publishes can be triggered by repository events ---------------------------------------------

const PUBLISHERS: Record<string, string> = {
  'eas-update.yml': 'OTA',
  'android-build.yml': 'APK/AAB release',
};

test('publishing workflows are manual-only (no push, PR, tag, release, schedule or workflow chaining)', () => {
  for (const f of Object.keys(PUBLISHERS)) {
    assert.deepEqual(events(read(`.github/workflows/${f}`)), ['workflow_dispatch'], `${f} (${PUBLISHERS[f]}) must be workflow_dispatch only`);
  }
});

test('no workflow can invoke a publisher indirectly (workflow_run / repository_dispatch / workflow_call into it)', () => {
  for (const f of workflows) {
    const text = read(`.github/workflows/${f}`);
    if (f === 'prune-artifacts.yml') {
      assert.ok(!/eas update|action-gh-release|gh release/.test(text), 'prune must never publish');
      continue;
    }
    const ev = events(text);
    for (const bad of ['repository_dispatch', 'release', 'schedule']) assert.ok(!ev.includes(bad), `${f} must not trigger on ${bad}`);
    // workflow_run is allowed only for the artifact-pruning housekeeping workflow.
    assert.ok(!ev.includes('workflow_run'), `${f} must not chain on workflow_run`);
    assert.ok(!/uses:\s*\.\/\.github\/workflows\/(eas-update|android-build)\.yml/.test(text), `${f} must not call a publisher workflow`);
  }
});

test('only eas-update.yml can run `eas update`, and only android-build.yml can create releases', () => {
  for (const f of workflows) {
    const text = read(`.github/workflows/${f}`);
    if (f !== 'eas-update.yml') assert.ok(!/eas update\b/.test(text), `${f} must not publish an OTA`);
    if (f !== 'android-build.yml') assert.ok(!/action-gh-release|gh release create/.test(text), `${f} must not create releases`);
  }
});

test('the reusable build and the candidate workflow never publish', () => {
  for (const f of ['build-apk.yml', 'android-candidate.yml']) {
    const text = read(`.github/workflows/${f}`);
    assert.ok(!/contents:\s*write/.test(text), `${f} must not have write access to contents`);
    assert.ok(!/action-gh-release|eas update|git push/.test(text), `${f} must not publish`);
  }
  assert.deepEqual(events(read('.github/workflows/android-candidate.yml')), ['workflow_dispatch']);
});

test('OTA requires the release branch and an explicit typed confirmation, and runs the tests first', () => {
  const wf = read('.github/workflows/eas-update.yml');
  assert.match(wf, /refs\/heads\/\$RELEASE_BRANCH/);
  assert.match(wf, /RELEASE_BRANCH:\s*Github-build-pipeline-zombie-crusher/);
  assert.match(wf, /PUBLISH-OTA/);
  assert.ok(wf.indexOf('PUBLISH-OTA') < wf.indexOf('actions/checkout'), 'authorization must be checked before anything is built or fetched');
  assert.ok(wf.indexOf('npm run check') < wf.indexOf('eas update --non-interactive'), 'tests must pass before an OTA is published');
  assert.doesNotMatch(wf.split('Publish update')[1].split('run: |')[1], /\$\{\{\s*(inputs|github\.event\.inputs)/, 'no direct input interpolation inside the publish script');
});

test('release publishing needs publish=true, a typed confirmation, and the release branch', () => {
  const wf = read('.github/workflows/android-build.yml');
  assert.match(wf, /publish:[\s\S]*default:\s*false/, 'publish must default to false (build only)');
  assert.match(wf, /PUBLISH-RELEASE/);
  assert.match(wf, /RELEASE_BRANCH:\s*Github-build-pipeline-zombie-crusher/);
  assert.match(wf, /release-apk:[\s\S]*if:\s*\$\{\{\s*inputs\.publish && inputs\.confirm == 'PUBLISH-RELEASE' && github\.ref == 'refs\/heads\/Github-build-pipeline-zombie-crusher'/);
  // every release-creating step in the AAB lane is gated on `publish`
  const aab = wf.slice(wf.indexOf('\n  aab:'));
  for (const step of ['Verify release source', 'Create the release tag', 'Publish store bundle release', 'Confirm the published tag']) {
    const i = aab.indexOf(`- name: ${step}`);
    assert.ok(i > 0, `missing step ${step}`);
    assert.match(aab.slice(i, i + 160), /if:\s*\$\{\{\s*inputs\.publish\s*\}\}/, `${step} must be gated on inputs.publish`);
  }
  assert.match(aab, new RegExp(`merge-base --is-ancestor "\\$GITHUB_SHA" "origin/\\$RELEASE_BRANCH"`));
});

// ---- Release provenance ----------------------------------------------------------------------------------------

test('release order: verify source -> tag the built commit -> publish -> re-check the tag', () => {
  const wf = read('.github/workflows/android-build.yml');
  const apk = wf.slice(wf.indexOf('\n  release-apk:'), wf.indexOf('\n  # Production lane'));
  const order = ['verify-release-source.js', 'tools/tag-release.sh "apk-build-', 'softprops/action-gh-release', 'tag-release.sh --check'].map((s) => apk.indexOf(s));
  assert.ok(order.every((i) => i > 0), 'all four release steps must exist');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'steps must run in that order');
  assert.match(apk, /target_commitish:\s*\$\{\{\s*github\.sha\s*\}\}/);
});

test('every artifact carries a build manifest produced from the same SHA the run builds', () => {
  assert.match(read('.github/workflows/build-apk.yml'), /tools\/build-manifest\.js/);
  assert.match(read('.github/workflows/android-build.yml'), /tools\/build-manifest\.js "dist\/\$NAME" production/);
  const gen = read('scripts/write-build-info.mjs');
  for (const k of ['platform', 'runtimeVersion', 'toolchain', 'builtAt', 'commit', 'branch']) assert.ok(gen.includes(k), `build info must record ${k}`);
});

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

test('build-manifest: refuses to record a build whose embedded commit is not the run SHA', () => {
  const { makeManifest } = require('../tools/build-manifest.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  const info = path.join(dir, 'build-info.ts');
  const art = path.join(dir, 'Game-v1.apk');
  fs.writeFileSync(art, 'apk-bytes');
  fs.writeFileSync(info, `export const BUILD_INFO: BuildInfo = ${JSON.stringify({ commit: SHA, branch: 'x', platform: 'android' })};\n`);
  const ok = makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: { GITHUB_SHA: SHA, GITHUB_REF: 'refs/heads/x' } });
  assert.equal(ok.sourceSha, SHA);
  assert.equal(ok.commit, SHA);
  assert.equal(ok.artifactSha256, crypto.createHash('sha256').update('apk-bytes').digest('hex'));
  assert.throws(() => makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: { GITHUB_SHA: OTHER } }), /!= GITHUB_SHA/);
  assert.throws(() => makeManifest({ artifact: art, profile: 'preview', buildInfoFile: info, env: {} }), /GITHUB_SHA is not set/);
});

test('verify-release-source: accepts a consistent release and rejects every kind of disagreement', () => {
  const { verify } = require('../tools/verify-release-source.js');
  const bytes = Buffer.from('apk-bytes');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const good = { sourceSha: SHA, commit: SHA, artifact: 'G.apk', artifactSha256: digest };
  assert.deepEqual(verify(good, bytes, 'G.apk', SHA), []);
  assert.ok(verify({ ...good, sourceSha: OTHER }, bytes, 'G.apk', SHA).length >= 2, 'manifest source SHA mismatch');
  assert.ok(verify({ ...good, commit: OTHER }, bytes, 'G.apk', SHA).length >= 1, 'embedded commit mismatch');
  assert.ok(verify(good, bytes, 'G.apk', OTHER).length >= 2, 'run SHA mismatch');
  assert.ok(verify(good, Buffer.from('tampered'), 'G.apk', SHA).some((e: string) => /digest/.test(e)), 'altered artifact');
  assert.ok(verify(good, bytes, 'Other.apk', SHA).some((e: string) => /artifact/.test(e)), 'wrong artifact name');
  assert.ok(verify(good, bytes, 'G.apk', 'main').some((e: string) => /40-char/.test(e)), 'a branch name is not a source SHA');
});

test('tag-release.sh: tags the built commit, refuses to move a tag, and --check catches a tag on the wrong commit', () => {
  const sh = path.join(root, 'tools/tag-release.sh');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-'));
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const bare = path.join(tmp, 'remote.git');
  const work = path.join(tmp, 'work');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  git(tmp, 'clone', '-q', bare, work);
  fs.writeFileSync(path.join(work, 'a'), '1'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'one');
  git(work, 'push', '-q', 'origin', 'HEAD:main');                 // "default branch" head
  const defaultHead = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', '-b', 'release');
  fs.writeFileSync(path.join(work, 'a'), '2'); git(work, 'commit', '-qam', 'two');
  const built = git(work, 'rev-parse', 'HEAD');                   // the commit that was "built"
  assert.notEqual(built, defaultHead);
  const run = (...a: string[]) => spawnSync('bash', [sh, ...a], { cwd: work, encoding: 'utf8' });

  assert.equal(run('v1', built).status, 0, 'creates the tag');
  assert.equal(git(work, 'ls-remote', 'origin', 'refs/tags/v1').split(/\s/)[0], built, 'tag is on the built commit, not the default branch head');
  assert.equal(run('--check', 'v1', built).status, 0);
  assert.equal(run('v1', built).status, 0, 'idempotent for the same commit');
  assert.notEqual(run('--check', 'v1', defaultHead).status, 0, 'check fails when the tag is not on the expected commit');
  assert.notEqual(run('v1', defaultHead).status, 0, 'refuses to re-point an existing tag');
  assert.notEqual(run('--check', 'missing', built).status, 0, 'check fails for an absent tag');
  assert.notEqual(run('v2', 'main').status, 0, 'a branch name is rejected as a source');
  // HEAD must be the commit being tagged
  git(work, 'checkout', '-q', '-b', 'other', defaultHead);
  assert.notEqual(run('v3', built).status, 0, 'refuses when checked-out HEAD differs from the SHA');
});

test('branch ledger exists and accounts for every branch the audit found', () => {
  const ledger = read('docs/BRANCH_LEDGER.md');
  for (const b of [PIPELINE, 'checkpoint/pre-resurrection-7004f7d', 'archive/scratch-rewrite-97a5729',
    'claude/fix-bounding-box-controls-7LQLQ', 'claude/fix-build-artifacts-visibility-rwXqU', 'claude/github-game-builds-AAswD', 'main']) {
    assert.ok(ledger.includes(b), `ledger must account for ${b}`);
  }
});
