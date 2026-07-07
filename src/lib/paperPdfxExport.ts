// Real PDF/X-1a and PDF/X-4 export (docs/notes/835). This is the exporter that makes Sloom Studio's
// "print PDF" claim TRUE instead of a labeled RGB PNG: every page is composited, converted to CMYK
// through a real ICC output profile (lcms2), and embedded as DeviceCMYK image data in a pdf-lib
// document carrying an embedded ICC OutputIntent (/S /GTS_PDFX), PDF/X XMP + Info metadata, and
// TrimBox/BleedBox. A print shop opening this in Acrobat/Enfocus/callas sees a genuine PDF/X file with
// the color space and output intent it needs — not a surprise RGB raster.
//
// Fidelity note: this path FLATTENS each page to a single high-resolution CMYK image. That is precisely
// what PDF/X-1a requires (no live transparency) and is fully valid PDF/X-4 as well; it is the correct,
// print-shop-accepted form for art/comic pages. Live vector text is a separate fidelity layer (a hybrid
// text-over-art PDF/X-4) tracked as a follow-up — this module is the conformant color+structure core.
//
// Pure + platform-agnostic: the caller injects the page rasters (RGBA) and an ICC transform, so this is
// unit-testable in Node and reused unchanged by the browser/Electron export paths.

import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFHexString,
  PDFDict,
  PDFNumber,
  PDFOperator,
  cmyk as cmykColor,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFFont,
  type PDFRef,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { IccCmykTransform } from './paperColorManagement';
import { layoutParagraphText, type PaperTextAlign } from './paperTextLayout';
import { applyInkLimitToCmykBuffer, limitTotalAreaCoverage } from './paperInkLimit';
import { createOutlineFont, measureTextWidthPt, outlineTextRun, type FontkitOutlineFont, type GlyphPathOp } from './paperGlyphOutlines';

export type PdfxStandard = 'pdf-x-1a' | 'pdf-x-4';

/** One rasterized page, already rendered at export DPI and INCLUDING any bleed margin. */
export interface PdfxRasterPage {
  /** 1-based page number (metadata/debug only). */
  pageNumber?: number;
  /** Interleaved RGBA, row-major top-to-bottom (canvas `getImageData` order). Length = width*height*4. */
  rgba: Uint8Array | Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
  /** Finished trim size in PostScript points (1 pt = 1/72"). */
  trimWidthPt: number;
  trimHeightPt: number;
  /** Symmetric bleed in points included on every side of the raster (0 when there is no bleed). */
  bleedPt?: number;
  /**
   * Optional real vector text drawn ON TOP of the raster (hybrid PDF/X). When present, these frames'
   * text was excluded from `rgba` (rasterized backdrop-only) and is re-drawn here as embedded,
   * selectable, resolution-independent CMYK type. Omit for a fully flattened page.
   */
  textFrames?: readonly PdfxVectorTextFrame[];
  /**
   * Optional solid spot-colour fills drawn as real `/Separation` plates on top of the raster. Each frame's
   * fill was knocked out of `rgba` (rendered as paper) so the spot ink lives ONLY on its named plate — it
   * survives as a separation instead of flattening to process CMYK. Drawn under the vector text.
   */
  spotFills?: readonly PdfxSpotFill[];
  /**
   * Optional text drawn as filled glyph OUTLINES (vector curves) rather than embedded selectable type —
   * the "convert to curves" tier. Used when the text can't be embedded as live type (a stroked/decorated
   * face) but must stay crisp vector, not raster. Like `textFrames`, these frames' text is knocked out of
   * `rgba`; unlike them, the glyphs carry no font (they're geometry), so the text isn't selectable.
   */
  outlineFrames?: readonly PdfxOutlineTextFrame[];
}

/** One solid spot-colour fill emitted as a `/Separation` colorspace rectangle (a real named plate). */
export interface PdfxSpotFill {
  /** Spot/Pantone name as it should appear on the plate (e.g. "PANTONE 185 C"). */
  name: string;
  /** Alternate DeviceCMYK at FULL strength (0..1) — how the spot previews/prints on a process press. */
  cmyk: { c: number; m: number; y: number; k: number };
  /** Tint 0..1 (1 = full strength). */
  tint: number;
  /** Rectangle in points from the media (bleed) TOP-LEFT, y increasing downward (flipped internally). */
  xPt: number;
  yTopPt: number;
  widthPt: number;
  heightPt: number;
}

