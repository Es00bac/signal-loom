import {
  initializeCanvas,
  readPsd,
  writePsdUint8Array,
  type BlendMode as PsdBlendMode,
  type Layer as PsdLayer,
  type PixelData,
  type Psd,
} from 'ag-psd';
import type { BlendMode, ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createBitmap, getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import { flattenImageDocumentToBitmap } from './ImageDocumentExport';
import { renderLayerWithEffects } from './ImageLayerEffects';
import { rasterizeLayerBitmapTransformed } from './ImageLayerTransform';

export const IMAGE_PSD_MIME_TYPE = 'image/vnd.adobe.photoshop';
export const IMAGE_PSD_EXTENSION = 'psd';
export const SIGNAL_LOOM_PSD_METADATA_KEY = 'signalLoomImageMetadata';

export interface PsdDocumentImportParams {
  id: string;
  title: string;
  sourceBinItemId?: string;
}

let agPsdCanvasInitialized = false;

export function buildPsdDocumentFromImageDocument(doc: ImageDocument): Psd {
  const children = doc.layers
    .map((layer) => imageLayerToPsdLayer(layer))
    .filter((layer): layer is PsdLayer => Boolean(layer))
    .reverse();
  const composite = bitmapToPsdImageData(flattenImageDocumentToBitmap(doc));

  return attachSignalLoomPsdMetadata({
    width: doc.width,
    height: doc.height,
    imageData: composite,
    children,
  }, doc);
}

export async function imageDocumentToPsdBlob(doc: ImageDocument): Promise<Blob> {
  ensureAgPsdCanvas();
  const bytes = writePsdUint8Array(buildPsdDocumentFromImageDocument(doc), {
    generateThumbnail: false,
    noBackground: true,
  });
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Blob([body], { type: IMAGE_PSD_MIME_TYPE });
}

export function psdArrayBufferToImageDocument(
  buffer: ArrayBuffer,
  params: PsdDocumentImportParams,
): ImageDocument {
  const psdKind = detectPhotoshopDocumentKind(buffer);
  if (psdKind === 'psb') {
    throw new Error('PSB large-document files are detected, but Image currently supports layered PSD only. Convert the file to PSD, TIFF, PNG, or JPEG before opening.');
  }
  ensureAgPsdCanvas();
  const psd = readPsd(buffer, {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  return psdDocumentToImageDocument(psd, params);
}

export function detectPhotoshopDocumentKind(buffer: ArrayBuffer): 'psd' | 'psb' | 'unknown' {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 6));
  if (bytes.length < 6 || bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53) {
    return 'unknown';
  }
  const version = (bytes[4] << 8) | bytes[5];
  return version === 2 ? 'psb' : version === 1 ? 'psd' : 'unknown';
}

export function psdDocumentToImageDocument(
  psd: Psd,
  params: PsdDocumentImportParams,
): ImageDocument {
  const pixelLayers = collectPsdPixelLayers(psd.children ?? []).reverse();
  const layers = pixelLayers.map((layer, index) => psdLayerToImageLayer(layer, params.id, index));
  const metadata = readSignalLoomPsdMetadata(psd);
  const layersWithMetadata = layers.map((layer) => {
    const stored = metadata.layers.find((candidate) => candidate.name === layer.name);
    if (!stored) return layer;
    return {
      ...layer,
      type: stored.type ?? layer.type,
      text: stored.text,
      adjustment: stored.adjustment,
      metadata: stored.metadata,
    } as ImageLayer;
  });

  return {
    id: params.id,
    title: params.title,
    width: Math.max(1, Math.floor(psd.width)),
    height: Math.max(1, Math.floor(psd.height)),
    layers: layersWithMetadata,
    activeLayerId: layersWithMetadata[layersWithMetadata.length - 1]?.id ?? null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    sourceBinItemId: params.sourceBinItemId,
  };
}

function imageLayerToPsdLayer(layer: ImageLayer): PsdLayer | null {
  if (!layer.bitmap || layer.type === 'adjustment') return null;

  const rendered = renderLayerWithEffects(layer);
  const raster = rasterizeLayerBitmapTransformed(
    rendered?.bitmap ?? layer.bitmap,
    layer,
    rendered?.offsetX ?? 0,
    rendered?.offsetY ?? 0,
  );
  const bitmap = raster.bitmap;
  const left = raster.left;
  const top = raster.top;

  return {
    name: layer.name,
    left,
    top,
    right: left + bitmap.width,
    bottom: top + bitmap.height,
    opacity: clamp01(layer.opacity),
    hidden: !layer.visible,
    blendMode: imageBlendModeToPsdBlendMode(layer.blendMode),
    imageData: bitmapToPsdImageData(bitmap),
  };
}

export function readSignalLoomPsdMetadata(psd: Psd): {
  version: 1;
  layers: Array<Pick<ImageLayer, 'name' | 'type' | 'text' | 'adjustment' | 'metadata'>>;
} {
  const value = (psd as unknown as Record<string, unknown>)[SIGNAL_LOOM_PSD_METADATA_KEY];
  if (!value || typeof value !== 'object') return { version: 1, layers: [] };
  const record = value as { version?: unknown; layers?: unknown };
  return {
    version: 1,
    layers: Array.isArray(record.layers) ? record.layers as Array<Pick<ImageLayer, 'name' | 'type' | 'text' | 'adjustment' | 'metadata'>> : [],
  };
}

function attachSignalLoomPsdMetadata(psd: Psd, doc: ImageDocument): Psd {
  const metadata = {
    version: 1,
    unsupportedNativeConstructs: 'Signal Loom stores text/source-link/adjustment data as custom metadata when PSD native constructs are not emitted.',
    layers: doc.layers.map((layer) => ({
      name: layer.name,
      type: layer.type,
      text: layer.text,
      adjustment: layer.adjustment,
      metadata: layer.metadata,
    })),
  };
  return Object.assign(psd, { [SIGNAL_LOOM_PSD_METADATA_KEY]: metadata });
}

function psdLayerToImageLayer(layer: PsdLayer, docId: string, index: number): ImageLayer {
  const imageData = layer.imageData;
  const width = Math.max(1, Math.floor(imageData?.width ?? Math.max(1, (layer.right ?? 0) - (layer.left ?? 0))));
  const height = Math.max(1, Math.floor(imageData?.height ?? Math.max(1, (layer.bottom ?? 0) - (layer.top ?? 0))));
  const bitmap = createBitmap(width, height);

  if (imageData) {
    putBitmapImageData(bitmap, pixelDataToImageData(imageData));
  } else if (layer.canvas) {
    const ctx = bitmap.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D context for imported PSD layer.');
    ctx.drawImage(layer.canvas, 0, 0);
  }

  return {
    id: `${docId}-layer-${index}`,
    name: layer.name?.trim() || `PSD Layer ${index + 1}`,
    type: 'image',
    visible: !layer.hidden,
    locked: false,
    opacity: clamp01(layer.opacity ?? 1),
    blendMode: psdBlendModeToImageBlendMode(layer.blendMode),
    x: Math.floor(layer.left ?? 0),
    y: Math.floor(layer.top ?? 0),
    bitmap,
    bitmapVersion: 0,
    mask: null,
  };
}

function collectPsdPixelLayers(layers: PsdLayer[]): PsdLayer[] {
  const output: PsdLayer[] = [];

  for (const layer of layers) {
    if (Array.isArray(layer.children)) {
      output.push(...collectPsdPixelLayers(layer.children));
      continue;
    }
    if (layer.imageData || layer.canvas) {
      output.push(layer);
    }
  }

  return output;
}

function bitmapToPsdImageData(bitmap: LayerBitmap): PixelData {
  const imageData = getBitmapImageData(bitmap);
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

function pixelDataToImageData(pixelData: PixelData): ImageData {
  const data = new Uint8ClampedArray(pixelData.data);
  if (typeof ImageData !== 'undefined') {
    return new ImageData(data, pixelData.width, pixelData.height);
  }
  return {
    width: pixelData.width,
    height: pixelData.height,
    data,
  } as ImageData;
}

function ensureAgPsdCanvas(): void {
  if (agPsdCanvasInitialized) return;

  initializeCanvas(
    (width, height) => {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      }
      if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
      }
      throw new Error('PSD import/export requires a canvas-capable browser environment.');
    },
    (width, height) => {
      if (typeof ImageData !== 'undefined') {
        return new ImageData(width, height);
      }
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('PSD import/export could not create ImageData.');
      }
      return ctx.createImageData(width, height);
    },
  );

  agPsdCanvasInitialized = true;
}

function imageBlendModeToPsdBlendMode(mode: BlendMode): PsdBlendMode {
  switch (mode) {
    case 'color-dodge':
      return 'color dodge';
    case 'color-burn':
      return 'color burn';
    case 'hard-light':
      return 'hard light';
    case 'soft-light':
      return 'soft light';
    default:
      return mode;
  }
}

function psdBlendModeToImageBlendMode(mode: PsdBlendMode | undefined): BlendMode {
  switch (mode) {
    case 'multiply':
    case 'screen':
    case 'overlay':
    case 'darken':
    case 'lighten':
    case 'difference':
    case 'exclusion':
    case 'hue':
    case 'saturation':
    case 'color':
    case 'luminosity':
      return mode;
    case 'color dodge':
      return 'color-dodge';
    case 'color burn':
      return 'color-burn';
    case 'hard light':
      return 'hard-light';
    case 'soft light':
      return 'soft-light';
    default:
      return 'normal';
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}
