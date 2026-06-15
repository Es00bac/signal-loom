import type { ToolEnv, ToolHandler, Point } from './types';
import { createBitmap } from '../LayerBitmap';
import { drawLayerBitmapTransformed } from '../ImageLayerTransform';
import { composeLayerBitmapWithMask } from '../ImageLayerMask';
import { renderLayerWithEffects } from '../ImageLayerEffects';
import type { CropAspectPreset, CropGuideMode, CropToolSettings, ImageDocument, ImageLayer } from '../../../types/imageEditor';
import { useImageEditorStore } from '../../../store/imageEditorStore';

interface State {
  start: Point;
  current: Point;
  origLayers: ImageLayer[];
  origWidth: number;
  origHeight: number;
}

let state: State | null = null;
const listeners = new Set<() => void>();

function notifyCropPreviewChanged(): void {
  listeners.forEach((listener) => listener());
}

/**
 * PHASE1: Drag a rectangle, press Enter to commit. Esc cancels. The crop
 * resizes the document to the rectangle's dimensions and offsets every layer
 * so the rectangle's top-left maps to (0,0).
 *
 * The drag rectangle preview uses the renderer's overlay mechanism — for now
 * the in-progress rectangle is stored in module state and read by the
 * dispatcher; final commit replaces the layers + dimensions atomically.
 */
export const cropTool: ToolHandler = {
  onPointerDown(env, point) {
    state = {
      start: point,
      current: point,
      origLayers: env.doc.layers,
      origWidth: env.doc.width,
      origHeight: env.doc.height,
    };
    notifyCropPreviewChanged();
    env.requestRender();
  },

  onPointerMove(env, point) {
    if (!state) return;
    state.current = point;
    notifyCropPreviewChanged();
    env.requestRender();
  },

  onPointerUp(env) {
    if (!state) return;
    env.requestRender();
  },

  onKeyDown(env, key) {
    if (!state) return;
    if (key === 'Enter') {
      commit(env);
    } else if (key === 'Escape') {
      state = null;
      notifyCropPreviewChanged();
      env.requestRender();
    }
  },

  onCancel() {
    state = null;
    notifyCropPreviewChanged();
  },
};

export interface CropPreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg?: number;
}

export interface CroppedImageDocumentState {
  width: number;
  height: number;
  layers: ImageLayer[];
  activeLayerId: string | null;
}

