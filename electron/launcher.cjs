const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const APPMENU_GTK_MODULE = 'appmenu-gtk-module';
const DEV_RENDERER_URL = 'http://127.0.0.1:5173';
const NATIVE_WAYLAND_OPT_OUT = 'SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND';
const ENABLE_GPU_OPT_IN = 'SIGNAL_LOOM_ELECTRON_ENABLE_GPU';
const LOCAL_NPM_BIN = 'SIGNAL_LOOM_NPM_BIN';

function isKdeDesktop(value) {
  return (value ?? '').split(':').some((entry) => entry.toLowerCase() === 'kde');
}

function shouldForceXWaylandForGlobalMenu(env, platform = process.platform) {
  return (
    platform === 'linux' &&
    env[NATIVE_WAYLAND_OPT_OUT] !== '1' &&
    env.XDG_SESSION_TYPE === 'wayland' &&
    isKdeDesktop(env.XDG_CURRENT_DESKTOP) &&
    Boolean(env.DISPLAY)
  );
}

function buildElectronEnvironment(env = process.env, platform = process.platform) {
  const nextEnv = { ...env };

  if (platform !== 'linux') {
    return nextEnv;
  }

  const gtkModules = new Set(
    (nextEnv.GTK_MODULES ?? '')
      .split(':')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  gtkModules.add(APPMENU_GTK_MODULE);

  nextEnv.GTK_MODULES = [...gtkModules].join(':');
  nextEnv.UBUNTU_MENUPROXY = nextEnv.UBUNTU_MENUPROXY || '1';
  delete nextEnv.ELECTRON_FORCE_WINDOW_MENU_BAR;

  if (shouldForceXWaylandForGlobalMenu(nextEnv, platform)) {
    nextEnv.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
    nextEnv.GDK_BACKEND = 'x11';
  }

  return nextEnv;
}

function getElectronRendererUrl(mode) {
  return mode === 'dev' ? DEV_RENDERER_URL : undefined;
}

function getElectronLaunchArgs(env = process.env, platform = process.platform) {
  const args = [];

  // Enable GPU by default unless explicitly disabled via environment variable
  if (platform === 'linux' && env.SIGNAL_LOOM_ELECTRON_DISABLE_GPU === '1') {
    args.push('--disable-gpu');
    args.push('--disable-gpu-sandbox');
    args.push('--in-process-gpu');
  }

  if (shouldForceXWaylandForGlobalMenu(env, platform)) {
    args.push('--ozone-platform=x11');
  }

  args.push('.');
  return args;
}

function runCommand(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? (result.signal ? 1 : 0);
}

function runBuild(baseEnv = process.env, platform = process.platform) {
  const projectRoot = process.cwd();
  const localNpmCli = join(projectRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const configuredNpm = (baseEnv[LOCAL_NPM_BIN] || '').trim();
  const npmCandidates = [
    configuredNpm ? (
      configuredNpm.endsWith('.js')
        ? { command: process.execPath, args: [configuredNpm, 'run', 'build'] }
        : { command: configuredNpm, args: ['run', 'build'] }
    ) : null,
    existsSync(localNpmCli)
      ? { command: process.execPath, args: [localNpmCli, 'run', 'build'] }
      : null,
    { command: platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'build'] },
  ].filter(Boolean);

  for (const candidate of npmCandidates) {
    try {
      return runCommand(candidate.command, candidate.args, baseEnv);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  console.error(
    'Unable to run the Electron build step: `npm` is unavailable. Set `SIGNAL_LOOM_NPM_BIN` or ensure npm is on PATH.',
  );
  return 1;
}

function hasUsableProductionBundle() {
  return existsSync(join(process.cwd(), 'dist', 'index.html'));
}

function main(argv = process.argv.slice(2)) {
  const mode = argv.includes('--dev') ? 'dev' : 'production';
  const baseEnv = { ...process.env };

  if (mode !== 'dev') {
    const buildStatus = runBuild(baseEnv, process.platform);

    if (buildStatus !== 0) {
      if (!hasUsableProductionBundle()) {
        console.error(
          'Unable to build the production bundle and no usable existing `dist/index.html` was found.',
        );
        return buildStatus;
      }

      console.error(
        'Production build failed. Continuing launch with existing built assets in `dist`.',
      );
    }
  }

  const electronEnv = buildElectronEnvironment(baseEnv, process.platform);
  const rendererUrl = getElectronRendererUrl(mode);

  if (rendererUrl) {
    electronEnv.ELECTRON_RENDERER_URL = rendererUrl;
  }

  return runCommand(require('electron'), getElectronLaunchArgs(electronEnv, process.platform), electronEnv);
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  buildElectronEnvironment,
  getElectronLaunchArgs,
  getElectronRendererUrl,
  main,
};
