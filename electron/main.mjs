import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { unzipSync } from 'fflate';
import menuModule from './menu.cjs';
import paperPdfExportModule from './paper-pdf-export.cjs';
import paperImageExportModule from './paper-image-export.cjs';
import projectFileModule from './project-files.cjs';
import mediaFormatRegistryModule from './media-format-registry.cjs';
import startupProjectModule from './startup-project.cjs';
import vertexAuthModule from './vertex-auth.cjs';
import windowOptionsModule from './window-options.cjs';
import automationPathModule from './automation-paths.cjs';
import linuxWindowingModule from './linux-windowing.cjs';
import globalMenuControllerModule from './globalMenu/globalMenuController.cjs';
import x11WindowIdModule from './globalMenu/x11WindowId.cjs';
import panelMenuServiceModule from './globalMenu/panelMenuService.cjs';

const { createApplicationMenuTemplate, SIGNAL_LOOM_MENU_COMMANDS } = menuModule;
const {
  buildPaperPdfDefaultPath,
  buildPaperPdfPrintOptions,
  buildPaperPdfRenderReadyScript,
  ensurePdfExtension,
  sanitizePdfFileName,
} = paperPdfExportModule;
const {
  buildPaperImageDefaultDirectoryPath,
  ensurePaperImageExportDirectory,
  imageBufferFromDataUrl,
  sanitizePaperImagePathPart,
} = paperImageExportModule;
const {
  CURRENT_PROJECT_SCHEMA_VERSION,
  SIGNAL_LOOM_PROJECT_EXTENSION,
  attachNativeScratchAssetsToProjectDocument,
  buildDataUrlAssetSignatureCandidates,
  buildNativeAssetUrl,
  buildNativeScratchFileName,
  buildProjectOverwriteBackupPath,
  buildProjectScratchDirectoryCandidates,
  collectNativeAssetCapabilitiesFromSourceBin,
  collectSourceBinItems,
  createNativeAssetCapabilityRegistry,
  ensureSignalLoomProjectExtension,
  extractRecoverableMediaSignatureFromSourceKey,
  getProjectSaveDialogDefaultPath,
  isSignalLoomProjectBackupPath,
  mapSourceBinItemsAsync,
  parseNativeAssetUrl,
  parseProjectDocumentJson,
  removeTransientRecoveredScratchAssetsFromSourceBin,
  resolveScratchAssetNativePath,
  sanitizeFileName,
  shouldWriteProjectSaveDirectly,
} = projectFileModule;
const { getElectronDialogFilterGroups } = mediaFormatRegistryModule;
const {
  buildStartupProjectStatePath,
  parseStartupProjectState,
  resolveStartupProjectPath,
  serializeStartupProjectState,
} = startupProjectModule;
const {
  buildVertexAccessTokenCommand,
  buildVertexLoginCommand,
  buildVertexListProjectsCommand,
  parseGcloudProjectsList,
  buildVertexAuthEnvironment,
  parseVertexEnvironmentVariables,
} = vertexAuthModule;
const {
  buildWorkspaceWindowOpenResult,
  focusFloatingPanelChildWindow,
  isSignalLoomFloatingPanelWindow,
} = windowOptionsModule;
const {
  getAutomationImportMediaPaths,
  getAutomationPaperImageDirectory,
  getAutomationPaperPdfPath,
  getAutomationProjectOpenPath,
  getAutomationProjectSavePath,
} = automationPathModule;
const {
  applyElectronMainLinuxWindowingCompatibility,
  applyLinuxGpuCommandLine,
  resolveLinuxGpuPolicy,
} = linuxWindowingModule;
const { createGlobalMenuController } = globalMenuControllerModule;
const { resolveX11WindowId } = x11WindowIdModule;
const { createPanelMenuService } = panelMenuServiceModule;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_RENDERER_URL = pathToFileURL(resolve(__dirname, '../dist/index.html')).toString();
const SIGNAL_LOOM_SPLASH_IMAGE_PATH = resolve(__dirname, 'assets', 'signal-loom-splash.png');
const flowImportWorkerUrl = new URL('./flow-import-worker.mjs', import.meta.url);
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const isDev = Boolean(rendererUrl);
const DEV_RENDERER_READY_RETRY_COUNT = 12;
const DEV_RENDERER_READY_RETRY_DELAY_MS = 250;
const DEV_RENDERER_READY_TIMEOUT_ERROR = 'Renderer URL is unavailable.';
const appName = 'Sloom Studio';
const execFileAsync = promisify(execFile);
let mainWindow = null;
let splashWindow = null;
const workspaceWindows = new Map();
let applicationMenu = null;
let currentProjectPath = undefined;
let currentScratchDirectoryPath = undefined;
let currentAssetCapabilityRootPaths = [];
let startupProject = undefined;
let activeWorkspace = 'flow';
let keyboardShortcuts = {};
// Interface language for menu labels (mirrors the renderer's settingsStore.locale, pushed over IPC).
// The native in-window menu, the KDE global menu, and the panel menu all read this so their labels
// track the app's language setting; defaults to English until the renderer reports its locale.
let appLocale = 'en';
// Lazily-created KDE Plasma global-menu controller (opt-in; null when unsupported/disabled). It
// exports each workspace window's menu over DBus, fully decoupled from the GPU/render process.
let globalMenuController = null;
// Lazily-created native-Wayland KDE panel-menu service (opt-in via SIGNAL_LOOM_ELECTRON_PANEL_MENU=1;
// null when unsupported). Unlike the global-menu controller it needs no X11 window id, so it does NOT
// force XWayland — the app keeps its native-Wayland GPU surface while the menu shows in the panel.
let panelMenuService = null;
let sourceLibraryVersion = 0;
let sourceLibrarySnapshot = createEmptySourceLibrarySnapshot();
const nativeAssetCapabilityRegistry = createNativeAssetCapabilityRegistry();
const nativeAssetCapabilityAssetIds = new Map();
const nativeAssetCapabilityRealPaths = new Map();
let activeRendererEntryUrl = rendererUrl ?? PRODUCTION_RENDERER_URL;

const WORKSPACE_VIEWS = ['flow', 'editor', 'image', 'paper'];
const WORKSPACE_LABELS = {
  flow: 'Flow',
  editor: 'Video',
  image: 'Image',
  paper: 'Paper',
};

const VIEW_COMMAND_WORKSPACES = {
  [SIGNAL_LOOM_MENU_COMMANDS.viewFlow]: 'flow',
  [SIGNAL_LOOM_MENU_COMMANDS.viewEditor]: 'editor',
  [SIGNAL_LOOM_MENU_COMMANDS.viewImage]: 'image',
  [SIGNAL_LOOM_MENU_COMMANDS.viewPaper]: 'paper',
};

applyElectronMainLinuxWindowingCompatibility(app, process.env, process.platform);

app.setName(appName);
const isolatedUserDataDir = process.env.SIGNAL_LOOM_ELECTRON_USER_DATA_DIR?.trim();
if (isolatedUserDataDir) {
  app.setPath('userData', resolve(isolatedUserDataDir));
}

// Linux GPU acceleration policy. Default ON via the stable ANGLE GL/EGL backend so
// the Image workspace's canvas compositing runs on the GPU instead of SwiftShader.
// If the GPU process ever crashes (some AMD/Mesa + ANGLE combos segfault on init),
// we drop a sentinel and relaunch in software mode so the user always gets a working
// window; the sentinel self-expires after a cooldown so a transient hiccup recovers.
const gpuFallbackSentinelPath = join(app.getPath('userData'), 'gpu-fallback.flag');
let gpuFallbackSentinelTimestamp = null;
try {
  if (existsSync(gpuFallbackSentinelPath)) {
    gpuFallbackSentinelTimestamp = statSync(gpuFallbackSentinelPath).mtimeMs;
  }
} catch {
  gpuFallbackSentinelTimestamp = null;
}
const linuxGpuPolicy = resolveLinuxGpuPolicy(
  process.env,
  { sentinelTimestamp: gpuFallbackSentinelTimestamp },
  process.platform,
);
if (linuxGpuPolicy.clearSentinel) {
  try {
    rmSync(gpuFallbackSentinelPath, { force: true });
  } catch {
    /* best effort */
  }
}
applyLinuxGpuCommandLine(app, { disabled: linuxGpuPolicy.disabled }, process.platform);
if (process.platform === 'linux' && !linuxGpuPolicy.disabled) {
  let gpuFallbackTriggered = false;
  app.on('child-process-gone', (_event, details) => {
    if (gpuFallbackTriggered || details?.type !== 'GPU' || details.reason === 'clean-exit') {
      return;
    }
    gpuFallbackTriggered = true;
    // Boundary 1 (GPU process → main process): a GPU crash here relaunches the whole app into
    // software mode, which also tears down any registered global menu. Logged so we can tell a
    // "menu vanished" report apart from a silent GPU-crash relaunch.
    console.log(
      `[gmenu] GPU process gone (reason=${details.reason ?? 'unknown'}) → writing fallback sentinel + relaunching in software`,
    );
    try {
      writeFileSync(gpuFallbackSentinelPath, String(Date.now()));
    } catch {
      /* best effort */
    }
    app.relaunch();
    app.exit(0);
  });
}

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
  return activeRendererEntryUrl;
}

function isWorkspaceView(value) {
  return typeof value === 'string' && WORKSPACE_VIEWS.includes(value);
}

function buildWorkspaceRendererUrl(workspace) {
  const url = new URL(getRendererEntryUrl());
  url.searchParams.set('workspace', workspace);
  return url.toString();
}

function getWorkspaceWindowTitle(workspace) {
  return `${appName} - ${WORKSPACE_LABELS[workspace] ?? 'Workspace'}`;
}

function canFallbackToProductionRenderer() {
  if (!isDev || !hasDevRendererUrl(activeRendererEntryUrl) || !isProductionRendererReady()) {
    return false;
  }

  return activeRendererEntryUrl !== PRODUCTION_RENDERER_URL;
}

function getWorkspaceForWindow(window) {
  for (const [workspace, workspaceWindow] of workspaceWindows.entries()) {
    if (workspaceWindow === window) {
      return workspace;
    }
  }
  return undefined;
}

