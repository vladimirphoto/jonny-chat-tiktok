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
  twConnect: (name) => ipcRenderer.invoke('tw:connect', name),
  twDisconnect: () => ipcRenderer.invoke('tw:disconnect'),
  onTwChat: on('tw:chat'),
  onTwStatus: on('tw:status'),
  widgetUrl: () => ipcRenderer.invoke('widget:url'),
  widgetLink: (mode) => ipcRenderer.invoke('widget:link', mode),
  widgetCheck: () => ipcRenderer.invoke('widget:check'),
  widgetSet: (s) => ipcRenderer.invoke('widget:set', s),
  widgetTest: () => ipcRenderer.invoke('widget:test'),
  widgetClear: () => ipcRenderer.invoke('widget:clear'),
  onChat: on('tt:chat'),
  onGift: on('tt:gift'),
  onFollow: on('tt:follow'),
  onLike: on('tt:like'),
  onViewers: on('tt:viewers'),
  onStatus: on('tt:status'),
  onError: on('tt:error'),
});
