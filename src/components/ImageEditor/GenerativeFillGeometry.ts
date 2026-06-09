import type { ImageDocument } from '../../types/imageEditor';
import { maskBoundingBox, type SelectionMask } from './SelectionMask';

export interface GenerativeFillPlacementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveGenerativeFillPlacementBounds(
  doc: Pick<ImageDocument, 'width' | 'height'>,
  selection: SelectionMask,
  paddingPx = 64,
): GenerativeFillPlacementBounds {
  const selectionBounds = maskBoundingBox(selection);

  if (!selectionBounds) {
    return {
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
    };
  }

  const padding = Math.max(0, Math.round(paddingPx));

  return normalizeGenerativeFillPlacementBounds({
    x: selectionBounds.x - padding,
    y: selectionBounds.y - padding,
    width: selectionBounds.width + padding * 2,
    height: selectionBounds.height + padding * 2,
  }, doc);
}

export function cropSelectionToBounds(
  selection: SelectionMask,
  bounds: GenerativeFillPlacementBounds,
): SelectionMask {
  const data = new Uint8ClampedArray(bounds.width * bounds.height);

  for (let y = 0; y < bounds.height; y += 1) {
    const docY = bounds.y + y;
    if (docY < 0 || docY >= selection.height) continue;

    for (let x = 0; x < bounds.width; x += 1) {
      const docX = bounds.x + x;
      if (docX < 0 || docX >= selection.width) continue;
      data[y * bounds.width + x] = selection.data[docY * selection.width + docX];
    }
  }

  return {
    width: bounds.width,
    height: bounds.height,
    data,
  };
}

export function normalizeGenerativeFillPlacementBounds(
  bounds: GenerativeFillPlacementBounds,
  doc: Pick<ImageDocument, 'width' | 'height'>,
): GenerativeFillPlacementBounds {
  const x = clampInteger(bounds.x, 0, doc.width - 1);
  const y = clampInteger(bounds.y, 0, doc.height - 1);
  const right = clampInteger(bounds.x + bounds.width, x + 1, doc.width);
  const bottom = clampInteger(bounds.y + bounds.height, y + 1, doc.height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}
