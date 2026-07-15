import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup } from '../../lib/paperDocument';
import type { BinaryAssetRef } from '../../shared/assets/contentAddressedAsset';
import type { PaperFrame, PaperManagedIccProfile } from '../../types/paper';
import {
  bubbleHandlePatch,
  buildPaperEyedropperFrameColorPatch,
  buildPaperPdfRasterExportSettings,
  deletePaperFrameVertexPatch,
  resolvePaperEyedropperPixelColor,
  exportPaperPdfDocument,
  exportPaperPdfxAndSave,
  insertPaperFrameVertexPatch,
  movePaperFrameVertexPatch,
  resolvePaperEyedropperFrameColor,
  shouldShowPaperVertexHandles,
  samplePixelColorFromCanvas,
  verticesForEditableFrame,
} from './PaperWorkspaceUtils';

type DrawImageArgs = Parameters<CanvasRenderingContext2D['drawImage']>;

let pixelDrawArgs: DrawImageArgs | undefined;

const pixelContext = {
  drawImage: vi.fn((...args: DrawImageArgs) => {
    pixelDrawArgs = args;
  }),
  getImageData: vi.fn(() => {
    if (pixelDrawArgs?.[1] === 1 && pixelDrawArgs?.[2] === 2) {
      return { data: new Uint8ClampedArray([18, 52, 86, 255]) };
    }
    return { data: new Uint8ClampedArray([18, 52, 86, 0]) };
  }),
};

class FakeSampleCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return pixelContext;
  }
}

function bubbleFrame(overrides: Partial<PaperFrame> = {}): PaperFrame {
  return {
    id: 'bubble-1',
    kind: 'speechBubble',
    label: 'Speech Bubble',
    xMm: 20,
    yMm: 30,
    widthMm: 40,
    heightMm: 20,
    rotationDeg: 0,
    locked: false,
    fit: 'cover',
    imageScale: 1,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
    imageRotationDeg: 0,
    columns: 1,
    typography: {
      fontFamily: 'Inter',
      fontSizePt: 10,
      leadingPt: 13,
      tracking: 0,
      align: 'center',
      hyphenate: false,
      color: '#111827',
      fontWeight: '400',
      fontStyle: 'normal',
    },
    fillColor: '#ffffff',
    fillOpacity: 1,
    strokeColor: '#111827',
    strokeOpacity: 1,
    strokeWidthMm: 0.35,
    strokeStyle: 'solid',
    cornerRadiusMm: 0,
    opacity: 1,
    textBoxXPercent: 12,
    textBoxYPercent: 18,
    textBoxWidthPercent: 76,
    textBoxHeightPercent: 48,
    textRotationDeg: 0,
    textVerticalAlign: 'middle',
    zIndex: 0,
    ...overrides,
  };
}

describe('PaperWorkspaceUtils bubble handles', () => {
  it('allows bubble tails to extend outside the frame in any direction', () => {
    expect(bubbleHandlePatch(bubbleFrame(), 'tail', { xMm: 84, yMm: 12 })).toEqual({
      tailXPercent: 160,
      tailYPercent: -90,
    });
  });

  it('keeps pinch handles constrained to the bubble body', () => {
    expect(bubbleHandlePatch(bubbleFrame(), 'pinch', { xMm: 84, yMm: 12 })).toEqual({
      bubblePinchXPercent: 100,
      bubblePinchYPercent: 0,
    });
  });

  it('updates the single bubble tail curve control from a dragged curve point', () => {
    expect(bubbleHandlePatch(bubbleFrame({
      bubblePinchXPercent: 58,
      bubblePinchYPercent: 75,
      tailXPercent: 72,
      tailYPercent: 92,
    }), 'curve', { xMm: 44, yMm: 48 })).toEqual({
      bubbleTailCurvePercent: 100,
    });
  });

  // The four side handles now each shape ONLY their own edge (independent bulge/pinch). Each drag must
  // write exactly one bubbleWarp{Side} field and leave the others (and the legacy bubbleWarp) untouched,
  // so bubbles authored before per-side warp existed keep rendering from the symmetric fallback.
  it('left handle shapes only the left edge (bubbleWarpLeft)', () => {
    // xMm 21.2 → 3% across a 40mm frame → (5 - 3) / 4 = 0.5 bulge on the left edge alone.
    expect(bubbleHandlePatch(bubbleFrame(), 'left', { xMm: 21.2, yMm: 30 })).toEqual({
      bubbleWarpLeft: 0.5,
    });
  });

  it('right handle shapes only the right edge (bubbleWarpRight)', () => {
    // xMm 58.8 → 97% across → (97 - 95) / 4 = 0.5 bulge on the right edge alone.
    expect(bubbleHandlePatch(bubbleFrame(), 'right', { xMm: 58.8, yMm: 30 })).toEqual({
      bubbleWarpRight: 0.5,
    });
  });

  it('top handle shapes only the top edge (bubbleWarpTop)', () => {
    // yMm 31.9 → 9.5% down a 20mm frame → (12 - 9.5) / 5 = 0.5 bulge on the top edge alone.
    expect(bubbleHandlePatch(bubbleFrame(), 'top', { xMm: 20, yMm: 31.9 })).toEqual({
      bubbleWarpTop: 0.5,
    });
  });

  it('bottom handle shapes only the bottom edge (bubbleWarpBottom)', () => {
    // yMm 48.1 → 90.5% down → (90.5 - 88) / 5 = 0.5 bulge on the bottom edge alone.
    expect(bubbleHandlePatch(bubbleFrame(), 'bottom', { xMm: 20, yMm: 48.1 })).toEqual({
      bubbleWarpBottom: 0.5,
    });
  });
});

