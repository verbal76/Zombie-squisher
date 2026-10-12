'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hagDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('hag:info'),
  toggleFullscreen: () => ipcRenderer.send('hag:toggle-fullscreen'),
  quit: () => ipcRenderer.send('hag:quit'),
  onSuspend: (cb) => ipcRenderer.on('hag:suspend', () => cb()),
  onResume: (cb) => ipcRenderer.on('hag:resume', () => cb()),
});