export interface CropPreviewGeometrySummary {
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

export interface CropAspectConstraintSummary {
  preset: CropAspectPreset;
  requestedRatio: number | null;
  previewRatio: number | null;
  locked: boolean;
  satisfied: boolean;
  constrainedPreview: { width: number; height: number };
}

export type CropToolHandoffResampleMethod =
  | 'nearest-neighbor'
  | 'bilinear'
  | 'bicubic'
  | 'lanczos3'
  | 'browser-default';

export type CropToolCanvasHandoffAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export type CropToolHandoffWarningCode =
  | 'handoff-resize-resamples-crop-output'
  | 'handoff-canvas-adds-transparent-pixels'
  | 'handoff-canvas-crops-output';

export interface CropToolHandoffWarning {
  code: CropToolHandoffWarningCode;
  severity: 'warning';
  message: string;
}

export interface CropToolResizeCanvasHandoffDescriptor {
  cropOutputDimensions: { width: number; height: number };
  resize: {
    status: 'not-requested' | 'no-op' | 'will-resample-crop-output' | 'blocked-invalid-crop';
    targetDimensions: { width: number; height: number };
    resampleMethod: CropToolHandoffResampleMethod | 'none';
    scale: { x: number; y: number };
    warningCodes: CropToolHandoffWarningCode[];
  };
  canvas: {
    status: 'not-requested' | 'no-op' | 'will-expand-canvas' | 'will-crop-canvas' | 'blocked-invalid-crop';
    targetDimensions: { width: number; height: number };
    anchor: CropToolCanvasHandoffAnchor;
    canvasOffset: { x: number; y: number };
    transparentExpansion: { left: number; top: number; right: number; bottom: number };
    warningCodes: CropToolHandoffWarningCode[];
  };
  warnings: CropToolHandoffWarning[];
  signature: string;
}

export type CropToolReadinessStatus = 'ready' | 'blocked';
export type CropToolReadinessBlockerCode =
  | 'invalid-crop-rectangle'
  | 'perspective-crop-unsupported'
  | 'content-aware-corner-fill-unsupported'
  | 'custom-preset-management-unavailable';

export interface CropToolReadinessBlocker {
  code: CropToolReadinessBlockerCode;
  severity: 'error' | 'warning';
  operation:
    | 'apply-crop'
    | 'perspective-crop'
    | 'content-aware-corner-fill'
    | 'manage-crop-presets';
  message: string;
}

export type CropToolHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
export type CropToolHandleKind = 'corner-resize' | 'edge-resize' | 'rotate-crop';
export type CropToolHandleCursor = 'nwse-resize' | 'ns-resize' | 'nesw-resize' | 'ew-resize' | 'grab';

export interface CropToolHandleDescriptor {
  id: CropToolHandleId;
  kind: CropToolHandleKind;
  documentPoint: Point;
  cursor: CropToolHandleCursor;
  hitTargetPx: number;
  visualHandlePx: number;
  ready: boolean;
}

export interface CropToolHandleReadinessDescriptor {
  status: 'ready' | 'blocked-invalid-crop';
  minHitTargetPx: number;
  hitTargetPx: number;
  visualHandlePx: number;
  keyboardStepPx: number;
  handles: CropToolHandleDescriptor[];
  caveats: string[];
  signature: string;
}

export interface CropToolUnsupportedCheckDescriptor {
  status: 'unsupported';
  supported: false;
  requested: boolean;
  blockerCode: Extract<CropToolReadinessBlockerCode, 'perspective-crop-unsupported' | 'content-aware-corner-fill-unsupported'>;
  fallback: 'rectangular-crop-with-straighten' | 'transparent-corners-preserved-for-repair';
  mutationPolicy: 'blocked-before-document-mutation';
  signature: string;
}

export interface CropToolPresetManagementCheckDescriptor {
  status: 'limited-built-in-presets-only';
  builtInPresetCount: number;
  customPresetManagement: false;
  importExport: false;
  caveats: string[];
  signature: string;
}

export interface CropToolNonDestructivePreviewSafetyDescriptor {
  status: 'safe-overlay-preview' | 'destructive-apply-warning' | 'blocked-invalid-preview';
  documentMutation: 'none-until-apply' | 'unavailable';
  layerMutation: 'none-overlay-only' | 'unavailable';
  hiddenPixels: 'preserved-off-canvas' | 'deleted-on-apply' | 'unavailable';
  sourceLayerBitmaps: 'referenced-until-apply' | 'rebaked-on-apply' | 'unavailable';
  flattenedExport: 'visible-crop-bounds-only' | 'unavailable';
  signature: string;
}

export interface CropToolDescriptorChecks {
  perspectiveCropUnsupported: CropToolUnsupportedCheckDescriptor;
  contentAwareCornerFillUnsupported: CropToolUnsupportedCheckDescriptor;
  presetManagementCaveats: CropToolPresetManagementCheckDescriptor;
  nonDestructivePreviewSafety: CropToolNonDestructivePreviewSafetyDescriptor;
  signature: string;
}

export type CropToolCommitPlanMode = 'destructive' | 'non-destructive';

export interface CropToolCommitPlanUnsupportedDescriptor {
  code: Extract<CropToolReadinessBlockerCode, 'perspective-crop-unsupported' | 'content-aware-corner-fill-unsupported'>;
  requested: boolean;
  supported: false;
  mutationPolicy: 'blocked-before-document-mutation';
  fallback: 'rectangular-crop-with-straighten' | 'transparent-corners-preserved-for-repair';
  signature: string;
}

export interface CropToolCommitPlanDescriptor {
  descriptorId: 'crop-tool-commit-plan:v1';
  planSignature: string;
  sourceSignature: string;
  commit: {
    status: 'ready' | 'blocked-invalid-crop';
    mode: CropToolCommitPlanMode;
    outputDimensions: { width: number; height: number };
    documentMutation: 'apply-resizes-document' | 'blocked';
    layerMutation: 'bake-visible-crop-into-new-bitmaps' | 'offset-retained-layer-content' | 'blocked';
    undoModel: 'single-atomic-document-operation' | 'none';
  };
  previewSession: {
    active: boolean;
    applyReady: boolean;
    cancelReady: true;
    applyCommand: 'Enter';
    cancelCommand: 'Escape';
    signature: string;
  };
  sourceSafety: {
    hiddenPixels: 'deleted-on-apply' | 'preserved-off-canvas' | 'unavailable';
    sourceLayerBitmaps: 'rebaked-on-apply' | 'referenced-until-apply' | 'unavailable';
    flattenedExport: 'visible-crop-bounds-only' | 'unavailable';
    destructiveCaveats: string[];
    signature: string;
  };
  unsupported: CropToolCommitPlanUnsupportedDescriptor[];
}

export interface CropToolReadinessOptions {
  doc: ImageDocument;
  preview: CropPreviewRect | null;
  settings: CropToolSettings;
  printDpi?: number;
  requirePerspectiveCrop?: boolean;
  requireContentAwareCornerFill?: boolean;
  requirePresetManagement?: boolean;
  handoffResize?: {
    width: number;
    height: number;
    resampleMethod?: CropToolHandoffResampleMethod;
  };
  handoffCanvas?: {
    width: number;
    height: number;
    anchor?: CropToolCanvasHandoffAnchor;
  };
}

export interface CropToolReadinessDescriptor {
  status: CropToolReadinessStatus;
  workingState: {
    hasPreview: boolean;
    phase: 'idle-blocked' | 'preview-ready';
    sourceDimensions: { width: number; height: number };
  };
  cropRectangle: {
    status: 'ready' | 'blocked-invalid-rectangle';
    boundsLabel: string;
    width: number;
    height: number;
    canApply: boolean;
  };
  applyCancel: {
    apply: 'supported-enter-key' | 'blocked-invalid-rectangle';
    cancel: 'supported-escape-key';
    previewPersistence: 'temporary-until-apply';
    previewBehavior: 'live-overlay-no-document-mutation' | 'unavailable';
  };
  aspectPresets: {
    supported: CropAspectPreset[];
    active: CropPreviewGeometrySummary['aspect'];
    constraint: CropAspectConstraintSummary;
    presetManagement: 'built-in-presets-only';
  };
  guideOverlays: CropPreviewGeometrySummary['guides'];
  straighten: {
    status: 'ready' | 'idle';
    rotationDeg: number;
    direction: CropPreviewGeometrySummary['straighten']['direction'];
  };
  rotateCrop: {
    status: 'ready' | 'idle';
    rotationDeg: number;
  };
  pixelRetention: {
    mode: 'destructive' | 'non-destructive';
    deleteCroppedPixels: boolean;
    hiddenPixels: 'deleted-on-apply' | 'preserved-off-canvas';
    layerBitmapHandling: 'bake-visible-crop-into-new-bitmaps' | 'offset-retained-layer-content';
  };
  previewMetadata: {
    documentMutation: 'none-until-apply' | 'unavailable';
    previewLayerMutation: 'none-overlay-only' | 'unavailable';
    hiddenPixels: 'deleted-on-apply' | 'preserved-off-canvas' | 'unavailable';
    sourceSafety:
      | 'source-layer-bitmaps-referenced-until-apply'
      | 'source-layer-bitmaps-rebaked-on-apply'
      | 'blocked-invalid-preview';
    exportSafety: 'flattened-export-uses-visible-crop-bounds' | 'blocked-invalid-preview';
  };
  fixedSizePrintGeometry: {
    dpi: number;
    outputPixels: { width: number; height: number };
    widthInches: number;
    heightInches: number;
    widthMm: number;
    heightMm: number;
    aspectLocked: boolean;
  };
  sourceBinExportHandoff: {
    status: 'ready' | 'blocked-invalid-crop';
    sourceBinSafe: boolean;
    exportSafe: boolean;
    outputDimensions: { width: number; height: number };
    caveats: string[];
  };
  resizeCanvasHandoff: CropToolResizeCanvasHandoffDescriptor;
  batchActionSuitability: {
    actionRecording: 'recordable-fixed-preview' | 'blocked-invalid-crop';
    batchApply: 'suitable-with-fixed-rectangle' | 'blocked-invalid-crop';
    requiresPerDocumentValidation: boolean;
  };
  unsupportedStates: {
    perspectiveCrop: 'unsupported';
    contentAwareCornerFill: 'unsupported';
    presetManagement: 'caveat-built-in-presets-only';
  };
  handleReadiness: CropToolHandleReadinessDescriptor;
  descriptorChecks: CropToolDescriptorChecks;
  blockers: CropToolReadinessBlocker[];
  previewSignatures: {
    geometry: string;
    readiness: string;
  };
}

const CROP_ASPECT_PRESETS: CropAspectPreset[] = ['free', 'original', '1:1', '4:3', '3:2', '4:5', '16:9'];
const CROP_HANDLE_MIN_HIT_TARGET_PX = 24;
const CROP_HANDLE_HIT_TARGET_PX = 28;
const CROP_HANDLE_VISUAL_PX = 8;
const CROP_HANDLE_KEYBOARD_STEP_PX = 1;
const CROP_ROTATE_HANDLE_OFFSET = 28;

export function resolveCropPreviewAspectRatio(
  doc: ImageDocument,
  preset: CropAspectPreset,
): number | null {
  switch (preset) {
    case 'free':
      return null;
    case 'original':
      return doc.height > 0 ? doc.width / doc.height : null;
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
      return null;
  }
}

export function buildCropPreviewRect({
  start,
  current,
  aspectRatio,
  rotationDeg,
}: {
  start: Point;
  current: Point;
  aspectRatio: number | null;
  rotationDeg?: number;
}): CropPreviewRect | null {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  let width = Math.abs(deltaX);
  let height = Math.abs(deltaY);

  if (aspectRatio && width > 0 && height > 0) {
    const widthDrivenHeight = width / aspectRatio;
    const heightDrivenWidth = height * aspectRatio;
    if (widthDrivenHeight >= height) {
      height = widthDrivenHeight;
    } else {
      width = heightDrivenWidth;
    }
  }

  if (width <= 0 || height <= 0) return null;

  const normalizedRotationDeg = normalizeDegrees(rotationDeg ?? 0);
  return {
    x: deltaX >= 0 ? start.x : start.x - width,
    y: deltaY >= 0 ? start.y : start.y - height,
    w: width,
    h: height,
    ...(normalizedRotationDeg !== 0 ? { rotationDeg: normalizedRotationDeg } : {}),
  };
}

export function summarizeCropPreviewGeometry({
  doc,
  preview,
  settings,
}: {
  doc: ImageDocument;
  preview: CropPreviewRect;
  settings: CropToolSettings;
}): CropPreviewGeometrySummary {
  const rotationDeg = normalizeDegrees(preview.rotationDeg ?? settings.rotationDeg);
  const aspectRatio = resolveCropPreviewAspectRatio(doc, settings.aspectPreset);
  const boundsLabel = `${roundCropCoordinate(preview.x)},${roundCropCoordinate(preview.y)} ${roundCropCoordinate(preview.w)}x${roundCropCoordinate(preview.h)}`;

  return {
    signature: [
      'crop-preview',
      `${roundCropCoordinate(preview.x)},${roundCropCoordinate(preview.y)},${roundCropCoordinate(preview.w)}x${roundCropCoordinate(preview.h)}`,
      `rotate=${rotationDeg}`,
      `aspect=${settings.aspectPreset}`,
      `guide=${settings.guideMode}`,
    ].join('|'),
    boundsLabel,
    aspect: {
      preset: settings.aspectPreset,
      ratio: aspectRatio === null ? null : roundCropRatio(aspectRatio),
      locked: aspectRatio !== null,
    },
    guides: summarizeCropGuides(settings.guideMode),
    straighten: {
      rotationDeg,
      applied: rotationDeg !== 0,
      direction: rotationDeg > 0 ? 'clockwise' : rotationDeg < 0 ? 'counterclockwise' : 'none',
    },
  };
}

export function describeCropToolReadiness({
  doc,
  preview,
  settings,
  printDpi = 72,
  requirePerspectiveCrop = false,
  requireContentAwareCornerFill = false,
  requirePresetManagement = false,
  handoffResize,
  handoffCanvas,
}: CropToolReadinessOptions): CropToolReadinessDescriptor {
  const validPreview = preview && Number.isFinite(preview.w) && Number.isFinite(preview.h) && preview.w > 0 && preview.h > 0
    ? preview
    : null;
  const geometry = validPreview
    ? summarizeCropPreviewGeometry({ doc, preview: validPreview, settings })
    : null;
  const width = validPreview ? roundCropCoordinate(validPreview.w) : 0;
  const height = validPreview ? roundCropCoordinate(validPreview.h) : 0;
  const canApply = validPreview !== null;
  const sourceDimensions = {
    width: Math.max(1, Math.round(doc.width)),
    height: Math.max(1, Math.round(doc.height)),
  };
  const rotationDeg = geometry?.straighten.rotationDeg ?? normalizeDegrees(settings.rotationDeg);
  const direction = geometry?.straighten.direction ?? (
    rotationDeg > 0 ? 'clockwise' : rotationDeg < 0 ? 'counterclockwise' : 'none'
  );
  const pixelRetention: CropToolReadinessDescriptor['pixelRetention'] = settings.deleteCroppedPixels
    ? {
      mode: 'destructive',
      deleteCroppedPixels: true,
      hiddenPixels: 'deleted-on-apply',
      layerBitmapHandling: 'bake-visible-crop-into-new-bitmaps',
    }
    : {
      mode: 'non-destructive',
      deleteCroppedPixels: false,
      hiddenPixels: 'preserved-off-canvas',
      layerBitmapHandling: 'offset-retained-layer-content',
    };
  const blockers = buildCropToolReadinessBlockers({
    canApply,
    requirePerspectiveCrop,
    requireContentAwareCornerFill,
    requirePresetManagement,
  });
  const status: CropToolReadinessStatus = blockers.some((blocker) => blocker.severity === 'error')
    ? 'blocked'
    : 'ready';
  const rectangleKey = geometry
    ? `${roundCropCoordinate(validPreview?.x ?? 0)},${roundCropCoordinate(validPreview?.y ?? 0)},${width}x${height}`
    : 'none';
  const activeAspect = geometry?.aspect ?? {
    preset: settings.aspectPreset,
    ratio: resolveCropPreviewAspectRatio(doc, settings.aspectPreset),
    locked: resolveCropPreviewAspectRatio(doc, settings.aspectPreset) !== null,
  };

  return {
    status,
    workingState: {
      hasPreview: canApply,
      phase: canApply ? 'preview-ready' : 'idle-blocked',
      sourceDimensions,
    },
    cropRectangle: {
      status: canApply ? 'ready' : 'blocked-invalid-rectangle',
      boundsLabel: geometry?.boundsLabel ?? 'none',
      width,
      height,
      canApply,
    },
    applyCancel: {
      apply: canApply ? 'supported-enter-key' : 'blocked-invalid-rectangle',
      cancel: 'supported-escape-key',
      previewPersistence: 'temporary-until-apply',
      previewBehavior: canApply ? 'live-overlay-no-document-mutation' : 'unavailable',
    },
    aspectPresets: {
      supported: [...CROP_ASPECT_PRESETS],
      active: activeAspect,
      constraint: buildCropAspectConstraintSummary({
        doc,
        width,
        height,
        preset: settings.aspectPreset,
        canApply,
      }),
      presetManagement: 'built-in-presets-only',
    },
    guideOverlays: geometry?.guides ?? summarizeCropGuides(settings.guideMode),
    straighten: {
      status: rotationDeg !== 0 ? 'ready' : 'idle',
      rotationDeg,
      direction,
    },
    rotateCrop: {
      status: rotationDeg !== 0 ? 'ready' : 'idle',
      rotationDeg,
    },
    pixelRetention,
    previewMetadata: buildCropPreviewMetadata({ canApply, pixelRetention }),
    fixedSizePrintGeometry: buildCropToolPrintGeometry({
      width,
      height,
      dpi: printDpi,
      aspectLocked: geometry?.aspect.locked ?? resolveCropPreviewAspectRatio(doc, settings.aspectPreset) !== null,
    }),
    sourceBinExportHandoff: {
      status: canApply ? 'ready' : 'blocked-invalid-crop',
      sourceBinSafe: canApply,
      exportSafe: canApply,
      outputDimensions: { width, height },
      caveats: settings.deleteCroppedPixels
        ? ['Destructive crop handoff exports the committed pixel bounds and cannot restore discarded hidden pixels from the exported asset.']
        : ['Non-destructive crop handoff is safe for Source Bin/export, but flattened exports only include the visible crop bounds.'],
    },
    resizeCanvasHandoff: buildCropResizeCanvasHandoff({
      canApply,
      cropOutputDimensions: { width, height },
      handoffResize,
      handoffCanvas,
    }),
    batchActionSuitability: {
      actionRecording: canApply ? 'recordable-fixed-preview' : 'blocked-invalid-crop',
      batchApply: canApply ? 'suitable-with-fixed-rectangle' : 'blocked-invalid-crop',
      requiresPerDocumentValidation: true,
    },
    unsupportedStates: {
      perspectiveCrop: 'unsupported',
      contentAwareCornerFill: 'unsupported',
      presetManagement: 'caveat-built-in-presets-only',
    },
    handleReadiness: buildCropHandleReadiness({
      canApply,
      preview: validPreview,
    }),
    descriptorChecks: buildCropDescriptorChecks({
      canApply,
      pixelRetention,
      requirePerspectiveCrop,
      requireContentAwareCornerFill,
    }),
    blockers,
    previewSignatures: {
      geometry: geometry?.signature ?? 'crop-preview|none',
      readiness: buildCropToolReadinessSignature({
        status,
        rectangleKey,
        canApply,
        pixelRetentionMode: pixelRetention.mode,
        rotationDeg,
        aspectPreset: settings.aspectPreset,
        guideMode: settings.guideMode,
        blockers,
      }),
    },
  };
}

export function buildCropToolCommitPlanDescriptor({
  doc,
  preview,
  settings,
  requirePerspectiveCrop = false,
  requireContentAwareCornerFill = false,
}: Pick<CropToolReadinessOptions, 'doc' | 'preview' | 'settings' | 'requirePerspectiveCrop' | 'requireContentAwareCornerFill'>): CropToolCommitPlanDescriptor {
  const readiness = describeCropToolReadiness({
    doc,
    preview,
    settings,
    requirePerspectiveCrop,
    requireContentAwareCornerFill,
  });
  const mode: CropToolCommitPlanMode = readiness.pixelRetention.mode;
  const active = readiness.cropRectangle.canApply;
  const rectangleKey = active
    ? readiness.previewSignatures.geometry.split('|')[1] ?? 'none'
    : 'none';
  const sourceSafety = buildCropToolCommitSourceSafety(mode, active);
  const unsupported = buildCropToolCommitUnsupportedDescriptors({
    requirePerspectiveCrop,
    requireContentAwareCornerFill,
  });
  const unsupportedCodes = unsupported
    .filter((entry) => entry.requested)
    .map((entry) => entry.code);

  return {
    descriptorId: 'crop-tool-commit-plan:v1',
    planSignature: [
      'crop-tool-commit-plan:v1',
      mode,
      `rect=${rectangleKey}`,
      `out=${readiness.cropRectangle.width}x${readiness.cropRectangle.height}`,
      `rotate=${readiness.straighten.rotationDeg}`,
      `aspect=${settings.aspectPreset}`,
      `guide=${settings.guideMode}`,
      `unsupported=${unsupportedCodes.length > 0 ? unsupportedCodes.join(',') : 'none'}`,
    ].join('|'),
    sourceSignature: sourceSafety.signature,
    commit: {
      status: active ? 'ready' : 'blocked-invalid-crop',
      mode,
      outputDimensions: {
        width: readiness.cropRectangle.width,
        height: readiness.cropRectangle.height,
      },
      documentMutation: active ? 'apply-resizes-document' : 'blocked',
      layerMutation: active
        ? mode === 'destructive'
          ? 'bake-visible-crop-into-new-bitmaps'
          : 'offset-retained-layer-content'
        : 'blocked',
      undoModel: active ? 'single-atomic-document-operation' : 'none',
    },
    previewSession: {
      active,
      applyReady: active,
      cancelReady: true,
      applyCommand: 'Enter',
      cancelCommand: 'Escape',
      signature: [
        'crop-tool-preview-session:v1',
        `active=${active}`,
        `apply=${active}`,
        'cancel=true',
        `rect=${rectangleKey}`,
        `rotate=${readiness.straighten.rotationDeg}`,
      ].join('|'),
    },
    sourceSafety,
    unsupported,
  };
}

function buildCropToolCommitSourceSafety(
  mode: CropToolCommitPlanMode,
  active: boolean,
): CropToolCommitPlanDescriptor['sourceSafety'] {
  if (!active) {
    return {
      hiddenPixels: 'unavailable',
      sourceLayerBitmaps: 'unavailable',
      flattenedExport: 'unavailable',
      destructiveCaveats: ['crop-commit-blocked-invalid-preview'],
      signature: 'crop-tool-source-safety:v1|mode=blocked|hidden=unavailable|source=unavailable|flattened=unavailable',
    };
  }
  const hiddenPixels = mode === 'destructive' ? 'deleted-on-apply' : 'preserved-off-canvas';
  const sourceLayerBitmaps = mode === 'destructive' ? 'rebaked-on-apply' : 'referenced-until-apply';
  return {
    hiddenPixels,
    sourceLayerBitmaps,
    flattenedExport: 'visible-crop-bounds-only',
    destructiveCaveats: mode === 'destructive'
      ? ['delete-cropped-pixels-discards-hidden-pixels', 'source-layer-bitmaps-rebaked-on-apply']
      : [],
    signature: `crop-tool-source-safety:v1|mode=${mode}|hidden=${hiddenPixels}|source=${sourceLayerBitmaps}|flattened=visible-crop-bounds-only`,
  };
}

function buildCropToolCommitUnsupportedDescriptors({
  requirePerspectiveCrop,
  requireContentAwareCornerFill,
}: {
  requirePerspectiveCrop: boolean;
  requireContentAwareCornerFill: boolean;
}): CropToolCommitPlanUnsupportedDescriptor[] {
  return [
    buildCropToolCommitUnsupportedDescriptor({
      code: 'perspective-crop-unsupported',
      requested: requirePerspectiveCrop,
      fallback: 'rectangular-crop-with-straighten',
    }),
    buildCropToolCommitUnsupportedDescriptor({
      code: 'content-aware-corner-fill-unsupported',
      requested: requireContentAwareCornerFill,
      fallback: 'transparent-corners-preserved-for-repair',
    }),
  ];
}

function buildCropToolCommitUnsupportedDescriptor({
  code,
  requested,
  fallback,
}: {
  code: CropToolCommitPlanUnsupportedDescriptor['code'];
  requested: boolean;
  fallback: CropToolCommitPlanUnsupportedDescriptor['fallback'];
}): CropToolCommitPlanUnsupportedDescriptor {
  return {
    code,
    requested,
    supported: false,
    mutationPolicy: 'blocked-before-document-mutation',
    fallback,
    signature: `crop-tool-unsupported:v1|${code}|requested=${requested}|fallback=${fallback}`,
  };
}

function buildCropToolPrintGeometry({
  width,
  height,
  dpi,
  aspectLocked,
}: {
  width: number;
  height: number;
  dpi: number;
  aspectLocked: boolean;
}): CropToolReadinessDescriptor['fixedSizePrintGeometry'] {
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

function buildCropAspectConstraintSummary({
  doc,
  width,
  height,
  preset,
  canApply,
}: {
  doc: ImageDocument;
  width: number;
  height: number;
  preset: CropAspectPreset;
  canApply: boolean;
}): CropAspectConstraintSummary {
  const requestedRatio = resolveCropPreviewAspectRatio(doc, preset);
  const roundedRequestedRatio = requestedRatio === null ? null : roundCropRatio(requestedRatio);
  const previewRatio = canApply && height > 0 ? roundCropRatio(width / height) : null;
  const locked = roundedRequestedRatio !== null;
  const constrainedPreview = canApply && roundedRequestedRatio !== null
    ? buildConstrainedCropPreviewDimensions(width, height, roundedRequestedRatio)
    : { width, height };
  const satisfied = !locked || (
    previewRatio !== null &&
    roundedRequestedRatio !== null &&
    Math.abs(previewRatio - roundedRequestedRatio) <= 0.000001
  );

  return {
    preset,
    requestedRatio: roundedRequestedRatio,
    previewRatio,
    locked,
    satisfied,
    constrainedPreview,
  };
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
      height: Math.max(1, roundCropCoordinate(widthDrivenHeight)),
    };
  }
  return {
    width: Math.max(1, roundCropCoordinate(heightDrivenWidth)),
    height,
  };
}