describe('PaperWorkspaceUtils eyedropper', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeSampleCanvas as unknown as typeof OffscreenCanvas;
    pixelDrawArgs = undefined;
    pixelContext.drawImage.mockClear();
    pixelContext.getImageData.mockClear();
  });

  it('samples the most visible editable color from a Paper frame', () => {
    expect(resolvePaperEyedropperFrameColor(bubbleFrame({
      kind: 'text',
      typography: { ...bubbleFrame().typography, color: '#123456' },
    }))).toBe('#123456');

    expect(resolvePaperEyedropperFrameColor(bubbleFrame({
      fillColor: '#abcdef',
      strokeColor: '#654321',
    }))).toBe('#abcdef');

    expect(resolvePaperEyedropperFrameColor(bubbleFrame({
      kind: 'shape',
      shapeKind: 'line',
      fillColor: 'transparent',
      strokeColor: '#654321',
    }))).toBe('#654321');
  });

  it('applies sampled colors to the selected frame color slot that matches its kind', () => {
    expect(buildPaperEyedropperFrameColorPatch(bubbleFrame({ kind: 'text' }), '#abcdef')).toEqual({
      typography: { color: '#abcdef' },
    });

    expect(buildPaperEyedropperFrameColorPatch(bubbleFrame({ kind: 'shape', shapeKind: 'line' }), '#abcdef')).toEqual({
      strokeColor: '#abcdef',
    });

    expect(buildPaperEyedropperFrameColorPatch(bubbleFrame({ kind: 'panel' }), '#abcdef')).toEqual({
      fillColor: '#abcdef',
    });
  });

  it('samples pixels from an image/page canvas source', () => {
    const bitmap = { width: 16, height: 16 } as unknown as (CanvasImageSource & { width: number; height: number });

    const sample = samplePixelColorFromCanvas({
      bitmap,
      x: 1.7,
      y: 2.4,
    });

    expect(sample).toEqual({ color: '#123456' });
    expect(pixelContext.drawImage).toHaveBeenCalledWith(bitmap, 1, 2, 1, 1, 0, 0, 1, 1);
  });

  it('returns a clear unsupported reason when no Paper pixel source is available', () => {
    const sample = resolvePaperEyedropperPixelColor();
    expect(sample).toEqual({ reason: 'No image/page pixel source is available for Paper eyedropper sampling.' });
  });

  it('returns a resolved color for image- and page-sourced Paper sampling requests', () => {
    const bitmap = { width: 16, height: 16 } as unknown as (CanvasImageSource & { width: number; height: number });

    expect(resolvePaperEyedropperPixelColor({ kind: 'image', bitmap, x: 1.7, y: 2.2 })).toEqual({
      color: '#123456',
      sourceKind: 'image',
      sourceLabel: 'Paper image',
    });
    expect(resolvePaperEyedropperPixelColor({ kind: 'page', bitmap, x: 1.7, y: 2.2 })).toEqual({
      color: '#123456',
      sourceKind: 'page',
      sourceLabel: 'Paper page',
    });
  });
});

