import { useSettingsStore } from '../../store/settingsStore';
import type { AspectRatio } from '../../types/flow';
import { getSignalLoomNativeBridge } from '../nativeApp';
import type { GenerativeFillRequest, GenerativeFillResult } from '../imageEditorAi';
import { buildVertexGeminiImageRequestBody } from '../vertexImageRequests';
import { getVertexProjectConfig } from '../vertexProviderSettings';
import { getProviderLimiter } from '../providerRateLimiter';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

/**
 * Gemini image editing currently does not consume a separate mask channel via
 * its public API. We composite the mask onto the source (filling masked pixels
 * with magenta) and prompt the model to redraw the magenta region with the
 * user's prompt. This is a Phase 1 approximation; future revisions can switch
 * to a true mask-aware endpoint when one becomes available.
 */
export async function runGeminiInpaint(
  request: GenerativeFillRequest,
): Promise<GenerativeFillResult> {
  const settings = useSettingsStore.getState();
  const model = request.model ?? DEFAULT_MODEL;
  const aspectRatio = await resolveBlobAspectRatio(request.source);
  const compositedSource = await stampMaskOnSource(request.source, request.mask);
  const compositeBase64 = await blobToBase64(compositedSource);
  const augmentedPrompt = [
    'Replace the magenta-stamped region of the image with: ',
    request.prompt,
    '. Match the surrounding lighting and texture.',
  ].join('');

  if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
    return runVertexGeminiInpaint({
      augmentedPrompt,
      aspectRatio,
      compositeBase64,
      model,
    });
  }

  const apiKey = settings.apiKeys.gemini;
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set it in Settings -> API Keys, or switch Google image credential mode to Vertex AI desktop auth.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const limiter = getProviderLimiter('gemini');
  const response = await limiter.acquire(() => ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: compositeBase64, mimeType: 'image/png' } },
          { text: augmentedPrompt },
        ],
      },
    ],
  }));

  const part = response.candidates?.[0]?.content?.parts?.find(
    (p) => 'inlineData' in p && p.inlineData?.data,
  );
  if (!part || !('inlineData' in part) || !part.inlineData?.data) {
    throw new Error('Gemini returned no image data.');
  }

  const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  return {
    png: new Blob([bytes as BlobPart], { type: part.inlineData.mimeType ?? 'image/png' }),
    modelUsed: model,
  };
}

async function runVertexGeminiInpaint(input: {
  augmentedPrompt: string;
  aspectRatio: AspectRatio;
  compositeBase64: string;
  model: string;
}): Promise<GenerativeFillResult> {
  const { providerSettings } = useSettingsStore.getState();
  const vertexConfig = getVertexProjectConfig(providerSettings);

  if (!vertexConfig.projectId) {
    throw new Error('Vertex AI project ID is missing. Add it in Settings before running Gemini generative fill.');
  }

  const bridge = getSignalLoomNativeBridge();

  if (!bridge?.generateVertexImage) {
    throw new Error('Vertex AI requires the Signal Loom desktop app with the native Vertex bridge.');
  }

  const limiter = getProviderLimiter('gemini');
  const result = await limiter.acquire(() => bridge.generateVertexImage({
    projectId: vertexConfig.projectId,
    location: vertexConfig.location,
    auth: vertexConfig.auth,
    modelId: input.model,
    route: 'gemini-generate-content',
    body: buildVertexGeminiImageRequestBody({
      prompt: input.augmentedPrompt,
      aspectRatio: input.aspectRatio,
      sourceImage: {
        mimeType: 'image/png',
        data: input.compositeBase64,
      },
    }),
  }));

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.result) {
    throw new Error('Vertex Gemini returned no image data.');
  }

  return {
    png: await dataUrlToBlob(result.result, result.mimeType ?? 'image/png'),
    modelUsed: input.model,
  };
}

async function resolveBlobAspectRatio(blob: Blob): Promise<AspectRatio> {
  const image = await createImageBitmap(blob);
  const ratio = image.width / image.height;
  image.close();
  const candidates: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

  return candidates.reduce((nearest, candidate) => {
    const nearestDelta = Math.abs(aspectRatioValue(nearest) - ratio);
    const candidateDelta = Math.abs(aspectRatioValue(candidate) - ratio);
    return candidateDelta < nearestDelta ? candidate : nearest;
  }, '1:1' as AspectRatio);
}

function aspectRatioValue(value: AspectRatio): number {
  const [width, height] = value.split(':').map((part) => Number(part));
  return width / height;
}

async function stampMaskOnSource(source: Blob, mask: Blob): Promise<Blob> {
  const sourceImg = await createImageBitmap(source);
  const maskImg = await createImageBitmap(mask);
  const canvas = new OffscreenCanvas(sourceImg.width, sourceImg.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for Gemini composite');
  ctx.drawImage(sourceImg, 0, 0);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ff00ff';
  // Use mask as alpha for the magenta fill via a temp canvas.
  const overlay = new OffscreenCanvas(sourceImg.width, sourceImg.height);
  const octx = overlay.getContext('2d');
  if (!octx) throw new Error('Failed to acquire 2D context for Gemini overlay');
  octx.drawImage(maskImg, 0, 0);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = '#ff00ff';
  octx.fillRect(0, 0, sourceImg.width, sourceImg.height);
  ctx.drawImage(overlay, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Promise<Blob> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error('Vertex Gemini returned an unsupported image URL.');
  }

  const mimeType = match[1] || fallbackMimeType;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new Blob([bytes as BlobPart], { type: mimeType });
}