/** One text box drawn as embedded vector type over the CMYK raster. Geometry is in points, measured
 * from the media (bleed) TOP-LEFT with y increasing downward — the exporter flips to PDF space. */
export interface PdfxVectorTextFrame {
  text: string;
  /** Embed-cache key (the font face id, e.g. "LiberationSerif-Bold"). */
  fontId: string;
  /** TrueType/OpenType bytes to embed. Only embedded once per `fontId`. */
  fontBytes: Uint8Array;
  /** Subset the embedded font (default true). False embeds the whole font — required when the font's
   * OS/2 fsType disallows subsetting. */
  subset?: boolean;
  fontSizePt: number;
  leadingPt: number;
  align: PaperTextAlign;
  /** Fill colour as DeviceCMYK components in 0..1 (converted through the same output profile). */
  cmyk: { c: number; m: number; y: number; k: number };
  /** Content-box top-left X from the media left edge, in points. */
  xPt: number;
  /** Content-box top-left Y from the media TOP edge, in points (flipped internally). */
  yTopPt: number;
  /** Content-box width, in points (the wrap width). */
  widthPt: number;
  /** Content-box height, in points (used to clip overset lines + vertical alignment). */
  heightPt: number;
  /** Baseline offset from the box top for the first line, in points (defaults to 0.8·fontSize). */
  ascentPt?: number;
  /** Vertical placement of the text block within the box (default top). */
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

/** One text box drawn as filled glyph OUTLINES (vector curves) — same geometry model as
 * `PdfxVectorTextFrame`, but the glyphs are painted as paths (optionally fill + stroke) instead of
 * selectable embedded type. Used for stroked/decorated text the live-type path can't reproduce. */
export interface PdfxOutlineTextFrame {
  text: string;
  /** Parse cache key for the outline font (distinct per face). */
  fontId: string;
  /** TrueType/OpenType bytes to outline glyphs from. */
  fontBytes: Uint8Array;
  fontSizePt: number;
  leadingPt: number;
  align: PaperTextAlign;
  /** Fill colour as DeviceCMYK components in 0..1 (converted through the output profile). */
  cmyk: { c: number; m: number; y: number; k: number };
  /** Content-box top-left X from the media left edge, in points. */
  xPt: number;
  /** Content-box top-left Y from the media TOP edge, in points (flipped internally). */
  yTopPt: number;
  /** Content-box width (wrap width) in points. */
  widthPt: number;
  /** Content-box height in points (clips overset lines + drives vertical alignment). */
  heightPt: number;
  ascentPt?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Extra advance per glyph (letter-spacing) in points. */
  trackingPt?: number;
  /** Optional stroke around the glyphs (comic-style outlined lettering). */
  strokeCmyk?: { c: number; m: number; y: number; k: number };
  strokeWidthPt?: number;
}

export interface PdfxOutputProfile {
  /** Raw ICC profile bytes — the CMYK output condition (bundled/system/custom). */
  iccBytes: Uint8Array;
  /** Registry identifier, e.g. "FOGRA39" or "CGATS TR 006" (emitted as /OutputConditionIdentifier). */
  outputConditionIdentifier: string;
  /** Human description of the print condition (e.g. "Coated FOGRA39 (ISO 12647-2:2004)"). */
  outputCondition?: string;
  /** ICC characterization registry. Defaults to the ICC registry. */
  registryName?: string;
}

export interface PdfxExportOptions {
  standard: PdfxStandard;
  profile: PdfxOutputProfile;
  /**
   * RGB→CMYK transform built from the SAME output profile (see `paperIccEngine.createRgbToCmykTransform`).
   * MUST expose `transformRgbBuffer` (bulk image conversion). Using an `approximate` transform still
   * produces a structurally valid PDF/X, but the color is not press-accurate and `approximateColor` is set.
   */
  transform: IccCmykTransform;
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  createdAt?: Date;
  /** 16-byte hex document id for the trailer /ID (defaults to random). Fixed value keeps tests deterministic. */
  docId?: string;
  /**
   * Total-ink (TAC) ceiling as a percent, e.g. 280. When set (and < 400), every exported CMYK sample —
   * both the flattened raster and the vector text fills — is reduced (UCR: keep K, scale CMY) so no
   * colour exceeds it. This makes the preflight's "colours will be reduced on export" promise real.
   */
  totalInkLimitPercent?: number;
}

export interface PdfxExportResult {
  bytes: Uint8Array;
  standard: PdfxStandard;
  pageCount: number;
  /** The ICC output profile name used for the OutputIntent. */
  profileName: string;
  /** True when the color conversion was not ICC-backed (structurally valid, but not press-accurate). */
  approximateColor: boolean;
}

interface StandardMeta {
  /** GTS_PDFXVersion string. */
  version: string;
  /** GTS_PDFXConformance (X-1a/X-3 only). */
  conformance?: string;
  /** PDF header version digit to stamp. */
  pdfVersion: string;
}

const STANDARD_META: Record<PdfxStandard, StandardMeta> = {
  'pdf-x-1a': { version: 'PDF/X-1a:2003', conformance: 'PDF/X-1a:2003', pdfVersion: '1.4' },
  'pdf-x-4': { version: 'PDF/X-4', pdfVersion: '1.6' },
};

const DEFAULT_CREATOR = 'Sloom Studio';

/** Composite interleaved RGBA over white → interleaved RGB (3 bytes/pixel) for the ICC transform. */
function flattenRgbaToRgb(rgba: Uint8Array | Uint8ClampedArray, pixelCount: number): Uint8Array {
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i += 1) {
    const s = i * 4;
    const a = rgba[s + 3] / 255;
    const inv = 1 - a;
    const d = i * 3;
    // Straight-alpha composite over an opaque white sheet.
    rgb[d] = Math.round(rgba[s] * a + 255 * inv);
    rgb[d + 1] = Math.round(rgba[s + 1] * a + 255 * inv);
    rgb[d + 2] = Math.round(rgba[s + 2] * a + 255 * inv);
  }
  return rgb;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** PDF date string: D:YYYYMMDDHHmmSS+00'00' (UTC). */
function pdfDate(date: Date): string {
  return (
    `D:${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}+00'00'`
  );
}

/** ISO-8601 date (UTC, second precision) for XMP. */
function xmpDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}Z`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the PDF/X XMP metadata packet (the authoritative GTS_PDFXVersion carrier). */
function buildXmp(meta: StandardMeta, opts: PdfxExportOptions, date: Date): string {
  const title = escapeXml(opts.title ?? 'Untitled');
  const creator = escapeXml(opts.creator ?? DEFAULT_CREATOR);
  const producer = escapeXml(opts.producer ?? DEFAULT_CREATOR);
  const author = escapeXml(opts.author ?? '');
  const iso = xmpDate(date);
  const conformance = meta.conformance
    ? `\n     <pdfxid:GTS_PDFXConformance>${escapeXml(meta.conformance)}</pdfxid:GTS_PDFXConformance>`
    : '';
  const authorBlock = author
    ? `\n     <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>`
    : '';
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
     xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"
     xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
     xmlns:xmp="http://ns.adobe.com/xap/1.0/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
     <pdfxid:GTS_PDFXVersion>${escapeXml(meta.version)}</pdfxid:GTS_PDFXVersion>${conformance}
     <pdf:Producer>${producer}</pdf:Producer>
     <pdf:Trapped>False</pdf:Trapped>
     <xmp:CreatorTool>${creator}</xmp:CreatorTool>
     <xmp:CreateDate>${iso}</xmp:CreateDate>
     <xmp:ModifyDate>${iso}</xmp:ModifyDate>
     <dc:format>application/pdf</dc:format>
     <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>${authorBlock}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function randomDocId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Emit a raw PDF content operator pdf-lib doesn't expose a helper for (cs/scn/re/f for /Separation fills).
 * pdf-lib types `of` to its own operator enum; these are valid operators it just doesn't enumerate. */
function contentOp(name: string, args: (PDFName | PDFNumber)[] = []): PDFOperator {
  return PDFOperator.of(name as unknown as Parameters<typeof PDFOperator.of>[0], args);
}

/** Encode a string as a PDF name body: chars outside the printable regular set become `#XX`. A spot name
 * like "PANTONE 185 C" → "PANTONE#20185#20C", so the colorant round-trips through Ghostscript/RIPs. */