describe('PaperWorkspaceUtils export', () => {
  it('maps PDF raster presets to predictable format, quality, and DPI limits', () => {
    const doc = createDefaultPaperDocument({ title: 'PDF Presets' });

    expect(buildPaperPdfRasterExportSettings(doc, { rasterPreset: 'print-png' })).toMatchObject({
      format: 'png',
      outputDpi: doc.page.dpi,
      quality: undefined,
    });
    expect(buildPaperPdfRasterExportSettings(doc, { rasterPreset: 'balanced-jpeg' })).toMatchObject({
      format: 'jpeg',
      outputDpi: Math.min(doc.page.dpi, 240),
      quality: 0.9,
    });
    expect(buildPaperPdfRasterExportSettings(doc, { rasterPreset: 'proof-jpeg' })).toMatchObject({
      format: 'jpeg',
      outputDpi: Math.min(doc.page.dpi, 150),
      quality: 0.82,
    });
  });

  it('sends flattened page snapshots to default native PDF export so PDF text matches the editor', async () => {
    let doc = createDefaultPaperDocument({ title: 'PDF Parity' });
    doc = addFrameToPaperPage(doc, doc.pages[0].id, {
      kind: 'speechBubble',
      text: 'PDF parity text',
      xMm: 20,
      yMm: 20,
      widthMm: 70,
      heightMm: 24,
    }).document;
    const exportPaperPdf = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/tmp/PDF-Parity.pdf',
      bytes: 4096,
    });
    vi.stubGlobal('window', {
      signalLoomNative: {
        exportPaperPdf,
      },
    });
    vi.stubGlobal('Image', class {
      decoding = 'sync';
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => 'data:image/png;base64,flattened-page'),
      })),
    });
    const statuses: string[] = [];

    await exportPaperPdfDocument(doc, (status) => statuses.push(status));

    const request = exportPaperPdf.mock.calls[0][0];
    expect(request.mode).toBe('pages-raster');
    expect(request.html).toContain('data-signal-loom-paper-raster-pdf="true"');
    expect(request.html).toContain('data:image/png;base64,flattened-page');
    expect(request.html).toContain('PDF parity text');
    expect(statuses[0]).toContain('Rasterizing 1 Paper page');
    expect(statuses.at(-1)).toContain('/tmp/PDF-Parity.pdf');
    vi.unstubAllGlobals();
  });

  it('uses the selected PDF raster preset for smaller proof exports', async () => {
    let doc = createDefaultPaperDocument({ title: 'Small Proof PDF' });
    doc = {
      ...doc,
      page: {
        ...doc.page,
        dpi: 300,
      },
    };
    const exportPaperPdf = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/tmp/Small-Proof-PDF.pdf',
      bytes: 2048,
    });
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,proof-page');
    vi.stubGlobal('window', {
      signalLoomNative: {
        exportPaperPdf,
      },
    });
    vi.stubGlobal('Image', class {
      decoding = 'sync';
      src = '';
      naturalWidth = 1200;
      naturalHeight = 1800;
      decode = vi.fn().mockResolvedValue(undefined);
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        })),
        toDataURL,
      })),
    });
    const statuses: string[] = [];

    await exportPaperPdfDocument(doc, (status) => statuses.push(status), undefined, { rasterPreset: 'proof-jpeg' });

    const request = exportPaperPdf.mock.calls[0][0];
    expect(request.page.dpi).toBe(150);
    expect(request.html).toContain('data:image/jpeg;base64,proof-page');
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(statuses[0]).toContain('Proof JPEG');
    vi.unstubAllGlobals();
  });

  it('does not invoke the PDF/X download bridge after a failed structural validation', async () => {
    const sha256 = 'a'.repeat(64);
    const profileAsset: BinaryAssetRef = {
      id: `sha256:${sha256}`,
      sha256,
      mimeType: 'application/vnd.iccprofile',
      byteLength: 8,
    };
    const profile: PaperManagedIccProfile = {
      id: profileAsset.id,
      asset: profileAsset,
      description: 'Exact FOGRA51 profile',
      deviceClass: 'prtr',
      colorSpace: 'CMYK',
      pcs: 'Lab ',
      outputConditionId: 'FOGRA51',
      source: { kind: 'user-import' },
    };
    const document = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Blocked PDFX' }), {
      printProduction: {
        pdfStandard: 'pdf-x-4',
        outputIntentProfileId: 'pso-coated-v3-fogra51',
        outputIntentProfileAssetId: profile.id,
      },
      managedIccProfiles: [profile],
    });
    const downloadPdf = vi.fn();
    const statuses: string[] = [];

    await exportPaperPdfxAndSave(document, (status) => statuses.push(status), {
      exportPdfx: async () => ({
        bytes: new Uint8Array([1]),
        standard: 'pdf-x-4',
        pageCount: 1,
        profileName: 'Exact FOGRA51 profile',
        approximateColor: false,
        nativeEvidence: {
          processObjectIds: [], spotPlates: [], embeddedFontIds: [], outlinedObjectIds: [], flattenedObjectIds: [], overprintObjectIds: [],
        },
      }),
      validatePdfx: async () => ({
        standard: 'pdf-x-4', headerVersion: '1.6', pass: false,
        checks: [{ id: 'no-rgb', label: 'No RGB color', pass: false }],
      }),
      downloadPdf,
      assetExists: async () => true,
    });

    expect(downloadPdf).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toContain('blocked');
  });
});

