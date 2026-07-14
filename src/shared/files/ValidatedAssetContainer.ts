import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  type UnzipFileInfo,
} from 'fflate';
import {
  isBinaryAssetRef,
  verifyBinaryAssetRecord,
  type BinaryAssetId,
  type BinaryAssetRecord,
  type BinaryAssetRef,
} from '../assets/contentAddressedAsset';

export interface AssetContainerLimits {
  maxEntries: number;
  maxManifestBytes: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ASSET_CONTAINER_LIMITS: AssetContainerLimits = {
  maxEntries: 10_000,
  maxManifestBytes: 16 * 1024 * 1024,
  maxAssetBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

export interface ValidatedAssetContainerManifest<TDocument = unknown> {
  format: string;
  formatVersion: number;
  kind: string;
  document: TDocument;
  assets: BinaryAssetRef[];
  [extra: string]: unknown;
}

export interface ValidatedAssetContainer<TDocument = unknown> {
  manifest: ValidatedAssetContainerManifest<TDocument>;
  assets: Map<BinaryAssetId, BinaryAssetRecord>;
}

const ERROR_PREFIX = 'ValidatedAssetContainer:';
const MANIFEST_PATH = 'manifest.json';

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/icc': 'icc',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'application/vnd.iccprofile': 'icc',
  'application/woff': 'woff',
  'application/woff2': 'woff2',
  'font/otf': 'otf',
  'font/sfnt': 'sfnt',
  'font/ttf': 'ttf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
};

function containerError(message: string): Error {
  return new Error(`${ERROR_PREFIX} ${message}`);
}

function rethrowZipError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith(ERROR_PREFIX)) {
    throw error;
  }
  throw new Error(`${ERROR_PREFIX} invalid ZIP data.`, { cause: error });
}

function resolveLimits(overrides?: Partial<AssetContainerLimits>): AssetContainerLimits {
  const limits = { ...DEFAULT_ASSET_CONTAINER_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw containerError(`${name} must be a non-negative safe integer.`);
    }
  }
  return limits;
}

function assertSafeArchivePath(path: string): void {
  const pathSegments = path.split('/');
  if (
    path.length === 0
    || path.includes('\0')
    || path.includes('\\')
    || path.startsWith('/')
    || /^[a-z]:[\\/]/i.test(path)
    || pathSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw containerError(`unsafe archive path: ${path || '<empty>'}.`);
  }
}

function safeExtension(ref: BinaryAssetRef): string {
  if (ref.fileName) {
    const lastDot = ref.fileName.lastIndexOf('.');
    const candidate = lastDot >= 0 ? ref.fileName.slice(lastDot + 1).toLowerCase() : '';
    if (/^[a-z0-9]{1,16}$/.test(candidate)) {
      return candidate;
    }
  }

  const normalizedMimeType = ref.mimeType.trim().toLowerCase().split(';', 1)[0];
  const knownExtension = MIME_EXTENSIONS[normalizedMimeType];
  if (knownExtension) {
    return knownExtension;
  }

  const subtype = normalizedMimeType.split('/', 2)[1]
    ?.replace(/^x-/, '')
    .split('+', 1)[0]
    .split('.')
    .at(-1);
  return subtype && /^[a-z0-9]{1,16}$/.test(subtype) ? subtype : 'bin';
}

function assetEntryPath(ref: BinaryAssetRef): string {
  return `assets/${ref.sha256}.${safeExtension(ref)}`;
}

function validateManifest(value: unknown): ValidatedAssetContainerManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw containerError('manifest must be a JSON object.');
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.format !== 'string'
    || candidate.format.trim().length === 0
    || !Number.isSafeInteger(candidate.formatVersion)
    || (candidate.formatVersion as number) < 1
    || typeof candidate.kind !== 'string'
    || candidate.kind.trim().length === 0
    || !Object.hasOwn(candidate, 'document')
    || !Array.isArray(candidate.assets)
  ) {
    throw containerError('manifest has invalid required field types.');
  }

  const assetIds = new Set<BinaryAssetId>();
  for (const ref of candidate.assets) {
    if (!isBinaryAssetRef(ref)) {
      throw containerError('manifest contains a malformed asset reference.');
    }
    if (assetIds.has(ref.id)) {
      throw containerError(`manifest contains duplicate asset reference ${ref.id}.`);
    }
    assetIds.add(ref.id);
  }

  return candidate as unknown as ValidatedAssetContainerManifest;
}

function stringifyAndValidateManifest<TDocument>(
  manifest: ValidatedAssetContainerManifest<TDocument>,
): { bytes: Uint8Array; manifest: ValidatedAssetContainerManifest<TDocument> } {
  let json: string;
  let parsed: unknown;
  try {
    json = JSON.stringify(manifest);
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`${ERROR_PREFIX} manifest is not serializable JSON.`, { cause: error });
  }

  return {
    bytes: strToU8(json),
    manifest: validateManifest(parsed) as ValidatedAssetContainerManifest<TDocument>,
  };
}

