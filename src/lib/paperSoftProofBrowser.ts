// Browser/Electron adapter that renders a soft-proof preview of a Paper page: rasterize the page to
// RGBA (same flatten path the PDF/X exporter uses), run it through the real lcms2 CMYK soft proof, and
// hand back a PNG data URL the canvas can overlay. Kept out of the pure engine so those modules stay
// Node-testable; the canvas work here needs a real DOM.

import {
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets,
  imageSourceToDataUrl,
  rasterizeFlattenedPaperPageToRgba,
} from './paperPageFlattenExport';
import { createSoftProofTransform, type SoftProofOptions } from './paperIccEngine';
import { resolveBundledAssetUrl } from './bundledAssetUrl';
import { bundledProfileForOutputIntent } from './paperPdfxPipeline';
import { softProofRgba } from './paperSoftProofImage';
import type { PaperDocument } from '../types/paper';

export interface SoftProofPreviewOptions extends SoftProofOptions {
  /** Preview render resolution. Lower than print DPI keeps the round-trip fast (default 150). */
  previewDpi?: number;
}

export interface SoftProofPreviewResult {
  /** PNG data URL of the CMYK-simulated page (no bleed — matches the on-screen page box). */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** The CMYK condition the preview simulates (for a caption / legend). */
  profileName: string;
}

/** Render a soft-proof preview of one Paper page in the browser/Electron renderer. */
export async function softProofPaperPageInBrowser(
  document: PaperDocument,
  pageId: string,
  options: SoftProofPreviewOptions = {},
): Promise<SoftProofPreviewResult> {
  const profileRef = bundledProfileForOutputIntent(document.printProduction.outputIntentProfileId);
  if (!profileRef.url) throw new Error(`Soft-proof profile "${profileRef.displayName}" has no URL to fetch.`);
  const response = await fetch(resolveBundledAssetUrl(profileRef.url));
  if (!response.ok) {
    throw new Error(`Could not load the soft-proof ICC profile (${response.status}).`);
  }
  const iccBytes = new Uint8Array(await response.arrayBuffer());

  const { previewDpi, ...proofOptions } = options;
  const proof = await createSoftProofTransform(iccBytes, proofOptions);
  try {
    const svgExport = await buildFlattenedPaperPageSvgExportWithEmbeddedAssets(document, pageId, {
      includeBleed: false,
      outputDpi: previewDpi ?? 150,
      resolveImageSrc: imageSourceToDataUrl,
    });
    const raster = await rasterizeFlattenedPaperPageToRgba(svgExport);
    const proofed = softProofRgba(raster.rgba, proof);

    const canvas = window.document.createElement('canvas');
    canvas.width = raster.widthPx;
    canvas.height = raster.heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context for the soft-proof preview.');
    const imageData = ctx.createImageData(raster.widthPx, raster.heightPx);
    imageData.data.set(proofed);
    ctx.putImageData(imageData, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPx: raster.widthPx,
      heightPx: raster.heightPx,
      profileName: proof.profileName,
    };
  } finally {
    proof.dispose();
  }
}
