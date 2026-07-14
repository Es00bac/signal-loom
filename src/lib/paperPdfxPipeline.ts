// Orchestration for real PDF/X export from a PaperDocument (docs/notes/836). Ties the page rasterizer,
// the ICC output profile, and the conformant PDF/X writer (`buildPaperPdfx`) together. Kept pure with
// injected dependencies (rasterizer and transform factory) so it is unit-testable in Node and
// reused by the browser adapter (`paperPdfxBrowser.ts`) unchanged.

import { buildPaperPdfx, type PdfxExportResult, type PdfxOutlineTextFrame, type PdfxRasterPage, type PdfxStandard, type PdfxVectorTextFrame } from './paperPdfxExport';
import type { IccCmykTransform } from './paperColorManagement';
import type { PaperDocument } from '../types/paper';
import { buildOutlineTextFrameSpecs, buildVectorTextFrameSpecs } from './paperPdfxVectorTextFrames';
import { collectSpotFills, collectSpotStrokes } from './paperPdfxSpotFills';
import { findUncoveredCharacters } from './paperFontVetting';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import type { PaperOutputProfileResolution } from './paperManagedIccProfiles';

const PT_PER_MM = 72 / 25.4;

export interface PaperPdfxPageRaster {
  rgba: Uint8Array | Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
}

export interface PaperPdfxPipelineOptions {
  standard: PdfxStandard;
  /**
   * Exact, hash-verified CMYK printer profile selected by the document. There is deliberately no
   * default or output-intent-to-profile lookup: callers must resolve this through the managed registry.
   */
  outputProfile?: Extract<PaperOutputProfileResolution, { status: 'ready' }>;
  /** Export resolution; defaults to 300 DPI (print minimum). */
  outputDpi?: number;
  title?: string;
  createdAt?: Date;
  /**
   * Draw text as real embedded vector type instead of baking it into the raster (docs/notes/840).
   * Requires `deps.loadFontBytes`. Defaults to false so callers opt in explicitly. Only text frames the
   * linear engine can faithfully reproduce are vectorized (see `frameTextIsVectorSafe`); any other text
   * frame (rotation, columns, display fonts like Impact, bubbles, …) stays baked into the raster with
   * its real glyphs. Vector and raster text can coexist on the same page (per-frame, not per-page).
   *
   * `richText` frames: a frame with ONLY a uniform run (`paperRichTextIsUniform` — no per-run overrides,
   * no paragraph formatting) is fully represented by its single `typography` and still vectorizes. A frame
   * with REAL rich formatting (a bold word, per-run colour/font, a bullet list, paragraph spacing/shading/
   * borders/drop-cap — `paperRichTextIsUniform` false) is intentionally excluded from both the vector-text
   * and outline-text builders in `paperPdfxVectorTextFrames.ts` (`frameTextIsVectorSafe`'s
   * `paperRichTextIsUniform` gate) and falls back to the raster — never silently flattened to one style
   * in vector text. That raster is `renderPrintFrame` (paperDocument.ts), which draws every run/paragraph
   * correctly, so the frame's formatting still reaches the PDF/X, just as a raster image instead of
   * selectable type. True per-run vector text (mixed styles as real PDF text objects) is not implemented;
   * see docs/notes/850-paper-rich-text.md task #56.
   */
  vectorText?: boolean;
}

export interface RasterizePageOptions {
  /** Exclude ALL text frames from the raster (their text is drawn as vector on top). */
  backdropOnly?: boolean;
  /** Exclude only these specific text frames from the raster (the ones drawn as vector on top). */
  excludeTextFrameIds?: string[];
  /** Knock the fill out of these frames (their spot ink is drawn as a /Separation plate on top). */
  excludeFrameFillIds?: string[];
  /** Knock the stroke/border out of these frames (their spot border is drawn as a /Separation plate). */
  excludeFrameStrokeIds?: string[];
}

