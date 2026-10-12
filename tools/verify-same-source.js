#!/usr/bin/env node
// Coordinated multi-platform release gate: every platform artifact must come from the SAME source commit.
// Usage: node tools/verify-same-source.js <expected-sha> <out-release-manifest.json> <dir> [<dir> ...]
// Each <dir> is searched (recursively) for build manifests (build-manifest.json, *.manifest.json) and the artifacts
// they describe; the artifact digest in each manifest is recomputed. Requires android + windows + linux unless
// --require <a,b,..> names a subset. Exit 1 on any disagreement.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function verify(expectedSha, manifests, { required = ['android', 'windows', 'linux'], digest = () => null } = {}) {
  const errs = [];
  if (!/^[0-9a-f]{40}$/.test(expectedSha || '')) errs.push(`expected SHA is not a 40-char commit: "${expectedSha}"`);
  const seen = new Map();
  for (const { file, m } of manifests) {
    const plat = m.platform;
    if (!plat) { errs.push(`${file}: manifest has no platform`); continue; }
    if (m.sourceSha !== expectedSha) errs.push(`${plat}: sourceSha ${m.sourceSha} != ${expectedSha}`);
    if (m.commit !== expectedSha) errs.push(`${plat}: embedded commit ${m.commit} != ${expectedSha}`);
    if (m.dirtyTree === true || m.dirty === true) errs.push(`${plat}: built from a dirty working tree`);
    if (seen.has(plat)) errs.push(`${plat}: more than one manifest (${seen.get(plat)} and ${file})`);
    seen.set(plat, file);
    const d = digest(m, file);
    if (d !== null && d !== m.artifactSha256) errs.push(`${plat}: artifact ${m.artifact} digest ${d} != manifest ${m.artifactSha256}`);
    if (d === null && digest !== undefined && m.artifact) errs.push(`${plat}: artifact ${m.artifact} not found next to its manifest`);
  }
  for (const r of required) if (!seen.has(r)) errs.push(`missing platform: ${r}`);
  const versions = new Set(manifests.map(({ m }) => m.appVersion));
  if (versions.size > 1) errs.push(`platforms disagree on app version: ${[...versions].join(', ')}`);
  return errs;
}

module.exports = { verify, walk };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--require');
  const required = ri >= 0 ? args[ri + 1].split(',').filter(Boolean) : ['android', 'windows', 'linux'];
  const [sha, out, ...dirs] = args.filter((a, i) => a !== '--require' && (ri < 0 || i !== ri + 1));
  if (!sha || !out || dirs.length === 0) { console.error('usage: verify-same-source.js <sha> <out.json> <dir>... [--require android,linux]'); process.exit(2); }
  const files = dirs.flatMap((d) => walk(d));
  const manifests = files.filter((f) => /(^|\/)(build-manifest\.json|[^/]+\.manifest\.json)$/.test(f)).map((f) => ({ file: f, m: JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const digest = (m, file) => {
    const art = files.find((f) => path.basename(f) === m.artifact && path.dirname(f) === path.dirname(file));
    return art ? crypto.createHash('sha256').update(fs.readFileSync(art)).digest('hex') : null;
  };
  const errs = verify(sha, manifests, { required, digest });
  if (errs.length) { errs.forEach((e) => console.error('::error::' + e)); process.exit(1); }
  const release = { sourceSha: sha, appVersion: manifests[0].m.appVersion, builtAt: new Date().toISOString(),
    artifacts: manifests.map(({ m }) => ({ platform: m.platform, artifact: m.artifact, sha256: m.artifactSha256, builtAt: m.builtAt, toolchain: m.toolchain })) };
  fs.writeFileSync(out, JSON.stringify(release, null, 2));
  console.log(`all ${manifests.length} platforms built from ${sha}`);
}