function encodePdfName(name: string): string {
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    const isRegular = code > 0x20 && code < 0x7f && !'#()<>[]{}/%'.includes(ch);
    out += isRegular ? ch : `#${code.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * Build a conformant PDF/X (X-1a or X-4) from pre-rendered CMYK-bound page rasters.
 * Throws if the transform cannot do bulk image conversion.
 */
export async function buildPaperPdfx(
  pages: readonly PdfxRasterPage[],
  options: PdfxExportOptions,
): Promise<PdfxExportResult> {
  if (pages.length === 0) throw new Error('Cannot export a PDF/X with no pages.');
  const bulk = options.transform.transformRgbBuffer;
  if (!bulk) {
    throw new Error('The provided ICC transform does not support bulk image conversion (transformRgbBuffer).');
  }
  // A ceiling of 400% (the 4-channel max) can never be exceeded → treat it as "no limit".
  const inkLimitPercent = options.totalInkLimitPercent !== undefined && options.totalInkLimitPercent < 400
    ? options.totalInkLimitPercent
    : undefined;
  const meta = STANDARD_META[options.standard];
  const date = options.createdAt ?? new Date();
  const doc = await PDFDocument.create();
  const ctx = doc.context;

  // --- Embedded ICC output profile (shared by every page's OutputIntent) ---
  const iccStream = ctx.flateStream(options.profile.iccBytes, { N: 4 });
  const iccRef = ctx.register(iccStream);

  // Fonts for the optional vector-text layer are embedded once per face and reused across pages.
  const hasVectorText = pages.some((page) => (page.textFrames?.length ?? 0) > 0);
  if (hasVectorText) doc.registerFontkit(fontkit);
  const fontCache = new Map<string, { font: PDFFont; ascentRatio: number }>();
  const embedFace = async (fontId: string, fontBytes: Uint8Array, subset = true): Promise<{ font: PDFFont; ascentRatio: number }> => {
    let entry = fontCache.get(fontId);
    if (!entry) {
      const font = await doc.embedFont(fontBytes, { subset });
      // Read the real typographic ascent so the first baseline matches the CSS line box.
      let ascentRatio = 0.8;
      try {
        const create = (fontkit as unknown as { create?: (b: Uint8Array) => { ascent?: number; unitsPerEm?: number } }).create;
        const fk = create?.(fontBytes);
        if (fk && typeof fk.ascent === 'number' && fk.unitsPerEm) ascentRatio = fk.ascent / fk.unitsPerEm;
      } catch {
        // Fall back to the 0.8·em approximation if the face can't be parsed for metrics.
      }
      entry = { font, ascentRatio };
      fontCache.set(fontId, entry);
    }
    return entry;
  };

  // Spot-colour /Separation colorspaces are built once per spot name and reused across pages. The alternate
  // is DeviceCMYK with a Type-2 (exponential) tint transform mapping tint 0..1 → the spot's CMYK.
  const spotCsCache = new Map<string, PDFRef>();
  const spotColorSpaceRef = (name: string, ink: { c: number; m: number; y: number; k: number }): PDFRef => {
    let ref = spotCsCache.get(name);
    if (!ref) {
      const tintFn = ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [ink.c, ink.m, ink.y, ink.k], N: 1 });
      const separation = ctx.obj([PDFName.of('Separation'), PDFName.of(encodePdfName(name)), PDFName.of('DeviceCMYK'), ctx.register(tintFn)]);
      ref = ctx.register(separation);
      spotCsCache.set(name, ref);
    }
    return ref;
  };

  // Parsed outline fonts, cached per face across pages (fontkit parse is the costly step).
  const outlineFontCache = new Map<string, FontkitOutlineFont | undefined>();
  const outlineFontFor = (fontId: string, bytes: Uint8Array): FontkitOutlineFont | undefined => {
    let font = outlineFontCache.get(fontId);
    if (font === undefined && !outlineFontCache.has(fontId)) {
      font = createOutlineFont(bytes);
      outlineFontCache.set(fontId, font);
    }
    return font;
  };

  // --- Pages: each is one flattened DeviceCMYK image spanning the full media (trim + bleed) ---
  for (const page of pages) {
    const pixelCount = page.widthPx * page.heightPx;
    if (page.rgba.length < pixelCount * 4) {
      throw new Error(`Page raster is smaller than ${page.widthPx}×${page.heightPx} RGBA.`);
    }
    const rgb = flattenRgbaToRgb(page.rgba, pixelCount);
    const cmyk = bulk(rgb, pixelCount); // raw 0–255 DeviceCMYK samples
    if (cmyk.length < pixelCount * 4) {
      throw new Error('ICC transform returned fewer CMYK samples than expected.');
    }
    // Enforce the press total-ink ceiling on the flattened raster (makes the preflight promise real).
    if (inkLimitPercent !== undefined) applyInkLimitToCmykBuffer(cmyk, inkLimitPercent);

    const bleedPt = page.bleedPt ?? 0;
    const mediaWpt = page.trimWidthPt + bleedPt * 2;
    const mediaHpt = page.trimHeightPt + bleedPt * 2;

    const imageStream = ctx.flateStream(cmyk.subarray(0, pixelCount * 4), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: page.widthPx,
      Height: page.heightPx,
      ColorSpace: 'DeviceCMYK',
      BitsPerComponent: 8,
    });
    const imageRef = ctx.register(imageStream);

    const pdfPage = doc.addPage([mediaWpt, mediaHpt]);
    pdfPage.node.setXObject(PDFName.of('Im0'), imageRef);
    pdfPage.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(mediaWpt, 0, 0, mediaHpt, 0, 0),
      drawObject('Im0'),
      popGraphicsState(),
    );
    // TrimBox = the finished page inside the bleed; BleedBox = the full media.
    pdfPage.node.set(PDFName.of('TrimBox'), ctx.obj([bleedPt, bleedPt, bleedPt + page.trimWidthPt, bleedPt + page.trimHeightPt]));
    pdfPage.node.set(PDFName.of('BleedBox'), ctx.obj([0, 0, mediaWpt, mediaHpt]));

    // --- Spot-colour /Separation fills (under the vector text): real named plates, not process. ---
    if (page.spotFills && page.spotFills.length > 0) {
      const resources = pdfPage.node.Resources() ?? ctx.obj({});
      let csDict = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
      if (!csDict) {
        csDict = ctx.obj({});
        resources.set(PDFName.of('ColorSpace'), csDict);
      }
      pdfPage.node.set(PDFName.of('Resources'), resources);
      const resNameForSpot = new Map<string, string>();
      for (const spot of page.spotFills) {
        let resName = resNameForSpot.get(spot.name);
        if (!resName) {
          resName = `Sp${resNameForSpot.size}`;
          csDict.set(PDFName.of(resName), spotColorSpaceRef(spot.name, spot.cmyk));
          resNameForSpot.set(spot.name, resName);
        }
        const yBottom = mediaHpt - (spot.yTopPt + spot.heightPt); // flip to PDF's bottom-left origin
        const tint = Math.max(0, Math.min(1, spot.tint));
        pdfPage.pushOperators(
          pushGraphicsState(),
          contentOp('cs', [PDFName.of(resName)]),
          contentOp('scn', [PDFNumber.of(tint)]),
          contentOp('re', [PDFNumber.of(spot.xPt), PDFNumber.of(yBottom), PDFNumber.of(spot.widthPt), PDFNumber.of(spot.heightPt)]),
          contentOp('f'),
          popGraphicsState(),
        );
      }
    }

    // --- Vector text layer (hybrid PDF/X): real embedded, selectable CMYK type over the raster ---
    for (const frame of page.textFrames ?? []) {
      if (!frame.text.trim()) continue;
      const { font, ascentRatio } = await embedFace(frame.fontId, frame.fontBytes, frame.subset !== false);
      // Enforce the same total-ink ceiling on the vector text fill (frame.cmyk is 0..1 per channel).
      const ink = inkLimitPercent !== undefined
        ? limitTotalAreaCoverage(frame.cmyk.c, frame.cmyk.m, frame.cmyk.y, frame.cmyk.k, inkLimitPercent / 100)
        : frame.cmyk;
      const fill = cmykColor(ink.c, ink.m, ink.y, ink.k);
      // First-baseline model matching a CSS line box: half the extra leading, then the font's ascent.
      const ascentPt = frame.ascentPt ?? (frame.leadingPt - frame.fontSizePt) / 2 + ascentRatio * frame.fontSizePt;
      const layout = layoutParagraphText({
        text: frame.text,
        maxWidthPt: frame.widthPt,
        fontSizePt: frame.fontSizePt,
        leadingPt: frame.leadingPt,
        align: frame.align,
        ascentPt,
        measureText: (t) => font.widthOfTextAtSize(t, frame.fontSizePt),
      });
      // Vertical alignment: shift the whole text block down within the box (top = no shift).
      const slack = Math.max(0, frame.heightPt - layout.totalHeightPt);
      const vShift = frame.verticalAlign === 'middle' ? slack / 2 : frame.verticalAlign === 'bottom' ? slack : 0;
      for (const line of layout.lines) {
        // Clip overset lines: skip baselines that fall past the frame's bottom edge.
        if (line.baselineYPt > frame.heightPt + frame.fontSizePt) continue;
        const yPt = mediaHpt - (frame.yTopPt + vShift + line.baselineYPt);
        for (const segment of line.runs) {
          if (!segment.text) continue;
          pdfPage.drawText(segment.text, {
            x: frame.xPt + segment.xPt,
            y: yPt,
            size: frame.fontSizePt,
            font,
            color: fill,
          });
        }
      }
    }

    // --- Outline text layer: glyphs painted as filled/stroked vector CURVES (not selectable type) ---
    for (const frame of page.outlineFrames ?? []) {
      if (!frame.text.trim()) continue;
      const font = outlineFontFor(frame.fontId, frame.fontBytes);
      if (!font) continue;
      const tracking = frame.trackingPt ?? 0;
      // Same first-baseline model as the selectable-text path (half the extra leading, then the ascent).
      const ascentRatio = font.ascent && font.unitsPerEm ? font.ascent / font.unitsPerEm : 0.8;
      const ascentPt = frame.ascentPt ?? (frame.leadingPt - frame.fontSizePt) / 2 + ascentRatio * frame.fontSizePt;
      const layout = layoutParagraphText({
        text: frame.text,
        maxWidthPt: frame.widthPt,
        fontSizePt: frame.fontSizePt,
        leadingPt: frame.leadingPt,
        align: frame.align,
        ascentPt,
        measureText: (t) => measureTextWidthPt(font, t, frame.fontSizePt, tracking),
      });
      const slack = Math.max(0, frame.heightPt - layout.totalHeightPt);
      const vShift = frame.verticalAlign === 'middle' ? slack / 2 : frame.verticalAlign === 'bottom' ? slack : 0;
      // Accumulate every glyph's outline into one path, then fill (or fill+stroke) it once.
      const glyphOps: GlyphPathOp[] = [];
      for (const line of layout.lines) {
        if (line.baselineYPt > frame.heightPt + frame.fontSizePt) continue;
        const baselineYPt = mediaHpt - (frame.yTopPt + vShift + line.baselineYPt);
        for (const segment of line.runs) {
          if (!segment.text) continue;
          const run = outlineTextRun(font, segment.text, frame.fontSizePt, frame.xPt + segment.xPt, baselineYPt, tracking);
          for (const glyphOp of run.ops) glyphOps.push(glyphOp);
        }
      }
      if (glyphOps.length === 0) continue;
      const ink = inkLimitPercent !== undefined
        ? limitTotalAreaCoverage(frame.cmyk.c, frame.cmyk.m, frame.cmyk.y, frame.cmyk.k, inkLimitPercent / 100)
        : frame.cmyk;
      const hasStroke = !!frame.strokeCmyk && (frame.strokeWidthPt ?? 0) > 0;
      const draw: PDFOperator[] = [
        pushGraphicsState(),
        contentOp('k', [PDFNumber.of(ink.c), PDFNumber.of(ink.m), PDFNumber.of(ink.y), PDFNumber.of(ink.k)]),
      ];
      if (hasStroke) {
        const sInk = inkLimitPercent !== undefined
          ? limitTotalAreaCoverage(frame.strokeCmyk!.c, frame.strokeCmyk!.m, frame.strokeCmyk!.y, frame.strokeCmyk!.k, inkLimitPercent / 100)
          : frame.strokeCmyk!;
        draw.push(contentOp('K', [PDFNumber.of(sInk.c), PDFNumber.of(sInk.m), PDFNumber.of(sInk.y), PDFNumber.of(sInk.k)]));
        draw.push(contentOp('w', [PDFNumber.of(frame.strokeWidthPt!)]));
        draw.push(contentOp('j', [PDFNumber.of(1)])); // round joins read cleaner on letterforms
      }
      for (const glyphOp of glyphOps) {
        if (glyphOp.op === 'm') draw.push(contentOp('m', [PDFNumber.of(glyphOp.x), PDFNumber.of(glyphOp.y)]));
        else if (glyphOp.op === 'l') draw.push(contentOp('l', [PDFNumber.of(glyphOp.x), PDFNumber.of(glyphOp.y)]));
        else if (glyphOp.op === 'c') draw.push(contentOp('c', [PDFNumber.of(glyphOp.x1), PDFNumber.of(glyphOp.y1), PDFNumber.of(glyphOp.x2), PDFNumber.of(glyphOp.y2), PDFNumber.of(glyphOp.x), PDFNumber.of(glyphOp.y)]));
        else draw.push(contentOp('h'));
      }
      draw.push(hasStroke ? contentOp('B') : contentOp('f')); // B = fill then stroke (nonzero winding)
      draw.push(popGraphicsState());
      pdfPage.pushOperators(...draw);
    }
  }

  // --- OutputIntent (/S /GTS_PDFX) with the embedded DestOutputProfile ---
  const outputIntent = ctx.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of(options.profile.outputConditionIdentifier),
    OutputCondition: PDFString.of(options.profile.outputCondition ?? options.profile.outputConditionIdentifier),
    RegistryName: PDFString.of(options.profile.registryName ?? 'http://www.color.org'),
    Info: PDFString.of(options.profile.outputCondition ?? options.profile.outputConditionIdentifier),
    DestOutputProfile: iccRef,
  });
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(outputIntent)]));

  // --- XMP metadata (authoritative PDF/X version carrier) ---
  const xmpStream = ctx.stream(utf8Bytes(buildXmp(meta, options, date)), { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(xmpStream));

  // --- Document information dictionary ---
  doc.setTitle(options.title ?? 'Untitled');
  if (options.author) doc.setAuthor(options.author);
  doc.setCreator(options.creator ?? DEFAULT_CREATOR);
  doc.setProducer(options.producer ?? DEFAULT_CREATOR);
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  const infoRef = ctx.trailerInfo.Info;
  const info = infoRef ? ctx.lookupMaybe(infoRef, PDFDict) : undefined;
  if (info) {
    info.set(PDFName.of('GTS_PDFXVersion'), PDFString.of(meta.version));
    if (meta.conformance) info.set(PDFName.of('GTS_PDFXConformance'), PDFString.of(meta.conformance));
    info.set(PDFName.of('Trapped'), PDFName.of('False'));
    info.set(PDFName.of('CreationDate'), PDFString.of(pdfDate(date)));
    info.set(PDFName.of('ModDate'), PDFString.of(pdfDate(date)));
  }

  // --- Trailer /ID (required by PDF/X): two identical strings on first write ---
  const id = options.docId ?? randomDocId();
  const idString = PDFHexString.of(id);
  ctx.trailerInfo.ID = ctx.obj([idString, idString]);

  // Classic xref (no object/xref streams) keeps X-1a at PDF 1.4 and is valid for X-4 too.
  let bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });

  // Stamp the header version (pdf-lib always writes %PDF-1.7).
  bytes = stampPdfVersion(bytes, meta.pdfVersion);

  return {
    bytes,
    standard: options.standard,
    pageCount: pages.length,
    profileName: options.transform.profileName,
    approximateColor: options.transform.kind !== 'icc',
  };
}

/** Rewrite the "%PDF-1.7" header to the target version (same byte length → xref offsets unaffected). */
function stampPdfVersion(bytes: Uint8Array, version: string): Uint8Array {
  // Header is "%PDF-1.x" at offset 0; replace the two chars after "%PDF-1.".
  const prefix = utf8Bytes('%PDF-');
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return bytes; // unexpected header — leave untouched
  }
  const verBytes = utf8Bytes(version); // e.g. "1.4"
  bytes.set(verBytes, prefix.length);
  return bytes;
}
