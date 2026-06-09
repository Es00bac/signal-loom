export type PhotoshopParityPriority = 'high' | 'medium' | 'low';
export type PhotoshopParityStatus = 'done' | 'partial' | 'remaining';

export interface PhotoshopParityItem {
  id: string;
  area: string;
  photoshop: string;
  signalLoom: string;
  priority: PhotoshopParityPriority;
  status: PhotoshopParityStatus;
  workflowReason: string;
}

export const IMAGE_PHOTOSHOP_PARITY_ITEMS: PhotoshopParityItem[] = [
  {
    id: 'comic-adjustments',
    area: 'Comic tone fixes',
    photoshop: 'Levels, Curves, masks, adjustment stacks',
    signalLoom: 'Channel-aware Levels/Curves with point curves, numeric controls, reset, and shared live/export/flatten/PSD composite rendering',
    priority: 'high',
    status: 'done',
    workflowReason: 'Fast value correction for Flow-generated panels before handoff.',
  },
  {
    id: 'source-linked-assets',
    area: 'Source handoff',
    photoshop: 'Linked smart objects and relink workflows',
    signalLoom: 'Source-linked layers track dimensions/status/history, relink or repair from Source Bin, and preserve transform, mask, effects, and filters',
    priority: 'high',
    status: 'done',
    workflowReason: 'Keeps generated assets traceable when they move between Flow and Image.',
  },
  {
    id: 'editable-lettering',
    area: 'Lettering',
    photoshop: 'Editable text layers, paragraph styles, warps',
    signalLoom: 'Text metadata is source-of-truth; selected text layers expose paragraph box, alignment, style, spacing, warp, and rerasterized cache controls',
    priority: 'high',
    status: 'done',
    workflowReason: 'Comic speech, captions, and SFX need later editable text without bitmap churn.',
  },
  {
    id: 'speech-assets',
    area: 'Comic raster helpers',
    photoshop: 'Shape presets, strokes, speech bubbles, speed-line assets',
    signalLoom: 'One-click raster comic/manga helper layers and layer effects',
    priority: 'medium',
    status: 'done',
    workflowReason: 'Useful for quick panel mockups without new canvas interaction modes.',
  },
  {
    id: 'psd-roundtrip',
    area: 'Interchange',
    photoshop: 'Native PSD with groups, smart objects, text, and adjustment metadata',
    signalLoom: 'Layered PSD import/export preserves Signal Loom text/source-link/adjustment metadata as custom metadata when native PSD constructs are not emitted',
    priority: 'medium',
    status: 'done',
    workflowReason: 'Important for outside finishing but less urgent than Flow handoff.',
  },
];

export function getHighPriorityImageParityItems(items = IMAGE_PHOTOSHOP_PARITY_ITEMS): PhotoshopParityItem[] {
  return items.filter((item) => item.priority === 'high');
}

export function countImageParityStatuses(items = IMAGE_PHOTOSHOP_PARITY_ITEMS): Record<PhotoshopParityStatus, number> {
  return items.reduce<Record<PhotoshopParityStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { done: 0, partial: 0, remaining: 0 },
  );
}
