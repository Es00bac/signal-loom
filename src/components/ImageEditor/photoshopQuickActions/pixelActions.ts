import type { EditorOperation, ImageDocument, ImageLayer } from '../../../types/imageEditor';
import { getBitmapImageData, putBitmapImageData } from '../LayerBitmap';
import type { SelectionMask } from '../SelectionMask';
import {
  cloneBitmapPixels,
  forEachBitmapPixel,
  getSelectionAlphaAtDocumentPixel,
} from './bitmapUtils';
import { clampByte } from './utils';

export function clearOutsideSelection(
  doc: ImageDocument,
  layer: ImageLayer,
  selection: SelectionMask,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  if (!layer.bitmap) return null;
  const before = cloneBitmapPixels(layer.bitmap);
  const after = cloneBitmapPixels(layer.bitmap);
  const imageData = getBitmapImageData(after);

  forEachBitmapPixel(after, (x, y, offset) => {
    const alpha = getSelectionAlphaAtDocumentPixel(doc, selection, layer.x + x, layer.y + y);
    imageData.data[offset + 3] = Math.round((imageData.data[offset + 3] * alpha) / 255);
  });

  putBitmapImageData(after, imageData);
  return { kind: 'paint', docId: doc.id, layerId: layer.id, before, after };
}


export function invertLayerColors(
  doc: ImageDocument,
  layer: ImageLayer,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  return mapLayerPixels(doc, layer, (data, offset) => {
    data[offset] = 255 - data[offset];
    data[offset + 1] = 255 - data[offset + 1];
    data[offset + 2] = 255 - data[offset + 2];
  });
}

export function desaturateLayer(
  doc: ImageDocument,
  layer: ImageLayer,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  return mapLayerPixels(doc, layer, (data, offset) => {
    const gray = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
    data[offset] = gray;
    data[offset + 1] = gray;
    data[offset + 2] = gray;
  });
}

export function adjustLayerBrightness(
  doc: ImageDocument,
  layer: ImageLayer,
  delta: number,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  return mapLayerPixels(doc, layer, (data, offset) => {
    data[offset] = clampByte(data[offset] + delta);
    data[offset + 1] = clampByte(data[offset + 1] + delta);
    data[offset + 2] = clampByte(data[offset + 2] + delta);
  });
}

export function setLayerPixelAlphaPercent(
  doc: ImageDocument,
  layer: ImageLayer,
  percent: number,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  const ratio = Math.max(0, Math.min(1, percent / 100));
  return mapLayerPixels(doc, layer, (data, offset) => {
    data[offset + 3] = clampByte(data[offset + 3] * ratio);
  });
}


export function clearSelectedPixels(
  doc: ImageDocument,
  layer: ImageLayer,
  selection: SelectionMask,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  if (!layer.bitmap) return null;
  const before = cloneBitmapPixels(layer.bitmap);
  const after = cloneBitmapPixels(layer.bitmap);
  const imageData = getBitmapImageData(after);

  forEachBitmapPixel(after, (x, y, offset) => {
    const alpha = getSelectionAlphaAtDocumentPixel(doc, selection, layer.x + x, layer.y + y);
    if (alpha === 0) return;
    imageData.data[offset + 3] = Math.round((imageData.data[offset + 3] * (255 - alpha)) / 255);
  });

  putBitmapImageData(after, imageData);
  return { kind: 'paint', docId: doc.id, layerId: layer.id, before, after };
}

function mapLayerPixels(
  doc: ImageDocument,
  layer: ImageLayer,
  mutate: (data: Uint8ClampedArray, offset: number, x: number, y: number) => void,
): Extract<EditorOperation, { kind: 'paint' }> | null {
  if (!layer.bitmap) return null;
  const before = cloneBitmapPixels(layer.bitmap);
  const after = cloneBitmapPixels(layer.bitmap);
  const imageData = getBitmapImageData(after);

  forEachBitmapPixel(after, (x, y, offset) => {
    mutate(imageData.data, offset, x, y);
  });

  putBitmapImageData(after, imageData);
  return { kind: 'paint', docId: doc.id, layerId: layer.id, before, after };
}
