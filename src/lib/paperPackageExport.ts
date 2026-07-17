import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument } from '../types/paper';
import { strToU8, zipSync } from 'fflate';
import { serializePaperDocument } from './paperDocument';
import {
  analyzePaperPreflight,
  collectPaperColorInventory,
  collectPaperFontInventory,
  collectPaperLinkedAssets,
  type PaperPreflightProfileId,
} from './paperPreflight';
import { buildPaperPrintProductionMetadata, type PaperPrintProductionMetadata } from './paperPrintProduction';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';
import type { PaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import {
  collectVerifiedPaperAssetRecords,
  type PaperPortableAssetRole,
} from '../features/paper/assets/PaperPortableAssets';
import {
  createBinaryAssetRecord,
  type BinaryAssetRecord,
} from '../shared/assets/contentAddressedAsset';

export type PaperPackagedAssetRole = PaperPortableAssetRole | 'linked-source';

/** One real file included in the package, addressed by digest for printer/validator verification. */
export interface PaperPackagedAssetFile {
  path: string;
  role: PaperPackagedAssetRole;
  label: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  fileName?: string;
}

/** A linked resource the package could NOT embed — recorded explicitly, never silently dropped. */
export interface PaperPackageUnpackagedLink {
  label: string;
  sourceId?: string;
  frameId?: string;
  reason: string;
}

export interface PaperPackageManifest {
  app: 'Sloom Studio Paper';
  version: 2;
  title: string;
  createdAt: string;
  documentId: string;
  pageCount: number;
  files: Array<{ path: string; type: string; bytes: number }>;
  /** Actual embedded art/font/license/profile files with their digests, sorted by path. */
  packagedAssets: PaperPackagedAssetFile[];
  /** Linked resources that are not embedded, with the reason each one is absent. */
  unpackagedLinks: PaperPackageUnpackagedLink[];
  linkedAssets: ReturnType<typeof collectPaperLinkedAssets>;
  fonts: ReturnType<typeof collectPaperFontInventory>;
  colors: ReturnType<typeof collectPaperColorInventory>;
  production: PaperPrintProductionMetadata;
}

export interface PaperPackageExport {
  fileName: string;
  mimeType: 'application/json' | 'application/zip';
  manifest: PaperPackageManifest;
  blob: Blob;
  json: string;
  fallbackJsonFileName: string;
  entries: string[];
}

const FIXED_ENTRY_PATHS = ['document.sloom-paper.json', 'preflight-report.json', 'manifest.json'] as const;

const PACKAGE_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/icc': 'icc',
  'application/pdf': 'pdf',
  'application/vnd.iccprofile': 'icc',
  'font/otf': 'otf',
  'font/sfnt': 'ttc',
  'font/ttf': 'ttf',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'text/plain': 'txt',
};

function packageDirectoryForRole(role: PaperPackagedAssetRole): string {
  if (role === 'font') return 'Fonts';
  if (role === 'font-license') return 'Fonts/Licenses';
  if (role === 'icc-profile') return 'Profiles';
  return 'Links';
}

function extensionForAsset(ref: { mimeType: string; fileName?: string }): string {
  if (ref.fileName) {
    const lastDot = ref.fileName.lastIndexOf('.');
    const candidate = lastDot >= 0 ? ref.fileName.slice(lastDot + 1).toLowerCase() : '';
    if (/^[a-z0-9]{1,16}$/.test(candidate)) return candidate;
  }
  const normalized = ref.mimeType.trim().toLowerCase().split(';', 1)[0];
  const known = PACKAGE_MIME_EXTENSIONS[normalized];
  if (known) return known;
  const subtype = normalized.split('/', 2)[1]?.replace(/^x-/, '').split('+', 1)[0].split('.').at(-1);
  return subtype && /^[a-z0-9]{1,16}$/.test(subtype) ? subtype : 'bin';
}

interface PackagedBinary {
  file: PaperPackagedAssetFile;
  bytes: Uint8Array;
}

function decodeSourceDataUrl(url: string): { bytes: Uint8Array; mimeType?: string } | undefined {
  const match = /^data:([^,]*),(.*)$/is.exec(url);
  if (!match) return undefined;
  const metadata = match[1].trim();
  const mimeType = metadata.split(';', 1)[0]?.trim() || undefined;
  const isBase64 = metadata.split(';').some((part) => part.trim().toLowerCase() === 'base64');
  try {
    if (!isBase64) {
      return { bytes: new TextEncoder().encode(decodeURIComponent(match[2])), mimeType };
    }
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, mimeType };
  } catch {
    return undefined;
  }
}

