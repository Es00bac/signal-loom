const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);

  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('signalLoomNative', {
  getNativeState: () => ipcRenderer.invoke('signal-loom:get-native-state'),
  clearProjectPath: () => ipcRenderer.invoke('signal-loom:clear-project-path'),
  openProjectFile: () => ipcRenderer.invoke('signal-loom:project-open'),
  saveProjectFile: (document) => ipcRenderer.invoke('signal-loom:project-save', document),
  saveProjectFileAs: (document) => ipcRenderer.invoke('signal-loom:project-save-as', document),
  importMediaFiles: (options) => ipcRenderer.invoke('signal-loom:import-media-files', options),
  chooseScratchDirectory: () => ipcRenderer.invoke('signal-loom:choose-scratch-directory'),
  showAbout: () => ipcRenderer.invoke('signal-loom:show-about'),
  openPath: (filePath) => ipcRenderer.invoke('signal-loom:open-path', filePath),
  onMenuCommand: (callback) => onChannel('signal-loom:menu-command', callback),
  onProjectPathChanged: (callback) => onChannel('signal-loom:project-path-changed', callback),
});