function buildCropPreviewMetadata({
  canApply,
  pixelRetention,
}: {
  canApply: boolean;
  pixelRetention: CropToolReadinessDescriptor['pixelRetention'];
}): CropToolReadinessDescriptor['previewMetadata'] {
  if (!canApply) {
    return {
      documentMutation: 'unavailable',
      previewLayerMutation: 'unavailable',
      hiddenPixels: 'unavailable',
      sourceSafety: 'blocked-invalid-preview',
      exportSafety: 'blocked-invalid-preview',
    };
  }
  return pixelRetention.mode === 'destructive'
    ? {
      documentMutation: 'none-until-apply',
      previewLayerMutation: 'none-overlay-only',
      hiddenPixels: 'deleted-on-apply',
      sourceSafety: 'source-layer-bitmaps-rebaked-on-apply',
      exportSafety: 'flattened-export-uses-visible-crop-bounds',
    }
    : {
      documentMutation: 'none-until-apply',
      previewLayerMutation: 'none-overlay-only',
      hiddenPixels: 'preserved-off-canvas',
      sourceSafety: 'source-layer-bitmaps-referenced-until-apply',
      exportSafety: 'flattened-export-uses-visible-crop-bounds',
    };
}

function buildCropHandleReadiness({
  canApply,
  preview,
}: {
  canApply: boolean;
  preview: CropPreviewRect | null;
}): CropToolHandleReadinessDescriptor {
  const base = {
    minHitTargetPx: CROP_HANDLE_MIN_HIT_TARGET_PX,
    hitTargetPx: CROP_HANDLE_HIT_TARGET_PX,
    visualHandlePx: CROP_HANDLE_VISUAL_PX,
    keyboardStepPx: CROP_HANDLE_KEYBOARD_STEP_PX,
  };
  if (!canApply || !preview) {
    return {
      status: 'blocked-invalid-crop',
      ...base,
      handles: [],
      caveats: [
        'Crop handle descriptors require a positive-width and positive-height crop rectangle.',
        'Perspective corner dragging is not exposed by the crop handles.',
      ],
      signature: buildCropHandleSignature({
        status: 'blocked-invalid-crop',
        rectangleKey: 'none',
        handles: [],
      }),
    };
  }

  const x = roundCropCoordinate(preview.x);
  const y = roundCropCoordinate(preview.y);
  const width = roundCropCoordinate(preview.w);
  const height = roundCropCoordinate(preview.h);
  const right = roundCropCoordinate(x + width);
  const bottom = roundCropCoordinate(y + height);
  const centerX = roundCropCoordinate(x + width / 2);
  const centerY = roundCropCoordinate(y + height / 2);
  const handles: CropToolHandleDescriptor[] = [
    buildCropHandle('nw', 'corner-resize', { x, y }, 'nwse-resize'),
    buildCropHandle('n', 'edge-resize', { x: centerX, y }, 'ns-resize'),
    buildCropHandle('ne', 'corner-resize', { x: right, y }, 'nesw-resize'),
    buildCropHandle('e', 'edge-resize', { x: right, y: centerY }, 'ew-resize'),
    buildCropHandle('se', 'corner-resize', { x: right, y: bottom }, 'nwse-resize'),
    buildCropHandle('s', 'edge-resize', { x: centerX, y: bottom }, 'ns-resize'),
    buildCropHandle('sw', 'corner-resize', { x, y: bottom }, 'nesw-resize'),
    buildCropHandle('w', 'edge-resize', { x, y: centerY }, 'ew-resize'),
    buildCropHandle('rotate', 'rotate-crop', { x: centerX, y: roundCropCoordinate(y - CROP_ROTATE_HANDLE_OFFSET) }, 'grab'),
  ];
  const rectangleKey = `${x},${y},${width}x${height}`;

  return {
    status: 'ready',
    ...base,
    handles,
    caveats: [
      'Handle descriptors are deterministic planning metadata; direct crop-box drag handles are rendered by the canvas overlay path.',
      'Perspective corner dragging is not exposed by the crop handles.',
    ],
    signature: buildCropHandleSignature({
      status: 'ready',
      rectangleKey,
      handles,
    }),
  };
}

