import type {
  ImageLayer,
  ImageLayerEffect,
  LayerBitmap,
  LayerEffectKind,
} from '../../types/imageEditor';
import { createBitmap, getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import { applyLayerFiltersToImageData } from './ImageLayerFilters';

export interface RenderedLayerWithEffects {
  bitmap: LayerBitmap;
  offsetX: number;
  offsetY: number;
}

export function createDefaultLayerEffect(kind: LayerEffectKind): ImageLayerEffect {
  const id = `effect-${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  switch (kind) {
    case 'stroke':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      };
    case 'dropShadow':
      return {
        id,
        kind,
        enabled: true,
        color: '#000000',
        opacity: 0.65,
        angle: 45,
        distance: 12,
        size: 12,
      };
    case 'outerGlow':
      return {
        id,
        kind,
        enabled: true,
        color: '#60a5fa',
        opacity: 0.7,
        size: 12,
      };
    case 'colorOverlay':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        opacity: 1,
      };
  }
}

export function layerEffectLabel(kind: LayerEffectKind): string {
  switch (kind) {
    case 'stroke':
      return 'Stroke';
    case 'dropShadow':
      return 'Drop Shadow';
    case 'outerGlow':
      return 'Outer Glow';
    case 'colorOverlay':
      return 'Color Overlay';
  }
}

export function renderLayerWithEffects(layer: ImageLayer): RenderedLayerWithEffects | null {
  if (!layer.bitmap) return null;

  const enabledEffects = (layer.effects ?? []).filter((effect) => effect.enabled);
  const source = getLayerSourceImageData(layer);
  const padding = resolveEffectPadding(source, enabledEffects);
  const output = createBitmap(source.width + padding.left + padding.right, source.height + padding.top + padding.bottom);
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire layer effect render context');
  const imageData = ctx.createImageData(output.width, output.height);

  for (const effect of enabledEffects) {
    renderEffectInto(imageData, source, effect, padding.left, padding.top);
  }

  const content = applyContentEffects(source, enabledEffects);
  compositeImageData(imageData, content, padding.left, padding.top);
  putBitmapImageData(output, imageData);

  return {
    bitmap: output,
    offsetX: padding.left === 0 ? 0 : -padding.left,
    offsetY: padding.top === 0 ? 0 : -padding.top,
  };
}

function getLayerSourceImageData(layer: ImageLayer): ImageData {
  if (!layer.bitmap) {
    throw new Error('Cannot read image data from a layer without a bitmap.');
  }
  const source = getBitmapImageData(layer.bitmap);
  if (!layer.mask) return applyLayerFiltersToImageData(source, layer.filters);

  const mask = getBitmapImageData(layer.mask);
  const masked = cloneImageData(source);
  for (let y = 0; y < masked.height; y += 1) {
    for (let x = 0; x < masked.width; x += 1) {
      const offset = (y * masked.width + x) * 4;
      const maskAlpha =
        x < mask.width && y < mask.height
          ? mask.data[(y * mask.width + x) * 4 + 3] / 255
          : 0;
      masked.data[offset + 3] = Math.round(masked.data[offset + 3] * maskAlpha);
    }
  }
  return applyLayerFiltersToImageData(masked, layer.filters);
}

function renderEffectInto(
  target: ImageData,
  source: ImageData,
  effect: ImageLayerEffect,
  originX: number,
  originY: number,
): void {
  switch (effect.kind) {
    case 'stroke':
      renderStroke(target, source, effect, originX, originY);
      break;
    case 'dropShadow':
      renderSpreadAlphaEffect(target, source, {
        color: effect.color,
        opacity: effect.opacity,
        radius: effect.size,
        offsetX: Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance),
        offsetY: Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance),
        originX,
        originY,
        outsideOnly: false,
      });
      break;
    case 'outerGlow':
      renderSpreadAlphaEffect(target, source, {
        color: effect.color,
        opacity: effect.opacity,
        radius: effect.size,
        offsetX: 0,
        offsetY: 0,
        originX,
        originY,
        outsideOnly: true,
      });
      break;
    case 'colorOverlay':
      break;
  }
}

function renderStroke(
  target: ImageData,
  source: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'stroke' }>,
  originX: number,
  originY: number,
): void {
  const color = parseCssColor(effect.color);
  const radius = Math.max(0, Math.round(effect.size));
  if (radius === 0 || effect.opacity <= 0) return;

  forEachOpaquePixel(source, (x, y, alpha) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius + 0.001) continue;
        const sx = x + dx;
        const sy = y + dy;
        const sourceAlphaAtTarget = sampleAlpha(source, sx, sy);
        const isInside = sourceAlphaAtTarget > 0;
        if (effect.position === 'outside' && isInside) continue;
        if (effect.position === 'inside' && !isInside) continue;
        const feather = radius <= 1 ? 1 : clamp01(1 - Math.max(0, distance - radius + 1));
        const effectAlpha = alpha * effect.opacity * feather;
        blendPixel(target, originX + sx, originY + sy, color, effectAlpha);
      }
    }
  });
}

function renderSpreadAlphaEffect(
  target: ImageData,
  source: ImageData,
  options: {
    color: string;
    opacity: number;
    radius: number;
    offsetX: number;
    offsetY: number;
    originX: number;
    originY: number;
    outsideOnly: boolean;
  },
): void {
  const color = parseCssColor(options.color);
  const radius = Math.max(0, Math.round(options.radius));

  forEachOpaquePixel(source, (x, y, alpha) => {
    const spread = Math.max(0, radius);
    for (let dy = -spread; dy <= spread; dy += 1) {
      for (let dx = -spread; dx <= spread; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > spread + 0.001) continue;
        const sx = x + options.offsetX + dx;
        const sy = y + options.offsetY + dy;
        if (options.outsideOnly && sampleAlpha(source, sx, sy) > 0) continue;
        const falloff = spread === 0 ? 1 : clamp01(1 - distance / (spread + 1));
        blendPixel(
          target,
          options.originX + sx,
          options.originY + sy,
          color,
          alpha * options.opacity * falloff,
        );
      }
    }
  });
}

function applyContentEffects(source: ImageData, effects: ImageLayerEffect[]): ImageData {
  const output = cloneImageData(source);
  const overlays = effects.filter(
    (effect): effect is Extract<ImageLayerEffect, { kind: 'colorOverlay' }> =>
      effect.kind === 'colorOverlay' && effect.enabled,
  );

  for (const overlay of overlays) {
    const color = parseCssColor(overlay.color);
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        const offset = (y * output.width + x) * 4;
        const alpha = output.data[offset + 3] / 255;
        if (alpha <= 0) continue;
        const opacity = clamp01(overlay.opacity);
        output.data[offset] = mixByte(output.data[offset], color[0], opacity);
        output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], opacity);
        output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], opacity);
      }
    }
  }

  return output;
}

function resolveEffectPadding(
  source: ImageData,
  effects: ImageLayerEffect[],
): { left: number; right: number; top: number; bottom: number } {
  const padding = { left: 0, right: 0, top: 0, bottom: 0 };

  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.kind === 'stroke') {
      const size = Math.max(0, Math.ceil(effect.size));
      if (effect.position !== 'inside') {
        padding.left = Math.max(padding.left, size);
        padding.right = Math.max(padding.right, size);
        padding.top = Math.max(padding.top, size);
        padding.bottom = Math.max(padding.bottom, size);
      }
    }

    if (effect.kind === 'outerGlow') {
      const size = Math.max(0, Math.ceil(effect.size));
      padding.left = Math.max(padding.left, size);
      padding.right = Math.max(padding.right, size);
      padding.top = Math.max(padding.top, size);
      padding.bottom = Math.max(padding.bottom, size);
    }

    if (effect.kind === 'dropShadow') {
      const size = Math.max(0, Math.ceil(effect.size));
      const dx = Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance);
      const dy = Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance);
      padding.left = Math.max(padding.left, size + Math.max(0, -dx));
      padding.right = Math.max(padding.right, size + Math.max(0, dx));
      padding.top = Math.max(padding.top, size + Math.max(0, -dy));
      padding.bottom = Math.max(padding.bottom, size + Math.max(0, dy));
    }
  }

  // Keep layer-effect buffers bounded by the source dimensions plus realistic
  // effect extents. This also prevents empty effects from creating zero-size
  // or unexpectedly huge buffers.
  return {
    left: Math.min(source.width * 2, padding.left),
    right: Math.min(source.width * 2, padding.right),
    top: Math.min(source.height * 2, padding.top),
    bottom: Math.min(source.height * 2, padding.bottom),
  };
}

function compositeImageData(target: ImageData, source: ImageData, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3] / 255;
      if (alpha <= 0) continue;
      blendPixel(target, dx + x, dy + y, [
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
      ], alpha);
    }
  }
}

function forEachOpaquePixel(
  imageData: ImageData,
  callback: (x: number, y: number, alpha: number) => void,
): void {
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const alpha = imageData.data[(y * imageData.width + x) * 4 + 3] / 255;
      if (alpha > 0) callback(x, y, alpha);
    }
  }
}

function sampleAlpha(imageData: ImageData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return 0;
  return imageData.data[(y * imageData.width + x) * 4 + 3] / 255;
}

function blendPixel(
  imageData: ImageData,
  x: number,
  y: number,
  color: [number, number, number],
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return;
  const offset = (y * imageData.width + x) * 4;
  const sourceAlpha = clamp01(alpha);
  const destAlpha = imageData.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;

  imageData.data[offset] = Math.round(
    (color[0] * sourceAlpha + imageData.data[offset] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 1] = Math.round(
    (color[1] * sourceAlpha + imageData.data[offset + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 2] = Math.round(
    (color[2] * sourceAlpha + imageData.data[offset + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 3] = Math.round(outAlpha * 255);
}

function parseCssColor(color: string): [number, number, number] {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return [
      parseInt(trimmed.slice(1, 3), 16),
      parseInt(trimmed.slice(3, 5), 16),
      parseInt(trimmed.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return [
      parseInt(trimmed[1] + trimmed[1], 16),
      parseInt(trimmed[2] + trimmed[2], 16),
      parseInt(trimmed[3] + trimmed[3], 16),
    ];
  }
  return [255, 255, 255];
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function mixByte(before: number, after: number, opacity: number): number {
  return Math.round(before + (after - before) * clamp01(opacity));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
