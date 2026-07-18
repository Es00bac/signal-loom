import { PAPER_SCREEN_PX_PER_MM } from './paperLayoutTools';
import { formatFontFamily } from './formatFontFamily';
import type { PaperTextMeasurer } from './paperTextFlow';

const PT_TO_PX = 96 / 72;

type ExtendedCanvasTextContext = CanvasRenderingContext2D & {
  fontStretch?: string;
  fontVariationSettings?: string;
};

interface CanvasTextPropertySupport {
  fontKerning: boolean;
  fontStretch: boolean;
  fontVariationSettings: boolean;
}

const CSS_MEASUREMENT_CACHE_LIMIT = 128;

function variationSettingsCss(settings: Record<string, number> | undefined): string {
  const entries = Object.entries(settings ?? {})
    .filter(([tag, value]) => /^[ -~]{4}$/.test(tag) && Number.isFinite(value))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([tag, value]) => `"${tag}" ${value}`).join(', ')
    : 'normal';
}

function measureWithCssProbe(
  ownerDocument: Document,
  text: string,
  spec: Parameters<PaperTextMeasurer>[1],
): number | undefined {
  if (!ownerDocument.body) return undefined;
  const probe = ownerDocument.createElement('span');
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
  ownerDocument.body.appendChild(probe);
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
  let contextDocument: Document | undefined;
  let propertySupport: CanvasTextPropertySupport | undefined;
  const cssMeasurementCache = new Map<string, number>();
  let cachedFontSet: FontFaceSet | undefined;
  let cachedFontsReady: Promise<FontFaceSet> | undefined;
  let cachedFontsStatus: FontFaceSetLoadStatus | undefined;
  let cachedFontsSize: number | undefined;
  let fontStateEpoch = 0;

  const getContext = (): CanvasRenderingContext2D | null => {
    const currentDocument = typeof document === 'undefined' ? undefined : document;
    if (currentDocument !== contextDocument) {
      contextDocument = currentDocument;
      context = undefined;
      propertySupport = undefined;
      cssMeasurementCache.clear();
      cachedFontSet = undefined;
      cachedFontsReady = undefined;
      cachedFontsStatus = undefined;
      cachedFontsSize = undefined;
      fontStateEpoch += 1;
    }
    if (context !== undefined) {
      return context;
    }
    context = currentDocument ? currentDocument.createElement('canvas').getContext('2d') : null;
    if (context) {
      const extended = context as ExtendedCanvasTextContext;
      // Capture capabilities before writing anything. Extensible mocks and older browser contexts accept
      // arbitrary expandos, so assign-then-check would falsely manufacture support.
      propertySupport = {
        fontKerning: 'fontKerning' in extended,
        fontStretch: 'fontStretch' in extended,
        fontVariationSettings: 'fontVariationSettings' in extended,
      };
    }
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
    if (propertySupport?.fontKerning) extended.fontKerning = spec.fontKerning ?? 'auto';
    if (propertySupport?.fontStretch) Reflect.set(extended, 'fontStretch', stretch);
    if (propertySupport?.fontVariationSettings) {
      extended.fontVariationSettings = variationSettingsCss(spec.fontVariationSettings);
    }

    // Canvas exposes kerning/stretch in current Chromium, but arbitrary variable-font axes are not universal.
    // When any requested property is unavailable, measure one detached CSS span with the exact live-paint
    // properties rather than pretending the unsupported canvas state affected glyph advances.
    const unsupportedProperties = [
      spec.fontStretch != null && !propertySupport?.fontStretch ? 'stretch' : '',
      spec.fontVariationSettings != null && !propertySupport?.fontVariationSettings ? 'variation' : '',
      spec.fontKerning != null && !propertySupport?.fontKerning ? 'kerning' : '',
    ].filter(Boolean);
    if (unsupportedProperties.length > 0 && contextDocument) {
      const fontSet = contextDocument.fonts;
      const fontsReady = fontSet?.ready;
      const fontsStatus = fontSet?.status;
      const fontsSize = fontSet?.size;
      if (fontSet !== cachedFontSet || fontsReady !== cachedFontsReady
        || fontsStatus !== cachedFontsStatus || fontsSize !== cachedFontsSize) {
        cssMeasurementCache.clear();
        cachedFontSet = fontSet;
        cachedFontsReady = fontsReady;
        cachedFontsStatus = fontsStatus;
        cachedFontsSize = fontsSize;
        fontStateEpoch += 1;
      }
      let fontAvailable: boolean | undefined;
      try {
        fontAvailable = fontSet?.check(
          `${spec.fontStyle ?? 'normal'} ${spec.fontWeight ?? '400'} ${stretch} ${fontSizePx}px ${formatFontFamily(spec.fontFamily)}`,
          text,
        );
      } catch {
        fontAvailable = undefined;
      }
      const cssKey = JSON.stringify([
        unsupportedProperties.join(','),
        fontStateEpoch,
        fontAvailable,
        text,
        formatFontFamily(spec.fontFamily),
        fontSizePx,
        spec.fontWeight ?? '400',
        spec.fontStyle ?? 'normal',
        stretch,
        variationSettingsCss(spec.fontVariationSettings),
        spec.fontKerning ?? 'auto',
        spec.tracking ?? 0,
      ]);
      const cachedWidth = cssMeasurementCache.get(cssKey);
      if (cachedWidth != null) {
        cssMeasurementCache.delete(cssKey);
        cssMeasurementCache.set(cssKey, cachedWidth);
        return cachedWidth / pxPerMm;
      }
      const cssWidth = measureWithCssProbe(contextDocument, text, spec);
      if (cssWidth != null) {
        if (cssMeasurementCache.size >= CSS_MEASUREMENT_CACHE_LIMIT) {
          const oldestKey = cssMeasurementCache.keys().next().value;
          if (oldestKey != null) cssMeasurementCache.delete(oldestKey);
        }
        cssMeasurementCache.set(cssKey, cssWidth);
      }
      if (cssWidth != null) return cssWidth / pxPerMm;
    }
    return (ctx.measureText(text).width + trackingPx) / pxPerMm;
  };
}
