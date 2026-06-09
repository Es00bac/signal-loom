import type { ImageLayer, ImageLayerEffect, ImageLayerFilter } from '../../types/imageEditor';

export interface ImageLayerStyleClipboard {
  opacity: number;
  blendMode: ImageLayer['blendMode'];
  effects: ImageLayerEffect[];
  filters: ImageLayerFilter[];
}

export function copyImageLayerStyle(layer: ImageLayer): ImageLayerStyleClipboard {
  return {
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    effects: cloneLayerStyleArray(layer.effects ?? []),
    filters: cloneLayerStyleArray(layer.filters ?? []),
  };
}

export function pasteImageLayerStyle(
  layer: ImageLayer,
  clipboard: ImageLayerStyleClipboard,
): ImageLayer {
  return {
    ...layer,
    opacity: clipboard.opacity,
    blendMode: clipboard.blendMode,
    effects: cloneLayerStyleArray(clipboard.effects),
    filters: cloneLayerStyleArray(clipboard.filters),
  };
}

function cloneLayerStyleArray<T>(items: T[]): T[] {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(items)
    : JSON.parse(JSON.stringify(items)) as T[];
}