function sleepMs(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function hasDevRendererUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function isProductionRendererReady() {
  try {
    return existsSync(resolve(__dirname, '../dist/index.html'));
  } catch {
    return false;
  }
}

function buildStartupSplashHtml() {
  // Embed the artwork as a data URI. The splash page itself is a data: URL document, and in
  // the packaged app the PNG lives inside app.asar — a file:// <img> from a data: origin is
  // blocked there (blank 560x560 box), while main-process readFileSync reads through asar.
  let imageUrl;
  try {
    imageUrl = `data:image/png;base64,${readFileSync(SIGNAL_LOOM_SPLASH_IMAGE_PATH).toString('base64')}`;
  } catch {
    imageUrl = pathToFileURL(SIGNAL_LOOM_SPLASH_IMAGE_PATH).href;
  }

  // Bilingual, anime-title-style wordmark baked onto the splash: the Latin "Sloom Studio" over a faint
  // oversized katakana ghost (スルーム・スタジオ) plus a small tracked katakana subtitle, on a scrim so
  // it reads over the artwork. Kept in sync with the in-app BrandWordmark (src/components/Layout).
  const BRAND_NAME = 'Sloom Studio';
  const BRAND_KATAKANA = 'スルーム・スタジオ';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline';" />
    <title>Sloom Studio is starting</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #020712;
      }

      body {
        position: relative;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, 'Noto Sans JP', 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
      }

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        user-select: none;
        -webkit-user-drag: none;
      }

      .brand-scrim {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        justify-content: center;
        padding: 16% 0 8%;
        background: linear-gradient(to top, #020711 8%, rgba(2, 7, 17, 0.82) 42%, transparent);
        pointer-events: none;
      }

      .brand { position: relative; text-align: center; line-height: 1; }
      .brand__logo { position: relative; display: inline-block; padding-top: 0.35em; }
      .brand__ghost {
        position: absolute;
        left: 50%;
        top: -0.18em;
        transform: translateX(-50%);
        font-size: 76px;
        font-weight: 800;
        letter-spacing: 0.18em;
        white-space: nowrap;
        color: rgba(103, 232, 249, 0.10);
      }
      .brand__name {
        position: relative;
        display: block;
        font-size: 40px;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: #eef6ff;
        text-shadow: 0 2px 18px rgba(4, 10, 24, 0.65);
      }
      .brand__sub {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: 10px;
      }
      .brand__rule { height: 1px; width: 30px; }
      .brand__rule--l { background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.55)); }
      .brand__rule--r { background: linear-gradient(90deg, rgba(103, 232, 249, 0.55), transparent); }
      .brand__kana {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.42em;
        padding-left: 0.42em;
        color: rgba(125, 224, 245, 0.92);
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <img src="${imageUrl}" alt="Sloom Studio is starting" />
    <div class="brand-scrim">
      <div class="brand">
        <div class="brand__logo">
          <span class="brand__ghost">${BRAND_KATAKANA}</span>
          <span class="brand__name">${BRAND_NAME}</span>
        </div>
        <div class="brand__sub">
          <span class="brand__rule brand__rule--l"></span>
          <span class="brand__kana">${BRAND_KATAKANA}</span>
          <span class="brand__rule brand__rule--r"></span>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function createStartupSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  if (!existsSync(SIGNAL_LOOM_SPLASH_IMAGE_PATH)) {
    return undefined;
  }

  splashWindow = new BrowserWindow({
    width: 560,
    height: 560,
    minWidth: 560,
    minHeight: 560,
    maxWidth: 560,
    maxHeight: 560,
    useContentSize: true,
    title: 'Sloom Studio is starting',
    backgroundColor: '#020712',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.setMenuBarVisibility(false);
  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  // Serve the splash page from a real temp file: the embedded ~1.8MB data-URI artwork would
  // put a data:text/html loadURL within a hair of Chromium's 2MB URL cap.
  try {
    const splashHtmlPath = join(app.getPath('temp'), 'signal-loom-splash.html');
    writeFileSync(splashHtmlPath, buildStartupSplashHtml());
    void splashWindow.loadFile(splashHtmlPath);
  } catch {
    void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildStartupSplashHtml())}`);
  }

  return splashWindow;
}

function closeStartupSplashWindow() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null;
    return;
  }

  const window = splashWindow;
  splashWindow = null;
  window.destroy();
}

async function canLoadRendererUrl(url) {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url,
      redirect: 'follow',
    });

    let handled = false;
    const finish = (value) => {
      if (handled) return;
      handled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      request.abort();
      finish(false);
    }, 800);

    request.on('response', (response) => {
      clearTimeout(timer);
      response.resume();
      response.on('end', () => {
        finish(response.statusCode === 200);
      });
      response.on('error', () => {
        finish(false);
      });
    });
    request.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });
    request.end();
  });
}

async function resolveRendererEntryUrl() {
  if (!isDev) {
    return;
  }

  const attempts = Array.from({ length: DEV_RENDERER_READY_RETRY_COUNT }, (_, index) => index + 1);

  for (const attempt of attempts) {
    const isReachable = await canLoadRendererUrl(rendererUrl);
    if (isReachable) {
      activeRendererEntryUrl = rendererUrl;
      return;
    }

    if (isProductionRendererReady()) {
      console.warn(
        `Dev renderer is unavailable (attempt ${attempt}/${attempts.length}); falling back to packaged dist renderer for startup.`,
      );
      activeRendererEntryUrl = PRODUCTION_RENDERER_URL;
      return;
    }

    await sleepMs(DEV_RENDERER_READY_RETRY_DELAY_MS);
  }

  throw new Error(`${DEV_RENDERER_READY_TIMEOUT_ERROR} ${rendererUrl} (no local dist fallback available).`);
}

function getIpcWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
}

function broadcastProjectPathChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('signal-loom:project-path-changed', currentProjectPath);
    }
  }
}

function createEmptySourceLibrarySnapshot() {
  return {
    bins: [{
      id: 'default',
      name: 'Source Library',
      collapsed: false,
      createdAt: Date.now(),
      items: [],
    }],
    dismissedSourceKeys: [],
  };
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeSourceLibrarySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return createEmptySourceLibrarySnapshot();
  }

  const inputBins = Array.isArray(snapshot.bins) && snapshot.bins.length > 0
    ? snapshot.bins
    : Array.isArray(snapshot.items)
      ? [{ ...createEmptySourceLibrarySnapshot().bins[0], items: snapshot.items }]
      : [];
  const bins = inputBins.map((bin, index) => {
    const input = bin && typeof bin === 'object' ? bin : {};
    const items = Array.isArray(input.items)
      ? input.items
          .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.kind === 'string')
          .map((item) => ({ ...clonePlain(item), createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now() }))
      : [];

    return {
      id: typeof input.id === 'string' && input.id.trim() ? input.id : (index === 0 ? 'default' : `bin-${index}`),
      name: typeof input.name === 'string' && input.name.trim() ? input.name : (index === 0 ? 'Source Library' : 'Recovered Bin'),
      collapsed: Boolean(input.collapsed),
      createdAt: typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
      items,
    };
  });

  return {
    bins: bins.length > 0 ? bins : createEmptySourceLibrarySnapshot().bins,
    dismissedSourceKeys: Array.isArray(snapshot.dismissedSourceKeys)
      ? snapshot.dismissedSourceKeys.filter((key) => typeof key === 'string')
      : [],
  };
}

function getSourceLibrarySnapshot() {
  return clonePlain(sourceLibrarySnapshot);
}

async function isPathInsideDirectory(filePath, directoryPath) {
  if (typeof filePath !== 'string' || typeof directoryPath !== 'string' || !filePath || !directoryPath) {
    return false;
  }

  const [realFilePath, realDirectoryPath] = await Promise.all([
    realpath(filePath).catch(() => undefined),
    realpath(directoryPath).catch(() => undefined),
  ]);

  if (!realFilePath || !realDirectoryPath) {
    return false;
  }

  const relativePath = relative(realDirectoryPath, realFilePath);
  return relativePath === '' || Boolean(relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function registerNativeAssetCapability(filePath, { allowExternal = false, assetId } = {}) {
  const capabilityRootPaths = currentAssetCapabilityRootPaths.length > 0
    ? currentAssetCapabilityRootPaths
    : [currentScratchDirectoryPath];
  const isInsideCapabilityRoot = (
    await Promise.all(capabilityRootPaths.map((directoryPath) => isPathInsideDirectory(filePath, directoryPath)))
  ).some(Boolean);

  if (!allowExternal && !isInsideCapabilityRoot) {
    return undefined;
  }

  const realFilePath = await realpath(filePath).catch(() => undefined);
  if (!realFilePath) {
    return undefined;
  }

  const registeredPath = nativeAssetCapabilityRegistry.register(filePath);
  if (registeredPath) {
    nativeAssetCapabilityRealPaths.set(registeredPath, realFilePath);
    if (typeof assetId === 'string' && assetId.trim()) {
      nativeAssetCapabilityAssetIds.set(assetId.trim(), registeredPath);
    }
  }

  return registeredPath;
}

async function registerNativeAssetCapabilitiesFromSourceBin(sourceBin, { replace = false } = {}) {
  const previouslyRegisteredPaths = new Set(nativeAssetCapabilityRegistry.list());

  if (replace) {
    nativeAssetCapabilityRegistry.clear();
    nativeAssetCapabilityAssetIds.clear();
    nativeAssetCapabilityRealPaths.clear();
  }

  for (const capability of collectNativeAssetCapabilitiesFromSourceBin(sourceBin)) {
    await registerNativeAssetCapability(capability.filePath, {
      allowExternal: previouslyRegisteredPaths.has(resolve(capability.filePath)),
      assetId: capability.assetId,
    });
  }
}

async function isNativeAssetCapabilityRegistered(filePath) {
  if (!nativeAssetCapabilityRegistry.has(filePath)) {
    return false;
  }

  const registeredPath = resolve(filePath);
  const registeredRealPath = nativeAssetCapabilityRealPaths.get(registeredPath);
  const currentRealPath = await realpath(filePath).catch(() => undefined);
  return Boolean(registeredRealPath && currentRealPath && registeredRealPath === currentRealPath);
}

function broadcastSourceLibraryChanged(change) {
  const event = {
    version: sourceLibraryVersion,
    change: clonePlain(change),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('signal-loom:source-library-changed', event);
    }
  }
}

async function setSourceLibrarySnapshot(snapshot, { broadcast = false } = {}) {
  sourceLibrarySnapshot = normalizeSourceLibrarySnapshot(snapshot);
  await registerNativeAssetCapabilitiesFromSourceBin(sourceLibrarySnapshot, { replace: true });
  sourceLibraryVersion += 1;

  if (broadcast) {
    broadcastSourceLibraryChanged({
      type: 'source-library-snapshot',
      snapshot: getSourceLibrarySnapshot(),
    });
  }

  return sourceLibraryVersion;
}

async function resetSourceLibrarySnapshot({ broadcast = false } = {}) {
  return setSourceLibrarySnapshot(undefined, { broadcast });
}

async function syncSourceLibraryFromDocument(document, options) {
  return setSourceLibrarySnapshot(document?.sourceBin, options);
}

async function applySourceLibraryChange(change) {
  if (!change || typeof change !== 'object' || typeof change.type !== 'string') {
    return { error: 'Invalid Source Library change.' };
  }

  if (change.type === 'source-library-snapshot') {
    return {
      ok: true,
      version: await setSourceLibrarySnapshot(change.snapshot, { broadcast: true }),
    };
  }

  if (change.type === 'source-bin-items-added') {
    const incomingItems = Array.isArray(change.items)
      ? change.items
          .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.kind === 'string')
          .map((item) => clonePlain(item))
      : [];

    if (incomingItems.length === 0) {
      return { ok: true, version: sourceLibraryVersion };
    }

    const normalizedSnapshot = normalizeSourceLibrarySnapshot(sourceLibrarySnapshot);
    const requestedTargetBinId = typeof change.targetBinId === 'string' && change.targetBinId.trim()
      ? change.targetBinId
      : normalizedSnapshot.bins[0]?.id ?? 'default';
    const targetBinExists = normalizedSnapshot.bins.some((bin) => bin.id === requestedTargetBinId);
    const targetBinId = targetBinExists ? requestedTargetBinId : normalizedSnapshot.bins[0]?.id ?? 'default';
    const incomingIds = new Set(incomingItems.map((item) => item.id));
    const nextBins = normalizedSnapshot.bins.map((bin, index) => {
      const withoutIncoming = bin.items.filter((item) => !incomingIds.has(item.id));
      if (bin.id === targetBinId || index === 0 && !normalizedSnapshot.bins.some((candidate) => candidate.id === targetBinId)) {
        return { ...bin, collapsed: false, items: [...incomingItems, ...withoutIncoming] };
      }

      return { ...bin, items: withoutIncoming };
    });

    if (!normalizedSnapshot.bins.some((candidate) => candidate.id === targetBinId) && nextBins.length === 0) {
      nextBins.push({
        id: targetBinId,
        name: 'Source Library',
        collapsed: false,
        createdAt: Date.now(),
        items: incomingItems,
      });
    }

    sourceLibrarySnapshot = {
      ...normalizedSnapshot,
      bins: nextBins,
    };
    await registerNativeAssetCapabilitiesFromSourceBin(sourceLibrarySnapshot, { replace: true });
    sourceLibraryVersion += 1;
    broadcastSourceLibraryChanged({
      type: 'source-bin-items-added',
      items: incomingItems,
      ...(targetBinId ? { targetBinId } : {}),
    });
    return { ok: true, version: sourceLibraryVersion };
  }

  if (change.type === 'source-bin-item-renamed') {
    const itemId = typeof change.itemId === 'string' ? change.itemId.trim() : '';
    const label = typeof change.label === 'string' ? change.label.trim() : '';

    if (!itemId || !label) {
      return { ok: true, version: sourceLibraryVersion };
    }

    let didRename = false;
    const normalizedSnapshot = normalizeSourceLibrarySnapshot(sourceLibrarySnapshot);
    sourceLibrarySnapshot = {
      ...normalizedSnapshot,
      bins: normalizedSnapshot.bins.map((bin) => ({
        ...bin,
        items: bin.items.map((item) => {
          if (item.id !== itemId || item.label === label) {
            return item;
          }

          didRename = true;
          return { ...item, label };
        }),
      })),
    };

    if (!didRename) {
      return { ok: true, version: sourceLibraryVersion };
    }

    await registerNativeAssetCapabilitiesFromSourceBin(sourceLibrarySnapshot, { replace: true });
    sourceLibraryVersion += 1;
    broadcastSourceLibraryChanged({ type: 'source-bin-item-renamed', itemId, label });
    return { ok: true, version: sourceLibraryVersion };
  }

  if (change.type === 'source-bin-item-removed') {
    const itemId = typeof change.itemId === 'string' ? change.itemId.trim() : '';
    if (!itemId) {
      return { ok: true, version: sourceLibraryVersion };
    }

    const normalizedSnapshot = normalizeSourceLibrarySnapshot(sourceLibrarySnapshot);
    let removedSourceKey = typeof change.sourceKey === 'string' ? change.sourceKey : undefined;
    let didRemove = false;
    sourceLibrarySnapshot = {
      ...normalizedSnapshot,
      bins: normalizedSnapshot.bins.map((bin) => {
        const nextItems = bin.items.filter((item) => {
          if (item.id !== itemId) {
            return true;
          }

          didRemove = true;
          removedSourceKey ??= typeof item.sourceKey === 'string' ? item.sourceKey : undefined;
          return false;
        });
        return nextItems.length === bin.items.length ? bin : { ...bin, items: nextItems };
      }),
      dismissedSourceKeys: removedSourceKey && !normalizedSnapshot.dismissedSourceKeys.includes(removedSourceKey)
        ? [...normalizedSnapshot.dismissedSourceKeys, removedSourceKey]
        : normalizedSnapshot.dismissedSourceKeys,
    };

    if (!didRemove) {
      return { ok: true, version: sourceLibraryVersion };
    }

    await registerNativeAssetCapabilitiesFromSourceBin(sourceLibrarySnapshot, { replace: true });
    sourceLibraryVersion += 1;
    broadcastSourceLibraryChanged({
      type: 'source-bin-item-removed',
      itemId,
      ...(removedSourceKey ? { sourceKey: removedSourceKey } : {}),
    });
    return { ok: true, version: sourceLibraryVersion };
  }

  return { error: 'Unsupported Source Library change.' };
}

function getStartupProjectStatePath() {
  return buildStartupProjectStatePath(app.getPath('userData'));
}

async function rememberProjectPath(filePath) {
  if (isSignalLoomProjectBackupPath(filePath)) {
    await forgetRememberedProjectPath();
    return;
  }

  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(getStartupProjectStatePath(), serializeStartupProjectState(filePath), 'utf8');
}

async function forgetRememberedProjectPath() {
  await rm(getStartupProjectStatePath(), { force: true });
}

async function readRememberedProjectPath() {
  try {
    const contents = await readFile(getStartupProjectStatePath(), 'utf8');
    const rememberedPath = parseStartupProjectState(contents);
    const resolvedPath = resolveStartupProjectPath(rememberedPath, existsSync);
    if (rememberedPath && !resolvedPath) {
      await forgetRememberedProjectPath();
    }
    return resolvedPath;
  } catch {
    return undefined;
  }
}

function setCurrentProjectAssetRoots(filePath, document, scratchDirectoryPath) {
  currentProjectPath = filePath;
  currentScratchDirectoryPath = scratchDirectoryPath;
  currentAssetCapabilityRootPaths = [
    ...(typeof filePath === 'string' ? buildProjectScratchDirectoryCandidates(filePath, document) : []),
    scratchDirectoryPath,
  ].filter((directoryPath) => typeof directoryPath === 'string' && directoryPath.length > 0);
  currentAssetCapabilityRootPaths = [...new Set(currentAssetCapabilityRootPaths)];
}

async function loadRememberedStartupProject() {
  const filePath = await readRememberedProjectPath();
  if (!filePath) {
    setCurrentProjectAssetRoots(undefined, undefined, undefined);
    startupProject = undefined;
    await resetSourceLibrarySnapshot();
    return;
  }

  try {
    const contents = await readFile(filePath, 'utf8');
    const prepared = await prepareProjectDocumentForNativeOpen(filePath, parseProjectDocumentJson(contents));
    setCurrentProjectAssetRoots(filePath, prepared.document, prepared.scratchDirectoryPath);
    startupProject = {
      canceled: false,
      filePath,
      scratchDirectoryPath: currentScratchDirectoryPath,
      document: prepared.document,
    };
    await syncSourceLibraryFromDocument(prepared.document);
  } catch {
    setCurrentProjectAssetRoots(undefined, undefined, undefined);
    startupProject = undefined;
    await resetSourceLibrarySnapshot();
    await forgetRememberedProjectPath();
  }
}

function sendRendererCommand(command) {
  const workspace = VIEW_COMMAND_WORKSPACES[command];
  if (workspace) {
    createWorkspaceWindow(workspace);
    return;
  }

  const target = BrowserWindow.getFocusedWindow() ?? workspaceWindows.get(activeWorkspace) ?? mainWindow;
  target?.webContents.send('signal-loom:menu-command', command);
}

function createWorkspaceWindow(workspace = 'flow') {
  if (!isWorkspaceView(workspace)) {
    return undefined;
  }

  const existing = workspaceWindows.get(workspace);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.show();
    existing.focus();
    return existing;
  }

  const workspaceWindow = new BrowserWindow({
    width: workspace === 'flow' ? 1440 : 1320,
    height: workspace === 'flow' ? 960 : 860,
    minWidth: workspace === 'flow' ? 1024 : 900,
    minHeight: workspace === 'flow' ? 720 : 640,
    title: getWorkspaceWindowTitle(workspace),
    backgroundColor: '#08111d',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep painting even when Chromium thinks the window is occluded/backgrounded. On Linux
      // (Wayland + multi-monitor especially) that occlusion check misfires, so the compositor stops
      // presenting new frames while the window is actually visible and focused: the DOM/canvas
      // updates (a panel scrolls, the canvas zooms) but the screen doesn't repaint until an input
      // event — moving the pointer out of the window and back — wakes it. Disabling throttling keeps
      // frames presenting on their own.
      backgroundThrottling: false,
    },
  });

  workspaceWindow.webContents.setWindowOpenHandler((details) =>
    buildWorkspaceWindowOpenResult(details, workspaceWindow),
  );

  workspaceWindow.webContents.on('did-create-window', (childWindow, details) => {
    if (!isSignalLoomFloatingPanelWindow(details)) {
      return;
    }

    const focusFloatingPanel = () => focusFloatingPanelChildWindow(workspaceWindow, childWindow, details);
    focusFloatingPanel();
    childWindow.once('ready-to-show', focusFloatingPanel);
  });

  workspaceWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || !canFallbackToProductionRenderer()) {
      return;
    }

    console.warn(`Renderer load failed for "${validatedURL}". Falling back to packaged dist renderer.`);
    activeRendererEntryUrl = PRODUCTION_RENDERER_URL;
    void workspaceWindow.loadURL(buildWorkspaceRendererUrl(workspace));
  });

  workspaceWindow.setMenu(menuForWorkspace(workspace));
  workspaceWindow.setAutoHideMenuBar(false);
  workspaceWindow.setMenuBarVisibility(true);

  workspaceWindows.set(workspace, workspaceWindow);
  if (workspace === 'flow') {
    mainWindow = workspaceWindow;
  }

  workspaceWindow.once('ready-to-show', () => {
    if (workspace === 'flow') {
      workspaceWindow.maximize();
    }
    workspaceWindow.show();
    if (workspace === 'flow') {
      closeStartupSplashWindow();
    }
    // Export this window's menu to the KDE Plasma global-menu applet (opt-in; no-op otherwise).
    void registerWorkspaceWindowGlobalMenu(workspaceWindow, workspace);
  });

  workspaceWindow.on('focus', () => {
    activeWorkspace = workspace;
    // The focused workspace's menu drives the macOS bar + KDE global menu.
    applicationMenu = menuForWorkspace(workspace);
    Menu.setApplicationMenu(applicationMenu);
    // Show this workspace's menu in the native-Wayland panel applet (no-op when the flag is off).
    panelMenuService?.setActive(true);
    panelMenuService?.setActiveWorkspace(workspace);
  });

  workspaceWindow.on('blur', () => {
    // Hide the panel menu when focus leaves Sloom Studio (debounced in the service so opening the
    // applet's own popup — which briefly steals focus — doesn't make the menu flicker away).
    panelMenuService?.setActive(false);
  });

  workspaceWindow.on('closed', () => {
    workspaceWindows.delete(workspace);
    if (workspace === 'flow') {
      mainWindow = null;
    }
  });

  void workspaceWindow.loadURL(buildWorkspaceRendererUrl(workspace));

  if (isDev && workspace === 'flow') {
    workspaceWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return workspaceWindow;
}

/** Build a fresh native menu showing only the given workspace's bar. */
function menuForWorkspace(workspace) {
  return Menu.buildFromTemplate(createApplicationMenuTemplate({
    appName,
    isMac: process.platform === 'darwin',
    activeWorkspace: workspace,
    keyboardShortcuts,
    locale: appLocale,
    sendCommand: sendRendererCommand,
  }));
}

// Each window shows its own workspace's menu bar; the focused window's menu is
// also set as the application menu so the macOS bar and the KDE Plasma global
// menu follow the focused workspace.
function installApplicationMenu() {
  for (const [workspace, window] of workspaceWindows.entries()) {
    if (!window.isDestroyed()) {
      window.setMenu(menuForWorkspace(workspace));
      window.setAutoHideMenuBar(false);
      window.setMenuBarVisibility(true);
    }
  }
  const focused = BrowserWindow.getFocusedWindow();
  const focusedWorkspace = (focused && getWorkspaceForWindow(focused)) || activeWorkspace;
  applicationMenu = menuForWorkspace(focusedWorkspace);
  Menu.setApplicationMenu(applicationMenu);
}

// ── KDE Plasma global menu (opt-in, GPU-decoupled) ───────────────────────────────────────────────
// The controller exports each workspace window's menu over the session DBus to KDE's AppMenu
// registrar. KDE shows the focused window's registered menu in the panel automatically — no focus
// juggling. Everything here is best-effort desktop chrome: failures degrade to the in-window menu bar.

/** The DBusMenu has no Electron "roles", so role items carry synthetic `role:*` commands we perform
 *  here natively (the in-window menu gets these for free from Electron's role mechanism). */
function performGlobalMenuRole(command) {
  const focused = BrowserWindow.getFocusedWindow() ?? mainWindow;
  switch (command) {
    case 'role:quit':
      app.quit();
      return;
    case 'role:reload':
      focused?.webContents?.reload();
      return;
    case 'role:togglefullscreen':
      if (focused) focused.setFullScreen(!focused.isFullScreen());
      return;
    default:
      // Unknown role — route it through the normal command bus rather than dropping it.
      sendRendererCommand(command);
  }
}

function getGlobalMenuController() {
  if (globalMenuController) return globalMenuController;
  globalMenuController = createGlobalMenuController({
    onCommand: (command) => {
      if (typeof command === 'string' && command.startsWith('role:')) {
        performGlobalMenuRole(command);
        return;
      }
      sendRendererCommand(command);
    },
    getKeyboardShortcuts: () => keyboardShortcuts,
    getLocale: () => appLocale,
    isMac: process.platform === 'darwin',
    // The controller only runs when the global menu is explicitly opted in, so always surface its
    // lifecycle (bus connect, registrar round-trip, Plasma adoption) — not just in dev builds.
    logger: (...args) => console.log('[gmenu]', ...args),
  });
  return globalMenuController;
}

// ── KDE panel menu, native-Wayland variant (opt-in, no XWayland) ─────────────────────────────────
// Same menu content and command routing as the global-menu controller, but published over our own
// `org.signalloom.PanelMenu` D-Bus service for the Sloom Studio Plasma applet to render. No X11 window
// id is involved, so this never forces XWayland: the app keeps hardware acceleration on native Wayland.
function getPanelMenuService() {
  if (panelMenuService) return panelMenuService;
  panelMenuService = createPanelMenuService({
    onCommand: (command) => {
      if (typeof command === 'string' && command.startsWith('role:')) {
        performGlobalMenuRole(command);
        return;
      }
      sendRendererCommand(command);
    },
    getActiveWorkspace: () => activeWorkspace,
    getKeyboardShortcuts: () => keyboardShortcuts,
    getLocale: () => appLocale,
    isMac: process.platform === 'darwin',
    // Best-effort identity hints for the applet (StartupWMClass varies between our two .desktop files).
    appIdHints: ['signal-loom', 'Sloom Studio', 'signalloom', 'studio.sloom.signalloom'],
    logger: (...args) => console.log('[panelmenu]', ...args),
  });
  return panelMenuService;
}

/** Best-effort: get the toplevel's real X11 id. getNativeWindowHandle is the real XID on a normal
 *  X11/XWayland desktop; when it comes back as the 0x1 placeholder we correlate via pid + window
 *  title (the resolver never returns a window that isn't confidently ours). */
function resolveWorkspaceWindowXid(workspaceWindow, workspace) {
  // Boundary 3 (main process → XWayland window): log which path produced the XID and its value, so
  // we can see whether the native handle works on the user's real session or we fall to correlation.
  try {
    const handle = workspaceWindow.getNativeWindowHandle?.();
    if (handle && handle.length >= 4) {
      const handleXid = handle.readUInt32LE(0);
      console.log(`[gmenu] ${workspace}: getNativeWindowHandle → 0x${handleXid.toString(16)}`);
      if (handleXid > 1) return handleXid;
    } else {
      console.log(`[gmenu] ${workspace}: getNativeWindowHandle returned no usable handle`);
    }
  } catch (err) {
    console.log(`[gmenu] ${workspace}: getNativeWindowHandle threw (${String(err)}) → X11 correlation`);
  }
  const title = getWorkspaceWindowTitle(workspace);
  const correlated = resolveX11WindowId({ pid: process.pid, titleIncludes: title });
  console.log(
    `[gmenu] ${workspace}: X11 correlation (title="${title}") → ${correlated ? `0x${correlated.toString(16)}` : 'null'}`,
  );
  return correlated;
}

/** Register a workspace window with the KDE global menu (no-op unless opted in + supported). */
async function registerWorkspaceWindowGlobalMenu(workspaceWindow, workspace) {
  const controller = getGlobalMenuController();
  if (!controller.isSupported()) return;
  try {
    // Boundary 2 (main process → session DBus): did the bus connect + registrar proxy come up?
    const started = await controller.start();
    if (!started) {
      console.log(`[gmenu] ${workspace}: controller.start() returned false (bus/registrar unavailable)`);
      return;
    }
    const xid = resolveWorkspaceWindowXid(workspaceWindow, workspace);
    if (!xid) {
      // No confident XID → leave the in-window menu as the working fallback.
      console.log(`[gmenu] ${workspace}: no confident XID → skipping registration (in-window menu only)`);
      return;
    }
    // Boundary 4 (main process → AppMenu registrar): did KDE accept our window+menu registration?
    const registered = await controller.registerWindow(workspace, xid);
    console.log(`[gmenu] ${workspace}: registerWindow(0x${xid.toString(16)}) → ${registered}`);
    if (registered) {
      workspaceWindow.once('closed', () => {
        console.log(`[gmenu] ${workspace}: window closed → unregister 0x${xid.toString(16)}`);
        void controller.unregisterWindow(xid);
      });
    }
  } catch (err) {
    // The global menu is optional chrome — never let it break window startup — but DO say why.
    console.log(`[gmenu] ${workspace}: registration error — ${String(err && err.stack ? err.stack : err)}`);
  }
}

function getInstalledApplicationMenuLabels() {
  const menu = Menu.getApplicationMenu();
  return menu?.items.map((item) => item.label).filter(Boolean) ?? [];
}

function sanitizeKeyboardShortcutsForMenu(shortcuts) {
  if (!shortcuts || typeof shortcuts !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(shortcuts)
      .filter(([command, shortcut]) => typeof command === 'string' && typeof shortcut === 'string' && shortcut.trim())
      .map(([command, shortcut]) => [command, shortcut.trim()]),
  );
}

function getProjectDialogFilters() {
  return [
    { name: 'Sloom Studio Project', extensions: [SIGNAL_LOOM_PROJECT_EXTENSION.replace(/^\./, '')] },
    { name: 'All Files', extensions: ['*'] },
  ];
}

async function chooseProjectSavePath(existingPath, parentWindow) {
  const automationPath = getAutomationProjectSavePath(process.env);
  if (automationPath) {
    return ensureSignalLoomProjectExtension(automationPath);
  }

  const defaultPath = getProjectSaveDialogDefaultPath(existingPath);

  const result = await dialog.showSaveDialog(parentWindow ?? mainWindow ?? undefined, {
    title: isSignalLoomProjectBackupPath(existingPath)
      ? 'Save Restored Sloom Studio Project'
      : 'Save Sloom Studio Project',
    defaultPath,
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
  await backupExistingProjectBeforeOverwrite(filePath);
  await writeFile(filePath, `${JSON.stringify(prepared.document, null, 2)}\n`, 'utf8');
  setCurrentProjectAssetRoots(filePath, prepared.document, prepared.scratchDirectoryPath);
  startupProject = {
    canceled: false,
    filePath,
    scratchDirectoryPath: currentScratchDirectoryPath,
    document: prepared.document,
  };
  await syncSourceLibraryFromDocument(prepared.document, { broadcast: true });
  await rememberProjectPath(filePath);
  broadcastProjectPathChanged();

  return {
    canceled: false,
    filePath,
    scratchDirectoryPath: currentScratchDirectoryPath,
    document: prepared.document,
  };
}

async function backupExistingProjectBeforeOverwrite(filePath) {
  if (!shouldWriteProjectSaveDirectly(filePath)) return;

  try {
    const existing = await stat(filePath);
    if (!existing.isFile() || existing.size <= 0) return;
  } catch {
    return;
  }

  const baseBackupPath = buildProjectOverwriteBackupPath(filePath);
  let backupPath = baseBackupPath;
  for (let attempt = 2; existsSync(backupPath); attempt += 1) {
    backupPath = `${baseBackupPath}-${attempt}`;
  }
  await copyFile(filePath, backupPath);
}

async function openProjectDocumentFromPath(filePath) {
  const contents = await readFile(filePath, 'utf8');
  const prepared = await prepareProjectDocumentForNativeOpen(filePath, parseProjectDocumentJson(contents));
  setCurrentProjectAssetRoots(filePath, prepared.document, prepared.scratchDirectoryPath);
  startupProject = {
    canceled: false,
    filePath,
    scratchDirectoryPath: currentScratchDirectoryPath,
    document: prepared.document,
  };
  await syncSourceLibraryFromDocument(prepared.document, { broadcast: true });
  await rememberProjectPath(filePath);
  broadcastProjectPathChanged();

  return {
    canceled: false,
    filePath,
    scratchDirectoryPath: currentScratchDirectoryPath,
    document: prepared.document,
  };
}

async function getNativeFilePathFromAssetUrl(assetUrl) {
  if (typeof assetUrl !== 'string' || !assetUrl.startsWith('signal-loom-asset://')) {
    return undefined;
  }

  let parsedAsset;
  try {
    parsedAsset = parseNativeAssetUrl(assetUrl);
  } catch {
    return undefined;
  }

  const filePath = parsedAsset.type === 'asset'
    ? nativeAssetCapabilityAssetIds.get(parsedAsset.assetId)
    : parsedAsset.filePath;

  if (!filePath) {
    return undefined;
  }

  return await isNativeAssetCapabilityRegistered(filePath) ? filePath : undefined;
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

async function hasUsableNativeAsset(filePath) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile() && fileStats.size > 0;
  } catch {
    return false;
  }
}

function hasUsableNativeAssetSync(filePath) {
  try {
    const fileStats = statSync(filePath);
    return fileStats.isFile() && fileStats.size > 0;
  } catch {
    return false;
  }
}

async function readdirScratchDirectory(scratchDirectoryPath) {
  try {
    return await readdir(scratchDirectoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function buildScratchAssetSignatureRecoveryIndex(sourceBin, scratchDirectoryPath) {
  const wantedSignatures = new Set(
    collectSourceBinItems(sourceBin)
      .map((item) => extractRecoverableMediaSignatureFromSourceKey(item?.sourceKey))
      .filter(Boolean),
  );

  if (wantedSignatures.size === 0) {
    return new Map();
  }

  const entries = (await readdirScratchDirectory(scratchDirectoryPath))
    .filter((entry) => entry.isFile())
    .sort((left, right) => left.name.localeCompare(right.name));
  const recoveryIndex = new Map();

  for (const entry of entries) {
    if (recoveryIndex.size >= wantedSignatures.size) {
      break;
    }

    const nativeFilePath = join(scratchDirectoryPath, entry.name);
    const fileStats = await stat(nativeFilePath).catch(() => undefined);

    if (!fileStats?.isFile() || fileStats.size <= 0) {
      continue;
    }

    const buffer = await readFile(nativeFilePath).catch(() => undefined);

    if (!buffer?.byteLength) {
      continue;
    }

    for (const signature of buildDataUrlAssetSignatureCandidates(buffer, entry.name)) {
      if (wantedSignatures.has(signature) && !recoveryIndex.has(signature)) {
        recoveryIndex.set(signature, nativeFilePath);
      }
    }
  }

  return recoveryIndex;
}

async function attachRecoveredScratchAssetsToSourceBin(sourceBin) {
  if (!sourceBin) {
    return sourceBin;
  }

  // Orphan scratch files are recovery evidence, not authoritative source-library entries.
  return removeTransientRecoveredScratchAssetsFromSourceBin(sourceBin);
}

function removeBrokenNativeAssetReference(item, nativeFilePath) {
  if (typeof item?.assetUrl !== 'string' || !item.assetUrl.startsWith('signal-loom-asset://')) {
    return item;
  }

  return {
    ...item,
    nativeFilePath,
    assetUrl: undefined,
  };
}

async function materializeProjectSourceBinItem(
  item,
  scratchDirectoryPath,
  scratchDirectoryPaths = [scratchDirectoryPath],
  sourceKeyAssetRecoveryIndex = new Map(),
) {
  if (!item || item.kind === 'text') {
    return item;
  }

  await mkdir(scratchDirectoryPath, { recursive: true });

  const scratchFileName = item.scratchFileName ?? buildNativeScratchFileName(item);
  const targetPath = join(scratchDirectoryPath, scratchFileName);
  const dataUrlAsset = parseDataUrl(item.assetUrl);
  const registeredAssetPath = dataUrlAsset ? undefined : await getNativeFilePathFromAssetUrl(item.assetUrl);
  const sourcePath = dataUrlAsset
    ? undefined
    : resolveScratchAssetNativePath(item, scratchDirectoryPaths, existsSync) ?? registeredAssetPath;

  if (!sourcePath && !dataUrlAsset && !item.scratchFileName) {
    return item;
  }

  try {
    const sourceKeySignature = extractRecoverableMediaSignatureFromSourceKey(item.sourceKey);
    const recoveredSourcePath = sourceKeySignature
      ? sourceKeyAssetRecoveryIndex.get(sourceKeySignature)
      : undefined;
    let materializationSourcePath = sourcePath;

    if (materializationSourcePath && !(await hasUsableNativeAsset(materializationSourcePath))) {
      materializationSourcePath = recoveredSourcePath;
    } else if (!materializationSourcePath && recoveredSourcePath) {
      materializationSourcePath = recoveredSourcePath;
    }

    if (materializationSourcePath && !(await hasUsableNativeAsset(materializationSourcePath))) {
      throw new Error('Referenced source asset is missing or empty.');
    }

    if (dataUrlAsset && dataUrlAsset.buffer.byteLength === 0) {
      throw new Error('Source asset payload is empty.');
    }

    if (materializationSourcePath && resolve(materializationSourcePath) !== resolve(targetPath)) {
      await copyFile(materializationSourcePath, targetPath);
    } else if (dataUrlAsset) {
      await writeFile(targetPath, dataUrlAsset.buffer);
    }

    if (!(await hasUsableNativeAsset(targetPath))) {
      throw new Error('Materialized scratch asset is missing or empty.');
    }
  } catch {
    // Keep the project document saveable even when a referenced source file was moved.
    return removeBrokenNativeAssetReference(item, targetPath);
  }

  await registerNativeAssetCapability(targetPath, { assetId: item.id });

  return {
    ...item,
    mimeType: item.mimeType ?? dataUrlAsset?.mimeType,
    scratchFileName,
    nativeFilePath: targetPath,
    assetUrl: buildNativeAssetUrl(targetPath, item.id),
  };
}

async function prepareProjectDocumentForNativeSave(filePath, document) {
  const scratchDirectoryPaths = buildProjectScratchDirectoryCandidates(filePath, document);
  const scratchDirectoryPath = scratchDirectoryPaths[0];
  const sourceKeyAssetRecoveryIndex = document?.sourceBin
    ? await buildScratchAssetSignatureRecoveryIndex(document.sourceBin, scratchDirectoryPath)
    : new Map();
  const sourceBin = document?.sourceBin
    ? await mapSourceBinItemsAsync(
        document.sourceBin,
        (item) => materializeProjectSourceBinItem(
          item,
          scratchDirectoryPath,
          scratchDirectoryPaths,
          sourceKeyAssetRecoveryIndex,
        ),
      )
    : document?.sourceBin;
  const scratchAssetCount = collectSourceBinItems(sourceBin)
    .filter((item) => item.kind !== 'text' && item.scratchFileName)
    .length;

  return {
    scratchDirectoryPath,
    document: {
      ...document,
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
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
  const sourceKeyAssetRecoveryIndex = document?.sourceBin
    ? await buildScratchAssetSignatureRecoveryIndex(document.sourceBin, scratchDirectoryPath)
    : new Map();

  if (!document?.sourceBin) {
    const openedDocument = attachNativeScratchAssetsToProjectDocument(
      document,
      scratchDirectoryPath,
      hasUsableNativeAssetSync,
    );

    return {
      scratchDirectoryPath,
      document: {
        ...openedDocument,
        sourceBin: await attachRecoveredScratchAssetsToSourceBin(openedDocument?.sourceBin, scratchDirectoryPath),
      },
    };
  }

  const sourceBin = await mapSourceBinItemsAsync(document.sourceBin, async (item) => {
    if (!item || item.kind === 'text') {
      return item;
    }

    if (item.scratchFileName || (typeof item.assetUrl === 'string' && item.assetUrl.startsWith('data:'))) {
      return materializeProjectSourceBinItem(
        item,
        scratchDirectoryPath,
        scratchDirectoryPaths,
        sourceKeyAssetRecoveryIndex,
      );
    }

    if (item.nativeFilePath) {
      const nativeFilePath = resolveScratchAssetNativePath(item, scratchDirectoryPaths, existsSync);
      const fallbackAssetUrl = typeof item.assetUrl === 'string' && item.assetUrl.startsWith('signal-loom-asset://')
        ? undefined
        : item.assetUrl;

      return {
        ...item,
        nativeFilePath,
        assetUrl: nativeFilePath && hasUsableNativeAssetSync(nativeFilePath)
          ? buildNativeAssetUrl(nativeFilePath, item.id)
          : fallbackAssetUrl,
      };
    }

    return item;
  });

  const openedDocument = attachNativeScratchAssetsToProjectDocument(
    {
      ...document,
      sourceBin: await attachRecoveredScratchAssetsToSourceBin(sourceBin, scratchDirectoryPath),
    },
    scratchDirectoryPath,
    hasUsableNativeAssetSync,
  );

  return {
    scratchDirectoryPath,
    document: openedDocument,
  };
}

async function materializeNativeImport(item, scratchDirectoryPath) {
  if (!isPlainObject(item) || typeof item.filePath !== 'string' || typeof item.kind !== 'string') {
    return undefined;
  }

  const filePath = item.filePath;
  const sourceName = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : basename(filePath);
  const id = globalThis.crypto?.randomUUID?.() ?? `native-asset-${Date.now()}`;
  let storedPath = filePath;
  let scratchFileName;

  if (scratchDirectoryPath) {
    await mkdir(scratchDirectoryPath, { recursive: true });
    scratchFileName = `${sanitizeFileName(id)}-${sanitizeFileName(sourceName)}`;
    storedPath = join(scratchDirectoryPath, scratchFileName);
    await copyFile(filePath, storedPath);
  }

  await registerNativeAssetCapability(storedPath, { allowExternal: true, assetId: id });

  return {
    id,
    label: sourceName,
    kind: item.kind,
    mimeType: typeof item.mimeType === 'string' && item.mimeType.trim() ? item.mimeType.trim() : 'application/octet-stream',
    assetUrl: buildNativeAssetUrl(storedPath, id),
    nativeFilePath: storedPath,
    scratchFileName,
    createdAt: Date.now(),
  };
}

function sanitizeFlowImportWorkerItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.flatMap((item) => {
    if (!isPlainObject(item) || typeof item.filePath !== 'string' || !item.filePath.trim()) {
      return [];
    }

    return [{
      filePath: item.filePath.trim(),
      ...(typeof item.label === 'string' && item.label.trim() ? { label: item.label.trim() } : {}),
      ...(typeof item.kind === 'string' && item.kind.trim() ? { kind: item.kind.trim() } : {}),
      ...(typeof item.mimeType === 'string' && item.mimeType.trim() ? { mimeType: item.mimeType.trim() } : {}),
    }];
  });
}

async function runFlowImportWorker(items) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(flowImportWorkerUrl, { type: 'module' });
    let settled = false;

    const settle = (fn, value) => {
      if (settled) {
        return;
      }

      settled = true;
      void worker.terminate().catch(() => undefined);
      fn(value);
    };

    worker.once('message', (payload) => {
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        settle(reject, new Error(payload.error));
        return;
      }

      settle(resolve, Array.isArray(payload?.items) ? payload.items : []);
    });
    worker.once('error', (error) => settle(reject, error));
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        settle(reject, new Error(`Flow import worker exited with code ${code}.`));
      }
    });
    worker.postMessage({
      type: 'normalize-imported-media-batch',
      items,
    });
  });
}

async function normalizeImportedMediaBatchInMain(items) {
  const sanitizedItems = sanitizeFlowImportWorkerItems(items);

  if (sanitizedItems.length === 0) {
    return [];
  }

  return runFlowImportWorker(sanitizedItems);
}

async function choosePaperPdfSavePath(request, parentWindow) {
  const automationPath = getAutomationPaperPdfPath(process.env);
  if (automationPath) {
    return ensurePdfExtension(automationPath);
  }

  const result = await dialog.showSaveDialog(parentWindow ?? mainWindow ?? undefined, {
    title: 'Export Paper PDF',
    defaultPath: buildPaperPdfDefaultPath(request, currentProjectPath),
    filters: [
      { name: 'PDF Document', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return undefined;
  }

  return ensurePdfExtension(result.filePath);
}

async function choosePaperImageExportDirectory(request, parentWindow) {
  const directoryName = sanitizePaperImagePathPart(request?.directoryName, 'paper-webcomic-images');
  const automationDirectory = getAutomationPaperImageDirectory(process.env);
  if (automationDirectory) {
    return ensurePaperImageExportDirectory(automationDirectory, directoryName);
  }

  const result = await dialog.showOpenDialog(parentWindow ?? mainWindow ?? undefined, {
    title: 'Export Paper Page Images',
    defaultPath: buildPaperImageDefaultDirectoryPath(request, currentProjectPath),
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }

  return ensurePaperImageExportDirectory(result.filePaths[0], directoryName);
}

const PAPER_PDF_RENDER_READY_TIMEOUT_MS = 12000;
const PAPER_PDF_PRINT_TIMEOUT_MS = 30000;

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function waitForPaperPdfRenderReady(exportWindow) {
  await withTimeout(
    exportWindow.webContents.executeJavaScript(buildPaperPdfRenderReadyScript(), true),
    PAPER_PDF_RENDER_READY_TIMEOUT_MS,
    'Paper PDF render readiness',
  ).catch(() => undefined);
}

async function exportPaperPdfToFile(request, filePath) {
  const tempDir = join(app.getPath('temp'), 'signal-loom-paper-pdf');
  const tempHtmlPath = join(
    tempDir,
    `${Date.now()}-${sanitizePdfFileName(request?.title || request?.fileName || 'paper-document')}.html`,
  );
  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempHtmlPath, request.html, 'utf8');
    await exportWindow.loadFile(tempHtmlPath);
    await waitForPaperPdfRenderReady(exportWindow);
    const pdf = await withTimeout(
      exportWindow.webContents.printToPDF(buildPaperPdfPrintOptions(request)),
      PAPER_PDF_PRINT_TIMEOUT_MS,
      'Paper PDF print',
    );
    const stampedPdf = await applyPdfProvenance(pdf, request.provenanceLabel);
    await writeFile(filePath, stampedPdf);

    return {
      canceled: false,
      filePath,
      bytes: stampedPdf.byteLength ?? stampedPdf.length ?? 0,
    };
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
    void rm(tempHtmlPath, { force: true }).catch(() => undefined);
  }
}

/**
 * PDF Producer/Creator provenance (licensing spec Part 2 §6). Chromium's printToPDF hardcodes its
 * own Producer; pdf-lib rewrites the Info dictionary. The edition label comes from the renderer's
 * offline license verification (sanitized here). Any failure returns the ORIGINAL bytes —
 * provenance must never break an export.
 */
async function applyPdfProvenance(pdfBuffer, provenanceLabel) {
  const label = typeof provenanceLabel === 'string' && provenanceLabel.trim()
    ? provenanceLabel.trim().slice(0, 200)
    : 'Sloom Studio Community (unlicensed)';
  try {
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
    document.setProducer(label);
    document.setCreator('Sloom Studio');
    return Buffer.from(await document.save());
  } catch (error) {
    console.warn('[paper-pdf] provenance stamp skipped:', error);
    return pdfBuffer;
  }
}

async function exportPaperImagesToDirectory(request, directoryPath) {
  const pages = Array.isArray(request?.pages) ? request.pages : [];
  if (!pages.length) {
    throw new Error('No Paper pages were provided for image export.');
  }

  await mkdir(directoryPath, { recursive: true });
  const files = [];
  let totalBytes = 0;

  for (const page of pages) {
    const mimeType = page?.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const fallbackName = `page-${String(page?.pageNumber ?? files.length + 1).padStart(3, '0')}.${mimeType === 'image/jpeg' ? 'jpg' : 'png'}`;
    const fileName = sanitizePaperImagePathPart(page?.fileName, fallbackName);
    const buffer = imageBufferFromDataUrl(page?.dataUrl, mimeType);
    const filePath = join(directoryPath, fileName);
    await writeFile(filePath, buffer);
    const bytes = buffer.byteLength ?? buffer.length ?? 0;
    totalBytes += bytes;
    files.push({
      fileName,
      filePath,
      pageNumber: Number(page?.pageNumber) || files.length + 1,
      bytes,
    });
  }

  return {
    canceled: false,
    directoryPath,
    files,
    bytes: totalBytes,
  };
}

function installProtocolHandlers() {
  protocol.handle('signal-loom-asset', async (request) => {
    const filePath = await getNativeFilePathFromAssetUrl(request.url);
    if (!filePath) {
      return new Response('Sloom Studio asset capability is not registered for this project.', { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeVertexPathSegment(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  const trimmed = value.trim();

  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters.`);
  }

  return trimmed;
}

