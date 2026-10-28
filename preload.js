const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('echo', {
  connect: (name) => ipcRenderer.invoke('tt:connect', name),
  disconnect: () => ipcRenderer.invoke('tt:disconnect'),
  synth: (opts) => ipcRenderer.invoke('tts:synth', opts),
  voices: () => ipcRenderer.invoke('tts:voices'),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('upd:check'),
  installUpdate: () => ipcRenderer.invoke('upd:install'),
  onUpdateProgress: on('upd:progress'),
  onChat: on('tt:chat'),
  onGift: on('tt:gift'),
  onFollow: on('tt:follow'),
  onLike: on('tt:like'),
  onViewers: on('tt:viewers'),
  onStatus: on('tt:status'),
  onError: on('tt:error'),
});
