import type { BinaryAssetId } from '../../../shared/assets/contentAddressedAsset';
import type { PaperAssetRepository } from './PaperAssetRepository';

export interface PaperAssetUrlLease {
  url: string;
  release(): void;
}

interface PaperAssetUrlEntry {
  url: string;
  leases: number;
}

export class PaperAssetUrlRegistry {
  private readonly entries = new Map<BinaryAssetId, PaperAssetUrlEntry>();
  private readonly pendingEntries = new Map<BinaryAssetId, Promise<PaperAssetUrlEntry>>();
  private readonly repository: PaperAssetRepository;

  constructor(repository: PaperAssetRepository) {
    this.repository = repository;
  }

  async acquire(id: BinaryAssetId): Promise<PaperAssetUrlLease> {
    const entry = await this.getOrCreateEntry(id);
    entry.leases += 1;
    let released = false;

    return {
      url: entry.url,
      release: () => {
        if (released || this.entries.get(id) !== entry) {
          return;
        }
        released = true;
        entry.leases -= 1;
        if (entry.leases === 0) {
          this.entries.delete(id);
          URL.revokeObjectURL(entry.url);
        }
      },
    };
  }

  private async getOrCreateEntry(id: BinaryAssetId): Promise<PaperAssetUrlEntry> {
    const existing = this.entries.get(id);
    if (existing) {
      return existing;
    }

    const pending = this.pendingEntries.get(id) ?? this.createEntry(id);
    this.pendingEntries.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.pendingEntries.get(id) === pending) {
        this.pendingEntries.delete(id);
      }
    }
  }

  private async createEntry(id: BinaryAssetId): Promise<PaperAssetUrlEntry> {
    const record = await this.repository.get(id);
    if (!record) {
      throw new Error(`Paper asset not found: ${id}`);
    }

    const entry = {
      url: URL.createObjectURL(new Blob([new Uint8Array(record.bytes)], { type: record.ref.mimeType })),
      leases: 0,
    };
    this.entries.set(id, entry);
    return entry;
  }
}