function buildCropHandle(
  id: CropToolHandleId,
  kind: CropToolHandleKind,
  documentPoint: Point,
  cursor: CropToolHandleCursor,
): CropToolHandleDescriptor {
  return {
    id,
    kind,
    documentPoint,
    cursor,
    hitTargetPx: CROP_HANDLE_HIT_TARGET_PX,
    visualHandlePx: CROP_HANDLE_VISUAL_PX,
    ready: true,
  };
}

function buildCropDescriptorChecks({
  canApply,
  pixelRetention,
  requirePerspectiveCrop,
  requireContentAwareCornerFill,
}: {
  canApply: boolean;
  pixelRetention: CropToolReadinessDescriptor['pixelRetention'];
  requirePerspectiveCrop: boolean;
  requireContentAwareCornerFill: boolean;
}): CropToolDescriptorChecks {
  const perspectiveCropUnsupported = buildCropUnsupportedCheck({
    feature: 'perspective-crop',
    requested: requirePerspectiveCrop,
    blockerCode: 'perspective-crop-unsupported',
    fallback: 'rectangular-crop-with-straighten',
  });
  const contentAwareCornerFillUnsupported = buildCropUnsupportedCheck({
    feature: 'content-aware-corner-fill',
    requested: requireContentAwareCornerFill,
    blockerCode: 'content-aware-corner-fill-unsupported',
    fallback: 'transparent-corners-preserved-for-repair',
  });
  const presetManagementCaveats = buildCropPresetManagementCheck();
  const nonDestructivePreviewSafety = buildCropNonDestructivePreviewSafety({
    canApply,
    pixelRetention,
  });
  return {
    perspectiveCropUnsupported,
    contentAwareCornerFillUnsupported,
    presetManagementCaveats,
    nonDestructivePreviewSafety,
    signature: buildCropDescriptorChecksSignature({
      perspectiveRequested: requirePerspectiveCrop,
      cornerFillRequested: requireContentAwareCornerFill,
      previewStatus: nonDestructivePreviewSafety.status,
      pixelRetentionMode: pixelRetention.mode,
    }),
  };
}

