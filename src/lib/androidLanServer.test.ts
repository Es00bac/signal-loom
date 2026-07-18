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
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform.value },
  registerPlugin: () => ({
    start: mocks.start, stop: mocks.stop, status: mocks.status, addListener: mocks.addListener,
  }),
}));

import {
  getAndroidLanServerStatus,
  initializeLanServerProxy,
  isAndroidLanServerAvailable,
  resolveLanRequest,
  SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT,
  startAndroidLanServer,
  stopAndroidLanServer,
} from './androidLanServer';
import { claimLock, getEditLockState, resetEditLock } from './projectEditLock';
import {
  clearProjectSyncChannels,
  registerProjectSyncChannel,
  resetProjectSyncLog,
  type ProjectSyncChannel,
} from './projectSyncService';

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
    expect(mocks.start).toHaveBeenCalledWith({
      port: SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT,
      pin: '',
    });
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

  it('serves bounded asset metadata separately from the asset payload', async () => {
    const getAssetMetadata = vi.fn(async () => ({
      id: 'asset-1', name: 'clip.mp4', mimeType: 'video/mp4', size: 123, createdAt: 1,
    }));
    initializeLanServerProxy({ getAssetMetadata });
    await expect(resolveLanRequest({
      method: 'GET', path: '/__loom/api/asset-metadata/asset-1',
    })).resolves.toMatchObject({ size: 123, mimeType: 'video/mp4' });
    expect(getAssetMetadata).toHaveBeenCalledWith('asset-1');
  });

  it('requires and forwards the explicit bound, sample window, and identity for asset bytes', async () => {
    const getAsset = vi.fn(async () => ({ dataUrl: 'data:image/png;base64,QUJD' }));
    const getAssetSample = vi.fn(async () => ({ headBase64: 'QUJD', tailBase64: 'QUJD' }));
    initializeLanServerProxy({ getAsset, getAssetSample });

    await expect(resolveLanRequest({
      method: 'GET', path: '/__loom/api/asset/asset-1',
    })).resolves.toBeNull();
    expect(getAsset).not.toHaveBeenCalled();

    const query = 'maxBytes=8&sampleBytes=4&transportIdentity=revision-1';
    await expect(resolveLanRequest({
      method: 'GET', path: `/__loom/api/asset-sample/asset-1?${query}`,
    })).resolves.toMatchObject({ headBase64: 'QUJD' });
    await expect(resolveLanRequest({
      method: 'GET', path: `/__loom/api/asset/asset-1?${query}`,
    })).resolves.toMatchObject({ dataUrl: 'data:image/png;base64,QUJD' });
    expect(getAssetSample).toHaveBeenCalledWith('asset-1', {
      maxBytes: 8, sampleBytes: 4, transportIdentity: 'revision-1',
    });
    expect(getAsset).toHaveBeenCalledWith('asset-1', {
      maxBytes: 8, sampleBytes: 4, transportIdentity: 'revision-1',
    });
  });

  it('requires the same metadata, sample, and full lifecycle for universal source assets', async () => {
    const getSourceAssetMetadata = vi.fn(async () => ({
      id: 'source-1', name: 'clip.mp4', mimeType: 'video/mp4', size: 123, createdAt: 1,
      transportRevision: 'source-revision', transportIdentity: 'sha256:source-identity',
    }));
    const getSourceAssetSample = vi.fn(async () => ({ headBase64: 'QUJD', tailBase64: 'QUJD' }));
    const getSourceAsset = vi.fn(async () => ({ dataUrl: 'data:video/mp4;base64,QUJD' }));
    initializeLanServerProxy({ getSourceAssetMetadata, getSourceAssetSample, getSourceAsset });

    await expect(resolveLanRequest({
      method: 'GET', path: '/__loom/api/source-asset/source-1',
    })).resolves.toBeNull();
    expect(getSourceAsset).not.toHaveBeenCalled();

    await expect(resolveLanRequest({
      method: 'GET', path: '/__loom/api/source-asset-metadata/source-1',
    })).resolves.toMatchObject({ size: 123, mimeType: 'video/mp4' });
    const query = 'maxBytes=256&sampleBytes=64&transportIdentity=sha256%3Asource-identity';
    await expect(resolveLanRequest({
      method: 'GET', path: `/__loom/api/source-asset-sample/source-1?${query}`,
    })).resolves.toMatchObject({ headBase64: 'QUJD' });
    await expect(resolveLanRequest({
      method: 'GET', path: `/__loom/api/source-asset/source-1?${query}`,
    })).resolves.toMatchObject({ dataUrl: 'data:video/mp4;base64,QUJD' });
    expect(getSourceAssetSample).toHaveBeenCalledWith('source-1', {
      maxBytes: 256, sampleBytes: 64, transportIdentity: 'sha256:source-identity',
    });
    expect(getSourceAsset).toHaveBeenCalledWith('source-1', {
      maxBytes: 256, sampleBytes: 64, transportIdentity: 'sha256:source-identity',
    });
  });

  it('accepts a project-channel asset inventory before the content-addressed uploads', async () => {
    const base = '/__loom/api/project/paper';
    await expect(resolveLanRequest({
      method: 'PUT',
      path: `${base}/assets`,
      body: JSON.stringify({ assetIds: ['sha256:one', 'sha256:two'] }),
    })).resolves.toEqual({ ok: true });
    await expect(resolveLanRequest({
      method: 'PUT',
      path: `${base}/asset/sha256%3Aone`,
      body: JSON.stringify({ asset: 'data:application/octet-stream;base64,AQ==' }),
    })).resolves.toEqual({ ok: true });
    await expect(resolveLanRequest({
      method: 'GET', path: `${base}/asset/sha256%3Aone`,
    })).resolves.toEqual({ asset: 'data:application/octet-stream;base64,AQ==' });

    await expect(resolveLanRequest({
      method: 'PUT', path: `${base}/assets`, body: JSON.stringify({ assetIds: ['ok', 2] }),
    })).resolves.toMatchObject({ ok: false });
  });
});

