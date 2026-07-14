import { describe, expect, it } from 'vitest';
import { createBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import type { PaperDocument } from '../../../types/paper';
import { MemoryPaperAssetRepository } from './PaperAssetRepository';
import {
  collectReachablePaperAssetIds,
  storePaperDataUrlAsset,
  migrateLegacyPaperBinaryFields,
  type PaperDocumentWithManagedAssets,
} from './PaperDocumentAssets';

describe('Paper document assets', () => {
  it('collects unique managed asset ids in deterministic order', async () => {
    const first = await createBinaryAssetRecord(new Uint8Array([1]), { mimeType: 'image/png' });
    const second = await createBinaryAssetRecord(new Uint8Array([2]), { mimeType: 'font/ttf' });
    const parentAsset = await createBinaryAssetRecord(new Uint8Array([3]), { mimeType: 'image/jpeg' });
    const document = {
      id: 'paper-1',
      pages: [{
        frames: [
          { asset: { locator: { kind: 'managed', ref: second.ref } } },
          { asset: { locator: { kind: 'managed', ref: first.ref } } },
          { asset: { locator: { kind: 'managed', ref: second.ref } } },
          { asset: { locator: { kind: 'external', url: 'https://example.test/panel.png' } } },
        ],
      }],
      parentPages: [{
        frames: [{ asset: { locator: { kind: 'managed', ref: parentAsset.ref } } }],
      }],
      importedFonts: [{ assetRef: first.ref }],
    } as unknown as PaperDocument;

    expect(collectReachablePaperAssetIds(document)).toEqual([first.ref.id, second.ref.id, parentAsset.ref.id].sort());
  });

  it('migrates duplicate legacy image payloads and imported-font Base64 to repository records', async () => {
    const repository = new MemoryPaperAssetRepository();
    const legacy = {
      id: 'legacy-paper',
      pages: [{
        frames: [
          { asset: { label: 'First', kind: 'image', src: 'data:image/png;base64,AQID' } },
          { asset: { label: 'Second', kind: 'image', src: 'data:image/png;base64,AQID' } },
        ],
      }],
      importedFonts: [{
        id: 'font-1',
        familyName: 'Legacy Sans',
        bold: false,
        italic: false,
        format: 'truetype',
        embeddable: true,
        canSubset: true,
        dataBase64: 'BAUG',
      }],
    } as unknown as PaperDocument;

    const migrated = await migrateLegacyPaperBinaryFields(legacy, repository);
    const managed = migrated as PaperDocumentWithManagedAssets;
    const records = await repository.listRefs();

    expect(migrated).not.toBe(legacy);
    expect(JSON.stringify(legacy)).toContain('dataBase64');
    expect(JSON.stringify(migrated)).not.toMatch(/data:|dataBase64|AQID|BAUG/);
    expect(records).toHaveLength(2);
    expect(managed.pages[0]?.frames[0]?.asset?.locator).toEqual(
      managed.pages[0]?.frames[1]?.asset?.locator,
    );
    expect(managed.importedFonts?.[0]).toMatchObject({
      id: 'font-1',
      assetRef: expect.objectContaining({ id: expect.stringMatching(/^sha256:/) }),
    });
  });

  it('strips an obsolete inline source when a frame already has a managed reference', async () => {
    const repository = new MemoryPaperAssetRepository();
    const record = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    await repository.put(record);
    const document = {
      id: 'partially-migrated-paper',
      pages: [{
        frames: [{
          asset: {
            src: 'data:image/png;base64,AQID',
            locator: { kind: 'managed', ref: record.ref },
          },
        }],
      }],
    } as unknown as PaperDocument;

    const migrated = await migrateLegacyPaperBinaryFields(document, repository);
    const managed = migrated as PaperDocumentWithManagedAssets;

    expect(JSON.stringify(migrated)).not.toMatch(/data:|AQID/);
    expect(managed.pages[0]?.frames[0]?.asset?.locator).toEqual({ kind: 'managed', ref: record.ref });
  });

  it('strips obsolete Base64 when an imported font already has a managed reference', async () => {
    const repository = new MemoryPaperAssetRepository();
    const record = await createBinaryAssetRecord(new Uint8Array([4, 5, 6]), { mimeType: 'font/ttf' });
    await repository.put(record);
    const document = {
      id: 'partially-migrated-font',
      pages: [],
      importedFonts: [{
        id: 'font-1',
        format: 'truetype',
        dataBase64: 'BAUG',
        assetRef: record.ref,
      }],
    } as unknown as PaperDocument;

    const migrated = await migrateLegacyPaperBinaryFields(document, repository);
    const managed = migrated as PaperDocumentWithManagedAssets;

    expect(JSON.stringify(migrated)).not.toMatch(/dataBase64|BAUG/);
    expect(managed.importedFonts?.[0]).toMatchObject({ id: 'font-1', assetRef: record.ref });
  });

  it('migrates a URL-encoded legacy data URL into a managed record', async () => {
    const document = {
      id: 'unsupported-data-url',
      pages: [{
        frames: [{ asset: { src: 'data:image/svg+xml,%3Csvg%20/%3E' } }],
      }],
    } as unknown as PaperDocument;
    const repository = new MemoryPaperAssetRepository();

    const migrated = await migrateLegacyPaperBinaryFields(document, repository);
    const asset = migrated.pages[0]?.frames[0]?.asset;

    expect(asset?.locator).toMatchObject({ kind: 'managed', ref: { mimeType: 'image/svg+xml' } });
    expect(JSON.stringify(migrated)).not.toMatch(/data:image|%3Csvg/);
    const ref = asset?.locator?.kind === 'managed' ? asset.locator.ref : undefined;
    expect(ref && await repository.get(ref.id)).toEqual(expect.objectContaining({
      bytes: new TextEncoder().encode('<svg />'),
    }));
  });

  it('converts a legacy durable URL to an external locator while removing src', async () => {
    const document = {
      id: 'legacy-external-url',
      pages: [{
        frames: [{ asset: { src: 'https://cdn.example.test/panel.png', label: 'Panel', kind: 'image' } }],
      }],
    } as unknown as PaperDocument;

    const migrated = await migrateLegacyPaperBinaryFields(document, new MemoryPaperAssetRepository());

    expect(migrated.pages[0]?.frames[0]?.asset?.locator).toEqual({
      kind: 'external',
      url: 'https://cdn.example.test/panel.png',
    });
    expect(JSON.stringify(migrated)).not.toContain('"src"');
  });

  it('stores a legacy Base64 data URL as a managed record', async () => {
    const repository = new MemoryPaperAssetRepository();

    const ref = await storePaperDataUrlAsset(repository, 'data:image/png;base64,AQID', 'panel.png');

    expect(ref).toMatchObject({ mimeType: 'image/png', byteLength: 3, fileName: 'panel.png' });
    await expect(repository.get(ref.id)).resolves.toEqual(expect.objectContaining({ bytes: new Uint8Array([1, 2, 3]) }));
  });
});
