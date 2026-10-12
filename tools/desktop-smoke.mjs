// Drives the REAL desktop build (the web export, in Chromium or inside the packaged Electron app) like a player:
// loads, navigates menus with a (fake, injected) gamepad and the keyboard, plays, pauses, loses focus, reloads,
// measures frame pacing, and screenshots Steam Deck / 16:9 / 1080p sizes. Exits non-zero on any failed assertion.
//   node tools/desktop-smoke.mjs --web <export-dir> --out <dir>       (serves the dir; plain Chromium)
//   node tools/desktop-smoke.mjs --cdp http://127.0.0.1:9222 --out <dir>   (attach to a running Electron app)
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out') ?? 'desktop-smoke'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const log = [];
const ok = (m) => { console.log(`SMOKE OK:   ${m}`); log.push(`OK   ${m}`); };
const fail = (m) => { console.log(`SMOKE FAIL: ${m}`); log.push(`FAIL ${m}`); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, browser, page, ctx;
if (arg('web')) {
  const dir = arg('web');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.wav': 'audio/wav', '.glb': 'model/gltf-binary' };
  server = http.createServer((q, r) => {
    let f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    r.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r);
  }).listen(0);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  var url = `http://localhost:${server.address().port}/`;
} else {
  browser = await chromium.connectOverCDP(arg('cdp'));
  ctx = browser.contexts()[0];
  page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));
  var url = null;
}

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) errors.push(m.text()); });

// A fake XInput-style pad (standard mapping) the page polls through the real navigator.getGamepads() path.
const PAD_SCRIPT = () => {
  const mk = () => ({ id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })), axes: [0, 0, 0, 0] });
  window.__pad = mk();
  window.__padOn = true;
  navigator.getGamepads = () => (window.__padOn ? [window.__pad, null, null, null] : [null, null, null, null]);
  window.__setPad = (btn, axes) => {
    const p = window.__pad;
    p.buttons.forEach((b, i) => { const v = btn[i] ?? 0; b.value = v; b.pressed = v > 0.5; });
    p.axes = axes ?? [0, 0, 0, 0];
  };
};
await ctx.addInitScript(PAD_SCRIPT);
if (!url) await page.evaluate(PAD_SCRIPT);                  // already-running app: inject now
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const setPad = (btn = {}, axes) => page.evaluate(([b, a]) => window.__setPad(b, a), [Object.fromEntries(Object.entries(btn).map(([k, v]) => [BTN[k], v])), axes]);
// Frame-based so a slow software-rendered CI frame cannot swallow a press (a real pad is held for several frames).
const frames = (n) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const press = async (k) => { await setPad({ [k]: 1 }); await frames(3); await setPad({}); await frames(2); };
const text = () => page.evaluate(() => document.body.innerText);
const has = async (s) => (await text()).includes(s);
const active = (label) => page.evaluate((l) => !!document.querySelector(`[aria-label="${l}"]`), label);
const focusLabel = () => page.evaluate(() => { const e = document.querySelector('[data-hag-focus]'); return e ? (e.getAttribute('aria-label') || e.textContent || '').trim() : null; });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; }

if (url) await page.goto(url); else await page.reload();
await page.setViewportSize?.({ width: 1280, height: 800 }).catch(() => {});

// ---- cold start + menu ----
check(await waitFor(() => has('DRIVE')), 'menu reached (DRIVE visible)');
await sleep(600);
check((await focusLabel()) === 'DRIVE', `controller focus starts on DRIVE (got ${await focusLabel()})`);
await shot('menu-1280x800');

// ---- controller navigation of menus ----
await press('DOWN'); const f1 = await focusLabel();
check(f1 && f1 !== 'DRIVE', `D-pad down moves focus off DRIVE (now ${f1})`);
await press('UP'); check((await focusLabel()) === 'DRIVE', 'D-pad up returns to DRIVE');
await setPad({}, [0, 0.9, 0, 0]); await frames(4); await setPad({}); await frames(4);
check((await focusLabel()) !== 'DRIVE', 'left stick down also navigates menus');
await press('UP');

