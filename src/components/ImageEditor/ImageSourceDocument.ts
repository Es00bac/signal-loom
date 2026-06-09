import type { SourceBinLibraryItem } from '../../store/sourceBinStore';
import { createEmptyImageDocument } from '../../store/imageEditorStore';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { bitmapFromUrl, createBitmap, fillBitmap } from './LayerBitmap';
import {
  createRasterImageDocumentFromBlob,
  createSvgImageDocument,
  createTiffImageDocument,
  detectSourceImageFormatPolicy,
  getImageMimeTypeFromRegistry,
} from './ImageFileFormats';

interface CreateSourceImageDocumentOptions {
  fallbackWidth?: number;
  fallbackHeight?: number;
  loadBitmap?: (url: string) => Promise<LayerBitmap>;
}

interface CreateLocalImageDocumentOptions {
  id?: string;
}

export function createSourceBackedImageDocumentShell(
  item: Pick<SourceBinLibraryItem, 'id' | 'label'>,
  options: Pick<CreateSourceImageDocumentOptions, 'fallbackWidth' | 'fallbackHeight'> = {},
): ImageDocument {
  return createEmptyImageDocument({
    id: `doc-${item.id}`,
    title: item.label ?? 'Untitled',
    width: options.fallbackWidth ?? 800,
    height: options.fallbackHeight ?? 600,
    sourceBinItemId: item.id,
  });
}

export function createNewBlankDocument(options: {
  title: string;
  width: number;
  height: number;
  background: string;
}): ImageDocument {
  const docId = `doc-new-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const docWidth = options.width || 800;
  const docHeight = options.height || 600;

  const bitmap = createBitmap(docWidth, docHeight);
  if (options.background !== 'transparent') {
    fillBitmap(bitmap, options.background);
  }

  const layer: ImageLayer = {
    id: `layer-bg-${Date.now()}`,
    name: options.background !== 'transparent' ? 'Background' : 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 0,
    mask: null,
  };

  return {
    id: docId,
    title: options.title || 'Untitled',
    width: docWidth,
    height: docHeight,
    layers: [layer],
    activeLayerId: layer.id,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: true,
    snapshots: [],
  };
}

export async function createImageDocumentFromFile(
  file: File,
  options: CreateLocalImageDocumentOptions = {},
): Promise<ImageDocument> {
  const id = options.id ?? `local-image-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const title = stripImageFileExtension(file.name) || 'Untitled Image';
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sourceMimeType = getImageMimeTypeFromRegistry(file.name, file.type);
  const policy = detectSourceImageFormatPolicy({ fileName: file.name, mimeType: sourceMimeType, bytes });
  const params = {
    id,
    title,
    sourceLabel: file.name,
    sourceMimeType,
  };

  if (policy.kind === 'psb' || policy.kind === 'exr' || policy.kind === 'xcf') throw new Error(policy.message);
  if (policy.kind === 'tiff') return createTiffImageDocument(buffer, params);
  if (policy.kind === 'svg') return createSvgImageDocument(await file.text(), params);
  if (policy.kind === 'gif') return createRasterImageDocumentFromBlob(file, params, policy.warning ? [policy.warning] : []);
  if (policy.kind === 'psd') throw new Error('Layered PSD files must be opened with the Image workspace Open PSD control. PSB is not supported.');
  return createRasterImageDocumentFromBlob(file, params);
}

