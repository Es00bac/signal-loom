import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron main process source guards', () => {
  it('uses platform Leave/Cancel for dirty renderer shutdown after a recovery capture', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/webContents\.on\('will-prevent-unload'[\s\S]*buttons: \['Leave', 'Cancel'\][\s\S]*choice === 0[\s\S]*event\.preventDefault\(\)/);
    expect(source).toContain('Unsaved Image or Paper changes are still open.');
    expect(source).not.toContain('A local recovery copy was captured.');
  });

  it('overwrites only acknowledged standalone .slppr paths for Paper Save', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/signal-loom:paper-write-path[\s\S]*endsWith\('\.slppr'\)[\s\S]*writeFile\(path, Buffer\.from\(bytes\)\)[\s\S]*ok: true, path/);
  });

  it('awaits scratch-directory reads inside the guarded catch block', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/async function readdirScratchDirectory[\s\S]*return await readdir\(scratchDirectoryPath/);
  });

  it('supports an explicit Electron userData directory for isolated smoke runs', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('SIGNAL_LOOM_ELECTRON_USER_DATA_DIR');
    expect(source).toMatch(/app\.setPath\('userData', resolve\(isolatedUserDataDir\)\)/);
  });

  it('applies the shared Linux windowing compatibility policy in the packaged Electron main process', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('applyElectronMainLinuxWindowingCompatibility(app, process.env, process.platform)');
  });

  it('shows a packaged splash image while the first workspace window is launching', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');
    const splashAssetPath = join(process.cwd(), 'electron/assets/signal-loom-splash.png');

    expect(source).toContain('SIGNAL_LOOM_SPLASH_IMAGE_PATH');
    expect(source).toContain("resolve(__dirname, 'assets', 'signal-loom-splash.png')");
    expect(source).toContain('function createStartupSplashWindow()');
    expect(source).toContain('pathToFileURL(SIGNAL_LOOM_SPLASH_IMAGE_PATH).href');
    expect(source).toMatch(/new BrowserWindow\(\{[\s\S]*frame: false[\s\S]*resizable: false[\s\S]*skipTaskbar: true[\s\S]*show: true/);
    expect(source).toMatch(/workspaceWindow\.once\('ready-to-show'[\s\S]*workspaceWindow\.show\(\)[\s\S]*closeStartupSplashWindow\(\)/);
    expect(source).toMatch(/app\.whenReady\(\)\.then\(async \(\) => \{[\s\S]*createStartupSplashWindow\(\)[\s\S]*await resolveRendererEntryUrl\(\)/);
    expect(existsSync(splashAssetPath)).toBe(true);
  });

  it('exposes a Vertex video bridge that polls Veo without Gemini API key headers', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('signal-loom:vertex-generate-video');
    expect(source).toContain('veo-predict-long-running');
    expect(source).toContain(':fetchPredictOperation');
    expect(source).toMatch(/async function generateVertexVideo[\s\S]*Authorization: `Bearer \$\{token\}`/);
  });

  it('does not remember or overwrite opened .sloom backup files on normal Save', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/async function stageProjectStartupRecord[\s\S]*isSignalLoomProjectBackupPath\(filePath\)[\s\S]*rmSync\(statePath/);
    expect(source).toContain('getProjectSaveDialogDefaultPath(existingPath)');
    expect(source).toMatch(/const automationPath = getAutomationProjectSavePath\(process\.env\)[\s\S]*automationPath[\s\S]*ensureSignalLoomProjectExtension\(automationPath\)[\s\S]*shouldWriteProjectSaveDirectly\(currentFilePath\)/);
    expect(source).toMatch(/async function writeProjectDocument[\s\S]*buildProjectOverwriteBackupPath\(filePath\)[\s\S]*writeFileSync\(candidate, previousTarget\)[\s\S]*renameSync\(stagedTarget, filePath\)/);
  });

  it('clears stale remembered startup paths that cannot be resolved', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/const rememberedPath = parseStartupProjectState\(contents\)/);
    expect(source).toMatch(/const resolvedPath = resolveStartupProjectPath\(rememberedPath, existsSync\)/);
    expect(source).toMatch(/if \(rememberedPath && !resolvedPath\)[\s\S]*await forgetRememberedProjectPath\(\)/);
  });

  it('serves native asset protocol requests only after capability registration', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('registerNativeAssetCapabilitiesFromSourceBin');
    expect(source).toContain('previouslyRegisteredPaths');
    expect(source).toContain('setCurrentProjectAssetRoots');
    expect(source).toContain('parseNativeAssetUrl');
    expect(source).toContain('const nativeAssetCapabilityAssetIds = new Map()');
    expect(source).toMatch(/async function getNativeFilePathFromAssetUrl[\s\S]*parsedAsset\.type === 'asset'[\s\S]*nativeAssetCapabilityAssetIds\.get\(parsedAsset\.assetId\)/);
    expect(source).toMatch(/protocol\.handle\('signal-loom-asset'[\s\S]*getNativeFilePathFromAssetUrl\(request\.url\)[\s\S]*status: 403/);
  });

  it('uses realpath containment so scratch symlinks cannot escape the asset boundary', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('const nativeAssetCapabilityRealPaths = new Map()');
    expect(source).toMatch(/async function isPathInsideDirectory[\s\S]*realpath\(filePath\)[\s\S]*realpath\(directoryPath\)/);
    expect(source).toMatch(/async function registerNativeAssetCapability[\s\S]*await Promise\.all[\s\S]*isPathInsideDirectory/);
    expect(source).toMatch(/async function isNativeAssetCapabilityRegistered[\s\S]*await realpath\(filePath\)/);
    expect(source).toMatch(/protocol\.handle\('signal-loom-asset'[\s\S]*getNativeFilePathFromAssetUrl\(request\.url\)[\s\S]*status: 403/);
  });

  it('does not register native asset capabilities while serving protocol reads', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');
    const protocolHandler = source.match(/protocol\.handle\('signal-loom-asset'[\s\S]*?\n {2}}\);/)?.[0] ?? '';

    expect(protocolHandler).toContain('getNativeFilePathFromAssetUrl(request.url)');
    expect(protocolHandler).not.toContain('registerNativeAssetCapability(filePath)');
  });

  it('serves bundled fonts through a read-only contained protocol root', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain("scheme: 'signal-loom-font'");
    expect(source).toContain('resolveBundledFontLibraryRoot');
    expect(source).toMatch(/protocol\.handle\('signal-loom-font'[\s\S]*resolveBundledFontResourcePath\(bundledFontLibraryRoot, request\.url\)/);
    expect(source).toMatch(/protocol\.handle\('signal-loom-font'[\s\S]*status: 404/);
  });

  it('registers opaque native asset ids from source-library capabilities', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('collectNativeAssetCapabilitiesFromSourceBin');
    expect(source).toMatch(/async function registerNativeAssetCapability\(filePath, \{ allowExternal = false, assetId } = {}\)/);
    expect(source).toMatch(/nativeAssetCapabilityAssetIds\.set\(assetId\.trim\(\), registeredPath\)/);
    expect(source).toMatch(/async function prepareNativeAssetCapabilitiesFromSourceBin[\s\S]*for \(const capability of collectNativeAssetCapabilitiesFromSourceBin\(sourceBin\)\)[\s\S]*assetIds\.push\(\[capability\.assetId\.trim\(\), normalizedPath\]\)/);
    expect(source).toMatch(/function commitNativeAssetCapabilities[\s\S]*nativeAssetCapabilityAssetIds\.set\(assetId, filePath\)/);
    expect(source).toMatch(/'signal-loom:source-asset-materialize'[\s\S]{0,1000}projectAuthority\.runAuthorizedMutation\([\s\S]{0,1000}commitNativeAssetCapabilities\(preparedCapabilities, \{ replace: false }\)/);
    expect(source).toMatch(/'signal-loom:import-media-files'[\s\S]{0,2400}projectAuthority\.runAuthorizedMutation\([\s\S]{0,2400}prepareNativeAssetCapabilitiesFromSourceBin\(\{ items }, \{ allowExternal: true }\)/);
  });

  it('materializes renderer-provided binary asset payloads directly into the active scratch folder', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/const binaryData = request\.binaryData instanceof Uint8Array/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*buildNativeScratchFileName\(item\)/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*writeFile\(targetPath, Buffer\.from\(binaryData\)\)/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*assetUrl: buildNativeAssetUrl\(targetPath, item\.id\)/);
  });

  it('journals Source materialization bytes and rolls them back when exact authority is lost', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');
    const handler = source.match(/ipcMain\.handle\('signal-loom:source-asset-materialize'[\s\S]*?\n {2}\}\);/)?.[0] ?? '';

    expect(source).toMatch(/async function materializeSourceAsset\(request, scratchJournal\)[\s\S]*scratchJournal\?\.beforeWrite\(targetPath\)[\s\S]*writeFile\(targetPath/);
    expect(handler).toContain('createScratchPreparationJournal(currentScratchDirectoryPath)');
    expect(handler).toContain('rollback: ({ scratchJournal }) => scratchJournal?.rollback()');
    expect(handler.indexOf('prepareNativeAssetCapabilitiesFromSourceBin')).toBeLessThan(handler.indexOf('commitNativeAssetCapabilities'));
  });

  it('keeps a manually selected scratch directory in the active capability roots', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');
    const assetRootSetter = source.match(/function setCurrentProjectAssetRoots[\s\S]*?\n}/)?.[0] ?? '';

    expect(assetRootSetter).toContain('buildProjectScratchDirectoryCandidates(filePath, document)');
    expect(assetRootSetter).toContain('scratchDirectoryPath');
    expect(assetRootSetter).toContain('new Set');
  });

  it('reapplies Paper scratch-asset recovery when native open starts from a partial source library snapshot', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/const openedDocument = attachNativeScratchAssetsToProjectDocument\(\s*\{\s*\.\.\.document,\s*sourceBin: await attachRecoveredScratchAssetsToSourceBin\(sourceBin, scratchDirectoryPath\),\s*\},\s*scratchDirectoryPath,\s*hasUsableNativeAssetSync,\s*\)/);
  });

  it('normalizes native import metadata through a worker-backed batch contract', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain("ipcMain.handle('signal-loom:normalize-imported-media-batch'");
    expect(source).toContain('runFlowImportWorker');
    expect(source).toMatch(/ipcMain\.handle\('signal-loom:import-media-files'[\s\S]*normalizeImportedMediaBatchInMain/);
  });

  it('documents flow workspace performance gate expectations', () => {
    const soakSource = readFileSync(join(process.cwd(), 'scripts/native-real-project-soak.mjs'), 'utf8');
    const libSource = readFileSync(join(process.cwd(), 'scripts/native-smoke-lib.mjs'), 'utf8');

    expect(libSource).toContain('flowWorkspaceSwitchDurationBudgetMs');
    expect(libSource).toContain('rendererHeapBudgetMb');
    expect(soakSource).toContain('switchDurationMs');
  });

  it('drives native Paper smoke export through the shared renderer command surface', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/native-real-project-smoke.mjs'), 'utf8');

    expect(source).toContain('signal-loom:native-renderer-command');
    expect(source).toContain("command: 'paper:export-pdf'");
  });

  it('chooses Paper PDF and page-image destinations before renderer rasterization', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain("ipcMain.handle('signal-loom:paper-choose-pdf-export-path'");
    expect(source).toContain("ipcMain.handle('signal-loom:paper-choose-image-export-directory'");
    expect(source).toMatch(/signal-loom:paper-export-pdf[\s\S]*request\.filePath[\s\S]*isAbsolute\(request\.filePath\)[\s\S]*choosePaperPdfSavePath/);
    expect(source).toMatch(/signal-loom:paper-export-images[\s\S]*request\.directoryPath[\s\S]*isAbsolute\(request\.directoryPath\)[\s\S]*choosePaperImageExportDirectory/);
    expect(source).toMatch(/signal-loom:paper-save-pdf-bytes[\s\S]*PDF header[\s\S]*choosePaperPdfSavePath[\s\S]*writeFile/);
  });

  it('retries native smoke CDP evaluation across renderer reloads', () => {
    const realProjectSmoke = readFileSync(join(process.cwd(), 'scripts/native-real-project-smoke.mjs'), 'utf8');
    const realProjectSoak = readFileSync(join(process.cwd(), 'scripts/native-real-project-soak.mjs'), 'utf8');

    expect(realProjectSmoke).toContain('Execution context was destroyed');
    expect(realProjectSoak).toContain('Execution context was destroyed');
  });

  it('makes the real-project soak mirror renderer workspace-command churn as well as native snapshot updates', () => {
    const realProjectSoak = readFileSync(join(process.cwd(), 'scripts/native-real-project-soak.mjs'), 'utf8');

    expect(realProjectSoak).toContain('signal-loom-workspace-window-commands');
    expect(realProjectSoak).toContain("senderId: 'native-real-project-soak-harness'");
  });
});

