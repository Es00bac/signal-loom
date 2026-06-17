import type { CropAspectPreset, CropGuideMode, CropToolSettings, DocumentViewport, ImageDocument } from '../../types/imageEditor';
import { parseCropCustomPresetRatio } from './cropPresets';
import type { CropPreviewRect } from './tools/cropTool';
import { docRectToScreen } from './viewport';

export type ImageCropPlanningWarningCode =
  | 'delete-cropped-pixels'
  | 'straighten-rotation'
  | 'crop-extends-beyond-document'
  | 'crop-aspect-preset-mismatch'
  | 'perspective-crop-unsupported'
  | 'content-aware-corner-fill-unsupported'
  | 'unsupported-high-bit-depth-preservation';

export type ImageCropCornerFillMode = 'transparent' | 'content-aware';
export type ImageCropSourceBitDepth = 8 | 16 | 32;

export interface ImageCropPlanningWarning {
  code: ImageCropPlanningWarningCode;
  severity: 'warning';
  message: string;
}

export interface ImageCropPlanningBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface ImageCropOutsideDocumentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageCropAspectConstraint {
  preset: CropAspectPreset;
  requestedRatio: number | null;
  previewRatio: number | null;
  locked: boolean;
  satisfied: boolean;
  constrainedPreview: { width: number; height: number };
  message: string;
}

export interface ImageCropNonDestructivePreview {
  status: 'metadata-only-preview' | 'destructive-preview-warning';
  documentMutation: 'none-until-commit';
  hiddenPixels: 'preserved-off-canvas' | 'deleted-on-commit';
  sourceLayerBitmaps: 'referenced-with-offsets' | 'rebaked-on-commit';
  flattenedExportBehavior: 'visible-crop-bounds-only';
}

export interface ImageCropUnsupportedPlanningCheck {
  status: 'unsupported';
  supported: false;
  requested: boolean;
  fallback: 'rectangular-crop-with-straighten' | 'transparent-corners-preserved-for-repair' | 'none';
  mutationPolicy: 'planning-only-no-document-mutation';
  warningCode: Extract<ImageCropPlanningWarningCode, 'perspective-crop-unsupported' | 'content-aware-corner-fill-unsupported'>;
  signature: string;
}

export interface ImageCropPresetManagementPlanningCheck {
  status: 'limited-built-in-presets-only';
  builtInPresetCount: number;
  customPresetManagement: false;
  importExport: false;
  caveats: string[];
  signature: string;
}

export interface ImageCropPreviewSafetyPlanningCheck {
  status: 'safe-overlay-preview' | 'destructive-apply-warning';
  documentMutation: 'none-until-commit';
  layerMutation: 'none-overlay-only';
  hiddenPixels: 'preserved-off-canvas' | 'deleted-on-commit';
  sourceLayerBitmaps: 'referenced-with-offsets' | 'rebaked-on-commit';
  flattenedExport: 'visible-crop-bounds-only';
  signature: string;
}

export interface ImageCropPlanningChecks {
  perspectiveCrop: ImageCropUnsupportedPlanningCheck;
  contentAwareCornerFill: ImageCropUnsupportedPlanningCheck;
  presetManagement: ImageCropPresetManagementPlanningCheck;
  nonDestructivePreviewSafety: ImageCropPreviewSafetyPlanningCheck;
  signature: string;
}

export interface ImageCropPlanningDescriptor {
  kind: 'crop-commit';
  planSignature: string;
  sourceDimensions: { width: number; height: number };
  cropBounds: ImageCropPlanningBounds;
  documentIntersection: ImageCropPlanningBounds;
  outsideDocument: ImageCropOutsideDocumentBounds;
  outputDimensions: { width: number; height: number };
  deleteCroppedPixels: boolean;
  preservesHiddenPixels: boolean;
  aspectConstraint: ImageCropAspectConstraint;
  nonDestructivePreview: ImageCropNonDestructivePreview;
  printGeometry: ImageCropPrintGeometry;
  sourceBinExportHandoff: ImageCropHandoffSafety;
  batchActionSuitability: ImageCropBatchActionSuitability;
  straighten: { rotationDeg: number; applied: boolean };
  unsupported: {
    perspectiveCrop: {
      supported: false;
      requested: boolean;
      message: string;
    };
    contentAwareCornerFill: {
      supported: false;
      requested: boolean;
      fallback: 'transparent' | 'none';
      message: string;
    };
  };
  warnings: ImageCropPlanningWarning[];
  preview: ImageCropPlanningPreview;
  planningChecks: ImageCropPlanningChecks;
}

