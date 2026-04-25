import type { SourceBinItem } from './sourceBin';
import { buildMediaAssetSignaturePart } from './mediaAssetSignature';

export interface PendingSourceBinIngestItem {
  item: SourceBinItem;
  sourceKey: string;
}

export function buildConnectedItemSourceKey(item: SourceBinItem): string | undefined {
  if (item.kind === 'text') {
    return item.text ? `${item.kind}:${item.nodeId}:${item.text}` : undefined;
  }

  if (!item.assetUrl) {
    return undefined;
  }

  return `${item.kind}:${item.nodeId}:${buildMediaAssetSignaturePart(item.assetUrl)}`;
}

export function buildSourceBinIngestSignature(items: SourceBinItem[]): string {
  return items
    .map((item) => buildConnectedItemSourceKey(item))
    .filter((sourceKey): sourceKey is string => Boolean(sourceKey))
    .sort()
    .join('|');
}

export function takePendingSourceBinIngestItems(
  items: SourceBinItem[],
  options: {
    dismissedSourceKeys: ReadonlySet<string>;
    existingSourceKeys: ReadonlySet<string>;
    pendingSourceKeys: Set<string>;
  },
): PendingSourceBinIngestItem[] {
  return items.flatMap((item) => {
    const sourceKey = buildConnectedItemSourceKey(item);

    if (
      !sourceKey ||
      options.dismissedSourceKeys.has(sourceKey) ||
      options.existingSourceKeys.has(sourceKey) ||
      options.pendingSourceKeys.has(sourceKey)
    ) {
      return [];
    }

    options.pendingSourceKeys.add(sourceKey);
    return [{ item, sourceKey }];
  });
}
