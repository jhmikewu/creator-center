const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('creatorCenter', {
  isDesktop: true,
  platform: process.platform,
  info: () => ipcRenderer.invoke('creator-center:info'),
  notify: (payload) => ipcRenderer.invoke('creator-center:notify', payload),
  chooseFile: () => ipcRenderer.invoke('creator-center:choose-file'),
  openExternal: (url) => ipcRenderer.invoke('creator-center:open-external', url),
});
