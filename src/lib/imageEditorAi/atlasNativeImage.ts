// Native Atlas Cloud image generation/edit for the Image-editor generative-fill path.
// Mirrors the proven flow-execution native Atlas path (upload media → POST
// /model/generateImage → poll), so native Atlas models (e.g. google/nano-banana-2/edit)
// work in the editor instead of being misrouted to OpenAI's images.edit endpoint.

import { fetchProviderResultBlob } from '../remoteMediaFetch';

export function normalizeAtlasBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.atlascloud.ai/api/v1';
  if (trimmed === 'https://api.atlascloud.ai') return 'https://api.atlascloud.ai/api/v1';
  return trimmed;
}

/** Native Atlas models are vendor-slugged (e.g. `google/nano-banana-2/edit`); `openai/*` and bare ids use the OpenAI-compatible route. */
export function isAtlasNativeImageModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id.includes('/') && !id.startsWith('openai/');
}

interface AtlasMediaResponse {
  url?: string;
  download_url?: string;
  data?: { url?: string; download_url?: string };
}

interface AtlasImageResponse {
  id?: string;
  prediction_id?: string;
  status?: string;
  error?: unknown;
  output?: unknown;
  outputs?: unknown;
  image?: unknown;
  images?: unknown;
  result?: unknown;
  data?: {
    id?: string;
    prediction_id?: string;
    status?: string;
    error?: unknown;
    output?: unknown;
    outputs?: unknown;
    image?: unknown;
    images?: unknown;
    result?: unknown;
  };
}

const SUCCESS_STATUSES = ['succeeded', 'success', 'completed', 'complete', 'done', 'ready'];
const FAILURE_STATUSES = ['failed', 'failure', 'error', 'cancelled', 'canceled'];

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  return undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

export function extractAtlasOutputUrl(payload: AtlasImageResponse): string | undefined {
  return firstNonEmpty(
    firstString(payload.data?.outputs),
    firstString(payload.data?.output),
    firstString(payload.data?.images),
    firstString(payload.data?.image),
    firstString(payload.data?.result),
    firstString(payload.outputs),
    firstString(payload.output),
    firstString(payload.images),
    firstString(payload.image),
    firstString(payload.result),
  );
}

function extractAtlasPredictionId(payload: AtlasImageResponse): string | undefined {
  return firstNonEmpty(payload.data?.id, payload.data?.prediction_id, payload.id, payload.prediction_id);
}

function extractAtlasStatus(payload: AtlasImageResponse): string | undefined {
  return firstNonEmpty(payload.data?.status, payload.status)?.toLowerCase();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function uploadAtlasBlob(baseUrl: string, apiKey: string, blob: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const formData = new FormData();
  formData.append('file', new File([blob], filename, { type: blob.type || 'image/png' }));
  const response = await fetch(`${baseUrl}/model/uploadMedia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Atlas media upload failed (${response.status}): ${await response.text()}`);
  }
  const payload = (await response.json()) as AtlasMediaResponse;
  const url = payload.data?.download_url ?? payload.data?.url ?? payload.download_url ?? payload.url;
  if (!url) throw new Error('Atlas media upload did not return a URL.');
  return url;
}

async function pollAtlasResult(baseUrl: string, apiKey: string, predictionId: string, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    signal?.throwIfAborted?.();
    const response = await fetch(`${baseUrl}/model/prediction/${encodeURIComponent(predictionId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Atlas image polling failed (${response.status}): ${await response.text()}`);
    }
    const payload = (await response.json()) as AtlasImageResponse;
    const url = extractAtlasOutputUrl(payload);
    const status = extractAtlasStatus(payload);
    if (status && FAILURE_STATUSES.includes(status)) {
      throw new Error('Atlas image generation failed.');
    }
    if (url && (!status || SUCCESS_STATUSES.includes(status))) {
      return url;
    }
    await sleep(2000);
  }
  throw new Error('Atlas image generation timed out.');
}

export interface AtlasNativeFillInput {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  prompt: string;
  source: Blob;
  mask?: Blob;
  references?: Array<{ image?: Blob; imageUrl?: string }>;
  outputFormat?: string;
  signal?: AbortSignal;
}

export async function runAtlasNativeGenerativeFill(input: AtlasNativeFillInput): Promise<Blob> {
  const { apiKey, baseUrl } = input;
  const outputFormat = input.outputFormat ?? 'png';

  const sourceImage = await uploadAtlasBlob(baseUrl, apiKey, input.source, 'fill-source.png', input.signal);
  const maskImage = input.mask ? await uploadAtlasBlob(baseUrl, apiKey, input.mask, 'fill-mask.png', input.signal) : undefined;
  const references = (
    await Promise.all(
      (input.references ?? []).map(async (reference, index) => {
        if (reference.image) return uploadAtlasBlob(baseUrl, apiKey, reference.image, `fill-reference-${index + 1}.png`, input.signal);
        return reference.imageUrl?.trim() || null;
      }),
    )
  ).filter((url): url is string => Boolean(url));

  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
    output_format: outputFormat,
    enable_safety_checker: true,
    image: sourceImage,
  };
  if (maskImage) body.mask_image = maskImage;
  if (references.length > 0) body.reference_images = references;

  const response = await fetch(`${baseUrl}/model/generateImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  if (!response.ok) {
    throw new Error(`Atlas image generation failed (${response.status}): ${await response.text()}`);
  }
  const created = (await response.json()) as AtlasImageResponse;
  if (created.error || created.data?.error) {
    throw new Error('Atlas image generation failed.');
  }

  const immediate = extractAtlasOutputUrl(created);
  const predictionId = extractAtlasPredictionId(created);
  const resultUrl = immediate ?? (predictionId ? await pollAtlasResult(baseUrl, apiKey, predictionId, input.signal) : undefined);
  if (!resultUrl) {
    throw new Error('Atlas did not return an image output.');
  }

  const normalized = /^(https?:|blob:|data:)/i.test(resultUrl)
    ? resultUrl
    : `data:image/${outputFormat};base64,${resultUrl}`;
  // Atlas results are signed CDN URLs with no CORS headers. On Android the patched-fetch proxy
  // re-encodes the signed query string and the CDN returns 403, so download through the direct,
  // non-proxied native path (CapacitorHttp.get / Electron net.fetch).
  return fetchProviderResultBlob(normalized, 'Atlas result download failed', input.signal);
}
