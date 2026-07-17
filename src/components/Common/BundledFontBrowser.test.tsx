// @vitest-environment jsdom

import { act } from 'react';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundledFontCatalog } from '../../lib/bundledFontLibrary';
import { BundledFontBrowser } from './BundledFontBrowser';

const testFontBytes = readFileSync(resolve(process.cwd(), 'public/fonts/liberation/LiberationSans-Regular.ttf'));
const testFontSha256 = 'baccc64becc3eb7d104b7c84d99f5314a0a1f896e2b3ea6c2f22fc08d2003bee';

const catalog: BundledFontCatalog = {
  schemaVersion: 1,
  familyCount: 2,
  faceCount: 2,
  families: [
    {
      id: 'base:editorial', family: 'Editorial Serif', slug: 'editorial', collection: 'base', role: 'serif',
      sourceUrl: 'https://example.test', sourceVersion: '1', licenseId: 'OFL-1.1', licenseFile: 'licenses/editorial.txt',
      licenseSha256: 'a'.repeat(64), licenseByteLength: 1, warnings: [],
      faces: [{ id: 'editorial:regular', file: 'collection/base/editorial/Regular.ttf', collectionIndex: 0, sha256: testFontSha256, byteLength: testFontBytes.byteLength, family: 'Editorial Serif', subfamily: 'Regular', fullName: 'Editorial Serif Regular', postscriptName: 'EditorialSerif-Regular', version: '1', weight: 400, style: 'normal', stretchPercent: 100, glyphCount: 100, variable: false, axes: {}, canSubset: true, hasVerticalSubstitution: false }],
    },
    {
      id: 'base:tokyo', family: 'Liberation Sans', slug: 'tokyo', collection: 'base', role: 'japanese',
      sourceUrl: 'https://example.test', sourceVersion: '1', licenseId: 'OFL-1.1', licenseFile: 'licenses/tokyo.txt',
      licenseSha256: 'c'.repeat(64), licenseByteLength: 1, warnings: [],
      faces: [{ id: 'tokyo:regular', file: 'collection/base/tokyo/Regular.ttf', collectionIndex: 0, sha256: testFontSha256, byteLength: testFontBytes.byteLength, family: 'Liberation Sans', subfamily: 'Tokyo Regular', fullName: 'Liberation Sans Tokyo Regular', postscriptName: 'LiberationSans-Regular', version: '1', weight: 400, style: 'normal', stretchPercent: 100, glyphCount: 1000, variable: false, axes: {}, canSubset: true, hasVerticalSubstitution: true }],
    },
  ],
};

function stubCompleteNativeBridge(): void {
  window.signalLoomNative = {
    getNativeState: vi.fn(),
    onMenuCommand: vi.fn(),
    bundledFontLibraryStatus: vi.fn(async () => ({ available: true })),
  } as never;
}

function stubNativeBridgeWithStatus(status: () => Promise<{ available: boolean }>): ReturnType<typeof vi.fn> {
  const bundledFontLibraryStatus = vi.fn(status);
  window.signalLoomNative = {
    getNativeState: vi.fn(),
    onMenuCommand: vi.fn(),
    bundledFontLibraryStatus,
  } as never;
  return bundledFontLibraryStatus;
}

/** Flushes the async main-process capability round trip the shared hook awaits on mount. */
async function waitForBrowserToggle(host: HTMLElement): Promise<HTMLButtonElement> {
  await act(async () => {
    await vi.waitFor(() => expect(host.querySelector('button[aria-expanded]')).not.toBeNull());
  });
  return host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
}

/** Flushes the same round trip when it's expected to resolve to "unavailable" (nothing appears). */
async function flushPendingCapabilityQuery(): Promise<void> {
  await act(async () => {
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(testFontBytes)));
  vi.stubGlobal('FontFace', class {
    async load() { return this; }
  });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
  // The Electron main process registers signal-loom-font:// alongside this same preload
  // bridge (electron/main.mjs installProtocolHandlers + electron/preload.cjs); these tests
  // exercise the complete-bridge (desktop) path by default. Platform-gate tests below stub
  // an absent/malformed bridge explicitly.
  stubCompleteNativeBridge();
});

afterEach(() => {
  delete window.signalLoomNative;
  vi.unstubAllGlobals();
});

describe('BundledFontBrowser', () => {
  it('searches, previews, and selects an exact bundled face', async () => {
    const onSelect = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<BundledFontBrowser catalog={catalog} onSelect={onSelect} value="Current Font" weight={400} style="normal" />));

    const toggle = await waitForBrowserToggle(host);
    await act(async () => toggle.click());
    const search = host.querySelector<HTMLInputElement>('input[role="searchbox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'Tokyo');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('Editorial Serif');
    const tokyo = host.querySelector<HTMLButtonElement>('button[aria-label*="Tokyo Regular"]')!;
    expect(tokyo.style.fontFamily).toBe('"Liberation Sans"');
    await act(async () => tokyo.click());

    await act(async () => {
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(catalog.families[1], catalog.families[1].faces[0]));
    });
    await act(async () => root.unmount());
  });

  it('filters by publishing role and exposes collection/embedding context', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<BundledFontBrowser catalog={catalog} onSelect={vi.fn()} value="" weight={400} style="normal" />));
    const toggle = await waitForBrowserToggle(host);
    await act(async () => toggle.click());
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Font role"]')!;
    await act(async () => {
      select.value = 'serif';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.textContent).toContain('Editorial Serif');
    expect(host.textContent).not.toContain('Tokyo Gothic');
    expect(host.textContent).toMatch(/2 families.*2 faces/i);
    expect(host.textContent).toMatch(/Exact face.*PDF/i);
    await act(async () => root.unmount());
  });
});

