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

import type { PaperDocument, PaperFrame, PaperImportedFont, PaperPage } from '../types/paper';
import { applyBlackPolicy, type IccCmykTransform } from './paperColorManagement';
import { parseHexColor, type PaperRgb } from './paperSwatches';
import { isDisplayFontFamily, isBoldWeight } from './paperFontResolution';
import { findUncoveredCharacters } from './paperFontVetting';
import { resolveTextFace, selectImportedFace, normalizeFamilyName } from './paperFontLibrary';
import type { PdfxOutlineTextFrame, PdfxVectorTextFrame } from './paperPdfxExport';

const PT_PER_MM = 72 / 25.4;

/** The kinds whose text the print/flatten render lays out as a paragraph (so we can draw it as vector). */
function isVectorTextKind(kind: PaperFrame['kind']): boolean {
  return kind === 'text' || kind === 'caption';
}

/**
 * Content inset (mm) the print/flatten render applies to text — matches `printFrameContentPaddingMm`
 * (2mm for text/caption). With CSS `box-sizing: border-box`, the text box is also inset by the frame's
 * border, so the vector text must inset by border + padding to sit exactly on the rasterized backdrop.
 */
const CONTENT_PADDING_MM = 2;

/**
 * A vector-text spec minus the resolved font bytes. Carries EITHER a bundled `fontUrl` for the adapter to
 * fetch, OR inline `fontBytes` (an imported font that lives in the document). Also carries the source
 * `frameId` so the pipeline can exclude exactly the vectorized frames from the raster backdrop (leaving
 * unsafe/display-font text frames baked into the raster with their real glyphs).
 */
export type PdfxVectorTextFrameSpec = Omit<PdfxVectorTextFrame, 'fontBytes'> & {
  fontUrl?: string;
  fontBytes?: Uint8Array;
  frameId: string;
};

/**
 * True when a font has a glyph for every (non-whitespace) codepoint in the text. Used to keep an imported
 * font that DOESN'T cover the text out of the vector layer — vectorizing it would draw .notdef boxes, so
 * that frame falls back to raster instead (where the browser's font fallback renders the missing glyphs).
 * Delegates to the shared `findUncoveredCharacters` so the exporter's decision and preflight's disclosure
 * agree exactly. Fails open (empty = covered) when the bytes can't be parsed.
 */
function fontCoversText(bytes: Uint8Array, text: string): boolean {
  return findUncoveredCharacters(bytes, text).length === 0;
}

/** True when the frame's family+style matches an embeddable imported font (so we embed the real glyphs). */
function frameHasImportedFace(frame: PaperFrame, importedFonts: readonly PaperImportedFont[] | undefined): boolean {
  const t = frame.typography;
  const family = normalizeFamilyName(t.fontFamily ?? '');
  if (!family) return false;
  const bold = isBoldWeight(t.fontWeight);
  const italic = (t.fontStyle ?? '').toLowerCase() === 'italic';
  return !!selectImportedFace(family, bold, italic, importedFonts ?? []);
}

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
export function frameTextIsVectorSafe(frame: PaperFrame, importedFonts?: readonly PaperImportedFont[]): boolean {
  if (!isVectorTextKind(frame.kind)) return true;
  // Display/decorative faces (Impact SFX, comic titles, …) have no faithful Liberation substitute — so
  // rasterize them (real glyphs) rather than vector-substitute a wrong-looking plain face. BUT if the user
  // imported that exact font, we embed its real glyphs as vector, so the display gate no longer applies.
  if (isDisplayFontFamily(frame.typography.fontFamily) && !frameHasImportedFace(frame, importedFonts)) return false;
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
export function pageTextIsVectorizable(page: PaperPage, importedFonts?: readonly PaperImportedFont[]): boolean {
  return page.frames.every((frame) => frameTextIsVectorSafe(frame, importedFonts));
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
    if (!isVectorTextKind(frame.kind) || !frameTextIsVectorSafe(frame, document.importedFonts)) continue;
    const text = frame.text ?? '';
    if (!text.trim()) continue;
    const typo = frame.typography;
    // Prefer the user's imported font (real glyphs); fall back to the bundled Liberation substitute.
    const face = resolveTextFace(typo, document.importedFonts);
    // An imported font that doesn't cover this text would draw .notdef boxes as vector — skip it so the
    // frame rasters instead (the browser's font fallback renders the missing glyphs correctly).
    if (face.bytes && !fontCoversText(face.bytes, text)) continue;
    const rgb = cssToRgb(typo.color) ?? { r: 0, g: 0, b: 0 };
    // Apply the document's black policy to this text: `force-100k-text` rewrites near-black text to pure
    // K (0/0/0/100) so small type doesn't fringe from 4-plate mis-registration at the press.
    const cmyk = applyBlackPolicy(
      { space: 'cmyk', cmyk: transform.rgbToCmyk(rgb), approximate: transform.kind !== 'icc', profileName: transform.profileName },
      document.printProduction.blackPolicy,
      true,
    ).cmyk; // 0..100

    // Match the print/flatten render's geometry so the vector text sits exactly on the rasterized
    // backdrop: text fills the frame inset by the border + 2mm content padding (box-sizing: border-box).
    // The editor's text sub-box percentages are NOT applied by the print render, so we don't apply them
    // here either. Only captions get a flex vertical-align in the raster; text frames are always top.
    const inset = num(frame.strokeWidthMm) + CONTENT_PADDING_MM;
    const boxXMm = frame.xMm + inset;
    const boxYMm = frame.yMm + inset;
    const boxWMm = Math.max(0, frame.widthMm - 2 * inset);
    const boxHMm = Math.max(0, frame.heightMm - 2 * inset);

    specs.push({
      text,
      frameId: frame.id,
      fontId: face.id,
      fontUrl: face.url,
      fontBytes: face.bytes,
      subset: face.noSubsetting ? false : undefined,
      fontSizePt: typo.fontSizePt,
      leadingPt: typo.leadingPt,
      align: typo.align,
      verticalAlign: frame.kind === 'caption' ? frame.textVerticalAlign : undefined,
      cmyk: { c: cmyk.c / 100, m: cmyk.m / 100, y: cmyk.y / 100, k: cmyk.k / 100 },
      xPt: (bleedMm + boxXMm) * PT_PER_MM,
      yTopPt: (bleedMm + boxYMm) * PT_PER_MM,
      widthPt: boxWMm * PT_PER_MM,
      heightPt: boxHMm * PT_PER_MM,
    });
  }
  return specs;
}

