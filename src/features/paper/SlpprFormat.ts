import type { BinaryAssetRecord } from '../../shared/assets/contentAddressedAsset';
import { unpackContainer } from '../../shared/files/SignalLoomContainer';
import {
  packValidatedAssetContainer,
  unpackValidatedAssetContainer,
} from '../../shared/files/ValidatedAssetContainer';
import type { PaperDocument } from '../../types/paper';
import {
  collectReachablePaperAssetIds,
  migrateLegacyPaperBinaryFields,
  type LegacySlpprAssetPayload,
} from './assets/PaperDocumentAssets';
import type { PaperAssetRepository } from './assets/PaperAssetRepository';

export const SLPPR_FORMAT = 'signal-loom-paper';
export const SLPPR_FORMAT_VERSION = 2;

function assertSlpprIdentity(format: string, kind: string): void {
  if (format !== SLPPR_FORMAT || kind !== 'paper') {
    throw new Error(`Not a .slppr container: ${format}`);
  }
}

function unsupportedVersion(version: number): Error {
  return new Error(`Unsupported .slppr format version ${version}.`);
}

async function collectRequiredRecords(
  document: PaperDocument,
  repository: PaperAssetRepository,
): Promise<BinaryAssetRecord[]> {
  return Promise.all(collectReachablePaperAssetIds(document).map(async (id) => {
    const record = await repository.get(id);
    if (!record) throw new Error(`Paper document is missing required asset ${id}.`);
    return record;
  }));
}

function legacyPayloads(assets: ReadonlyMap<string, Uint8Array>): Map<string, LegacySlpprAssetPayload> {
  return new Map([...assets].map(([id, bytes]) => [id, { bytes: new Uint8Array(bytes) }]));
}

async function deserializeVersionOne(
  bytes: Uint8Array,
  repository: PaperAssetRepository,
  strictError: unknown,
): Promise<PaperDocument> {
  let legacy: ReturnType<typeof unpackContainer>;
  try {
    legacy = unpackContainer(bytes);
  } catch {
    throw strictError;
  }

  assertSlpprIdentity(legacy.manifest.format, legacy.manifest.kind);
  if (legacy.manifest.formatVersion !== 1) {
    throw unsupportedVersion(legacy.manifest.formatVersion);
  }

  return migrateLegacyPaperBinaryFields(
    legacy.manifest.document as PaperDocument,
    repository,
    { legacySlpprAssets: legacyPayloads(legacy.assets) },
  );
}

export async function serializeSlppr(
  document: PaperDocument,
  repository: PaperAssetRepository,
): Promise<Uint8Array> {
  const managedDocument = await migrateLegacyPaperBinaryFields(document, repository);
  const records = await collectRequiredRecords(managedDocument, repository);
  return packValidatedAssetContainer({
    format: SLPPR_FORMAT,
    formatVersion: SLPPR_FORMAT_VERSION,
    kind: 'paper',
    document: managedDocument,
    assets: records.map(({ ref }) => ref),
  }, records);
}

export async function deserializeSlppr(
  bytes: Uint8Array,
  repository: PaperAssetRepository,
): Promise<PaperDocument> {
  let opened: Awaited<ReturnType<typeof unpackValidatedAssetContainer<PaperDocument>>>;
  try {
    opened = await unpackValidatedAssetContainer<PaperDocument>(bytes);
  } catch (strictError) {
    return deserializeVersionOne(bytes, repository, strictError);
  }

  assertSlpprIdentity(opened.manifest.format, opened.manifest.kind);
  if (opened.manifest.formatVersion !== SLPPR_FORMAT_VERSION) {
    throw unsupportedVersion(opened.manifest.formatVersion);
  }

  for (const record of opened.assets.values()) {
    await repository.put(record);
  }
  await collectRequiredRecords(opened.manifest.document, repository);
  return migrateLegacyPaperBinaryFields(opened.manifest.document, repository);
}