async function collectLinkedSourceBinaries(
  document: PaperDocument,
  sourceItems: SourceBinLibraryItem[],
  alreadyPackagedIds: ReadonlySet<string>,
): Promise<{ binaries: Array<{ record: BinaryAssetRecord; label: string }>; unpackaged: PaperPackageUnpackagedLink[] }> {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const binaries: Array<{ record: BinaryAssetRecord; label: string }> = [];
  const unpackaged: PaperPackageUnpackagedLink[] = [];
  const seenSourceIds = new Set<string>();

  for (const page of document.pages) {
    for (const frame of page.frames) {
      if (!['image', 'document'].includes(frame.kind) || !frame.asset?.sourceBinItemId) continue;
      // Managed locators already travel as verified repository records.
      if (frame.asset.locator?.kind === 'managed') continue;
      const sourceId = frame.asset.sourceBinItemId;
      if (seenSourceIds.has(sourceId)) continue;
      seenSourceIds.add(sourceId);
      const label = frame.asset.label || frame.label || sourceId;
      const item = sourceById.get(sourceId);
      if (!item) {
        unpackaged.push({ label, sourceId, frameId: frame.id, reason: 'The linked Source Library item was not found in this project.' });
        continue;
      }
      const url = item.assetUrl;
      if (!url) {
        unpackaged.push({ label, sourceId, frameId: frame.id, reason: 'The linked Source Library item has no stored bytes or durable URL.' });
        continue;
      }
      if (/^blob:/i.test(url)) {
        unpackaged.push({ label, sourceId, frameId: frame.id, reason: 'The linked bytes exist only behind a runtime object URL; re-export from the device that holds the file.' });
        continue;
      }
      if (!/^data:/i.test(url)) {
        unpackaged.push({ label, sourceId, frameId: frame.id, reason: 'The link points at an external URL that is not embedded; deliver that file alongside this package.' });
        continue;
      }
      const decoded = decodeSourceDataUrl(url);
      if (!decoded || decoded.bytes.byteLength === 0) {
        unpackaged.push({ label, sourceId, frameId: frame.id, reason: 'The stored data URL could not be decoded.' });
        continue;
      }
      const record = await createBinaryAssetRecord(decoded.bytes, {
        mimeType: decoded.mimeType || item.mimeType || 'application/octet-stream',
      });
      if (alreadyPackagedIds.has(record.ref.id) || binaries.some((entry) => entry.record.ref.id === record.ref.id)) continue;
      binaries.push({ record, label });
    }
  }

  return { binaries, unpackaged };
}

/**
 * Builds the "Package for print" deliverable. The ZIP contains the document JSON, preflight
 * report, manifest, per-link metadata, AND the actual bytes a printer needs to reproduce the
 * document: placed art, exact managed font files, their license texts, and ICC output profiles —
 * all digest-verified through the shared portable-asset contract. Fonts whose rights forbid
 * packaging and missing managed records fail the whole package with actionable diagnostics.
 */
