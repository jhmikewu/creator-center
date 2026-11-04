const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('creatorCenter', {
  isDesktop: true,
  platform: process.platform,
  info: () => ipcRenderer.invoke('creator-center:info'),
  notify: (payload) => ipcRenderer.invoke('creator-center:notify', payload),
  chooseFile: () => ipcRenderer.invoke('creator-center:choose-file'),
  chooseMediaFile: () => ipcRenderer.invoke('creator-center:choose-media-file'),
  connectSession: (payload) => ipcRenderer.invoke('creator-center:connect-session', payload),
  openExternal: (url) => ipcRenderer.invoke('creator-center:open-external', url),
});
