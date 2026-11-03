const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('creatorCenter', {
  isDesktop: true,
  info: () => ipcRenderer.invoke('creator-center:info'),
  notify: (payload) => ipcRenderer.invoke('creator-center:notify', payload),
  openExternal: (url) => ipcRenderer.invoke('creator-center:open-external', url),
});