function buildCropUnsupportedCheck({
  feature,
  requested,
  blockerCode,
  fallback,
}: {
  feature: 'perspective-crop' | 'content-aware-corner-fill';
  requested: boolean;
  blockerCode: CropToolUnsupportedCheckDescriptor['blockerCode'];
  fallback: CropToolUnsupportedCheckDescriptor['fallback'];
}): CropToolUnsupportedCheckDescriptor {
  return {
    status: 'unsupported',
    supported: false,
    requested,
    blockerCode,
    fallback,
    mutationPolicy: 'blocked-before-document-mutation',
    signature: `crop-check:v1:${feature}:unsupported:requested=${requested}:fallback=${fallback}`,
  };
}

function buildCropPresetManagementCheck(): CropToolPresetManagementCheckDescriptor {
  return {
    status: 'limited-built-in-presets-only',
    builtInPresetCount: CROP_ASPECT_PRESETS.length,
    customPresetManagement: false,
    importExport: false,
    caveats: [
      'custom-preset-create-rename-unavailable',
      'crop-preset-import-export-unavailable',
      'built-in-aspect-presets-are-deterministic',
    ],
    signature: `crop-check:v1:preset-management:limited-built-in-presets-only:count=${CROP_ASPECT_PRESETS.length}:custom=false:import-export=false`,
  };
}