/**
 * True when a text frame can't be drawn as selectable type but CAN be drawn as filled glyph outlines
 * (vector curves) — so it stays crisp vector instead of rasterizing. First slice: the only thing blocking
 * live-type vectorization is a text STROKE (comic-style outlined lettering). Everything else about the
 * frame must otherwise be vector-safe (same font we hold, upright, single column, …); if it's unsafe for
 * any OTHER reason (a display font we don't have, rotation, columns) it stays raster for now.
 */
export function frameTextIsOutlineable(frame: PaperFrame, importedFonts?: readonly PaperImportedFont[]): boolean {
  if (!isVectorTextKind(frame.kind)) return false;
  if (frameTextIsVectorSafe(frame, importedFonts)) return false; // already handled as selectable type
  // First tier of outlining handles the UPRIGHT blockers (no transform-origin ambiguity): a text stroke
  // and/or letter-spacing (tracking). Rotation/skew/scale/arc/bubble are outlineable too but need the
  // exporter to match the editor's transform geometry — a later slice.
  const hasStroke = num(frame.textStrokeWidthMm) > 0;
  const hasTracking = num(frame.typography.tracking) !== 0;
  if (!hasStroke && !hasTracking) return false;
  // Would it be vector-safe with those upright blockers neutralised? If so, they're the ONLY blockers.
  const normalized: PaperFrame = {
    ...frame,
    textStrokeWidthMm: 0,
    typography: { ...frame.typography, tracking: 0 },
  };
  return frameTextIsVectorSafe(normalized, importedFonts);
}

/** A PdfxOutlineTextFrame minus resolved bytes — carries a bundled `fontUrl` OR inline `fontBytes` plus the
 * source `frameId` (so the pipeline can knock exactly these frames' text out of the raster backdrop). */
export type PdfxOutlineTextFrameSpec = Omit<PdfxOutlineTextFrame, 'fontBytes'> & {
  fontUrl?: string;
  fontBytes?: Uint8Array;
  frameId: string;
};

/** Build outline-text specs for every non-empty, outline-only (stroked) text frame on a page. */
export function buildOutlineTextFrameSpecs(
  page: PaperPage,
  document: PaperDocument,
  transform: IccCmykTransform,
): PdfxOutlineTextFrameSpec[] {
  const bleedMm = document.page.bleedMm;
  const blackPolicy = document.printProduction.blackPolicy;
  const toCmyk01 = (css: string | undefined) => {
    if (!css) return undefined;
    const rgb = cssToRgb(css);
    if (!rgb) return undefined;
    const c = applyBlackPolicy(
      { space: 'cmyk', cmyk: transform.rgbToCmyk(rgb), approximate: transform.kind !== 'icc', profileName: transform.profileName },
      blackPolicy,
      true,
    ).cmyk;
    return { c: c.c / 100, m: c.m / 100, y: c.y / 100, k: c.k / 100 };
  };
  const specs: PdfxOutlineTextFrameSpec[] = [];
  for (const frame of page.frames) {
    if (!isVectorTextKind(frame.kind) || !frameTextIsOutlineable(frame, document.importedFonts)) continue;
    const text = frame.text ?? '';
    if (!text.trim()) continue;
    const typo = frame.typography;
    const face = resolveTextFace(typo, document.importedFonts);
    // A missing glyph would outline as .notdef — skip so the frame rasters (browser fallback draws it).
    if (face.bytes && !fontCoversText(face.bytes, text)) continue;
    const fill = toCmyk01(typo.color) ?? { c: 0, m: 0, y: 0, k: 1 };
    const stroke = toCmyk01(frame.textStrokeColor);

    const inset = num(frame.strokeWidthMm) + CONTENT_PADDING_MM;
    const boxXMm = frame.xMm + inset;
    const boxYMm = frame.yMm + inset;
    const boxWMm = Math.max(0, frame.widthMm - 2 * inset);
    const boxHMm = Math.max(0, frame.heightMm - 2 * inset);

    specs.push({
      text,
      frameId: frame.id,
      fontId: face.id,
      fontUrl: face.url,
      fontBytes: face.bytes,
      fontSizePt: typo.fontSizePt,
      leadingPt: typo.leadingPt,
      align: typo.align,
      verticalAlign: frame.kind === 'caption' ? frame.textVerticalAlign : undefined,
      cmyk: fill,
      xPt: (bleedMm + boxXMm) * PT_PER_MM,
      yTopPt: (bleedMm + boxYMm) * PT_PER_MM,
      widthPt: boxWMm * PT_PER_MM,
      heightPt: boxHMm * PT_PER_MM,
      // CSS letter-spacing is (tracking/1000)em, i.e. of the font size (PaperWorkspace applies it as such).
      trackingPt: (num(typo.tracking) / 1000) * typo.fontSizePt,
      strokeCmyk: stroke,
      strokeWidthPt: num(frame.textStrokeWidthMm) * PT_PER_MM,
    });
  }
  return specs;
}