export async function createImageDocumentFromSourceItem(
  item: SourceBinLibraryItem,
  options: CreateSourceImageDocumentOptions = {},
): Promise<ImageDocument> {
  const shell = createSourceBackedImageDocumentShell(item, options);
  if (item.kind !== 'image' || !item.assetUrl) return shell;

  if (!options.loadBitmap) {
    const response = await fetch(item.assetUrl);
    if (!response.ok) throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const sourceMimeType = getImageMimeTypeFromRegistry(item.label, item.mimeType || blob.type);
    const policy = detectSourceImageFormatPolicy({ fileName: item.label, mimeType: sourceMimeType, bytes });
    const params = {
      id: `doc-${item.id}`,
      title: item.label ?? 'Untitled',
      sourceBinItemId: item.id,
      sourceLabel: item.label,
      sourceMimeType,
      sourceUrl: item.assetUrl,
    };

    if (policy.kind === 'psb' || policy.kind === 'exr' || policy.kind === 'xcf') throw new Error(policy.message);
    if (policy.kind === 'tiff') return createTiffImageDocument(buffer, params);
    if (policy.kind === 'svg') return createSvgImageDocument(await blob.text(), params);
    if (policy.kind === 'gif') return createRasterImageDocumentFromBlob(blob, params, policy.warning ? [policy.warning] : []);
    if (policy.kind === 'psd') throw new Error('Layered PSD files must be opened with the Image workspace Open PSD control. PSB is not supported.');
    return createRasterImageDocumentFromBlob(blob, params);
  }

  const bitmap = await (options.loadBitmap ?? bitmapFromUrl)(item.assetUrl);
  const layer: ImageLayer = {
    id: `layer-${sanitizeSourceId(item.id)}`,
    name: item.label ?? 'Background',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 0,
    mask: null,
    metadata: {
      smartLinkedSourceId: item.id,
      sourceLabel: item.label,
      sourceLink: createSourceLinkMetadata(item, bitmap),
    },
  };

  return {
    ...shell,
    width: bitmap.width,
    height: bitmap.height,
    layers: [layer],
    activeLayerId: layer.id,
  };
}

export async function loadSourceLinkedLayerBitmap(
  item: SourceBinLibraryItem,
  loadBitmap: (url: string) => Promise<LayerBitmap> = bitmapFromUrl,
): Promise<LayerBitmap> {
  if (item.kind !== 'image' || !item.assetUrl) {
    throw new Error('Source-linked layer can only update from an image Source Bin item with an asset URL.');
  }
  return loadBitmap(item.assetUrl);
}

export function replaceSourceLinkedLayerBitmap(
  layer: ImageLayer,
  item: SourceBinLibraryItem,
  bitmap: LayerBitmap,
): ImageLayer {
  const previous = layer.metadata?.sourceLink;
  const history = [
    ...(previous?.relinkHistory ?? []),
    ...(previous?.id && previous.id !== item.id
      ? [{ sourceId: previous.id, label: previous.label, at: Date.now() }]
      : []),
  ];
  return {
    ...layer,
    name: layer.name || item.label || 'Linked Source',
    type: 'image',
    bitmap,
    bitmapVersion: layer.bitmapVersion + 1,
    metadata: {
      ...layer.metadata,
      smartLinkedSourceId: item.id,
      sourceLabel: item.label,
      sourceLink: {
        id: item.id,
        label: item.label,
        width: bitmap.width,
        height: bitmap.height,
        status: previous?.id && previous.id !== item.id ? 'relinked' : 'linked',
        relinkHistory: history,
      },
    },
  };
}

export function markSourceLinkedLayerMissing(layer: ImageLayer): ImageLayer {
  const sourceId = layer.metadata?.smartLinkedSourceId ?? layer.metadata?.sourceLink?.id;
  if (!sourceId) return layer;
  return {
    ...layer,
    metadata: {
      ...layer.metadata,
      smartLinkedSourceId: sourceId,
      sourceLink: {
        id: sourceId,
        label: layer.metadata?.sourceLabel ?? layer.metadata?.sourceLink?.label,
        width: layer.metadata?.sourceLink?.width ?? layer.bitmap?.width,
        height: layer.metadata?.sourceLink?.height ?? layer.bitmap?.height,
        status: 'missing',
        relinkHistory: layer.metadata?.sourceLink?.relinkHistory ?? [],
      },
    },
  };
}

export function createSourceLinkMetadata(
  item: Pick<SourceBinLibraryItem, 'id' | 'label'>,
  bitmap: Pick<LayerBitmap, 'width' | 'height'>,
): NonNullable<ImageLayer['metadata']>['sourceLink'] {
  return {
    id: item.id,
    label: item.label,
    width: bitmap.width,
    height: bitmap.height,
    status: 'linked',
    relinkHistory: [],
  };
}

function sanitizeSourceId(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, '-');
}

function stripImageFileExtension(fileName: string): string {
  return fileName
    .replace(/\.(?:png|jpe?g|webp|avif|bmp|gif|tiff?|svg)$/i, '')
    .trim();
}
