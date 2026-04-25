import { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import menuModule from './menu.cjs';
import projectFileModule from './project-files.cjs';

const { createApplicationMenuTemplate, SIGNAL_LOOM_MENU_COMMANDS } = menuModule;
const {
  SIGNAL_LOOM_PROJECT_EXTENSION,
  attachNativeScratchAssetsToProjectDocument,
  buildNativeAssetUrl,
  buildProjectScratchDirectoryCandidates,
  decodeNativeAssetUrl,
  ensureSignalLoomProjectExtension,
  parseProjectDocumentJson,
  resolveScratchAssetNativePath,
} = projectFileModule;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const isDev = Boolean(rendererUrl);
const appName = 'Signal Loom';
let mainWindow = null;
let applicationMenu = null;
let currentProjectPath = undefined;
let currentScratchDirectoryPath = undefined;

app.setName(appName);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'signal-loom-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function getRendererEntryUrl() {
  return rendererUrl ?? pathToFileURL(resolve(__dirname, '../dist/index.html')).toString();
}

function sendRendererCommand(command) {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
  target?.webContents.send('signal-loom:menu-command', command);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: appName,
    backgroundColor: '#08111d',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (applicationMenu) {
    mainWindow.setMenu(applicationMenu);
    mainWindow.setAutoHideMenuBar(false);
    mainWindow.setMenuBarVisibility(true);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(getRendererEntryUrl());

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function installApplicationMenu() {
  const template = createApplicationMenuTemplate({
    appName,
    isMac: process.platform === 'darwin',
    sendCommand: sendRendererCommand,
  });

  applicationMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(applicationMenu);
}

function getProjectDialogFilters() {
  return [
    { name: 'Signal Loom Project', extensions: [SIGNAL_LOOM_PROJECT_EXTENSION.replace(/^\./, '')] },
    { name: 'Legacy Signal Loom Project', extensions: ['signal-loom.json', 'json'] },
    { name: 'All Files', extensions: ['*'] },
  ];
}

async function chooseProjectSavePath(existingPath) {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: 'Save Signal Loom Project',
    defaultPath: existingPath ? ensureSignalLoomProjectExtension(existingPath) : `untitled${SIGNAL_LOOM_PROJECT_EXTENSION}`,
    filters: getProjectDialogFilters(),
  });

  if (result.canceled || !result.filePath) {
    return undefined;
  }

  return ensureSignalLoomProjectExtension(result.filePath);
}

async function writeProjectDocument(filePath, document) {
  await mkdir(dirname(filePath), { recursive: true });
  const prepared = await prepareProjectDocumentForNativeSave(filePath, document);
  await writeFile(filePath, `${JSON.stringify(prepared.document, null, 2)}\n`, 'utf8');
  currentProjectPath = filePath;
  currentScratchDirectoryPath = prepared.scratchDirectoryPath;
  mainWindow?.webContents.send('signal-loom:project-path-changed', currentProjectPath);

  return {
    canceled: false,
    filePath,
    scratchDirectoryPath: currentScratchDirectoryPath,
    document: prepared.document,
  };
}

function inferMediaKind(filePath) {
  const extension = extname(filePath).toLowerCase();

  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'].includes(extension)) {
    return 'image';
  }

  if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'].includes(extension)) {
    return 'video';
  }

  if (['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].includes(extension)) {
    return 'audio';
  }

  return undefined;
}

function inferMimeType(filePath, kind) {
  const extension = extname(filePath).toLowerCase();
  const byExtension = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
  };

  return byExtension[extension] ?? (
    kind === 'image'
      ? 'image/png'
      : kind === 'video'
        ? 'video/mp4'
        : 'audio/mpeg'
  );
}