export interface PaperPdfxPipelineDeps {
  /** Rasterize one page INCLUDING bleed to RGBA at the given DPI. */
  rasterizePage: (pageId: string, outputDpi: number, options?: RasterizePageOptions) => Promise<PaperPdfxPageRaster>;
  /** Build an sRGB→CMYK transform from ICC bytes (real lcms2 backend in the app). */
  createTransform: (bytes: Uint8Array) => Promise<IccCmykTransform>;
  /** Load the bytes of a bundled font face by its public url (required when `vectorText` is on). */
  loadFontBytes?: (fontUrl: string) => Promise<Uint8Array>;
  /** Load an imported font from the managed Paper asset repository. */
  loadManagedFontBytes?: (assetRef: BinaryAssetRef) => Promise<Uint8Array>;
}

interface ResolvedFontSpec {
  text: string;
  frameId: string;
  fontUrl?: string;
  fontAssetRef?: BinaryAssetRef;
}

async function resolveVectorFontSpecs<T extends ResolvedFontSpec>(
  specs: T[],
  deps: Pick<PaperPdfxPipelineDeps, 'loadFontBytes' | 'loadManagedFontBytes'>,
  loadBundledFontOnce: (url: string) => Promise<Uint8Array>,
): Promise<Array<Omit<T, 'fontUrl' | 'fontAssetRef'> & { fontBytes: Uint8Array }>> {
  type ResolvedSpec = Omit<T, 'fontUrl' | 'fontAssetRef'> & { fontBytes: Uint8Array };
  const resolved: Array<ResolvedSpec | undefined> = await Promise.all(specs.map(async (spec): Promise<ResolvedSpec | undefined> => {
    let bytes: Uint8Array | undefined;
    if (spec.fontAssetRef) {
      if (!deps.loadManagedFontBytes) {
        throw new Error(`Managed Paper font ${spec.fontAssetRef.id} cannot be loaded for PDF/X export.`);
      }
      bytes = await deps.loadManagedFontBytes(spec.fontAssetRef);
    } else if (spec.fontUrl) {
      bytes = await loadBundledFontOnce(spec.fontUrl);
    }
    if (!bytes) {
      throw new Error('Vector-text frame has neither a managed font asset nor a bundled font URL.');
    }
    // A missing glyph would draw as .notdef in the PDF. Keep that frame in the WYSIWYG raster instead.
    if (findUncoveredCharacters(bytes, spec.text).length > 0) return undefined;
    const { fontUrl: _fontUrl, fontAssetRef: _fontAssetRef, ...rest } = spec;
    return { ...rest, fontBytes: bytes } as ResolvedSpec;
  }));
  return resolved.filter((spec): spec is ResolvedSpec => spec !== undefined);
}

