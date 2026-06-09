import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';

export type CanvasResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface ImageDocumentScaleResult {
  width: number;
  height: number;
}

export function scaleImageDocumentToPercent(
  doc: Pick<ImageDocument, 'width' | 'height'>,
  percent: number,
): ImageDocumentScaleResult {
  const scale = Math.max(1, percent) / 100;
  return {
    width: clampDocumentDimension(Math.round(doc.width * scale)),
    height: clampDocumentDimension(Math.round(doc.height * scale)),
  };
}

export function resizeImageDocumentPixels(
  doc: ImageDocument,
  width: number,
  height: number,
): ImageDocument {
  const nextWidth = clampDocumentDimension(width);
  const nextHeight = clampDocumentDimension(height);
  if (nextWidth === doc.width && nextHeight === doc.height) return doc;

  const scaleX = nextWidth / doc.width;
  const scaleY = nextHeight / doc.height;

  return {
    ...doc,
    width: nextWidth,
    height: nextHeight,
    layers: doc.layers.map((layer) => resizeLayerPixels(layer, scaleX, scaleY)),
    dirty: true,
  };
}

export function resizeImageCanvas(
  doc: ImageDocument,
  width: number,
  height: number,
  anchor: CanvasResizeAnchor = 'center',
): ImageDocument {
  const nextWidth = clampDocumentDimension(width);
  const nextHeight = clampDocumentDimension(height);
  if (nextWidth === doc.width && nextHeight === doc.height) return doc;

  const offset = canvasAnchorOffset(doc.width, doc.height, nextWidth, nextHeight, anchor);

  return {
    ...doc,
    width: nextWidth,
    height: nextHeight,
    layers: doc.layers.map((layer) => ({
      ...layer,
      x: roundLayerPosition(layer.x + offset.x),
      y: roundLayerPosition(layer.y + offset.y),
    })),
    dirty: true,
  };
}

function resizeLayerPixels(layer: ImageLayer, scaleX: number, scaleY: number): ImageLayer {
  const bitmap = layer.bitmap ? resizeBitmap(layer.bitmap, scaleX, scaleY) : null;
  const mask = layer.mask ? resizeBitmap(layer.mask, scaleX, scaleY) : null;
  const bitmapVersion = bitmap || mask ? layer.bitmapVersion + 1 : layer.bitmapVersion;

  return {
    ...layer,
    x: roundLayerPosition(layer.x * scaleX),
    y: roundLayerPosition(layer.y * scaleY),
    bitmap,
    mask,
    bitmapVersion,
    text: layer.text
      ? {
          ...layer.text,
          fontSize: roundTextValue(layer.text.fontSize * Math.max(scaleX, scaleY)),
          boxWidth: layer.text.boxWidth === null ? null : roundTextValue(layer.text.boxWidth * scaleX),
          boxHeight: layer.text.boxHeight === null ? null : roundTextValue(layer.text.boxHeight * scaleY),
        }
      : undefined,
  };
}

function resizeBitmap(bitmap: LayerBitmap, scaleX: number, scaleY: number): LayerBitmap {
  const width = clampDocumentDimension(Math.round(bitmap.width * scaleX));
  const height = clampDocumentDimension(Math.round(bitmap.height * scaleY));
  const resized = new OffscreenCanvas(width, height) as LayerBitmap;
  const context = resized.getContext('2d');
  if (!context) {
    throw new Error('Failed to acquire 2D context for resized image layer');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return resized;
}

function canvasAnchorOffset(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: CanvasResizeAnchor,
): { x: number; y: number } {
  const dx = newWidth - oldWidth;
  const dy = newHeight - oldHeight;

  const x =
    anchor.endsWith('right') || anchor === 'right'
      ? dx
      : anchor === 'center' || anchor === 'top' || anchor === 'bottom'
        ? dx / 2
        : 0;
  const y =
    anchor.startsWith('bottom') || anchor === 'bottom'
      ? dy
      : anchor === 'center' || anchor === 'left' || anchor === 'right'
        ? dy / 2
        : 0;

  return { x, y };
}

function clampDocumentDimension(value: number): number {
  return Math.max(1, Math.min(32768, Math.round(value)));
}

function roundLayerPosition(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundTextValue(value: number): number {
  return Math.round(value * 100) / 100;
}
