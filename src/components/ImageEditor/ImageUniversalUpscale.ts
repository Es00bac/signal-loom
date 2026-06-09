import {
  isAndroidAcceleratorConfigured,
  normalizeAndroidAcceleratorBaseUrl,
  runAndroidAcceleratorUpscale,
  type AndroidAcceleratorImageResult,
  type AndroidAcceleratorUpscaleInput,
} from '../../lib/androidAccelerator';
import {
  isLocalCpuUpscalerConfigured,
  type LocalCpuUpscalerImageResult,
  type LocalCpuUpscalerInput,
} from '../../lib/localCpuUpscaler';
import type { ProviderSettings } from '../../types/flow';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { resizeImageDocumentPixels, scaleImageDocumentToPercent } from './ImageDocumentGeometry';
import { imageDocumentToDataUrl } from './ImageDocumentExport';
import { bitmapFromImageSource } from './LayerBitmap';

export type UniversalImageUpscaleProvider = 'android-accelerator' | 'local-ai-cpu' | 'browser';

export interface UniversalImageUpscaleResult {
  document: ImageDocument;
  provider: UniversalImageUpscaleProvider;
  estimatedCostUsd: number;
  statusMessage: string;
}

export interface UniversalImageUpscaleInput {
  doc: ImageDocument;
  providerSettings: Pick<
    ProviderSettings,
    | 'androidAcceleratorBaseUrl'
    | 'androidAcceleratorAuthToken'
    | 'androidAcceleratorDefaultUpscaler'
    | 'localAiCpuEndpointUrl'
    | 'localAiCpuAuthHeader'
    | 'localAiCpuModel'
  >;
  scalePercent?: number;
  androidUpscale?: (input: AndroidAcceleratorUpscaleInput) => Promise<AndroidAcceleratorImageResult>;
  localAiCpuUpscale?: (input: LocalCpuUpscalerInput) => Promise<LocalCpuUpscalerImageResult>;
  documentToDataUrl?: (doc: ImageDocument) => Promise<string>;
  dataUrlToBitmap?: (dataUrl: string) => Promise<LayerBitmap>;
}

export async function upscaleImageDocumentUniversal(input: UniversalImageUpscaleInput): Promise<UniversalImageUpscaleResult> {
  const scalePercent = input.scalePercent ?? 200;
  const target = scaleImageDocumentToPercent(input.doc, scalePercent);

  if (isAndroidAcceleratorConfigured(input.providerSettings)) {
    const documentToDataUrl = input.documentToDataUrl ?? imageDocumentToDataUrl;
    const dataUrlToBitmap = input.dataUrlToBitmap ?? bitmapFromDataUrl;
    const sourceDataUrl = await documentToDataUrl(input.doc);
    const androidResult = await (input.androidUpscale ?? runAndroidAcceleratorUpscale)({
      baseUrl: normalizeAndroidAcceleratorBaseUrl(input.providerSettings.androidAcceleratorBaseUrl),
      authToken: input.providerSettings.androidAcceleratorAuthToken,
      sourceDataUrl,
      targetWidthPx: target.width,
      targetHeightPx: target.height,
      upscalerId: input.providerSettings.androidAcceleratorDefaultUpscaler ?? 'upscaler_realistic',
      outputFormat: 'png',
    });
    const bitmap = await dataUrlToBitmap(androidResult.dataUrl);
    return {
      document: replaceDocumentWithSingleUpscaledLayer(input.doc, bitmap, target.width, target.height, {
        idSuffix: 'phone-upscale',
        metadataSourceFormat: 'android-accelerator-upscale',
        statusLabel: 'Phone AI',
      }),
      provider: 'android-accelerator',
      estimatedCostUsd: 0,
      statusMessage: `Upscaled "${input.doc.title}" to ${target.width} x ${target.height}px with Android accelerator.`,
    };
  }

  if (isLocalCpuUpscalerConfigured(input.providerSettings)) {
    if (!input.localAiCpuUpscale) {
      throw new Error('Local CPU AI upscaler is not available.');
    }

    const documentToDataUrl = input.documentToDataUrl ?? imageDocumentToDataUrl;
    const dataUrlToBitmap = input.dataUrlToBitmap ?? bitmapFromDataUrl;
    const sourceDataUrl = await documentToDataUrl(input.doc);
    const localResult = await input.localAiCpuUpscale({
      baseUrl: input.providerSettings.localAiCpuEndpointUrl ?? '',
      authHeader: input.providerSettings.localAiCpuAuthHeader,
      sourceDataUrl,
      targetWidthPx: target.width,
      targetHeightPx: target.height,
      model: input.providerSettings.localAiCpuModel ?? 'realesrgan-4x',
      outputFormat: 'png',
    });
    const bitmap = await dataUrlToBitmap(localResult.dataUrl);

    return {
      document: replaceDocumentWithSingleUpscaledLayer(input.doc, bitmap, target.width, target.height, {
        idSuffix: 'cpu-upscale',
        metadataSourceFormat: 'local-cpu-upscale',
        statusLabel: 'Local CPU AI',
      }),
      provider: 'local-ai-cpu',
      estimatedCostUsd: 0,
      statusMessage: `Upscaled "${input.doc.title}" to ${target.width} x ${target.height}px with local CPU AI upscaler.`,
    };
  }

  const document = resizeImageDocumentPixels(input.doc, target.width, target.height);

  return {
    document,
    provider: 'browser',
    estimatedCostUsd: 0,
    statusMessage: `Resized "${input.doc.title}" to ${target.width} x ${target.height}px locally.`,
  };
}

export function describeUniversalImageUpscaleProvider(provider: UniversalImageUpscaleProvider): string {
  if (provider === 'android-accelerator') {
    return 'Android accelerator: NPU/GPU upscaler';
  }
  if (provider === 'local-ai-cpu') {
    return 'Local CPU AI upscaler';
  }
  return 'Local image resize';
}

function replaceDocumentWithSingleUpscaledLayer(
  doc: ImageDocument,
  bitmap: LayerBitmap,
  width: number,
  height: number,
  options?: {
    idSuffix?: string;
    metadataSourceFormat?: string;
    statusLabel?: string;
  },
): ImageDocument {
  const statusLabel = options?.statusLabel ?? 'AI';
  const layerId = `${options?.idSuffix ?? 'local-upscale'}-${doc.id}`;
  const metadataSourceFormat = options?.metadataSourceFormat ?? 'upscaled';
  const layer: ImageLayer = {
    id: layerId,
    name: `${statusLabel} upscale`,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 1,
    mask: null,
    metadata: {
      sourceFormat: metadataSourceFormat,
      sourceWarnings: doc.layers.length > 1
        ? ['The AI upscaler operates on the flattened visible image; undo restores the original layers.']
        : undefined,
    },
  };

  return {
    ...doc,
    width,
    height,
    layers: [layer],
    activeLayerId: layerId,
    hasSelection: false,
    selectionVersion: doc.selectionVersion + (doc.hasSelection ? 1 : 0),
    dirty: true,
  };
}

async function bitmapFromDataUrl(dataUrl: string): Promise<LayerBitmap> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Failed to load upscaled image: ${response.status} ${response.statusText}`);
  }
  const imageBitmap = await createImageBitmap(await response.blob());
  try {
    return await bitmapFromImageSource(imageBitmap);
  } finally {
    imageBitmap.close();
  }
}
