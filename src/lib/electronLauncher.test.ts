import { describe, expect, it } from 'vitest';

interface ElectronLauncherModule {
  buildElectronEnvironment: (
    env?: Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => Record<string, string | undefined>;
  getElectronLaunchArgs: (
    env?: Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => string[];
  getElectronRendererUrl: (mode: string | undefined) => string | undefined;
}

async function loadLauncherModule(): Promise<ElectronLauncherModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/launcher.cjs') as ElectronLauncherModule;
}

describe('Electron launcher environment', () => {
  it('loads KDE appmenu support before Electron starts on Linux', async () => {
    const { buildElectronEnvironment } = await loadLauncherModule();
    const env = buildElectronEnvironment({}, 'linux');

    expect(env.GTK_MODULES).toBe('appmenu-gtk-module');
    expect(env.UBUNTU_MENUPROXY).toBe('1');
  });

  it('forces XWayland on KDE Wayland so Plasma globalmenu can consume Electron menus', async () => {
    const { buildElectronEnvironment, getElectronLaunchArgs } = await loadLauncherModule();
    const env = buildElectronEnvironment({
      DISPLAY: ':1',
      XDG_CURRENT_DESKTOP: 'KDE',
      XDG_SESSION_TYPE: 'wayland',
    }, 'linux');

    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBe('x11');
    expect(env.GDK_BACKEND).toBe('x11');
    expect(getElectronLaunchArgs(env, 'linux')).toEqual(['--ozone-platform=x11', '.']);
  });

  it('allows native Wayland opt-out for Electron if explicitly requested', async () => {
    const { buildElectronEnvironment, getElectronLaunchArgs } = await loadLauncherModule();
    const env = buildElectronEnvironment({
      DISPLAY: ':1',
      SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND: '1',
      XDG_CURRENT_DESKTOP: 'KDE',
      XDG_SESSION_TYPE: 'wayland',
    }, 'linux');

    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBeUndefined();
    expect(env.GDK_BACKEND).toBeUndefined();
    expect(getElectronLaunchArgs(env, 'linux')).toEqual(['.']);
  });

  it('preserves existing GTK modules while adding appmenu once', async () => {
    const { buildElectronEnvironment } = await loadLauncherModule();
    const env = buildElectronEnvironment({
      GTK_MODULES: 'canberra-gtk-module:appmenu-gtk-module',
      ELECTRON_FORCE_WINDOW_MENU_BAR: '1',
    }, 'linux');

    expect(env.GTK_MODULES).toBe('canberra-gtk-module:appmenu-gtk-module');
    expect(env.ELECTRON_FORCE_WINDOW_MENU_BAR).toBeUndefined();
  });

  it('keeps non-Linux environments unchanged except dev renderer mode', async () => {
    const { buildElectronEnvironment, getElectronLaunchArgs, getElectronRendererUrl } = await loadLauncherModule();
    const env = buildElectronEnvironment({ GTK_MODULES: 'existing' }, 'darwin');

    expect(env.GTK_MODULES).toBe('existing');
    expect(getElectronLaunchArgs(env, 'darwin')).toEqual(['.']);
    expect(getElectronRendererUrl('dev')).toBe('http://127.0.0.1:5173');
    expect(getElectronRendererUrl(undefined)).toBeUndefined();
  });
});
