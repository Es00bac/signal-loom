import {
  createBinaryAssetRecord,
  isBinaryAssetRef,
  type BinaryAssetId,
  type BinaryAssetRef,
} from '../../../shared/assets/contentAddressedAsset';
import type {
  PaperDocument,
  PaperFrame,
  PaperFrameAsset,
  PaperImportedFont,
  PaperPage,
} from '../../../types/paper';
import type { PaperAssetRepository } from './PaperAssetRepository';

export interface ManagedPaperAssetLocator {
  kind: 'managed';
  ref: BinaryAssetRef;
}

export interface ExternalPaperAssetLocator {
  kind: 'external';
  url: string;
}

export type PaperAssetLocator = ManagedPaperAssetLocator | ExternalPaperAssetLocator;

export type ManagedPaperFrameAsset = Omit<PaperFrameAsset, 'src'> & {
  src?: string;
  locator?: PaperAssetLocator;
};

export type ManagedPaperFrame = Omit<PaperFrame, 'asset'> & {
  asset?: ManagedPaperFrameAsset;
};

export type ManagedPaperPage = Omit<PaperPage, 'frames'> & {
  frames: ManagedPaperFrame[];
};

export type ManagedPaperImportedFont = Omit<PaperImportedFont, 'dataBase64'> & {
  dataBase64?: never;
  assetRef: BinaryAssetRef;
};

export type PaperDocumentWithManagedAssets = Omit<PaperDocument, 'pages' | 'importedFonts'> & {
  pages: ManagedPaperPage[];
  importedFonts?: ManagedPaperImportedFont[];
};

interface LegacySlpprAssetRef {
  $slpprAsset: string;
  mime: string;
}

export interface LegacySlpprAssetPayload {
  bytes: Uint8Array;
  mimeType?: string;
}

export interface MigrateLegacyPaperBinaryOptions {
  legacySlpprAssets?: ReadonlyMap<string, LegacySlpprAssetPayload>;
}

function cloneDocument(document: PaperDocument): PaperDocumentWithManagedAssets {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(document) as unknown as PaperDocumentWithManagedAssets;
  }
  return JSON.parse(JSON.stringify(document)) as PaperDocumentWithManagedAssets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacySlpprAssetRef(value: unknown): value is LegacySlpprAssetRef {
  return isRecord(value)
    && typeof value.$slpprAsset === 'string'
    && value.$slpprAsset.length > 0
    && typeof value.mime === 'string'
    && value.mime.length > 0;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseDataUrl(value: string): { bytes: Uint8Array; mimeType: string } | undefined {
  if (!/^data:/i.test(value)) return undefined;
  const marker = ';base64,';
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 5) {
    throw new Error('Unsupported non-Base64 data URL in a Paper asset.');
  }
  const mimeType = value.slice(5, markerIndex).trim();
  if (!mimeType) {
    throw new Error('Paper asset Base64 data URL must declare a MIME type.');
  }
  return {
    bytes: decodeBase64(value.slice(markerIndex + marker.length)),
    mimeType,
  };
}

function fontMimeType(format: PaperImportedFont['format']): string {
  if (format === 'opentype-cff') return 'font/otf';
  if (format === 'truetype') return 'font/ttf';
  return 'font/sfnt';
}

function fontExtension(format: PaperImportedFont['format']): string {
  if (format === 'opentype-cff') return 'otf';
  if (format === 'truetype') return 'ttf';
  return 'ttc';
}

async function storePayload(
  repository: PaperAssetRepository,
  bytes: Uint8Array,
  metadata: { mimeType: string; fileName?: string },
): Promise<BinaryAssetRef> {
  const record = await createBinaryAssetRecord(bytes, metadata);
  return repository.put(record);
}

export function collectReachablePaperAssetIds(document: PaperDocument): BinaryAssetId[] {
  const managed = document as unknown as PaperDocumentWithManagedAssets;
  const ids = new Set<BinaryAssetId>();

  for (const page of managed.pages ?? []) {
    for (const frame of page.frames ?? []) {
      const locator = frame.asset?.locator;
      if (locator?.kind === 'managed' && isBinaryAssetRef(locator.ref)) {
        ids.add(locator.ref.id);
      }
    }
  }

  for (const font of managed.importedFonts ?? []) {
    if (isBinaryAssetRef(font.assetRef)) ids.add(font.assetRef.id);
  }

  return [...ids].sort();
}

export async function migrateLegacyPaperBinaryFields(
  document: PaperDocument,
  repository: PaperAssetRepository,
  options: MigrateLegacyPaperBinaryOptions = {},
): Promise<PaperDocument> {
  const migrated = cloneDocument(document);

  for (const page of migrated.pages ?? []) {
    for (const frame of page.frames ?? []) {
      const asset = frame.asset;
      if (!asset) continue;
      if (asset.locator?.kind === 'managed') {
        delete asset.src;
        continue;
      }

      const source = asset.src as unknown;
      let payload: LegacySlpprAssetPayload | undefined;
      if (typeof source === 'string') {
        payload = parseDataUrl(source);
      } else if (isLegacySlpprAssetRef(source)) {
        const legacy = options.legacySlpprAssets?.get(source.$slpprAsset);
        if (!legacy) {
          throw new Error(`Paper document is missing legacy asset ${source.$slpprAsset}.`);
        }
        payload = {
          bytes: new Uint8Array(legacy.bytes),
          mimeType: legacy.mimeType ?? source.mime,
        };
      }

      if (!payload) continue;
      const ref = await storePayload(repository, payload.bytes, {
        mimeType: payload.mimeType ?? asset.mimeType ?? 'application/octet-stream',
      });
      delete asset.src;
      asset.locator = { kind: 'managed', ref };
      asset.mimeType = asset.mimeType ?? ref.mimeType;
    }
  }

  if (Array.isArray(migrated.importedFonts)) {
    migrated.importedFonts = await Promise.all(migrated.importedFonts.map(async (font) => {
      const candidate = font as unknown as PaperImportedFont & { assetRef?: BinaryAssetRef };
      const { dataBase64, ...metadata } = candidate;
      if (candidate.assetRef && isBinaryAssetRef(candidate.assetRef)) {
        return { ...metadata, assetRef: candidate.assetRef } as ManagedPaperImportedFont;
      }
      if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
        throw new Error(`Paper imported font ${candidate.id || '<unknown>'} has no managed bytes.`);
      }
      const ref = await storePayload(repository, decodeBase64(dataBase64), {
        mimeType: fontMimeType(candidate.format),
        fileName: `${candidate.id || 'font'}.${fontExtension(candidate.format)}`,
      });
      return { ...metadata, assetRef: ref } as ManagedPaperImportedFont;
    }));
  }

  return migrated as unknown as PaperDocument;
}
