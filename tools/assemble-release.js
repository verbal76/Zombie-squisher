#!/usr/bin/env node
// Assembles one coordinated build into the studio release layout (master standard sections 5-8):
//   <out>/Zombie Squisher Build NN APK.apk | ... EXE.zip | ... Linux.tar.gz | build-manifest.json | checksums.sha256
// It first proves every platform came from the same source SHA and build number, recomputes every artifact digest,
// then copies the files under their standard names and writes the combined manifest and checksums.
// Usage: node tools/assemble-release.js --sha <40-hex> --build <N> --require android,windows,linux --out <dir> <input-dir>...
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verify, walk, findManifests } = require('./verify-same-source.js');
const names = require('./release-names.js');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function assemble({ sha, build, required, out, dirs, title = names.TITLE, now = new Date() }) {
  const files = dirs.flatMap((d) => walk(d));
  const manifests = findManifests(files);
  const find = (m, file) => files.find((f) => path.basename(f) === m.artifact && path.dirname(f) === path.dirname(file));
  const errs = verify(sha, manifests, { required, buildNumber: build, digest: (m, file) => { const f = find(m, file); return f ? sha256(f) : null; } });
  if (errs.length) return { errs };
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const artifacts = manifests.map(({ m, file }) => {
    const name = names.artifactName(m.platform, build, title);
    fs.copyFileSync(find(m, file), path.join(out, name));
    const digest = sha256(path.join(out, name));
    if (digest !== m.artifactSha256) throw new Error(`${name}: digest changed while copying`);
    return { platform: m.platform, file: name, sha256: digest, size: fs.statSync(path.join(out, name)).size, builtAt: m.builtAt,
      configuration: m.profile, runtimeVersion: m.runtimeVersion, engine: m.electron ? `Electron ${m.electron}` : `React Native ${m.toolchain?.reactNative} (Expo ${m.toolchain?.expo})`,
      toolchain: m.toolchain };
  }).sort((a, b) => a.platform.localeCompare(b.platform));
  const manifest = { gameTitle: title, buildNumber: build, releaseTitle: names.releaseTitle(build, title), tag: names.releaseTag(build), sourceSha: sha,
    appVersion: manifests[0].m.appVersion, createdAt: now.toISOString(), complete: ['android', 'windows', 'linux'].every((p) => artifacts.some((a) => a.platform === p)), artifacts };
  fs.writeFileSync(path.join(out, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
  const sums = [...artifacts.map((a) => `${a.sha256}  ${a.file}`), `${sha256(path.join(out, 'build-manifest.json'))}  build-manifest.json`];
  fs.writeFileSync(path.join(out, 'checksums.sha256'), sums.join('\n') + '\n');
  return { errs: [], manifest };
}
module.exports = { assemble };

if (require.main === module) {
  const a = process.argv.slice(2);
  const get = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const dirs = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
  const sha = get('sha'), build = Number(get('build')), out = get('out');
  const required = (get('require') ?? 'android,windows,linux').split(',').filter(Boolean);
  if (!sha || !build || !out || dirs.length === 0) { console.error('usage: assemble-release.js --sha S --build N --require a,b --out DIR <inputdir>...'); process.exit(2); }
  const r = assemble({ sha, build, required, out, dirs });
  if (r.errs.length) { r.errs.forEach((e) => console.error('::error::' + e)); process.exit(1); }
  console.log(`assembled ${r.manifest.releaseTitle} (${r.manifest.artifacts.map((x) => x.file).join(', ')})${r.manifest.complete ? '' : ' - PARTIAL, not a complete three-platform build'}`);
}