export interface ImageCropPrintGeometry {
  dpi: number;
  outputPixels: { width: number; height: number };
  widthInches: number;
  heightInches: number;
  widthMm: number;
  heightMm: number;
  aspectLocked: boolean;
}

export interface ImageCropHandoffSafety {
  status: 'ready' | 'blocked-invalid-crop';
  sourceBinSafe: boolean;
  exportSafe: boolean;
  destructiveCaveat: string;
  flattenedExportCaveat: string;
}

export interface ImageCropBatchActionSuitability {
  actionRecording: 'recordable-fixed-crop' | 'blocked-invalid-crop';
  batchApply: 'suitable-with-fixed-output-size' | 'blocked-invalid-crop';
  requiresPerDocumentBoundsValidation: boolean;
}

export interface ImageCropPlanningPreview {
  signature: string;
  boundsLabel: string;
  aspect: {
    preset: CropAspectPreset;
    ratio: number | null;
    locked: boolean;
  };
  guides: {
    mode: CropGuideMode;
    verticalLines: number;
    horizontalLines: number;
    label: string;
  };
  straighten: {
    rotationDeg: number;
    applied: boolean;
    direction: 'none' | 'clockwise' | 'counterclockwise';
  };
}

const IMAGE_CROP_BUILT_IN_PRESET_COUNT = 7;