function sameAssetRef(left: BinaryAssetRef, right: BinaryAssetRef): boolean {
  return left.id === right.id
    && left.sha256 === right.sha256
    && left.mimeType === right.mimeType
    && left.byteLength === right.byteLength
    && left.fileName === right.fileName;
}

function assertEntryAndSizeLimits(
  entryCount: number,
  manifestBytes: number,
  assetSizes: readonly number[],
  limits: AssetContainerLimits,
): void {
  if (entryCount > limits.maxEntries) {
    throw containerError(`entries limit exceeded (${entryCount} > ${limits.maxEntries}).`);
  }
  if (manifestBytes > limits.maxManifestBytes) {
    throw containerError(`manifest size exceeds manifest limit (${manifestBytes} > ${limits.maxManifestBytes}).`);
  }

  let totalBytes = manifestBytes;
  if (totalBytes > limits.maxTotalBytes) {
    throw containerError(`total uncompressed size exceeds total limit (${totalBytes} > ${limits.maxTotalBytes}).`);
  }
  for (const assetSize of assetSizes) {
    if (!Number.isSafeInteger(assetSize) || assetSize < 0) {
      throw containerError('asset entry has an invalid uncompressed size.');
    }
    if (assetSize > limits.maxAssetBytes) {
      throw containerError(`asset size exceeds asset limit (${assetSize} > ${limits.maxAssetBytes}).`);
    }
    totalBytes += assetSize;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
      throw containerError(`total uncompressed size exceeds total limit (${totalBytes} > ${limits.maxTotalBytes}).`);
    }
  }
}

export function packValidatedAssetContainer<TDocument>(
  inputManifest: ValidatedAssetContainerManifest<TDocument>,
  records: readonly BinaryAssetRecord[],
  limitOverrides?: Partial<AssetContainerLimits>,
): Uint8Array {
  const limits = resolveLimits(limitOverrides);
  const serialized = stringifyAndValidateManifest(inputManifest);
  const recordsById = new Map<BinaryAssetId, BinaryAssetRecord>();

  for (const record of records) {
    if (!isBinaryAssetRef(record.ref)) {
      throw containerError('asset record contains a malformed reference.');
    }
    if (!(record.bytes instanceof Uint8Array)) {
      throw containerError(`asset record ${record.ref.id} has invalid bytes.`);
    }
    if (recordsById.has(record.ref.id)) {
      throw containerError(`duplicate asset record ${record.ref.id}.`);
    }
    if (record.bytes.byteLength !== record.ref.byteLength) {
      throw containerError(`asset record ${record.ref.id} byte length does not match its reference.`);
    }
    recordsById.set(record.ref.id, record);
  }

  const files: Record<string, Uint8Array> = { [MANIFEST_PATH]: serialized.bytes };
  const assetSizes: number[] = [];
  for (const ref of serialized.manifest.assets) {
    const record = recordsById.get(ref.id);
    if (!record) {
      throw containerError(`missing asset record ${ref.id}.`);
    }
    if (!sameAssetRef(ref, record.ref)) {
      throw containerError(`asset record ${ref.id} reference does not match the manifest.`);
    }
    files[assetEntryPath(ref)] = record.bytes;
    assetSizes.push(record.bytes.byteLength);
    recordsById.delete(ref.id);
  }

  const undeclaredRecord = recordsById.keys().next().value as BinaryAssetId | undefined;
  if (undeclaredRecord) {
    throw containerError(`undeclared asset record ${undeclaredRecord}.`);
  }

  assertEntryAndSizeLimits(1 + assetSizes.length, serialized.bytes.byteLength, assetSizes, limits);
  return zipSync(files, { level: 6 });
}

interface ArchiveMetadata {
  manifest: UnzipFileInfo;
  entries: Map<string, UnzipFileInfo>;
}