describe('project authority arbitration wiring (AUD-001)', () => {
  const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

  it('creates the shared project authority gateway from the pure module', () => {
    expect(source).toMatch(/import projectAuthorityModule from '\.\/project-authority\.cjs'/);
    expect(source).toMatch(/const \{ createProjectAuthority, normalizeProjectSavePayload \} = projectAuthorityModule/);
    expect(source).toMatch(/const projectAuthority = createProjectAuthority\(\{/);
    expect(source).toContain('broadcast: broadcastProjectAuthorityChanged');
  });

  it('binds startup, open, save, save-as, and clear to authority commits instead of a bare path', () => {
    expect(source).toMatch(/function commitStartupProjectAuthority\(\)[\s\S]*?projectAuthority\.commitStartup\(\{[\s\S]*?filePath: currentProjectPath/);
    expect(source).toMatch(/ipcMain\.handle\('signal-loom:project-open', async \(event, request\) => \{[\s\S]{0,900}?projectAuthority\.prepareOpenProject\(\{[\s\S]{0,220}?senderId: event\.sender\.id/);
    expect(source).toMatch(/ipcMain\.handle\('signal-loom:project-save', async \(event, payload\) => \{[\s\S]{0,900}?projectAuthority\.saveProject\(\{[\s\S]{0,300}?senderId: event\.sender\.id[\s\S]{0,300}?claim/);
    expect(source).toMatch(/ipcMain\.handle\('signal-loom:project-save-as', async \(event, payload\) => \{[\s\S]{0,900}?projectAuthority\.saveProject\(\{[\s\S]{0,300}?senderId: event\.sender\.id[\s\S]{0,300}?claim/);
    expect(source).toMatch(/ipcMain\.handle\('signal-loom:clear-project-path', async \(event, request\) => \{[\s\S]{0,600}?projectAuthority\.prepareClearProject\(\{[\s\S]{0,220}?senderId: event\.sender\.id/);
    expect(source).toContain("ipcMain.handle('signal-loom:project-switch-commit'");
    expect(source).toContain("ipcMain.handle('signal-loom:project-switch-cancel'");
    expect(source).toContain('normalizeProjectSavePayload');
  });

  it('exposes adoption pull/confirm handlers and reports authority in native state', () => {
    expect(source).toContain("ipcMain.handle('signal-loom:project-adopt'");
    expect(source).toContain("ipcMain.handle('signal-loom:project-confirm-adoption'");
    expect(source).toMatch(/projectAuthority\.buildAdoptResponse\(/);
    expect(source).toMatch(/projectAuthority\.confirmAdoption\([\s\S]{0,220}?event\.sender\.id,[\s\S]{0,220}?claim/);
    expect(source).toMatch(/'signal-loom:get-native-state'[\s\S]{0,500}?projectAuthority: projectAuthority\.getCurrent\(\)/);
    expect(source).toMatch(/'signal-loom:get-native-state'[\s\S]{0,500}?webContentsId: event\.sender\.id/);
  });

  it('broadcasts versioned authority changes and invalidates renderer claims on destruction/reload/crash', () => {
    expect(source).toMatch(/function broadcastProjectAuthorityChanged\(event\)[\s\S]*?'signal-loom:project-authority-changed', event/);
    expect(source).toMatch(/once\('destroyed'[\s\S]{0,200}?invalidateRendererAuthority/);
    expect(source).toMatch(/did-start-navigation[\s\S]{0,200}?invalidateRendererAuthority/);
    expect(source).toMatch(/render-process-gone[\s\S]{0,200}?invalidateRendererAuthority/);
  });

  it('routes every project disk write through the arbitration gateway, not directly from IPC handlers', () => {
    const saveHandler = source.match(/ipcMain\.handle\('signal-loom:project-save',[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
    const saveAsHandler = source.match(/ipcMain\.handle\('signal-loom:project-save-as',[\s\S]*?\n {2}\}\);/)?.[0] ?? '';

    expect(saveHandler).toContain('projectAuthority.saveProject({');
    expect(saveAsHandler).toContain('projectAuthority.saveProject({');
    expect(saveHandler).not.toMatch(/return writeProjectDocument\(/);
    expect(saveAsHandler).not.toMatch(/return writeProjectDocument\(/);

    // The write helper no longer self-broadcasts: notification ordering (write → version
    // advance → broadcast) is owned by the gateway commit.
    const writeHelper = source.match(/async function writeProjectDocument[\s\S]*?\n\}/)?.[0] ?? '';
    expect(writeHelper.length).toBeGreaterThan(0);
    expect(writeHelper).not.toContain('broadcastProjectPathChanged()');
  });

  it('requires the current adopted authority for Source Library snapshot and delta mutations', () => {
    expect(source).toMatch(/'signal-loom:source-library-get-snapshot'[\s\S]{0,700}projectAuthority\.authorizeSave\([\s\S]{0,220}request\?\.claim/);
    expect(source).toMatch(/'signal-loom:source-library-sync-snapshot'[\s\S]{0,650}projectAuthority\.runAuthorizedMutation\(\{[\s\S]{0,260}claim: request\?\.claim/);
    expect(source).toMatch(/'signal-loom:source-library-apply-change'[\s\S]{0,650}projectAuthority\.runAuthorizedMutation\(\{[\s\S]{0,260}claim: request\?\.claim/);
    expect(source).toMatch(/snapshot: getSourceLibrarySnapshot\(\)[\s\S]{0,120}authority: projectAuthority\.getCurrent\(\)/);
  });

  it('prepares Source capability replacement off-state and advances its version only at the exact commit', () => {
    const prepareBody = source.slice(
      source.indexOf('async function prepareSourceLibraryChange('),
      source.indexOf('function commitPreparedSourceLibraryChange('),
    );
    const commitBody = source.slice(
      source.indexOf('function commitSourceLibrarySnapshot('),
      source.indexOf('async function setSourceLibrarySnapshot('),
    );
    expect(prepareBody).not.toContain('sourceLibraryVersion += 1');
    expect(prepareBody).not.toContain('nativeAssetCapabilityRegistry.clear()');
    expect(commitBody.match(/sourceLibraryVersion \+= 1/g)).toHaveLength(1);
    expect(source).toMatch(/function restoreCommittedProjectSnapshot[\s\S]{0,420}void snapshot/);
    expect(source).not.toMatch(/function restoreCommittedProjectSnapshot[\s\S]{0,420}publishCommittedProjectSnapshot\(snapshot\)/);
  });

  it('returns the exact committed Source version with Save and Save As', () => {
    const saveHandler = source.match(/ipcMain\.handle\('signal-loom:project-save',[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
    const saveAsHandler = source.match(/ipcMain\.handle\('signal-loom:project-save-as',[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
    expect(saveHandler).toContain('{ ...result, sourceLibraryVersion }');
    expect(saveAsHandler).toContain('{ ...result, sourceLibraryVersion }');
  });
});

describe('Electron single-instance and external-open source guards', () => {
  const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

  it('acquires the single-instance lock after userData resolution and before shared side effects', () => {
    const userDataIndex = source.indexOf("app.setPath('userData'");
    const lockIndex = source.indexOf('app.requestSingleInstanceLock(');
    const sentinelIndex = source.indexOf('gpuFallbackSentinelPath');
    const privilegedSchemesIndex = source.indexOf('protocol.registerSchemesAsPrivileged');
    const whenReadyIndex = source.indexOf('app.whenReady()');

    expect(lockIndex).toBeGreaterThan(-1);
    expect(userDataIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(userDataIndex);
    expect(lockIndex).toBeLessThan(sentinelIndex);
    expect(lockIndex).toBeLessThan(privilegedSchemesIndex);
    expect(lockIndex).toBeLessThan(whenReadyIndex);
  });

  it('quits the losing instance without starting any shared services or windows', () => {
    // app.quit() alone is not reliable before 'ready' (a live loser instance was observed
    // lingering for 30s on Linux); the loser must force-exit after requesting quit.
    expect(source).toMatch(/if \(!hasSingleInstanceLock\) \{\s*app\.quit\(\);\s*app\.exit\(0\);\s*\} else \{/);
    // Everything with shared side effects (GPU sentinel, protocol schemes, whenReady boot,
    // lifecycle handlers) must live inside the winner branch.
    expect(source).toMatch(/} else \{[\s\S]*gpuFallbackSentinelPath[\s\S]*registerSchemesAsPrivileged[\s\S]*app\.whenReady\(\)[\s\S]*app\.on\('window-all-closed'[\s\S]*app\.on\('will-quit'/);
  });

  it('acquires the lock bare and consumes the natively relayed second-instance argv', () => {
    // Electron 41's POSIX process singleton cannot carry requestSingleInstanceLock
    // additionalData: the running app logs "additional_data_size exceeds payload length",
    // never acknowledges, and the CONNECTING instance kills it and takes over (observed
    // live on Linux). The lock must be acquired with no payload; the winner reads the
    // relayed argv/workingDirectory, with additionalData parsed only defensively.
    expect(source).toMatch(/const hasSingleInstanceLock = app\.requestSingleInstanceLock\(\);/);
    expect(source).not.toMatch(/requestSingleInstanceLock\(\s*[^)\s]/);
    expect(source).toMatch(/app\.on\('second-instance', \(_event, argv, workingDirectory, additionalData\) => \{[\s\S]*parseSecondInstanceOpenPayload\(additionalData\)/);
  });

  it('focuses the existing window and drains queued targets on second-instance', () => {
    expect(source).toMatch(/app\.on\('second-instance'[\s\S]*focusExternalOpenTargetWindow\(\)[\s\S]*dispatchPendingExternalOpenRequests\(\)/);
  });

  it('routes macOS open-file and open-url events into the validated external-open queue before ready', () => {
    const openFileIndex = source.indexOf("app.on('open-file'");
    const openUrlIndex = source.indexOf("app.on('open-url'");
    const whenReadyIndex = source.indexOf('app.whenReady()');

    expect(openFileIndex).toBeGreaterThan(-1);
    expect(openUrlIndex).toBeGreaterThan(-1);
    expect(openFileIndex).toBeLessThan(whenReadyIndex);
    expect(openUrlIndex).toBeLessThan(whenReadyIndex);
    expect(source).toMatch(/app\.on\('open-file', \(event, filePath\) => \{\s*event\.preventDefault\(\);/);
    expect(source).toMatch(/app\.on\('open-url', \(event, url\) => \{\s*event\.preventDefault\(\);/);
  });

  it('validates initial argv into the queue with the packaged/dev app path context', () => {
    expect(source).toMatch(/enqueueExternalOpenArgv\(process\.argv, process\.cwd\(\)\)/);
    expect(source).toMatch(/createExternalOpenQueue\(\{[\s\S]*isFile:/);
  });

  it('fulfills external document opens through the canonical open transactions only', () => {
    const takeHandler = source.slice(source.indexOf("ipcMain.handle('signal-loom:external-open-take'"));

    expect(takeHandler.length).toBeGreaterThan(100);
    expect(takeHandler.slice(0, 1600)).toContain('takeDocumentRequests()');
    expect(takeHandler.slice(0, 1600)).toContain('openProjectDocumentFromPath(request.filePath)');
    expect(takeHandler.slice(0, 1600)).toMatch(/readFile\(request\.filePath\)/);
  });

  it('announces queued document opens to the target window over the pending channel', () => {
    expect(source).toContain("'signal-loom:external-open-pending'");
    expect(source).toMatch(/function dispatchPendingExternalOpenRequests\(\)[\s\S]*createWorkspaceWindow\(request\.workspace\)/);
  });

  it('skips the remembered startup project when an external project open is queued', () => {
    expect(source).toMatch(/loadRememberedStartupProject\(\{ skipRemembered: externalOpenQueue\.hasPending\('project'\) \}\)/);
    expect(source).toMatch(/async function loadRememberedStartupProject\(\{ skipRemembered = false \} = \{\}\)[\s\S]*const filePath = skipRemembered \? undefined : await readRememberedProjectPath\(\);/);
  });

  it('registers the signal-loom deep-link scheme only for packaged winners', () => {
    expect(source).toMatch(/if \(app\.isPackaged\) \{\s*app\.setAsDefaultProtocolClient\(EXTERNAL_OPEN_DEEP_LINK_SCHEME\);/);
  });

  it('exposes the external-open bridge from the preload script', () => {
    const preload = readFileSync(join(process.cwd(), 'electron/preload.cjs'), 'utf8');

    expect(preload).toContain("takeExternalOpenRequests: () => ipcRenderer.invoke('signal-loom:external-open-take')");
    expect(preload).toContain("onExternalOpenPending: (callback) => onChannel('signal-loom:external-open-pending', callback)");
  });
});
