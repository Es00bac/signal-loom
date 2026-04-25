const { spawnSync } = require('node:child_process');

const APPMENU_GTK_MODULE = 'appmenu-gtk-module';
const DEV_RENDERER_URL = 'http://127.0.0.1:5173';
const NATIVE_WAYLAND_OPT_OUT = 'SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND';

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
  return shouldForceXWaylandForGlobalMenu(env, platform)
    ? ['--ozone-platform=x11', '.']
    : ['.'];
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

function main(argv = process.argv.slice(2)) {
  const mode = argv.includes('--dev') ? 'dev' : 'production';
  const baseEnv = { ...process.env };
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  if (mode !== 'dev') {
    const buildStatus = runCommand(npmCommand, ['run', 'build'], baseEnv);

    if (buildStatus !== 0) {
      return buildStatus;
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