function inspectArchive(
  bytes: Uint8Array,
  limits: AssetContainerLimits,
): { metadata: ArchiveMetadata; manifestBytes: Uint8Array } {
  const entries = new Map<string, UnzipFileInfo>();
  let manifestMetadata: UnzipFileInfo | undefined;
  let entryCount = 0;
  let totalBytes = 0;
  let retained: Record<string, Uint8Array>;

  try {
    retained = unzipSync(bytes, {
      filter: (entry) => {
        assertSafeArchivePath(entry.name);
        if (entries.has(entry.name)) {
          throw containerError(`duplicate archive entry ${entry.name}.`);
        }
        if (
          !Number.isSafeInteger(entry.size)
          || entry.size < 0
          || !Number.isSafeInteger(entry.originalSize)
          || entry.originalSize < 0
        ) {
          throw containerError(`archive entry ${entry.name} has invalid size metadata.`);
        }
        if (entry.compression !== 0 && entry.compression !== 8) {
          throw containerError(`archive entry ${entry.name} uses unsupported compression ${entry.compression}.`);
        }
        if (entry.compression === 0 && entry.size !== entry.originalSize) {
          throw containerError(`stored archive entry ${entry.name} has inconsistent size metadata.`);
        }

        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw containerError(`entries limit exceeded (${entryCount} > ${limits.maxEntries}).`);
        }
        if (entry.name === MANIFEST_PATH) {
          if (entry.originalSize > limits.maxManifestBytes) {
            throw containerError(`manifest size exceeds manifest limit (${entry.originalSize} > ${limits.maxManifestBytes}).`);
          }
          manifestMetadata = { ...entry };
        } else if (entry.originalSize > limits.maxAssetBytes) {
          throw containerError(`asset size exceeds asset limit (${entry.originalSize} > ${limits.maxAssetBytes}).`);
        }

        totalBytes += entry.originalSize;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
          throw containerError(`total uncompressed size exceeds total limit (${totalBytes} > ${limits.maxTotalBytes}).`);
        }
        entries.set(entry.name, { ...entry });
        return entry.name === MANIFEST_PATH;
      },
    });
  } catch (error) {
    rethrowZipError(error);
  }

  if (!manifestMetadata || retained[MANIFEST_PATH] === undefined) {
    throw containerError('missing manifest.json entry.');
  }
  return {
    metadata: { manifest: manifestMetadata, entries },
    manifestBytes: retained[MANIFEST_PATH],
  };
}

function parseManifest(bytes: Uint8Array): ValidatedAssetContainerManifest {
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(bytes)) as unknown;
  } catch (error) {
    throw new Error(`${ERROR_PREFIX} manifest JSON is invalid.`, { cause: error });
  }
  return validateManifest(value);
}

function reconcileManifestEntries(
  manifest: ValidatedAssetContainerManifest,
  metadata: ArchiveMetadata,
  limits: AssetContainerLimits,
): Map<string, BinaryAssetRef> {
  const expectedPaths = new Map<string, BinaryAssetRef>();
  let declaredTotal = metadata.manifest.originalSize;

  for (const ref of manifest.assets) {
    if (ref.byteLength > limits.maxAssetBytes) {
      throw containerError(`asset size exceeds asset limit (${ref.byteLength} > ${limits.maxAssetBytes}).`);
    }
    declaredTotal += ref.byteLength;
    if (!Number.isSafeInteger(declaredTotal) || declaredTotal > limits.maxTotalBytes) {
      throw containerError(`total declared size exceeds total limit (${declaredTotal} > ${limits.maxTotalBytes}).`);
    }

    const path = assetEntryPath(ref);
    const entry = metadata.entries.get(path);
    if (!entry) {
      throw containerError(`missing declared asset entry ${path}.`);
    }
    if (entry.originalSize !== ref.byteLength) {
      throw containerError(`asset entry ${path} byte length does not match its reference.`);
    }
    expectedPaths.set(path, ref);
  }

  for (const path of metadata.entries.keys()) {
    if (path !== MANIFEST_PATH && !expectedPaths.has(path)) {
      throw containerError(`undeclared archive entry ${path}.`);
    }
  }
  return expectedPaths;
}

function extractDeclaredAssets(
  bytes: Uint8Array,
  expectedPaths: ReadonlyMap<string, BinaryAssetRef>,
): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, {
      filter: (entry) => expectedPaths.has(entry.name),
    });
  } catch (error) {
    rethrowZipError(error);
  }
}

export async function unpackValidatedAssetContainer<TDocument = unknown>(
  bytes: Uint8Array,
  limitOverrides?: Partial<AssetContainerLimits>,
): Promise<ValidatedAssetContainer<TDocument>> {
  const limits = resolveLimits(limitOverrides);
  const inspected = inspectArchive(bytes, limits);
  const manifest = parseManifest(inspected.manifestBytes);
  const expectedPaths = reconcileManifestEntries(manifest, inspected.metadata, limits);
  const extracted = extractDeclaredAssets(bytes, expectedPaths);
  const assets = new Map<BinaryAssetId, BinaryAssetRecord>();

  for (const [path, ref] of expectedPaths) {
    const assetBytes = extracted[path];
    if (assetBytes === undefined) {
      throw containerError(`missing extracted asset entry ${path}.`);
    }
    if (assetBytes.byteLength !== ref.byteLength) {
      throw containerError(`asset entry ${path} byte length changed during extraction.`);
    }

    const record: BinaryAssetRecord = {
      ref: { ...ref },
      bytes: assetBytes,
    };
    if (!await verifyBinaryAssetRecord(record)) {
      throw containerError(`asset entry ${path} hash mismatch.`);
    }
    assets.set(record.ref.id, record);
  }

  return {
    manifest: manifest as ValidatedAssetContainerManifest<TDocument>,
    assets,
  };
}
