import type { RuntimeSettingsSnapshot } from '../../types/flow';
import { blobToBase64 } from '../imageEditorAi/blobUtils';

export interface DetectedObject {
  label: string;
  /** Gemini box_2d: [ymin, xmin, ymax, xmax] in 0-1000 normalized space. */
  box: [number, number, number, number];
}

export interface DetectedMask {
  /** Canonical RGBA PNG data URL (opaque = detected/edit). */
  maskDataUrl: string;
  objects: DetectedObject[];
}

export interface ObjectMaskDetectInput {
  sourceImageDataUrl: string;
  phrase: string;
  width: number;
  height: number;
  signal?: AbortSignal;
}

export interface ObjectMaskDetector {
  id: string;
  label: string;
  isConfigured(settings: RuntimeSettingsSnapshot): boolean;
  detect(input: ObjectMaskDetectInput): Promise<DetectedMask>;
}

/** Returns a width*height alpha map (0 or 255) with each box filled opaque. Canvas-free, pure. */
export function compositeBoxesToCanonicalAlpha(
  objects: DetectedObject[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  for (const obj of objects) {
    const [ymin, xmin, ymax, xmax] = obj.box;
    const x0 = Math.max(0, Math.floor((xmin / 1000) * width));
    const x1 = Math.min(width, Math.ceil((xmax / 1000) * width));
    const y0 = Math.max(0, Math.floor((ymin / 1000) * height));
    const y1 = Math.min(height, Math.ceil((ymax / 1000) * height));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        alpha[y * width + x] = 255;
      }
    }
  }
  return alpha;
}

const GEMINI_SEGMENTATION_MODEL = 'gemini-2.5-flash';

interface GeminiSegmentRecord {
  label?: string;
  box_2d?: [number, number, number, number];
}

// The detector reads the key via a module-level setter so it has no store import cycle.
let detectorGeminiKey = '';
export function configureDetectorKeys(settings: RuntimeSettingsSnapshot): void {
  detectorGeminiKey = settings.apiKeys?.gemini?.trim() ?? '';
}
function requireDetectorGeminiKey(): string {
  if (!detectorGeminiKey) throw new Error('Configure a Gemini API key to use object detection.');
  return detectorGeminiKey;
}

export function parseGeminiSegments(text: string): DetectedObject[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let records: GeminiSegmentRecord[] = [];
  try { records = JSON.parse(match[0]) as GeminiSegmentRecord[]; } catch { return []; }
  return records
    .filter((r) => Array.isArray(r.box_2d) && r.box_2d.length === 4)
    .map((r) => ({ label: r.label ?? 'object', box: r.box_2d as [number, number, number, number] }));
}

async function buildMaskDataUrl(objects: DetectedObject[], width: number, height: number): Promise<string> {
  const alpha = compositeBoxesToCanonicalAlpha(objects, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable for detection mask.');
  const imageData = ctx.createImageData(width, height);
  for (let p = 0; p < alpha.length; p += 1) {
    imageData.data[p * 4] = 255;
    imageData.data[p * 4 + 1] = 255;
    imageData.data[p * 4 + 2] = 255;
    imageData.data[p * 4 + 3] = alpha[p];
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export const geminiSegmentationDetector: ObjectMaskDetector = {
  id: 'gemini-segmentation',
  label: 'Gemini object detection',
  isConfigured: (settings) => Boolean(settings.apiKeys?.gemini?.trim()),
  detect: async (input) => {
    const apiKey = requireDetectorGeminiKey();
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    // fetch handles data:, blob:, and http(s) source URLs uniformly.
    const sourceResponse = await fetch(input.sourceImageDataUrl, { signal: input.signal });
    const base64 = await blobToBase64(await sourceResponse.blob());
    const response = await client.models.generateContent({
      model: GEMINI_SEGMENTATION_MODEL,
      contents: [{
        parts: [
          { text: `Detect "${input.phrase}". Return ONLY a JSON array; each item has "label" and "box_2d" ([ymin,xmin,ymax,xmax] scaled 0-1000).` },
          { inlineData: { mimeType: 'image/png', data: base64 } },
        ],
      }],
    });
    const objects = parseGeminiSegments(response.text ?? '');
    return { maskDataUrl: await buildMaskDataUrl(objects, input.width, input.height), objects };
  },
};

export const OBJECT_MASK_DETECTORS: ObjectMaskDetector[] = [geminiSegmentationDetector];

export function listConfiguredDetectors(settings: RuntimeSettingsSnapshot): ObjectMaskDetector[] {
  return OBJECT_MASK_DETECTORS.filter((detector) => detector.isConfigured(settings));
}
