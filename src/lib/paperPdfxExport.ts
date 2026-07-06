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
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import type { IccCmykTransform } from './paperColorManagement';

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
  const meta = STANDARD_META[options.standard];
  const date = options.createdAt ?? new Date();
  const doc = await PDFDocument.create();
  const ctx = doc.context;

  // --- Embedded ICC output profile (shared by every page's OutputIntent) ---
  const iccStream = ctx.flateStream(options.profile.iccBytes, { N: 4 });
  const iccRef = ctx.register(iccStream);

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
