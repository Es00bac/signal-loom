import { describe, expect, it } from 'vitest';
import { sortSourceBinItemsForDisplay } from './sourceBinLayout';

describe('source bin display ordering', () => {
  it('pins starred items above unstarred items while preserving newest-first order inside each group', () => {
    const items = [
      { id: 'old-unstarred', label: 'Old', kind: 'video', createdAt: 1 },
      { id: 'new-unstarred', label: 'New', kind: 'video', createdAt: 10 },
      { id: 'old-starred', label: 'Pinned Old', kind: 'video', createdAt: 2, starred: true },
      { id: 'new-starred', label: 'Pinned New', kind: 'video', createdAt: 20, starred: true },
    ];

    expect(sortSourceBinItemsForDisplay(items).map((item) => item.id)).toEqual([
      'new-starred',
      'old-starred',
      'new-unstarred',
      'old-unstarred',
    ]);
  });
});
