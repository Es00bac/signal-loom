import type {
  BinaryAssetId,
  BinaryAssetRecord,
  BinaryAssetRef,
} from '../../../shared/assets/contentAddressedAsset';

export interface PaperAssetRepository {
  put(record: BinaryAssetRecord): Promise<BinaryAssetRef>;
  get(id: BinaryAssetId): Promise<BinaryAssetRecord | undefined>;
  has(id: BinaryAssetId): Promise<boolean>;
  delete(id: BinaryAssetId): Promise<void>;
  listRefs(): Promise<BinaryAssetRef[]>;
}

function cloneRecord(record: BinaryAssetRecord): BinaryAssetRecord {
  return {
    ref: { ...record.ref },
    bytes: new Uint8Array(record.bytes),
  };
}

export class MemoryPaperAssetRepository implements PaperAssetRepository {
  private readonly records = new Map<BinaryAssetId, BinaryAssetRecord>();

  async put(record: BinaryAssetRecord): Promise<BinaryAssetRef> {
    this.records.set(record.ref.id, cloneRecord(record));
    return { ...record.ref };
  }

  async get(id: BinaryAssetId): Promise<BinaryAssetRecord | undefined> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  async has(id: BinaryAssetId): Promise<boolean> {
    return this.records.has(id);
  }

  async delete(id: BinaryAssetId): Promise<void> {
    this.records.delete(id);
  }

  async listRefs(): Promise<BinaryAssetRef[]> {
    return [...this.records.values()].map(({ ref }) => ({ ...ref }));
  }
}