function buildVertexImageEndpoint(request) {
  const projectId = sanitizeVertexPathSegment(request.projectId, 'Vertex project ID');
  const location = sanitizeVertexPathSegment(request.location || 'global', 'Vertex location');
  const modelId = sanitizeVertexPathSegment(request.modelId, 'Vertex model ID');
  const method = request.route === 'imagen-predict'
    ? 'predict'
    : request.route === 'gemini-generate-content'
      ? 'generateContent'
      : undefined;

  if (!method) {
    throw new Error('Unsupported Vertex image route.');
  }

  return {
    url: `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:${method}`,
    projectId,
    modelId,
  };
}

function buildVertexTextEndpoint(request) {
  const projectId = sanitizeVertexPathSegment(request.projectId, 'Vertex project ID');
  const location = sanitizeVertexPathSegment(request.location || 'global', 'Vertex location');
  const modelId = sanitizeVertexPathSegment(request.modelId, 'Vertex model ID');

  return {
    url: `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`,
    projectId,
    modelId,
  };
}

function sanitizeVertexApiVersion(value) {
  if (value === 'v1' || value === 'v1beta1' || value === 'v1alpha') {
    return value;
  }

  return 'v1';
}

function buildVertexRegionalHost(location) {
  return location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
}

function buildVertexVideoEndpoint(request) {
  const projectId = sanitizeVertexPathSegment(request.projectId, 'Vertex project ID');
  const location = sanitizeVertexPathSegment(request.location || 'us-central1', 'Vertex location');
  const modelId = sanitizeVertexPathSegment(request.modelId, 'Vertex model ID');
  const route = request.route === 'gemini-generate-content'
    ? 'gemini-generate-content'
    : request.route === 'veo-predict-long-running'
      ? 'veo-predict-long-running'
      : undefined;

  if (!route) {
    throw new Error('Unsupported Vertex video route.');
  }

  const apiVersion = route === 'gemini-generate-content'
    ? sanitizeVertexApiVersion(request.apiVersion || 'v1beta1')
    : 'v1';
  const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`;
  const baseUrl = `https://${buildVertexRegionalHost(location)}/${apiVersion}/${modelPath}`;
  const method = route === 'gemini-generate-content' ? 'generateContent' : 'predictLongRunning';

  return {
    url: `${baseUrl}:${method}`,
    fetchOperationUrl: `${baseUrl}:fetchPredictOperation`,
    projectId,
    modelId,
    route,
  };
}

