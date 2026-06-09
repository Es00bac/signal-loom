import { inferFormatFromFile, inferMimeTypeFromFile, normalizeMimeType } from '../../lib/mediaFormatRegistry';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createEmptyImageDocument } from '../../store/imageEditorStore';
import { createBitmap, putBitmapImageData } from './LayerBitmap';

export const IMAGE_TIFF_MIME_TYPE = 'image/tiff';
export const IMAGE_SVG_MIME_TYPE = 'image/svg+xml';
export const IMAGE_BMP_MIME_TYPE = 'image/bmp';
export const IMAGE_GIF_MIME_TYPE = 'image/gif';

export type SourceImageFormatPolicy =
  | { kind: 'psd' }
  | { kind: 'psb'; message: string }
  | { kind: 'xcf'; message: string }
  | { kind: 'tiff' }
  | { kind: 'svg' }
  | { kind: 'gif'; animated: boolean; warning?: string }
  | { kind: 'exr'; message: string }
  | { kind: 'raster' };

export interface SourceImageOpenParams {
  id: string;
  title: string;
  sourceBinItemId?: string;
  sourceLabel?: string;
  sourceMimeType?: string;
  sourceUrl?: string;
}

export function detectSourceImageFormatPolicy(input: {
  fileName?: string;
  mimeType?: string;
  bytes?: Uint8Array;
}): SourceImageFormatPolicy {
  const extension = input.fileName?.split('.').pop()?.toLowerCase();
  const mimeType = normalizeMimeType(input.mimeType);
  const bytes = input.bytes;

  if (bytes && bytes.length >= 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53) {
    const version = bytes.length >= 6 ? (bytes[4] << 8) | bytes[5] : 1;
    if (version === 2) return { kind: 'psb', message: 'PSB large-document files are detected, but Image currently supports layered PSD only. Convert to PSD, TIFF, PNG, or JPEG before opening.' };
    return { kind: 'psd' };
  }

  if (extension === 'psb') return { kind: 'psb', message: 'PSB large-document files are not supported in Image yet. Convert to PSD, TIFF, PNG, or JPEG before opening.' };
  if (extension === 'psd' || mimeType === 'image/vnd.adobe.photoshop') return { kind: 'psd' };
  if (extension === 'xcf' || mimeType === 'image/x-xcf') {
    return { kind: 'xcf', message: 'XCF export is available, but importing GIMP XCF workfiles is not decoded in Image yet. Open the XCF in GIMP and export PSD, TIFF, PNG, or JPEG before opening here.' };
  }
  if (extension === 'exr' || mimeType === 'image/x-exr' || mimeType === 'image/exr') {
    return { kind: 'exr', message: 'OpenEXR/HDR image data is detected, but Image does not currently include a browser-safe EXR decoder. Convert to PNG, TIFF, or JPEG before opening.' };
  }
  if (extension === 'svg' || mimeType === IMAGE_SVG_MIME_TYPE || startsWithAscii(bytes, '<svg') || startsWithAscii(bytes, '<?xml')) {
    return { kind: 'svg' };
  }
  if (isTiffHeader(bytes) || extension === 'tif' || extension === 'tiff' || mimeType === IMAGE_TIFF_MIME_TYPE) {
    return { kind: 'tiff' };
  }
  if (isGifHeader(bytes) || extension === 'gif' || mimeType === 'image/gif') {
    const animated = bytes ? isAnimatedGif(bytes) : false;
    return {
      kind: 'gif',
      animated,
      warning: animated ? 'Animated GIF opened as the first frame only. Use Video for animation/timing work.' : undefined,
    };
  }

  return { kind: 'raster' };
}

export function getImageMimeTypeFromRegistry(fileName?: string, mimeType?: string): string {
  const format = inferFormatFromFile(fileName, mimeType);
  if (format?.kind === 'image') {
    return inferMimeTypeFromFile(fileName, 'image') ?? format.mimeTypes[0] ?? 'image/png';
  }
  return mimeType || 'image/png';
}

