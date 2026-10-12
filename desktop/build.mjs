// Builds the desktop distribution from the shared source. Run from the repo root:
//   node desktop/build.mjs --platform linux|win32 [--build-number N] [--out dist-desktop] [--web-dir <existing web export>]
// Output: <out>/Zombie Squisher Build N <EXE.zip|Linux.tar.gz> (studio naming; "Build dev" without --build-number) + .sha256, each containing a
// BUILD-MANIFEST.json with the exact source SHA. It never publishes anything.
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const platform = arg('platform');
if (!['linux', 'win32'].includes(platform)) { console.error('usage: build.mjs --platform linux|win32'); process.exit(2); }
const root = process.cwd();
const { artifactName } = require(path.join(root, 'tools/release-names.js'));
const buildNumber = arg('build-number') ? Number(arg('build-number')) : null;
const outDir = path.resolve(arg('out', 'dist-desktop'));
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const git = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

const app = require(path.join(root, 'app.json')).expo;
const version = app.version;
const sha = process.env.GITHUB_SHA || git('rev-parse HEAD');
if (!/^[0-9a-f]{40}$/.test(sha)) { console.error('cannot determine the source commit SHA'); process.exit(1); }
const dirty = git('status --porcelain -- . ":!src/__generated__" ":!dist-desktop"') !== '';
const env = { ...process.env, GITHUB_SHA: sha, BUILD_PLATFORM: platform === 'win32' ? 'windows' : 'linux', ...(buildNumber ? { BUILD_NUMBER: String(buildNumber) } : {}) };
const label = platform === 'win32' ? 'windows' : 'linux';
const base = 'ZombieSquisher';                       // folder inside the archive (stable, no spaces)
const archive = buildNumber ? artifactName(platform === 'win32' ? 'windows' : 'linux', buildNumber) : `Zombie Squisher Build dev ${platform === 'win32' ? 'EXE.zip' : 'Linux.tar.gz'}`;

fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const work = fs.mkdtempSync(path.join(outDir, '.work-'));

// 1. the shared game, exported for the web (build info first, so the About screen shows this exact commit)
let webDir = arg('web-dir');
if (!webDir) {
  sh('node scripts/write-build-info.mjs', { env });
  sh('npm run prepare-assets', { env });
  webDir = path.join(work, 'web');
  sh(`npx expo export --platform web --clear --output-dir "${webDir}"`, { env: { ...env, CI: '1' } });
}
const buildInfoFile = path.join(root, 'src/__generated__/build-info.ts');

// 2. stage the shell
const stage = path.join(work, 'stage'); fs.mkdirSync(stage, { recursive: true });
for (const f of ['main.js', 'preload.js']) fs.copyFileSync(path.join(root, 'desktop', f), path.join(stage, f));
fs.copyFileSync(path.join(root, 'assets/brand/icon.png'), path.join(stage, 'icon.png'));
fs.cpSync(webDir, path.join(stage, 'game'), { recursive: true });
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'zombie-squisher', productName: 'Zombie Squisher', version, main: 'main.js', author: 'Hot Attic Games', description: 'Zombie Squisher' }, null, 2));

