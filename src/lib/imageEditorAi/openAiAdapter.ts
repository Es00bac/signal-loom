import { useSettingsStore } from '../../store/settingsStore';
import type { GenerativeFillRequest, GenerativeFillResult } from '../imageEditorAi';

const DEFAULT_MODEL = 'gpt-image-1';

export async function runOpenAiInpaint(
  request: GenerativeFillRequest,
): Promise<GenerativeFillResult> {
  const apiKey = useSettingsStore.getState().apiKeys.openai;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set it in Settings → API Keys.');
  }

  const baseUrl = useSettingsStore.getState().providerSettings.openaiBaseUrl;
  const model = request.model ?? DEFAULT_MODEL;

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  });

  const sourceFile = await blobToFile(request.source, 'source.png');
  const maskFile = await blobToFile(request.mask, 'mask.png');

  const response = await client.images.edit(
    {
      model,
      image: sourceFile,
      mask: maskFile,
      prompt: request.prompt,
    },
    {
      signal: request.abortSignal,
    },
  );

  const image = response.data?.[0];
  if (image?.b64_json) {
    const bytes = Uint8Array.from(atob(image.b64_json), (c) => c.charCodeAt(0));
    return {
      png: new Blob([bytes as BlobPart], { type: 'image/png' }),
      modelUsed: model,
    };
  }
  if (image?.url) {
    const fetched = await fetch(image.url, { signal: request.abortSignal });
    const blob = await fetched.blob();
    return { png: blob, modelUsed: model };
  }
  throw new Error('OpenAI returned no image data.');
}

async function blobToFile(blob: Blob, name: string): Promise<File> {
  return new File([blob], name, { type: blob.type || 'image/png' });
}