export function buildImageCropPlanningDescriptor({
  doc,
  preview,
  settings = {},
  sourceBitDepth = 8,
  cornerFillMode = 'transparent',
  printDpi = 72,
  requestPerspectiveCrop = false,
}: {
  doc: Pick<ImageDocument, 'width' | 'height'>;
  preview: CropPreviewRect;
  settings?: Partial<Pick<CropToolSettings, 'aspectPreset' | 'deleteCroppedPixels' | 'guideMode' | 'rotationDeg'>>;
  sourceBitDepth?: ImageCropSourceBitDepth;
  cornerFillMode?: ImageCropCornerFillMode;
  printDpi?: number;
  requestPerspectiveCrop?: boolean;
}): ImageCropPlanningDescriptor | null {
  if (!Number.isFinite(preview.w) || !Number.isFinite(preview.h) || preview.w <= 0 || preview.h <= 0) {
    return null;
  }

  const sourceDimensions = {
    width: normalizeCropDimension(doc.width),
    height: normalizeCropDimension(doc.height),
  };
  const cropBounds = buildCropBounds(
    roundCropInteger(preview.x),
    roundCropInteger(preview.y),
    Math.max(1, roundCropInteger(preview.w)),
    Math.max(1, roundCropInteger(preview.h)),
  );
  const intersection = buildCropDocumentIntersection(cropBounds, sourceDimensions);
  const outsideDocument = buildOutsideDocumentBounds(cropBounds, sourceDimensions);
  const deleteCroppedPixels = settings.deleteCroppedPixels ?? false;
  const rotationDeg = normalizeCropDegrees(preview.rotationDeg ?? settings.rotationDeg ?? 0);
  const aspectPreset = settings.aspectPreset ?? 'free';
  const guideMode = settings.guideMode ?? 'none';
  const aspectConstraint = buildCropAspectConstraint({
    sourceDimensions,
    cropBounds,
    aspectPreset,
  });
  const warnings: ImageCropPlanningWarning[] = [];

  if (requestPerspectiveCrop) {
    warnings.push({
      code: 'perspective-crop-unsupported',
      severity: 'warning',
      message: 'Perspective crop is not supported by the current local crop pipeline; rectangular crop bounds plus straighten rotation are planned instead.',
    });
  }

  if (deleteCroppedPixels) {
    warnings.push({
      code: 'delete-cropped-pixels',
      severity: 'warning',
      message: 'Delete Cropped Pixels bakes the crop into layer bitmaps and discards hidden pixels outside the crop bounds.',
    });
  }

  if (rotationDeg !== 0) {
    warnings.push({
      code: 'straighten-rotation',
      severity: 'warning',
      message: deleteCroppedPixels
        ? 'Straighten rotation is applied during crop commit; destructive crops bake rotated pixels into new layer bitmaps.'
        : 'Straighten rotation is applied during crop commit while retained layers keep editable hidden pixels for later reframing.',
    });
  }

  if (outsideDocument.left > 0 || outsideDocument.top > 0 || outsideDocument.right > 0 || outsideDocument.bottom > 0) {
    warnings.push({
      code: 'crop-extends-beyond-document',
      severity: 'warning',
      message: 'Crop bounds extend beyond the current document; transparent pixels may be introduced on exported edges.',
    });
  }

  if (!aspectConstraint.satisfied) {
    warnings.push({
      code: 'crop-aspect-preset-mismatch',
      severity: 'warning',
      message: aspectConstraint.message,
    });
  }

  if (cornerFillMode === 'content-aware') {
    warnings.push({
      code: 'content-aware-corner-fill-unsupported',
      severity: 'warning',
      message: 'Content-aware corner fill for rotated crop edges is not supported by the current local crop pipeline; transparent fill is used instead.',
    });
  }

  if (sourceBitDepth > 8) {
    warnings.push({
      code: 'unsupported-high-bit-depth-preservation',
      severity: 'warning',
      message: `${sourceBitDepth}-bit per-channel source precision cannot be preserved by the current 8-bit RGBA browser crop pipeline.`,
    });
  }

  const previewDescriptor = buildCropPlanningPreview({
    sourceDimensions,
    cropBounds,
    aspectPreset,
    guideMode,
    rotationDeg,
  });
  const printGeometry = buildCropPrintGeometry({
    width: cropBounds.width,
    height: cropBounds.height,
    dpi: printDpi,
    aspectLocked: previewDescriptor.aspect.locked,
  });

  return {
    kind: 'crop-commit',
    planSignature: buildCropPlanSignature({
      sourceDimensions,
      cropBounds,
      outputDimensions: { width: cropBounds.width, height: cropBounds.height },
      deleteCroppedPixels,
      rotationDeg,
      aspectPreset,
      guideMode,
      cornerFillMode,
      sourceBitDepth,
    }),
    sourceDimensions,
    cropBounds,
    documentIntersection: intersection,
    outsideDocument,
    outputDimensions: { width: cropBounds.width, height: cropBounds.height },
    deleteCroppedPixels,
    preservesHiddenPixels: !deleteCroppedPixels,
    aspectConstraint,
    nonDestructivePreview: buildCropNonDestructivePreview(deleteCroppedPixels),
    printGeometry,
    sourceBinExportHandoff: {
      status: 'ready',
      sourceBinSafe: true,
      exportSafe: true,
      destructiveCaveat: deleteCroppedPixels
        ? 'Source Bin handoff receives the committed cropped pixels; discarded hidden pixels are not recoverable from the exported asset.'
        : 'Source Bin handoff can preserve the editor document state, while flattened exports only contain the visible crop bounds.',
      flattenedExportCaveat: 'Export handoff uses the crop output dimensions and should validate file format support before writing.',
    },
    batchActionSuitability: {
      actionRecording: 'recordable-fixed-crop',
      batchApply: 'suitable-with-fixed-output-size',
      requiresPerDocumentBoundsValidation: true,
    },
    straighten: { rotationDeg, applied: rotationDeg !== 0 },
    unsupported: {
      perspectiveCrop: {
        supported: false,
        requested: requestPerspectiveCrop,
        message: 'Perspective crop is not available in the current local crop pipeline; only rectangular crop bounds plus straighten rotation are planned.',
      },
      contentAwareCornerFill: {
        supported: false,
        requested: cornerFillMode === 'content-aware',
        fallback: cornerFillMode === 'content-aware' ? 'transparent' : 'none',
        message: cornerFillMode === 'content-aware'
          ? 'Content-aware corner fill is not available for rotated crop commits; transparent corner pixels remain until a later repair step.'
          : 'Content-aware corner fill is not requested; transparent corners remain available for later repair if rotation adds empty edges.',
      },
    },
    warnings,
    preview: previewDescriptor,
    planningChecks: buildImageCropPlanningChecks({
      requestPerspectiveCrop,
      cornerFillMode,
      deleteCroppedPixels,
    }),
  };
}

