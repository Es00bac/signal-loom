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
  PaperManagedAssetLocator,
  PaperPage,
} from '../../../types/paper';
import type { PaperAssetRepository } from './PaperAssetRepository';

export type ManagedPaperAssetLocator = PaperManagedAssetLocator;
export type PaperAssetLocator = PaperManagedAssetLocator;
export type ManagedPaperFrameAsset = PaperFrameAsset;
export type ManagedPaperFrame = PaperFrame;
export type ManagedPaperPage = PaperPage;
export type ManagedPaperImportedFont = PaperImportedFont;
export type PaperDocumentWithManagedAssets = PaperDocument;

type LegacyPaperFrameAsset = PaperFrameAsset & { src?: unknown };
type LegacyPaperImportedFont = Omit<PaperImportedFont, 'assetRef'> & {
  assetRef?: BinaryAssetRef;
  dataBase64?: unknown;
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
  const match = /^data:([^,]*),(.*)$/is.exec(value);
  if (!match) throw new Error('Malformed Paper asset data URL.');
  const metadata = match[1].trim();
  const mimeType = metadata.split(';', 1)[0]?.trim();
  if (!mimeType) {
    throw new Error('Paper asset data URL must declare a MIME type.');
  }
  const payload = match[2];
  const isBase64 = metadata.split(';').some((part) => part.trim().toLowerCase() === 'base64');
  return {
    bytes: isBase64 ? decodeBase64(payload) : new TextEncoder().encode(decodeURIComponent(payload)),
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

/** Converts a legacy inline payload at an import boundary into a managed binary reference. */
export async function storePaperBinaryAsset(
  repository: PaperAssetRepository,
  bytes: Uint8Array,
  metadata: { mimeType: string; fileName?: string },
): Promise<BinaryAssetRef> {
  return storePayload(repository, bytes, metadata);
}

export async function storePaperDataUrlAsset(
  repository: PaperAssetRepository,
  dataUrl: string,
  fileName?: string,
): Promise<BinaryAssetRef> {
  const payload = parseDataUrl(dataUrl);
  if (!payload) {
    throw new Error('Paper asset import requires a data URL.');
  }
  return storePaperBinaryAsset(repository, payload.bytes, { mimeType: payload.mimeType, fileName });
}

export function collectReachablePaperAssetIds(document: PaperDocument): BinaryAssetId[] {
  const managed = document as unknown as PaperDocumentWithManagedAssets;
  const ids = new Set<BinaryAssetId>();

  for (const page of [...(managed.pages ?? []), ...(managed.parentPages ?? [])]) {
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

  for (const page of [...(migrated.pages ?? []), ...(migrated.parentPages ?? [])]) {
    for (const frame of page.frames ?? []) {
      const asset = frame.asset as LegacyPaperFrameAsset | undefined;
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

      if (!payload) {
        delete asset.src;
        if (typeof source === 'string' && source.trim()) {
          if (/^blob:/i.test(source)) {
            throw new Error(`Paper asset ${asset.label || '<unknown>'} uses an expired legacy object URL.`);
          }
          asset.locator = { kind: 'external', url: source };
        } else if (source !== undefined) {
          throw new Error(`Paper asset ${asset.label || '<unknown>'} has an unsupported legacy source.`);
        }
        continue;
      }
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
      const candidate = font as unknown as LegacyPaperImportedFont;
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
