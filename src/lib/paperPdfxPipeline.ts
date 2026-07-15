// Plan-driven PDF/X orchestration. The managed render plan owns all native paths, spot inks, and text;
// the browser SVG renderer is used only as a bounded raster adapter for explicit flatten groups and images.

import type { PaperDocument, PaperManagedFontFace } from '../types/paper';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import { createHarfBuzzPaperTextShaper, type PaperTextShaper } from './paperTextShaper';
import {
  compilePaperRenderPlan,
  type PaperAffineTransform,
  type PaperFlattenGroup,
  type PaperRenderBounds,
  type PaperRenderImageNode,
  type PaperRenderNode,
} from './paperRenderPlan';
import {
  buildPaperPdfx,
  type PdfxExportResult,
  type PdfxFlattenedGroupRaster,
  type PdfxNativePage,
  type PdfxStandard,
} from './paperPdfxExport';
import type { IccCmykTransform } from './paperColorManagement';
import type { PaperOutputProfileResolution } from './paperManagedIccProfiles';

export interface PaperPdfxPageRaster {
  rgba: Uint8Array | Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
}

export interface PaperPdfxPipelineOptions {
  standard: PdfxStandard;
  /** Exact, hash-verified CMYK printer profile selected by the document. */
  outputProfile?: Extract<PaperOutputProfileResolution, { status: 'ready' }>;
  /** Export resolution; defaults to 300 DPI (print minimum). */
  outputDpi?: number;
  title?: string;
  createdAt?: Date;
  /** Fixed 16-byte hex trailer id for reproducible production verification artifacts. */
  documentId?: string;
}

export interface RasterizePageOptions {
  /** Legacy convenience option; plan-driven export uses explicit selection instead. */
  backdropOnly?: boolean;
  excludeTextFrameIds?: string[];
  excludeFrameFillIds?: string[];
  excludeFrameStrokeIds?: string[];
  /** Rasterize only these resolved output-frame ids, without reintroducing native siblings. */
  renderFrameIds?: readonly string[];
  /** Retain the page background only when a flatten group explicitly represents it. */
  includePageBackground?: boolean;
}

export interface PaperPdfxPipelineDeps {
  /** Rasterize one isolated output selection INCLUDING bleed to RGBA at the requested DPI. */
  rasterizePage: (pageId: string, outputDpi: number, options?: RasterizePageOptions) => Promise<PaperPdfxPageRaster>;
  /** Build an sRGB→CMYK transform from the exact managed ICC bytes. */
  createTransform: (bytes: Uint8Array) => Promise<IccCmykTransform>;
  /** Resolve content-addressed bytes for one managed font face. Browser/system font resolution is not used. */
  loadManagedFontBytes?: (assetRef: BinaryAssetRef) => Promise<Uint8Array>;
}

interface ManagedFontRuntime {
  resolver: (face: PaperManagedFontFace) => Promise<PaperTextShaper | undefined>;
  loadBytes: (face: PaperManagedFontFace) => Promise<Uint8Array>;
  dispose: () => void;
}

function faceKey(face: PaperManagedFontFace): string {
  return `${face.id}:${face.fontAsset.id}:${face.fontAsset.sha256}`;
}

function createManagedFontRuntime(deps: PaperPdfxPipelineDeps): ManagedFontRuntime {
  const byteCache = new Map<string, Uint8Array>();
  const shapers = new Map<string, PaperTextShaper>();
  const loadBytes = async (face: PaperManagedFontFace): Promise<Uint8Array> => {
    const key = faceKey(face);
    let bytes = byteCache.get(key);
    if (!bytes) {
      if (!deps.loadManagedFontBytes) {
        throw new Error(`Managed Paper font ${face.fontAsset.id} cannot be loaded for PDF/X export.`);
      }
      bytes = await deps.loadManagedFontBytes(face.fontAsset);
      if (!bytes.byteLength) throw new Error(`Managed Paper font ${face.fontAsset.id} is empty.`);
      byteCache.set(key, bytes);
    }
    return bytes;
  };
  return {
    loadBytes,
    resolver: async (face) => {
      const key = faceKey(face);
      let shaper = shapers.get(key);
      if (!shaper) {
        shaper = await createHarfBuzzPaperTextShaper(await loadBytes(face), { collectionIndex: face.collectionIndex });
        shapers.set(key, shaper);
      }
      return shaper;
    },
    dispose: () => {
      for (const shaper of shapers.values()) shaper.destroy();
      shapers.clear();
    },
  };
}

function flattenGroupsForPage(nodes: readonly PaperRenderNode[], background: PaperRenderNode | undefined): PaperFlattenGroup[] {
  const groups: PaperFlattenGroup[] = [];
  if (background?.kind === 'flatten-group') groups.push(background);
  for (const node of nodes) if (node.kind === 'flatten-group') groups.push(node);
  return groups;
}

function imageNodesForPage(nodes: readonly PaperRenderNode[]): PaperRenderImageNode[] {
  return nodes.filter((node): node is PaperRenderImageNode => node.kind === 'image');
}

function omitImageFramePaths(nodes: readonly PaperRenderNode[], images: readonly PaperRenderImageNode[]): PaperRenderNode[] {
  const sourceFrameIds = new Set(images.map((image) => image.sourceFrameId));
  return nodes.filter((node) => node.kind !== 'path' || !node.sourceFrameId || !sourceFrameIds.has(node.sourceFrameId));
}

