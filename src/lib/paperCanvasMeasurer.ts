import { PAPER_SCREEN_PX_PER_MM } from './paperLayoutTools';
import type { PaperTextMeasurer } from './paperTextFlow';

const PT_TO_PX = 96 / 72;

/**
 * A `PaperTextMeasurer` backed by a shared 2D canvas context, returning text widths in mm at the
 * unzoomed screen scale (matching the renderer's `fontSizePt * 96/72` px sizing). Falls back to a
 * rough average-character estimate where no canvas is available (headless / SSR).
 */
export function createPaperCanvasMeasurer(pxPerMm = PAPER_SCREEN_PX_PER_MM): PaperTextMeasurer {
  let context: CanvasRenderingContext2D | null | undefined;

  const getContext = (): CanvasRenderingContext2D | null => {
    if (context !== undefined) {
      return context;
    }
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    return context;
  };

  return (text, spec) => {
    const fontSizePx = spec.fontSizePt * PT_TO_PX;
    const trackingPx = Math.max(0, text.length - 1) * ((spec.tracking ?? 0) / 1000) * fontSizePx;
    const ctx = getContext();
    if (!ctx) {
      return (text.length * fontSizePx * 0.5 + trackingPx) / pxPerMm;
    }
    const stylePrefix = spec.fontStyle && spec.fontStyle !== 'normal' ? `${spec.fontStyle} ` : '';
    ctx.font = `${stylePrefix}${spec.fontWeight ?? 400} ${fontSizePx}px ${spec.fontFamily}`;
    return (ctx.measureText(text).width + trackingPx) / pxPerMm;
  };
}
