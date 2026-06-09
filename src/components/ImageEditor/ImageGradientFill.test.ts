import { describe, expect, it } from 'vitest';
import { applyLinearGradientToImageData } from './ImageGradientFill';

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;
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

describe('ImageGradientFill', () => {
  it('applies a foreground-to-transparent linear gradient along the drag vector', () => {
    const imageData = makeImageData(3, 1);

    const gradient = applyLinearGradientToImageData(imageData, {
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
      color: '#ff0000',
      opacity: 1,
    });

    expect(getPixel(gradient, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(gradient, 1, 0)).toEqual([128, 0, 0, 128]);
    expect(getPixel(gradient, 2, 0)).toEqual([0, 0, 0, 0]);
  });

  it('blends gradient color over existing pixels by opacity', () => {
    const imageData = makeImageData(1, 1);
    imageData.data.set([100, 100, 100, 255]);

    const gradient = applyLinearGradientToImageData(imageData, {
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      color: '#ffffff',
      opacity: 0.5,
    });

    expect(getPixel(gradient, 0, 0)).toEqual([178, 178, 178, 255]);
  });
});
