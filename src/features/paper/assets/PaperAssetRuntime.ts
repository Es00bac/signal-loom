import { IndexedDbPaperAssetRepository } from './PaperIndexedDbAssetRepository';
import { PaperAssetUrlRegistry } from './PaperAssetUrlRegistry';
import { MemoryPaperAssetRepository, type PaperAssetRepository } from './PaperAssetRepository';
import type { SourceBinLibraryItem } from '../../../store/sourceBinStore';
import type { PaperDocument, PaperFrame } from '../../../types/paper';
import { resolvePaperFrameAssetUrl } from '../../../lib/paperAssetReferences';
import type { BinaryAssetRef } from '../../../shared/assets/contentAddressedAsset';

/** Shared renderer-side Paper asset storage. Native project storage joins this contract in Project 3. */
export const paperAssetRepository: PaperAssetRepository = globalThis.indexedDB
  ? new IndexedDbPaperAssetRepository(globalThis.indexedDB)
  : new MemoryPaperAssetRepository();

/** Object URLs are runtime leases only and never become Paper document state. */
export const paperAssetUrlRegistry = new PaperAssetUrlRegistry(paperAssetRepository);

/**
 * Produces an export-only Paper document whose image/document locators are concrete URLs. Managed records
 * become transient data URLs in this returned copy; the live document, history, and project JSON retain
 * only their content-addressed references.
 */
export async function materializePaperDocumentAssetUrls(
  document: PaperDocument,
  sourceItems: readonly Pick<SourceBinLibraryItem, 'id' | 'assetUrl'>[] = [],
): Promise<PaperDocument> {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const [pages, parentPages] = await Promise.all([
    Promise.all(document.pages.map((page) => materializePaperFrameContainer(page, sourceById))),
    Promise.all(document.parentPages.map((page) => materializePaperFrameContainer(page, sourceById))),
  ]);
  const changed = [...pages, ...parentPages].some((entry) => entry.changed);
  if (!changed) return document;
  return {
    ...document,
    pages: pages.map((entry) => entry.value),
    parentPages: parentPages.map((entry) => entry.value),
  };
}

async function materializePaperFrameContainer<T extends { frames: PaperFrame[] }>(
  container: T,
  sourceById: ReadonlyMap<string, Pick<SourceBinLibraryItem, 'id' | 'assetUrl'>>,
): Promise<{ value: T; changed: boolean }> {
  let changed = false;
  const frames = await Promise.all(container.frames.map(async (frame) => {
    const asset = frame.asset;
    if (!asset) return frame;
    let url = resolvePaperFrameAssetUrl(
      asset,
      asset.sourceBinItemId ? sourceById.get(asset.sourceBinItemId) : undefined,
    );
    if (!url && asset.locator?.kind === 'managed') {
      const record = await paperAssetRepository.get(asset.locator.ref.id);
      if (!record) {
        throw new Error(`Paper asset ${asset.locator.ref.id} is unavailable for export.`);
      }
      assertMatchingManagedAssetRef(record.ref, asset.locator.ref);
      url = await paperBytesToDataUrl(record.bytes, record.ref.mimeType);
    }
    if (!url && (frame.kind === 'image' || frame.kind === 'document')) {
      throw new Error(`Paper ${frame.kind} frame "${frame.label}" has no resolvable asset reference.`);
    }
    if (!url) return frame;
    changed = true;
    return {
      ...frame,
      asset: {
        ...asset,
        locator: { kind: 'external' as const, url },
      },
    };
  }));
  return changed ? { value: { ...container, frames }, changed } : { value: container, changed };
}

function assertMatchingManagedAssetRef(record: BinaryAssetRef, declared: BinaryAssetRef): void {
  if (
    record.id !== declared.id
    || record.sha256 !== declared.sha256
    || record.mimeType !== declared.mimeType
    || record.byteLength !== declared.byteLength
  ) {
    throw new Error(`Paper asset ${declared.id} does not match its document reference.`);
  }
}

function paperBytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (typeof FileReader === 'undefined') {
    // Node-side export tests have no FileReader. This data URL exists only in the ephemeral export copy,
    // never in Paper state or its serialized snapshots.
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return Promise.resolve(`data:${mimeType};base64,${btoa(binary)}`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Paper managed asset could not be materialized for export.'));
    };
    reader.onerror = () => reject(new Error('Paper managed asset could not be materialized for export.'));
    reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
  });
}
