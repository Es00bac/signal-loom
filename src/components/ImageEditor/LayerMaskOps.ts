import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createBitmap, getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import type { SelectionMask } from './SelectionMask';

export type LayerSelectionMaskMode = 'reveal-selection' | 'hide-selection';

export function createLayerMaskFromSelection(
  doc: ImageDocument,
  layer: ImageLayer,
  selection: SelectionMask,
  mode: LayerSelectionMaskMode = 'reveal-selection',
): LayerBitmap {
  const { width, height } = resolveMaskSize(doc, layer);
  return createMaskBitmap(width, height, (x, y) => {
    const docX = Math.round(layer.x + x);
    const docY = Math.round(layer.y + y);
    const selectionAlpha =
      docX >= 0 && docY >= 0 && docX < selection.width && docY < selection.height
        ? selection.data[docY * selection.width + docX]
        : 0;
    return mode === 'hide-selection' ? 255 - selectionAlpha : selectionAlpha;
  });
}

export function createRevealAllLayerMask(
  doc: ImageDocument,
  layer: ImageLayer,
): LayerBitmap {
  const { width, height } = resolveMaskSize(doc, layer);
  return createMaskBitmap(width, height, () => 255);
}

export function createHideAllLayerMask(
  doc: ImageDocument,
  layer: ImageLayer,
): LayerBitmap {
  const { width, height } = resolveMaskSize(doc, layer);
  return createMaskBitmap(width, height, () => 0);
}

export function invertLayerMask(mask: LayerBitmap): LayerBitmap {
  const source = getBitmapImageData(mask);
  return createMaskBitmap(mask.width, mask.height, (x, y) => {
    const alpha = source.data[(y * mask.width + x) * 4 + 3] ?? 0;
    return 255 - alpha;
  });
}

export function applyLayerMaskToLayer(layer: ImageLayer): ImageLayer {
  if (!layer.bitmap || !layer.mask) {
    return { ...layer, mask: null };
  }

  const source = getBitmapImageData(layer.bitmap);
  const mask = getBitmapImageData(layer.mask);
  const applied = createBitmap(layer.bitmap.width, layer.bitmap.height);
  const ctx = applied.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for layer mask apply');
  const output = ctx.createImageData(layer.bitmap.width, layer.bitmap.height);

  for (let y = 0; y < layer.bitmap.height; y += 1) {
    for (let x = 0; x < layer.bitmap.width; x += 1) {
      const offset = (y * layer.bitmap.width + x) * 4;
      const maskAlpha =
        x < layer.mask.width && y < layer.mask.height
          ? mask.data[(y * layer.mask.width + x) * 4 + 3]
          : 0;
      output.data[offset] = source.data[offset];
      output.data[offset + 1] = source.data[offset + 1];
      output.data[offset + 2] = source.data[offset + 2];
      output.data[offset + 3] = Math.round((source.data[offset + 3] * maskAlpha) / 255);
    }
  }

  putBitmapImageData(applied, output);
  return {
    ...layer,
    bitmap: applied,
    bitmapVersion: layer.bitmapVersion + 1,
    mask: null,
  };
}

function resolveMaskSize(
  doc: ImageDocument,
  layer: ImageLayer,
): { width: number; height: number } {
  return {
    width: layer.bitmap?.width ?? doc.width,
    height: layer.bitmap?.height ?? doc.height,
  };
}

function createMaskBitmap(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): LayerBitmap {
  const bitmap = createBitmap(width, height);
  const ctx = bitmap.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for layer mask');
  const imageData = ctx.createImageData(bitmap.width, bitmap.height);

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = clampByte(alphaAt(x, y));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return bitmap;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}
