import { describe, expect, it } from 'vitest';
import type { ImageLayer } from '../../types/imageEditor';
import { getImageLayerWorkflowBadges } from './ImageLayerWorkflowMetadata';
import { IMAGE_PHOTOSHOP_PARITY_ITEMS, countImageParityStatuses, getHighPriorityImageParityItems } from './ImagePhotoshopParity';

describe('ImagePhotoshopParity', () => {
  it('prioritizes completed comic asset correction, source handoff, and editable lettering parity', () => {
    const highPriority = getHighPriorityImageParityItems();

    expect(highPriority.map((item) => item.id)).toEqual([
      'comic-adjustments',
      'source-linked-assets',
      'editable-lettering',
    ]);
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.every((item) => item.photoshop && item.signalLoom)).toBe(true);
    expect(countImageParityStatuses()).toEqual({ done: 5, partial: 0, remaining: 0 });
    expect(highPriority.map((item) => item.status)).toEqual(['done', 'done', 'done']);
  });

  it('derives lightweight workflow badges without changing bitmap state', () => {
    const layer = {
      id: 'layer-1',
      name: 'Generated panel',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 0,
      y: 0,
      bitmap: null,
      bitmapVersion: 4,
      mask: null,
      metadata: {
        smartLinkedSourceId: 'source-1',
        sourceLabel: 'Panel A',
      },
    } satisfies ImageLayer;

    expect(getImageLayerWorkflowBadges(layer).map((badge) => badge.label)).toEqual(['TXT', 'SRC']);
    expect(layer.bitmapVersion).toBe(4);
  });
});
