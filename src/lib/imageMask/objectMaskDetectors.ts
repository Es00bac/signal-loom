import type { RuntimeSettingsSnapshot } from '../../types/flow';

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