function resolveVertexQuotaProjectId(request, endpointProjectId) {
  const quotaProjectId = request?.auth?.quotaProjectId;
  if (typeof quotaProjectId === 'string' && quotaProjectId.trim()) {
    return sanitizeVertexPathSegment(quotaProjectId, 'Vertex quota project ID');
  }

  const envQuotaProjectId = parseVertexEnvironmentVariables(request?.auth?.environmentVariables).GOOGLE_CLOUD_QUOTA_PROJECT;
  return typeof envQuotaProjectId === 'string' && envQuotaProjectId.trim()
    ? sanitizeVertexPathSegment(envQuotaProjectId, 'Vertex quota project ID')
    : endpointProjectId;
}

async function getGcloudAccessToken(auth) {
  try {
    const { command, args } = buildVertexAccessTokenCommand(auth);
    const commandLabel = args.length ? `${command} ${args.join(' ')}` : command;
    const { stdout } = await execFileAsync(command, args, {
      env: buildVertexAuthEnvironment(auth, process.env),
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    const token = stdout.trim();

    if (!token) {
      throw new Error('gcloud returned an empty access token.');
    }

    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not get a Google access token from gcloud. Tried \'${commandLabel}\'. Check Settings > Providers > Vertex AI, then run the listed gcloud login or ADC command. ${message}`);
  }
}

function extractVertexGeneratedImage(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

    for (const part of parts) {
      const inlineData = part?.inlineData ?? part?.inline_data;
      const data = inlineData?.data;

      if (typeof data === 'string' && data) {
        return {
          mimeType: typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png',
          data,
        };
      }
    }
  }

  const predictions = Array.isArray(response?.predictions) ? response.predictions : [];

  for (const prediction of predictions) {
    const data = prediction?.bytesBase64Encoded
      ?? prediction?.bytes_base64_encoded
      ?? prediction?.image?.bytesBase64Encoded
      ?? prediction?.image?.bytes_base64_encoded;

    if (typeof data === 'string' && data) {
      return {
        mimeType: prediction?.mimeType ?? prediction?.image?.mimeType ?? 'image/png',
        data,
      };
    }
  }

  return undefined;
}

function extractVertexGeneratedText(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const textParts = [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        textParts.push(part.text);
      }
    }
  }

  return textParts.join('\n').trim();
}

