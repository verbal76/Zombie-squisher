#!/usr/bin/env node
// Package integrity check for a desktop distribution archive (does not run it).
// Usage: node tools/verify-desktop-package.js <archive.tar.gz|archive.zip> <linux|windows> [sha256-file]
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function check(archive, platform, root) {
  const errs = [];
  const listing = platform === 'linux'
    ? execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean)
    : execFileSync('unzip', ['-Z', '-l', archive], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter((l) => /^[-d]/.test(l));
  const has = (re) => listing.some((l) => re.test(l));
  const base = 'ZombieSquisher';   // fixed folder name inside every desktop archive
  if (!has(new RegExp(`${base}/BUILD-MANIFEST\\.json$`))) errs.push('BUILD-MANIFEST.json missing');
  if (!has(new RegExp(`${base}/README\\.txt$`))) errs.push('README.txt missing');
  if (!has(new RegExp(`${base}/THIRD_PARTY_NOTICES\\.md$`))) errs.push('THIRD_PARTY_NOTICES.md missing');
  if (!has(new RegExp(`${base}/LICENSE\\.electron\\.txt$`))) errs.push('LICENSE.electron.txt missing');
  if (!has(/resources\/app\.asar$/)) errs.push('resources/app.asar missing');
  if (platform === 'linux') {
    const exec = (name) => listing.some((l) => l.endsWith(`${base}/${name}`) && /^-r[w-]x/.test(l));
    if (!exec('ZombieSquisher.sh')) errs.push('ZombieSquisher.sh is missing or not executable');
    if (!exec('zombie-squisher-bin')) errs.push('zombie-squisher-bin is missing or not executable');
    if (has(/chrome-sandbox$/)) errs.push('chrome-sandbox must not be shipped (not SUID in a tarball)');
  } else {
    if (!has(new RegExp(`${base}/ZombieSquisher\\.exe$`))) errs.push('ZombieSquisher.exe missing');
    if (!has(/ffmpeg\.dll$/) || !has(/libEGL\.dll$/)) errs.push('Electron runtime DLLs missing');
  }
  // manifest + asar contents
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkgcheck-'));
  try {
    if (platform === 'linux') execFileSync('tar', ['-xzf', archive, '-C', tmp, `${base}/BUILD-MANIFEST.json`, `${base}/resources/app.asar`]);
    else execFileSync('unzip', ['-q', archive, `${base}/BUILD-MANIFEST.json`, `${base}/resources/app.asar`, '-d', tmp]);
    const m = JSON.parse(fs.readFileSync(path.join(tmp, base, 'BUILD-MANIFEST.json'), 'utf8'));
    if (m.platform !== platform) errs.push(`manifest platform ${m.platform} != ${platform}`);
    if (!/^[0-9a-f]{40}$/.test(m.sourceSha || '') || m.sourceSha !== m.commit) errs.push('manifest source SHA is missing or differs from the embedded commit');
    const asarBin = path.join(root, 'desktop/node_modules/@electron/asar/bin/asar.js');
    const files = execFileSync('node', [asarBin, 'list', path.join(tmp, base, 'resources/app.asar')], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n');
    for (const need of ['/main.js', '/preload.js', '/game/index.html']) if (!files.includes(need)) errs.push(`app.asar lacks ${need}`);
    if (!files.some((f) => /\/game\/assets\/(.*\/)?audio\/.*\.wav$/.test(f))) errs.push('app.asar lacks the audio assets');
    if (!files.some((f) => /\/game\/assets\/.*\.glb$/.test(f))) errs.push('app.asar lacks the 3D vehicle models');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return errs;
}
module.exports = { check };

if (require.main === module) {
  const [archive, platform, shaFile] = process.argv.slice(2);
  if (!archive || !['linux', 'windows'].includes(platform)) { console.error('usage: verify-desktop-package.js <archive> <linux|windows> [sha256-file]'); process.exit(2); }
  const errs = check(path.resolve(archive), platform, path.resolve(__dirname, '..'));
  if (shaFile) {
    const want = fs.readFileSync(shaFile, 'utf8').split(/\s/)[0];
    const got = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (want !== got) errs.push(`archive sha256 ${got} != ${want}`);
  }
  if (errs.length) { errs.forEach((e) => console.error('::error::' + e)); process.exit(1); }
  console.log(`package OK: ${path.basename(archive)}`);
}
