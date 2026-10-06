// Screenshots every pure-UI screen from the web UI gallery across landscape sizes and safe-area insets.
// Build the gallery first:  EXPO_PUBLIC_UI_GALLERY=1 npx expo export --platform web --output-dir <dir>
// Usage: node tools/ui-shots.mjs <gallery-dir> <out-dir> [screens,comma] [viewports,comma e.g. 915x412]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [dir, out, screensArg, vpArg] = process.argv.slice(2);
const SCREENS = (screensArg || 'splash,menu,garage,gameover,hud,pause').split(',');
const VIEWPORTS = (vpArg || '640x360,915x412,1280x576,844x390').split(',').map((s) => s.split('x').map(Number));
const INSETS = { none: '0,0,0,0', notch: '24,48,24,48' };   // top,right,bottom,left (status bar / camera cutout / gesture bar)
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(dir, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const violations = [];
const errors = [];
for (const [w, h] of VIEWPORTS) {
  for (const screen of SCREENS) {
    for (const [iname, insets] of Object.entries(INSETS)) {
      if (iname === 'notch' && !['hud', 'menu', 'pause'].includes(screen)) continue;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => errors.push(`${screen} ${w}x${h}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${screen} ${w}x${h} console: ${m.text().slice(0, 200)}`); });
      await page.goto(`http://localhost:${port}/index.html?screen=${screen}&insets=${insets}`);
      await page.waitForTimeout(screen === 'splash' ? 900 : 500);
      // Layout assertions: every control must be fully on screen, >= 44 px, and the page must not scroll sideways.
      const found = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        controls: [...document.querySelectorAll('[role=button],[role=switch]')].map((e) => {
          const r = e.getBoundingClientRect();
          return { label: e.getAttribute('aria-label') || e.textContent?.slice(0, 24) || '?', x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
        }),
      }));
      if (found.overflowX) violations.push(`${screen} ${w}x${h} ${iname}: horizontal overflow`);
      if (!['garage'].includes(screen)) {   // garage lists live inside scroll panes, so their rows may start off screen
        for (const c of found.controls) {
          if (c.w < 1) continue;
          if (c.x < -1 || c.y < -1 || c.x + c.w > c.vw + 1 || c.y + c.h > c.vh + 1) violations.push(`${screen} ${w}x${h} ${iname}: "${c.label}" off screen (${c.x | 0},${c.y | 0} ${c.w | 0}x${c.h | 0})`);
          if (c.h < 44 || c.w < 44) violations.push(`${screen} ${w}x${h} ${iname}: "${c.label}" touch target ${c.w | 0}x${c.h | 0} < 44`);
        }
      }
      await page.screenshot({ path: path.join(out, `${screen}_${w}x${h}_${iname}.png`) });
      await page.close();
    }
  }
}
await browser.close(); server.close();
const real = [...new Set(errors)].filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));   // favicon
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'no page errors');
console.log(violations.length ? `LAYOUT VIOLATIONS:\n${violations.join('\n')}` : 'no layout violations');
console.log('screenshots in', out);
if (real.length || violations.length) process.exit(1);
