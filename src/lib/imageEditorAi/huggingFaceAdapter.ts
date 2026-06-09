import { useSettingsStore } from '../../store/settingsStore';
import type { GenerativeFillRequest, GenerativeFillResult } from '../imageEditorAi';

const DEFAULT_MODEL = 'runwayml/stable-diffusion-inpainting';

/**
 * Hugging Face inpainting via the public Inference API. The user can override
 * the model id by passing `model`. Requires a HF API token in settings.
 */
export async function runHuggingFaceInpaint(
  request: GenerativeFillRequest,
): Promise<GenerativeFillResult> {
  const apiKey = useSettingsStore.getState().apiKeys.huggingface;
  if (!apiKey) {
    throw new Error('Hugging Face API key not configured. Set it in Settings → API Keys.');
  }

  const model = request.model ?? DEFAULT_MODEL;
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;

  const sourceBase64 = await blobToBase64(request.source);
  const maskBase64 = await blobToBase64(request.mask);

  const body = JSON.stringify({
    inputs: request.prompt,
    parameters: {
      image: sourceBase64,
      mask_image: maskBase64,
    },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: request.abortSignal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face inpaint failed (${response.status}): ${text}`);
  }

  const blob = await response.blob();
  return {
    png: blob,
    modelUsed: model,
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
