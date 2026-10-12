// Save-persistence and shutdown behaviour of the PACKAGED desktop app (Linux; run under xvfb-run if there is no display):
//   1. launch, write progress+settings through the game's own storage, quit cleanly (exit code 0)
//   2. relaunch with the same profile: the data is still there
//   3. launch, write more, then kill -9 (interrupted session): relaunch must start and still hold the last saved data
//   4. a second instance while one is running must not start another copy
//   node tools/desktop-restart-test.mjs --dist <extracted dist dir> --home <scratch dir>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dist = path.resolve(arg('dist')); const home = path.resolve(arg('home'));
fs.mkdirSync(home, { recursive: true });
let fails = 0; const ok = (m) => console.log(`SMOKE OK:   ${m}`); const fail = (m) => { console.log(`SMOKE FAIL: ${m}`); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port = 9300 + Math.floor(Math.random() * 500);

function launch(extra = []) {
  const p = port++;
  const cmd = process.env.DISPLAY ? [path.join(dist, 'ZombieSquisher.sh')] : ['xvfb-run', '-a', '-s', '-screen 0 1280x800x24', path.join(dist, 'ZombieSquisher.sh')];
  const child = spawn(cmd[0], [...cmd.slice(1), `--remote-debugging-port=${p}`, '--windowed', ...extra], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), HAG_SOFTWARE_GL: '1' }, stdio: 'ignore', detached: true });
  const exit = new Promise((res) => child.on('exit', (code, sig) => res({ code, sig })));
  return { child, port: p, exit };
}
async function connect(port) {
  for (let i = 0; i < 60; i++) { try { const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); const c = b.contexts()[0]; const pg = c.pages()[0] ?? await c.waitForEvent('page'); return { b, pg }; } catch { await sleep(1000); } }
  throw new Error('app did not start');
}
const keys = (pg) => pg.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

// 1. first run
let a = launch(); let { b, pg } = await connect(a.port);
await pg.waitForFunction(() => document.body.innerText.includes('DRIVE'), null, { timeout: 60000 });
await pg.evaluate(() => { localStorage.setItem('hag-restart-test', 'run-1'); });
await sleep(1500);
const k1 = await keys(pg);
check(Object.keys(k1).length >= 2, `game storage has data (${Object.keys(k1).length} keys: ${Object.keys(k1).join(', ').slice(0, 80)})`);
// single instance: a second launch with the same profile must exit immediately
const second = launch(); const secondExit = await Promise.race([second.exit, sleep(15000).then(() => 'still-running')]);
check(secondExit !== 'still-running', 'a second instance exits instead of opening a second copy');
try { process.kill(-second.child.pid, 'SIGKILL'); } catch {}
await pg.evaluate(() => window.hagDesktop.quit()).catch(() => {});
const r1 = await Promise.race([a.exit, sleep(20000).then(() => null)]);
check(r1 && r1.code === 0, `clean quit exits with code 0 (got ${JSON.stringify(r1)})`);
await b.close().catch(() => {});

// 2. relaunch: data persisted
a = launch(); ({ b, pg } = await connect(a.port));
await pg.waitForFunction(() => document.body.innerText.includes('DRIVE'), null, { timeout: 60000 });
const k2 = await keys(pg);
check(k2['hag-restart-test'] === 'run-1', 'data written before a clean quit is present after relaunch');
check(JSON.stringify(Object.keys(k2)) === JSON.stringify(Object.keys(k1)), 'same save keys after relaunch');

// 3. interrupted session: write, wait for the storage flush window, kill -9
await pg.evaluate(() => { localStorage.setItem('hag-restart-test', 'run-2'); });
await sleep(6000);
try { process.kill(-a.child.pid, 'SIGKILL'); } catch {}
await a.exit; await b.close().catch(() => {});
a = launch(); ({ b, pg } = await connect(a.port));
await pg.waitForFunction(() => document.body.innerText.includes('DRIVE'), null, { timeout: 60000 });
const k3 = await keys(pg);
check(k3['hag-restart-test'] === 'run-2', 'after kill -9 the app restarts to the menu and keeps the last saved data');
await pg.evaluate(() => { localStorage.removeItem('hag-restart-test'); window.hagDesktop.quit(); }).catch(() => {});
await Promise.race([a.exit, sleep(20000)]); await b.close().catch(() => {});
console.log(`SMOKE_FAILS=${fails}`); process.exit(fails ? 1 : 0);
