import type { Edge } from '@xyflow/react';
import type { AppNode, EditorSourceKind } from '../types/flow';
import { resolveEffectiveSourceNode } from './virtualNodes';

export interface SourceBinItem {
  id: string;
  nodeId: string;
  kind: EditorSourceKind;
  label: string;
  assetUrl?: string;
  text?: string;
  mimeType?: string;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
}

export function collectSourceBinItems(
  nodes: AppNode[],
  edges: Edge[],
  sourceBinId: string,
): SourceBinItem[] {
  const hasSourceBin = nodes.some((node) => node.type === 'sourceBin' && node.id === sourceBinId);

  if (!hasSourceBin) {
    return [];
  }

  return collectGlobalSourceBinItems(nodes, edges);
}

export function collectGlobalSourceBinItems(
  nodes: AppNode[],
  edges: Edge[],
): SourceBinItem[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const sourceBinIds = new Set(nodes.filter((node) => node.type === 'sourceBin').map((node) => node.id));
  const deduped = new Map<string, SourceBinItem>();

  for (const edge of edges) {
    if (!sourceBinIds.has(edge.target)) {
      continue;
    }

    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    const item = buildSourceBinItem(sourceNode);

    if (item && !deduped.has(item.nodeId)) {
      deduped.set(item.nodeId, item);
    }
  }

  return [...deduped.values()];
}

export function buildSourceBinItem(node: AppNode): SourceBinItem | undefined {
  switch (node.type) {
    case 'imageGen': {
      const assetUrl = resolveMediaNodeAsset(node);
      return assetUrl
        ? {
            id: `source-${node.id}`,
            nodeId: node.id,
            kind: 'image',
            label: node.data.sourceAssetName ?? node.data.modelId ?? 'Image',
            assetUrl,
            mimeType: resolveImportedMimeType(node),
          }
        : undefined;
    }
    case 'videoGen': {
      const assetUrl = resolveMediaNodeAsset(node);
      return assetUrl
        ? {
            id: `source-${node.id}`,
            nodeId: node.id,
            kind: 'video',
            label: node.data.sourceAssetName ?? node.data.modelId ?? 'Video',
            assetUrl,
            mimeType: resolveImportedMimeType(node) ?? 'video/mp4',
          }
        : undefined;
    }
    case 'audioGen': {
      const assetUrl = resolveMediaNodeAsset(node);
      return assetUrl
        ? {
            id: `source-${node.id}`,
            nodeId: node.id,
            kind: 'audio',
            label: node.data.sourceAssetName ?? node.data.voiceId ?? node.data.modelId ?? 'Audio',
            assetUrl,
            mimeType: resolveImportedMimeType(node) ?? 'audio/mpeg',
          }
        : undefined;
    }
    case 'composition':
      return node.data.result
        ? {
            id: `source-${node.id}`,
            nodeId: node.id,
            kind: 'composition',
            label: 'Composition output',
            assetUrl: node.data.result,
            mimeType: 'video/mp4',
          }
        : undefined;
    case 'textNode': {
      const mode = node.data.mode ?? 'prompt';
      const text = (mode === 'generate' ? node.data.result : node.data.prompt)?.trim();
      return text
        ? {
            id: `source-${node.id}`,
            nodeId: node.id,
            kind: 'text',
            label: text.slice(0, 48),
            text,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

export function resolveMediaNodeAsset(node: AppNode): string | undefined {
  if (node.type === 'imageGen' || node.type === 'videoGen' || node.type === 'audioGen') {
    return (node.data.mediaMode ?? 'generate') === 'import'
      ? node.data.sourceAssetUrl
      : node.data.result;
  }

  if (node.type === 'composition') {
    return node.data.result;
  }

  return undefined;
}

function resolveImportedMimeType(node: AppNode): string | undefined {
  if (node.type === 'imageGen' || node.type === 'videoGen' || node.type === 'audioGen') {
    return (node.data.mediaMode ?? 'generate') === 'import'
      ? node.data.sourceAssetMimeType
      : undefined;
  }

  return undefined;
}
