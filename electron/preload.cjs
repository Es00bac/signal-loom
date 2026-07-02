const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS',
  process.env.SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS === '1' ? '1' : '0',
);

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
  openImageDocumentFile: () => ipcRenderer.invoke('signal-loom:image-open'),
  saveImageDocumentFileAs: (bytes) => ipcRenderer.invoke('signal-loom:image-save-as', bytes),
  readImageDocumentFile: (path) => ipcRenderer.invoke('signal-loom:image-read-path', path),
  writeImageDocumentFile: (path, bytes) => ipcRenderer.invoke('signal-loom:image-write-path', path, bytes),
  openPaperDocumentFile: () => ipcRenderer.invoke('signal-loom:paper-open'),
  savePaperDocumentFileAs: (bytes) => ipcRenderer.invoke('signal-loom:paper-save-as', bytes),
  importMediaFiles: (options) => ipcRenderer.invoke('signal-loom:import-media-files', options),
  normalizeImportedMediaBatch: (items) => ipcRenderer.invoke('signal-loom:normalize-imported-media-batch', items),
  exportPaperPdf: (request) => ipcRenderer.invoke('signal-loom:paper-export-pdf', request),
  exportPaperImages: (request) => ipcRenderer.invoke('signal-loom:paper-export-images', request),
  captureCurrentWindowPng: () => ipcRenderer.invoke('signal-loom:capture-current-window-png'),
  readClipboardImage: () => ipcRenderer.invoke('signal-loom:read-clipboard-image'),
  downloadRemoteMedia: (url) => ipcRenderer.invoke('signal-loom:download-remote-media', url),
  generateVertexImage: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-image', request),
  generateVertexText: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-text', request),
  generateVertexVideo: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-video', request),
  loginVertex: (request) => ipcRenderer.invoke('signal-loom:vertex-login', request),
  detectVertexAdc: (request) => ipcRenderer.invoke('signal-loom:vertex-detect-adc', request),
  listVertexProjects: (request) => ipcRenderer.invoke('signal-loom:vertex-list-projects', request),
  materializeSourceAsset: (request) => ipcRenderer.invoke('signal-loom:source-asset-materialize', request),
  chooseScratchDirectory: () => ipcRenderer.invoke('signal-loom:choose-scratch-directory'),
  openWorkspaceWindow: (workspace) => ipcRenderer.invoke('signal-loom:open-workspace-window', workspace),
  setActiveWorkspace: (workspace) => ipcRenderer.invoke('signal-loom:set-active-workspace', workspace),
  setKeyboardShortcuts: (shortcuts) => ipcRenderer.invoke('signal-loom:set-keyboard-shortcuts', shortcuts),
  getSourceLibrarySnapshot: () => ipcRenderer.invoke('signal-loom:source-library-get-snapshot'),
  syncSourceLibrarySnapshot: (snapshot) => ipcRenderer.invoke('signal-loom:source-library-sync-snapshot', snapshot),
  applySourceLibraryChange: (change) => ipcRenderer.invoke('signal-loom:source-library-apply-change', change),
  showAbout: () => ipcRenderer.invoke('signal-loom:show-about'),
  openPath: (filePath) => ipcRenderer.invoke('signal-loom:open-path', filePath),
  secretAvailable: () => ipcRenderer.invoke('signal-loom:secret-available'),
  secretEncrypt: (plaintext) => ipcRenderer.invoke('signal-loom:secret-encrypt', plaintext),
  secretDecrypt: (ciphertextBase64) => ipcRenderer.invoke('signal-loom:secret-decrypt', ciphertextBase64),
  onMenuCommand: (callback) => onChannel('signal-loom:menu-command', callback),
  onProjectPathChanged: (callback) => onChannel('signal-loom:project-path-changed', callback),
  onSourceLibraryChanged: (callback) => onChannel('signal-loom:source-library-changed', callback),
});