describe('BundledFontBrowser platform capability gate (FBL-025)', () => {
  it('renders nothing actionable and issues zero signal-loom-font fetches without a native bridge', async () => {
    delete window.signalLoomNative;
    const fetchSpy = vi.fn(async () => new Response(testFontBytes));
    vi.stubGlobal('fetch', fetchSpy);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} initiallyOpen onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));

    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('fails closed with an old complete generic bridge that lacks the dedicated transport', async () => {
    // Older Electron preload code can expose all former generic methods but cannot prove that
    // this main process has a usable signal-loom-font root.
    window.signalLoomNative = { getNativeState: vi.fn(), onMenuCommand: vi.fn() } as never;
    const fetchSpy = vi.fn(async () => new Response(testFontBytes));
    vi.stubGlobal('fetch', fetchSpy);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} initiallyOpen onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    await flushPendingCapabilityQuery();

    expect(host.querySelector('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('fails closed with a complete generic bridge whose dedicated transport reports no root', async () => {
    // This is the packaged-but-font-pack-missing state: the ordinary Electron bridge is complete,
    // but every signal-loom-font request would 404. It must not advertise or fetch the library.
    const status = stubNativeBridgeWithStatus(async () => ({ available: false }));
    const fetchSpy = vi.fn(async () => new Response(testFontBytes));
    vi.stubGlobal('fetch', fetchSpy);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} initiallyOpen onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    await flushPendingCapabilityQuery();

    expect(host.querySelector('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('renders nothing and fetches nothing while the dedicated capability query is pending', async () => {
    let resolveStatus: ((status: { available: boolean }) => void) | undefined;
    const status = stubNativeBridgeWithStatus(() => new Promise((resolve) => { resolveStatus = resolve; }));
    const fetchSpy = vi.fn(async () => new Response(testFontBytes));
    vi.stubGlobal('fetch', fetchSpy);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} initiallyOpen onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    await flushPendingCapabilityQuery();

    expect(host.querySelector('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledTimes(1);

    await act(async () => resolveStatus?.({ available: true }));
    expect(await waitForBrowserToggle(host)).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('fails closed when the dedicated capability transport rejects', async () => {
    const status = stubNativeBridgeWithStatus(async () => { throw new Error('IPC disconnected'); });
    const fetchSpy = vi.fn(async () => new Response(testFontBytes));
    vi.stubGlobal('fetch', fetchSpy);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} initiallyOpen onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    await flushPendingCapabilityQuery();

    expect(host.querySelector('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('fails closed immediately on bridge replacement and re-queries after remount', async () => {
    const firstStatus = stubNativeBridgeWithStatus(async () => ({ available: true }));
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    expect(await waitForBrowserToggle(host)).not.toBeNull();
    expect(firstStatus).toHaveBeenCalledTimes(1);

    const replacementStatus = stubNativeBridgeWithStatus(async () => ({ available: false }));
    await act(async () => root.render(
      <BundledFontBrowser catalog={catalog} onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    // A rerender that sees a new bridge may not replay the old bridge's positive capability.
    expect(host.querySelector('button')).toBeNull();
    await flushPendingCapabilityQuery();
    expect(host.querySelector('button')).toBeNull();
    expect(replacementStatus).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());

    const remountStatus = stubNativeBridgeWithStatus(async () => ({ available: true }));
    const remountedRoot = createRoot(host);
    await act(async () => remountedRoot.render(
      <BundledFontBrowser catalog={catalog} onSelect={vi.fn()} style="normal" value="" weight={400} />,
    ));
    expect(await waitForBrowserToggle(host)).not.toBeNull();
    expect(remountStatus).toHaveBeenCalledTimes(1);
    await act(async () => remountedRoot.unmount());
  });

  it('loads the audited catalog over signal-loom-font:// with a complete Electron bridge', async () => {
    stubCompleteNativeBridge();
    const inventoryResponse = {
      schemaVersion: 1,
      catalogFamilyCount: 1,
      faceCount: 1,
      criticalErrorCount: 0,
      families: [{
        collection: 'base',
        family: 'Liberation Sans',
        slug: 'liberationsans',
        source: { url: 'https://example.test', commit: '1' },
        licenses: [{ file: 'licenses/liberationsans.txt', spdx: 'OFL-1.1', sha256: 'a'.repeat(64), byteLength: 1 }],
        faces: [{
          file: 'collection/base/liberationsans/Regular.ttf',
          collectionIndex: 0,
          sha256: testFontSha256,
          byteLength: testFontBytes.byteLength,
          family: 'Liberation Sans',
          subfamily: 'Regular',
          fullName: 'Liberation Sans Regular',
          postscriptName: 'LiberationSans-Regular',
          version: '1',
          weight: 400,
          stretchPercent: 100,
          glyphCount: 100,
          variable: false,
          axes: [],
          hasVerticalSubstitution: false,
        }],
        warnings: [],
      }],
    };
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('signal-loom-font://library/inventory/font-inventory.json')) {
        return new Response(JSON.stringify(inventoryResponse), { status: 200 });
      }
      return new Response(testFontBytes);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const onSelect = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(<BundledFontBrowser onSelect={onSelect} value="" weight={400} style="normal" />));
    const toggle = await waitForBrowserToggle(host);
    await act(async () => toggle.click());
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain('Liberation Sans'));
    });

    expect(fetchSpy).toHaveBeenCalledWith('signal-loom-font://library/inventory/font-inventory.json', expect.any(Object));
    const face = host.querySelector<HTMLButtonElement>('button[aria-label*="Liberation Sans"]')!;
    await act(async () => face.click());
    await act(async () => {
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalled());
    });

    await act(async () => root.unmount());
  });
});
