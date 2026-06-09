import { describe, expect, it } from 'vitest';
import {
  applyBlurBrushToImageData,
  applyCloneStampToImageData,
  applySpongeBrushToImageData,
  applyToneBrushToImageData,
  applySharpenBrushToImageData,
  applySmudgeBrushToImageData,
  applySpotHealToImageData,
  resolveCloneStampSourcePoint,
} from './ImageRetouch';

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

describe('ImageRetouch', () => {
  it('resolves clone stamp source from the original sample offset', () => {
    expect(resolveCloneStampSourcePoint({
      samplePoint: { x: 10, y: 12 },
      strokeStart: { x: 30, y: 40 },
      targetPoint: { x: 35, y: 44 },
    })).toEqual({ x: 15, y: 16 });
  });

  it('copies sampled pixels into a circular target brush region', () => {
    const imageData = makeImageData(5, 3);
    setPixel(imageData, 0, 1, [255, 0, 0, 255]);
    setPixel(imageData, 1, 1, [0, 255, 0, 255]);
    setPixel(imageData, 2, 1, [0, 0, 255, 255]);

    const cloned = applyCloneStampToImageData(imageData, {
      sourcePoint: { x: 0, y: 1 },
      targetPoint: { x: 3, y: 1 },
      size: 3,
      opacity: 1,
    });

    expect(getPixel(cloned, 3, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(cloned, 4, 1)).toEqual([0, 255, 0, 255]);
    expect(getPixel(cloned, 2, 1)).toEqual([0, 0, 255, 255]);
  });

  it('blends clone stamp pixels by opacity', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [200, 100, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 100, 255]);

    const cloned = applyCloneStampToImageData(imageData, {
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 2, y: 0 },
      size: 1,
      opacity: 0.5,
    });

    expect(getPixel(cloned, 2, 0)).toEqual([100, 50, 50, 255]);
  });

  it('spot heals a blemish from nearby surrounding pixels', () => {
    const imageData = makeImageData(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        setPixel(imageData, x, y, [80, 120, 160, 255]);
      }
    }
    setPixel(imageData, 2, 2, [255, 0, 0, 255]);

    const healed = applySpotHealToImageData(imageData, {
      targetPoint: { x: 2, y: 2 },
      size: 3,
      opacity: 1,
    });

    expect(getPixel(healed, 2, 2)).toEqual([80, 120, 160, 255]);
  });

  it('spot heal respects opacity when blending the repair color', () => {
    const imageData = makeImageData(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        setPixel(imageData, x, y, [20, 100, 180, 255]);
      }
    }
    setPixel(imageData, 1, 1, [220, 0, 0, 255]);

    const healed = applySpotHealToImageData(imageData, {
      targetPoint: { x: 1, y: 1 },
      size: 1,
      opacity: 0.5,
    });

    expect(getPixel(healed, 1, 1)).toEqual([120, 50, 90, 255]);
  });

  it('blur brush softens only the brushed target region', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 255, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 255, 255]);

    const blurred = applyBlurBrushToImageData(imageData, {
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 1,
    });

    expect(getPixel(blurred, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(blurred, 1, 0)).toEqual([85, 85, 85, 255]);
    expect(getPixel(blurred, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  it('blur brush strength controls the amount of local softening', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 255, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 255, 255]);

    const blurred = applyBlurBrushToImageData(imageData, {
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(blurred, 1, 0)).toEqual([43, 170, 43, 255]);
  });

  it('sharpen brush increases local contrast only in the brushed target region', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [80, 80, 80, 255]);
    setPixel(imageData, 1, 0, [100, 120, 100, 255]);
    setPixel(imageData, 2, 0, [80, 80, 80, 255]);

    const sharpened = applySharpenBrushToImageData(imageData, {
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 1,
    });

    expect(getPixel(sharpened, 0, 0)).toEqual([80, 80, 80, 255]);
    expect(getPixel(sharpened, 1, 0)).toEqual([113, 147, 113, 255]);
    expect(getPixel(sharpened, 2, 0)).toEqual([80, 80, 80, 255]);
  });

  it('sharpen brush strength controls the amount of local contrast added', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [80, 80, 80, 255]);
    setPixel(imageData, 1, 0, [100, 120, 100, 255]);
    setPixel(imageData, 2, 0, [80, 80, 80, 255]);

    const sharpened = applySharpenBrushToImageData(imageData, {
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(sharpened, 1, 0)).toEqual([107, 134, 107, 255]);
  });

  it('smudge brush drags sampled pixels into the target region', () => {
    const imageData = makeImageData(3, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 255, 0, 255]);
    setPixel(imageData, 2, 0, [0, 0, 255, 255]);

    const smudged = applySmudgeBrushToImageData(imageData, {
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 1,
    });

    expect(getPixel(smudged, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(smudged, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(smudged, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  it('smudge brush strength controls the dragged-pixel mix', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [255, 0, 0, 255]);
    setPixel(imageData, 1, 0, [0, 255, 0, 255]);

    const smudged = applySmudgeBrushToImageData(imageData, {
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 1, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(smudged, 1, 0)).toEqual([128, 128, 0, 255]);
  });

  it('dodge brush brightens the brushed region toward white', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [100, 150, 200, 255]);
    setPixel(imageData, 1, 0, [10, 20, 30, 255]);

    const dodged = applyToneBrushToImageData(imageData, {
      mode: 'dodge',
      targetPoint: { x: 0, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(dodged, 0, 0)).toEqual([178, 203, 228, 255]);
    expect(getPixel(dodged, 1, 0)).toEqual([10, 20, 30, 255]);
  });

  it('burn brush darkens the brushed region toward black', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [100, 150, 200, 255]);
    setPixel(imageData, 1, 0, [10, 20, 30, 255]);

    const burned = applyToneBrushToImageData(imageData, {
      mode: 'burn',
      targetPoint: { x: 0, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(burned, 0, 0)).toEqual([50, 75, 100, 255]);
    expect(getPixel(burned, 1, 0)).toEqual([10, 20, 30, 255]);
  });

  it('sponge saturate brush increases brushed color separation', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [100, 150, 200, 255]);
    setPixel(imageData, 1, 0, [20, 30, 40, 255]);

    const saturated = applySpongeBrushToImageData(imageData, {
      mode: 'saturate',
      targetPoint: { x: 0, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(saturated, 0, 0)).toEqual([75, 150, 225, 255]);
    expect(getPixel(saturated, 1, 0)).toEqual([20, 30, 40, 255]);
  });

  it('sponge desaturate brush reduces brushed color separation', () => {
    const imageData = makeImageData(2, 1);
    setPixel(imageData, 0, 0, [100, 150, 200, 255]);
    setPixel(imageData, 1, 0, [20, 30, 40, 255]);

    const desaturated = applySpongeBrushToImageData(imageData, {
      mode: 'desaturate',
      targetPoint: { x: 0, y: 0 },
      size: 1,
      strength: 0.5,
    });

    expect(getPixel(desaturated, 0, 0)).toEqual([125, 150, 175, 255]);
    expect(getPixel(desaturated, 1, 0)).toEqual([20, 30, 40, 255]);
  });
});
