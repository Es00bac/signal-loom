import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron main process source guards', () => {
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

    expect(source).toMatch(/async function rememberProjectPath[\s\S]*isSignalLoomProjectBackupPath\(filePath\)[\s\S]*forgetRememberedProjectPath/);
    expect(source).toContain('getProjectSaveDialogDefaultPath(existingPath)');
    expect(source).toMatch(/const automationPath = getAutomationProjectSavePath\(process\.env\)[\s\S]*automationPath[\s\S]*ensureSignalLoomProjectExtension\(automationPath\)[\s\S]*shouldWriteProjectSaveDirectly\(currentProjectPath\)/);
    expect(source).toMatch(/async function backupExistingProjectBeforeOverwrite[\s\S]*buildProjectOverwriteBackupPath\(filePath\)[\s\S]*copyFile\(filePath, backupPath\)/);
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

  it('registers opaque native asset ids from source-library capabilities', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toContain('collectNativeAssetCapabilitiesFromSourceBin');
    expect(source).toMatch(/async function registerNativeAssetCapability\(filePath, \{ allowExternal = false, assetId } = {}\)/);
    expect(source).toMatch(/nativeAssetCapabilityAssetIds\.set\(assetId\.trim\(\), registeredPath\)/);
    expect(source).toMatch(/for \(const capability of collectNativeAssetCapabilitiesFromSourceBin\(sourceBin\)\)[\s\S]*registerNativeAssetCapability\(capability\.filePath[\s\S]*assetId: capability\.assetId/);
    expect(source).toMatch(/registerNativeAssetCapability\(targetPath, \{ assetId: item\.id }\)/);
    expect(source).toMatch(/registerNativeAssetCapability\(storedPath, \{ allowExternal: true, assetId: id }\)/);
  });

  it('materializes renderer-provided binary asset payloads directly into the active scratch folder', () => {
    const source = readFileSync(join(process.cwd(), 'electron/main.mjs'), 'utf8');

    expect(source).toMatch(/const binaryData = request\.binaryData instanceof Uint8Array/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*buildNativeScratchFileName\(item\)/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*writeFile\(targetPath, Buffer\.from\(binaryData\)\)/);
    expect(source).toMatch(/if \(binaryData\)[\s\S]*assetUrl: buildNativeAssetUrl\(targetPath, item\.id\)/);
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
