/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { generateBinaryMask, generateFeatheredMask } from './maskGeneration';

describe('maskGeneration', () => {
  it('generates a binary mask data URL for a selection', () => {
    const width = 10;
    const height = 10;
    const selectionData = new Uint8ClampedArray(width * height * 4);
    // Fill center 4x4 as selected
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const i = (y * width + x) * 4;
        selectionData[i + 3] = 255;
      }
    }
    const result = generateBinaryMask(selectionData, width, height);
    expect(result).toContain('data:image/png;base64,');
  });

  it('generates a feathered mask data URL', () => {
    const width = 20;
    const height = 20;
    const selectionData = new Uint8ClampedArray(width * height * 4);
    for (let y = 7; y < 13; y++) {
      for (let x = 7; x < 13; x++) {
        const i = (y * width + x) * 4;
        selectionData[i + 3] = 255;
      }
    }
    const result = generateFeatheredMask(selectionData, width, height, 3);
    expect(result).toContain('data:image/png;base64,');
  });
});
