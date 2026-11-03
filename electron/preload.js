/* 화면(웹 코드)에 PC 프로그램 기능을 안전하게 노출 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  apiGet: (endpoint, params) => ipcRenderer.invoke('api:get', endpoint, params),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  cacheInfo: () => ipcRenderer.invoke('cache:info'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  openDataFolder: () => ipcRenderer.invoke('cache:open'),
});
