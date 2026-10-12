// Studio naming convention (Hot Attic Games master standard, section 7/8). Pure; shared by the build scripts, the
// release workflow and the tests so a name can never be spelled two ways.
//   Zombie Squisher Build 77 APK.apk | Zombie Squisher Build 77 EXE.zip | Zombie Squisher Build 77 Linux.tar.gz
const TITLE = 'Zombie Squisher';
const KINDS = { android: { label: 'APK', ext: 'apk' }, windows: { label: 'EXE', ext: 'zip' }, linux: { label: 'Linux', ext: 'tar.gz' } };

function assertBuildNumber(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`build number must be a positive integer, got ${n}`);
}
const artifactName = (platform, n, title = TITLE) => {
  assertBuildNumber(n);
  const k = KINDS[platform];
  if (!k) throw new Error(`unknown platform ${platform}`);
  return `${title} Build ${n} ${k.label}.${k.ext}`;
};
const releaseTitle = (n, title = TITLE) => { assertBuildNumber(n); return `${title} Build ${n}`; };
const releaseTag = (n) => { assertBuildNumber(n); return `build-${n}`; };
/** Highest coordinated build number already used by any tag (build-NN, and the historical apk-build-NN). */
const highestUsed = (tags) => tags.reduce((m, t) => { const x = /^(?:apk-)?build-(\d+)$/.exec(t); return x ? Math.max(m, Number(x[1])) : m; }, 0);
/** Build numbers are monotonic and never reused: must be above every number any tag has used. */
function validateNewBuildNumber(n, tags) {
  assertBuildNumber(n);
  const hi = highestUsed(tags);
  if (tags.includes(releaseTag(n))) return `build number ${n} is already used (tag ${releaseTag(n)} exists)`;
  if (n <= hi) return `build number ${n} must be greater than the highest used so far (${hi})`;
  return null;
}
module.exports = { TITLE, KINDS, artifactName, releaseTitle, releaseTag, highestUsed, validateNewBuildNumber };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'name') console.log(artifactName(a, Number(b)));
  else if (cmd === 'title') console.log(releaseTitle(Number(a)));
  else if (cmd === 'tag') console.log(releaseTag(Number(a)));
  else if (cmd === 'validate') { const err = validateNewBuildNumber(Number(a), (b || '').split(/\s+/).filter(Boolean)); if (err) { console.error('::error::' + err); process.exit(1); } console.log('build number ok'); }
  else { console.error('usage: release-names.js name <platform> <n> | title <n> | tag <n> | validate <n> "<tags>"'); process.exit(2); }
}
