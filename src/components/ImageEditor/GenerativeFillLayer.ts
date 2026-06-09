import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { bitmapFromImageSource, createBitmap } from './LayerBitmap';
import { maskToCanvas, type SelectionMask } from './SelectionMask';
import {
  cropSelectionToBounds,
  normalizeGenerativeFillPlacementBounds,
  type GenerativeFillPlacementBounds,
} from './GenerativeFillGeometry';

export function createGenerativeFillLayerFromBitmap({
  doc,
  edgeFeatherPx = 3,
  id = `layer-fill-${Date.now()}`,
  placementBounds,
  prompt,
  resultBitmap,
  selection,
}: {
  doc: ImageDocument;
  edgeFeatherPx?: number;
  id?: string;
  placementBounds?: GenerativeFillPlacementBounds;
  prompt: string;
  resultBitmap: LayerBitmap;
  selection: SelectionMask;
}): ImageLayer {
  const bounds = placementBounds ? normalizeGenerativeFillPlacementBounds(placementBounds, doc) : undefined;
  const normalized = bounds
    ? createBitmap(bounds.width, bounds.height)
    : createBitmap(doc.width, doc.height);
  const ctx = normalized.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for generative fill layer');
  ctx.drawImage(resultBitmap, 0, 0, normalized.width, normalized.height);
  const localSelection = bounds ? cropSelectionToBounds(selection, bounds) : selection;
  const layerMask = edgeFeatherPx > 0
    ? featherSelectionMask(localSelection, edgeFeatherPx)
    : localSelection;

  return {
    id,
    name: `Generative Fill: "${prompt.slice(0, 30)}"`,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: bounds?.x ?? 0,
    y: bounds?.y ?? 0,
    bitmap: normalized,
    bitmapVersion: 0,
    mask: maskToCanvas(layerMask),
  };
}

export async function createGenerativeFillLayerFromBlob({
  doc,
  edgeFeatherPx,
  id,
  placementBounds,
  png,
  prompt,
  selection,
}: {
  doc: ImageDocument;
  edgeFeatherPx?: number;
  id?: string;
  placementBounds?: GenerativeFillPlacementBounds;
  png: Blob;
  prompt: string;
  selection: SelectionMask;
}): Promise<ImageLayer> {
  const blobBitmap = await createImageBitmap(png);
  try {
    const resultBitmap = await bitmapFromImageSource(blobBitmap);
    return createGenerativeFillLayerFromBitmap({
      doc,
      edgeFeatherPx,
      id,
      placementBounds,
      prompt,
      resultBitmap,
      selection,
    });
  } finally {
    blobBitmap.close();
  }
}

function featherSelectionMask(selection: SelectionMask, radiusPx: number): SelectionMask {
  const radius = Math.max(0, Math.round(radiusPx));
  if (radius <= 0) {
    return {
      width: selection.width,
      height: selection.height,
      data: new Uint8ClampedArray(selection.data),
    };
  }

  let current: SelectionMask = {
    width: selection.width,
    height: selection.height,
    data: new Uint8ClampedArray(selection.data),
  };

  for (let pass = 0; pass < radius; pass += 1) {
    current = boxBlurSelectionMask(current);
  }

  return current;
}

function boxBlurSelectionMask(selection: SelectionMask): SelectionMask {
  const out = new Uint8ClampedArray(selection.width * selection.height);

  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let yy = y - 1; yy <= y + 1; yy += 1) {
        if (yy < 0 || yy >= selection.height) continue;
        for (let xx = x - 1; xx <= x + 1; xx += 1) {
          if (xx < 0 || xx >= selection.width) continue;
          sum += selection.data[yy * selection.width + xx];
          count += 1;
        }
      }

      out[y * selection.width + x] = Math.round(sum / Math.max(1, count));
    }
  }

  return {
    width: selection.width,
    height: selection.height,
    data: out,
  };
}
