import { describe, expect, it } from 'vitest';
import { fillContiguousColorRegion } from './ImagePaintBucket';

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

describe('ImagePaintBucket', () => {
  it('fills a contiguous same-color region from the clicked seed', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [255, 0, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 255, 255]);

    const filled = fillContiguousColorRegion(imageData, {
      seed: { x: 0, y: 0 },
      color: '#00ff00',
      opacity: 1,
      tolerance: 0,
    });

    expect(getPixel(filled, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(filled, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(filled, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  it('blends the fill color by opacity', () => {
    const imageData = makeImageData(1, 1);
    setPixel(imageData, 0, 0, [100, 150, 200, 255]);

    const filled = fillContiguousColorRegion(imageData, {
      seed: { x: 0, y: 0 },
      color: '#000000',
      opacity: 0.5,
      tolerance: 0,
    });

    expect(getPixel(filled, 0, 0)).toEqual([50, 75, 100, 255]);
  });
});
