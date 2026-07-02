// Shared cloud image-upscale execution — the single source of truth for the
// Stability AI and Vertex Imagen upscalers used by BOTH the Flow auto-upscale
// (flowExecution.ts `runConfiguredFlowImageUpscale`) and the Image editor's
// universal upscale (ImageUniversalUpscale.ts). Extracted verbatim from the
// original Flow configured-upscale branch so behaviour is byte-identical: same
// request builders, endpoints, error wording, and result URLs.
//
// Both routes are PAID. Callers must gate them on configured credentials
// (Stability API key / Vertex project + bridge-or-service-account) and surface
// a cost label before running — these helpers never decide to spend on their own.
import type { ImageOutputFormat, ProviderSettings } from '../types/flow';
import { buildStabilityUpscaleRequest } from './imageEditorAi/requestBuilders';
import { getVertexProjectConfig } from './vertexProviderSettings';
import { getSignalLoomNativeBridge } from './nativeApp';
import type { NativeVertexImageRequest, NativeVertexImageResult } from './nativeApp';
import { generateVertexImageDirect, isVertexDirectRestAvailable } from './vertexDirectRest';
import {
  buildVertexImagenUpscaleRequestBody,
  dataUrlToVertexInlineImage,
  VERTEX_IMAGEN_UPSCALE_MODEL_ID,
  type VertexImagenUpscaleFactor,
} from './vertexImageRequests';
import { blobToDataUrl } from './imageEditorAi/blobUtils';

export interface CloudImageUpscaleOutput {
  result: string;
  mimeType?: string;
}

export type StabilityImageUpscaleMode = 'fast' | 'conservative';

export interface StabilityImageUpscaleInput {
  sourceImage: string;
  mode: StabilityImageUpscaleMode;
  outputFormat: ImageOutputFormat;
  apiKey: string;
  /** Conservative mode only: optional prompt to guide the repair pass. */
  prompt?: string;
  /** Conservative mode only: optional 0–1 creativity control. */
  creativity?: number;
  sourceFilename?: string;
  errorLabel?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Run a Stability AI cloud upscale (fast or conservative). Faithful port of the
 * Flow configured-upscale Stability branch: builds the request via
 * `buildStabilityUpscaleRequest`, POSTs multipart form data, and returns an
 * object URL for the returned image blob.
 */
export async function runStabilityImageUpscale(
  input: StabilityImageUpscaleInput,
): Promise<CloudImageUpscaleOutput> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error('Stability AI API key is missing. Add it in Settings.');
  }

  const built = buildStabilityUpscaleRequest({
    mode: input.mode,
    prompt: input.mode === 'conservative' ? input.prompt : undefined,
    creativity: input.mode === 'conservative' ? input.creativity : undefined,
    outputFormat: input.outputFormat,
  });

  const formData = new FormData();
  Object.entries(built.fields).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  formData.append(
    'image',
    await dataUrlToUpscaleFile(input.sourceImage, input.sourceFilename ?? 'image-upscale-source.png'),
  );

  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(built.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await extractCloudUpscaleErrorBody(response, input.errorLabel ?? 'Stability image upscale failed'));
  }

  const blob = await response.blob();
  return {
    result: URL.createObjectURL(blob),
    mimeType: blob.type || `image/${input.outputFormat}`,
  };
}

export interface VertexImagenImageUpscaleInput {
  sourceImage: string;
  providerSettings: ProviderSettings;
  outputFormat: ImageOutputFormat;
  /** Vertex Imagen upscale factor; defaults to x2 to match the Flow behaviour. */
  upscaleFactor?: VertexImagenUpscaleFactor;
  /**
   * Optional resolved Vertex image generator (bridge or direct REST). Callers
   * that already resolve one (Flow) pass it so behaviour is provably identical;
   * omit it to let this module resolve the shared bridge-or-service-account path.
   */
  generateVertexImage?: (request: NativeVertexImageRequest) => Promise<NativeVertexImageResult>;
  /** Optional source normalizer (blob/remote → data URL); defaults to a shared one. */
  normalizeSourceImage?: (imageInput: string) => Promise<string>;
}

/**
 * Run a Vertex Imagen cloud upscale. Faithful port of the Flow configured-upscale
 * Vertex branch: resolves the project config + image generator, then calls the
 * `imagen-4.0-upscale-preview` model with a `buildVertexImagenUpscaleRequestBody`.
 */
export async function runVertexImagenImageUpscale(
  input: VertexImagenImageUpscaleInput,
): Promise<CloudImageUpscaleOutput> {
  const vertexConfig = getVertexProjectConfig(input.providerSettings);
  const generateVertexImage = input.generateVertexImage ?? resolveVertexImageGenerator(input.providerSettings);

  if (!vertexConfig.projectId || !generateVertexImage) {
    throw new Error(
      'Vertex Imagen upscaling requires a configured project plus the desktop Vertex bridge or a service-account key (Settings > Providers > Vertex AI).',
    );
  }

  const normalizeSourceImage = input.normalizeSourceImage ?? normalizeCloudUpscaleImageInput;
  const result = await generateVertexImage({
    projectId: vertexConfig.projectId,
    location: vertexConfig.location,
    auth: vertexConfig.auth,
    modelId: VERTEX_IMAGEN_UPSCALE_MODEL_ID,
    route: 'imagen-predict',
    body: buildVertexImagenUpscaleRequestBody({
      image: dataUrlToVertexInlineImage(await normalizeSourceImage(input.sourceImage)),
      outputMimeType: input.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
      upscaleFactor: input.upscaleFactor ?? 'x2',
    }),
  });

  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.result) {
    throw new Error('Vertex Imagen did not return an upscaled image payload.');
  }

  return {
    result: result.result,
    mimeType: result.mimeType,
  };
}

/**
 * Resolve a Vertex image generator: prefer the Electron bridge (gcloud auth),
 * fall back to direct REST with the user's service-account key. Mirrors the Flow
 * resolver so the Image editor gets the same bridgeless mobile path.
 */
export function resolveVertexImageGenerator(
  providerSettings: ProviderSettings,
): ((request: NativeVertexImageRequest) => Promise<NativeVertexImageResult>) | undefined {
  const bridge = getSignalLoomNativeBridge();
  if (bridge?.generateVertexImage) {
    return bridge.generateVertexImage;
  }
  if (isVertexDirectRestAvailable(providerSettings)) {
    return (request: NativeVertexImageRequest) => generateVertexImageDirect(request, providerSettings);
  }
  return undefined;
}

async function dataUrlToUpscaleFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

async function normalizeCloudUpscaleImageInput(imageInput: string): Promise<string> {
  if (imageInput.startsWith('data:')) {
    return imageInput;
  }
  const response = await fetch(imageInput);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function extractCloudUpscaleErrorBody(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? `${fallback} (${response.status})`;
  }

  const text = await response.text();
  return text || `${fallback} (${response.status})`;
}
