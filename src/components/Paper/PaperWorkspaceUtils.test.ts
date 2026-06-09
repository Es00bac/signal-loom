import { describe, expect, it, vi } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument } from '../../lib/paperDocument';
import type { PaperFrame } from '../../types/paper';
import {
  bubbleHandlePatch,
  buildPaperPdfRasterExportSettings,
  deletePaperFrameVertexPatch,
  exportPaperPdfDocument,
  insertPaperFrameVertexPatch,
  movePaperFrameVertexPatch,
  shouldShowPaperVertexHandles,
  verticesForEditableFrame,
} from './PaperWorkspaceUtils';

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