function sanitizeFileName(value) {
  return value
    .trim()
    .replace(/[/\\?%*:|"<>]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function getDefaultExtensionForNativeItem(item) {
  const mimeType = item.mimeType;

  if (mimeType?.includes('png')) {
    return 'png';
  }

  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) {
    return 'jpg';
  }

  if (mimeType?.includes('webp')) {
    return 'webp';
  }

  if (mimeType?.includes('wav')) {
    return 'wav';
  }

  if (mimeType?.includes('mpeg') || mimeType?.includes('mp3')) {
    return 'mp3';
  }

  if (mimeType?.includes('mp4')) {
    return 'mp4';
  }

  switch (item.kind) {
    case 'image':
      return 'png';
    case 'audio':
      return 'mp3';
    case 'video':
    case 'composition':
      return 'mp4';
    default:
      return 'bin';
  }
}

function ensureFileNameHasExtension(fileName, item) {
  return extname(fileName) ? fileName : `${fileName}.${getDefaultExtensionForNativeItem(item)}`;
}

function buildNativeScratchFileName(item) {
  const idPart = sanitizeFileName(item.id ?? `asset-${Date.now()}`);
  const labelPart = ensureFileNameHasExtension(sanitizeFileName(item.label ?? item.kind ?? 'asset'), item);

  return `${idPart}-${labelPart}`;
}

function getNativeFilePathFromAssetUrl(assetUrl) {
  if (typeof assetUrl !== 'string' || !assetUrl.startsWith('signal-loom-asset://')) {
    return undefined;
  }

  return decodeNativeAssetUrl(assetUrl);
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return undefined;
  }

  const match = /^data:([^;,]+)?((?:;[^,]*)*),(.*)$/s.exec(dataUrl);

  if (!match) {
    return undefined;
  }

  const [, mimeType, metadata, payload] = match;
  const buffer = metadata.includes(';base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return {
    buffer,
    mimeType,
  };
}

async function materializeProjectSourceBinItem(item, scratchDirectoryPath, scratchDirectoryPaths = [scratchDirectoryPath]) {
  if (!item || item.kind === 'text') {
    return item;
  }

  await mkdir(scratchDirectoryPath, { recursive: true });

  const scratchFileName = item.scratchFileName ?? buildNativeScratchFileName(item);
  const targetPath = join(scratchDirectoryPath, scratchFileName);
  const dataUrlAsset = parseDataUrl(item.assetUrl);
  const sourcePath = dataUrlAsset
    ? undefined
    : resolveScratchAssetNativePath(item, scratchDirectoryPaths, existsSync) ?? getNativeFilePathFromAssetUrl(item.assetUrl);

  if (!sourcePath && !dataUrlAsset && !item.scratchFileName) {
    return item;
  }

  try {
    if (sourcePath && resolve(sourcePath) !== resolve(targetPath)) {
      await copyFile(sourcePath, targetPath);
    } else if (dataUrlAsset) {
      await writeFile(targetPath, dataUrlAsset.buffer);
    }
  } catch {
    // Keep the project document saveable even when a referenced source file was moved.
  }

  return {
    ...item,
    mimeType: item.mimeType ?? dataUrlAsset?.mimeType,
    scratchFileName,
    nativeFilePath: targetPath,
    assetUrl: buildNativeAssetUrl(targetPath),
  };
}

async function prepareProjectDocumentForNativeSave(filePath, document) {
  const scratchDirectoryPaths = buildProjectScratchDirectoryCandidates(filePath, document);
  const scratchDirectoryPath = scratchDirectoryPaths[0];
  const sourceItems = Array.isArray(document?.sourceBin?.items) ? document.sourceBin.items : undefined;
  const sourceBin = sourceItems
    ? {
        ...document.sourceBin,
        items: await Promise.all(
          sourceItems.map((item) => materializeProjectSourceBinItem(item, scratchDirectoryPath, scratchDirectoryPaths)),
        ),
      }
    : document?.sourceBin;
  const scratchAssetCount = sourceBin?.items?.filter((item) => item.kind !== 'text' && item.scratchFileName).length ?? 0;

  return {
    scratchDirectoryPath,
    document: {
      ...document,
      savedAt: Date.now(),
      sourceBin,
      fileSystem: {
        ...document?.fileSystem,
        projectDirectoryName: basename(dirname(filePath)),
        scratchDirectoryName: basename(scratchDirectoryPath),
        lastSavedToFolderAt: Date.now(),
        scratchAssetCount,
      },
    },
  };
}

async function prepareProjectDocumentForNativeOpen(filePath, document) {
  const scratchDirectoryPaths = buildProjectScratchDirectoryCandidates(filePath, document);
  const scratchDirectoryPath = scratchDirectoryPaths[0];
  const sourceItems = Array.isArray(document?.sourceBin?.items) ? document.sourceBin.items : undefined;

  if (!sourceItems) {
    return {
      scratchDirectoryPath,
      document: attachNativeScratchAssetsToProjectDocument(document, scratchDirectoryPath),
    };
  }

  return {
    scratchDirectoryPath,
    document: {
      ...document,
      sourceBin: {
        ...document.sourceBin,
        items: await Promise.all(
          sourceItems.map(async (item) => {
            if (!item || item.kind === 'text') {
              return item;
            }

            if (item.scratchFileName || (typeof item.assetUrl === 'string' && item.assetUrl.startsWith('data:'))) {
              return materializeProjectSourceBinItem(item, scratchDirectoryPath, scratchDirectoryPaths);
            }

            if (item.nativeFilePath) {
              const nativeFilePath = resolveScratchAssetNativePath(item, scratchDirectoryPaths, existsSync);

              return {
                ...item,
                nativeFilePath,
                assetUrl: nativeFilePath ? buildNativeAssetUrl(nativeFilePath) : item.assetUrl,
              };
            }

            return item;
          }),
        ),
      },
    },
  };
}

