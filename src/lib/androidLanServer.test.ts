import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { value: 'android' },
  start: vi.fn(async (options: { port?: number }) => ({
    running: true,
    port: options.port ?? 8723,
    ip: '10.0.0.5',
    url: `http://10.0.0.5:${options.port ?? 8723}/`,
  })),
  stop: vi.fn(async () => ({ running: false, port: 0, ip: '10.0.0.5', url: null })),
  status: vi.fn(async () => ({ running: true, port: 8723, ip: '10.0.0.5', url: 'http://10.0.0.5:8723/' })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform.value },
  registerPlugin: () => ({ start: mocks.start, stop: mocks.stop, status: mocks.status }),
}));

import {
  getAndroidLanServerStatus,
  isAndroidLanServerAvailable,
  SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT,
  startAndroidLanServer,
  stopAndroidLanServer,
} from './androidLanServer';

describe('androidLanServer', () => {
  afterEach(() => {
    mocks.platform.value = 'android';
    mocks.start.mockClear();
    mocks.stop.mockClear();
  });

  it('reports availability only on the native Android platform', () => {
    mocks.platform.value = 'android';
    expect(isAndroidLanServerAvailable()).toBe(true);
    mocks.platform.value = 'web';
    expect(isAndroidLanServerAvailable()).toBe(false);
  });

  it('starts the LAN server on the default port and returns the desktop URL', async () => {
    const status = await startAndroidLanServer();
    expect(mocks.start).toHaveBeenCalledWith({ port: SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT });
    expect(status?.url).toBe(`http://10.0.0.5:${SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT}/`);
  });

  it('no-ops off Android without touching the plugin', async () => {
    mocks.platform.value = 'web';
    expect(await startAndroidLanServer()).toBeNull();
    expect(await getAndroidLanServerStatus()).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('stops the LAN server', async () => {
    const status = await stopAndroidLanServer();
    expect(mocks.stop).toHaveBeenCalled();
    expect(status?.running).toBe(false);
  });
});
