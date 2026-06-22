'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Safe, minimal bridge. The renderer can only call these specific things —
// it never gets raw Node or filesystem access.
contextBridge.exposeInMainWorld('pip', {
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  listSources: () => ipcRenderer.invoke('list-sources'),
  listScreens: () => ipcRenderer.invoke('list-screens'),
  drag: (dx, dy) => ipcRenderer.send('drag', { dx, dy }),
  petMenu: () => ipcRenderer.send('pet-menu'),
  quit: () => ipcRenderer.send('quit'),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', cb),
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  claude: (opts) => ipcRenderer.invoke('claude', opts)
});