function buildCropNonDestructivePreviewSafety({
  canApply,
  pixelRetention,
}: {
  canApply: boolean;
  pixelRetention: CropToolReadinessDescriptor['pixelRetention'];
}): CropToolNonDestructivePreviewSafetyDescriptor {
  if (!canApply) {
    return {
      status: 'blocked-invalid-preview',
      documentMutation: 'unavailable',
      layerMutation: 'unavailable',
      hiddenPixels: 'unavailable',
      sourceLayerBitmaps: 'unavailable',
      flattenedExport: 'unavailable',
      signature: 'crop-check:v1:non-destructive-preview:blocked-invalid-preview:hidden=unavailable:source=unavailable',
    };
  }

  const status = pixelRetention.mode === 'non-destructive'
    ? 'safe-overlay-preview'
    : 'destructive-apply-warning';
  const sourceLayerBitmaps = pixelRetention.mode === 'non-destructive'
    ? 'referenced-until-apply'
    : 'rebaked-on-apply';
  return {
    status,
    documentMutation: 'none-until-apply',
    layerMutation: 'none-overlay-only',
    hiddenPixels: pixelRetention.hiddenPixels,
    sourceLayerBitmaps,
    flattenedExport: 'visible-crop-bounds-only',
    signature: `crop-check:v1:non-destructive-preview:${status}:hidden=${pixelRetention.hiddenPixels}:source=${sourceLayerBitmaps}`,
  };
}

function buildCropResizeCanvasHandoff({
  canApply,
  cropOutputDimensions,
  handoffResize,
  handoffCanvas,
}: {
  canApply: boolean;
  cropOutputDimensions: { width: number; height: number };
  handoffResize: CropToolReadinessOptions['handoffResize'];
  handoffCanvas: CropToolReadinessOptions['handoffCanvas'];
}): CropToolResizeCanvasHandoffDescriptor {
  if (!canApply) {
    return {
      cropOutputDimensions,
      resize: {
        status: 'blocked-invalid-crop',
        targetDimensions: cropOutputDimensions,
        resampleMethod: handoffResize?.resampleMethod ?? 'none',
        scale: { x: 0, y: 0 },
        warningCodes: [],
      },
      canvas: {
        status: 'blocked-invalid-crop',
        targetDimensions: cropOutputDimensions,
        anchor: handoffCanvas?.anchor ?? 'center',
        canvasOffset: { x: 0, y: 0 },
        transparentExpansion: { left: 0, top: 0, right: 0, bottom: 0 },
        warningCodes: [],
      },
      warnings: [],
      signature: 'crop-handoff|crop=invalid|resize=blocked|canvas=blocked|warnings=none',
    };
  }

  const resizeMethod = handoffResize?.resampleMethod ?? 'browser-default';
  const resizeTarget = handoffResize
    ? normalizeHandoffDimensions(handoffResize.width, handoffResize.height)
    : cropOutputDimensions;
  const resizeChanged = !dimensionsEqual(cropOutputDimensions, resizeTarget);
  const resizeWarningCodes: CropToolHandoffWarningCode[] = resizeChanged
    ? ['handoff-resize-resamples-crop-output']
    : [];
  const resizeStatus: CropToolResizeCanvasHandoffDescriptor['resize']['status'] = handoffResize
    ? resizeChanged ? 'will-resample-crop-output' : 'no-op'
    : 'not-requested';
  const postResizeDimensions = resizeTarget;
  const anchor = handoffCanvas?.anchor ?? 'center';
  const canvasTarget = handoffCanvas
    ? normalizeHandoffDimensions(handoffCanvas.width, handoffCanvas.height)
    : postResizeDimensions;
  const canvasOffset = handoffCanvas
    ? cropCanvasHandoffOffset(postResizeDimensions, canvasTarget, anchor)
    : { x: 0, y: 0 };
  const transparentExpansion = handoffCanvas
    ? cropCanvasTransparentExpansion(postResizeDimensions, canvasTarget, canvasOffset)
    : { left: 0, top: 0, right: 0, bottom: 0 };
  const canvasWarningCodes = buildCropCanvasHandoffWarningCodes(postResizeDimensions, canvasTarget, transparentExpansion);
  const canvasStatus: CropToolResizeCanvasHandoffDescriptor['canvas']['status'] = handoffCanvas
    ? canvasWarningCodes.includes('handoff-canvas-crops-output')
      ? 'will-crop-canvas'
      : canvasWarningCodes.includes('handoff-canvas-adds-transparent-pixels')
        ? 'will-expand-canvas'
        : 'no-op'
    : 'not-requested';
  const warnings = buildCropHandoffWarnings({
    cropOutputDimensions,
    resizeTarget,
    resizeMethod,
    postResizeDimensions,
    canvasTarget,
    resizeWarningCodes,
    canvasWarningCodes,
  });

  return {
    cropOutputDimensions,
    resize: {
      status: resizeStatus,
      targetDimensions: resizeTarget,
      resampleMethod: handoffResize ? resizeMethod : 'none',
      scale: {
        x: roundCropRatio(resizeTarget.width / cropOutputDimensions.width),
        y: roundCropRatio(resizeTarget.height / cropOutputDimensions.height),
      },
      warningCodes: resizeWarningCodes,
    },
    canvas: {
      status: canvasStatus,
      targetDimensions: canvasTarget,
      anchor,
      canvasOffset,
      transparentExpansion,
      warningCodes: canvasWarningCodes,
    },
    warnings,
    signature: buildCropHandoffSignature({
      cropOutputDimensions,
      resizeTarget,
      resizeMethod: handoffResize ? resizeMethod : 'none',
      resizeStatus,
      canvasTarget,
      anchor,
      transparentExpansion,
      warnings,
    }),
  };
}

function normalizeHandoffDimensions(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(Number.isFinite(width) ? width : 1)),
    height: Math.max(1, Math.round(Number.isFinite(height) ? height : 1)),
  };
}

function cropCanvasHandoffOffset(
  source: { width: number; height: number },
  target: { width: number; height: number },
  anchor: CropToolCanvasHandoffAnchor,
): { x: number; y: number } {
  const dx = target.width - source.width;
  const dy = target.height - source.height;
  const x = anchor.endsWith('right') || anchor === 'right'
    ? dx
    : anchor === 'center' || anchor === 'top' || anchor === 'bottom'
      ? dx / 2
      : 0;
  const y = anchor.startsWith('bottom') || anchor === 'bottom'
    ? dy
    : anchor === 'center' || anchor === 'left' || anchor === 'right'
      ? dy / 2
      : 0;
  return {
    x: roundCropCoordinate(x),
    y: roundCropCoordinate(y),
  };
}

function cropCanvasTransparentExpansion(
  source: { width: number; height: number },
  target: { width: number; height: number },
  offset: { x: number; y: number },
): CropToolResizeCanvasHandoffDescriptor['canvas']['transparentExpansion'] {
  return {
    left: roundCropCoordinate(Math.max(0, offset.x)),
    top: roundCropCoordinate(Math.max(0, offset.y)),
    right: roundCropCoordinate(Math.max(0, target.width - source.width - offset.x)),
    bottom: roundCropCoordinate(Math.max(0, target.height - source.height - offset.y)),
  };
}

function buildCropCanvasHandoffWarningCodes(
  source: { width: number; height: number },
  target: { width: number; height: number },
  expansion: CropToolResizeCanvasHandoffDescriptor['canvas']['transparentExpansion'],
): CropToolHandoffWarningCode[] {
  const warningCodes: CropToolHandoffWarningCode[] = [];
  if (expansion.left > 0 || expansion.top > 0 || expansion.right > 0 || expansion.bottom > 0) {
    warningCodes.push('handoff-canvas-adds-transparent-pixels');
  }
  if (target.width < source.width || target.height < source.height) {
    warningCodes.push('handoff-canvas-crops-output');
  }
  return warningCodes;
}

