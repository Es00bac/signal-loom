import type {
  AdjustmentLayerKind,
  ImageAdjustmentSettings,
  ImageDocument,
  ImageLayer,
  LayerBitmap,
} from '../../types/imageEditor';
import { createBitmap, getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import { renderLayerWithEffects } from './ImageLayerEffects';
import { drawLayerBitmapTransformed } from './ImageLayerTransform';

export function defaultAdjustmentSettings(kind: AdjustmentLayerKind): ImageAdjustmentSettings {
  switch (kind) {
    case 'brightnessContrast':
      return { kind, brightness: 0, contrast: 0 };
    case 'hueSaturation':
      return { kind, hue: 0, saturation: 0, lightness: 0 };
    case 'blackWhite':
      return { kind };
    case 'invert':
      return { kind };
    case 'exposure':
      return { kind, exposure: 0, offset: 0, gamma: 1 };
    case 'temperatureTint':
      return { kind, temperature: 0, tint: 0 };
    case 'levels':
      return { kind, channel: 'rgb', inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 };
    case 'curves':
      return { kind, channel: 'rgb', points: [{ input: 0, output: 0 }, { input: 255, output: 255 }], shadows: 0, midtones: 0, highlights: 0 };
  }
}

export function createAdjustmentLayer(
  _doc: ImageDocument,
  kind: AdjustmentLayerKind = 'brightnessContrast',
  name?: string,
): ImageLayer {
  const id = `layer-adjustment-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return {
    id,
    name: name ?? adjustmentLayerLabel(kind),
    type: 'adjustment',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: null,
    bitmapVersion: 0,
    mask: null,
    adjustment: defaultAdjustmentSettings(kind),
  };
}

export function adjustmentLayerLabel(kind: AdjustmentLayerKind): string {
  switch (kind) {
    case 'brightnessContrast':
      return 'Brightness/Contrast';
    case 'hueSaturation':
      return 'Hue/Saturation';
    case 'blackWhite':
      return 'Black & White';
    case 'invert':
      return 'Invert';
    case 'exposure':
      return 'Exposure';
    case 'temperatureTint':
      return 'Temperature/Tint';
    case 'levels':
      return 'Levels';
    case 'curves':
      return 'Curves';
  }
}

export function renderImageDocumentLayersToBitmap(doc: ImageDocument): LayerBitmap {
  const bitmap = createBitmap(doc.width, doc.height);
  const ctx = getCtx(bitmap);
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'adjustment' && layer.adjustment) {
      applyAdjustmentLayerToBitmap(bitmap, layer);
      continue;
    }
    paintPixelLayer(ctx, layer);
  }

  return bitmap;
}

export function applyAdjustmentLayerToBitmap(target: LayerBitmap, layer: ImageLayer): void {
  if (!layer.adjustment) return;
  const source = getBitmapImageData(target);
  const mask = layer.mask ? getBitmapImageData(layer.mask) : undefined;
  const adjusted = applyAdjustmentToImageData(source, layer.adjustment, {
    opacity: layer.opacity,
    mask,
  });
  putBitmapImageData(target, adjusted);
}


export function applyAdjustmentToImageData(
  source: ImageData,
  adjustment: ImageAdjustmentSettings,
  options: {
    opacity?: number;
    mask?: ImageData;
  } = {},
): ImageData {
  const output = cloneImageData(source);
  const opacity = clamp01(options.opacity ?? 1);
  const hasMask = !!options.mask;
  const maskData = options.mask?.data;
  const maskWidth = options.mask?.width ?? 0;
  const maskHeight = options.mask?.height ?? 0;
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourceData = source.data;
  const outputData = output.data;

  const kind = adjustment.kind;
  const isSeparable = kind !== 'hueSaturation' && kind !== 'blackWhite';

  if (isSeparable) {
    const lutR = new Uint8ClampedArray(256);
    const lutG = new Uint8ClampedArray(256);
    const lutB = new Uint8ClampedArray(256);

    const tempPixel: Rgba = [0, 0, 0, 255];
    for (let i = 0; i < 256; i++) {
      tempPixel[0] = i; tempPixel[1] = 0; tempPixel[2] = 0;
      lutR[i] = applyAdjustmentToPixel(tempPixel, adjustment)[0];

      tempPixel[0] = 0; tempPixel[1] = i; tempPixel[2] = 0;
      lutG[i] = applyAdjustmentToPixel(tempPixel, adjustment)[1];

      tempPixel[0] = 0; tempPixel[1] = 0; tempPixel[2] = i;
      lutB[i] = applyAdjustmentToPixel(tempPixel, adjustment)[2];
    }

    for (let y = 0; y < sourceHeight; y++) {
      const rowOffset = y * sourceWidth;
      for (let x = 0; x < sourceWidth; x++) {
        const offset = (rowOffset + x) * 4;
        const rIn = sourceData[offset];
        const gIn = sourceData[offset + 1];
        const bIn = sourceData[offset + 2];
        const aIn = sourceData[offset + 3];

        const rOut = lutR[rIn];
        const gOut = lutG[gIn];
        const bOut = lutB[bIn];

        let maskAlpha = 1;
        if (hasMask && maskData) {
          if (x >= 0 && y >= 0 && x < maskWidth && y < maskHeight) {
            maskAlpha = maskData[(y * maskWidth + x) * 4 + 3] / 255;
            if (maskAlpha < 0) maskAlpha = 0;
            if (maskAlpha > 1) maskAlpha = 1;
          }
        }

        const mix = opacity * maskAlpha;
        if (mix >= 1) {
          outputData[offset] = rOut;
          outputData[offset + 1] = gOut;
          outputData[offset + 2] = bOut;
        } else if (mix <= 0) {
          outputData[offset] = rIn;
          outputData[offset + 1] = gIn;
          outputData[offset + 2] = bIn;
        } else {
          outputData[offset] = rIn + (rOut - rIn) * mix;
          outputData[offset + 1] = gIn + (gOut - gIn) * mix;
          outputData[offset + 2] = bIn + (bOut - bIn) * mix;
        }
        outputData[offset + 3] = aIn;
      }
    }
  } else {
    const tempPixel: Rgba = [0, 0, 0, 0];
    for (let y = 0; y < sourceHeight; y++) {
      const rowOffset = y * sourceWidth;
      for (let x = 0; x < sourceWidth; x++) {
        const offset = (rowOffset + x) * 4;
        const rIn = sourceData[offset];
        const gIn = sourceData[offset + 1];
        const bIn = sourceData[offset + 2];
        const aIn = sourceData[offset + 3];

        tempPixel[0] = rIn;
        tempPixel[1] = gIn;
        tempPixel[2] = bIn;
        tempPixel[3] = aIn;

        const adjusted = applyAdjustmentToPixel(tempPixel, adjustment);
        const rOut = adjusted[0];
        const gOut = adjusted[1];
        const bOut = adjusted[2];

        let maskAlpha = 1;
        if (hasMask && maskData) {
          if (x >= 0 && y >= 0 && x < maskWidth && y < maskHeight) {
            maskAlpha = maskData[(y * maskWidth + x) * 4 + 3] / 255;
            if (maskAlpha < 0) maskAlpha = 0;
            if (maskAlpha > 1) maskAlpha = 1;
          }
        }

        const mix = opacity * maskAlpha;
        if (mix >= 1) {
          outputData[offset] = rOut;
          outputData[offset + 1] = gOut;
          outputData[offset + 2] = bOut;
        } else if (mix <= 0) {
          outputData[offset] = rIn;
          outputData[offset + 1] = gIn;
          outputData[offset + 2] = bIn;
        } else {
          outputData[offset] = rIn + (rOut - rIn) * mix;
          outputData[offset + 1] = gIn + (gOut - gIn) * mix;
          outputData[offset + 2] = bIn + (bOut - bIn) * mix;
        }
        outputData[offset + 3] = aIn;
      }
    }
  }

  return output;
}


const svgImageCache = new Map<string, { img: HTMLImageElement; loaded: boolean }>();

function paintVectorLayerDirectly(
  ctx: OffscreenCanvasRenderingContext2D,
  svgSource: string,
  layer: ImageLayer,
): void {
  let cached = svgImageCache.get(svgSource);
  if (!cached) {
    const img = new Image();
    const blob = new Blob([svgSource], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    cached = { img, loaded: false };
    svgImageCache.set(svgSource, cached);

    img.onload = () => {
      if (cached) {
        cached.loaded = true;
      }
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('sloom-svg-loaded'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  if (cached.loaded) {
    ctx.save();
    ctx.globalAlpha = clamp01(layer.opacity);
    ctx.globalCompositeOperation = toCanvasCompositeOperation(layer.blendMode);

    if (layer.mask) {
      const maskWidth = layer.mask.width;
      const maskHeight = layer.mask.height;
      const tempBitmap = createBitmap(maskWidth, maskHeight);
      const tempCtx = getCtx(tempBitmap);
      tempCtx.drawImage(cached.img, 0, 0, maskWidth, maskHeight);
      tempCtx.globalCompositeOperation = 'destination-in';
      tempCtx.drawImage(layer.mask, 0, 0);
      drawLayerBitmapTransformed(ctx, tempBitmap, layer);
    } else {
      drawLayerBitmapTransformed(ctx, cached.img, layer);
    }

    ctx.restore();
  }
}

function paintPixelLayer(ctx: OffscreenCanvasRenderingContext2D, layer: ImageLayer): void {
  if (!layer.bitmap) {
    if (layer.type === 'vector') {
      const svgSource = layer.vectorRecipe || layer.metadata?.originalSvgSource;
      if (svgSource) {
        paintVectorLayerDirectly(ctx, svgSource, layer);
      }
    }
    return;
  }
  const styled = layer.effects?.some((effect) => effect.enabled) || layer.filters?.some((filter) => filter.enabled)
    ? renderLayerWithEffects(layer)
    : null;

  ctx.save();
  ctx.globalAlpha = clamp01(layer.opacity);
  ctx.globalCompositeOperation = toCanvasCompositeOperation(layer.blendMode);
  if (styled) {
    drawLayerBitmapTransformed(ctx, styled.bitmap, layer, styled.offsetX, styled.offsetY);
  } else {
    drawLayerBitmapTransformed(ctx, layer.mask ? composeLayerWithMask(layer) : layer.bitmap, layer);
  }
  ctx.restore();
}

function composeLayerWithMask(layer: ImageLayer): LayerBitmap {
  if (!layer.bitmap || !layer.mask) {
    throw new Error('Cannot compose a layer mask without both a bitmap and mask.');
  }
  const bitmap = createBitmap(layer.bitmap.width, layer.bitmap.height);
  const ctx = getCtx(bitmap);
  ctx.drawImage(layer.bitmap, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(layer.mask, 0, 0);
  return bitmap;
}

export function applyAdjustmentToPixel(pixel: Rgba, adjustment: ImageAdjustmentSettings): Rgba {
  const [r, g, b, a] = pixel;
  switch (adjustment.kind) {
    case 'brightnessContrast':
      return applyBrightnessContrast(r, g, b, a, adjustment.brightness, adjustment.contrast);
    case 'hueSaturation':
      return applyHueSaturation(r, g, b, a, adjustment.hue, adjustment.saturation, adjustment.lightness);
    case 'blackWhite':
      return applyBlackWhite(r, g, b, a);
    case 'invert':
      return [255 - r, 255 - g, 255 - b, a];
    case 'exposure':
      return applyExposure(r, g, b, a, adjustment.exposure, adjustment.offset, adjustment.gamma);
    case 'temperatureTint':
      return applyTemperatureTint(r, g, b, a, adjustment.temperature, adjustment.tint);
    case 'levels':
      return applyByChannel([r, g, b, a], adjustment.channel, (channel) => applyLevelsChannel(channel, adjustment.inputBlack, adjustment.inputWhite, adjustment.gamma, adjustment.outputBlack, adjustment.outputWhite));
    case 'curves':
      return applyByChannel([r, g, b, a], adjustment.channel, (channel) => applyCurvesChannel(channel, adjustment.points, adjustment.shadows, adjustment.midtones, adjustment.highlights));
  }
}

export function applyBrightnessContrast(
  r: number,
  g: number,
  b: number,
  a: number,
  brightness: number,
  contrast: number,
): Rgba {
  const c = clamp(contrast, -255, 255);
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  return [
    clampByte(factor * (r - 128) + 128 + brightness),
    clampByte(factor * (g - 128) + 128 + brightness),
    clampByte(factor * (b - 128) + 128 + brightness),
    a,
  ];
}

export function applyHueSaturation(
  r: number,
  g: number,
  b: number,
  a: number,
  hue: number,
  saturation: number,
  lightness: number,
): Rgba {
  const hsl = rgbToHsl(r, g, b);
  const h = wrap01(hsl[0] + hue / 360);
  const s = clamp01(hsl[1] * (1 + saturation / 100));
  const l = clamp01(hsl[2] + lightness / 100);
  const rgb = hslToRgb(h, s, l);
  return [rgb[0], rgb[1], rgb[2], a];
}

export function applyBlackWhite(r: number, g: number, b: number, a: number): Rgba {
  const luma = clampByte(r * 0.2126 + g * 0.7152 + b * 0.0722);
  return [luma, luma, luma, a];
}

export function applyExposure(
  r: number,
  g: number,
  b: number,
  a: number,
  exposure: number,
  offset: number,
  gamma: number,
): Rgba {
  const safeGamma = Math.max(0.01, gamma || 1);
  const adjust = (channel: number) => {
    const exposed = (channel / 255) * 2 ** exposure + offset;
    return clampByte(255 * Math.max(0, exposed) ** (1 / safeGamma));
  };
  return [adjust(r), adjust(g), adjust(b), a];
}

export function applyTemperatureTint(
  r: number,
  g: number,
  b: number,
  a: number,
  temperature: number,
  tint: number,
): Rgba {
  return [
    clampByte(r + temperature - tint * 0.25),
    clampByte(g + tint),
    clampByte(b - temperature - tint * 0.25),
    a,
  ];
}

export function applyLevelsChannel(
  channel: number,
  inputBlack: number,
  inputWhite: number,
  gamma: number,
  outputBlack: number,
  outputWhite: number,
): number {
  const black = clamp(inputBlack, 0, 254);
  const white = Math.max(black + 1, clamp(inputWhite, 1, 255));
  const safeGamma = Math.max(0.05, gamma || 1);
  const outBlack = clamp(outputBlack, 0, 255);
  const outWhite = clamp(outputWhite, 0, 255);
  const normalized = clamp01((channel - black) / (white - black));
  const corrected = normalized ** (1 / safeGamma);
  return clampByte(outBlack + corrected * (outWhite - outBlack));
}

export function applyCurvesChannel(
  channel: number,
  points: Array<{ input: number; output: number }> | undefined,
  shadows: number,
  midtones: number,
  highlights: number,
): number {
  const curve = evaluateCurvePoints(channel, points);
  const t = channel / 255;
  const shadowWeight = (1 - t) * (1 - t);
  const midtoneWeight = 4 * t * (1 - t);
  const highlightWeight = t * t;
  const delta = shadows * shadowWeight + midtones * midtoneWeight + highlights * highlightWeight;
  return clampByte(curve + delta);
}

export function applyByChannel(
  pixel: Rgba,
  channel: 'rgb' | 'red' | 'green' | 'blue',
  apply: (channel: number) => number,
): Rgba {
  const [r, g, b, a] = pixel;
  if (channel === 'red') return [apply(r), g, b, a];
  if (channel === 'green') return [r, apply(g), b, a];
  if (channel === 'blue') return [r, g, apply(b), a];
  return [apply(r), apply(g), apply(b), a];
}

export function evaluateCurvePoints(
  channel: number,
  points: Array<{ input: number; output: number }> | undefined,
): number {
  const normalized = (points?.length ? points : [{ input: 0, output: 0 }, { input: 255, output: 255 }])
    .map((point) => ({ input: clamp(point.input, 0, 255), output: clamp(point.output, 0, 255) }))
    .sort((a, b) => a.input - b.input);
  if (channel <= normalized[0].input) return normalized[0].output;
  for (let index = 1; index < normalized.length; index += 1) {
    const prev = normalized[index - 1];
    const next = normalized[index];
    if (channel <= next.input) {
      const span = Math.max(1, next.input - prev.input);
      const t = (channel - prev.input) / span;
      return prev.output + (next.output - prev.output) * t;
    }
  }
  return normalized[normalized.length - 1].output;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === red) {
    h = (green - blue) / d + (green < blue ? 6 : 0);
  } else if (max === green) {
    h = (blue - red) / d + 2;
  } else {
    h = (red - green) / d + 4;
  }

  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const gray = clampByte(l * 255);
    return [gray, gray, gray];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clampByte(hueToRgb(p, q, h + 1 / 3) * 255),
    clampByte(hueToRgb(p, q, h) * 255),
    clampByte(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

export function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

export function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function toCanvasCompositeOperation(blendMode: ImageLayer['blendMode']): GlobalCompositeOperation {
  return blendMode === 'normal' ? 'source-over' : blendMode;
}

function getCtx(bitmap: LayerBitmap): OffscreenCanvasRenderingContext2D {
  const ctx = bitmap.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for image adjustment layer.');
  return ctx;
}

export function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

type Rgba = [number, number, number, number];
