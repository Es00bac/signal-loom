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

// Software rendering is the DEFAULT on Linux, and intentionally so: this is a
// Canvas2D-heavy paint app. A GPU-backed canvas makes drawImage compositing nearly
// free, but it makes the pixel READBACKS the paint/composite path depends on
// (getImageData, and createImageBitmap at every stroke commit) ~7x slower — measured
// ~60ms vs ~8ms for a region at 4K — which drops live sketching (rapid short strokes,
// each triggering a commit) to single-digit FPS. Software compositing is already ~60fps
// at 4K, so the GPU's only win (free drawImage) doesn't matter here while its readback
// penalty is fatal. GPU is available opt-in via SIGNAL_LOOM_ELECTRON_ENABLE_GPU=1 for
// GPU-bound workloads, and then uses the stable ANGLE GL/EGL backend (Chromium's
// auto-selected backend segfaults the GPU process on this AMD/Mesa stack, exit 139).
function getLinuxGpuSwitches(disabled) {
  if (disabled) {
    return [
      { name: 'disable-gpu' },
      { name: 'disable-gpu-sandbox' },
      { name: 'in-process-gpu' },
    ];
  }

  return [
    { name: 'use-gl', value: 'angle' },
    { name: 'use-angle', value: 'gl-egl' },
    { name: 'disable-gpu-sandbox' },
  ];
}

// Pure decision for whether to disable the Linux GPU this launch. Honors the
// explicit env opt-out and a runtime crash sentinel (written when the GPU process
// dies), with a cooldown so a one-off driver hiccup self-heals instead of pinning
// the user to software rendering forever.
function resolveLinuxGpuPolicy(env = process.env, context = {}, platform = process.platform) {
  if (platform !== 'linux') {
    return { disabled: false, reason: 'non-linux', clearSentinel: false };
  }

  if (env.SIGNAL_LOOM_ELECTRON_DISABLE_GPU === '1') {
    return { disabled: true, reason: 'env-opt-out', clearSentinel: false };
  }

  // GPU is opt-in only (see getLinuxGpuSwitches): software is the right default for a
  // readback-heavy Canvas2D paint app.
  if (env.SIGNAL_LOOM_ELECTRON_ENABLE_GPU !== '1') {
    return { disabled: true, reason: 'default-software', clearSentinel: false };
  }

  // GPU explicitly opted in — keep the crash sentinel/cooldown safety net.
  const {
    sentinelTimestamp = null,
    now = Date.now(),
    cooldownMs = 6 * 60 * 60 * 1000,
  } = context;

  if (sentinelTimestamp != null) {
    if (now - sentinelTimestamp < cooldownMs) {
      return { disabled: true, reason: 'crash-fallback', clearSentinel: false };
    }
    return { disabled: false, reason: 'crash-fallback-expired', clearSentinel: true };
  }

  return { disabled: false, reason: 'enabled-opt-in', clearSentinel: false };
}

// Applies the resolved GPU policy to the Electron `app` in the main process.
function applyLinuxGpuCommandLine(app, options = {}, platform = process.platform) {
  if (platform !== 'linux') {
    return;
  }

  const disabled = options.disabled === true;
  if (disabled) {
    app?.disableHardwareAcceleration?.();
  }

  for (const sw of getLinuxGpuSwitches(disabled)) {
    if (sw.value !== undefined) {
      app?.commandLine?.appendSwitch?.(sw.name, sw.value);
    } else {
      app?.commandLine?.appendSwitch?.(sw.name);
    }
  }
}

function getElectronLaunchArgs(env = process.env, platform = process.platform) {
  const args = [];

  if (platform === 'linux') {
    const disabled =
      env.SIGNAL_LOOM_ELECTRON_ENABLE_GPU !== '1' || env.SIGNAL_LOOM_ELECTRON_DISABLE_GPU === '1';
    for (const sw of getLinuxGpuSwitches(disabled)) {
      args.push(sw.value !== undefined ? `--${sw.name}=${sw.value}` : `--${sw.name}`);
    }
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
  applyLinuxGpuCommandLine,
  buildElectronEnvironment,
  getElectronLaunchArgs,
  getLinuxGpuSwitches,
  resolveLinuxGpuPolicy,
  shouldForceXWaylandForGlobalMenu,
};
