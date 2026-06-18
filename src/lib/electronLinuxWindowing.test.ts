import { describe, expect, it, vi } from 'vitest';

interface GpuSwitch {
  name: string;
  value?: string;
}

interface GpuPolicy {
  disabled: boolean;
  reason: string;
  clearSentinel: boolean;
}

interface ElectronLinuxWindowingModule {
  applyElectronMainLinuxWindowingCompatibility: (
    app: { commandLine?: { appendSwitch?: (name: string, value?: string) => void } },
    env?: Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => void;
  applyLinuxGpuCommandLine: (
    app: {
      disableHardwareAcceleration?: () => void;
      commandLine?: { appendSwitch?: (name: string, value?: string) => void };
    },
    options?: { disabled?: boolean },
    platform?: NodeJS.Platform,
  ) => void;
  getLinuxGpuSwitches: (disabled: boolean) => GpuSwitch[];
  resolveLinuxGpuPolicy: (
    env?: Record<string, string | undefined>,
    context?: { sentinelTimestamp?: number | null; now?: number; cooldownMs?: number },
    platform?: NodeJS.Platform,
  ) => GpuPolicy;
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

describe('Electron Linux GPU policy', () => {
  it('pins ANGLE to the native GL/EGL backend when the GPU is enabled', async () => {
    const { getLinuxGpuSwitches } = await loadElectronLinuxWindowingModule();

    expect(getLinuxGpuSwitches(false)).toEqual([
      { name: 'use-gl', value: 'angle' },
      { name: 'use-angle', value: 'gl-egl' },
      { name: 'disable-gpu-sandbox' },
    ]);
  });

  it('falls back to the software switches when the GPU is disabled', async () => {
    const { getLinuxGpuSwitches } = await loadElectronLinuxWindowingModule();

    expect(getLinuxGpuSwitches(true)).toEqual([
      { name: 'disable-gpu' },
      { name: 'disable-gpu-sandbox' },
      { name: 'in-process-gpu' },
    ]);
  });

  it('defaults to software rendering on Linux (GPU readbacks tank the Canvas2D paint path)', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();

    expect(resolveLinuxGpuPolicy({}, {}, 'linux')).toMatchObject({ disabled: true, reason: 'default-software' });
  });

  it('enables the GPU only when explicitly opted in', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();

    expect(resolveLinuxGpuPolicy({ SIGNAL_LOOM_ELECTRON_ENABLE_GPU: '1' }, {}, 'linux')).toMatchObject({
      disabled: false,
      reason: 'enabled-opt-in',
    });
  });

  it('honors the explicit env opt-out', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();

    expect(resolveLinuxGpuPolicy({ SIGNAL_LOOM_ELECTRON_DISABLE_GPU: '1' }, {}, 'linux')).toMatchObject({
      disabled: true,
      reason: 'env-opt-out',
    });
  });

  it('disables the GPU while a recent crash sentinel is within the cooldown (opt-in path)', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();
    const now = 1_000_000_000;

    expect(
      resolveLinuxGpuPolicy(
        { SIGNAL_LOOM_ELECTRON_ENABLE_GPU: '1' },
        { sentinelTimestamp: now - 60_000, now },
        'linux',
      ),
    ).toMatchObject({ disabled: true, reason: 'crash-fallback', clearSentinel: false });
  });

  it('re-attempts the GPU and clears the sentinel after the cooldown expires (opt-in path)', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();
    const now = 1_000_000_000;

    expect(
      resolveLinuxGpuPolicy(
        { SIGNAL_LOOM_ELECTRON_ENABLE_GPU: '1' },
        { sentinelTimestamp: now - 7 * 60 * 60 * 1000, now },
        'linux',
      ),
    ).toMatchObject({ disabled: false, reason: 'crash-fallback-expired', clearSentinel: true });
  });

  it('never touches the GPU on non-Linux platforms', async () => {
    const { resolveLinuxGpuPolicy } = await loadElectronLinuxWindowingModule();

    expect(resolveLinuxGpuPolicy({ SIGNAL_LOOM_ELECTRON_DISABLE_GPU: '1' }, {}, 'darwin')).toMatchObject({
      disabled: false,
      reason: 'non-linux',
    });
  });

  it('applies the GL/EGL switches to the app command line without disabling acceleration', async () => {
    const { applyLinuxGpuCommandLine } = await loadElectronLinuxWindowingModule();
    const appendSwitch = vi.fn();
    const disableHardwareAcceleration = vi.fn();

    applyLinuxGpuCommandLine(
      { commandLine: { appendSwitch }, disableHardwareAcceleration },
      { disabled: false },
      'linux',
    );

    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(appendSwitch).toHaveBeenCalledWith('use-gl', 'angle');
    expect(appendSwitch).toHaveBeenCalledWith('use-angle', 'gl-egl');
    expect(appendSwitch).toHaveBeenCalledWith('disable-gpu-sandbox');
  });

  it('disables hardware acceleration when the policy resolves to disabled', async () => {
    const { applyLinuxGpuCommandLine } = await loadElectronLinuxWindowingModule();
    const appendSwitch = vi.fn();
    const disableHardwareAcceleration = vi.fn();

    applyLinuxGpuCommandLine(
      { commandLine: { appendSwitch }, disableHardwareAcceleration },
      { disabled: true },
      'linux',
    );

    expect(disableHardwareAcceleration).toHaveBeenCalledTimes(1);
    expect(appendSwitch).toHaveBeenCalledWith('disable-gpu');
    expect(appendSwitch).toHaveBeenCalledWith('in-process-gpu');
  });
});