function applyTransform(transform: PaperAffineTransform, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function boundsForTransform(transform: PaperAffineTransform, extent: number): PaperRenderBounds {
  const points = [
    applyTransform(transform, 0, 0),
    applyTransform(transform, extent, 0),
    applyTransform(transform, extent, extent),
    applyTransform(transform, 0, extent),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function imageClipBounds(image: PaperRenderImageNode): PaperRenderBounds {
  return image.clipTransform
    ? boundsForTransform(image.clipTransform, 100)
    : image.boundsPt;
}

function cropRasterToBounds(
  raster: PdfxFlattenedGroupRaster,
  bounds: PaperRenderBounds,
  mediaWidthPt: number,
  mediaHeightPt: number,
): PdfxFlattenedGroupRaster {
  if (!(mediaWidthPt > 0) || !(mediaHeightPt > 0) || !(raster.widthPx > 0) || !(raster.heightPx > 0)) {
    throw new Error(`Cannot crop managed image ${raster.objectId} without positive media and raster dimensions.`);
  }
  const left = Math.max(0, Math.min(raster.widthPx, Math.round(bounds.x / mediaWidthPt * raster.widthPx)));
  const top = Math.max(0, Math.min(raster.heightPx, Math.round(bounds.y / mediaHeightPt * raster.heightPx)));
  const right = Math.max(0, Math.min(raster.widthPx, Math.round((bounds.x + bounds.width) / mediaWidthPt * raster.widthPx)));
  const bottom = Math.max(0, Math.min(raster.heightPx, Math.round((bounds.y + bounds.height) / mediaHeightPt * raster.heightPx)));
  if (right <= left || bottom <= top) {
    throw new Error(`Managed image ${raster.objectId} is outside the PDF media bounds.`);
  }
  const widthPx = right - left;
  const heightPx = bottom - top;
  const rgba = new Uint8Array(widthPx * heightPx * 4);
  for (let y = 0; y < heightPx; y += 1) {
    const source = ((top + y) * raster.widthPx + left) * 4;
    rgba.set(raster.rgba.subarray(source, source + widthPx * 4), y * widthPx * 4);
  }
  return {
    objectId: raster.objectId,
    rgba,
    widthPx,
    heightPx,
    placement: {
      xPt: left / raster.widthPx * mediaWidthPt,
      yTopPt: top / raster.heightPx * mediaHeightPt,
      widthPt: widthPx / raster.widthPx * mediaWidthPt,
      heightPt: heightPx / raster.heightPx * mediaHeightPt,
    },
  };
}

async function rasterizeSelection(
  pageId: string,
  objectId: string,
  sourceFrameIds: readonly string[],
  includePageBackground: boolean,
  dpi: number,
  deps: PaperPdfxPipelineDeps,
): Promise<PdfxFlattenedGroupRaster> {
  const raster = await deps.rasterizePage(pageId, dpi, {
    renderFrameIds: sourceFrameIds,
    includePageBackground,
  });
  return { objectId, rgba: raster.rgba, widthPx: raster.widthPx, heightPx: raster.heightPx };
}

/** Build a real PDF/X (X-1a or X-4) from a PaperDocument and its exact managed font/profile assets. */
export async function exportPaperDocumentToPdfx(
  document: PaperDocument,
  options: PaperPdfxPipelineOptions,
  deps: PaperPdfxPipelineDeps,
): Promise<PdfxExportResult> {
  if (document.pages.length === 0) throw new Error('This document has no pages to export.');
  const outputProfile = options.outputProfile;
  if (!outputProfile) throw new Error('PDF/X export requires an exact managed CMYK output profile.');
  const transform = await deps.createTransform(outputProfile.bytes);
  const dpi = options.outputDpi && options.outputDpi > 0 ? options.outputDpi : 300;
  const fontRuntime = createManagedFontRuntime(deps);

  try {
    const plan = await compilePaperRenderPlan(document, { managedFontResolver: fontRuntime.resolver });
    const pages: PdfxNativePage[] = [];
    for (const planPage of plan.pages) {
      const groups = flattenGroupsForPage(planPage.nodes, planPage.background);
      const images = imageNodesForPage(planPage.nodes);
      const mediaWidthPt = planPage.trimWidthPt + planPage.bleedPt * 2;
      const mediaHeightPt = planPage.trimHeightPt + planPage.bleedPt * 2;
      const flattenedGroups = await Promise.all(groups.map((group) =>
        rasterizeSelection(
          planPage.pageId,
          group.objectId,
          group.sourceFrameIds,
          group.sourceFrameIds.length === 0,
          dpi,
          deps,
        ),
      ));
      const rasterizedImages = await Promise.all(images.map(async (image) => cropRasterToBounds(
        await rasterizeSelection(planPage.pageId, image.objectId, [image.sourceFrameId], false, dpi, deps),
        imageClipBounds(image),
        mediaWidthPt,
        mediaHeightPt,
      )));
      pages.push({
        pageNumber: planPage.pageNumber,
        trimWidthPt: planPage.trimWidthPt,
        trimHeightPt: planPage.trimHeightPt,
        bleedPt: planPage.bleedPt,
        renderPlanPage: { ...planPage, nodes: omitImageFramePaths(planPage.nodes, images) },
        flattenedGroups,
        rasterizedImages,
        loadManagedFontBytes: fontRuntime.loadBytes,
      });
    }

    const result = await buildPaperPdfx(pages, {
      standard: options.standard,
      profile: {
        iccBytes: outputProfile.bytes,
        outputConditionIdentifier: outputProfile.profile.outputConditionId,
        outputCondition: outputProfile.profile.description,
        registryName: outputProfile.profile.registryName,
      },
      transform,
      title: options.title ?? document.title,
      createdAt: options.createdAt,
      docId: options.documentId,
      totalInkLimitPercent: document.printProduction.totalInkLimitPercent,
    });
    return { ...result, renderPlan: plan };
  } finally {
    fontRuntime.dispose();
  }
}
