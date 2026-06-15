export type MaskEncoding = 'openai-alpha-cutout' | 'white-on-black';

/** Atlas GPT-image routes go through the OpenAI-compatible client; native slugs do not. */
function isOpenAiCompatibleAtlasModel(modelId: string | undefined): boolean {
  const id = (modelId ?? '').trim().toLowerCase();
  return !id.includes('/') || id.startsWith('openai/');
}

export function maskEncodingForProvider(provider: string, modelId: string | undefined): MaskEncoding {
  if (provider === 'openai') return 'openai-alpha-cutout';
  if (provider === 'atlas') {
    return isOpenAiCompatibleAtlasModel(modelId) ? 'openai-alpha-cutout' : 'white-on-black';
  }
  // stability, localOpen, atlas-native, qwen, generic, etc.
  return 'white-on-black';
}

/** Canonical mask = RGBA where alpha > 127 means "edit here". */
export function transformMaskPixels(src: Uint8ClampedArray, encoding: MaskEncoding): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const isEdit = src[i + 3] > 127;
    if (encoding === 'openai-alpha-cutout') {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
      out[i + 3] = isEdit ? 0 : 255; // OpenAI edits where the mask is transparent
    } else {
      const v = isEdit ? 255 : 0;
      out[i] = v; out[i + 1] = v; out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}

async function decodeToImageData(dataUrl: string, width: number, height: number): Promise<ImageData> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode mask image.'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for mask normalization.');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function encodeToPngBlob(bytes: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for mask normalization.');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(bytes);
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Mask PNG encoding failed.'))), 'image/png'),
  );
}

export interface NormalizeMaskOptions {
  provider: string;
  modelId?: string;
  width: number;
  height: number;
}

/** Convert a canonical mask data URL to the PNG a specific provider expects. */
export async function normalizeMaskForProvider(maskDataUrl: string, opts: NormalizeMaskOptions): Promise<Blob> {
  const encoding = maskEncodingForProvider(opts.provider, opts.modelId);
  const imageData = await decodeToImageData(maskDataUrl, opts.width, opts.height);
  const transformed = transformMaskPixels(imageData.data, encoding);
  return encodeToPngBlob(transformed, opts.width, opts.height);
}

/** Decode a data URL to its natural pixel dimensions (used to size the normalized mask to the source). */
export async function getDataUrlDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to read image dimensions.'));
    image.src = dataUrl;
  });
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}
