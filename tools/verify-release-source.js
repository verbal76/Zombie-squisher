#!/usr/bin/env node
// Release gate: the manifest, the artifact and the CI run must all describe the SAME source commit.
// Usage: node tools/verify-release-source.js <manifest.json> <artifact> <expected-sha>
// Exit 1 (with the reasons) on any disagreement. Also exported for tests.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function verify(manifest, artifactBytes, artifactName, expectedSha) {
  const errs = [];
  if (!/^[0-9a-f]{40}$/.test(expectedSha || '')) errs.push(`expected SHA is not a full 40-char commit: "${expectedSha}"`);
  if (manifest.sourceSha !== expectedSha) errs.push(`manifest.sourceSha ${manifest.sourceSha} != run SHA ${expectedSha}`);
  if (manifest.commit !== expectedSha) errs.push(`manifest.commit (embedded in the app) ${manifest.commit} != run SHA ${expectedSha}`);
  if (manifest.sourceSha !== manifest.commit) errs.push('manifest.sourceSha != manifest.commit');
  if (manifest.artifact !== artifactName) errs.push(`manifest.artifact ${manifest.artifact} != ${artifactName}`);
  const digest = crypto.createHash('sha256').update(artifactBytes).digest('hex');
  if (manifest.artifactSha256 !== digest) errs.push('artifact digest does not match manifest.artifactSha256 (artifact was altered or is a different build)');
  return errs;
}

module.exports = { verify };

if (require.main === module) {
  const [manifestPath, artifact, sha] = process.argv.slice(2);
  if (!manifestPath || !artifact || !sha) { console.error('usage: verify-release-source.js <manifest> <artifact> <sha>'); process.exit(2); }
  const errs = verify(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), fs.readFileSync(artifact), path.basename(artifact), sha);
  if (errs.length) { errs.forEach((e) => console.error('::error::' + e)); process.exit(1); }
  console.log(`release source verified: ${sha}`);
}
