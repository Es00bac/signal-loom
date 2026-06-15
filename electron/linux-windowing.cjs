const APPMENU_GTK_MODULE = 'appmenu-gtk-module';
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

function getElectronLaunchArgs(env = process.env, platform = process.platform) {
  const args = [];

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

function applyElectronMainLinuxWindowingCompatibility(app, env = process.env, platform = process.platform) {
  if (platform !== 'linux') {
    return env;
  }

  const nextEnv = buildElectronEnvironment(env, platform);

  for (const [key, value] of Object.entries(nextEnv)) {
    if (value === undefined) {
      delete env[key];
      continue;
    }
    env[key] = value;
  }

  if (shouldForceXWaylandForGlobalMenu(nextEnv, platform)) {
    app.commandLine?.appendSwitch?.('ozone-platform', 'x11');
  }

  return nextEnv;
}

module.exports = {
  applyElectronMainLinuxWindowingCompatibility,
  buildElectronEnvironment,
  getElectronLaunchArgs,
  shouldForceXWaylandForGlobalMenu,
};
