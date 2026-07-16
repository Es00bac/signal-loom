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
      id: 'base:tokyo', family: 'Tokyo Gothic', slug: 'tokyo', collection: 'base', role: 'japanese',
      sourceUrl: 'https://example.test', sourceVersion: '1', licenseId: 'OFL-1.1', licenseFile: 'licenses/tokyo.txt',
      licenseSha256: 'c'.repeat(64), licenseByteLength: 1, warnings: [],
      faces: [{ id: 'tokyo:regular', file: 'collection/base/tokyo/Regular.ttf', collectionIndex: 0, sha256: testFontSha256, byteLength: testFontBytes.byteLength, family: 'Tokyo Gothic', subfamily: 'Regular', fullName: 'Tokyo Gothic Regular', postscriptName: 'TokyoGothic-Regular', version: '1', weight: 400, style: 'normal', stretchPercent: 100, glyphCount: 1000, variable: false, axes: {}, canSubset: true, hasVerticalSubstitution: true }],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(testFontBytes)));
  vi.stubGlobal('FontFace', class {
    async load() { return this; }
  });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BundledFontBrowser', () => {
  it('searches, previews, and selects an exact bundled face', async () => {
    const onSelect = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<BundledFontBrowser catalog={catalog} onSelect={onSelect} value="Current Font" weight={400} style="normal" />));

    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click());
    const search = host.querySelector<HTMLInputElement>('input[role="searchbox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'Tokyo');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('Editorial Serif');
    const tokyo = host.querySelector<HTMLButtonElement>('button[aria-label^="Tokyo Gothic"]')!;
    expect(tokyo.style.fontFamily).toBe('"Tokyo Gothic"');
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
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click());
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
