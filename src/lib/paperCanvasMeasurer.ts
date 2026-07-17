import { PAPER_SCREEN_PX_PER_MM } from './paperLayoutTools';
import { formatFontFamily } from './formatFontFamily';
import type { PaperTextMeasurer } from './paperTextFlow';

const PT_TO_PX = 96 / 72;

type ExtendedCanvasTextContext = CanvasRenderingContext2D & {
  fontStretch?: string;
  fontVariationSettings?: string;
};

function variationSettingsCss(settings: Record<string, number> | undefined): string {
  const entries = Object.entries(settings ?? {})
    .filter(([tag, value]) => /^[ -~]{4}$/.test(tag) && Number.isFinite(value))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([tag, value]) => `"${tag}" ${value}`).join(', ')
    : 'normal';
}

function measureWithCssProbe(text: string, spec: Parameters<PaperTextMeasurer>[1]): number | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  const probe = document.createElement('span');
  if (!probe.style || typeof probe.getBoundingClientRect !== 'function') return undefined;
  probe.textContent = text;
  Object.assign(probe.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre',
    left: '-100000px',
    top: '0',
    fontFamily: formatFontFamily(spec.fontFamily),
    fontSize: `${spec.fontSizePt * PT_TO_PX}px`,
    fontWeight: spec.fontWeight ?? '400',
    fontStyle: spec.fontStyle ?? 'normal',
    fontStretch: spec.fontStretch ?? 'normal',
    fontVariationSettings: variationSettingsCss(spec.fontVariationSettings),
    fontKerning: spec.fontKerning ?? 'auto',
    letterSpacing: `${(spec.tracking ?? 0) / 1000}em`,
  });
  document.body.appendChild(probe);
  try {
    const width = probe.getBoundingClientRect().width;
    return Number.isFinite(width) && width >= 0 ? width : undefined;
  } finally {
    probe.remove();
  }
}

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
    const extended = ctx as ExtendedCanvasTextContext;
    const stylePrefix = spec.fontStyle && spec.fontStyle !== 'normal' ? `${spec.fontStyle} ` : '';
    const stretch = spec.fontStretch ?? 'normal';
    const stretchPrefix = spec.fontStretch ? `${spec.fontStretch} ` : '';
    ctx.font = `${stylePrefix}${spec.fontWeight ?? 400} ${stretchPrefix}${fontSizePx}px ${formatFontFamily(spec.fontFamily)}`;
    ctx.fontKerning = spec.fontKerning ?? 'auto';
    if ('fontStretch' in extended) extended.fontStretch = stretch;
    if ('fontVariationSettings' in extended) {
      extended.fontVariationSettings = variationSettingsCss(spec.fontVariationSettings);
    }

    // Canvas exposes kerning/stretch in current Chromium, but arbitrary variable-font axes are not universal.
    // When any requested property is unavailable, measure one detached CSS span with the exact live-paint
    // properties rather than pretending the unsupported canvas state affected glyph advances.
    const needsCssProbe = (spec.fontStretch != null && !('fontStretch' in extended))
      || (spec.fontVariationSettings != null && !('fontVariationSettings' in extended))
      || (spec.fontKerning != null && !('fontKerning' in ctx));
    if (needsCssProbe) {
      const cssWidth = measureWithCssProbe(text, spec);
      if (cssWidth != null) return cssWidth / pxPerMm;
    }
    return (ctx.measureText(text).width + trackingPx) / pxPerMm;
  };
}