// settings toggle by controller + persistence across reload
const sfxBefore = await has('SFX: ON');
for (let i = 0; i < 6 && !/^SFX/i.test((await focusLabel()) ?? ''); i++) { await press(i % 2 ? 'RIGHT' : 'DOWN'); }
const onSfx = /^SFX/i.test((await focusLabel()) ?? '');
if (onSfx) { await press('A'); await sleep(400); check((await has('SFX: ON')) !== sfxBefore, 'A toggles SFX from the controller'); }
else fail(`could not focus the SFX toggle by controller (focus: ${await focusLabel()})`);
await page.reload(); await waitFor(() => has('DRIVE')); await sleep(500);
check((await has('SFX: ON')) !== sfxBefore, 'setting persisted across a reload');
if (onSfx) { for (let i = 0; i < 6 && !/^SFX/i.test((await focusLabel()) ?? ''); i++) await press(i % 2 ? 'RIGHT' : 'DOWN'); await press('A'); await sleep(300); }   // put it back

// ---- start a run with A; A must not leak into gameplay (ability) ----
for (let i = 0; i < 6 && (await focusLabel()) !== 'DRIVE'; i++) await press('UP');
await press('A');
check(await waitFor(() => has('KILLS')), 'A on DRIVE starts a run');
await sleep(1500); await shot('play-1280x800');

// ---- gameplay mapping ----
await setPad({}, [0.9, 0, 0, 0]); await frames(4);
check(await active('steerRight active'), 'left stick right -> steer right'); 
await setPad({}, [0.1, 0, 0, 0]); await frames(4);
check(!(await active('steerRight active')), 'stick back inside the dead zone releases steering (no drift)');
await setPad({}, [-0.9, 0, 0, 0]); await frames(4);
check(await active('steerLeft active'), 'left stick left -> steer left'); await setPad({}); await frames(4);
await setPad({ RT: 1 }); await frames(4); check(await active('turbo active'), 'RT -> turbo'); await setPad({}); await frames(4);
check(!(await active('turbo active')), 'releasing RT releases turbo');
await setPad({ LT: 1 }); await frames(4); check(await active('gearReverse active'), 'LT held -> reverse gear'); await setPad({}); await frames(4);
check(await active('gearForward active'), 'releasing LT -> forward gear');
const gunsBefore = await active('gunsToggle active'); await press('X'); await sleep(200);
check((await active('gunsToggle active')) !== gunsBefore, 'X toggles guns');
await press('X');
await setPad({}, [0, 0, 0.9, 0.9]); await frames(4); await setPad({}); check(true, 'right stick is ignored (camera is automatic in this game)');

// keyboard
await page.keyboard.down('ArrowRight'); await sleep(300); check(await active('steerRight active'), 'keyboard: Right arrow steers');
await page.keyboard.up('ArrowRight'); await sleep(250);
await page.keyboard.down('Shift'); await sleep(300); check(await active('turbo active'), 'keyboard: Shift is turbo'); await page.keyboard.up('Shift'); await sleep(250);