describe('PaperWorkspaceUtils editable frame vertices', () => {
  it('gives comic panels draggable corner vertices by default', () => {
    expect(verticesForEditableFrame(bubbleFrame({ kind: 'panel' }))).toEqual([
      { xPercent: 0, yPercent: 0 },
      { xPercent: 100, yPercent: 0 },
      { xPercent: 100, yPercent: 100 },
      { xPercent: 0, yPercent: 100 },
    ]);
  });

  it('does not reuse stale triangle vertices on captions or speech bubbles', () => {
    const staleTriangle = [
      { xPercent: 50, yPercent: 0 },
      { xPercent: 100, yPercent: 100 },
      { xPercent: 0, yPercent: 100 },
    ];

    expect(verticesForEditableFrame(bubbleFrame({ kind: 'caption', vertices: staleTriangle }))).toEqual([
      { xPercent: 0, yPercent: 0 },
      { xPercent: 100, yPercent: 0 },
      { xPercent: 100, yPercent: 100 },
      { xPercent: 0, yPercent: 100 },
    ]);
    expect(verticesForEditableFrame(bubbleFrame({ kind: 'speechBubble', vertices: staleTriangle }))).toBeUndefined();
  });

  it('moves individual vertices and expands the frame box to fit the edited polygon', () => {
    expect(movePaperFrameVertexPatch(bubbleFrame({
      kind: 'panel',
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    }), 1, { xMm: 72, yMm: 24 })).toEqual({
      xMm: 20,
      yMm: 24,
      widthMm: 52,
      heightMm: 26,
      vertices: [
        { xPercent: 0, yPercent: 23.08 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 76.92, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    });
  });

  it('snaps vertex edits to the frame border when border snapping is requested', () => {
    expect(movePaperFrameVertexPatch(bubbleFrame({
      kind: 'panel',
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    }), 1, { xMm: 58.8, yMm: 24 }, { snapToBorder: true })).toEqual({
      xMm: 20,
      yMm: 24,
      widthMm: 40,
      heightMm: 26,
      vertices: [
        { xPercent: 0, yPercent: 23.08 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    });
  });

  it('inserts a vertex along an edge so a rectangle can become a five-sided polygon', () => {
    expect(insertPaperFrameVertexPatch(bubbleFrame({ kind: 'panel' }), 0)).toEqual({
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 50, yPercent: 0 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    });

    expect(insertPaperFrameVertexPatch(bubbleFrame({ kind: 'panel' }), 3, { xMm: 10, yMm: 52 })).toEqual({
      xMm: 10,
      yMm: 30,
      widthMm: 50,
      heightMm: 22,
      vertices: [
        { xPercent: 20, yPercent: 0 },
        { xPercent: 100, yPercent: 0 },
        { xPercent: 100, yPercent: 90.91 },
        { xPercent: 20, yPercent: 90.91 },
        { xPercent: 0, yPercent: 100 },
      ],
    });
  });

  it('deletes vertices while preserving a valid polygon', () => {
    expect(deletePaperFrameVertexPatch(bubbleFrame({ kind: 'panel' }), 1)).toEqual({
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    });

    expect(deletePaperFrameVertexPatch(bubbleFrame({
      kind: 'panel',
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    }), 1)).toEqual({});
  });

  it('allows a caption corner to be deleted into an intentional triangle', () => {
    const patch = deletePaperFrameVertexPatch(bubbleFrame({ kind: 'caption' }), 1);

    expect(patch).toEqual({
      vertices: [
        { xPercent: 0, yPercent: 0 },
        { xPercent: 100, yPercent: 100 },
        { xPercent: 0, yPercent: 100 },
      ],
    });
    expect(verticesForEditableFrame(bubbleFrame({ kind: 'caption', vertices: patch.vertices }))).toEqual(patch.vertices);
  });

  it('only reveals polygon vertices while the vertex edit modifier is active or a vertex drag is running', () => {
    expect(shouldShowPaperVertexHandles(bubbleFrame({ kind: 'panel' }), {
      isSelected: true,
      modifierActive: false,
      vertexInteractionActive: false,
    })).toBe(false);
    expect(shouldShowPaperVertexHandles(bubbleFrame({ kind: 'panel' }), {
      isSelected: true,
      modifierActive: true,
      vertexInteractionActive: false,
    })).toBe(true);
    expect(shouldShowPaperVertexHandles(bubbleFrame({ kind: 'panel' }), {
      isSelected: true,
      modifierActive: false,
      vertexInteractionActive: true,
    })).toBe(true);
    expect(shouldShowPaperVertexHandles(bubbleFrame({ kind: 'speechBubble' }), {
      isSelected: true,
      modifierActive: true,
      vertexInteractionActive: false,
    })).toBe(false);
  });
});