// 3. package with Electron (the Windows build is cross-packaged from Linux: no Wine needed)
const { packager } = await import(path.join(root, 'desktop/node_modules/@electron/packager/dist/index.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:').replace(/^\//, 'file:///'));
const exeName = platform === 'win32' ? 'ZombieSquisher' : 'zombie-squisher-bin';
const [pkgPath] = await packager({
  dir: stage, out: path.join(work, 'pkg'), name: 'Zombie Squisher', executableName: exeName, platform, arch: 'x64', overwrite: true, asar: true,
  appVersion: version, appCopyright: 'Copyright (c) Hot Attic Games', prune: false, quiet: true,
  electronVersion: require(path.join(root, 'desktop/node_modules/electron/package.json')).version,
});

// 3b. Windows: brand the executable (icon + version info). resedit is pure JS, so this works from Linux without Wine.
if (platform === 'win32') {
  const exePath = path.join(pkgPath, 'ZombieSquisher.exe');
  const ico = path.join(work, 'icon.ico');
  execFileSync('python3', ['-c', `from PIL import Image; Image.open('assets/brand/icon.png').convert('RGBA').save('${ico}', format='ICO', sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])`], { cwd: root });
  const ResEdit = await import(path.join(root, 'desktop/node_modules/resedit/dist/index.js').replace(/\\/g, '/').replace(/^\//, 'file:///'));
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, iconFile.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const ver = version.split('.').map(Number);
  vi.setFileVersion(ver[0], ver[1], ver[2], 0, 1033); vi.setProductVersion(ver[0], ver[1], ver[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'Zombie Squisher', ProductName: 'Zombie Squisher', CompanyName: 'Hot Attic Games',
    LegalCopyright: 'Copyright (c) Hot Attic Games', OriginalFilename: 'ZombieSquisher.exe', InternalName: 'ZombieSquisher' });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

// 4. assemble the distributable folder
const dist = path.join(work, base); fs.cpSync(pkgPath, dist, { recursive: true });
fs.rmSync(path.join(dist, 'LICENSE'), { force: true });
const electronLicense = path.join(pkgPath, 'LICENSE'); if (fs.existsSync(electronLicense)) fs.copyFileSync(electronLicense, path.join(dist, 'LICENSE.electron.txt'));
if (platform === 'linux') {
  fs.writeFileSync(path.join(dist, 'ZombieSquisher.sh'),
`#!/bin/sh
# Steam / desktop entry point. Sandbox flag: Steam's runtime has no SUID helper for Chromium's sandbox.
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/zombie-squisher-bin" --no-sandbox "$@"
`, { mode: 0o755 });
  fs.chmodSync(path.join(dist, 'zombie-squisher-bin'), 0o755);
  fs.rmSync(path.join(dist, 'chrome-sandbox'), { force: true });      // not SUID in a tarball; --no-sandbox is used instead
}
const readme = platform === 'linux' ? `ZOMBIE SQUISHER ${version} - Linux x86-64 / Steam Deck
Hot Attic Games

RUN        ./ZombieSquisher.sh            (add --windowed to force a window; F11 or Alt+Enter toggles fullscreen)
STEAM      Add as a Non-Steam Game or ship it as the Steam depot; Launch option: ./ZombieSquisher.sh
           On Steam Deck (Gaming Mode) the game starts fullscreen at 1280x800 automatically.
CONTROLS   Gamepad: Left stick/D-pad steer, RT/RB turbo, LT reverse, A ability, X guns, Menu/Start pause.
           Menus: D-pad or left stick move, A select, B back. Keyboard: A/D or arrows steer, W/Shift turbo, S reverse,
           Space ability, G guns, Esc pause. Touchscreen: on-screen buttons.
SAVES      ~/.config/Zombie Squisher/   (Local Storage = progress and settings; logs/main.log)
NEEDS      glibc >= 2.31, GTK3, NSS, ALSA/PulseAudio, a Vulkan/OpenGL driver - all present on SteamOS 3 and mainstream
           desktop distributions. No installer, no launcher, no network required.
SOURCE     see BUILD-MANIFEST.json (exact git commit)
` : `ZOMBIE SQUISHER ${version} - Windows x64
Hot Attic Games

RUN        ZombieSquisher.exe             (--windowed forces a window; F11 or Alt+Enter toggles fullscreen)
CONTROLS   Gamepad (Xbox/XInput): Left stick/D-pad steer, RT/RB turbo, LT reverse, A ability, X guns, Start pause.
           Menus: D-pad or left stick move, A select, B back. Keyboard: A/D or arrows steer, W/Shift turbo, S reverse,
           Space ability, G guns, Esc pause. Mouse/touch: on-screen buttons.
SAVES      %APPDATA%\\Zombie Squisher\\   (Local Storage = progress and settings; logs\\main.log)
NEEDS      Windows 10 or later (64-bit). No installer, no network required.
           Unsigned build: Windows SmartScreen may warn on first launch ("More info" -> "Run anyway").
SOURCE     see BUILD-MANIFEST.json (exact git commit)
`;
fs.writeFileSync(path.join(dist, 'README.txt'), readme);

// 5. provenance manifest (same generator as the APK: fails if the embedded commit is not the source commit)
const { makeManifest } = require(path.join(root, 'tools/build-manifest.js'));
const probe = path.join(work, 'probe.bin'); fs.writeFileSync(probe, sha);   // digest filled in after archiving
const manifest = makeManifest({ artifact: probe, profile: 'desktop', buildInfoFile, env });
manifest.platform = label; manifest.arch = 'x64'; manifest.buildNumber = buildNumber; manifest.dirtyTree = dirty; manifest.electron = require(path.join(root, 'desktop/node_modules/electron/package.json')).version;
manifest.runtimeVersion = app.version;
fs.writeFileSync(path.join(dist, 'BUILD-MANIFEST.json'), JSON.stringify({ ...manifest, artifact: undefined, artifactSha256: undefined }, null, 2));

// 6. archive
if (platform === 'win32') sh(`zip -qr -X "${path.join(outDir, archive)}" "${base}"`, { cwd: work });
else sh(`tar --owner=0 --group=0 --numeric-owner -czf "${path.join(outDir, archive)}" "${base}"`, { cwd: work });
const sha256 = execFileSync('sha256sum', [path.join(outDir, archive)], { encoding: 'utf8' }).split(' ')[0];
fs.writeFileSync(path.join(outDir, `${archive}.sha256`), `${sha256}  ${archive}\n`);
const full = { ...manifest, artifact: archive, artifactSha256: sha256 };
fs.writeFileSync(path.join(outDir, `${archive}.manifest.json`), JSON.stringify(full, null, 2));
fs.rmSync(work, { recursive: true, force: true });
console.log(`built ${archive}  sha256=${sha256}\nsource ${sha}${dirty ? ' (DIRTY working tree)' : ''}`);
