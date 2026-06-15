import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../../types/imageEditor';
import {
  buildCropPreviewRect,
  buildCroppedImageDocumentState,
  buildCropToolCommitPlanDescriptor,
  summarizeCropPreviewGeometry,
  resolveCropPreviewAspectRatio,
  describeCropToolReadiness,
} from './cropTool';

class FakeOffscreenCanvas {
  width: number;
  height: number;
  drawImage = vi.fn();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return { drawImage: this.drawImage };
  }
}

function fakeBitmap(width: number, height: number): LayerBitmap {
  const drawImage = vi.fn();
  return {
    width,
    height,
    getContext: vi.fn(() => ({ drawImage })),
  } as unknown as LayerBitmap;
}

function layer(patch: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 10,
    y: 20,
    bitmap: fakeBitmap(200, 120),
    bitmapVersion: 2,
    mask: fakeBitmap(200, 120),
    ...patch,
  };
}

function doc(layers: ImageLayer[]): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Doc',
    width: 300,
    height: 200,
    layers,
    activeLayerId: layers[0]?.id ?? null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    snapshots: [],
  };
}

describe('cropTool', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  });

  it('builds a fixed-aspect crop preview when a preset ratio is active', () => {
    const preview = buildCropPreviewRect({
      start: { x: 10, y: 20 },
      current: { x: 70, y: 50 },
      aspectRatio: 1,
    });

    expect(preview).toEqual({
      x: 10,
      y: 20,
      w: 60,
      h: 60,
    });
  });

  it('attaches crop rotation metadata to the preview rectangle', () => {
    const preview = buildCropPreviewRect({
      start: { x: 10, y: 20 },
      current: { x: 70, y: 50 },
      aspectRatio: null,
      rotationDeg: 12.5,
    });

    expect(preview).toEqual({
      x: 10,
      y: 20,
      w: 60,
      h: 30,
      rotationDeg: 12.5,
    });
  });

  it('resolves the original crop preset from the current document dimensions', () => {
    const aspectRatio = resolveCropPreviewAspectRatio(doc([layer()]), 'original');

    expect(aspectRatio).toBe(1.5);
  });

  it('builds a cropped document state without losing active layer identity', () => {
    const original = layer();
    const result = buildCroppedImageDocumentState(doc([original]), {
      x: 25.2,
      y: 30.7,
      w: 80.4,
      h: 40.1,
    }, { deleteCroppedPixels: true });

    expect(result?.width).toBe(80);
    expect(result?.height).toBe(40);
    expect(result?.activeLayerId).toBe('layer-1');
    expect(result?.layers).toHaveLength(1);
    expect(result?.layers[0]).toMatchObject({
      id: 'layer-1',
      x: 0,
      y: 0,
      bitmapVersion: 3,
      mask: null,
    });
    expect(result?.layers[0].bitmap?.width).toBe(80);
    expect(result?.layers[0].bitmap?.height).toBe(40);
  });

  it('offsets non-bitmap layers instead of rasterizing them', () => {
    const textLayer = layer({
      id: 'text-1',
      type: 'text',
      bitmap: null,
      x: 64,
      y: 88,
    });
    const result = buildCroppedImageDocumentState(doc([textLayer]), {
      x: 12,
      y: 18,
      w: 50,
      h: 60,
    });

    expect(result?.layers[0]).toMatchObject({ id: 'text-1', x: 52, y: 70, bitmap: null });
  });

  it('preserves bitmap pixels and masks for non-destructive crop commits', () => {
    const originalBitmap = fakeBitmap(200, 120);
    const originalMask = fakeBitmap(200, 120);
    const original = layer({
      x: 40,
      y: 55,
      bitmap: originalBitmap,
      mask: originalMask,
      bitmapVersion: 7,
    });

    const result = buildCroppedImageDocumentState(doc([original]), {
      x: 25,
      y: 30,
      w: 80,
      h: 40,
    }, { deleteCroppedPixels: false });

    expect(result?.width).toBe(80);
    expect(result?.height).toBe(40);
    expect(result?.layers[0]).toMatchObject({
      id: 'layer-1',
      x: 15,
      y: 25,
      bitmapVersion: 7,
      bitmap: originalBitmap,
      mask: originalMask,
    });
  });

  it('rotates layer placement around the crop center for non-destructive straighten commits', () => {
    const originalBitmap = fakeBitmap(200, 120);
    const originalMask = fakeBitmap(200, 120);
    const original = layer({
      x: 40,
      y: 55,
      rotationDeg: 10,
      bitmap: originalBitmap,
      mask: originalMask,
      bitmapVersion: 7,
    });

    const result = buildCroppedImageDocumentState(doc([original]), {
      x: 25,
      y: 30,
      w: 80,
      h: 40,
      rotationDeg: 90,
    }, { deleteCroppedPixels: false, rotationDeg: 90 });

    expect(result?.width).toBe(80);
    expect(result?.height).toBe(40);
    expect(result?.layers[0]).toMatchObject({
      id: 'layer-1',
      x: 45,
      y: 45,
      rotationDeg: -80,
      bitmapVersion: 7,
      bitmap: originalBitmap,
      mask: originalMask,
    });
  });

  it('bakes destructive straighten crops into a new bitmap without preserving the old mask', () => {
    const original = layer({
      x: 40,
      y: 55,
      bitmapVersion: 7,
      mask: fakeBitmap(200, 120),
    });

    const result = buildCroppedImageDocumentState(doc([original]), {
      x: 25,
      y: 30,
      w: 80,
      h: 40,
      rotationDeg: 15,
    }, { deleteCroppedPixels: true, rotationDeg: 15 });

    expect(result?.width).toBe(80);
    expect(result?.height).toBe(40);
    expect(result?.layers[0]).toMatchObject({
      id: 'layer-1',
      x: 0,
      y: 0,
      bitmapVersion: 8,
      mask: null,
    });
    expect(result?.layers[0].bitmap?.width).toBe(80);
    expect(result?.layers[0].bitmap?.height).toBe(40);
  });

  it('summarizes crop preview aspect, composition guide, and rotation metadata', () => {
    const summary = summarizeCropPreviewGeometry({
      doc: doc([layer()]),
      preview: { x: 12.25, y: 8.75, w: 160, h: 90, rotationDeg: -7.25 },
      settings: {
        aspectPreset: '16:9',
        guideMode: 'thirds',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
    });

    expect(summary).toEqual({
      signature: 'crop-preview|12.25,8.75,160x90|rotate=-7.25|aspect=16:9|guide=thirds',
      boundsLabel: '12.25,8.75 160x90',
      aspect: { preset: '16:9', ratio: 1.777778, locked: true },
      guides: { mode: 'thirds', verticalLines: 2, horizontalLines: 2, label: 'Rule of thirds' },
      straighten: { rotationDeg: -7.25, applied: true, direction: 'counterclockwise' },
    });
  });

  it('describes crop rectangle, apply/cancel, presets, guides, straighten, and non-destructive readiness', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 12.25, y: 8.75, w: 160, h: 90, rotationDeg: -7.25 },
      settings: {
        aspectPreset: '16:9',
        guideMode: 'thirds',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
      printDpi: 320,
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.workingState).toEqual({
      hasPreview: true,
      phase: 'preview-ready',
      sourceDimensions: { width: 300, height: 200 },
    });
    expect(readiness.cropRectangle).toEqual({
      status: 'ready',
      boundsLabel: '12.25,8.75 160x90',
      width: 160,
      height: 90,
      canApply: true,
    });
    expect(readiness.applyCancel).toEqual({
      apply: 'supported-enter-key',
      cancel: 'supported-escape-key',
      previewPersistence: 'temporary-until-apply',
      previewBehavior: 'live-overlay-no-document-mutation',
    });
    expect(readiness.aspectPresets.supported).toEqual(['free', 'original', '1:1', '4:3', '3:2', '4:5', '16:9']);
    expect(readiness.aspectPresets.active).toEqual({ preset: '16:9', ratio: 1.777778, locked: true });
    expect(readiness.guideOverlays).toEqual({ mode: 'thirds', verticalLines: 2, horizontalLines: 2, label: 'Rule of thirds' });
    expect(readiness.straighten).toEqual({ status: 'ready', rotationDeg: -7.25, direction: 'counterclockwise' });
    expect(readiness.rotateCrop).toEqual({ status: 'ready', rotationDeg: -7.25 });
    expect(readiness.pixelRetention).toEqual({
      mode: 'non-destructive',
      deleteCroppedPixels: false,
      hiddenPixels: 'preserved-off-canvas',
      layerBitmapHandling: 'offset-retained-layer-content',
    });
    expect(readiness.fixedSizePrintGeometry).toEqual({
      dpi: 320,
      outputPixels: { width: 160, height: 90 },
      widthInches: 0.5,
      heightInches: 0.281,
      widthMm: 12.7,
      heightMm: 7.137,
      aspectLocked: true,
    });
    expect(readiness.sourceBinExportHandoff).toEqual({
      status: 'ready',
      sourceBinSafe: true,
      exportSafe: true,
      outputDimensions: { width: 160, height: 90 },
      caveats: ['Non-destructive crop handoff is safe for Source Bin/export, but flattened exports only include the visible crop bounds.'],
    });
    expect(readiness.batchActionSuitability).toEqual({
      actionRecording: 'recordable-fixed-preview',
      batchApply: 'suitable-with-fixed-rectangle',
      requiresPerDocumentValidation: true,
    });
    expect(readiness.previewSignatures).toEqual({
      geometry: 'crop-preview|12.25,8.75,160x90|rotate=-7.25|aspect=16:9|guide=thirds',
      readiness: 'crop-readiness|ready|rect=12.25,8.75,160x90|apply=true|mode=non-destructive|rotate=-7.25|aspect=16:9|guide=thirds|blockers=none',
    });
    expect(readiness.blockers).toEqual([]);
  });

  it('describes preset aspect constraints and non-destructive preview source/export safety', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 20, y: 10, w: 120, h: 150 },
      settings: {
        aspectPreset: '4:5',
        guideMode: 'grid',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
    });

    expect(readiness.aspectPresets.constraint).toEqual({
      preset: '4:5',
      requestedRatio: 0.8,
      previewRatio: 0.8,
      locked: true,
      satisfied: true,
      constrainedPreview: { width: 120, height: 150 },
    });
    expect(readiness.previewMetadata).toEqual({
      documentMutation: 'none-until-apply',
      previewLayerMutation: 'none-overlay-only',
      hiddenPixels: 'preserved-off-canvas',
      sourceSafety: 'source-layer-bitmaps-referenced-until-apply',
      exportSafety: 'flattened-export-uses-visible-crop-bounds',
    });
  });

  it('warns when crop output is handed to resize and canvas expansion descriptors', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 0, y: 0, w: 120, h: 120 },
      settings: {
        aspectPreset: '1:1',
        guideMode: 'none',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
      handoffResize: { width: 240, height: 120, resampleMethod: 'bicubic' },
      handoffCanvas: { width: 300, height: 200, anchor: 'center' },
    });

    expect(readiness.resizeCanvasHandoff).toEqual({
      cropOutputDimensions: { width: 120, height: 120 },
      resize: {
        status: 'will-resample-crop-output',
        targetDimensions: { width: 240, height: 120 },
        resampleMethod: 'bicubic',
        scale: { x: 2, y: 1 },
        warningCodes: ['handoff-resize-resamples-crop-output'],
      },
      canvas: {
        status: 'will-expand-canvas',
        targetDimensions: { width: 300, height: 200 },
        anchor: 'center',
        canvasOffset: { x: 30, y: 40 },
        transparentExpansion: { left: 30, top: 40, right: 30, bottom: 40 },
        warningCodes: ['handoff-canvas-adds-transparent-pixels'],
      },
      warnings: [
        {
          code: 'handoff-resize-resamples-crop-output',
          severity: 'warning',
          message: 'Crop output handoff will be resampled from 120x120 to 240x120 using bicubic.',
        },
        {
          code: 'handoff-canvas-adds-transparent-pixels',
          severity: 'warning',
          message: 'Canvas handoff expands 240x120 to 300x200 and adds transparent pixels on at least one edge.',
        },
      ],
      signature: 'crop-handoff|crop=120x120|resize=240x120:bicubic:will-resample-crop-output|canvas=300x200:center:expand=30,40,30,40|warnings=handoff-resize-resamples-crop-output,handoff-canvas-adds-transparent-pixels',
    });
  });

  it('reports destructive delete-cropped-pixels readiness and unsupported crop states deterministically', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 0, y: 0, w: 120, h: 80 },
      settings: {
        aspectPreset: '4:3',
        guideMode: 'grid',
        deleteCroppedPixels: true,
        rotationDeg: 0,
      },
      requirePerspectiveCrop: true,
      requireContentAwareCornerFill: true,
      requirePresetManagement: true,
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.pixelRetention).toEqual({
      mode: 'destructive',
      deleteCroppedPixels: true,
      hiddenPixels: 'deleted-on-apply',
      layerBitmapHandling: 'bake-visible-crop-into-new-bitmaps',
    });
    expect(readiness.unsupportedStates).toEqual({
      perspectiveCrop: 'unsupported',
      contentAwareCornerFill: 'unsupported',
      presetManagement: 'caveat-built-in-presets-only',
    });
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'perspective-crop-unsupported',
      'content-aware-corner-fill-unsupported',
      'custom-preset-management-unavailable',
    ]);
    expect(readiness.previewSignatures.readiness).toBe(
      'crop-readiness|blocked|rect=0,0,120x80|apply=true|mode=destructive|rotate=0|aspect=4:3|guide=grid|blockers=perspective-crop-unsupported,content-aware-corner-fill-unsupported,custom-preset-management-unavailable',
    );
  });

  it('describes crop handle ergonomics and keeps handle signatures stable', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 10, y: 20, w: 100, h: 50, rotationDeg: -5 },
      settings: {
        aspectPreset: 'free',
        guideMode: 'thirds',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
    });

    expect(readiness.handleReadiness).toEqual({
      status: 'ready',
      minHitTargetPx: 24,
      hitTargetPx: 28,
      visualHandlePx: 8,
      keyboardStepPx: 1,
      handles: [
        { id: 'nw', kind: 'corner-resize', documentPoint: { x: 10, y: 20 }, cursor: 'nwse-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'n', kind: 'edge-resize', documentPoint: { x: 60, y: 20 }, cursor: 'ns-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'ne', kind: 'corner-resize', documentPoint: { x: 110, y: 20 }, cursor: 'nesw-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'e', kind: 'edge-resize', documentPoint: { x: 110, y: 45 }, cursor: 'ew-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'se', kind: 'corner-resize', documentPoint: { x: 110, y: 70 }, cursor: 'nwse-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 's', kind: 'edge-resize', documentPoint: { x: 60, y: 70 }, cursor: 'ns-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'sw', kind: 'corner-resize', documentPoint: { x: 10, y: 70 }, cursor: 'nesw-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'w', kind: 'edge-resize', documentPoint: { x: 10, y: 45 }, cursor: 'ew-resize', hitTargetPx: 28, visualHandlePx: 8, ready: true },
        { id: 'rotate', kind: 'rotate-crop', documentPoint: { x: 60, y: -8 }, cursor: 'grab', hitTargetPx: 28, visualHandlePx: 8, ready: true },
      ],
      caveats: [
        'Handle descriptors are deterministic planning metadata; direct crop-box drag handles are rendered by the canvas overlay path.',
        'Perspective corner dragging is not exposed by the crop handles.',
      ],
      signature: 'crop-handles:v1|ready|rect=10,20,100x50|handles=nw:10,20|n:60,20|ne:110,20|e:110,45|se:110,70|s:60,70|sw:10,70|w:10,45|rotate:60,-8|hit=28|visual=8',
    });
  });

  it('adds typed crop descriptor checks for unsupported states, presets, preview safety, and signatures', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 0, y: 0, w: 120, h: 80 },
      settings: {
        aspectPreset: '4:3',
        guideMode: 'grid',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
      requirePerspectiveCrop: true,
      requireContentAwareCornerFill: true,
      requirePresetManagement: true,
    });

    expect(readiness.descriptorChecks).toEqual({
      perspectiveCropUnsupported: {
        status: 'unsupported',
        supported: false,
        requested: true,
        blockerCode: 'perspective-crop-unsupported',
        fallback: 'rectangular-crop-with-straighten',
        mutationPolicy: 'blocked-before-document-mutation',
        signature: 'crop-check:v1:perspective-crop:unsupported:requested=true:fallback=rectangular-crop-with-straighten',
      },
      contentAwareCornerFillUnsupported: {
        status: 'unsupported',
        supported: false,
        requested: true,
        blockerCode: 'content-aware-corner-fill-unsupported',
        fallback: 'transparent-corners-preserved-for-repair',
        mutationPolicy: 'blocked-before-document-mutation',
        signature: 'crop-check:v1:content-aware-corner-fill:unsupported:requested=true:fallback=transparent-corners-preserved-for-repair',
      },
      presetManagementCaveats: {
        status: 'limited-built-in-presets-only',
        builtInPresetCount: 7,
        customPresetManagement: false,
        importExport: false,
        caveats: [
          'custom-preset-create-rename-unavailable',
          'crop-preset-import-export-unavailable',
          'built-in-aspect-presets-are-deterministic',
        ],
        signature: 'crop-check:v1:preset-management:limited-built-in-presets-only:count=7:custom=false:import-export=false',
      },
      nonDestructivePreviewSafety: {
        status: 'safe-overlay-preview',
        documentMutation: 'none-until-apply',
        layerMutation: 'none-overlay-only',
        hiddenPixels: 'preserved-off-canvas',
        sourceLayerBitmaps: 'referenced-until-apply',
        flattenedExport: 'visible-crop-bounds-only',
        signature: 'crop-check:v1:non-destructive-preview:safe-overlay-preview:hidden=preserved-off-canvas:source=referenced-until-apply',
      },
      signature: 'crop-checks:v1|perspective=unsupported:requested|corner-fill=unsupported:requested|presets=limited-built-in-presets-only|preview=safe-overlay-preview|mode=non-destructive',
    });
  });

  it('builds typed crop commit/source safety descriptors with stable signatures', () => {
    const plan = buildCropToolCommitPlanDescriptor({
      doc: doc([layer()]),
      preview: { x: 12.25, y: 8.75, w: 160, h: 90, rotationDeg: -7.25 },
      settings: {
        aspectPreset: '16:9',
        guideMode: 'thirds',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
      requirePerspectiveCrop: true,
      requireContentAwareCornerFill: true,
    });

    expect(plan).toEqual({
      descriptorId: 'crop-tool-commit-plan:v1',
      planSignature: 'crop-tool-commit-plan:v1|non-destructive|rect=12.25,8.75,160x90|out=160x90|rotate=-7.25|aspect=16:9|guide=thirds|unsupported=perspective-crop-unsupported,content-aware-corner-fill-unsupported',
      sourceSignature: 'crop-tool-source-safety:v1|mode=non-destructive|hidden=preserved-off-canvas|source=referenced-until-apply|flattened=visible-crop-bounds-only',
      commit: {
        status: 'ready',
        mode: 'non-destructive',
        outputDimensions: { width: 160, height: 90 },
        documentMutation: 'apply-resizes-document',
        layerMutation: 'offset-retained-layer-content',
        undoModel: 'single-atomic-document-operation',
      },
      previewSession: {
        active: true,
        applyReady: true,
        cancelReady: true,
        applyCommand: 'Enter',
        cancelCommand: 'Escape',
        signature: 'crop-tool-preview-session:v1|active=true|apply=true|cancel=true|rect=12.25,8.75,160x90|rotate=-7.25',
      },
      sourceSafety: {
        hiddenPixels: 'preserved-off-canvas',
        sourceLayerBitmaps: 'referenced-until-apply',
        flattenedExport: 'visible-crop-bounds-only',
        destructiveCaveats: [],
        signature: 'crop-tool-source-safety:v1|mode=non-destructive|hidden=preserved-off-canvas|source=referenced-until-apply|flattened=visible-crop-bounds-only',
      },
      unsupported: [
        {
          code: 'perspective-crop-unsupported',
          requested: true,
          supported: false,
          mutationPolicy: 'blocked-before-document-mutation',
          fallback: 'rectangular-crop-with-straighten',
          signature: 'crop-tool-unsupported:v1|perspective-crop-unsupported|requested=true|fallback=rectangular-crop-with-straighten',
        },
        {
          code: 'content-aware-corner-fill-unsupported',
          requested: true,
          supported: false,
          mutationPolicy: 'blocked-before-document-mutation',
          fallback: 'transparent-corners-preserved-for-repair',
          signature: 'crop-tool-unsupported:v1|content-aware-corner-fill-unsupported|requested=true|fallback=transparent-corners-preserved-for-repair',
        },
      ],
    });
  });

  it('blocks apply readiness when the crop rectangle is missing or invalid', () => {
    const readiness = describeCropToolReadiness({
      doc: doc([layer()]),
      preview: { x: 0, y: 0, w: 0, h: 80 },
      settings: {
        aspectPreset: 'free',
        guideMode: 'none',
        deleteCroppedPixels: false,
        rotationDeg: 0,
      },
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.cropRectangle).toEqual({
      status: 'blocked-invalid-rectangle',
      boundsLabel: 'none',
      width: 0,
      height: 0,
      canApply: false,
    });
    expect(readiness.applyCancel).toEqual({
      apply: 'blocked-invalid-rectangle',
      cancel: 'supported-escape-key',
      previewPersistence: 'temporary-until-apply',
      previewBehavior: 'unavailable',
    });
    expect(readiness.sourceBinExportHandoff).toMatchObject({
      status: 'blocked-invalid-crop',
      sourceBinSafe: false,
      exportSafe: false,
      outputDimensions: { width: 0, height: 0 },
    });
    expect(readiness.batchActionSuitability).toEqual({
      actionRecording: 'blocked-invalid-crop',
      batchApply: 'blocked-invalid-crop',
      requiresPerDocumentValidation: true,
    });
    expect(readiness.blockers).toEqual([
      {
        code: 'invalid-crop-rectangle',
        severity: 'error',
        operation: 'apply-crop',
        message: 'Crop apply requires a positive-width and positive-height rectangle.',
      },
    ]);
    expect(readiness.previewSignatures).toEqual({
      geometry: 'crop-preview|none',
      readiness: 'crop-readiness|blocked|rect=none|apply=false|mode=non-destructive|rotate=0|aspect=free|guide=none|blockers=invalid-crop-rectangle',
    });
  });
});