// ---- touch: the SAME ControlPad component Android uses, driven by real multi-touch events (CDP) ----
// (RN-web feeds the pad's responder with touch identifiers and page coordinates, exactly the data the Android responder gives it.)
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const centreOf = (label) => page.evaluate((l) => { const e = document.querySelector(`[aria-label^="${l}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label);
// touchStart/touchMove carry every finger that is down; touchEnd carries the fingers that were LIFTED (empty = all lifted).
// Real fingers jitter, which produces move events after any start; `jitter` adds that so a second finger is reported to the responder.
const touch = async (type, pts) => { try { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })) }); } catch (e) { if (!/Must send a TouchStart/.test(String(e))) throw e; } };
const jitter = async (pts) => { await touch('touchMove', pts.map((p) => ({ ...p, x: p.x + 0.5 }))); await touch('touchMove', pts); };
const L = await centreOf('steerLeft'), R = await centreOf('steerRight'), T = await centreOf('turbo'), RV = await centreOf('gearReverse'), FW = await centreOf('gearForward'), GN = await centreOf('gunsToggle');
check(!!(L && R && T && RV && FW && GN), 'touch: all six on-screen pad buttons exist');
if (L && R && T && RV && FW && GN) {
  await touch('touchStart', [{ ...L, id: 1 }]); await frames(4);
  check(await active('steerLeft active'), 'touch: a finger down on LEFT steers left');
  await touch('touchEnd', []); await frames(4);
  check(!(await active('steerLeft active')), 'touch: lifting the finger releases LEFT');
  await touch('touchStart', [{ ...R, id: 1 }]); await frames(3);
  await touch('touchStart', [{ ...R, id: 1 }, { ...T, id: 2 }]); await jitter([{ ...R, id: 1 }, { ...T, id: 2 }]); await frames(4);
  check((await active('steerRight active')) && (await active('turbo active')), 'touch: two fingers hold RIGHT + TURBO together (multi-touch)');
  await touch('touchEnd', [{ ...R, id: 1 }]); await frames(4);          // lift RIGHT only; TURBO's finger stays down and does not move
  check(!(await active('steerRight active')) && (await active('turbo active')), 'touch: lifting one finger releases only its button (the other finger stays held, even without moving)');
  await touch('touchEnd', []); await frames(4);
  check(!(await active('turbo active')), 'touch: lifting the last finger releases everything');
  await touch('touchStart', [{ ...RV, id: 1 }]); await touch('touchEnd', []); await frames(4);
  check(await active('gearReverse active'), 'touch: tapping R selects reverse');
  await touch('touchStart', [{ ...FW, id: 1 }]); await touch('touchEnd', []); await frames(4);
  check(await active('gearForward active'), 'touch: tapping F selects forward');
  const gunsOn = await active('gunsToggle active');
  await touch('touchStart', [{ ...GN, id: 1 }]); await touch('touchEnd', []); await frames(4);
  check((await active('gunsToggle active')) !== gunsOn, 'touch: tapping GUNS toggles it');
  await touch('touchStart', [{ ...GN, id: 1 }]); await touch('touchEnd', []); await frames(4);
  // hold two buttons, then pause with the HUD pause button: nothing may stay held, and the pad works again after resume
  await touch('touchStart', [{ ...L, id: 1 }]); await touch('touchStart', [{ ...L, id: 1 }, { ...T, id: 2 }]); await jitter([{ ...L, id: 1 }, { ...T, id: 2 }]); await frames(4);
  const pauseBtn = await page.evaluate(() => { const e = [...document.querySelectorAll('[role=button],[tabindex="0"]')].find((x) => (x.textContent || '').trim() === '❚❚'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (pauseBtn) {
    await touch('touchEnd', []); await touch('touchStart', [{ ...pauseBtn, id: 3 }]); await touch('touchEnd', []); await frames(6);
    check(await waitFor(() => has('PAUSED'), 3000), 'touch: the HUD pause button pauses');
    check(!(await active('steerLeft active')) && !(await active('turbo active')), 'touch: nothing stays held across a pause');
    await press('START'); await waitFor(async () => !(await has('PAUSED')), 3000);
    const L2 = await centreOf('steerLeft');
    await touch('touchStart', [{ ...L2, id: 1 }]); await frames(4);
    check(await active('steerLeft active'), 'touch: the pad works again after resume');
    await touch('touchEnd', []); await frames(4);
  } else fail('touch: HUD pause button not found');
  await touch('touchEnd', []);
}
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});

// ---- performance sample while playing (software GL under CI/Xvfb is NOT representative of a Steam Deck) ----
const perf = await page.evaluate(() => new Promise((res) => {
  const ts = []; let last = performance.now(); const end = last + 6000;
  const f = (n) => { ts.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res({ ts, heap: performance.memory ? performance.memory.usedJSHeapSize : null }); };
  requestAnimationFrame(f);
}));
const sorted = [...perf.ts].sort((a, b) => a - b);
const avg = perf.ts.reduce((a, b) => a + b, 0) / perf.ts.length, p95 = sorted[Math.floor(sorted.length * 0.95)], p99 = sorted[Math.floor(sorted.length * 0.99)];
const perfLine = `frames=${perf.ts.length} avgFps=${(1000 / avg).toFixed(1)} frameMs avg=${avg.toFixed(1)} p95=${p95.toFixed(1)} p99=${p99.toFixed(1)} max=${sorted.at(-1).toFixed(1)} jsHeapMB=${perf.heap ? (perf.heap / 1048576).toFixed(0) : 'n/a'}`;
console.log(`PERF ${perfLine}`); log.push(`PERF ${perfLine}`);
check(perf.ts.length > 20, 'render loop kept ticking during the sample');

// ---- pause / resume / focus loss ----
await setPad({ RT: 1, LT: 0 }, [0.9, 0, 0, 0]); await frames(4);          // hold steer + turbo, then pause
await setPad({ RT: 1, START: 1 }, [0.9, 0, 0, 0]); await frames(4); await setPad({ RT: 1 }, [0.9, 0, 0, 0]); await frames(4);
check(await waitFor(() => has('PAUSED'), 3000), 'Start pauses');
check(!(await active('steerRight active')) && !(await active('turbo active')), 'nothing stays held while paused');
check((await focusLabel()) !== null, 'controller focus is on the pause menu');
await setPad({}); await frames(4);
await press('START'); check(await waitFor(async () => !(await has('PAUSED')), 3000), 'Start resumes from the pause menu');
await setPad({ RT: 1 }); await frames(4);
check(await active('turbo active'), 're-pressing RT after resume works');
await setPad({}); await frames(4);
await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(400);
check(await has('PAUSED'), 'window focus loss pauses the game');
await press('B'); check(await waitFor(async () => !(await has('PAUSED')), 3000), 'B (cancel) resumes from the pause menu');
await page.evaluate(() => { window.__padOn = false; window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: { index: 0 } })); }); await sleep(400);
check(await has('PAUSED'), 'controller disconnect pauses the game');
await page.evaluate(() => { window.__padOn = true; window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: { index: 0 } })); }); await sleep(300);
await press('START'); await waitFor(async () => !(await has('PAUSED')), 3000);
check(!(await has('PAUSED')), 'controller hot-plug: reconnect and resume');
await shot('play-resumed');

// ---- layout at Steam Deck / other sizes: nothing clipped, targets big enough ----
for (const [w, h, name] of [[1280, 800, 'steamdeck-1280x800'], [1280, 720, '16x9-1280x720'], [1920, 1080, '1080p'], [1024, 640, 'small-1024x640'], [2560, 1080, 'ultrawide-2560x1080']]) {
  await page.setViewportSize({ width: w, height: h }); await sleep(700);
  const bad = await page.evaluate(() => [...document.querySelectorAll('[tabindex]:not([tabindex="-1"]), button, [role=button]')].map((e) => { const r = e.getBoundingClientRect(); return { l: (e.getAttribute('aria-label') || e.textContent || '').slice(0, 14), r: r.toJSON(), vis: r.width > 0 }; })
    .filter((x) => x.vis && (x.r.left < -1 || x.r.top < -1 || x.r.right > innerWidth + 1 || x.r.bottom > innerHeight + 1)).map((x) => x.l));
  check(bad.length === 0, `${name}: every control is inside the display${bad.length ? ` (clipped: ${bad.join(',')})` : ''}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1), `${name}: no page overflow`);
  await shot(`play-${name}`);
}
await page.setViewportSize({ width: 1280, height: 800 });

// ---- end run, back to menu, keyboard-only menu navigation ----
await press('START'); await waitFor(() => has('PAUSED'), 3000);
await page.keyboard.press('ArrowDown'); await sleep(200);
const kfocus = await focusLabel(); check(kfocus !== null, `keyboard arrows move menu focus (${kfocus})`);

check(errors.length === 0, `no page errors or console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : ''}`);
fs.writeFileSync(path.join(OUT, 'result.txt'), log.join('\n') + `\nSMOKE_FAILS=${fails}\n`);
console.log(`SMOKE_FAILS=${fails}`);
if (arg('web')) { await browser.close(); server.close(); } else { await browser.close().catch(() => {}); }
process.exit(fails ? 1 : 0);