export function encodeImageDataToTiff(imageData: ImageData): Uint8Array {
  const width = Math.max(1, Math.floor(imageData.width));
  const height = Math.max(1, Math.floor(imageData.height));
  const rgbaByteCount = width * height * 4;
  const tagCount = 11;
  const ifdOffset = 8;
  const ifdByteCount = 2 + tagCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdByteCount;
  const extraSamplesOffset = bitsOffset + 8;
  const stripOffset = extraSamplesOffset + 2;
  const output = new Uint8Array(stripOffset + rgbaByteCount);
  const view = new DataView(output.buffer);

  output[0] = 0x49;
  output[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, tagCount, true);

  let entry = ifdOffset + 2;
  const writeTag = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entry, tag, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(entry + 8, value, true);
      view.setUint16(entry + 10, 0, true);
    } else {
      view.setUint32(entry + 8, value, true);
    }
    entry += 12;
  };

  writeTag(256, 4, 1, width);
  writeTag(257, 4, 1, height);
  writeTag(258, 3, 4, bitsOffset);
  writeTag(259, 3, 1, 1);
  writeTag(262, 3, 1, 2);
  writeTag(273, 4, 1, stripOffset);
  writeTag(277, 3, 1, 4);
  writeTag(278, 4, 1, height);
  writeTag(279, 4, 1, rgbaByteCount);
  writeTag(284, 3, 1, 1);
  writeTag(338, 3, 1, extraSamplesOffset);
  view.setUint32(entry, 0, true);

  for (let index = 0; index < 4; index += 1) view.setUint16(bitsOffset + index * 2, 8, true);
  view.setUint16(extraSamplesOffset, 2, true);
  output.set(new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength), stripOffset);
  return output;
}

export function encodeImageDataToBmp(imageData: ImageData): Uint8Array {
  const width = Math.max(1, Math.floor(imageData.width));
  const height = Math.max(1, Math.floor(imageData.height));
  const headerByteCount = 14 + 40;
  const pixelByteCount = width * height * 4;
  const output = new Uint8Array(headerByteCount + pixelByteCount);
  const view = new DataView(output.buffer);

  output[0] = 0x42;
  output[1] = 0x4d;
  view.setUint32(2, output.byteLength, true);
  view.setUint32(10, headerByteCount, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, pixelByteCount, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  let target = headerByteCount;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      output[target] = imageData.data[source + 2];
      output[target + 1] = imageData.data[source + 1];
      output[target + 2] = imageData.data[source];
      output[target + 3] = imageData.data[source + 3];
      target += 4;
    }
  }

  return output;
}

export function encodeImageDataToStaticGif(imageData: ImageData): Uint8Array {
  const width = Math.max(1, Math.min(65535, Math.floor(imageData.width)));
  const height = Math.max(1, Math.min(65535, Math.floor(imageData.height)));
  const output: number[] = [];
  const writeAscii = (value: string) => {
    for (let index = 0; index < value.length; index += 1) output.push(value.charCodeAt(index));
  };
  const writeU16 = (value: number) => {
    output.push(value & 0xff, (value >>> 8) & 0xff);
  };

  writeAscii('GIF89a');
  writeU16(width);
  writeU16(height);
  output.push(0xf7, 0, 0);
  output.push(...buildGifPalette());
  output.push(0x21, 0xf9, 0x04, 0x01, 0, 0, 0, 0);
  output.push(0x2c);
  writeU16(0);
  writeU16(0);
  writeU16(width);
  writeU16(height);
  output.push(0);
  output.push(8);
  output.push(...buildGifImageDataBlocks(indexGifPixels(imageData, width, height)));
  output.push(0x3b);

  return new Uint8Array(output);
}

