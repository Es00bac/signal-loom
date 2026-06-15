import { describe, expect, it } from 'vitest';
import { buildImageCropPlanningDescriptor, drawCropPreviewOverlay } from './ImageCropOverlay';
import type { DocumentViewport } from '../../types/imageEditor';

class FakeContext {
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 0;
  saved = 0;
  transforms: Array<{ kind: 'translate'; x: number; y: number } | { kind: 'rotate'; radians: number }> = [];
  rects: Array<{ x: number; y: number; w: number; h: number; mode: 'fill' | 'stroke' }> = [];
  currentSegments: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  lines: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  lastPoint: { x: number; y: number } | null = null;

  save() {
    this.saved += 1;
  }

  restore() {
    this.saved -= 1;
  }

  setLineDash() {}

  translate(x: number, y: number) {
    this.transforms.push({ kind: 'translate', x, y });
  }

  rotate(radians: number) {
    this.transforms.push({ kind: 'rotate', radians });
  }

  beginPath() {
    this.currentSegments = [];
    this.lastPoint = null;
  }

  moveTo(x: number, y: number) {
    this.lastPoint = { x, y };
  }

  lineTo(x: number, y: number) {
    if (!this.lastPoint) return;
    const nextPoint = { x, y };
    this.currentSegments.push({ from: this.lastPoint, to: nextPoint });
    this.lastPoint = nextPoint;
  }

  stroke() {
    this.lines.push(...this.currentSegments);
    this.currentSegments = [];
    this.lastPoint = null;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, mode: 'fill' });
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, mode: 'stroke' });
  }
}

