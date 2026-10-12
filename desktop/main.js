// Zombie Squisher desktop shell (Windows / Linux / Steam Deck).
// Serves the shared game (the Expo web export in ./game) over a private app:// origin so saves (localStorage) stay in
// one stable place, and handles the things a web page cannot: window + fullscreen, power events, clean shutdown.
// It contains NO game logic. Anything about how the game plays lives in the shared source under ../src.
'use strict';
const { app, BrowserWindow, Menu, protocol, powerMonitor, session, screen, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isLinux = process.platform === 'linux';
const argv = process.argv.slice(1);
const flag = (n) => argv.includes(`--${n}`);
const GAME_DIR = path.join(__dirname, 'game');
const ORIGIN = 'app://game';

// ---- command line (must be set before ready) ---------------------------------------------------------------------
app.setName('Zombie Squisher');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');       // game audio starts without a click
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
if (isLinux) app.commandLine.appendSwitch('no-sandbox');                            // belt and braces; the shipped wrapper also passes it
if (process.env.HAG_SOFTWARE_GL === '1') {                                          // CI / VMs without a GPU only
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

// ---- diagnostics -------------------------------------------------------------------------------------------------
let logFile = null;
function log(...a) {
  const line = `${new Date().toISOString()} ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try { if (!logFile) { const dir = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(dir, { recursive: true }); logFile = path.join(dir, 'main.log'); try { if (fs.statSync(logFile).size > 512 * 1024) fs.renameSync(logFile, logFile + '.old'); } catch {} } fs.appendFileSync(logFile, line); } catch {}
  if (flag('verbose')) process.stdout.write(line);
}
process.on('uncaughtException', (e) => log('uncaughtException', String(e && e.stack || e)));

// ---- progress mirror (Steam Cloud-ready plain file) ----------------------------------------------------------------
// The game stores progress in localStorage (a LevelDB directory, which is a poor Steam Cloud / backup target and can be
// damaged by a crash). Every progress write is mirrored to <userData>/saves/progress.json with an atomic replace and a
// .bak of the previous good copy; preload.js restores localStorage from it when the live copy is missing or corrupt.
// Only progress is mirrored: settings and device preferences stay local (they must not roam between devices).
const saveDir = () => path.join(app.getPath('userData'), 'saves');
const saveFile = () => path.join(saveDir(), 'progress.json');
const validSave = (o) => o && typeof o === 'object' && o.schema === 1 && o.keys && typeof o.keys === 'object';
function readSave() {
  for (const f of [saveFile(), saveFile() + '.bak']) {
    try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); if (validSave(o)) return o; } catch { /* missing or corrupt: try the backup */ }
  }
  return null;
}
function writeSave(key, value) {
  if (typeof key !== 'string' || !/^zs:progress:/.test(key) || typeof value !== 'string' || value.length > 1_000_000) return;
  try { JSON.parse(value); } catch { return; }                                  // never mirror a corrupt value over a good one
  const cur = readSave() ?? { schema: 1, keys: {} };
  cur.keys[key] = value; cur.savedAt = new Date().toISOString();
  fs.mkdirSync(saveDir(), { recursive: true });
  const tmp = saveFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cur));
  try { if (fs.existsSync(saveFile())) fs.copyFileSync(saveFile(), saveFile() + '.bak'); } catch {}
  fs.renameSync(tmp, saveFile());
}

// ---- app:// protocol ---------------------------------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };
function serve(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  let file = path.normalize(path.join(GAME_DIR, rel));
  if (!file.startsWith(GAME_DIR + path.sep) && file !== GAME_DIR) return new Response('forbidden', { status: 403 });   // no path traversal
  try { if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(GAME_DIR, 'index.html'); } catch { file = path.join(GAME_DIR, 'index.html'); }
  try {
    const body = fs.readFileSync(file);
    return new Response(body, { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } });
  } catch (e) { log('serve error', file, String(e)); return new Response('not found', { status: 404 }); }
}

// ---- window ------------------------------------------------------------------------------------------------------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } }
function saveState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const b = win.isFullScreen() || win.isMaximized() ? (loadState().bounds ?? win.getNormalBounds()) : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ bounds: b, fullscreen: win.isFullScreen() }));
  } catch {}
}
const onSteamDeck = () => process.env.SteamDeck === '1' || process.env.SteamGamepadUI === '1' || process.env.STEAM_DECK === '1';

let mainWindow = null;
function createWindow() {
  const st = loadState();
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.min(st.bounds?.width ?? 1280, wa.width), h = Math.min(st.bounds?.height ?? 800, wa.height);
  const wantFullscreen = flag('fullscreen') || (!flag('windowed') && (onSteamDeck() || st.fullscreen === true));
  mainWindow = new BrowserWindow({
    width: w, height: h, x: st.bounds?.x, y: st.bounds?.y, minWidth: 640, minHeight: 400,
    title: 'Zombie Squisher', backgroundColor: '#0d0805', show: false, autoHideMenuBar: true, fullscreenable: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false, devTools: flag('devtools') },
  });
  mainWindow.once('ready-to-show', () => { mainWindow.show(); if (wantFullscreen) mainWindow.setFullScreen(true); log('window shown', { fullscreen: wantFullscreen, steamDeck: onSteamDeck() }); });
  mainWindow.loadURL(`${ORIGIN}/index.html`);

  // F11 / Alt+Enter toggle fullscreen. Esc is NOT used for that: the game uses it as pause.
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { e.preventDefault(); mainWindow.setFullScreen(!mainWindow.isFullScreen()); }
  });
  mainWindow.on('close', () => saveState(mainWindow));
  mainWindow.on('leave-full-screen', () => saveState(mainWindow));
  mainWindow.on('enter-full-screen', () => saveState(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // A renderer crash must not strand the player on a black window: reload (progress is saved continuously).
  mainWindow.webContents.on('render-process-gone', (_e, d) => { log('render-process-gone', d); if (mainWindow && d.reason !== 'clean-exit') mainWindow.loadURL(`${ORIGIN}/index.html`); });
  mainWindow.webContents.on('unresponsive', () => log('renderer unresponsive'));
  mainWindow.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log('renderer', level, message.slice(0, 300)); });
}

app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { session.defaultSession.flushStorageData(); } catch {} });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', serve);
  ipcMain.handle('hag:info', () => ({ platform: process.platform, version: app.getVersion(), electron: process.versions.electron, steamDeck: onSteamDeck(), userData: app.getPath('userData') }));
  ipcMain.on('hag:toggle-fullscreen', () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()));
  ipcMain.on('hag:quit', () => app.quit());
  ipcMain.on('hag:save-read', (e) => { e.returnValue = readSave(); });
  ipcMain.on('hag:save-write', (_e, key, value) => { try { writeSave(key, value); } catch (err) { log('save mirror failed', String(err)); } });
  createWindow();
  // Suspend / resume (laptop lid, Steam Deck sleep): tell the page so the game pauses and input state resets.
  powerMonitor.on('suspend', () => { log('suspend'); mainWindow?.webContents.send('hag:suspend'); });
  powerMonitor.on('resume', () => { log('resume'); mainWindow?.webContents.send('hag:resume'); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  log('ready', { version: app.getVersion(), electron: process.versions.electron, platform: process.platform, userData: app.getPath('userData') });
});