export function decodeTiffToImageData(buffer: ArrayBuffer): ImageData {
  const bytes = new Uint8Array(buffer);
  if (!isTiffHeader(bytes)) throw new Error('Unsupported TIFF: missing classic TIFF header.');
  const littleEndian = bytes[0] === 0x49;
  const view = new DataView(buffer);
  const readU16 = (offset: number) => view.getUint16(offset, littleEndian);
  const readU32 = (offset: number) => view.getUint32(offset, littleEndian);
  const magic = readU16(2);
  if (magic === 43) throw new Error('Unsupported TIFF: BigTIFF is not supported. Export or convert to classic 8-bit TIFF first.');
  if (magic !== 42) throw new Error('Unsupported TIFF: invalid TIFF magic number.');

  const ifdOffset = readU32(4);
  const tagCount = readU16(ifdOffset);
  const tags = new Map<number, { type: number; count: number; valueOffset: number; entryOffset: number }>();
  for (let i = 0; i < tagCount; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    tags.set(readU16(entry), {
      type: readU16(entry + 2),
      count: readU32(entry + 4),
      valueOffset: readU32(entry + 8),
      entryOffset: entry,
    });
  }

  const getTagValue = (tag: number, fallback = 0) => {
    const entry = tags.get(tag);
    if (!entry) return fallback;
    if (entry.type === 3 && entry.count === 1) return readU16(entry.entryOffset + 8);
    return entry.valueOffset;
  };
  const getTagArray = (tag: number): number[] => {
    const entry = tags.get(tag);
    if (!entry) return [];
    const bytesPerValue = entry.type === 3 ? 2 : 4;
    if (entry.count === 1) return [getTagValue(tag)];
    const inline = entry.count * bytesPerValue <= 4;
    const offset = inline ? entry.entryOffset + 8 : entry.valueOffset;
    return Array.from({ length: entry.count }, (_, index) => entry.type === 3 ? readU16(offset + index * 2) : readU32(offset + index * 4));
  };

  const width = getTagValue(256);
  const height = getTagValue(257);
  const compression = getTagValue(259, 1);
  const photometric = getTagValue(262, 2);
  const samplesPerPixel = getTagValue(277, 1);
  const planarConfig = getTagValue(284, 1);
  const bitsPerSample = getTagArray(258);
  const stripOffsets = getTagArray(273);
  const stripByteCounts = getTagArray(279);
  const rowsPerStrip = getTagValue(278, height);

  if (width <= 0 || height <= 0) throw new Error('Unsupported TIFF: invalid image dimensions.');
  if (compression !== 1) throw new Error('Unsupported TIFF: compressed TIFF variants are not supported yet. Use uncompressed 8-bit RGB/RGBA TIFF.');
  if (planarConfig !== 1) throw new Error('Unsupported TIFF: planar TIFF data is not supported yet. Use chunky RGB/RGBA TIFF.');
  if (![1, 3, 4].includes(samplesPerPixel)) throw new Error('Unsupported TIFF: only grayscale, RGB, and RGBA samples are supported.');
  if (bitsPerSample.length > 0 && bitsPerSample.some((bits) => bits !== 8)) throw new Error('Unsupported TIFF: only 8-bit samples are supported.');

  const data = new Uint8ClampedArray(width * height * 4);
  let outputPixel = 0;
  for (let stripIndex = 0; stripIndex < stripOffsets.length; stripIndex += 1) {
    const offset = stripOffsets[stripIndex];
    const byteCount = stripByteCounts[stripIndex] ?? 0;
    const rows = Math.min(rowsPerStrip, height - stripIndex * rowsPerStrip);
    const expected = rows * width * samplesPerPixel;
    const limit = offset + Math.min(byteCount || expected, expected);
    for (let source = offset; source < limit && outputPixel < width * height; source += samplesPerPixel) {
      const target = outputPixel * 4;
      if (samplesPerPixel === 1) {
        const gray = photometric === 0 ? 255 - bytes[source] : bytes[source];
        data[target] = gray;
        data[target + 1] = gray;
        data[target + 2] = gray;
        data[target + 3] = 255;
      } else {
        data[target] = bytes[source];
        data[target + 1] = bytes[source + 1];
        data[target + 2] = bytes[source + 2];
        data[target + 3] = samplesPerPixel >= 4 ? bytes[source + 3] : 255;
      }
      outputPixel += 1;
    }
  }

  return makeImageData(data, width, height);
}

export function imageDataToBitmap(imageData: ImageData): LayerBitmap {
  const bitmap = createBitmap(imageData.width, imageData.height);
  putBitmapImageData(bitmap, imageData);
  return bitmap;
}

export async function createTiffImageDocument(buffer: ArrayBuffer, params: SourceImageOpenParams): Promise<ImageDocument> {
  const bitmap = imageDataToBitmap(decodeTiffToImageData(buffer));
  return createSingleLayerDocument(bitmap, params, 'TIFF', []);
}

export async function createSvgImageDocument(svgSource: string, params: SourceImageOpenParams): Promise<ImageDocument> {
  const bitmap = await rasterizeSvgToBitmap(svgSource);
  return createSingleLayerDocument(bitmap, params, 'SVG', [], { originalSvgSource: svgSource });
}

export async function createRasterImageDocumentFromBlob(blob: Blob, params: SourceImageOpenParams, warnings: string[] = []): Promise<ImageDocument> {
  const imageBitmap = await createImageBitmap(blob);
  try {
    const bitmap = createBitmap(imageBitmap.width, imageBitmap.height);
    bitmap.getContext('2d')?.drawImage(imageBitmap, 0, 0);
    return createSingleLayerDocument(bitmap, params, params.sourceMimeType || blob.type || 'Raster', warnings);
  } finally {
    imageBitmap.close();
  }
}

function createSingleLayerDocument(
  bitmap: LayerBitmap,
  params: SourceImageOpenParams,
  sourceFormat: string,
  warnings: string[],
  extraMetadata: Partial<NonNullable<ImageLayer['metadata']>> = {},
): ImageDocument {
  const shell = createEmptyImageDocument({
    id: params.id,
    title: params.title,
    width: bitmap.width,
    height: bitmap.height,
    sourceBinItemId: params.sourceBinItemId,
  });
  const layer: ImageLayer = {
    id: `${params.id}-layer-0`,
    name: params.sourceLabel ?? params.title,
    type: extraMetadata.originalSvgSource ? 'vector' : 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 0,
    mask: null,
    vectorRecipe: extraMetadata.originalSvgSource,
    metadata: {
      smartLinkedSourceId: params.sourceBinItemId,
      sourceLabel: params.sourceLabel,
      sourceFormat,
      sourceMimeType: params.sourceMimeType,
      sourceWarnings: warnings,
      sourceLink: params.sourceBinItemId ? {
        id: params.sourceBinItemId,
        label: params.sourceLabel,
        width: bitmap.width,
        height: bitmap.height,
        status: 'linked',
        relinkHistory: [],
      } : undefined,
      ...extraMetadata,
    },
  };
  return {
    ...shell,
    width: bitmap.width,
    height: bitmap.height,
    layers: [layer],
    activeLayerId: layer.id,
    metadata: { sourceFormat, sourceMimeType: params.sourceMimeType, warnings },
  };
}