describe('ImageCropOverlay', () => {
  it('draws the current crop rectangle in screen space', () => {
    const ctx = new FakeContext();
    const viewport: DocumentViewport = { zoom: 2, panX: 10, panY: 20 };

    drawCropPreviewOverlay(ctx as unknown as CanvasRenderingContext2D, {
      canvasSize: { width: 90, height: 70 },
      guideMode: 'none',
      preview: { x: 5, y: 6, w: 20, h: 10 },
      viewport,
    });

    expect(ctx.rects).toEqual([
      { x: 0, y: 0, w: 90, h: 32, mode: 'fill' },
      { x: 0, y: 32, w: 20, h: 20, mode: 'fill' },
      { x: 60, y: 32, w: 30, h: 20, mode: 'fill' },
      { x: 0, y: 52, w: 90, h: 18, mode: 'fill' },
      { x: 20, y: 32, w: 40, h: 20, mode: 'fill' },
      { x: 20.5, y: 32.5, w: 39, h: 19, mode: 'stroke' },
      { x: 20.5, y: 32.5, w: 39, h: 19, mode: 'stroke' },
    ]);
    expect(ctx.lines).toEqual([]);
    expect(ctx.saved).toBe(0);
  });

  it('draws thirds guides inside the crop rectangle', () => {
    const ctx = new FakeContext();
    const viewport: DocumentViewport = { zoom: 2, panX: 10, panY: 20 };

    drawCropPreviewOverlay(ctx as unknown as CanvasRenderingContext2D, {
      canvasSize: { width: 90, height: 70 },
      guideMode: 'thirds',
      preview: { x: 5, y: 6, w: 20, h: 10 },
      viewport,
    });

    expect(ctx.lines.map(roundSegment)).toEqual([
      { from: { x: 33.33, y: 32.5 }, to: { x: 33.33, y: 51.5 } },
      { from: { x: 46.67, y: 32.5 }, to: { x: 46.67, y: 51.5 } },
      { from: { x: 20.5, y: 38.67 }, to: { x: 59.5, y: 38.67 } },
      { from: { x: 20.5, y: 45.33 }, to: { x: 59.5, y: 45.33 } },
    ]);
    expect(ctx.saved).toBe(0);
  });

  it('rotates the crop boundary and guides around the preview center for straighten previews', () => {
    const ctx = new FakeContext();
    const viewport: DocumentViewport = { zoom: 2, panX: 10, panY: 20 };

    drawCropPreviewOverlay(ctx as unknown as CanvasRenderingContext2D, {
      canvasSize: { width: 90, height: 70 },
      guideMode: 'thirds',
      preview: { x: 5, y: 6, w: 20, h: 10, rotationDeg: 15 },
      viewport,
    });

    expect(ctx.transforms.map(roundTransform)).toContainEqual({
      kind: 'translate',
      x: 40,
      y: 42,
    });
    expect(ctx.transforms.map(roundTransform)).toContainEqual({
      kind: 'rotate',
      radians: 0.26,
    });
    expect(ctx.saved).toBe(0);
  });

  it('describes crop bounds, delete-cropped-pixels, straighten, and output dimensions deterministically', () => {
    expect(buildImageCropPlanningDescriptor({
      doc: { width: 120, height: 90 },
      preview: { x: 10.4, y: -2.2, w: 50.6, h: 40.2, rotationDeg: -12 },
      settings: { deleteCroppedPixels: true, rotationDeg: 0 },
    })).toEqual({
      kind: 'crop-commit',
      planSignature: 'crop-commit|destructive|src=120x90|bounds=10,-2,51x40|out=51x40|rotate=-12|aspect=free|guide=none|corner=transparent|bit=8',
      planningChecks: {
        perspectiveCrop: {
          status: 'unsupported',
          supported: false,
          requested: false,
          fallback: 'rectangular-crop-with-straighten',
          mutationPolicy: 'planning-only-no-document-mutation',
          warningCode: 'perspective-crop-unsupported',
          signature: 'image-crop-check:v1:perspective-crop:unsupported:requested=false:fallback=rectangular-crop-with-straighten',
        },
        contentAwareCornerFill: {
          status: 'unsupported',
          supported: false,
          requested: false,
          fallback: 'none',
          mutationPolicy: 'planning-only-no-document-mutation',
          warningCode: 'content-aware-corner-fill-unsupported',
          signature: 'image-crop-check:v1:content-aware-corner-fill:unsupported:requested=false:fallback=none',
        },
        presetManagement: {
          status: 'limited-built-in-presets-only',
          builtInPresetCount: 7,
          customPresetManagement: false,
          importExport: false,
          caveats: [
            'custom-preset-create-rename-unavailable',
            'crop-preset-import-export-unavailable',
            'built-in-aspect-presets-are-deterministic',
          ],
          signature: 'image-crop-check:v1:preset-management:limited-built-in-presets-only:count=7:custom=false:import-export=false',
        },
        nonDestructivePreviewSafety: {
          status: 'destructive-apply-warning',
          documentMutation: 'none-until-commit',
          layerMutation: 'none-overlay-only',
          hiddenPixels: 'deleted-on-commit',
          sourceLayerBitmaps: 'rebaked-on-commit',
          flattenedExport: 'visible-crop-bounds-only',
          signature: 'image-crop-check:v1:non-destructive-preview:destructive-apply-warning:hidden=deleted-on-commit:source=rebaked-on-commit',
        },
        signature: 'image-crop-checks:v1|perspective=unsupported:not-requested|corner-fill=unsupported:not-requested|presets=limited-built-in-presets-only|preview=destructive-apply-warning|mode=destructive',
      },
      sourceDimensions: { width: 120, height: 90 },
      cropBounds: { x: 10, y: -2, width: 51, height: 40, right: 61, bottom: 38 },
      documentIntersection: { x: 10, y: 0, width: 51, height: 38, right: 61, bottom: 38 },
      outsideDocument: { left: 0, top: 2, right: 0, bottom: 0 },
      outputDimensions: { width: 51, height: 40 },
      deleteCroppedPixels: true,
      preservesHiddenPixels: false,
      aspectConstraint: {
        preset: 'free',
        requestedRatio: null,
        previewRatio: 1.275,
        locked: false,
        satisfied: true,
        constrainedPreview: { width: 51, height: 40 },
        message: 'Free crop aspect has no locked ratio; preview dimensions can be adjusted independently.',
      },
      nonDestructivePreview: {
        status: 'destructive-preview-warning',
        documentMutation: 'none-until-commit',
        hiddenPixels: 'deleted-on-commit',
        sourceLayerBitmaps: 'rebaked-on-commit',
        flattenedExportBehavior: 'visible-crop-bounds-only',
      },
      printGeometry: {
        dpi: 72,
        outputPixels: { width: 51, height: 40 },
        widthInches: 0.708,
        heightInches: 0.556,
        widthMm: 17.983,
        heightMm: 14.122,
        aspectLocked: false,
      },
      sourceBinExportHandoff: {
        status: 'ready',
        sourceBinSafe: true,
        exportSafe: true,
        destructiveCaveat: 'Source Bin handoff receives the committed cropped pixels; discarded hidden pixels are not recoverable from the exported asset.',
        flattenedExportCaveat: 'Export handoff uses the crop output dimensions and should validate file format support before writing.',
      },
      batchActionSuitability: {
        actionRecording: 'recordable-fixed-crop',
        batchApply: 'suitable-with-fixed-output-size',
        requiresPerDocumentBoundsValidation: true,
      },
      straighten: { rotationDeg: -12, applied: true },
      unsupported: {
        perspectiveCrop: {
          supported: false,
          requested: false,
          message: 'Perspective crop is not available in the current local crop pipeline; only rectangular crop bounds plus straighten rotation are planned.',
        },
        contentAwareCornerFill: {
          supported: false,
          requested: false,
          fallback: 'none',
          message: 'Content-aware corner fill is not requested; transparent corners remain available for later repair if rotation adds empty edges.',
        },
      },
      preview: {
        signature: 'crop-preview|10,-2,51x40|rotate=-12|aspect=free|guide=none',
        boundsLabel: '10,-2 51x40',
        aspect: { preset: 'free', ratio: null, locked: false },
        guides: { mode: 'none', verticalLines: 0, horizontalLines: 0, label: 'No composition guides' },
        straighten: { rotationDeg: -12, applied: true, direction: 'counterclockwise' },
      },
      warnings: [
        {
          code: 'delete-cropped-pixels',
          severity: 'warning',
          message: 'Delete Cropped Pixels bakes the crop into layer bitmaps and discards hidden pixels outside the crop bounds.',
        },
        {
          code: 'straighten-rotation',
          severity: 'warning',
          message: 'Straighten rotation is applied during crop commit; destructive crops bake rotated pixels into new layer bitmaps.',
        },
        {
          code: 'crop-extends-beyond-document',
          severity: 'warning',
          message: 'Crop bounds extend beyond the current document; transparent pixels may be introduced on exported edges.',
        },
      ],
    });
  });

  it('adds destructive crop signatures, preview summaries, and unsupported corner-fill warnings', () => {
    const descriptor = buildImageCropPlanningDescriptor({
      doc: { width: 1200, height: 900 },
      preview: { x: 100, y: 80, w: 640, h: 360, rotationDeg: 2.5 },
      settings: {
        aspectPreset: '16:9',
        deleteCroppedPixels: true,
        guideMode: 'thirds',
        rotationDeg: 0,
      },
      sourceBitDepth: 16,
      cornerFillMode: 'content-aware',
      printDpi: 300,
    });

    expect(descriptor?.planSignature).toBe(
      'crop-commit|destructive|src=1200x900|bounds=100,80,640x360|out=640x360|rotate=2.5|aspect=16:9|guide=thirds|corner=content-aware|bit=16',
    );
    expect(descriptor?.preview).toEqual({
      signature: 'crop-preview|100,80,640x360|rotate=2.5|aspect=16:9|guide=thirds',
      boundsLabel: '100,80 640x360',
      aspect: { preset: '16:9', ratio: 1.777778, locked: true },
      guides: { mode: 'thirds', verticalLines: 2, horizontalLines: 2, label: 'Rule of thirds' },
      straighten: { rotationDeg: 2.5, applied: true, direction: 'clockwise' },
    });
    expect(descriptor?.printGeometry).toEqual({
      dpi: 300,
      outputPixels: { width: 640, height: 360 },
      widthInches: 2.133,
      heightInches: 1.2,
      widthMm: 54.178,
      heightMm: 30.48,
      aspectLocked: true,
    });
    expect(descriptor?.sourceBinExportHandoff).toMatchObject({
      status: 'ready',
      sourceBinSafe: true,
      exportSafe: true,
    });
    expect(descriptor?.batchActionSuitability).toEqual({
      actionRecording: 'recordable-fixed-crop',
      batchApply: 'suitable-with-fixed-output-size',
      requiresPerDocumentBoundsValidation: true,
    });
    expect(descriptor?.warnings.map((warning) => warning.code)).toEqual([
      'delete-cropped-pixels',
      'straighten-rotation',
      'content-aware-corner-fill-unsupported',
      'unsupported-high-bit-depth-preservation',
    ]);
  });

  it('adds non-destructive crop signatures that show hidden-pixel preservation', () => {
    const descriptor = buildImageCropPlanningDescriptor({
      doc: { width: 500, height: 400 },
      preview: { x: 20, y: 30, w: 200, h: 100 },
      settings: { aspectPreset: 'free', deleteCroppedPixels: false, guideMode: 'grid', rotationDeg: 0 },
    });

    expect(descriptor?.planSignature).toBe(
      'crop-commit|non-destructive|src=500x400|bounds=20,30,200x100|out=200x100|rotate=0|aspect=free|guide=grid|corner=transparent|bit=8',
    );
    expect(descriptor?.preservesHiddenPixels).toBe(true);
    expect(descriptor?.preview.guides).toEqual({
      mode: 'grid',
      verticalLines: 3,
      horizontalLines: 3,
      label: '4x4 grid',
    });
  });

  it('describes aspect constraint mismatches and non-destructive preview safety metadata', () => {
    const descriptor = buildImageCropPlanningDescriptor({
      doc: { width: 1000, height: 500 },
      preview: { x: 50, y: 60, w: 360, h: 300 },
      settings: {
        aspectPreset: '4:5',
        deleteCroppedPixels: false,
        guideMode: 'grid',
        rotationDeg: 0,
      },
    });

    expect(descriptor?.aspectConstraint).toEqual({
      preset: '4:5',
      requestedRatio: 0.8,
      previewRatio: 1.2,
      locked: true,
      satisfied: false,
      constrainedPreview: { width: 360, height: 450 },
      message: 'Active crop preset 4:5 expects ratio 0.8; current preview ratio is 1.2 and should be constrained to 360x450 before apply.',
    });
    expect(descriptor?.nonDestructivePreview).toEqual({
      status: 'metadata-only-preview',
      documentMutation: 'none-until-commit',
      hiddenPixels: 'preserved-off-canvas',
      sourceLayerBitmaps: 'referenced-with-offsets',
      flattenedExportBehavior: 'visible-crop-bounds-only',
    });
    expect(descriptor?.warnings.map((warning) => warning.code)).toEqual([
      'crop-aspect-preset-mismatch',
    ]);
  });

  it('deepens unsupported perspective and content-aware corner descriptors deterministically', () => {
    const descriptor = buildImageCropPlanningDescriptor({
      doc: { width: 800, height: 600 },
      preview: { x: 40, y: 30, w: 320, h: 200, rotationDeg: 8 },
      settings: { deleteCroppedPixels: false, guideMode: 'thirds', aspectPreset: '4:3' },
      cornerFillMode: 'content-aware',
    });

    expect(descriptor).toMatchObject({
      unsupported: {
        perspectiveCrop: {
          supported: false,
          requested: false,
          message: 'Perspective crop is not available in the current local crop pipeline; only rectangular crop bounds plus straighten rotation are planned.',
        },
        contentAwareCornerFill: {
          supported: false,
          requested: true,
          fallback: 'transparent',
          message: 'Content-aware corner fill is not available for rotated crop commits; transparent corner pixels remain until a later repair step.',
        },
      },
    });
  });

  it('adds typed planning checks for perspective, corner fill, presets, preview safety, and stable signatures', () => {
    const descriptor = buildImageCropPlanningDescriptor({
      doc: { width: 800, height: 600 },
      preview: { x: 40, y: 30, w: 320, h: 240, rotationDeg: 8 },
      settings: { deleteCroppedPixels: false, guideMode: 'thirds', aspectPreset: '4:3' },
      cornerFillMode: 'content-aware',
      requestPerspectiveCrop: true,
    });

    expect(descriptor?.planningChecks).toEqual({
      perspectiveCrop: {
        status: 'unsupported',
        supported: false,
        requested: true,
        fallback: 'rectangular-crop-with-straighten',
        mutationPolicy: 'planning-only-no-document-mutation',
        warningCode: 'perspective-crop-unsupported',
        signature: 'image-crop-check:v1:perspective-crop:unsupported:requested=true:fallback=rectangular-crop-with-straighten',
      },
      contentAwareCornerFill: {
        status: 'unsupported',
        supported: false,
        requested: true,
        fallback: 'transparent-corners-preserved-for-repair',
        mutationPolicy: 'planning-only-no-document-mutation',
        warningCode: 'content-aware-corner-fill-unsupported',
        signature: 'image-crop-check:v1:content-aware-corner-fill:unsupported:requested=true:fallback=transparent-corners-preserved-for-repair',
      },
      presetManagement: {
        status: 'limited-built-in-presets-only',
        builtInPresetCount: 7,
        customPresetManagement: false,
        importExport: false,
        caveats: [
          'custom-preset-create-rename-unavailable',
          'crop-preset-import-export-unavailable',
          'built-in-aspect-presets-are-deterministic',
        ],
        signature: 'image-crop-check:v1:preset-management:limited-built-in-presets-only:count=7:custom=false:import-export=false',
      },
      nonDestructivePreviewSafety: {
        status: 'safe-overlay-preview',
        documentMutation: 'none-until-commit',
        layerMutation: 'none-overlay-only',
        hiddenPixels: 'preserved-off-canvas',
        sourceLayerBitmaps: 'referenced-with-offsets',
        flattenedExport: 'visible-crop-bounds-only',
        signature: 'image-crop-check:v1:non-destructive-preview:safe-overlay-preview:hidden=preserved-off-canvas:source=referenced-with-offsets',
      },
      signature: 'image-crop-checks:v1|perspective=unsupported:requested|corner-fill=unsupported:requested|presets=limited-built-in-presets-only|preview=safe-overlay-preview|mode=non-destructive',
    });
    expect(descriptor?.warnings.map((warning) => warning.code)).toEqual([
      'perspective-crop-unsupported',
      'straighten-rotation',
      'content-aware-corner-fill-unsupported',
    ]);
  });
});

function roundSegment(segment: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  return {
    from: { x: round2(segment.from.x), y: round2(segment.from.y) },
    to: { x: round2(segment.to.x), y: round2(segment.to.y) },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundTransform(
  transform: { kind: 'translate'; x: number; y: number } | { kind: 'rotate'; radians: number },
) {
  if (transform.kind === 'translate') {
    return {
      kind: 'translate',
      x: round2(transform.x),
      y: round2(transform.y),
    };
  }
  return {
    kind: 'rotate',
    radians: round2(transform.radians),
  };
}
