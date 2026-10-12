#!/usr/bin/env node
// Writes build-manifest.json next to a built artifact: exact source, version, toolchain and artifact digest.
// Usage: node tools/build-manifest.js <artifact> <profile> [out]   (env: GITHUB_SHA, GITHUB_REF; reads src/__generated__/build-info.ts)
// Fails when the commit embedded in the app (build-info) differs from the commit the CI run is building.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function readBuildInfo(file) {
  const src = fs.readFileSync(file, 'utf8');
  const i = src.indexOf('BUILD_INFO: BuildInfo = ');
  if (i < 0) throw new Error(`no BUILD_INFO in ${file}`);
  return JSON.parse(src.slice(i + 'BUILD_INFO: BuildInfo = '.length).replace(/;\s*$/, ''));
}

function makeManifest({ artifact, profile, buildInfoFile, env }) {
  const info = readBuildInfo(buildInfoFile);
  const sourceSha = env.GITHUB_SHA;
  if (!sourceSha) throw new Error('GITHUB_SHA is not set: provenance cannot be recorded');
  if (info.commit !== sourceSha) throw new Error(`build-info commit ${info.commit} != GITHUB_SHA ${sourceSha}`);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  return { ...info, sourceSha, sourceRef: env.GITHUB_REF || null, runId: env.GITHUB_RUN_ID || null, profile,
           artifact: path.basename(artifact), artifactSha256: sha256 };
}

module.exports = { readBuildInfo, makeManifest };

if (require.main === module) {
  const [artifact, profile, out] = process.argv.slice(2);
  if (!artifact || !profile) { console.error('usage: build-manifest.js <artifact> <profile> [out]'); process.exit(2); }
  const m = makeManifest({ artifact, profile, buildInfoFile: 'src/__generated__/build-info.ts', env: process.env });
  fs.writeFileSync(out || path.join(path.dirname(artifact), 'build-manifest.json'), JSON.stringify(m, null, 2));
  console.log(JSON.stringify(m, null, 2));
}