/** Build a real PDF/X (X-1a or X-4) from a PaperDocument via injected rasterizer + exact ICC transform. */
export async function exportPaperDocumentToPdfx(
  document: PaperDocument,
  options: PaperPdfxPipelineOptions,
  deps: PaperPdfxPipelineDeps,
): Promise<PdfxExportResult> {
  if (document.pages.length === 0) throw new Error('This document has no pages to export.');
  const outputProfile = options.outputProfile;
  if (!outputProfile) throw new Error('PDF/X export requires an exact managed CMYK output profile.');
  const { profile, bytes: iccBytes } = outputProfile;
  const transform = await deps.createTransform(iccBytes);
  const dpi = options.outputDpi && options.outputDpi > 0 ? options.outputDpi : 300;

  const bleedPt = document.page.bleedMm * PT_PER_MM;
  const trimWidthPt = document.page.widthMm * PT_PER_MM;
  const trimHeightPt = document.page.heightMm * PT_PER_MM;

  const wantVectorText = options.vectorText === true && !!(deps.loadFontBytes || deps.loadManagedFontBytes);
  const fontBytesCache = new Map<string, Uint8Array>();
  const loadFontOnce = async (url: string): Promise<Uint8Array> => {
    let bytes = fontBytesCache.get(url);
    if (!bytes) {
      bytes = await deps.loadFontBytes!(url);
      fontBytesCache.set(url, bytes);
    }
    return bytes;
  };

  const pages: PdfxRasterPage[] = [];
  for (const page of document.pages) {
    // Per-frame: each text frame the linear engine can faithfully reproduce is drawn as real vector and
    // excluded from the raster; every other frame (rotation, columns, display fonts, bubbles, non-uniform
    // richText — a bold run, a bullet list, paragraph spacing/shading — …) stays baked into the raster with
    // its real glyphs/runs. Vector + raster text coexist on the same page. See `PaperPdfxPipelineOptions.
    // vectorText` above for exactly how richText frames route.
    let textFrames: PdfxVectorTextFrame[] | undefined;
    let vectorFrameIds: string[] | undefined;
    let outlineFrames: PdfxOutlineTextFrame[] | undefined;
    let outlineFrameIds: string[] | undefined;
    if (wantVectorText) {
      const specs = buildVectorTextFrameSpecs(page, document, transform);
      if (specs.length > 0) {
        const resolved = await resolveVectorFontSpecs(specs, deps, loadFontOnce);
        vectorFrameIds = resolved.map((spec) => spec.frameId);
        textFrames = resolved.map(({ frameId: _frameId, ...spec }) => spec);
      }
      // Text that can't be live type but can be outlined (stroked lettering) → filled vector curves,
      // also knocked out of the raster. Stays crisp vector instead of rasterizing.
      const outlineSpecs = buildOutlineTextFrameSpecs(page, document, transform);
      if (outlineSpecs.length > 0) {
        const resolved = await resolveVectorFontSpecs(outlineSpecs, deps, loadFontOnce);
        outlineFrameIds = resolved.map((spec) => spec.frameId);
        outlineFrames = resolved.map(({ frameId: _frameId, ...spec }) => spec);
      }
    }

    // Spot fills: solid spot-swatch rectangles become real /Separation plates; their fill is knocked out
    // of the raster so the ink lives only on the named plate, not doubled as process. Only when the user
    // opted in via the "preserve named" spot policy — otherwise spot converts to process (the default).
    const preserveSpot = document.printProduction.spotColorPolicy === 'preserve-named';
    const emptyPlan = { spotFills: [], knockoutFrameIds: [], preservedSpotNames: [] };
    const spotPlan = preserveSpot ? collectSpotFills(page, document) : emptyPlan;
    // Spot BORDERS: a frame's stroke can plate too (its stroke is knocked out and drawn as a stroked
    // /Separation path). Drawn AFTER the fills so a border sits on top of its own fill.
    const strokePlan = preserveSpot ? collectSpotStrokes(page, document) : emptyPlan;
    const allSpotDraws = [...spotPlan.spotFills, ...strokePlan.spotFills];
    // Both the selectable-text and outlined-text frames must be knocked out of the raster backdrop.
    const excludeTextIds = [...(vectorFrameIds ?? []), ...(outlineFrameIds ?? [])];
    const rasterOptions: RasterizePageOptions | undefined =
      (excludeTextIds.length || spotPlan.knockoutFrameIds.length || strokePlan.knockoutFrameIds.length)
        ? {
            ...(excludeTextIds.length ? { excludeTextFrameIds: excludeTextIds } : {}),
            ...(spotPlan.knockoutFrameIds.length ? { excludeFrameFillIds: spotPlan.knockoutFrameIds } : {}),
            ...(strokePlan.knockoutFrameIds.length ? { excludeFrameStrokeIds: strokePlan.knockoutFrameIds } : {}),
          }
        : undefined;
    const raster = await deps.rasterizePage(page.id, dpi, rasterOptions);
    pages.push({
      pageNumber: page.pageNumber,
      rgba: raster.rgba,
      widthPx: raster.widthPx,
      heightPx: raster.heightPx,
      trimWidthPt,
      trimHeightPt,
      bleedPt,
      textFrames,
      outlineFrames,
      spotFills: allSpotDraws.length ? allSpotDraws : undefined,
    });
  }

  return buildPaperPdfx(pages, {
    standard: options.standard,
    profile: {
      iccBytes,
      outputConditionIdentifier: profile.outputConditionId,
      outputCondition: profile.description,
      registryName: profile.registryName,
    },
    transform,
    title: options.title ?? document.title,
    createdAt: options.createdAt,
    // Enforce the document's press total-ink ceiling on the exported CMYK (raster + vector text).
    totalInkLimitPercent: document.printProduction?.totalInkLimitPercent,
  });
}