function extractVertexGeneratedVideo(response) {
  const responseBody = response?.response ?? response;
  const videos = Array.isArray(responseBody?.videos) ? responseBody.videos : [];

  for (const video of videos) {
    const extracted = getVertexVideoPayload(video);

    if (extracted) {
      return extracted;
    }
  }

  const generatedSamples = Array.isArray(responseBody?.generateVideoResponse?.generatedSamples)
    ? responseBody.generateVideoResponse.generatedSamples
    : [];

  for (const sample of generatedSamples) {
    const extracted = getVertexVideoPayload(sample?.video ?? sample);

    if (extracted) {
      return extracted;
    }
  }

  return undefined;
}

function getVertexVideoPayload(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const data = stringOrUndefined(value.bytesBase64Encoded)
    ?? stringOrUndefined(value.bytes_base64_encoded)
    ?? stringOrUndefined(value.encodedVideo)
    ?? stringOrUndefined(value.videoBytes)
    ?? stringOrUndefined(value.video_bytes);
  const mimeType = stringOrUndefined(value.mimeType)
    ?? stringOrUndefined(value.mime_type)
    ?? stringOrUndefined(value.encoding)
    ?? 'video/mp4';
  const gcsUri = stringOrUndefined(value.gcsUri) ?? stringOrUndefined(value.gcs_uri);
  const uri = stringOrUndefined(value.uri);

  if (!data && !gcsUri && !uri) {
    return undefined;
  }

  return {
    mimeType,
    ...(data ? { data } : {}),
    ...(gcsUri ? { gcsUri } : {}),
    ...(uri ? { uri } : {}),
  };
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildVertexErrorMessage(status, payload, label = 'generation') {
  const apiMessage = payload?.error?.message;

  if (typeof apiMessage === 'string' && apiMessage.trim()) {
    return `Vertex AI ${label} failed (${status}): ${apiMessage}`;
  }

  return `Vertex AI ${label} failed (${status}).`;
}

async function generateVertexImage(request) {
  if (!isPlainObject(request) || !isPlainObject(request.body)) {
    return { error: 'Invalid Vertex image request.' };
  }

  try {
    const endpoint = buildVertexImageEndpoint(request);
    const token = await getGcloudAccessToken(request.auth);
    const quotaProjectId = resolveVertexQuotaProjectId(request, endpoint.projectId);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': quotaProjectId,
      },
      body: JSON.stringify(request.body),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: buildVertexErrorMessage(response.status, payload, 'image generation') };
    }

    const image = extractVertexGeneratedImage(payload);

    if (!image) {
      return { error: 'Vertex AI returned no image data.' };
    }

    return {
      result: `data:${image.mimeType};base64,${image.data}`,
      resultType: 'image',
      mimeType: image.mimeType,
      statusMessage: `Generated with ${endpoint.modelId}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Vertex AI image generation failed.',
    };
  }
}

async function generateVertexText(request) {
  if (!isPlainObject(request) || !isPlainObject(request.body)) {
    return { error: 'Invalid Vertex text request.' };
  }

  try {
    const endpoint = buildVertexTextEndpoint(request);
    const token = await getGcloudAccessToken(request.auth);
    const quotaProjectId = resolveVertexQuotaProjectId(request, endpoint.projectId);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': quotaProjectId,
      },
      body: JSON.stringify(request.body),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: buildVertexErrorMessage(response.status, payload, 'text generation') };
    }

    const text = extractVertexGeneratedText(payload);

    if (!text) {
      return { error: 'Vertex AI returned no text content.' };
    }

    return {
      text,
      statusMessage: `Generated with ${endpoint.modelId}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Vertex AI text generation failed.',
    };
  }
}

