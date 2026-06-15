import { describe, expect, it, vi } from 'vitest';

interface ElectronLinuxWindowingModule {
  applyElectronMainLinuxWindowingCompatibility: (
    app: { commandLine?: { appendSwitch?: (name: string, value?: string) => void } },
    env?: Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => void;
}

async function loadElectronLinuxWindowingModule(): Promise<ElectronLinuxWindowingModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/linux-windowing.cjs') as ElectronLinuxWindowingModule;
}

describe('Electron Linux windowing compatibility', () => {
  it('forces packaged Electron startup onto x11 on KDE Wayland so external floating panels keep their supported windowing model', async () => {
    const { applyElectronMainLinuxWindowingCompatibility } = await loadElectronLinuxWindowingModule();
    const appendSwitch = vi.fn();
    const env: Record<string, string | undefined> = {
      DISPLAY: ':1',
      XDG_CURRENT_DESKTOP: 'KDE',
      XDG_SESSION_TYPE: 'wayland',
    };

    applyElectronMainLinuxWindowingCompatibility({ commandLine: { appendSwitch } }, env, 'linux');

    expect(env.GTK_MODULES).toBe('appmenu-gtk-module');
    expect(env.UBUNTU_MENUPROXY).toBe('1');
    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBe('x11');
    expect(env.GDK_BACKEND).toBe('x11');
    expect(appendSwitch).toHaveBeenCalledWith('ozone-platform', 'x11');
  });

  it('honors the explicit native Wayland opt-out for packaged Electron startup', async () => {
    const { applyElectronMainLinuxWindowingCompatibility } = await loadElectronLinuxWindowingModule();
    const appendSwitch = vi.fn();
    const env: Record<string, string | undefined> = {
      DISPLAY: ':1',
      SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND: '1',
      XDG_CURRENT_DESKTOP: 'KDE',
      XDG_SESSION_TYPE: 'wayland',
    };

    applyElectronMainLinuxWindowingCompatibility({ commandLine: { appendSwitch } }, env, 'linux');

    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBeUndefined();
    expect(env.GDK_BACKEND).toBeUndefined();
    expect(appendSwitch).not.toHaveBeenCalled();
  });
});
