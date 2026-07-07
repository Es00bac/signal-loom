// Pure builder: find the frames on a page whose fill is a real SPOT swatch and turn each into a
// PdfxSpotFill spec for the exporter's /Separation plate, plus the ids of the frames whose fill must be
// knocked out of the flattened raster (so the spot ink lives ONLY on its named plate, not doubled as
// process). Conservative by construction: only an un-stroked rectangle (optionally rotated about its centre
// and/or rounded-cornered) can become a spot plate — the /Separation shape has to line up exactly with the
// knocked-out region. A partial fill opacity is kept as the spot TINT (a screen of the ink). Anything
// fancier (gradient, a border, a non-rectangular polygon, or a swatch with no CMYK alternate) stays process
// CMYK and is disclosed in preflight. Framework-free + unit-testable.

import type { PaperDocument, PaperFrame, PaperPage } from '../types/paper';
import type { PaperSwatch } from './paperSwatches';
import type { PdfxSpotFill } from './paperPdfxExport';

const PT_PER_MM = 72 / 25.4;

export interface SpotFillPlan {
  /** Spot rectangles to draw as /Separation plates, in points from the media (bleed) top-left. */
  spotFills: PdfxSpotFill[];
  /** Frames whose fill must be removed from the flatten raster (their spot ink is on the plate instead). */
  knockoutFrameIds: string[];
  /** Spot swatch names that ARE preserved as plates (for honest preflight disclosure). */
  preservedSpotNames: string[];
}

const num = (v: number | undefined): number => (typeof v === 'number' ? v : 0);

/** True when a frame is a rectangle we can faithfully replace with a single /Separation rect (optionally
 * rotated about its centre). A partial fill opacity is allowed — it becomes the spot TINT (a screen of the
 * ink), which is exactly what the plate's `scn <tint>` expresses. A fully transparent fill (opacity 0) is
 * nothing to plate. */
function isPlateableRect(frame: PaperFrame): boolean {
  // Rotation + rounded corners are allowed — the plate draws rotated/rounded to match the knockout.
  if (frame.vertices && frame.vertices.length > 0) return false;
  if (frame.fillGradient) return false;
  if (num(frame.fillOpacity) <= 0) return false; // invisible fill — no plate
  if (frame.bubbleShape) return false;
  // A visible stroke would be overpainted by the spot rect (drawn on top of the raster) — require none.
  const hasStroke = num(frame.strokeWidthMm) > 0 && frame.strokeColor !== 'transparent' && num(frame.strokeOpacity) > 0;
  return !hasStroke;
}

/** The spot tint (0..1) a frame's fill contributes — its fill opacity, so a screened swatch plates at its
 * screen density. Defaults to solid (1) when opacity is unset. */
function spotTint(frame: PaperFrame): number {
  const opacity = frame.fillOpacity;
  return typeof opacity === 'number' ? Math.max(0, Math.min(1, opacity)) : 1;
}

export function collectSpotFills(page: PaperPage, document: PaperDocument): SpotFillPlan {
  const spotById = new Map<string, PaperSwatch>();
  for (const swatch of document.swatches ?? []) {
    if (swatch.type === 'spot') spotById.set(swatch.id, swatch);
  }
  const spotFills: PdfxSpotFill[] = [];
  const knockoutFrameIds: string[] = [];
  const preserved = new Set<string>();
  if (spotById.size === 0) return { spotFills, knockoutFrameIds, preservedSpotNames: [] };

  const bleedMm = document.page.bleedMm;
  for (const frame of page.frames) {
    if (!frame.fillSwatchId) continue;
    const swatch = spotById.get(frame.fillSwatchId);
    if (!swatch || !swatch.cmyk) continue; // no CMYK alternate → can't build a plate
    if (!isPlateableRect(frame)) continue; // not faithfully replaceable → leave as process (disclosed)

    const rot = num(frame.rotationDeg);
    spotFills.push({
      name: swatch.spotName ?? swatch.name,
      cmyk: { c: swatch.cmyk.c / 100, m: swatch.cmyk.m / 100, y: swatch.cmyk.y / 100, k: swatch.cmyk.k / 100 },
      tint: spotTint(frame), // fill opacity → screen density on the plate (1 = solid)
      xPt: (bleedMm + frame.xMm) * PT_PER_MM,
      yTopPt: (bleedMm + frame.yMm) * PT_PER_MM,
      widthPt: frame.widthMm * PT_PER_MM,
      heightPt: frame.heightMm * PT_PER_MM,
      // Rotated plate rect: pivot is the frame centre (matches CSS transform-origin: center + the knockout).
      rotationDeg: rot || undefined,
      centerXPt: rot ? (bleedMm + frame.xMm + frame.widthMm / 2) * PT_PER_MM : undefined,
      centerYTopPt: rot ? (bleedMm + frame.yMm + frame.heightMm / 2) * PT_PER_MM : undefined,
      cornerRadiusPt: num(frame.cornerRadiusMm) ? frame.cornerRadiusMm! * PT_PER_MM : undefined,
    });
    knockoutFrameIds.push(frame.id);
    preserved.add(swatch.spotName ?? swatch.name);
  }
  return { spotFills, knockoutFrameIds, preservedSpotNames: [...preserved] };
}