function buildCropPrintGeometry({
  width,
  height,
  dpi,
  aspectLocked,
}: {
  width: number;
  height: number;
  dpi: number;
  aspectLocked: boolean;
}): ImageCropPrintGeometry {
  const normalizedDpi = normalizeCropDpi(dpi);
  const widthInches = roundCropPrintValue(width / normalizedDpi);
  const heightInches = roundCropPrintValue(height / normalizedDpi);
  return {
    dpi: normalizedDpi,
    outputPixels: { width, height },
    widthInches,
    heightInches,
    widthMm: roundCropPrintValue(widthInches * 25.4),
    heightMm: roundCropPrintValue(heightInches * 25.4),
    aspectLocked,
  };
}

function buildCropAspectConstraint({
  sourceDimensions,
  cropBounds,
  aspectPreset,
}: {
  sourceDimensions: { width: number; height: number };
  cropBounds: ImageCropPlanningBounds;
  aspectPreset: CropAspectPreset;
}): ImageCropAspectConstraint {
  const requestedRatio = resolveCropAspectRatio(sourceDimensions, aspectPreset);
  const previewRatio = cropBounds.height > 0
    ? roundCropRatio(cropBounds.width / cropBounds.height)
    : null;
  const locked = requestedRatio !== null;
  const constrainedPreview = requestedRatio === null
    ? { width: cropBounds.width, height: cropBounds.height }
    : buildConstrainedCropPreviewDimensions(cropBounds.width, cropBounds.height, requestedRatio);
  const roundedRequestedRatio = requestedRatio === null ? null : roundCropRatio(requestedRatio);
  const satisfied = !locked || (
    previewRatio !== null &&
    roundedRequestedRatio !== null &&
    Math.abs(previewRatio - roundedRequestedRatio) <= 0.000001
  );

  return {
    preset: aspectPreset,
    requestedRatio: roundedRequestedRatio,
    previewRatio,
    locked,
    satisfied,
    constrainedPreview,
    message: buildCropAspectConstraintMessage({
      aspectPreset,
      requestedRatio: roundedRequestedRatio,
      previewRatio,
      constrainedPreview,
      satisfied,
    }),
  };
}

function buildCropAspectConstraintMessage({
  aspectPreset,
  requestedRatio,
  previewRatio,
  constrainedPreview,
  satisfied,
}: {
  aspectPreset: CropAspectPreset;
  requestedRatio: number | null;
  previewRatio: number | null;
  constrainedPreview: { width: number; height: number };
  satisfied: boolean;
}): string {
  if (requestedRatio === null) {
    return 'Free crop aspect has no locked ratio; preview dimensions can be adjusted independently.';
  }
  if (satisfied) {
    return `Active crop preset ${aspectPreset} is satisfied by the current preview.`;
  }
  return `Active crop preset ${aspectPreset} expects ratio ${requestedRatio}; current preview ratio is ${previewRatio ?? 'unknown'} and should be constrained to ${constrainedPreview.width}x${constrainedPreview.height} before apply.`;
}

function buildConstrainedCropPreviewDimensions(
  width: number,
  height: number,
  aspectRatio: number,
): { width: number; height: number } {
  const widthDrivenHeight = width / aspectRatio;
  const heightDrivenWidth = height * aspectRatio;
  if (widthDrivenHeight >= height) {
    return {
      width,
      height: Math.max(1, roundCropInteger(widthDrivenHeight)),
    };
  }
  return {
    width: Math.max(1, roundCropInteger(heightDrivenWidth)),
    height,
  };
}

function buildCropNonDestructivePreview(deleteCroppedPixels: boolean): ImageCropNonDestructivePreview {
  return deleteCroppedPixels
    ? {
      status: 'destructive-preview-warning',
      documentMutation: 'none-until-commit',
      hiddenPixels: 'deleted-on-commit',
      sourceLayerBitmaps: 'rebaked-on-commit',
      flattenedExportBehavior: 'visible-crop-bounds-only',
    }
    : {
      status: 'metadata-only-preview',
      documentMutation: 'none-until-commit',
      hiddenPixels: 'preserved-off-canvas',
      sourceLayerBitmaps: 'referenced-with-offsets',
      flattenedExportBehavior: 'visible-crop-bounds-only',
    };
}

