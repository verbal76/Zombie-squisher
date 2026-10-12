// The one local build interface (master standard section 5):  npm run build -- --platform android|windows|linux|all
//   [--build-number N] [--out dir] [--allow-dirty] [--dry-run]
// Every target builds from THIS checkout's HEAD (one SHA). Hosted builds use .github/workflows/build.yml, which calls the
// same scripts. Nothing here publishes anything.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = ['android', 'windows', 'linux'];

/**
 * Pure planning step (unit tested): which commands run, or why the request is refused.
 * @param {{ platform?: string, buildNumber?: number | null, out?: string, allowDirty?: boolean, dirty?: boolean }} o
 */
export function plan({ platform, buildNumber = null, out = 'dist-build', allowDirty = false, dirty = false }) {
  const errors = [];
  const targets = platform === 'all' ? PLATFORMS : PLATFORMS.includes(platform) ? [platform] : [];
  if (targets.length === 0) errors.push(`--platform must be one of android, windows, linux, all (got "${platform}")`);
  if (buildNumber !== null && (!Number.isInteger(buildNumber) || buildNumber < 1)) errors.push('--build-number must be a positive integer');
  if (dirty && !allowDirty) errors.push('the working tree has uncommitted changes: a build must come from one recorded commit (commit first, or pass --allow-dirty for a throwaway local build)');
  const bn = buildNumber ? ['--build-number', String(buildNumber)] : [];
  const steps = targets.map((t) => t === 'android'
    ? { platform: t, cmd: 'bash', args: ['tools/build-android.sh', path.join(out, 'android'), ...(buildNumber ? [String(buildNumber)] : [])] }
    : { platform: t, cmd: 'node', args: ['desktop/build.mjs', '--platform', t === 'windows' ? 'win32' : 'linux', ...bn, '--out', path.join(out, t)] });
  return { errors, steps };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  let dirty = false;
  try { dirty = execFileSync('git', ['status', '--porcelain', '--', '.', ':!src/__generated__', ':!dist-build', ':!dist-desktop'], { encoding: 'utf8' }).trim() !== ''; } catch { /* not a git checkout */ }
  const p = plan({ platform: get('platform'), buildNumber: get('build-number') ? Number(get('build-number')) : null, out: get('out') ?? 'dist-build', allowDirty: a.includes('--allow-dirty'), dirty });
  if (p.errors.length) { p.errors.forEach((e) => console.error(`build: ${e}`)); process.exit(2); }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(`build ${p.steps.map((s) => s.platform).join(' + ')} from ${sha}${get('build-number') ? ` as Build ${get('build-number')}` : ' (dev build)'}`);
  for (const s of p.steps) {
    console.log(`\n== ${s.platform}: ${s.cmd} ${s.args.join(' ')}`);
    if (a.includes('--dry-run')) continue;
    try { execFileSync(s.cmd, s.args, { stdio: 'inherit', env: { ...process.env, GITHUB_SHA: sha } }); }
    catch { console.error(`\nbuild: ${s.platform} FAILED. Earlier platforms completed, later ones were not attempted: this is a PARTIAL build, not a complete release.`); process.exit(1); }
  }
}
