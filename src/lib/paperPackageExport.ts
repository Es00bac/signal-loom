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

export interface PaperPackageExportOptions {
  profileId?: PaperPreflightProfileId;
  repository?: PaperAssetRepository;
  /** Injectable only for platform/integration tests of ZIP failure handling. */
  zip?: (entries: Record<string, Uint8Array>) => Uint8Array;
}

/** A package is never downgraded to a JSON inventory after a ZIP failure. */
export class PaperPackageExportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Paper print package: ${message}`, options);
    this.name = 'PaperPackageExportError';
  }
}

const FIXED_ENTRY_PATHS = ['document.sloom-paper.json', 'preflight-report.json', 'manifest.json'] as const;
const MAX_PACKAGE_MEMBER_PATH_BYTES = 240;
const MAX_PACKAGE_LABEL_BYTES = 96;

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

interface PackageMemberPathRequest {
  directory: string;
  extension: string;
  stem: string;
  /** Stable identity used only to make collision suffixes deterministic. */
  identity: string;
}

/**
 * Allocates every ZIP member namespace (metadata and bytes alike) before the archive exists.
 * The archive format's filename limit is much larger, but this conservative bound remains safe
 * for common filesystem extractors and makes hostile labels incapable of forcing ZIP fallback.
 */
function allocatePackageMemberPaths(
  requests: readonly PackageMemberPathRequest[],
  reservedPaths: readonly string[] = FIXED_ENTRY_PATHS,
): string[] {
  const allocated = new Set(reservedPaths);
  const results = new Array<string>(requests.length);
  const ordered = requests.map((request, index) => ({ request, index })).sort((left, right) => (
    left.request.identity.localeCompare(right.request.identity)
    || left.request.directory.localeCompare(right.request.directory)
    || left.request.stem.localeCompare(right.request.stem)
    || left.request.extension.localeCompare(right.request.extension)
    || left.index - right.index
  ));

  for (const { request, index } of ordered) {
    let ordinal = 1;
    let path = buildBoundedPackagePath(request, ordinal);
    while (allocated.has(path)) {
      ordinal += 1;
      path = buildBoundedPackagePath(request, ordinal);
    }
    allocated.add(path);
    results[index] = path;
  }

  return results;
}

function buildBoundedPackagePath(request: PackageMemberPathRequest, ordinal: number): string {
  const extension = request.extension.replace(/[^a-z0-9]/gi, '').slice(0, 16) || 'bin';
  const suffix = ordinal === 1 ? '' : `-${ordinal}`;
  const fixedBytes = byteLength(`${request.directory}/.${extension}${suffix}`);
  const maximumStemBytes = MAX_PACKAGE_MEMBER_PATH_BYTES - fixedBytes;
  if (maximumStemBytes < 1) {
    throw new PaperPackageExportError('internal path allocation exceeded the safe archive-path limit.');
  }
  return `${request.directory}/${truncateAscii(safePathPart(request.stem, MAX_PACKAGE_LABEL_BYTES), maximumStemBytes)}${suffix}.${extension}`;
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
  options: PaperPackageExportOptions = {},
): Promise<PaperPackageExport> {
  const repository = options.repository ?? paperAssetRepository;
  const { records } = await collectVerifiedPaperAssetRecords([document], repository, { strict: true });
  const managedIds = new Set(records.map((entry) => entry.record.ref.id));
  const linked = await collectLinkedSourceBinaries(document, sourceItems, managedIds);

  const documentJson = serializePaperDocument(document);
  const preflightReport = analyzePaperPreflight(document, sourceItems, options.profileId);
  const linkedAssets = collectPaperLinkedAssets(document, sourceItems);
  const fonts = collectPaperFontInventory(document);
  const colors = collectPaperColorInventory(document);
  const production = buildPaperPrintProductionMetadata(document);
  const metadataMembers = linkedAssets.map((asset) => {
    const source = packageSourceMetadata(sourceItems.find((item) => item.id === asset.sourceId));
    return {
      type: 'linked-asset-metadata',
      source,
      asset,
      json: packageJson({ source, asset }),
    };
  });
  const binaryMembers = [
    ...records.map(({ record, source }) => ({ record, role: source.role, label: source.label })),
    ...linked.binaries.map(({ record, label }) => ({ record, role: 'linked-source' as const, label })),
  ];
  const memberRequests: PackageMemberPathRequest[] = [
    ...metadataMembers.map((member) => ({
      directory: 'Links',
      extension: 'json',
      stem: member.asset.sourceLabel,
      identity: `metadata:${member.asset.id}`,
    })),
    ...binaryMembers.map((member) => ({
      directory: packageDirectoryForRole(member.role),
      extension: extensionForAsset(member.record.ref),
      stem: `${safePathPart(member.label)}-${member.record.ref.sha256.slice(0, 12)}`,
      identity: `binary:${member.role}:${member.record.ref.id}`,
    })),
  ];
  const allocatedPaths = allocatePackageMemberPaths(memberRequests);
  const assetFiles = metadataMembers.map((member, index) => ({
    ...member,
    path: allocatedPaths[index],
    bytes: byteLength(member.json),
  })).sort((left, right) => left.path.localeCompare(right.path));
  const packagedBinaries: PackagedBinary[] = binaryMembers.map((member, index) => ({
    file: {
      path: allocatedPaths[metadataMembers.length + index],
      role: member.role,
      label: member.label,
      sha256: member.record.ref.sha256,
      byteLength: member.record.ref.byteLength,
      mimeType: member.record.ref.mimeType,
      ...(member.record.ref.fileName ? { fileName: member.record.ref.fileName } : {}),
    },
    bytes: member.record.bytes,
  })).sort((left, right) => left.file.path.localeCompare(right.file.path));
  const packagedAssets = packagedBinaries.map((entry) => entry.file);
  const files = [
    { path: 'document.sloom-paper.json', type: 'document', bytes: byteLength(documentJson) },
    { path: 'preflight-report.json', type: 'preflight', bytes: byteLength(packageJson(preflightReport)) },
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
  const manifestJson = finalizeManifestJson(manifest);
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
    'preflight-report.json': strToU8(packageJson(preflightReport)),
    'manifest.json': strToU8(manifestJson),
  };
  for (const assetFile of assetFiles) {
    zipEntries[assetFile.path] = strToU8(assetFile.json);
  }
  for (const binary of packagedBinaries) {
    zipEntries[binary.file.path] = binary.bytes;
  }
  assertManifestMatchesArchive(manifest, zipEntries);
  let zipped: Uint8Array;
  try {
    zipped = (options.zip ?? zipSync)(zipEntries);
  } catch (error) {
    throw new PaperPackageExportError(
      'could not create the self-contained ZIP; no file was downloaded. Remove or re-import the affected assets and try again.',
      { cause: error },
    );
  }
  return {
    fileName: `${safePathPart(document.title || 'paper-document')}.sloom-paper-package.zip`,
    mimeType: 'application/zip',
    manifest,
    blob: new Blob([zipped], { type: 'application/zip' }),
    json,
    fallbackJsonFileName,
    entries: Object.keys(zipEntries),
  };
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

function safePathPart(value: string, maximumBytes = MAX_PACKAGE_LABEL_BYTES): string {
  const normalized = value.normalize('NFKC').trim();
  const sanitized = replaceAsciiControls(normalized)
    .replace(/[/\\?%*:|"<>]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const bounded = truncateAscii(sanitized, maximumBytes).replace(/[-.]+$/g, '');
  return bounded && bounded !== '.' && bounded !== '..' ? bounded : 'paper-document';
}

function replaceAsciiControls(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? '-' : character;
  }).join('');
}

function truncateAscii(value: string, maximumBytes: number): string {
  return value.slice(0, Math.max(0, maximumBytes));
}

function packageJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function finalizeManifestJson(manifest: PaperPackageManifest): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const json = packageJson(manifest);
    const bytes = byteLength(json);
    const manifestFile = manifest.files.find((file) => file.path === 'manifest.json');
    if (!manifestFile) throw new PaperPackageExportError('internal manifest construction omitted manifest.json.');
    if (manifestFile.bytes === bytes) return json;
    manifestFile.bytes = bytes;
  }
  throw new PaperPackageExportError('internal manifest size did not stabilize.');
}

function assertManifestMatchesArchive(manifest: PaperPackageManifest, entries: Record<string, Uint8Array>): void {
  const manifestPaths = manifest.files.map((file) => file.path).sort();
  const archivePaths = Object.keys(entries).sort();
  if (new Set(manifestPaths).size !== manifestPaths.length || manifestPaths.join('\n') !== archivePaths.join('\n')) {
    throw new PaperPackageExportError('internal manifest and archive member lists disagree; no file was downloaded.');
  }
  for (const file of manifest.files) {
    const bytes = entries[file.path];
    if (!bytes || bytes.byteLength !== file.bytes) {
      throw new PaperPackageExportError(`internal archive member "${file.path}" does not match its manifest size; no file was downloaded.`);
    }
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
