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
  clearProjectPath: (request) => ipcRenderer.invoke('signal-loom:clear-project-path', request),
  openProjectFile: (request) => ipcRenderer.invoke('signal-loom:project-open', request),
  commitProjectSwitch: (request) => ipcRenderer.invoke('signal-loom:project-switch-commit', request),
  cancelProjectSwitch: (request) => ipcRenderer.invoke('signal-loom:project-switch-cancel', request),
  saveProjectFile: (payload) => ipcRenderer.invoke('signal-loom:project-save', payload),
  saveProjectFileAs: (payload) => ipcRenderer.invoke('signal-loom:project-save-as', payload),
  adoptProject: () => ipcRenderer.invoke('signal-loom:project-adopt'),
  confirmProjectAdoption: (claim) => ipcRenderer.invoke('signal-loom:project-confirm-adoption', claim),
  openImageDocumentFile: () => ipcRenderer.invoke('signal-loom:image-open'),
  saveImageDocumentFileAs: (bytes) => ipcRenderer.invoke('signal-loom:image-save-as', bytes),
  readImageDocumentFile: (path) => ipcRenderer.invoke('signal-loom:image-read-path', path),
  writeImageDocumentFile: (path, bytes) => ipcRenderer.invoke('signal-loom:image-write-path', path, bytes),
  localUpscalerStatus: () => ipcRenderer.invoke('signal-loom:local-upscaler-status'),
  localUpscalerInstall: () => ipcRenderer.invoke('signal-loom:local-upscaler-install'),
  localUpscalerStart: () => ipcRenderer.invoke('signal-loom:local-upscaler-start'),
  localUpscalerStop: () => ipcRenderer.invoke('signal-loom:local-upscaler-stop'),
  openPaperDocumentFile: () => ipcRenderer.invoke('signal-loom:paper-open'),
  savePaperDocumentFileAs: (bytes) => ipcRenderer.invoke('signal-loom:paper-save-as', bytes),
  writePaperDocumentFile: (path, bytes) => ipcRenderer.invoke('signal-loom:paper-write-path', path, bytes),
  importMediaFiles: (options) => ipcRenderer.invoke('signal-loom:import-media-files', options),
  normalizeImportedMediaBatch: (items) => ipcRenderer.invoke('signal-loom:normalize-imported-media-batch', items),
  choosePaperPdfExportPath: (request) => ipcRenderer.invoke('signal-loom:paper-choose-pdf-export-path', request),
  exportPaperPdf: (request) => ipcRenderer.invoke('signal-loom:paper-export-pdf', request),
  savePaperPdfBytes: (request) => ipcRenderer.invoke('signal-loom:paper-save-pdf-bytes', request),
  choosePaperImageExportDirectory: (request) => ipcRenderer.invoke('signal-loom:paper-choose-image-export-directory', request),
  exportPaperImages: (request) => ipcRenderer.invoke('signal-loom:paper-export-images', request),
  captureCurrentWindowPng: () => ipcRenderer.invoke('signal-loom:capture-current-window-png'),
  readClipboardImage: () => ipcRenderer.invoke('signal-loom:read-clipboard-image'),
  downloadRemoteMedia: (url, cancellationId) => ipcRenderer.invoke('signal-loom:download-remote-media', url, cancellationId),
  cancelRemoteMediaDownload: (cancellationId) => ipcRenderer.invoke('signal-loom:cancel-remote-media-download', cancellationId),
  generateVertexImage: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-image', request),
  generateVertexText: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-text', request),
  generateVertexVideo: (request) => ipcRenderer.invoke('signal-loom:vertex-generate-video', request),
  cancelVertexGeneration: (cancellationId) => ipcRenderer.invoke('signal-loom:vertex-cancel', cancellationId),
  loginVertex: (request) => ipcRenderer.invoke('signal-loom:vertex-login', request),
  detectVertexAdc: (request) => ipcRenderer.invoke('signal-loom:vertex-detect-adc', request),
  listVertexProjects: (request) => ipcRenderer.invoke('signal-loom:vertex-list-projects', request),
  materializeSourceAsset: (request) => ipcRenderer.invoke('signal-loom:source-asset-materialize', request),
  chooseScratchDirectory: (request) => ipcRenderer.invoke('signal-loom:choose-scratch-directory', request),
  openWorkspaceWindow: (workspace) => ipcRenderer.invoke('signal-loom:open-workspace-window', workspace),
  setActiveWorkspace: (workspace) => ipcRenderer.invoke('signal-loom:set-active-workspace', workspace),
  setKeyboardShortcuts: (shortcuts) => ipcRenderer.invoke('signal-loom:set-keyboard-shortcuts', shortcuts),
  setLocale: (locale) => ipcRenderer.invoke('signal-loom:set-locale', locale),
  getSourceLibrarySnapshot: (request) => ipcRenderer.invoke('signal-loom:source-library-get-snapshot', request),
  syncSourceLibrarySnapshot: (snapshot) => ipcRenderer.invoke('signal-loom:source-library-sync-snapshot', snapshot),
  applySourceLibraryChange: (change) => ipcRenderer.invoke('signal-loom:source-library-apply-change', change),
  showAbout: (options) => ipcRenderer.invoke('signal-loom:show-about', options),
  openPath: (filePath) => ipcRenderer.invoke('signal-loom:open-path', filePath),
  secretAvailable: () => ipcRenderer.invoke('signal-loom:secret-available'),
  secretEncrypt: (plaintext) => ipcRenderer.invoke('signal-loom:secret-encrypt', plaintext),
  secretDecrypt: (ciphertextBase64) => ipcRenderer.invoke('signal-loom:secret-decrypt', ciphertextBase64),
  onMenuCommand: (callback) => onChannel('signal-loom:menu-command', callback),
  onProjectPathChanged: (callback) => onChannel('signal-loom:project-path-changed', callback),
  onProjectAuthorityChanged: (callback) => onChannel('signal-loom:project-authority-changed', callback),
  onSourceLibraryChanged: (callback) => onChannel('signal-loom:source-library-changed', callback),
});
