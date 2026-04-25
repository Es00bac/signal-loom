import { describe, expect, it } from 'vitest';
import type { SourceBinItem } from './sourceBin';
import {
  buildConnectedItemSourceKey,
  buildSourceBinIngestSignature,
  takePendingSourceBinIngestItems,
} from './sourceBinIngest';

function createItem(overrides: Partial<SourceBinItem> = {}): SourceBinItem {
  return {
    id: 'source-video-1',
    nodeId: 'video-1',
    kind: 'video',
    label: 'Video',
    assetUrl: 'blob:video-asset',
    mimeType: 'video/mp4',
    ...overrides,
  };
}

describe('source-bin ingest coalescing', () => {
  it('marks a connected media item pending before async persistence finishes', () => {
    const pendingSourceKeys = new Set<string>();
    const item = createItem();

    const firstPass = takePendingSourceBinIngestItems([item], {
      dismissedSourceKeys: new Set(),
      existingSourceKeys: new Set(),
      pendingSourceKeys,
    });
    const secondPass = takePendingSourceBinIngestItems([item], {
      dismissedSourceKeys: new Set(),
      existingSourceKeys: new Set(),
      pendingSourceKeys,
    });

    expect(firstPass).toEqual([
      {
        item,
        sourceKey: 'video:video-1:blob:video-asset',
      },
    ]);
    expect(secondPass).toEqual([]);
  });

  it('releases failed ingests so the same source can retry later', () => {
    const pendingSourceKeys = new Set<string>();
    const item = createItem();
    const firstPass = takePendingSourceBinIngestItems([item], {
      dismissedSourceKeys: new Set(),
      existingSourceKeys: new Set(),
      pendingSourceKeys,
    });

    pendingSourceKeys.delete(firstPass[0].sourceKey);

    expect(
      takePendingSourceBinIngestItems([item], {
        dismissedSourceKeys: new Set(),
        existingSourceKeys: new Set(),
        pendingSourceKeys,
      }),
    ).toHaveLength(1);
  });

  it('builds a stable signature so unchanged connected outputs do not re-run ingestion on unrelated node edits', () => {
    const item = createItem({ label: 'Original label' });
    const renamed = createItem({ label: 'Renamed in UI' });

    expect(buildConnectedItemSourceKey(item)).toBe('video:video-1:blob:video-asset');
    expect(buildSourceBinIngestSignature([item])).toBe(buildSourceBinIngestSignature([renamed]));
  });
});
