import { useSettingsStore } from '../../store/settingsStore';
import type { GenerativeFillRequest, GenerativeFillResult } from '../imageEditorAi';
import { base64ToBlob, blobToBase64 } from './blobUtils';
import { buildLocalOpenImageEditRequest } from './requestBuilders';

export async function runLocalOpenInpaint(
  request: GenerativeFillRequest,
): Promise<GenerativeFillResult> {
  const settings = useSettingsStore.getState();
  const endpoint = (
    settings.providerSettings.localOpenImageEndpointUrl || ''
  ).trim();

  if (!endpoint) {
    throw new Error('Local/Open image endpoint not configured. Set it in Settings -> Runtime Options.');
  }

  const auth = (
    settings.providerSettings.localOpenImageAuthHeader || ''
  ).trim();
  const model = request.model
    ?? settings.providerSettings.localOpenImageDefaultModel
    ?? 'Qwen/Qwen-Image-Edit';
  const body = buildLocalOpenImageEditRequest({
    model,
    prompt: request.prompt,
    image: await blobToBase64(request.source),
    mask: await blobToBase64(request.mask),
    referenceImages: await resolveReferenceImages(request.references),
    outputFormat: 'png',
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth) {
    headers.Authorization = auth;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: request.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Local/Open image edit failed (${response.status}): ${await response.text()}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.startsWith('image/')) {
    return {
      png: await response.blob(),
      modelUsed: model,
    };
  }

  const json = (await response.json()) as { image?: string; mimeType?: string; modelUsed?: string; error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  if (!json.image) {
    throw new Error('Local/Open image edit response missing `image` field.');
  }

  return {
    png: base64ToBlob(json.image, json.mimeType ?? 'image/png'),
    modelUsed: json.modelUsed ?? model,
  };
}

async function resolveReferenceImages(
  references: GenerativeFillRequest['references'],
): Promise<string[]> {
  const resolved = await Promise.all((references ?? []).map(async (reference) => {
    if (reference.image) return blobToBase64(reference.image);
    const imageUrl = reference.imageUrl?.trim();
    if (!imageUrl) return null;
    const dataUrlMatch = imageUrl.match(/^data:[^;]+;base64,(.+)$/);
    return dataUrlMatch?.[1] ?? imageUrl;
  }));
  return resolved.filter((value): value is string => Boolean(value));
}
