// Pure builder: turn a Paper page's text frames into vector-text specs for the PDF/X exporter. Computes
// geometry (mm→pt with the page bleed offset, from the media top-left) and converts each frame's text
// colour to CMYK through the SAME output-profile transform the raster uses. Font bytes are NOT loaded
// here (kept pure) — the spec carries the face `fontUrl` for the browser adapter to fetch. Framework-free
// + unit-testable.

import type { PaperDocument, PaperPage } from '../types/paper';
import type { IccCmykTransform } from './paperColorManagement';
import { parseHexColor, type PaperRgb } from './paperSwatches';
import { resolveBundledFontFace } from './paperFontResolution';
import type { PdfxVectorTextFrame } from './paperPdfxExport';

const PT_PER_MM = 72 / 25.4;

/** A vector-text spec minus the font bytes (the adapter fetches `fontUrl` and adds `fontBytes`). */
export type PdfxVectorTextFrameSpec = Omit<PdfxVectorTextFrame, 'fontBytes'> & { fontUrl: string };

function cssToRgb(css: string): PaperRgb | undefined {
  const hex = parseHexColor(css);
  if (hex) return hex;
  const match = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css);
  if (!match) return undefined;
  return { r: Math.round(+match[1]), g: Math.round(+match[2]), b: Math.round(+match[3]) };
}

/**
 * True when a page's text can be drawn as vector — i.e. no text frame is rotated. Rotated text stays in
 * the raster (v1 keeps rotation faithful there rather than risk a wrong vector placement); such pages
 * fall back to a fully flattened raster.
 */
export function pageTextIsVectorizable(page: PaperPage): boolean {
  return page.frames.every((frame) => frame.kind !== 'text' || (frame.rotationDeg ?? 0) === 0);
}

/** Build vector-text specs for every non-empty, unrotated text frame on a page. */
export function buildVectorTextFrameSpecs(
  page: PaperPage,
  document: PaperDocument,
  transform: IccCmykTransform,
): PdfxVectorTextFrameSpec[] {
  const bleedMm = document.page.bleedMm;
  const specs: PdfxVectorTextFrameSpec[] = [];
  for (const frame of page.frames) {
    if (frame.kind !== 'text') continue;
    if ((frame.rotationDeg ?? 0) !== 0) continue;
    const text = frame.text ?? '';
    if (!text.trim()) continue;
    const typo = frame.typography;
    const face = resolveBundledFontFace(typo);
    const rgb = cssToRgb(typo.color) ?? { r: 0, g: 0, b: 0 };
    const cmyk = transform.rgbToCmyk(rgb); // 0..100
    specs.push({
      text,
      fontId: face.id,
      fontUrl: face.url,
      fontSizePt: typo.fontSizePt,
      leadingPt: typo.leadingPt,
      align: typo.align,
      cmyk: { c: cmyk.c / 100, m: cmyk.m / 100, y: cmyk.y / 100, k: cmyk.k / 100 },
      xPt: (bleedMm + frame.xMm) * PT_PER_MM,
      yTopPt: (bleedMm + frame.yMm) * PT_PER_MM,
      widthPt: frame.widthMm * PT_PER_MM,
      heightPt: frame.heightMm * PT_PER_MM,
    });
  }
  return specs;
}