export async function buildPaperPackageExport(
  document: PaperDocument,
  sourceItems: SourceBinLibraryItem[] = [],
  options: { profileId?: PaperPreflightProfileId; repository?: PaperAssetRepository } = {},
): Promise<PaperPackageExport> {
  const repository = options.repository ?? paperAssetRepository;
  const { records } = await collectVerifiedPaperAssetRecords([document], repository, { strict: true });
  const managedIds = new Set(records.map((entry) => entry.record.ref.id));
  const linked = await collectLinkedSourceBinaries(document, sourceItems, managedIds);

  const usedPaths = new Set<string>(FIXED_ENTRY_PATHS);
  const packagedBinaries: PackagedBinary[] = [];
  const addBinary = (record: BinaryAssetRecord, role: PaperPackagedAssetRole, label: string) => {
    const directory = packageDirectoryForRole(role);
    const extension = extensionForAsset(record.ref);
    let path = `${directory}/${safePathPart(label)}-${record.ref.sha256.slice(0, 12)}.${extension}`;
    if (usedPaths.has(path)) {
      path = `${directory}/${safePathPart(label)}-${record.ref.sha256}.${extension}`;
    }
    usedPaths.add(path);
    packagedBinaries.push({
      file: {
        path,
        role,
        label,
        sha256: record.ref.sha256,
        byteLength: record.ref.byteLength,
        mimeType: record.ref.mimeType,
        ...(record.ref.fileName ? { fileName: record.ref.fileName } : {}),
      },
      bytes: record.bytes,
    });
  };
  for (const { record, source } of records) {
    addBinary(record, source.role, source.label);
  }
  for (const { record, label } of linked.binaries) {
    addBinary(record, 'linked-source', label);
  }
  packagedBinaries.sort((left, right) => left.file.path.localeCompare(right.file.path));
  const packagedAssets = packagedBinaries.map((entry) => entry.file);

  const documentJson = serializePaperDocument(document);
  const preflightReport = analyzePaperPreflight(document, sourceItems, options.profileId);
  const linkedAssets = collectPaperLinkedAssets(document, sourceItems);
  const fonts = collectPaperFontInventory(document);
  const colors = collectPaperColorInventory(document);
  const production = buildPaperPrintProductionMetadata(document);
  const assetFiles = linkedAssets.map((asset) => {
    const source = packageSourceMetadata(sourceItems.find((item) => item.id === asset.sourceId));
    return {
      path: `Links/${safePathPart(asset.sourceLabel)}.json`,
      type: 'linked-asset-metadata',
      bytes: jsonBytes(source ?? asset),
      source,
      asset,
    };
  });
  const files = [
    { path: 'document.sloom-paper.json', type: 'document', bytes: byteLength(documentJson) },
    { path: 'preflight-report.json', type: 'preflight', bytes: jsonBytes(preflightReport) },
    { path: 'manifest.json', type: 'manifest', bytes: 0 },
    ...assetFiles.map(({ path, type, bytes }) => ({ path, type, bytes })),
    ...packagedAssets.map((asset) => ({ path: asset.path, type: asset.role, bytes: asset.byteLength })),
  ];
  const manifest: PaperPackageManifest = {
    app: 'Sloom Studio Paper',
    version: 2,
    title: document.title,
    createdAt: new Date().toISOString(),
    documentId: document.id,
    pageCount: document.pages.length,
    files,
    packagedAssets,
    unpackagedLinks: linked.unpackaged,
    linkedAssets,
    fonts,
    colors,
    production,
  };
  manifest.files = manifest.files.map((file) => file.path === 'manifest.json' ? { ...file, bytes: jsonBytes(manifest) } : file);
  const bundle = {
    manifest,
    document: JSON.parse(documentJson) as PaperDocument,
    preflightReport,
    linkedAssetInventory: linkedAssets,
    fontInventory: fonts,
    colorInventory: colors,
    production,
    assets: assetFiles.map(({ source, asset }) => ({ source, asset })),
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const fallbackJsonFileName = `${safePathPart(document.title || 'paper-document')}.sloom-paper-package.json`;
  const zipEntries: Record<string, Uint8Array> = {
    'document.sloom-paper.json': strToU8(documentJson),
    'preflight-report.json': strToU8(`${JSON.stringify(preflightReport, null, 2)}\n`),
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const assetFile of [...assetFiles].sort((left, right) => left.path.localeCompare(right.path))) {
    zipEntries[assetFile.path] = strToU8(`${JSON.stringify({ source: assetFile.source, asset: assetFile.asset }, null, 2)}\n`);
  }
  for (const binary of packagedBinaries) {
    zipEntries[binary.file.path] = binary.bytes;
  }
  try {
    const zipped = zipSync(zipEntries);
    return {
      fileName: `${safePathPart(document.title || 'paper-document')}.sloom-paper-package.zip`,
      mimeType: 'application/zip',
      manifest,
      blob: new Blob([zipped], { type: 'application/zip' }),
      json,
      fallbackJsonFileName,
      entries: Object.keys(zipEntries),
    };
  } catch {
    return {
      fileName: fallbackJsonFileName,
      mimeType: 'application/json',
      manifest,
      blob: new Blob([json], { type: 'application/json' }),
      json,
      fallbackJsonFileName,
      entries: [],
    };
  }

}

/** Package metadata may name a durable Source Library URL, but never serializes runtime bytes. */
function packageSourceMetadata(source: SourceBinLibraryItem | undefined): SourceBinLibraryItem | undefined {
  if (!source) return undefined;
  const { assetUrl, ...metadata } = source;
  if (assetUrl && !/^(?:data:|blob:)/i.test(assetUrl)) {
    return { ...metadata, assetUrl };
  }
  return metadata;
}

function safePathPart(value: string): string {
  return value.trim().replace(/[/\\?%*:|"<>]+/g, '-').replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'paper-document';
}

function jsonBytes(value: unknown): number {
  return byteLength(JSON.stringify(value));
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
