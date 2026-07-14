// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryPaperAssetRepository } from '../../features/paper/assets/PaperAssetRepository';
import { createOpenFontCatalogClient, type OpenFontLibraryFace } from '../../lib/paperOpenFontCatalog';
import { FontLibrarySection } from './FontLibrarySection';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('FontLibrarySection', () => {
  it('browses and downloads an open font only after explicit user actions', async () => {
    const fontBytes = readFileSync(resolve(process.cwd(), 'public/fonts/liberation/LiberationSans-Regular.ttf'));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.fontsource.org/v1/fonts') {
        return jsonResponse([{ id: 'liberation-sans', family: 'Liberation Sans', subsets: ['latin'], weights: [400], styles: ['normal'], defSubset: 'latin' }]);
      }
      if (url === 'https://api.fontsource.org/v1/fonts/liberation-sans') {
        return jsonResponse({ id: 'liberation-sans', family: 'Liberation Sans', subsets: ['latin'], weights: [400], styles: ['normal'], defSubset: 'latin' });
      }
      if (url === 'https://api.fontsource.org/v1/version/liberation-sans') return jsonResponse({ version: '1.2.3' });
      if (url.endsWith('/metadata.json')) return jsonResponse({ license: 'OFL-1.1', attribution: 'Liberation Fonts' });
      if (url.endsWith('/LICENSE')) return new Response('SIL OPEN FONT LICENSE Version 1.1\n', { status: 200 });
      if (url.endsWith('.ttf')) return new Response(fontBytes, { status: 200, headers: { 'content-type': 'font/ttf' } });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    const catalog = createOpenFontCatalogClient({ fetchImpl });
    const repository = new MemoryPaperAssetRepository();
    const host = document.createElement('div');
    const root: Root = createRoot(host);

    function Harness() {
      const [library, setLibrary] = useState<OpenFontLibraryFace[]>([]);
      return <FontLibrarySection catalog={catalog} library={library} onInstall={(face) => setLibrary((current) => [...current, face])} repository={repository} />;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[name="browse-open-fonts"]')?.click();
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.fontsource.org/v1/fonts', expect.any(Object));
    expect(host.textContent).toContain('Liberation Sans');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[name="select-open-font-liberation-sans"]')?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[name="download-open-font-liberation-sans-400-normal"]')?.click();
    });

    await vi.waitFor(() => expect(host.textContent).toContain('Available offline'));
    expect(await repository.listRefs()).toHaveLength(2);
    await act(async () => root.unmount());
  });
});
