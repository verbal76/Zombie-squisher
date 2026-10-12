'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// 1. Restore progress from the mirror when the live copy is missing or corrupt (runs before any game code).
try {
  const saved = ipcRenderer.sendSync('hag:save-read');
  if (saved && saved.keys) {
    for (const [key, value] of Object.entries(saved.keys)) {
      let live = null; try { live = window.localStorage.getItem(key); } catch {}
      let ok = false; try { ok = live !== null && typeof JSON.parse(live) === 'object'; } catch {}
      if (!ok) window.localStorage.setItem(key, value);
    }
  }
} catch { /* storage unavailable: the game starts fresh, as on any new install */ }

contextBridge.exposeInMainWorld('hagDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('hag:info'),
  toggleFullscreen: () => ipcRenderer.send('hag:toggle-fullscreen'),
  quit: () => ipcRenderer.send('hag:quit'),
  saveMirror: (key, value) => ipcRenderer.send('hag:save-write', key, value),
  onSuspend: (cb) => ipcRenderer.on('hag:suspend', () => cb()),
  onResume: (cb) => ipcRenderer.on('hag:resume', () => cb()),
});

// 2. Mirror every progress write (the page's own localStorage calls are observed, never altered).
webFrame.executeJavaScript(`(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    orig.call(this, k, v);
    if (this === window.localStorage && /^zs:progress:/.test(k)) { try { window.hagDesktop.saveMirror(k, String(v)); } catch (e) {} }
  };
})();`);
