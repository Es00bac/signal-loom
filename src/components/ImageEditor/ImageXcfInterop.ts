import type { BlendMode, ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { getBitmapImageData } from './LayerBitmap';
import { flattenImageDocumentToBitmap } from './ImageDocumentExport';
import { renderLayerWithEffects } from './ImageLayerEffects';
import { rasterizeLayerBitmapTransformed } from './ImageLayerTransform';

export const IMAGE_XCF_MIME_TYPE = 'image/x-xcf';
export const IMAGE_XCF_EXTENSION = 'xcf';

interface XcfLayerExport {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
  mode: number;
  imageData: ImageData;
  active: boolean;
}

const XCF_TILE_SIZE = 64;

export async function imageDocumentToXcfBlob(doc: ImageDocument): Promise<Blob> {
  const bytes = imageDocumentToXcfBytes(doc);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Blob([body], { type: IMAGE_XCF_MIME_TYPE });
}

export function imageDocumentToXcfBytes(doc: ImageDocument): Uint8Array {
  const layers = collectXcfLayers(doc);
  const writer = new XcfWriter();
  const layerPointerOffsets: number[] = [];

  writer.writeAscii('gimp xcf v003');
  writer.writeByte(0);
  writer.writeU32(doc.width);
  writer.writeU32(doc.height);
  writer.writeU32(0);
  writeProperty(writer, 17, [0]);
  writePropertyEnd(writer);

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    layerPointerOffsets.push(writer.reserveU32());
  }
  writer.writeU32(0);
  writer.writeU32(0);
  writer.writeU32(0);

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const pointerOffset = layerPointerOffsets[layers.length - 1 - index];
    writer.patchU32(pointerOffset, writer.offset);
    writeLayer(writer, layer);
  }

  return writer.toUint8Array();
}

function collectXcfLayers(doc: ImageDocument): XcfLayerExport[] {
  const layers = doc.layers
    .map((layer) => imageLayerToXcfLayer(layer, layer.id === doc.activeLayerId))
    .filter((layer): layer is XcfLayerExport => Boolean(layer));

  if (layers.length > 0) return layers;

  const bitmap = flattenImageDocumentToBitmap(doc);
  return [{
    name: doc.title || 'Visible Composite',
    width: bitmap.width,
    height: bitmap.height,
    x: 0,
    y: 0,
    visible: true,
    opacity: 1,
    mode: 0,
    imageData: getBitmapImageData(bitmap),
    active: true,
  }];
}

function imageLayerToXcfLayer(layer: ImageLayer, active: boolean): XcfLayerExport | null {
  if (!layer.bitmap || layer.type === 'adjustment') return null;

  const rendered = renderLayerWithEffects(layer);
  const raster = rasterizeLayerBitmapTransformed(
    rendered?.bitmap ?? layer.bitmap,
    layer,
    rendered?.offsetX ?? 0,
    rendered?.offsetY ?? 0,
  );

  return {
    name: layer.name || 'Layer',
    width: raster.bitmap.width,
    height: raster.bitmap.height,
    x: raster.left,
    y: raster.top,
    visible: layer.visible,
    opacity: clamp01(layer.opacity),
    mode: imageBlendModeToXcfMode(layer.blendMode),
    imageData: getBitmapImageData(raster.bitmap as LayerBitmap),
    active,
  };
}

function writeLayer(writer: XcfWriter, layer: XcfLayerExport): void {
  writer.writeU32(layer.width);
  writer.writeU32(layer.height);
  writer.writeU32(1);
  writer.writeString(layer.name);
  writeLayerProperties(writer, layer);
  const hierarchyPointerOffset = writer.reserveU32();
  writer.writeU32(0);
  writer.writeU32(0);
  writer.patchU32(hierarchyPointerOffset, writer.offset);
  writeHierarchy(writer, layer);
}

function writeLayerProperties(writer: XcfWriter, layer: XcfLayerExport): void {
  if (layer.active) writeProperty(writer, 2, []);
  writePropertyU32(writer, 6, Math.round(layer.opacity * 255));
  writePropertyU32(writer, 8, layer.visible ? 1 : 0);
  writePropertyU32(writer, 7, layer.mode);
  const offsets = new XcfWriter();
  offsets.writeI32(layer.x);
  offsets.writeI32(layer.y);
  writeProperty(writer, 15, offsets.bytes);
  writePropertyEnd(writer);
}

