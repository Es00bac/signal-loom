// Pure builder: turn a Paper page's text frames into vector-text specs for the PDF/X exporter. Computes
// geometry (the text sub-box, in pt, with the page bleed offset, from the media top-left) and converts
// each frame's text colour to CMYK through the SAME output-profile transform the raster uses. Font bytes
// are NOT loaded here (kept pure) — the spec carries the face `fontUrl` for the browser adapter to fetch.
//
// CORRECTNESS GATE: the linear layout engine (paperTextLayout) reproduces only plain wrapped/aligned
// paragraph text. Any frame using a feature it does NOT reproduce (rotation, columns, letter-spacing,
// on-a-curve, scale/skew, stroke/shadow, drop caps, small caps, paragraph spacing, indents, bubbles, …)
// is NOT vectorized — that page falls back to a fully flattened raster so the export is never wrong.
// (Hyphenation is allowed: the raster doesn't actually hyphenate — `hyphens:auto` is a no-op without a
// lang — and Liberation is metric-compatible, so the wrap matches; verified by render comparison.)

import type { PaperDocument, PaperFrame, PaperPage } from '../types/paper';
import type { IccCmykTransform } from './paperColorManagement';
import { parseHexColor, type PaperRgb } from './paperSwatches';
import { resolveBundledFontFace, isDisplayFontFamily } from './paperFontResolution';
import type { PdfxVectorTextFrame } from './paperPdfxExport';

const PT_PER_MM = 72 / 25.4;

/**
 * A vector-text spec minus the font bytes (the adapter fetches `fontUrl` and adds `fontBytes`). Carries
 * the source `frameId` so the pipeline can exclude exactly the vectorized frames from the raster backdrop
 * (leaving unsafe/display-font text frames baked into the raster with their real glyphs).
 */
export type PdfxVectorTextFrameSpec = Omit<PdfxVectorTextFrame, 'fontBytes'> & { fontUrl: string; frameId: string };

function cssToRgb(css: string): PaperRgb | undefined {
  const hex = parseHexColor(css);
  if (hex) return hex;
  const match = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css);
  if (!match) return undefined;
  return { r: Math.round(+match[1]), g: Math.round(+match[2]), b: Math.round(+match[3]) };
}

function num(value: number | undefined): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * True when a text frame can be faithfully drawn by the linear layout engine — i.e. it uses none of the
 * features the engine can't reproduce. Non-text frames never block a page.
 */
export function frameTextIsVectorSafe(frame: PaperFrame): boolean {
  if (frame.kind !== 'text') return true;
  // Display/decorative faces (Impact SFX, comic titles, …) have no faithful Liberation substitute —
  // rasterize them (real glyphs) rather than vector-substitute a wrong-looking plain face.
  if (isDisplayFontFamily(frame.typography.fontFamily)) return false;
  // Frame-level text transforms / effects the linear engine doesn't reproduce.
  if (num(frame.rotationDeg) !== 0) return false;
  if (num(frame.textRotationDeg) !== 0) return false;
  if (num(frame.columns) > 1) return false;
  if (num(frame.textStrokeWidthMm) !== 0) return false;
  if (frame.textShadowColor) return false;
  if (num(frame.textSkewXDeg) !== 0 || num(frame.textSkewYDeg) !== 0) return false;
  if (frame.textScaleX != null && frame.textScaleX !== 1) return false;
  if (frame.textScaleY != null && frame.textScaleY !== 1) return false;
  if (num(frame.textArcPercent) !== 0) return false;
  if (frame.bubbleShape) return false;
  if (frame.vertices && frame.vertices.length > 0) return false;
  if (frame.textWrap) return false;
  if (frame.comicSfxDesign) return false;
  // Typography features the engine doesn't reproduce.
  const t = frame.typography;
  if (num(t.tracking) !== 0) return false;
  if (num(t.firstLineIndentMm) !== 0) return false;
  if (t.alignLast && t.alignLast !== 'auto') return false;
  if (t.smallCaps) return false;
  if (t.numericStyle && t.numericStyle !== 'normal') return false;
  if (num(t.dropCapLines) !== 0) return false;
  if (num(t.spaceBeforeMm) !== 0 || num(t.spaceAfterMm) !== 0) return false;
  if (t.lineBreak && t.lineBreak !== 'auto') return false;
  return true;
}

/**
 * True when a page's text can be drawn as vector — every text frame is vector-safe. If any isn't, the
 * whole page falls back to a fully flattened raster (correct, never wrong).
 */
export function pageTextIsVectorizable(page: PaperPage): boolean {
  return page.frames.every(frameTextIsVectorSafe);
}

/** Build vector-text specs for every non-empty, vector-safe text frame on a page. */
export function buildVectorTextFrameSpecs(
  page: PaperPage,
  document: PaperDocument,
  transform: IccCmykTransform,
): PdfxVectorTextFrameSpec[] {
  const bleedMm = document.page.bleedMm;
  const specs: PdfxVectorTextFrameSpec[] = [];
  for (const frame of page.frames) {
    if (frame.kind !== 'text' || !frameTextIsVectorSafe(frame)) continue;
    const text = frame.text ?? '';
    if (!text.trim()) continue;
    const typo = frame.typography;
    const face = resolveBundledFontFace(typo);
    const rgb = cssToRgb(typo.color) ?? { r: 0, g: 0, b: 0 };
    const cmyk = transform.rgbToCmyk(rgb); // 0..100

    // Text lives in a sub-box (percent of the frame); default is the full frame (0/0/100/100).
    const boxXMm = frame.xMm + frame.widthMm * (num(frame.textBoxXPercent) / 100);
    const boxYMm = frame.yMm + frame.heightMm * (num(frame.textBoxYPercent) / 100);
    const boxWMm = frame.widthMm * ((frame.textBoxWidthPercent ?? 100) / 100);
    const boxHMm = frame.heightMm * ((frame.textBoxHeightPercent ?? 100) / 100);

    specs.push({
      text,
      frameId: frame.id,
      fontId: face.id,
      fontUrl: face.url,
      fontSizePt: typo.fontSizePt,
      leadingPt: typo.leadingPt,
      align: typo.align,
      verticalAlign: frame.textVerticalAlign,
      cmyk: { c: cmyk.c / 100, m: cmyk.m / 100, y: cmyk.y / 100, k: cmyk.k / 100 },
      xPt: (bleedMm + boxXMm) * PT_PER_MM,
      yTopPt: (bleedMm + boxYMm) * PT_PER_MM,
      widthPt: boxWMm * PT_PER_MM,
      heightPt: boxHMm * PT_PER_MM,
    });
  }
  return specs;
}
