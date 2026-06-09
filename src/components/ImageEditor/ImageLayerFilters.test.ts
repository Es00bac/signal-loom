import { describe, expect, it } from 'vitest';
import type { ImageLayerFilter } from '../../types/imageEditor';
import {
  applyLayerFiltersToImageData,
  createDefaultLayerFilter,
} from './ImageLayerFilters';

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;
}

function setPixel(imageData: ImageData, x: number, y: number, rgba: [number, number, number, number]) {
  const offset = (y * imageData.width + x) * 4;
  imageData.data[offset] = rgba[0];
  imageData.data[offset + 1] = rgba[1];
  imageData.data[offset + 2] = rgba[2];
  imageData.data[offset + 3] = rgba[3];
}

function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const offset = (y * imageData.width + x) * 4;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

function makeFilters(...filters: ImageLayerFilter[]): ImageLayerFilter[] {
  return filters;
}

describe('ImageLayerFilters', () => {
  it('creates enabled default layer filters', () => {
    expect(createDefaultLayerFilter('blur')).toMatchObject({
      kind: 'blur',
      enabled: true,
      amount: 8,
    });
    expect(createDefaultLayerFilter('grayscale')).toMatchObject({
      kind: 'grayscale',
      enabled: true,
      amount: 100,
    });
    expect(createDefaultLayerFilter('pixelate')).toMatchObject({
      kind: 'pixelate',
      enabled: true,
      amount: 8,
    });
  });

  it('applies grayscale while preserving alpha', () => {
    const imageData = makeImageData(1, 1);
    setPixel(imageData, 0, 0, [200, 10, 10, 128]);

    const filtered = applyLayerFiltersToImageData(imageData, makeFilters({
      id: 'gray',
      kind: 'grayscale',
      enabled: true,
      amount: 100,
    }));

    expect(getPixel(filtered, 0, 0)).toEqual([50, 50, 50, 128]);
  });

  it('applies box blur to neighboring pixels', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 0, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 0, 255]);

    const filtered = applyLayerFiltersToImageData(imageData, makeFilters({
      id: 'blur',
      kind: 'blur',
      enabled: true,
      amount: 1,
    }));

    expect(getPixel(filtered, 1, 0)).toEqual([85, 0, 0, 255]);
  });

  it('applies sepia and ignores disabled filters', () => {
    const imageData = makeImageData(1, 1);
    setPixel(imageData, 0, 0, [100, 100, 100, 255]);

    const filtered = applyLayerFiltersToImageData(imageData, makeFilters(
      { id: 'off', kind: 'invert', enabled: false, amount: 100 },
      { id: 'sepia', kind: 'sepia', enabled: true, amount: 100 },
    ));

    expect(getPixel(filtered, 0, 0)).toEqual([135, 120, 94, 255]);
  });

  it('applies pixelate by averaging pixels inside a block', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 0, 255, 255]);

    const filtered = applyLayerFiltersToImageData(imageData, makeFilters({
      id: 'pixelate',
      kind: 'pixelate',
      enabled: true,
      amount: 2,
    }));

    expect(getPixel(filtered, 0, 0)).toEqual([128, 0, 128, 255]);
    expect(getPixel(filtered, 1, 0)).toEqual([128, 0, 128, 255]);
  });

  it('applies deterministic noise while preserving alpha', () => {
    const imageData = makeImageData(1, 1);
    setPixel(imageData, 0, 0, [100, 100, 100, 200]);

    const filtered = applyLayerFiltersToImageData(imageData, makeFilters({
      id: 'noise',
      kind: 'noise',
      enabled: true,
      amount: 50,
    }));

    expect(getPixel(filtered, 0, 0)).not.toEqual([100, 100, 100, 200]);
    expect(getPixel(filtered, 0, 0)[3]).toBe(200);
  });
});