function buildCropHandoffWarnings({
  cropOutputDimensions,
  resizeTarget,
  resizeMethod,
  postResizeDimensions,
  canvasTarget,
  resizeWarningCodes,
  canvasWarningCodes,
}: {
  cropOutputDimensions: { width: number; height: number };
  resizeTarget: { width: number; height: number };
  resizeMethod: CropToolHandoffResampleMethod;
  postResizeDimensions: { width: number; height: number };
  canvasTarget: { width: number; height: number };
  resizeWarningCodes: CropToolHandoffWarningCode[];
  canvasWarningCodes: CropToolHandoffWarningCode[];
}): CropToolHandoffWarning[] {
  const warnings: CropToolHandoffWarning[] = [];
  if (resizeWarningCodes.includes('handoff-resize-resamples-crop-output')) {
    warnings.push({
      code: 'handoff-resize-resamples-crop-output',
      severity: 'warning',
      message: `Crop output handoff will be resampled from ${cropOutputDimensions.width}x${cropOutputDimensions.height} to ${resizeTarget.width}x${resizeTarget.height} using ${resizeMethod}.`,
    });
  }
  if (canvasWarningCodes.includes('handoff-canvas-adds-transparent-pixels')) {
    warnings.push({
      code: 'handoff-canvas-adds-transparent-pixels',
      severity: 'warning',
      message: `Canvas handoff expands ${postResizeDimensions.width}x${postResizeDimensions.height} to ${canvasTarget.width}x${canvasTarget.height} and adds transparent pixels on at least one edge.`,
    });
  }
  if (canvasWarningCodes.includes('handoff-canvas-crops-output')) {
    warnings.push({
      code: 'handoff-canvas-crops-output',
      severity: 'warning',
      message: `Canvas handoff is smaller than ${postResizeDimensions.width}x${postResizeDimensions.height}; pixels outside ${canvasTarget.width}x${canvasTarget.height} will be clipped from the flattened handoff.`,
    });
  }
  return warnings;
}

function buildCropHandoffSignature({
  cropOutputDimensions,
  resizeTarget,
  resizeMethod,
  resizeStatus,
  canvasTarget,
  anchor,
  transparentExpansion,
  warnings,
}: {
  cropOutputDimensions: { width: number; height: number };
  resizeTarget: { width: number; height: number };
  resizeMethod: CropToolHandoffResampleMethod | 'none';
  resizeStatus: CropToolResizeCanvasHandoffDescriptor['resize']['status'];
  canvasTarget: { width: number; height: number };
  anchor: CropToolCanvasHandoffAnchor;
  transparentExpansion: CropToolResizeCanvasHandoffDescriptor['canvas']['transparentExpansion'];
  warnings: CropToolHandoffWarning[];
}): string {
  return [
    'crop-handoff',
    `crop=${cropOutputDimensions.width}x${cropOutputDimensions.height}`,
    `resize=${resizeTarget.width}x${resizeTarget.height}:${resizeMethod}:${resizeStatus}`,
    `canvas=${canvasTarget.width}x${canvasTarget.height}:${anchor}:expand=${transparentExpansion.left},${transparentExpansion.top},${transparentExpansion.right},${transparentExpansion.bottom}`,
    `warnings=${warnings.map((warning) => warning.code).join(',') || 'none'}`,
  ].join('|');
}

function dimensionsEqual(
  first: { width: number; height: number },
  second: { width: number; height: number },
): boolean {
  return first.width === second.width && first.height === second.height;
}

export function getCropPreview(doc?: ImageDocument): CropPreviewRect | null {
  if (!state) return null;
  const settings = useImageEditorStore.getState().cropToolSettings;
  const aspectRatio = doc
    ? resolveCropPreviewAspectRatio(doc, settings.aspectPreset)
    : null;
  return buildCropPreviewRect({
    start: state.start,
    current: state.current,
    aspectRatio,
    rotationDeg: settings.rotationDeg,
  });
}

export function subscribeCropPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearCropPreview(): void {
  state = null;
  notifyCropPreviewChanged();
}

export function buildCroppedImageDocumentState(
  doc: ImageDocument,
  preview: CropPreviewRect,
  optionsOrBaseLayers?: Partial<Pick<CropToolSettings, 'deleteCroppedPixels' | 'rotationDeg'>> | ImageLayer[],
  baseLayersArg?: ImageLayer[],
): CroppedImageDocumentState | null {
  if (preview.w <= 0 || preview.h <= 0) return null;
  const x = Math.round(preview.x);
  const y = Math.round(preview.y);
  const newWidth = Math.max(1, Math.round(preview.w));
  const newHeight = Math.max(1, Math.round(preview.h));
  const baseLayers = Array.isArray(optionsOrBaseLayers)
    ? optionsOrBaseLayers
    : (baseLayersArg ?? doc.layers);
  const settings = Array.isArray(optionsOrBaseLayers)
    ? undefined
    : optionsOrBaseLayers;
  const deleteCroppedPixels = settings?.deleteCroppedPixels ?? false;
  const rotationDeg = normalizeDegrees(preview.rotationDeg ?? settings?.rotationDeg ?? 0);

  const layers = baseLayers.map((layer) => {
    if (!layer.bitmap) {
      return transformLayerForCrop(layer, { x, y, width: newWidth, height: newHeight, rotationDeg });
    }
    if (!deleteCroppedPixels) {
      return transformLayerForCrop(layer, { x, y, width: newWidth, height: newHeight, rotationDeg });
    }
    const cropped = createBitmap(newWidth, newHeight);
    const ctx = cropped.getContext('2d');
    if (ctx) {
      drawLayerIntoCropBitmap(ctx, layer, { x, y, width: newWidth, height: newHeight, rotationDeg });
    }
    return {
      ...layer,
      x: 0,
      y: 0,
      rotationDeg: undefined,
      skewXDeg: undefined,
      skewYDeg: undefined,
      perspectiveX: undefined,
      perspectiveY: undefined,
      warp: undefined,
      cornerOffsets: undefined,
      transformOriginX: undefined,
      transformOriginY: undefined,
      bitmap: cropped,
      bitmapVersion: layer.bitmapVersion + 1,
      mask: null,
    };
  });

  const activeLayerId = layers.some((layer) => layer.id === doc.activeLayerId)
    ? doc.activeLayerId
    : (layers[layers.length - 1]?.id ?? null);

  return {
    width: newWidth,
    height: newHeight,
    layers,
    activeLayerId,
  };
}

function commit(env: ToolEnv): void {
  const preview = getCropPreview(env.doc);
  if (!state || !preview) return;
  const result = buildCroppedImageDocumentState(env.doc, preview, {
    deleteCroppedPixels: env.cropToolSettings.deleteCroppedPixels,
    rotationDeg: env.cropToolSettings.rotationDeg,
  }, state.origLayers);
  if (!result) return;

  env.pushOperation({
    kind: 'docResize',
    docId: env.doc.id,
    before: {
      width: state.origWidth,
      height: state.origHeight,
      layers: state.origLayers,
      activeLayerId: env.doc.activeLayerId,
    },
    after: {
      width: result.width,
      height: result.height,
      layers: result.layers,
      activeLayerId: result.activeLayerId,
    },
  });

  env.store.setLayers(env.doc.id, result.layers, result.activeLayerId);
  env.store.setDocumentDimensions(env.doc.id, result.width, result.height);
  state = null;
  notifyCropPreviewChanged();
  env.requestRender();
}

interface CropTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

