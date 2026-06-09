import { describe, expect, it } from 'vitest';
import { createMask, setRect } from './SelectionMask';
import {
  cropSelectionToBounds,
  resolveGenerativeFillPlacementBounds,
} from './GenerativeFillGeometry';

describe('GenerativeFillGeometry', () => {
  it('expands selected-area edits with context while clamping to the document', () => {
    const selection = createMask(100, 80);
    setRect(selection, 20, 18, 10, 8, 255, false);

    expect(resolveGenerativeFillPlacementBounds({ width: 100, height: 80 }, selection, 12)).toEqual({
      x: 8,
      y: 6,
      width: 34,
      height: 32,
    });
  });

  it('crops a document-space selection mask into local generated-layer coordinates', () => {
    const selection = createMask(20, 16);
    setRect(selection, 7, 6, 3, 2, 255, false);

    const cropped = cropSelectionToBounds(selection, { x: 5, y: 4, width: 8, height: 6 });

    expect(cropped.width).toBe(8);
    expect(cropped.height).toBe(6);
    expect(cropped.data[(2 * 8 + 2)]).toBe(255);
    expect(cropped.data[(3 * 8 + 4)]).toBe(255);
    expect(cropped.data[0]).toBe(0);
  });
});