function buildImageCropPlanningChecks({
  requestPerspectiveCrop,
  cornerFillMode,
  deleteCroppedPixels,
}: {
  requestPerspectiveCrop: boolean;
  cornerFillMode: ImageCropCornerFillMode;
  deleteCroppedPixels: boolean;
}): ImageCropPlanningChecks {
  const perspectiveCrop = buildImageCropUnsupportedPlanningCheck({
    feature: 'perspective-crop',
    requested: requestPerspectiveCrop,
    fallback: 'rectangular-crop-with-straighten',
    warningCode: 'perspective-crop-unsupported',
  });
  const contentAwareCornerFill = buildImageCropUnsupportedPlanningCheck({
    feature: 'content-aware-corner-fill',
    requested: cornerFillMode === 'content-aware',
    fallback: cornerFillMode === 'content-aware' ? 'transparent-corners-preserved-for-repair' : 'none',
    warningCode: 'content-aware-corner-fill-unsupported',
  });
  const presetManagement = buildImageCropPresetManagementCheck();
  const nonDestructivePreviewSafety = buildImageCropPreviewSafetyCheck(deleteCroppedPixels);

  return {
    perspectiveCrop,
    contentAwareCornerFill,
    presetManagement,
    nonDestructivePreviewSafety,
    signature: buildImageCropPlanningChecksSignature({
      perspectiveRequested: requestPerspectiveCrop,
      cornerFillRequested: cornerFillMode === 'content-aware',
      previewStatus: nonDestructivePreviewSafety.status,
      mode: deleteCroppedPixels ? 'destructive' : 'non-destructive',
    }),
  };
}

function buildImageCropUnsupportedPlanningCheck({
  feature,
  requested,
  fallback,
  warningCode,
}: {
  feature: 'perspective-crop' | 'content-aware-corner-fill';
  requested: boolean;
  fallback: ImageCropUnsupportedPlanningCheck['fallback'];
  warningCode: ImageCropUnsupportedPlanningCheck['warningCode'];
}): ImageCropUnsupportedPlanningCheck {
  return {
    status: 'unsupported',
    supported: false,
    requested,
    fallback,
    mutationPolicy: 'planning-only-no-document-mutation',
    warningCode,
    signature: `image-crop-check:v1:${feature}:unsupported:requested=${requested}:fallback=${fallback}`,
  };
}

function buildImageCropPresetManagementCheck(): ImageCropPresetManagementPlanningCheck {
  return {
    status: 'limited-built-in-presets-only',
    builtInPresetCount: IMAGE_CROP_BUILT_IN_PRESET_COUNT,
    customPresetManagement: false,
    importExport: false,
    caveats: [
      'custom-preset-create-rename-unavailable',
      'crop-preset-import-export-unavailable',
      'built-in-aspect-presets-are-deterministic',
    ],
    signature: `image-crop-check:v1:preset-management:limited-built-in-presets-only:count=${IMAGE_CROP_BUILT_IN_PRESET_COUNT}:custom=false:import-export=false`,
  };
}

function buildImageCropPreviewSafetyCheck(deleteCroppedPixels: boolean): ImageCropPreviewSafetyPlanningCheck {
  const status = deleteCroppedPixels ? 'destructive-apply-warning' : 'safe-overlay-preview';
  const hiddenPixels = deleteCroppedPixels ? 'deleted-on-commit' : 'preserved-off-canvas';
  const sourceLayerBitmaps = deleteCroppedPixels ? 'rebaked-on-commit' : 'referenced-with-offsets';

  return {
    status,
    documentMutation: 'none-until-commit',
    layerMutation: 'none-overlay-only',
    hiddenPixels,
    sourceLayerBitmaps,
    flattenedExport: 'visible-crop-bounds-only',
    signature: `image-crop-check:v1:non-destructive-preview:${status}:hidden=${hiddenPixels}:source=${sourceLayerBitmaps}`,
  };
}

