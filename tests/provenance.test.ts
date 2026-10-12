import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const PIPELINE = 'Github-build-pipeline-zombie-crusher';

test('release workflow: tags land on the built commit and only the pipeline branch publishes', () => {
  const wf = read('.github/workflows/android-build.yml');
  assert.match(wf, /target_commitish:\s*\$\{\{\s*github\.sha\s*\}\}/, 'a new release tag must point at the built commit');
  assert.match(wf, new RegExp(`if:\\s*\\$\\{\\{\\s*github\\.ref == 'refs/heads/${PIPELINE}'`), 'release-apk must be restricted to the pipeline branch');
});

test('store bundle job refuses sources outside the pipeline branch', () => {
  const wf = read('.github/workflows/android-build.yml');
  assert.match(wf, /fetch-depth:\s*0/);
  assert.match(wf, new RegExp(`merge-base --is-ancestor "\\$GITHUB_SHA" origin/${PIPELINE}`));
});

test('every APK records provenance and fails if the embedded commit is not the built commit', () => {
  const wf = read('.github/workflows/build-apk.yml');
  assert.match(wf, /build-manifest\.json/);
  assert.match(wf, /!== m\.commit|m\.sourceSha !== m\.commit/);
  const gen = read('scripts/write-build-info.mjs');
  for (const k of ['platform', 'runtimeVersion', 'toolchain', 'builtAt', 'commit', 'branch']) assert.ok(gen.includes(k), `build info must record ${k}`);
});

test('no workflow builds from a hard-coded branch other than the pipeline branch', () => {
  for (const f of ['android-build.yml', 'eas-update.yml']) {
    const wf = read(`.github/workflows/${f}`);
    const branches = [...wf.matchAll(/branches:\s*\n((?:\s+- .*\n)+)/g)].flatMap((m) => [...m[1].matchAll(/- '?([^'\n]+)'?/g)].map((x) => x[1].trim()));
    for (const b of branches) assert.equal(b, PIPELINE, `${f} may only auto-run on ${PIPELINE}`);
  }
});

test('branch ledger exists and accounts for every branch the audit found', () => {
  const ledger = read('docs/BRANCH_LEDGER.md');
  for (const b of [PIPELINE, 'checkpoint/pre-resurrection-7004f7d', 'archive/scratch-rewrite-97a5729',
    'claude/fix-bounding-box-controls-7LQLQ', 'claude/fix-build-artifacts-visibility-rwXqU', 'claude/github-game-builds-AAswD', 'main']) {
    assert.ok(ledger.includes(b), `ledger must account for ${b}`);
  }
});