function writeHierarchy(writer: XcfWriter, layer: XcfLayerExport): void {
  writer.writeU32(layer.width);
  writer.writeU32(layer.height);
  writer.writeU32(4);
  const levelPointerOffset = writer.reserveU32();
  writer.writeU32(0);
  writer.patchU32(levelPointerOffset, writer.offset);
  writeLevel(writer, layer);
}

function writeLevel(writer: XcfWriter, layer: XcfLayerExport): void {
  const columns = Math.ceil(layer.width / XCF_TILE_SIZE);
  const rows = Math.ceil(layer.height / XCF_TILE_SIZE);
  const tilePointerOffsets: number[] = [];

  writer.writeU32(layer.width);
  writer.writeU32(layer.height);
  for (let index = 0; index < columns * rows; index += 1) {
    tilePointerOffsets.push(writer.reserveU32());
  }
  writer.writeU32(0);

  let tileIndex = 0;
  for (let tileY = 0; tileY < layer.height; tileY += XCF_TILE_SIZE) {
    for (let tileX = 0; tileX < layer.width; tileX += XCF_TILE_SIZE) {
      writer.patchU32(tilePointerOffsets[tileIndex], writer.offset);
      writeTile(writer, layer.imageData, tileX, tileY);
      tileIndex += 1;
    }
  }
}

function writeTile(writer: XcfWriter, imageData: ImageData, tileX: number, tileY: number): void {
  const width = Math.min(XCF_TILE_SIZE, imageData.width - tileX);
  const height = Math.min(XCF_TILE_SIZE, imageData.height - tileY);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((tileY + y) * imageData.width + tileX + x) * 4;
      writer.writeByte(imageData.data[source]);
      writer.writeByte(imageData.data[source + 1]);
      writer.writeByte(imageData.data[source + 2]);
      writer.writeByte(imageData.data[source + 3]);
    }
  }
}

function writePropertyU32(writer: XcfWriter, type: number, value: number): void {
  const payload = new XcfWriter();
  payload.writeU32(value);
  writeProperty(writer, type, payload.bytes);
}

function writeProperty(writer: XcfWriter, type: number, payload: number[]): void {
  writer.writeU32(type);
  writer.writeU32(payload.length);
  writer.writeBytes(payload);
}

function writePropertyEnd(writer: XcfWriter): void {
  writer.writeU32(0);
  writer.writeU32(0);
}

function imageBlendModeToXcfMode(mode: BlendMode): number {
  switch (mode) {
    case 'multiply':
      return 3;
    case 'screen':
      return 4;
    case 'overlay':
      return 5;
    case 'difference':
      return 6;
    case 'darken':
      return 9;
    case 'lighten':
      return 10;
    case 'hue':
      return 11;
    case 'saturation':
      return 12;
    case 'color':
      return 13;
    case 'luminosity':
      return 14;
    case 'color-dodge':
      return 16;
    case 'color-burn':
      return 17;
    case 'hard-light':
      return 18;
    case 'soft-light':
      return 19;
    default:
      return 0;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}

class XcfWriter {
  bytes: number[] = [];

  get offset(): number {
    return this.bytes.length;
  }

  writeAscii(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      this.writeByte(value.charCodeAt(index));
    }
  }

  writeByte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  writeBytes(values: number[] | Uint8Array): void {
    for (const value of values) this.writeByte(value);
  }

  writeU32(value: number): void {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  writeI32(value: number): void {
    this.writeU32(value >>> 0);
  }

  reserveU32(): number {
    const offset = this.offset;
    this.writeU32(0);
    return offset;
  }

  patchU32(offset: number, value: number): void {
    this.bytes[offset] = (value >>> 24) & 0xff;
    this.bytes[offset + 1] = (value >>> 16) & 0xff;
    this.bytes[offset + 2] = (value >>> 8) & 0xff;
    this.bytes[offset + 3] = value & 0xff;
  }

  writeString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    if (bytes.length === 0) {
      this.writeU32(0);
      return;
    }
    this.writeU32(bytes.length + 1);
    this.writeBytes(bytes);
    this.writeByte(0);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