function buildCropPlanningPreview({
  sourceDimensions,
  cropBounds,
  aspectPreset,
  guideMode,
  rotationDeg,
}: {
  sourceDimensions: { width: number; height: number };
  cropBounds: ImageCropPlanningBounds;
  aspectPreset: CropAspectPreset;
  guideMode: CropGuideMode;
  rotationDeg: number;
}): ImageCropPlanningPreview {
  const aspectRatio = resolveCropAspectRatio(sourceDimensions, aspectPreset);
  return {
    signature: [
      'crop-preview',
      `${cropBounds.x},${cropBounds.y},${cropBounds.width}x${cropBounds.height}`,
      `rotate=${rotationDeg}`,
      `aspect=${aspectPreset}`,
      `guide=${guideMode}`,
    ].join('|'),
    boundsLabel: `${cropBounds.x},${cropBounds.y} ${cropBounds.width}x${cropBounds.height}`,
    aspect: {
      preset: aspectPreset,
      ratio: aspectRatio === null ? null : roundCropRatio(aspectRatio),
      locked: aspectRatio !== null,
    },
    guides: summarizeCropPlanningGuides(guideMode),
    straighten: {
      rotationDeg,
      applied: rotationDeg !== 0,
      direction: rotationDeg > 0 ? 'clockwise' : rotationDeg < 0 ? 'counterclockwise' : 'none',
    },
  };
}

function buildCropPlanSignature({
  sourceDimensions,
  cropBounds,
  outputDimensions,
  deleteCroppedPixels,
  rotationDeg,
  aspectPreset,
  guideMode,
  cornerFillMode,
  sourceBitDepth,
}: {
  sourceDimensions: { width: number; height: number };
  cropBounds: ImageCropPlanningBounds;
  outputDimensions: { width: number; height: number };
  deleteCroppedPixels: boolean;
  rotationDeg: number;
  aspectPreset: CropAspectPreset;
  guideMode: CropGuideMode;
  cornerFillMode: ImageCropCornerFillMode;
  sourceBitDepth: ImageCropSourceBitDepth;
}): string {
  return [
    'crop-commit',
    deleteCroppedPixels ? 'destructive' : 'non-destructive',
    `src=${sourceDimensions.width}x${sourceDimensions.height}`,
    `bounds=${cropBounds.x},${cropBounds.y},${cropBounds.width}x${cropBounds.height}`,
    `out=${outputDimensions.width}x${outputDimensions.height}`,
    `rotate=${rotationDeg}`,
    `aspect=${aspectPreset}`,
    `guide=${guideMode}`,
    `corner=${cornerFillMode}`,
    `bit=${sourceBitDepth}`,
  ].join('|');
}

function buildImageCropPlanningChecksSignature({
  perspectiveRequested,
  cornerFillRequested,
  previewStatus,
  mode,
}: {
  perspectiveRequested: boolean;
  cornerFillRequested: boolean;
  previewStatus: ImageCropPreviewSafetyPlanningCheck['status'];
  mode: 'destructive' | 'non-destructive';
}): string {
  return [
    'image-crop-checks:v1',
    `perspective=unsupported:${perspectiveRequested ? 'requested' : 'not-requested'}`,
    `corner-fill=unsupported:${cornerFillRequested ? 'requested' : 'not-requested'}`,
    'presets=limited-built-in-presets-only',
    `preview=${previewStatus}`,
    `mode=${mode}`,
  ].join('|');
}

export function drawCropPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  {
    canvasSize,
    guideMode,
    preview,
    viewport,
  }: {
    canvasSize: { width: number; height: number };
    guideMode: CropGuideMode;
    preview: CropPreviewRect;
    viewport: DocumentViewport;
  },
): void {
  const rect = docRectToScreen({
    x: preview.x,
    y: preview.y,
    width: preview.w,
    height: preview.h,
  }, viewport);

  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
  if (rect.y > 0) {
    ctx.fillRect(0, 0, canvasSize.width, rect.y);
  }
  if (rect.x > 0) {
    ctx.fillRect(0, rect.y, rect.x, rect.height);
  }
  if (rect.x + rect.width < canvasSize.width) {
    ctx.fillRect(rect.x + rect.width, rect.y, canvasSize.width - (rect.x + rect.width), rect.height);
  }
  if (rect.y + rect.height < canvasSize.height) {
    ctx.fillRect(0, rect.y + rect.height, canvasSize.width, canvasSize.height - (rect.y + rect.height));
  }

  ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  drawCropBoundaryAndGuides(ctx, rect, guideMode, preview.rotationDeg ?? 0);
  ctx.restore();
}