async function generateVertexVideo(request) {
  if (!isPlainObject(request) || !isPlainObject(request.body)) {
    return { error: 'Invalid Vertex video request.' };
  }

  try {
    const endpoint = buildVertexVideoEndpoint(request);
    const token = await getGcloudAccessToken(request.auth);
    const quotaProjectId = resolveVertexQuotaProjectId(request, endpoint.projectId);
    const initialResponse = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': quotaProjectId,
      },
      body: JSON.stringify(request.body),
    });
    const initialPayload = await initialResponse.json().catch(() => ({}));

    if (!initialResponse.ok) {
      return { error: buildVertexErrorMessage(initialResponse.status, initialPayload, 'video generation') };
    }

    const finalPayload = endpoint.route === 'veo-predict-long-running'
      ? await pollVertexVideoOperation({
          endpoint,
          operation: initialPayload,
          token,
          quotaProjectId,
        })
      : initialPayload;
    const video = extractVertexGeneratedVideo(finalPayload);

    if (!video) {
      return { error: 'Vertex AI returned no video data.' };
    }

    const materialized = await materializeVertexVideo(video, token, quotaProjectId);

    return {
      result: materialized.result,
      resultType: 'video',
      mimeType: materialized.mimeType,
      statusMessage: `Generated with ${endpoint.modelId}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Vertex AI video generation failed.',
    };
  }
}

async function pollVertexVideoOperation({ endpoint, operation, token, quotaProjectId }) {
  let currentOperation = operation;

  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (currentOperation?.error) {
      throw new Error(currentOperation.error.message || 'Vertex AI video operation failed.');
    }

    if (currentOperation?.done) {
      return currentOperation;
    }

    if (!currentOperation?.name) {
      throw new Error('Vertex AI video generation started without an operation name.');
    }

    await sleep(10_000);
    const response = await fetch(endpoint.fetchOperationUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': quotaProjectId,
      },
      body: JSON.stringify({
        operationName: currentOperation.name,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(buildVertexErrorMessage(response.status, payload, 'video operation polling'));
    }

    currentOperation = payload;
  }

  throw new Error('Vertex AI video generation timed out after waiting 7.5 minutes.');
}

async function materializeVertexVideo(video, token, quotaProjectId) {
  if (video.data) {
    return {
      result: `data:${video.mimeType};base64,${video.data}`,
      mimeType: video.mimeType,
    };
  }

  const url = video.gcsUri
    ? vertexGcsUriToDownloadUrl(video.gcsUri)
    : video.uri;

  if (!url) {
    throw new Error('Vertex AI returned a video reference that Sloom Studio could not download.');
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': quotaProjectId,
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(payload.trim() || `Vertex AI video download failed (${response.status}).`);
  }

  const mimeType = response.headers.get('content-type') || video.mimeType || 'video/mp4';
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    result: `data:${mimeType};base64,${buffer.toString('base64')}`,
    mimeType,
  };
}

function vertexGcsUriToDownloadUrl(gcsUri) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUri);

  if (!match) {
    return undefined;
  }

  const [, bucket, objectName] = match;
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`;
}

async function materializeSourceAsset(request) {
  if (!currentScratchDirectoryPath) {
    return { error: 'No active Sloom Studio scratch directory is available.' };
  }

  if (!isPlainObject(request)) {
    return { error: 'Invalid source asset materialization request.' };
  }

  const binaryData = request.binaryData instanceof Uint8Array
    ? request.binaryData
    : request.binaryData instanceof ArrayBuffer
      ? new Uint8Array(request.binaryData)
      : ArrayBuffer.isView(request.binaryData)
        ? new Uint8Array(request.binaryData.buffer, request.binaryData.byteOffset, request.binaryData.byteLength)
        : Array.isArray(request.binaryData)
          ? Uint8Array.from(request.binaryData.filter((value) => Number.isFinite(value)).map((value) => Number(value)))
          : undefined;
  const hasDataUrl = typeof request.dataUrl === 'string';
  if (!hasDataUrl && !binaryData) {
    return { error: 'Invalid source asset materialization request.' };
  }

  try {
    const now = Date.now();
    const item = {
      id: typeof request.id === 'string' && request.id.trim() ? request.id : `source-bin-${now}`,
      label: typeof request.label === 'string' && request.label.trim() ? request.label : 'Generated asset',
      kind: typeof request.kind === 'string' && request.kind.trim() ? request.kind : 'image',
      mimeType: typeof request.mimeType === 'string' && request.mimeType.trim() ? request.mimeType : 'application/octet-stream',
      assetUrl: request.dataUrl,
      pixelWidth: Number.isFinite(request.pixelWidth) ? request.pixelWidth : undefined,
      pixelHeight: Number.isFinite(request.pixelHeight) ? request.pixelHeight : undefined,
      createdAt: Number.isFinite(request.createdAt) ? request.createdAt : now,
      sourceKey: typeof request.sourceKey === 'string' ? request.sourceKey : undefined,
      originNodeId: typeof request.originNodeId === 'string' ? request.originNodeId : undefined,
      isGenerated: typeof request.isGenerated === 'boolean' ? request.isGenerated : undefined,
      starred: typeof request.starred === 'boolean' ? request.starred : undefined,
      collapsed: typeof request.collapsed === 'boolean' ? request.collapsed : undefined,
      envelopeId: typeof request.envelopeId === 'string' ? request.envelopeId : undefined,
      envelopeLabel: typeof request.envelopeLabel === 'string' ? request.envelopeLabel : undefined,
      envelopeIndex: Number.isFinite(request.envelopeIndex) ? request.envelopeIndex : undefined,
      envelopeCollapsed: typeof request.envelopeCollapsed === 'boolean' ? request.envelopeCollapsed : undefined,
    };

    if (binaryData) {
      await mkdir(currentScratchDirectoryPath, { recursive: true });
      const scratchFileName = buildNativeScratchFileName(item);
      const targetPath = join(currentScratchDirectoryPath, scratchFileName);

      await writeFile(targetPath, Buffer.from(binaryData));

      if (!(await hasUsableNativeAsset(targetPath))) {
        return { error: 'Could not write the source asset into the active scratch folder.' };
      }

      await registerNativeAssetCapability(targetPath, { assetId: item.id });

      return {
        item: {
          ...item,
          scratchFileName,
          nativeFilePath: targetPath,
          assetUrl: buildNativeAssetUrl(targetPath, item.id),
        },
      };
    }

    const materializedItem = await materializeProjectSourceBinItem(item, currentScratchDirectoryPath, [currentScratchDirectoryPath]);

    if (
      typeof materializedItem?.nativeFilePath !== 'string'
      || !(await hasUsableNativeAsset(materializedItem.nativeFilePath))
      || typeof materializedItem.assetUrl !== 'string'
      || !materializedItem.assetUrl.startsWith('signal-loom-asset://')
    ) {
      return { error: 'Could not write the source asset into the active scratch folder.' };
    }

    return {
      item: materializedItem,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not materialize the source asset into the scratch folder.',
    };
  }
}

