import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileNameFromUri, readOpenedUriBytes } from './androidFileOpen';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (uri: string) => `https://localhost/_capacitor_content_/${encodeURIComponent(uri)}`,
    isNativePlatform: () => true,
  },
}));
vi.mock('@capacitor/app', () => ({ App: { getLaunchUrl: vi.fn(), addListener: vi.fn() } }));

describe('fileNameFromUri', () => {
  it('reads a plain file:// name', () => {
    expect(fileNameFromUri('file:///storage/emulated/0/Download/Test1.slimg')).toBe('Test1.slimg');
  });

  it('decodes a document-provider content URI (colon + slash encoded)', () => {
    expect(
      fileNameFromUri(
        'content://com.android.providers.downloads.documents/document/primary%3ADownload%2FMy%20Zine.slppr',
      ),
    ).toBe('My Zine.slppr');
  });

  it('strips query and fragment', () => {
    expect(fileNameFromUri('content://x/y/Scene.sloom?take=1#frag')).toBe('Scene.sloom');
  });

  it('falls back to a generic name when no usable segment exists', () => {
    expect(fileNameFromUri('content://authority/123/')).toBe('opened-file');
  });
});

describe('readOpenedUriBytes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads bytes through the unpatched WebView fetch (not the CapacitorHttp-patched one)', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]);
    const webFetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
    vi.stubGlobal('CapacitorWebFetch', webFetch);
    vi.stubGlobal('fetch', vi.fn()); // patched fetch must NOT be used

    const out = await readOpenedUriBytes('content://x/Test.slimg');

    expect(webFetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('throws a clear error when the proxy read fails', async () => {
    vi.stubGlobal('CapacitorWebFetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(readOpenedUriBytes('content://x/Bad.slimg')).rejects.toThrow('HTTP 404');
  });
});
