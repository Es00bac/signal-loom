// Browser/Electron adapter for the real PDF/X pipeline (docs/notes/836). Supplies the concrete
// dependencies the pure pipeline needs: fetch the bundled ICC profile bytes, rasterize each page (with
// bleed) to RGBA via the flatten-export canvas path, and build the real lcms2 sRGB→CMYK transform.
// Kept out of the pure pipeline so that module stays Node-testable.

import {
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets,
  imageSourceToDataUrl,
  rasterizeFlattenedPaperPageToRgba,
} from './paperPageFlattenExport';
import { createRgbToCmykTransform } from './paperIccEngine';
import { resolveBundledAssetUrl } from './bundledAssetUrl';
import type { IccProfileRef } from './paperIccProfiles';
import {
  exportPaperDocumentToPdfx,
  type PaperPdfxPipelineOptions,
} from './paperPdfxPipeline';
import type { PdfxExportResult } from './paperPdfxExport';
import type { PaperDocument } from '../types/paper';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import {
  materializePaperDocumentAssetUrls,
  paperAssetRepository,
} from '../features/paper/assets/PaperAssetRuntime';
import { useSourceBinStore } from '../store/sourceBinStore';

async function fetchBundledIcc(profile: IccProfileRef): Promise<Uint8Array> {
  if (!profile.url) throw new Error(`Bundled profile "${profile.displayName}" has no URL to fetch.`);
  // Resolve against the document base — a root-absolute `/icc/…` 404s under the packaged file:// origin.
  const response = await fetch(resolveBundledAssetUrl(profile.url));
  if (!response.ok) {
    throw new Error(`Could not load ICC profile "${profile.displayName}" (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchBundledFont(fontUrl: string): Promise<Uint8Array> {
  const response = await fetch(resolveBundledAssetUrl(fontUrl));
  if (!response.ok) throw new Error(`Could not load the embedded font "${fontUrl}" (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadManagedPaperFont(assetRef: BinaryAssetRef): Promise<Uint8Array> {
  const record = await paperAssetRepository.get(assetRef.id);
  if (!record || record.ref.sha256 !== assetRef.sha256 || record.ref.byteLength !== assetRef.byteLength) {
    throw new Error(`Managed Paper font ${assetRef.id} is unavailable or does not match its document reference.`);
  }
  return record.bytes;
}

/** Export a PaperDocument to a real PDF/X in the browser/Electron renderer. Returns the PDF bytes. */
export async function exportPaperDocumentToPdfxInBrowser(
  document: PaperDocument,
  options: PaperPdfxPipelineOptions,
): Promise<PdfxExportResult> {
  const exportDocument = await materializePaperDocumentAssetUrls(
    document,
    useSourceBinStore.getState().getAllItems(),
  );
  return exportPaperDocumentToPdfx(exportDocument, options, {
    loadIccBytes: fetchBundledIcc,
    createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
    loadFontBytes: fetchBundledFont,
    loadManagedFontBytes: loadManagedPaperFont,
    rasterizePage: async (pageId, outputDpi, rasterOptions) => {
      const svgExport = await buildFlattenedPaperPageSvgExportWithEmbeddedAssets(exportDocument, pageId, {
        includeBleed: true,
        outputDpi,
        backdropOnly: rasterOptions?.backdropOnly ?? false,
        excludeTextFrameIds: rasterOptions?.excludeTextFrameIds,
        excludeFrameFillIds: rasterOptions?.excludeFrameFillIds,
        excludeFrameStrokeIds: rasterOptions?.excludeFrameStrokeIds,
        resolveImageSrc: imageSourceToDataUrl,
      });
      const raster = await rasterizeFlattenedPaperPageToRgba(svgExport);
      return { rgba: raster.rgba, widthPx: raster.widthPx, heightPx: raster.heightPx };
    },
  });
}