function installIpcHandlers() {
  ipcMain.handle('signal-loom:get-native-state', (event) => {
    const window = getIpcWindow(event);
    return {
      currentProjectPath,
      currentScratchDirectoryPath,
      startupProject,
      workspace: window ? getWorkspaceForWindow(window) ?? activeWorkspace : activeWorkspace,
      platform: process.platform,
      isDev,
    };
  });

  ipcMain.handle('signal-loom:clear-project-path', async () => {
    setCurrentProjectAssetRoots(undefined, undefined, undefined);
    startupProject = undefined;
    await resetSourceLibrarySnapshot({ broadcast: true });
    void forgetRememberedProjectPath().catch(() => undefined);
    broadcastProjectPathChanged();
    return { ok: true };
  });

  ipcMain.handle('signal-loom:project-open', async (event) => {
    const automationPath = getAutomationProjectOpenPath(process.env);
    if (automationPath) {
      return openProjectDocumentFromPath(automationPath);
    }

    const result = await dialog.showOpenDialog(getIpcWindow(event), {
      title: 'Open Sloom Studio Project',
      properties: ['openFile'],
      filters: getProjectDialogFilters(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return openProjectDocumentFromPath(result.filePaths[0]);
  });

  ipcMain.handle('signal-loom:project-save', async (event, document) => {
    const automationPath = getAutomationProjectSavePath(process.env);
    const filePath = automationPath
      ? ensureSignalLoomProjectExtension(automationPath)
      : shouldWriteProjectSaveDirectly(currentProjectPath)
      ? currentProjectPath
      : await chooseProjectSavePath(currentProjectPath, getIpcWindow(event));

    if (!filePath) {
      return { canceled: true };
    }

    return writeProjectDocument(filePath, document);
  });

  ipcMain.handle('signal-loom:project-save-as', async (event, document) => {
    const filePath = await chooseProjectSavePath(currentProjectPath, getIpcWindow(event));

    if (!filePath) {
      return { canceled: true };
    }

    return writeProjectDocument(filePath, document);
  });

  ipcMain.handle('signal-loom:image-open', async (event) => {
    const result = await dialog.showOpenDialog(getIpcWindow(event), {
      title: 'Open Sloom Studio Image',
      properties: ['openFile'],
      filters: [
        { name: 'Sloom Studio Image', extensions: ['slimg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const path = result.filePaths[0];
    const bytes = await readFile(path);
    return { canceled: false, bytes, path };
  });

  ipcMain.handle('signal-loom:image-save-as', async (event, bytes) => {
    const result = await dialog.showSaveDialog(getIpcWindow(event), {
      title: 'Save Sloom Studio Image',
      filters: [
        { name: 'Sloom Studio Image', extensions: ['slimg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const path = result.filePath.toLowerCase().endsWith('.slimg')
      ? result.filePath
      : `${result.filePath}.slimg`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(bytes));
    return { canceled: false, path };
  });

  ipcMain.handle('signal-loom:local-upscaler-status', () => getLocalUpscalerStatus());
  ipcMain.handle('signal-loom:local-upscaler-install', () => installLocalUpscaler());
  ipcMain.handle('signal-loom:local-upscaler-start', () => startLocalUpscaler());
  ipcMain.handle('signal-loom:local-upscaler-stop', () => stopLocalUpscaler());

  // Overwrite a .slimg the renderer already knows the path of (the linked-edit round-trip's
  // "close tab → save & return"), with no dialog. Like image-read-path, the path originates
  // from a prior open/save dialog the user authorized, and only .slimg targets are accepted.
  ipcMain.handle('signal-loom:image-write-path', async (_event, path, bytes) => {
    try {
      if (typeof path !== 'string' || !path.toLowerCase().endsWith('.slimg')) {
        return { error: 'Only .slimg paths from a prior dialog can be overwritten.' };
      }
      await writeFile(path, Buffer.from(bytes));
      return { ok: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Re-read a .slimg the renderer already knows the path of (e.g. the .slimg Flow node's "Read disk"),
  // with no dialog. The path originates from a prior open/save dialog the user authorized.
  ipcMain.handle('signal-loom:image-read-path', async (_event, path) => {
    try {
      if (typeof path !== 'string' || !path) {
        return { error: 'No file path provided.' };
      }
      const bytes = await readFile(path);
      return { bytes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('signal-loom:paper-open', async (event) => {
    const result = await dialog.showOpenDialog(getIpcWindow(event), {
      title: 'Open Sloom Studio Paper',
      properties: ['openFile'],
      filters: [
        { name: 'Sloom Studio Paper', extensions: ['slppr'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const path = result.filePaths[0];
    const bytes = await readFile(path);
    return { canceled: false, bytes, path };
  });

  ipcMain.handle('signal-loom:paper-save-as', async (event, bytes) => {
    const result = await dialog.showSaveDialog(getIpcWindow(event), {
      title: 'Save Sloom Studio Paper',
      filters: [
        { name: 'Sloom Studio Paper', extensions: ['slppr'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const path = result.filePath.toLowerCase().endsWith('.slppr')
      ? result.filePath
      : `${result.filePath}.slppr`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(bytes));
    return { canceled: false, path };
  });

  ipcMain.handle('signal-loom:normalize-imported-media-batch', async (_event, items) => {
    return normalizeImportedMediaBatchInMain(items);
  });

  ipcMain.handle('signal-loom:import-media-files', async (event, options = {}) => {
    const automationPaths = getAutomationImportMediaPaths(process.env);
    let filePaths = automationPaths;

    if (!filePaths) {
      const result = await dialog.showOpenDialog(getIpcWindow(event), {
        title: 'Import Media',
        properties: ['openFile', 'multiSelections'],
        filters: getElectronDialogFilterGroups(),
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, items: [] };
      }

      filePaths = result.filePaths;
    }

    const normalizedItems = await normalizeImportedMediaBatchInMain(
      filePaths.map((filePath) => ({ filePath })),
    );
    const items = await Promise.all(
      normalizedItems.map((item) => materializeNativeImport(item, options.scratchDirectoryPath)),
    );

    return {
      canceled: false,
      items: items.filter(Boolean),
    };
  });

  ipcMain.handle('signal-loom:paper-export-pdf', async (event, request) => {
    if (!request || typeof request.html !== 'string' || !request.html.trim()) {
      return {
        canceled: false,
        error: 'No Paper document HTML was provided for PDF export.',
      };
    }

    const filePath = await choosePaperPdfSavePath(request, getIpcWindow(event));

    if (!filePath) {
      return { canceled: true };
    }

    try {
      return await exportPaperPdfToFile(request, filePath);
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'Failed to export the Paper PDF.',
      };
    }
  });

  ipcMain.handle('signal-loom:paper-export-images', async (event, request) => {
    if (!request || !Array.isArray(request.pages) || request.pages.length === 0) {
      return {
        canceled: false,
        error: 'No Paper page images were provided for export.',
      };
    }

    const directoryPath = await choosePaperImageExportDirectory(request, getIpcWindow(event));

    if (!directoryPath) {
      return { canceled: true };
    }

    try {
      return await exportPaperImagesToDirectory(request, directoryPath);
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'Failed to export Paper page images.',
      };
    }
  });

  ipcMain.handle('signal-loom:capture-current-window-png', async (event) => {
    const window = getIpcWindow(event);
    if (!window || window.isDestroyed()) {
      return {
        canceled: false,
        error: 'No active Electron window was available to capture.',
      };
    }

    try {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      const image = await withTimeout(
        window.webContents.capturePage(),
        10000,
        'Current window capture',
      );
      const size = image.getSize();
      return {
        canceled: false,
        mimeType: 'image/png',
        base64: image.toPNG().toString('base64'),
        width: size.width,
        height: size.height,
      };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'Failed to capture the current Electron window.',
      };
    }
  });

  // Download a remote media URL through the main process (net.fetch is not
  // bound by the renderer's CORS policy and ignores Content-Disposition), so
  // provider result CDNs that block fetch() and force-download can still be
  // inlined and displayed in the renderer. Returns base64 bytes + mime type.
  ipcMain.handle('signal-loom:download-remote-media', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { error: 'A valid http(s) URL is required.' };
    }

    try {
      const response = await net.fetch(url);
      if (!response.ok) {
        return { error: `Remote media download failed with status ${response.status}.` };
      }

      const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim()
        || 'application/octet-stream';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        return { error: 'Remote media download returned no bytes.' };
      }

      return { base64: buffer.toString('base64'), mimeType };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Remote media download failed.' };
    }
  });

  ipcMain.handle('signal-loom:vertex-generate-image', async (_event, request) => {
    return generateVertexImage(request);
  });

  ipcMain.handle('signal-loom:vertex-generate-text', async (_event, request) => {
    return generateVertexText(request);
  });

  ipcMain.handle('signal-loom:vertex-generate-video', async (_event, request) => {
    return generateVertexVideo(request);
  });

  ipcMain.handle('signal-loom:vertex-login', async (_event, request = {}) => {
    try {
      const { command, args } = buildVertexLoginCommand(request?.auth);
      await execFileAsync(command, args, {
        env: buildVertexAuthEnvironment(request?.auth, process.env),
        timeout: 180000,
        maxBuffer: 1024 * 1024,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('signal-loom:vertex-detect-adc', async (_event, request = {}) => {
    try {
      const token = await getGcloudAccessToken(request?.auth);
      return { ok: true, hasToken: Boolean(token) };
    } catch (error) {
      return { ok: false, hasToken: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('signal-loom:vertex-list-projects', async (_event, request = {}) => {
    try {
      const { command, args } = buildVertexListProjectsCommand(request?.auth);
      const { stdout } = await execFileAsync(command, args, {
        env: buildVertexAuthEnvironment(request?.auth, process.env),
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return { ok: true, projects: parseGcloudProjectsList(stdout) };
    } catch (error) {
      return { ok: false, projects: [], error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('signal-loom:source-asset-materialize', async (_event, request) => {
    return materializeSourceAsset(request);
  });

  ipcMain.handle('signal-loom:choose-scratch-directory', async (event) => {
    const result = await dialog.showOpenDialog(getIpcWindow(event), {
      title: 'Choose Sloom Studio Scratch Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    setCurrentProjectAssetRoots(currentProjectPath, startupProject?.document, result.filePaths[0]);

    return {
      canceled: false,
      directoryPath: currentScratchDirectoryPath,
    };
  });

  ipcMain.handle('signal-loom:open-workspace-window', async (_event, workspace) => {
    if (!isWorkspaceView(workspace)) {
      return { error: 'Unknown workspace.' };
    }

    createWorkspaceWindow(workspace);

    return { ok: true, workspace };
  });

  ipcMain.handle('signal-loom:set-active-workspace', async (event, workspace) => {
    if (!['flow', 'editor', 'image', 'paper'].includes(workspace)) {
      return { error: 'Unknown workspace.' };
    }

    activeWorkspace = workspace;
    // The sending window is now showing this workspace (covers single-window
    // tab-switching in place); give it that workspace's menu, and update the
    // application menu so the macOS bar + KDE global menu follow.
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const workspaceMenu = menuForWorkspace(workspace);
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.setMenu(workspaceMenu);
      senderWindow.setAutoHideMenuBar(false);
      senderWindow.setMenuBarVisibility(true);
    }
    applicationMenu = workspaceMenu;
    Menu.setApplicationMenu(workspaceMenu);

    return { ok: true };
  });

  ipcMain.handle('signal-loom:set-keyboard-shortcuts', async (_event, shortcuts) => {
    keyboardShortcuts = sanitizeKeyboardShortcutsForMenu(shortcuts);
    installApplicationMenu();
    // Rebuild the KDE global menu too so its accelerators track the in-window menu (no-op if off).
    globalMenuController?.refreshShortcuts();
    panelMenuService?.refresh();

    return { ok: true };
  });

  ipcMain.handle('signal-loom:set-locale', async (_event, locale) => {
    // Mirror the renderer's interface-language setting into the native + KDE menus. Rebuilding the
    // in-window menu is immediate; the global/panel menus re-read their model on the next fetch, so a
    // revision bump + re-emit (refresh) is all Plasma needs to pick up the new labels. No-op when off.
    appLocale = locale === 'ja' ? 'ja' : 'en';
    installApplicationMenu();
    globalMenuController?.refreshShortcuts();
    panelMenuService?.refresh();

    return { ok: true };
  });

  ipcMain.handle('signal-loom:source-library-get-snapshot', async () => ({
    version: sourceLibraryVersion,
    snapshot: getSourceLibrarySnapshot(),
  }));

  ipcMain.handle('signal-loom:source-library-sync-snapshot', async (_event, snapshot) => ({
    ok: true,
    version: await setSourceLibrarySnapshot(snapshot, { broadcast: true }),
  }));

  ipcMain.handle('signal-loom:source-library-apply-change', async (_event, change) => applySourceLibraryChange(change));

  ipcMain.handle('signal-loom:show-about', async (event, options) => {
    const win = getIpcWindow(event);
    const version = app.getVersion();
    // Edition line comes from the renderer's offline license verification
    // ("Community edition" / "Licensed to <email>"); sanitized, never trusted for gating.
    const edition = typeof options?.edition === 'string' && options.edition.trim()
      ? options.edition.trim().slice(0, 120)
      : 'Community edition';
    const result = await dialog.showMessageBox(win, {
      type: 'info',
      title: `About ${appName}`,
      message: `${appName} ${version} — ${edition}`,
      detail:
        'A local-first multimedia studio — node-based Flow, a layered Image editor, '
        + 'print/comic Paper layout, and a Video timeline. Bring your own API keys; Sloom Studio '
        + 'never sees your keys or your work.\n\n'
        + 'Early access (beta) — expect rough edges, and thank you for trying it.\n\n'
        + 'Staying up to date: the newest builds are always at https://sloom.studio/downloads. '
        + 'Click "Check for Updates" below, or just re-download the latest installer and run it over '
        + 'your current version — your projects are kept.\n\n'
        + 'Support: support@sloom.studio',
      buttons: ['Check for Updates', 'Get the Latest', 'Visit sloom.studio', 'Close'],
      defaultId: 3,
      cancelId: 3,
      noLink: true,
    });
    if (result.response === 0) {
      await signalLoomCheckForUpdates(win, version);
    } else if (result.response === 1) {
      await shell.openExternal('https://sloom.studio/downloads');
    } else if (result.response === 2) {
      await shell.openExternal('https://sloom.studio');
    }
  });

  ipcMain.handle('signal-loom:open-path', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { error: 'No path provided.' };
    }

    const error = await shell.openPath(filePath);
    return error ? { error } : { ok: true };
  });

  // At-rest encryption for the renderer's persisted settings (API keys). safeStorage binds the
  // ciphertext to the OS user account (DPAPI / Keychain / libsecret-kwallet). Returns null when the
  // platform keyring is unavailable so the renderer falls back to its WebCrypto path.
  ipcMain.handle('signal-loom:secret-available', () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  });
  ipcMain.handle('signal-loom:secret-encrypt', (_event, plaintext) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.encryptString(String(plaintext ?? '')).toString('base64');
    } catch {
      return null;
    }
  });
  ipcMain.handle('signal-loom:secret-decrypt', (_event, ciphertextBase64) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(String(ciphertextBase64 ?? ''), 'base64'));
    } catch {
      return null;
    }
  });

  // The async web Clipboard API (navigator.clipboard.read) is permission-gated
  // and unreliable for images inside Electron, so read the OS clipboard image
  // natively and hand the renderer a PNG data URL (null when there is none).
  ipcMain.handle('signal-loom:read-clipboard-image', async () => {
    try {
      const image = clipboard.readImage();
      if (!image || image.isEmpty()) return null;
      return image.toDataURL();
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
}

/**
 * Desktop "Check for Updates": fetch a tiny manifest from the site, compare versions, and either
 * point the user at the download (install-over-current keeps their projects) or confirm up-to-date.
 * Kept deliberately simple — no silent auto-install, since the indie builds are unsigned and a
 * surprise replace is worse than a one-click "Download".
 */
async function signalLoomCheckForUpdates(win, currentVersion) {
  let manifest = null;
  try {
    const response = await fetch('https://sloom.studio/downloads/latest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Check for Updates',
      message: 'Could not check for updates',
      detail: 'Couldn\'t reach the update server. You can always download the latest at '
        + `https://sloom.studio/downloads.\n\n(${error instanceof Error ? error.message : String(error)})`,
      buttons: ['Open Downloads', 'Close'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (r.response === 0) await shell.openExternal('https://sloom.studio/downloads');
    return;
  }
  const latest = typeof manifest?.version === 'string' ? manifest.version : null;
  if (latest && signalLoomIsVersionNewer(latest, currentVersion)) {
    const notes = typeof manifest.notes === 'string' && manifest.notes.trim()
      ? `\n\nWhat's new:\n${manifest.notes.trim()}`
      : '';
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `${appName} ${latest} is available`,
      detail: `You're on ${currentVersion}.${notes}\n\nDownload it and install over your current `
        + 'version — your projects are kept.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (r.response === 0) {
      await shell.openExternal(typeof manifest.url === 'string' && manifest.url ? manifest.url : 'https://sloom.studio/downloads');
    }
  } else {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: 'You\'re up to date',
      detail: `${appName} ${currentVersion} is the latest version.`,
      buttons: ['Close'],
    });
  }
}

/** Numeric-segment version compare; true when `a` is newer than `b` (ignores any -beta suffix). */
function signalLoomIsVersionNewer(a, b) {
  const parse = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}


// ─── Local AI upscaler: one-click install + managed runtime ─────────────────
// Downloads the pinned Real-ESRGAN ncnn release into userData, then runs
// ops/local-upscaler/local-upscaler.mjs (bundled via extraResources) under
// ELECTRON_RUN_AS_NODE with a persistent token, so the renderer's
// localAiCpuEndpointUrl/localAiCpuAuthHeader keep working across restarts.
const LOCAL_UPSCALER_PORT = 41797;
const LOCAL_UPSCALER_RELEASES = {
  linux: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip',
  win32: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip',
  darwin: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip',
};
let localUpscalerChild;

function getLocalUpscalerPaths() {
  const installDir = join(app.getPath('userData'), 'local-upscaler');
  const binaryName = process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan';
  return {
    installDir,
    binaryPath: join(installDir, binaryName),
    modelsDir: join(installDir, 'models'),
    metaPath: join(installDir, 'meta.json'),
    runtimeScript: app.isPackaged
      ? join(process.resourcesPath, 'ops', 'local-upscaler', 'local-upscaler.mjs')
      : resolve(__dirname, '../ops/local-upscaler/local-upscaler.mjs'),
  };
}

async function readLocalUpscalerMeta() {
  const { metaPath } = getLocalUpscalerPaths();
  try {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeLocalUpscalerMeta(patch) {
  const { installDir, metaPath } = getLocalUpscalerPaths();
  await mkdir(installDir, { recursive: true });
  const meta = { ...(await readLocalUpscalerMeta()), ...patch };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

function buildLocalUpscalerEndpoint(meta) {
  const port = meta.port ?? LOCAL_UPSCALER_PORT;
  return {
    endpointUrl: `http://127.0.0.1:${port}`,
    authHeader: meta.token ? `Bearer ${meta.token}` : undefined,
  };
}

async function getLocalUpscalerStatus() {
  const { binaryPath } = getLocalUpscalerPaths();
  const meta = await readLocalUpscalerMeta();
  const running = Boolean(localUpscalerChild && localUpscalerChild.exitCode === null);
  return {
    installed: existsSync(binaryPath),
    running,
    ...(running ? buildLocalUpscalerEndpoint(meta) : {}),
  };
}

async function installLocalUpscaler() {
  const releaseUrl = LOCAL_UPSCALER_RELEASES[process.platform];
  if (!releaseUrl) {
    return { installed: false, running: false, error: `No Real-ESRGAN build for platform "${process.platform}".` };
  }
  const { installDir, binaryPath, modelsDir } = getLocalUpscalerPaths();
  try {
    if (!existsSync(binaryPath)) {
      const response = await net.fetch(releaseUrl);
      if (!response.ok) {
        return { installed: false, running: false, error: `Runtime download failed (HTTP ${response.status}).` };
      }
      const zipBytes = new Uint8Array(await response.arrayBuffer());
      const entries = unzipSync(zipBytes);
      await mkdir(modelsDir, { recursive: true });
      const binaryName = basename(binaryPath);
      for (const [name, bytes] of Object.entries(entries)) {
        const flat = name.replace(/^[^/]*realesrgan[^/]*\//i, '');
        const keep = flat === binaryName
          || flat.startsWith('models/')
          || flat.toLowerCase().endsWith('.dll');
        if (!keep || flat.endsWith('/') || bytes.length === 0) continue;
        const target = join(installDir, flat);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(bytes));
      }
      if (!existsSync(binaryPath)) {
        return { installed: false, running: false, error: 'Runtime archive did not contain the upscaler binary.' };
      }
      if (process.platform !== 'win32') chmodSync(binaryPath, 0o755);
    }
    await writeLocalUpscalerMeta({ installedAt: Date.now() });
    return getLocalUpscalerStatus();
  } catch (error) {
    return { installed: existsSync(binaryPath), running: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function startLocalUpscaler() {
  const { binaryPath, modelsDir, runtimeScript } = getLocalUpscalerPaths();
  if (!existsSync(binaryPath)) {
    return { installed: false, running: false, error: 'Install the local upscaler runtime first.' };
  }
  if (!existsSync(runtimeScript)) {
    return { installed: true, running: false, error: `Runtime script missing at ${runtimeScript}.` };
  }
  if (localUpscalerChild && localUpscalerChild.exitCode === null) {
    return getLocalUpscalerStatus();
  }

  // The token persists in meta so saved renderer settings survive restarts.
  let meta = await readLocalUpscalerMeta();
  if (!meta.token) {
    meta = await writeLocalUpscalerMeta({ token: globalThis.crypto?.randomUUID?.() ?? `sl-${Date.now()}` });
  }
  meta = await writeLocalUpscalerMeta({ port: meta.port ?? LOCAL_UPSCALER_PORT, autoStart: true });

  const child = spawn(process.execPath, [
    runtimeScript,
    '--bin', binaryPath,
    '--models', modelsDir,
    '--port', String(meta.port),
    '--token', meta.token,
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    detached: false,
  });
  child.on('exit', () => {
    if (localUpscalerChild === child) localUpscalerChild = undefined;
  });
  localUpscalerChild = child;

  const { endpointUrl, authHeader } = buildLocalUpscalerEndpoint(meta);
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const probe = await net.fetch(`${endpointUrl}/v1/capabilities`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      if (probe.ok) return getLocalUpscalerStatus();
    } catch {
      // still booting
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  }
  return { installed: true, running: Boolean(localUpscalerChild), endpointUrl, authHeader, error: 'The local upscaler did not answer its health check in time.' };
}

async function stopLocalUpscaler() {
  if (localUpscalerChild && localUpscalerChild.exitCode === null) {
    localUpscalerChild.kill();
  }
  localUpscalerChild = undefined;
  await writeLocalUpscalerMeta({ autoStart: false });
  return getLocalUpscalerStatus();
}

async function maybeAutoStartLocalUpscaler() {
  try {
    const meta = await readLocalUpscalerMeta();
    const { binaryPath } = getLocalUpscalerPaths();
    if (meta.autoStart && existsSync(binaryPath)) {
      await startLocalUpscaler();
    }
  } catch (error) {
    console.warn('local-upscaler auto-start failed:', error);
  }
}

app.whenReady().then(async () => {
  installProtocolHandlers();
  installIpcHandlers();
  void maybeAutoStartLocalUpscaler();
  installApplicationMenu();
  // Bring up the native-Wayland panel-menu D-Bus service (no-op unless SIGNAL_LOOM_ELECTRON_PANEL_MENU=1).
  void getPanelMenuService().start();
  if (process.env.SIGNAL_LOOM_ELECTRON_MENU_SMOKE === '1') {
    console.log(`Sloom Studio application menu: ${getInstalledApplicationMenuLabels().join(', ')}`);
    app.quit();
    return;
  }
  createStartupSplashWindow();
  try {
    await resolveRendererEntryUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Electron renderer startup resolution failed.';
    console.error(message);

    if (!isProductionRendererReady()) {
      dialog.showErrorBox(
        'Sloom Studio startup failed',
        `${message} Build the Vite app (npm run build) and restart in production mode.`,
      );
      app.quit();
      return;
    }
  }
  await loadRememberedStartupProject();
  createWorkspaceWindow('flow');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWorkspaceWindow('flow');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Tear down the global-menu DBus export cleanly so KDE drops our registrations on exit.
app.on('will-quit', () => {
  void globalMenuController?.stop();
  void panelMenuService?.stop();
});

export { SIGNAL_LOOM_MENU_COMMANDS };