function buildCropBounds(x: number, y: number, width: number, height: number): ImageCropPlanningBounds {
  return {
    x,
    y,
    width,
    height,
    right: roundCropInteger(x + width),
    bottom: roundCropInteger(y + height),
  };
}

function buildCropDocumentIntersection(
  bounds: ImageCropPlanningBounds,
  sourceDimensions: { width: number; height: number },
): ImageCropPlanningBounds {
  const x = clampCropInteger(bounds.x, 0, sourceDimensions.width);
  const y = clampCropInteger(bounds.y, 0, sourceDimensions.height);
  const right = clampCropInteger(bounds.right, 0, sourceDimensions.width);
  const bottom = clampCropInteger(bounds.bottom, 0, sourceDimensions.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
    right,
    bottom,
  };
}

function buildOutsideDocumentBounds(
  bounds: ImageCropPlanningBounds,
  sourceDimensions: { width: number; height: number },
): ImageCropOutsideDocumentBounds {
  return {
    left: Math.max(0, -bounds.x),
    top: Math.max(0, -bounds.y),
    right: Math.max(0, bounds.right - sourceDimensions.width),
    bottom: Math.max(0, bounds.bottom - sourceDimensions.height),
  };
}

function normalizeCropDimension(value: number): number {
  return Math.max(1, roundCropInteger(value));
}

function clampCropInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCropDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return roundCropValue(normalized);
}

function normalizeCropDpi(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 72;
}

function roundCropInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCropValue(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCropRatio(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCropPrintValue(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveCropAspectRatio(
  sourceDimensions: { width: number; height: number },
  preset: CropAspectPreset,
): number | null {
  switch (preset) {
    case 'free':
      return null;
    case 'original':
      return sourceDimensions.height > 0 ? sourceDimensions.width / sourceDimensions.height : null;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '3:2':
      return 3 / 2;
    case '4:5':
      return 4 / 5;
    case '16:9':
      return 16 / 9;
    default:
      return parseCropCustomPresetRatio(preset);
  }
}

function summarizeCropPlanningGuides(guideMode: CropGuideMode): ImageCropPlanningPreview['guides'] {
  if (guideMode === 'thirds') {
    return { mode: guideMode, verticalLines: 2, horizontalLines: 2, label: 'Rule of thirds' };
  }
  if (guideMode === 'grid') {
    return { mode: guideMode, verticalLines: 3, horizontalLines: 3, label: '4x4 grid' };
  }
  return { mode: guideMode, verticalLines: 0, horizontalLines: 0, label: 'No composition guides' };
}

function drawCropBoundaryAndGuides(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  guideMode: CropGuideMode,
  rotationDeg: number,
): void {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const shouldRotate = Number.isFinite(rotationDeg) && rotationDeg !== 0;

  ctx.save();
  if (shouldRotate) {
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#020617';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));

  ctx.strokeStyle = '#67e8f9';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  ctx.setLineDash([]);

  drawCropGuides(ctx, rect, guideMode);
  ctx.restore();
}

function drawCropGuides(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  guideMode: CropGuideMode,
): void {
  if (guideMode === 'none') return;
  const divisions = guideMode === 'grid' ? 4 : 3;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.8)';

  for (let index = 1; index < divisions; index += 1) {
    const x = rect.x + (rect.width * index) / divisions;
    ctx.beginPath();
    ctx.moveTo(x, rect.y + 0.5);
    ctx.lineTo(x, rect.y + Math.max(0, rect.height - 0.5));
    ctx.stroke();
  }

  for (let index = 1; index < divisions; index += 1) {
    const y = rect.y + (rect.height * index) / divisions;
    ctx.beginPath();
    ctx.moveTo(rect.x + 0.5, y);
    ctx.lineTo(rect.x + Math.max(0, rect.width - 0.5), y);
    ctx.stroke();
  }

  ctx.restore();
}
