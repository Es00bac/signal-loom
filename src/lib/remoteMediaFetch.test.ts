import { describe, expect, it, vi } from 'vitest';
import { fetchRemoteMediaAsDataUrl } from './remoteMediaFetch';

const ATLAS_URL = 'https://atlas-media.oss-us-west-1.aliyuncs.com/flux/generated.png';

describe('fetchRemoteMediaAsDataUrl', () => {
  it('returns undefined for non-http(s) inputs', async () => {
    const result = await fetchRemoteMediaAsDataUrl('data:image/png;base64,AAAA', {});
    expect(result).toBeUndefined();
  });

  it('returns undefined when no native download path is available (plain web/dev)', async () => {
    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, {});
    expect(result).toBeUndefined();
  });

  it('inlines Android CapacitorHttp bytes as a data URL (bypasses CORS + force-download)', async () => {
    const get = vi.fn().mockResolvedValue({
      status: 200,
      data: 'iVBORw0KGgoAAAANSUhEUg',
      headers: { 'Content-Type': 'image/png; charset=utf-8' },
    });

    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, {
      isAndroidNative: true,
      capacitorHttp: { get },
    });

    expect(get).toHaveBeenCalledWith({ url: ATLAS_URL, responseType: 'blob' });
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
      mimeType: 'image/png',
    });
  });

  it('does not use CapacitorHttp when the platform is not Android-native', async () => {
    const get = vi.fn();
    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, {
      isAndroidNative: false,
      capacitorHttp: { get },
    });

    expect(get).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('inlines Electron main-process bytes as a data URL', async () => {
    const electronDownload = vi.fn().mockResolvedValue({ base64: 'QUJD', mimeType: 'image/webp' });

    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, { electronDownload });

    expect(electronDownload).toHaveBeenCalledWith(ATLAS_URL);
    expect(result).toEqual({ dataUrl: 'data:image/webp;base64,QUJD', mimeType: 'image/webp' });
  });

  it('falls through to CapacitorHttp when the Electron downloader reports an error', async () => {
    const electronDownload = vi.fn().mockResolvedValue({ error: 'HTTP 500' });
    const get = vi.fn().mockResolvedValue({
      status: 200,
      data: 'QkJC',
      headers: { 'content-type': 'image/jpeg' },
    });

    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, {
      electronDownload,
      isAndroidNative: true,
      capacitorHttp: { get },
    });

    expect(result).toEqual({ dataUrl: 'data:image/jpeg;base64,QkJC', mimeType: 'image/jpeg' });
  });

  it('returns undefined when CapacitorHttp throws', async () => {
    const get = vi.fn().mockRejectedValue(new Error('native failure'));
    const result = await fetchRemoteMediaAsDataUrl(ATLAS_URL, {
      isAndroidNative: true,
      capacitorHttp: { get },
    });

    expect(result).toBeUndefined();
  });
});