describe('androidLanServer — baton write-gate', () => {
  const BASE = '/__loom/api';
  const DESKTOP = { id: 'desktop-1', label: 'Desktop browser' };
  const PHONE = { id: '__loom_host__', label: 'Phone' };
  let applied: unknown[] = [];

  function registerCaptureChannel(id = 'flow'): void {
    applied = [];
    const channel: ProjectSyncChannel<unknown> = {
      id,
      applyRemote(change) {
        applied.push(change);
        return true;
      },
      snapshot: () => null,
    };
    registerProjectSyncChannel(channel);
  }

  function mutate(channel: string, change: unknown, deviceId?: string): Promise<unknown> {
    const query = deviceId ? `?device=${encodeURIComponent(deviceId)}` : '';
    return resolveLanRequest({
      method: 'POST',
      path: `${BASE}/project/${channel}/mutate${query}`,
      body: JSON.stringify(change),
    });
  }

  afterEach(() => {
    resetEditLock();
    resetProjectSyncLog();
    clearProjectSyncChannels();
  });

  it('applies a mutate when the baton is unmanaged (no holder)', async () => {
    registerCaptureChannel();
    const res = (await mutate('flow', { op: 1 }, DESKTOP.id)) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(applied).toEqual([{ op: 1 }]);
  });

  it('applies a mutate from the device that holds the baton', async () => {
    registerCaptureChannel();
    claimLock(DESKTOP);
    const res = (await mutate('flow', { op: 2 }, DESKTOP.id)) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(applied).toEqual([{ op: 2 }]);
  });

  it('rejects a mutate from a device that does NOT hold the baton', async () => {
    registerCaptureChannel();
    claimLock(PHONE); // phone holds; desktop is read-only
    const res = (await mutate('flow', { op: 3 }, DESKTOP.id)) as { ok: boolean; error: string };
    expect(res.ok).toBe(false);
    expect(res.error).toBe('edit-locked');
    expect(applied).toEqual([]); // the op never reached the channel
  });

  it('rejects a mutate with no device id while the baton is held', async () => {
    registerCaptureChannel();
    claimLock(PHONE);
    const res = (await mutate('flow', { op: 4 })) as { ok: boolean; error: string };
    expect(res.ok).toBe(false);
    expect(res.error).toBe('edit-locked');
    expect(applied).toEqual([]);
  });

  it('echoes the live baton state on a rejection so the client can reconcile', async () => {
    registerCaptureChannel();
    claimLock(PHONE);
    const res = (await mutate('flow', { op: 5 }, DESKTOP.id)) as { state: { holder: { id: string } | null } };
    expect(res.state.holder?.id).toBe(PHONE.id);
    expect(res.state).toEqual(getEditLockState());
  });
});