async function materializeNativeImport(filePath, scratchDirectoryPath) {
  const kind = inferMediaKind(filePath);

  if (!kind) {
    return undefined;
  }

  const sourceName = basename(filePath);
  const id = globalThis.crypto?.randomUUID?.() ?? `native-asset-${Date.now()}`;
  let storedPath = filePath;
  let scratchFileName;

  if (scratchDirectoryPath) {
    await mkdir(scratchDirectoryPath, { recursive: true });
    scratchFileName = `${sanitizeFileName(id)}-${sanitizeFileName(sourceName)}`;
    storedPath = join(scratchDirectoryPath, scratchFileName);
    await copyFile(filePath, storedPath);
  }

  return {
    id,
    label: sourceName,
    kind,
    mimeType: inferMimeType(storedPath, kind),
    assetUrl: buildNativeAssetUrl(storedPath),
    nativeFilePath: storedPath,
    scratchFileName,
    createdAt: Date.now(),
  };
}

function installProtocolHandlers() {
  protocol.handle('signal-loom-asset', async (request) => {
    const filePath = decodeNativeAssetUrl(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function installIpcHandlers() {
  ipcMain.handle('signal-loom:get-native-state', () => ({
    currentProjectPath,
    currentScratchDirectoryPath,
    platform: process.platform,
    isDev,
  }));

  ipcMain.handle('signal-loom:clear-project-path', () => {
    currentProjectPath = undefined;
    currentScratchDirectoryPath = undefined;
    mainWindow?.webContents.send('signal-loom:project-path-changed', currentProjectPath);
    return { ok: true };
  });

  ipcMain.handle('signal-loom:project-open', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Open Signal Loom Project',
      properties: ['openFile'],
      filters: getProjectDialogFilters(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const contents = await readFile(filePath, 'utf8');
    const prepared = await prepareProjectDocumentForNativeOpen(filePath, parseProjectDocumentJson(contents));
    currentProjectPath = filePath;
    currentScratchDirectoryPath = prepared.scratchDirectoryPath;
    mainWindow?.webContents.send('signal-loom:project-path-changed', currentProjectPath);

    return {
      canceled: false,
      filePath,
      scratchDirectoryPath: currentScratchDirectoryPath,
      document: prepared.document,
    };
  });

  ipcMain.handle('signal-loom:project-save', async (_event, document) => {
    const filePath = currentProjectPath ?? await chooseProjectSavePath();

    if (!filePath) {
      return { canceled: true };
    }

    return writeProjectDocument(filePath, document);
  });

  ipcMain.handle('signal-loom:project-save-as', async (_event, document) => {
    const filePath = await chooseProjectSavePath(currentProjectPath);

    if (!filePath) {
      return { canceled: true };
    }

    return writeProjectDocument(filePath, document);
  });

  ipcMain.handle('signal-loom:import-media-files', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Import Media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] },
        { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, items: [] };
    }

    const items = await Promise.all(
      result.filePaths.map((filePath) => materializeNativeImport(filePath, options.scratchDirectoryPath)),
    );

    return {
      canceled: false,
      items: items.filter(Boolean),
    };
  });

  ipcMain.handle('signal-loom:choose-scratch-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Choose Signal Loom Scratch Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    currentScratchDirectoryPath = result.filePaths[0];

    return {
      canceled: false,
      directoryPath: currentScratchDirectoryPath,
    };
  });

  ipcMain.handle('signal-loom:show-about', async () => {
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      title: `About ${appName}`,
      message: appName,
      detail: 'Generative AI media flow builder and timeline editor.',
      buttons: ['OK'],
    });
  });

  ipcMain.handle('signal-loom:open-path', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { error: 'No path provided.' };
    }

    const error = await shell.openPath(filePath);
    return error ? { error } : { ok: true };
  });
}

app.whenReady().then(() => {
  installProtocolHandlers();
  installIpcHandlers();
  installApplicationMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export { SIGNAL_LOOM_MENU_COMMANDS };