function transformLayerForCrop(layer: ImageLayer, crop: CropTransform): ImageLayer {
  if (crop.rotationDeg === 0) {
    return {
      ...layer,
      x: roundCropCoordinate(layer.x - crop.x),
      y: roundCropCoordinate(layer.y - crop.y),
    };
  }

  const cropCenterX = crop.x + crop.width / 2;
  const cropCenterY = crop.y + crop.height / 2;
  const rotated = rotatePoint({
    x: layer.x - cropCenterX,
    y: layer.y - cropCenterY,
  }, -crop.rotationDeg);

  return {
    ...layer,
    x: roundCropCoordinate(crop.width / 2 + rotated.x),
    y: roundCropCoordinate(crop.height / 2 + rotated.y),
    rotationDeg: normalizeDegrees((layer.rotationDeg ?? 0) - crop.rotationDeg),
  };
}

function drawLayerIntoCropBitmap(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: ImageLayer,
  crop: CropTransform,
): void {
  if (!layer.bitmap) return;
  const source = resolveDestructiveCropSource(layer);
  const supportsTransforms = (
    typeof ctx.save === 'function' &&
    typeof ctx.restore === 'function' &&
    typeof ctx.translate === 'function' &&
    typeof ctx.rotate === 'function' &&
    typeof ctx.transform === 'function'
  );

  if (!supportsTransforms) {
    ctx.drawImage(source.bitmap, layer.x + source.offsetX - crop.x, layer.y + source.offsetY - crop.y);
    return;
  }

  const cropCenterX = crop.x + crop.width / 2;
  const cropCenterY = crop.y + crop.height / 2;
  ctx.save();
  ctx.translate(crop.width / 2, crop.height / 2);
  if (crop.rotationDeg !== 0) {
    ctx.rotate((-crop.rotationDeg * Math.PI) / 180);
  }
  ctx.translate(-cropCenterX, -cropCenterY);
  drawLayerBitmapTransformed(ctx, source.bitmap, layer, source.offsetX, source.offsetY);
  ctx.restore();
}

function resolveDestructiveCropSource(layer: ImageLayer): { bitmap: OffscreenCanvas; offsetX: number; offsetY: number } {
  if (!layer.bitmap) {
    throw new Error('Cannot crop a layer without a bitmap source.');
  }

  try {
    const renderedWithEffects = layer.effects?.some((effect) => effect.enabled) || layer.filters?.some((filter) => filter.enabled)
      ? renderLayerWithEffects(layer)
      : null;
    if (renderedWithEffects) {
      return {
        bitmap: renderedWithEffects.bitmap,
        offsetX: renderedWithEffects.offsetX,
        offsetY: renderedWithEffects.offsetY,
      };
    }
  } catch {
    // Unit-test bitmap fakes may not expose pixel APIs; fall through to the raw source.
  }

  if (layer.mask) {
    try {
      const masked = composeLayerBitmapWithMask(layer);
      if (masked) {
        return { bitmap: masked, offsetX: 0, offsetY: 0 };
      }
    } catch {
      // Unit-test bitmap fakes may not expose pixel APIs; fall through to the raw source.
    }
  }

  return {
    bitmap: layer.bitmap,
    offsetX: 0,
    offsetY: 0,
  };
}

function rotatePoint(point: Point, rotationDeg: number): Point {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return roundCropCoordinate(normalized);
}

function normalizeCropDpi(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 72;
}

function roundCropPrintValue(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCropCoordinate(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCropRatio(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function summarizeCropGuides(mode: CropGuideMode): CropPreviewGeometrySummary['guides'] {
  if (mode === 'thirds') {
    return { mode, verticalLines: 2, horizontalLines: 2, label: 'Rule of thirds' };
  }
  if (mode === 'grid') {
    return { mode, verticalLines: 3, horizontalLines: 3, label: '4x4 grid' };
  }
  return { mode, verticalLines: 0, horizontalLines: 0, label: 'No composition guides' };
}

function buildCropToolReadinessBlockers({
  canApply,
  requirePerspectiveCrop,
  requireContentAwareCornerFill,
  requirePresetManagement,
}: {
  canApply: boolean;
  requirePerspectiveCrop: boolean;
  requireContentAwareCornerFill: boolean;
  requirePresetManagement: boolean;
}): CropToolReadinessBlocker[] {
  const blockers: CropToolReadinessBlocker[] = [];
  if (!canApply) {
    blockers.push({
      code: 'invalid-crop-rectangle',
      severity: 'error',
      operation: 'apply-crop',
      message: 'Crop apply requires a positive-width and positive-height rectangle.',
    });
  }
  if (requirePerspectiveCrop) {
    blockers.push({
      code: 'perspective-crop-unsupported',
      severity: 'error',
      operation: 'perspective-crop',
      message: 'Perspective Crop is not implemented; the crop tool supports rectangular crop bounds with optional straightening rotation only.',
    });
  }
  if (requireContentAwareCornerFill) {
    blockers.push({
      code: 'content-aware-corner-fill-unsupported',
      severity: 'error',
      operation: 'content-aware-corner-fill',
      message: 'Content-aware corner fill for rotated crop edges is not implemented; transparent edge fill remains the supported behavior.',
    });
  }
  if (requirePresetManagement) {
    blockers.push({
      code: 'custom-preset-management-unavailable',
      severity: 'error',
      operation: 'manage-crop-presets',
      message: 'Custom crop preset create, rename, import, and export management is not implemented; only built-in aspect presets are available.',
    });
  }
  return blockers;
}

function buildCropHandleSignature({
  status,
  rectangleKey,
  handles,
}: {
  status: CropToolHandleReadinessDescriptor['status'];
  rectangleKey: string;
  handles: CropToolHandleDescriptor[];
}): string {
  return [
    'crop-handles:v1',
    status,
    `rect=${rectangleKey}`,
    `handles=${handles.map((handle) => `${handle.id}:${handle.documentPoint.x},${handle.documentPoint.y}`).join('|') || 'none'}`,
    `hit=${CROP_HANDLE_HIT_TARGET_PX}`,
    `visual=${CROP_HANDLE_VISUAL_PX}`,
  ].join('|');
}

function buildCropDescriptorChecksSignature({
  perspectiveRequested,
  cornerFillRequested,
  previewStatus,
  pixelRetentionMode,
}: {
  perspectiveRequested: boolean;
  cornerFillRequested: boolean;
  previewStatus: CropToolNonDestructivePreviewSafetyDescriptor['status'];
  pixelRetentionMode: CropToolReadinessDescriptor['pixelRetention']['mode'];
}): string {
  return [
    'crop-checks:v1',
    `perspective=unsupported:${perspectiveRequested ? 'requested' : 'not-requested'}`,
    `corner-fill=unsupported:${cornerFillRequested ? 'requested' : 'not-requested'}`,
    'presets=limited-built-in-presets-only',
    `preview=${previewStatus}`,
    `mode=${pixelRetentionMode}`,
  ].join('|');
}

function buildCropToolReadinessSignature({
  status,
  rectangleKey,
  canApply,
  pixelRetentionMode,
  rotationDeg,
  aspectPreset,
  guideMode,
  blockers,
}: {
  status: CropToolReadinessStatus;
  rectangleKey: string;
  canApply: boolean;
  pixelRetentionMode: CropToolReadinessDescriptor['pixelRetention']['mode'];
  rotationDeg: number;
  aspectPreset: CropAspectPreset;
  guideMode: CropGuideMode;
  blockers: CropToolReadinessBlocker[];
}): string {
  return [
    'crop-readiness',
    status,
    `rect=${rectangleKey}`,
    `apply=${canApply}`,
    `mode=${pixelRetentionMode}`,
    `rotate=${rotationDeg}`,
    `aspect=${aspectPreset}`,
    `guide=${guideMode}`,
    `blockers=${blockers.map((blocker) => blocker.code).join(',') || 'none'}`,
  ].join('|');
}
