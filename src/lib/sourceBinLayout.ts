import type { MediaPreviewKind } from './mediaPreview';

export interface SourceBinDisplayItem {
  id: string;
  label: string;
  kind: string;
  createdAt?: number;
  starred?: boolean;
  assetUrl?: string;
}

export function sortSourceBinItemsForDisplay<T extends SourceBinDisplayItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const starredDelta = Number(Boolean(right.starred)) - Number(Boolean(left.starred));

    if (starredDelta !== 0) {
      return starredDelta;
    }

    const createdDelta = (right.createdAt ?? 0) - (left.createdAt ?? 0);

    if (createdDelta !== 0) {
      return createdDelta;
    }

    return left.label.localeCompare(right.label);
  });
}

export function getSourceBinPreviewKind(item: Pick<SourceBinDisplayItem, 'kind' | 'assetUrl'>): MediaPreviewKind | undefined {
  if (!item.assetUrl) {
    return undefined;
  }

  if (item.kind === 'image') {
    return 'image';
  }

  if (item.kind === 'video' || item.kind === 'composition') {
    return 'video';
  }

  return undefined;
}
