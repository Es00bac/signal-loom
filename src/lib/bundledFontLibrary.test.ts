import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MemoryPaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import {
  bundledFontResourceUrl,
  bundledFontFaceCssDescriptor,
  installBundledPaperFontFace,
  parseBundledFontInventory,
  selectBundledFontFace,
} from './bundledFontLibrary';

function sampleInventory() {
  return {
    schemaVersion: 1,
    catalogFamilyCount: 1,
    faceCount: 2,
    criticalErrorCount: 0,
    families: [{
      collection: 'base',
      family: 'Liberation Sans',
      slug: 'liberationsans',
      source: { url: 'https://example.test/liberation', commit: 'release-2.1.5' },
      licenses: [{
        file: 'collection/base/liberationsans/LICENSE',
        spdx: 'OFL-1.1',
        sha256: '93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b',
        byteLength: 4414,
      }],
      faces: [
        {
          file: 'collection/base/liberationsans/LiberationSans-Regular.ttf',
          collectionIndex: 0,
          sha256: 'baccc64becc3eb7d104b7c84d99f5314a0a1f896e2b3ea6c2f22fc08d2003bee',
          byteLength: 410820,
          family: 'Liberation Sans',
          subfamily: 'Regular',
          fullName: 'Liberation Sans Regular',
          postscriptName: 'LiberationSans-Regular',
          version: 'Version 2.1.5',
          weight: 400,
          glyphCount: 2327,
          variable: false,
          axes: [],
          fsType: 0,
          restrictedEmbedding: false,
          noSubsetting: false,
          bitmapEmbeddingOnly: false,
          hasVerticalSubstitution: false,
        },
        {
          file: 'collection/base/liberationsans/LiberationSans-BoldItalic.ttf',
          collectionIndex: 0,
          sha256: 'b'.repeat(64),
          byteLength: 1,
          family: 'Liberation Sans',
          subfamily: 'Bold Italic',
          fullName: 'Liberation Sans Bold Italic',
          postscriptName: 'LiberationSans-BoldItalic',
          version: 'Version 2.1.5',
          weight: 700,
          glyphCount: 2327,
          variable: false,
          axes: [],
          fsType: 0,
          restrictedEmbedding: false,
          noSubsetting: false,
          bitmapEmbeddingOnly: false,
          hasVerticalSubstitution: false,
        },
      ],
      errors: [],
      warnings: [],
    }],
  };
}

describe('bundled font library', () => {
  it('parses audited family/face metadata and exposes exact face choices', () => {
    const catalog = parseBundledFontInventory(sampleInventory());
    const family = catalog.families[0];

    expect(catalog).toMatchObject({ familyCount: 1, faceCount: 2 });
    expect(family).toMatchObject({ family: 'Liberation Sans', collection: 'base', licenseId: 'OFL-1.1' });
    expect(family.faces).toEqual(expect.arrayContaining([
      expect.objectContaining({ weight: 400, style: 'normal', variable: false }),
      expect.objectContaining({ weight: 700, style: 'italic', variable: false }),
    ]));
    expect(selectBundledFontFace(family, 700, 'italic')).toMatchObject({ weight: 700, style: 'italic' });
    expect(selectBundledFontFace(family, 600, 'normal')).toMatchObject({ weight: 400, style: 'normal' });
    expect(bundledFontResourceUrl(family.faces[0].file)).toBe(
      'signal-loom-font://library/collection/base/liberationsans/LiberationSans-Regular.ttf',
    );
    expect(bundledFontFaceCssDescriptor(family.faces[0])).toEqual({ weight: '400', style: 'normal' });
  });

  it('rejects an inventory with critical audit errors or unsafe resource paths', () => {
    expect(() => parseBundledFontInventory({ ...sampleInventory(), criticalErrorCount: 1 })).toThrow(/critical/i);
    const unsafe = sampleInventory();
    unsafe.families[0].faces[0].file = '../outside.ttf';
    expect(() => parseBundledFontInventory(unsafe)).toThrow(/path/i);
  });

  it('pins exact bundled bytes and license evidence into a Paper document repository', async () => {
    const catalog = parseBundledFontInventory(sampleInventory());
    const family = catalog.families[0];
    const face = family.faces[0];
    const fontBytes = readFileSync(resolve(process.cwd(), 'public/fonts/liberation/LiberationSans-Regular.ttf'));
    const licenseText = readFileSync(resolve(process.cwd(), 'public/fonts/liberation/LICENSE'));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('LiberationSans-Regular.ttf')) return new Response(fontBytes);
      if (url.endsWith('/LICENSE')) return new Response(licenseText);
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    const repository = new MemoryPaperAssetRepository();

    const installed = await installBundledPaperFontFace({ family, face, repository, fetchImpl });

    expect(installed).toMatchObject({
      familyId: 'liberation sans',
      familyName: 'Liberation Sans',
      postscriptName: 'LiberationSans-Regular',
      weight: 400,
      style: 'normal',
      source: { kind: 'bundled', version: 'release-2.1.5' },
      license: { id: 'OFL-1.1' },
    });
    expect(installed.fontAsset.sha256).toBe(face.sha256);
    expect(installed.license.textAsset).toBeDefined();
    expect(await repository.listRefs()).toHaveLength(2);
  });
});