export async function rasterizeSvgToBitmapAtResolution(
  svgSource: string,
  width: number,
  height: number,
): Promise<LayerBitmap> {
  const blob = new Blob([svgSource], { type: IMAGE_SVG_MIME_TYPE });
  const imageBitmap = await createImageBitmap(blob);
  try {
    const bitmap = createBitmap(width, height);
    bitmap.getContext('2d')?.drawImage(imageBitmap, 0, 0, width, height);
    return bitmap;
  } finally {
    imageBitmap.close();
  }
}

async function rasterizeSvgToBitmap(svgSource: string): Promise<LayerBitmap> {
  const blob = new Blob([svgSource], { type: IMAGE_SVG_MIME_TYPE });
  const imageBitmap = await createImageBitmap(blob);
  try {
    const bitmap = createBitmap(imageBitmap.width, imageBitmap.height);
    bitmap.getContext('2d')?.drawImage(imageBitmap, 0, 0);
    return bitmap;
  } finally {
    imageBitmap.close();
  }
}

function isTiffHeader(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.length < 4) return false;
  return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42)
    || (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 43 && bytes[3] === 0)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 43);
}

function isGifHeader(bytes: Uint8Array | undefined): boolean {
  return Boolean(bytes && bytes.length >= 6 && (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')));
}

export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (!isGifHeader(bytes)) return false;
  let imageCount = 0;
  for (let index = 13; index < bytes.length; index += 1) {
    if (bytes[index] === 0x2c) {
      imageCount += 1;
      if (imageCount > 1) return true;
    }
  }
  return false;
}

function startsWithAscii(bytes: Uint8Array | undefined, prefix: string): boolean {
  if (!bytes || bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    const byte = bytes[index];
    const lower = byte >= 65 && byte <= 90 ? byte + 32 : byte;
    const expected = prefix.charCodeAt(index);
    const normalizedExpected = expected >= 65 && expected <= 90 ? expected + 32 : expected;
    if (lower !== normalizedExpected) return false;
  }
  return true;
}

function buildGifPalette(): number[] {
  const palette = [0, 0, 0];
  for (let r = 0; r < 7; r += 1) {
    for (let g = 0; g < 6; g += 1) {
      for (let b = 0; b < 6; b += 1) {
        palette.push(
          Math.round((r / 6) * 255),
          Math.round((g / 5) * 255),
          Math.round((b / 5) * 255),
        );
      }
    }
  }

  while (palette.length < 256 * 3) palette.push(0);
  return palette.slice(0, 256 * 3);
}

function indexGifPixels(imageData: ImageData, width: number, height: number): number[] {
  const indices: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * imageData.width + x) * 4;
      if (imageData.data[offset + 3] < 128) {
        indices.push(0);
        continue;
      }
      const r = Math.round((imageData.data[offset] / 255) * 6);
      const g = Math.round((imageData.data[offset + 1] / 255) * 5);
      const b = Math.round((imageData.data[offset + 2] / 255) * 5);
      indices.push(1 + r * 36 + g * 6 + b);
    }
  }
  return indices;
}

function buildGifImageDataBlocks(indices: number[]): number[] {
  const clearCode = 256;
  const endCode = 257;
  const codes: number[] = [];

  for (let index = 0; index < indices.length; index += 254) {
    codes.push(clearCode, ...indices.slice(index, index + 254));
  }
  codes.push(endCode);

  const packed = packGifCodes(codes, 9);
  const blocks: number[] = [];
  for (let index = 0; index < packed.length; index += 255) {
    const chunk = packed.slice(index, index + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return blocks;
}

function packGifCodes(codes: number[], codeSize: number): number[] {
  const bytes: number[] = [];
  let current = 0;
  let bits = 0;

  for (const code of codes) {
    current |= code << bits;
    bits += codeSize;

    while (bits >= 8) {
      bytes.push(current & 0xff);
      current >>>= 8;
      bits -= 8;
    }
  }

  if (bits > 0) bytes.push(current & 0xff);
  return bytes;
}

function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  const copy = new Uint8ClampedArray(data);
  if (typeof ImageData !== 'undefined') return new ImageData(copy, width, height);
  return { data: copy, width, height } as ImageData;
}
