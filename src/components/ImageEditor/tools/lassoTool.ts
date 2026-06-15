import {
  DEFAULT_SELECTION_TOOL_SETTINGS,
  type LassoShape,
  type SelectionMode,
  type SelectionToolSettings,
} from '../../../types/imageEditor';
import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { createMask, setPolygon, type SelectionMask } from '../SelectionMask';
import { describeSelectionModeSemantics, SelectionInteraction, type SelectionModeOperation } from './selectionInteraction';

export type LassoSelectionLimitationCode =
  | 'freehand-smoothing-unsupported'
  | 'subpixel-edge-anti-alias-unsupported';

export interface LassoSelectionLimitation {
  code: LassoSelectionLimitationCode;
  severity: 'limitation';
  message: string;
}

export interface SelectionKeyboardModifierCaveat {
  input: 'shift' | 'alt' | 'enter' | 'escape';
  behavior: string;
  caveat: string;
}

export interface SelectionBatchActionSuitability {
  status: 'ready' | 'limited-ready' | 'blocked';
  actionRecordable: true;
  batchSafe: boolean;
  requiresSelectionReplayValidation?: true;
  reason: string;
}

export type LassoSelectionReadinessStatus = 'ready' | 'limited-ready' | 'blocked';
export type LassoSelectionReadinessBlockerCode =
  | 'transform-selection-needs-active-selection'
  | 'magnetic-lasso-descriptor-only'
  | 'invalid-lasso-path';

export interface LassoSelectionReadinessBlocker {
  code: LassoSelectionReadinessBlockerCode;
  severity: 'warning' | 'error';
  operation: 'selection-edge-processing' | 'transform-selection' | 'magnetic-lasso' | 'selection-commit';
  message: string;
}

export interface LassoModifierBehaviorDescriptor {
  input: 'shift' | 'alt' | 'enter' | 'escape';
  geometryEffect: 'none' | 'finalize-polygonal-segment' | 'commit-open-polygon' | 'cancel-preview';
  selectionModeOverride: 'add-when-resolved-by-environment' | 'subtract-when-resolved-by-environment' | 'none';
}

export type LassoSelectionPathInvalidReason =
  | 'needs-at-least-three-points'
  | 'zero-area-selection-path';

export interface LassoSelectionPathCommitDescriptor {
  validForCommit: boolean;
  invalidReason: LassoSelectionPathInvalidReason | null;
  bounds: LassoGeometryBounds | null;
  areaPx: number;
  pathLengthPx: number;
  signature: string;
}

export interface LassoSelectionPathPreviewDescriptor {
  validForRasterization: boolean;
  bounds: LassoGeometryBounds | null;
  areaPx: number;
  pathLengthPx: number;
  signature: string;
}

export interface LassoSelectionPathDescriptor {
  descriptorId: 'lasso-selection-path:v1';
  workflow: LassoShape;
  minimumCommitPointCount: 3;
  committedPointCount: number;
  previewPointCount: number;
  commit: LassoSelectionPathCommitDescriptor;
  preview: LassoSelectionPathPreviewDescriptor;
  signature: string;
}

export interface LassoSelectionPathOptions {
  workflow: LassoShape;
  points?: Point[];
  cursor?: Point;
}

export interface LassoSelectionWorkflowDescriptorOptions {
  selectionSettings?: Partial<Pick<
    SelectionToolSettings,
    'mode' | 'lassoShape' | 'feather' | 'antiAlias'
  >>;
  selectionMode?: SelectionMode;
  points?: Point[];
  cursor?: Point;
  closed?: boolean;
  smoothingRequested?: number;
}

export interface LassoSelectionWorkflowDescriptor {
  descriptorId: 'lasso-selection-workflow:v1';
  tool: 'lasso';
  selectionMode: {
    mode: SelectionMode;
    operation: SelectionModeOperation;
  };
  geometry: {
    workflow: LassoShape;
    pointCount: number;
    committedPointCount: number;
    closed: boolean;
    closure: 'auto-closes-on-pointer-up' | 'closes-on-enter-alt-or-double-click' | 'open-preview-closes-only-on-enter-alt-or-double-click';
    bounds: LassoGeometryBounds | null;
  };
  edgeProcessing: {
    feather: {
      requestedPx: number;
      applied: boolean;
    };
    antiAlias: {
      requested: boolean;
      applied: false;
    };
    smoothing: {
      requestedPx: number;
      applied: false;
    };
  };
  output: {
    target: 'document-selection';
    alpha: 255;
  };
  limitations: LassoSelectionLimitation[];
  keyboardModifierCaveats: SelectionKeyboardModifierCaveat[];
  batchActionSuitability: SelectionBatchActionSuitability;
  previewSignature: string;
}

export type MagneticLassoUnsupportedCode =
  | 'pixel-source-required-for-edge-detection'
  | 'true-image-edge-detection-unsupported'
  | 'refine-edge-unsupported';

export interface MagneticLassoUnsupportedState {
  code: MagneticLassoUnsupportedCode;
  severity: 'unsupported';
  message: string;
}

export interface MagneticLassoPixelSourceDescriptor {
  width: number;
  height: number;
}

export interface MagneticLassoPlanOptions {
  points?: Point[];
  cursor?: Point;
  pixelSource?: MagneticLassoPixelSourceDescriptor;
  settings?: {
    snapRadius?: number;
    contrastThreshold?: number;
    frequency?: number;
    refineEdgeRequested?: boolean;
  };
}

export interface LassoSelectionReadinessOptions extends LassoSelectionWorkflowDescriptorOptions {
  hasActiveSelection?: boolean;
  requireTransformSelection?: boolean;
  requireValidPath?: boolean;
  magnetic?: MagneticLassoPlanOptions;
}

export interface LassoSelectionReadinessDescriptor {
  descriptorId: 'lasso-selection-readiness:v1';
  status: LassoSelectionReadinessStatus;
  workflow: LassoSelectionWorkflowDescriptor['geometry'];
  path: LassoSelectionPathDescriptor;
  edgeModes: {
    feather: {
      requestedPx: number;
      preview: 'feathered-mask' | 'no-feather-requested';
      appliedToSelectionMask: boolean;
    };
    antiAlias: {
      requested: boolean;
      preview: 'polygon-rasterized-edge';
      appliedToSelectionMask: false;
    };
    smoothing: {
      requestedPx: number;
      preview: 'unsupported';
      appliedToSelectionMask: false;
    };
  };
  modifierBehavior: LassoModifierBehaviorDescriptor[];
  transformSelectionHandoff: {
    target: 'transform-selection';
    readiness: 'requires-committed-selection';
    source: 'document-selection-registry';
    commitBoundary: 'after-selection-commit';
    invalidBlockerSignature: 'transform-selection-needs-active-selection';
  };
  magneticLasso: {
    readiness: MagneticLassoPlanDescriptor['readiness'];
    unsupportedCodes: MagneticLassoUnsupportedCode[];
    previewSignature: string;
  };
  blockers: LassoSelectionReadinessBlocker[];
  batchActionSuitability: SelectionBatchActionSuitability & {
    requiresSelectionReplayValidation: true;
  };
  previewSignatures: {
    workflow: string;
    readiness: string;
    blockers: string;
  };
}

export interface MagneticLassoPlanDescriptor {
  descriptorId: 'magnetic-lasso-plan:v1';
  tool: 'magnetic-lasso';
  readiness: 'waiting-for-anchor-points' | 'descriptor-only-no-pixel-source' | 'ready-for-descriptor-preview';
  geometry: {
    anchorCount: number;
    previewPointCount: number;
    candidateSegmentCount: number;
    bounds: LassoGeometryBounds | null;
  };
  snapping: {
    ready: boolean;
    snapRadiusPx: number;
    contrastThreshold: number;
    frequency: number;
    candidateAnchorCount: number;
    cursorDistanceFromLastAnchor: number | null;
    cursorWithinSnapRadius: boolean;
  };
  unsupported: MagneticLassoUnsupportedState[];
  previewSignature: string;
}

interface LassoGeometryBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function describeLassoSelectionPath(
  options: LassoSelectionPathOptions,
): LassoSelectionPathDescriptor {
  const committedPoints = options.points ?? [];
  const previewPoints = options.workflow === 'polygonal' && options.cursor
    ? [...committedPoints, options.cursor]
    : committedPoints;
  const commit = buildLassoSelectionPathCommit(options.workflow, committedPoints);
  const preview = buildLassoSelectionPathPreview(options.workflow, previewPoints);

  return {
    descriptorId: 'lasso-selection-path:v1',
    workflow: options.workflow,
    minimumCommitPointCount: 3,
    committedPointCount: committedPoints.length,
    previewPointCount: previewPoints.length,
    commit,
    preview,
    signature: `lasso-selection-path:v1:${options.workflow}:commit=${commit.signature}:preview=${preview.signature}`,
  };
}

export function describeLassoSelectionWorkflow(
  options: LassoSelectionWorkflowDescriptorOptions = {},
): LassoSelectionWorkflowDescriptor {
  const settings = {
    ...DEFAULT_SELECTION_TOOL_SETTINGS,
    ...options.selectionSettings,
  };
  const mode = options.selectionMode ?? settings.mode;
  const modeSemantics = describeSelectionModeSemantics(mode);
  const committedPoints = options.points ?? [];
  const points = settings.lassoShape === 'polygonal' && options.cursor
    ? [...committedPoints, options.cursor]
    : committedPoints;
  const closed = options.closed ?? settings.lassoShape === 'freehand';
  const featherPx = normalizePixels(settings.feather);
  const smoothingPx = normalizePixels(options.smoothingRequested ?? 0);
  const descriptor = {
    descriptorId: 'lasso-selection-workflow:v1' as const,
    tool: 'lasso' as const,
    selectionMode: {
      mode,
      operation: modeSemantics.operation,
    },
    geometry: {
      workflow: settings.lassoShape,
      pointCount: points.length,
      committedPointCount: committedPoints.length,
      closed,
      closure: getLassoClosure(settings.lassoShape, closed),
      bounds: points.length > 0 ? calculateLassoBounds(points) : null,
    },
    edgeProcessing: {
      feather: {
        requestedPx: featherPx,
        applied: featherPx > 0,
      },
      antiAlias: {
        requested: settings.antiAlias,
        applied: false as const,
      },
      smoothing: {
        requestedPx: smoothingPx,
        applied: false as const,
      },
    },
    output: {
      target: 'document-selection' as const,
      alpha: 255 as const,
    },
    limitations: getLassoSelectionLimitations({
      workflow: settings.lassoShape,
      smoothingPx,
      antiAliasRequested: settings.antiAlias,
    }),
    keyboardModifierCaveats: getLassoKeyboardModifierCaveats(),
    batchActionSuitability: {
      status: 'limited-ready' as const,
      actionRecordable: true as const,
      batchSafe: false,
      reason: 'Lasso actions depend on document-specific pointer geometry and active selection combine mode.',
    },
  };

  return {
    ...descriptor,
    previewSignature: buildLassoSelectionPreviewSignature(descriptor),
  };
}

export function describeMagneticLassoPlan(
  options: MagneticLassoPlanOptions = {},
): MagneticLassoPlanDescriptor {
  const anchors = options.points ?? [];
  const previewPoints = options.cursor ? [...anchors, options.cursor] : anchors;
  const snapRadiusPx = normalizePixels(options.settings?.snapRadius ?? 12);
  const contrastThreshold = normalizeUnit(options.settings?.contrastThreshold ?? 0.35);
  const frequency = normalizePositiveInteger(options.settings?.frequency ?? 8);
  const cursorDistanceFromLastAnchor = anchors.length > 0 && options.cursor
    ? roundNumber(distanceBetweenPoints(anchors[anchors.length - 1], options.cursor), 3)
    : null;
  const cursorWithinSnapRadius = cursorDistanceFromLastAnchor !== null
    && snapRadiusPx > 0
    && cursorDistanceFromLastAnchor <= snapRadiusPx;
  const unsupported = getMagneticLassoUnsupportedStates({
    hasPixelSource: Boolean(options.pixelSource),
    refineEdgeRequested: Boolean(options.settings?.refineEdgeRequested),
  });
  const descriptor = {
    descriptorId: 'magnetic-lasso-plan:v1' as const,
    tool: 'magnetic-lasso' as const,
    readiness: getMagneticLassoReadiness(anchors.length, Boolean(options.pixelSource)),
    geometry: {
      anchorCount: anchors.length,
      previewPointCount: previewPoints.length,
      candidateSegmentCount: Math.max(0, previewPoints.length - 1),
      bounds: previewPoints.length > 0 ? calculateLassoBounds(previewPoints) : null,
    },
    snapping: {
      ready: Boolean(options.pixelSource) && previewPoints.length >= 2,
      snapRadiusPx,
      contrastThreshold,
      frequency,
      candidateAnchorCount: previewPoints.length,
      cursorDistanceFromLastAnchor,
      cursorWithinSnapRadius,
    },
    unsupported,
  };

  return {
    ...descriptor,
    previewSignature: buildMagneticLassoPreviewSignature(descriptor),
  };
}

export function describeLassoSelectionReadiness(
  options: LassoSelectionReadinessOptions = {},
): LassoSelectionReadinessDescriptor {
  const workflow = describeLassoSelectionWorkflow(options);
  const path = describeLassoSelectionPath({
    workflow: workflow.geometry.workflow,
    points: options.points,
    cursor: options.cursor,
  });
  const magnetic = describeMagneticLassoPlan(options.magnetic ?? {});
  const hasActiveSelection = options.hasActiveSelection ?? workflow.geometry.bounds !== null;
  const blockers = getLassoSelectionReadinessBlockers({
    requireTransformSelection: options.requireTransformSelection === true,
    requireValidPath: options.requireValidPath === true,
    hasActiveSelection,
    path,
    magnetic,
  });
  const status = blockers.some((blocker) => blocker.severity === 'error')
    ? 'blocked'
    : blockers.length > 0 || workflow.limitations.length > 0
      ? 'limited-ready'
      : 'ready';
  const descriptor: Omit<LassoSelectionReadinessDescriptor, 'previewSignatures'> = {
    descriptorId: 'lasso-selection-readiness:v1',
    status,
    workflow: workflow.geometry,
    path,
    edgeModes: {
      feather: {
        requestedPx: workflow.edgeProcessing.feather.requestedPx,
        preview: workflow.edgeProcessing.feather.requestedPx > 0 ? 'feathered-mask' : 'no-feather-requested',
        appliedToSelectionMask: workflow.edgeProcessing.feather.requestedPx > 0,
      },
      antiAlias: {
        requested: workflow.edgeProcessing.antiAlias.requested,
        preview: 'polygon-rasterized-edge',
        appliedToSelectionMask: false,
      },
      smoothing: {
        requestedPx: workflow.edgeProcessing.smoothing.requestedPx,
        preview: 'unsupported',
        appliedToSelectionMask: false,
      },
    },
    modifierBehavior: getLassoModifierBehavior(),
    transformSelectionHandoff: {
      ...describeSelectionModeSemantics(workflow.selectionMode.mode).transformSelectionHandoff,
      invalidBlockerSignature: 'transform-selection-needs-active-selection',
    },
    magneticLasso: {
      readiness: magnetic.readiness,
      unsupportedCodes: magnetic.unsupported.map((state) => state.code),
      previewSignature: magnetic.previewSignature,
    },
    blockers,
    batchActionSuitability: {
      status: status === 'ready' ? 'ready' : status === 'blocked' ? 'blocked' : 'limited-ready',
      actionRecordable: true,
      batchSafe: false,
      requiresSelectionReplayValidation: true,
      reason: status === 'blocked'
        ? 'Lasso playback is blocked until required transform-selection prerequisites exist.'
        : 'Lasso geometry can be recorded, but batch playback must revalidate pointer geometry and selection combine mode.',
    },
  };

  return {
    ...descriptor,
    previewSignatures: {
      workflow: workflow.previewSignature,
      readiness: buildLassoSelectionReadinessPreviewSignature(descriptor),
      blockers: buildLassoSelectionBlockerSignature(descriptor.blockers),
    },
  };
}

interface FreehandState {
  kind: 'freehand';
  points: Point[];
  previewed: boolean;
  interaction: SelectionInteraction;
}

interface PolygonalState {
  kind: 'polygonal';
  points: Point[];
  previewed: boolean;
  interaction: SelectionInteraction;
  cursor: Point;
}

let state: FreehandState | PolygonalState | null = null;

export const lassoTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    if (env.selectionToolSettings.lassoShape === 'polygonal') {
      handlePolygonalDown(env, point, mods);
    } else {
      handleFreehandDown(env, point, mods);
    }
  },

  onPointerMove(env, point) {
    if (!state) return;
    if (state.kind === 'freehand') {
      state.points.push(point);
      previewFreehand(env);
    } else {
      state.cursor = point;
      previewPolygonal(env);
    }
  },

  onPointerUp(env, _point, mods) {
    if (!state) return;
    if (state.kind === 'freehand') {
      const current = state;
      previewFreehand(env);
      if (current.previewed) {
        current.interaction.commit(env);
      } else {
        current.interaction.cancel(env);
      }
      state = null;
    } else {
      // polygonal: do nothing on regular up; double-click or Enter closes.
      if (mods.alt) finalizePolygonal(env);
    }
  },

  onKeyDown(env, key) {
    if (!state) return;
    if (state.kind === 'polygonal') {
      if (key === 'Enter') finalizePolygonal(env);
      else if (key === 'Escape') {
        state.interaction.cancel(env);
        state = null;
      }
    }
    if (key === 'Escape') {
      if (state) {
        state.interaction.cancel(env);
        state = null;
      }
    }
  },

  onCancel(env) {
    if (!state) return;
    state.interaction.cancel(env);
    state = null;
  },
};

function handleFreehandDown(env: ToolEnv, point: Point, mods: Modifiers): void {
  const mode = env.resolveSelectionMode(mods);
  state = {
    kind: 'freehand',
    points: [point],
    previewed: false,
    interaction: new SelectionInteraction(env, mode),
  };
}

function handlePolygonalDown(env: ToolEnv, point: Point, mods: Modifiers): void {
  if (state && state.kind === 'polygonal') {
    state.points.push(point);
    state.cursor = point;
    previewPolygonal(env);
    return;
  }
  const mode = env.resolveSelectionMode(mods);
  state = {
    kind: 'polygonal',
    points: [point],
    previewed: false,
    cursor: point,
    interaction: new SelectionInteraction(env, mode),
  };
}

function previewFreehand(env: ToolEnv): void {
  if (!state || state.kind !== 'freehand') return;
  if (state.points.length < 3) return;
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, state.points);
  state.interaction.preview(env, shape);
  state.previewed = true;
}

function previewPolygonal(env: ToolEnv): void {
  if (!state || state.kind !== 'polygonal') return;
  if (state.points.length < 2) return;
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, [...state.points, state.cursor]);
  state.interaction.preview(env, shape);
  state.previewed = true;
}

function finalizePolygonal(env: ToolEnv): void {
  if (!state || state.kind !== 'polygonal') return;
  if (state.points.length < 3) {
    state.interaction.cancel(env);
    state = null;
    return;
  }
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, state.points);
  state.interaction.preview(env, shape);
  state.interaction.commit(env);
  state = null;
}

export function lassoIsPolygonalActive(): boolean {
  return state?.kind === 'polygonal';
}

export function lassoPolygonalDoubleClick(env: ToolEnv): void {
  if (state?.kind === 'polygonal') finalizePolygonal(env);
}

function getLassoClosure(
  workflow: LassoShape,
  closed: boolean,
): LassoSelectionWorkflowDescriptor['geometry']['closure'] {
  if (workflow === 'freehand') return 'auto-closes-on-pointer-up';
  if (closed) return 'closes-on-enter-alt-or-double-click';
  return 'open-preview-closes-only-on-enter-alt-or-double-click';
}

function calculateLassoBounds(points: Point[]): LassoGeometryBounds {
  let minX = points[0]?.x ?? 0;
  let minY = points[0]?.y ?? 0;
  let maxX = minX;
  let maxY = minY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: roundNumber(minX, 3),
    y: roundNumber(minY, 3),
    width: roundNumber(maxX - minX, 3),
    height: roundNumber(maxY - minY, 3),
  };
}

function buildLassoSelectionPathCommit(
  workflow: LassoShape,
  points: Point[],
): LassoSelectionPathCommitDescriptor {
  const bounds = points.length > 0 ? calculateLassoBounds(points) : null;
  const areaPx = calculatePolygonArea(points);
  const pathLengthPx = calculateLassoPathLength(points, points.length >= 3);
  const invalidReason = getLassoSelectionPathInvalidReason(points, areaPx);
  const validity = invalidReason ? 'invalid' : 'ready';
  const signature = [
    'lasso-selection-path-commit:v1',
    workflow,
    validity,
    points.length,
    formatLassoBoundsForSignature(bounds),
    formatLassoNumber(areaPx),
    formatLassoNumber(pathLengthPx),
  ].join(':');

  return {
    validForCommit: invalidReason === null,
    invalidReason,
    bounds,
    areaPx,
    pathLengthPx,
    signature,
  };
}

function buildLassoSelectionPathPreview(
  workflow: LassoShape,
  points: Point[],
): LassoSelectionPathPreviewDescriptor {
  const bounds = points.length > 0 ? calculateLassoBounds(points) : null;
  const areaPx = calculatePolygonArea(points);
  const pathLengthPx = calculateLassoPathLength(points, points.length >= 3);
  const validForRasterization = points.length >= 3 && areaPx > 0;
  const signature = [
    'lasso-selection-path-preview:v1',
    workflow,
    validForRasterization ? 'ready' : 'invalid',
    points.length,
    formatLassoBoundsForSignature(bounds),
    formatLassoNumber(areaPx),
    formatLassoNumber(pathLengthPx),
  ].join(':');

  return {
    validForRasterization,
    bounds,
    areaPx,
    pathLengthPx,
    signature,
  };
}

function getLassoSelectionPathInvalidReason(
  points: Point[],
  areaPx: number,
): LassoSelectionPathInvalidReason | null {
  if (points.length < 3) return 'needs-at-least-three-points';
  if (areaPx <= 0) return 'zero-area-selection-path';
  return null;
}

function calculatePolygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return roundNumber(Math.abs(twiceArea) / 2, 3);
}

function calculateLassoPathLength(points: Point[], closePath: boolean): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetweenPoints(points[index - 1], points[index]);
  }
  if (closePath) {
    length += distanceBetweenPoints(points[points.length - 1], points[0]);
  }
  return roundNumber(length, 3);
}

function formatLassoBoundsForSignature(bounds: LassoGeometryBounds | null): string {
  if (!bounds) return 'none';
  return [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  ].map(formatLassoNumber).join(',');
}

function formatLassoNumber(value: number): string {
  return String(roundNumber(value, 3));
}

function getLassoSelectionLimitations(options: {
  workflow: LassoShape;
  smoothingPx: number;
  antiAliasRequested: boolean;
}): LassoSelectionLimitation[] {
  const limitations: LassoSelectionLimitation[] = [];
  if (options.workflow === 'freehand' && options.smoothingPx > 0) {
    limitations.push({
      code: 'freehand-smoothing-unsupported',
      severity: 'limitation',
      message: 'Freehand lasso smoothing is described for capability tracking only; sampled points are rasterized directly today.',
    });
  }
  if (options.workflow === 'freehand' && !options.antiAliasRequested) {
    limitations.push({
      code: 'subpixel-edge-anti-alias-unsupported',
      severity: 'limitation',
      message: 'Freehand lasso edges are polygon-rasterized without subpixel anti-alias coverage.',
    });
  }
  return limitations;
}

function getLassoKeyboardModifierCaveats(): SelectionKeyboardModifierCaveat[] {
  return [
    {
      input: 'shift',
      behavior: 'selection-mode-add-when-resolved-by-environment',
      caveat: 'Modifier selection modes depend on the shared selection interaction resolver.',
    },
    {
      input: 'alt',
      behavior: 'selection-mode-subtract-or-polygonal-finalize',
      caveat: 'Alt finalizes polygonal lasso on pointer up in this local tool path.',
    },
    {
      input: 'enter',
      behavior: 'finalize-polygonal-lasso',
      caveat: 'Enter only commits polygonal paths with at least three anchor points.',
    },
    {
      input: 'escape',
      behavior: 'cancel-active-lasso',
      caveat: 'Escape cancels preview state without committing selection history.',
    },
  ];
}

function getLassoModifierBehavior(): LassoModifierBehaviorDescriptor[] {
  return [
    {
      input: 'shift',
      geometryEffect: 'none',
      selectionModeOverride: 'add-when-resolved-by-environment',
    },
    {
      input: 'alt',
      geometryEffect: 'finalize-polygonal-segment',
      selectionModeOverride: 'subtract-when-resolved-by-environment',
    },
    {
      input: 'enter',
      geometryEffect: 'commit-open-polygon',
      selectionModeOverride: 'none',
    },
    {
      input: 'escape',
      geometryEffect: 'cancel-preview',
      selectionModeOverride: 'none',
    },
  ];
}

function buildLassoSelectionPreviewSignature(
  descriptor: Omit<LassoSelectionWorkflowDescriptor, 'previewSignature'>,
): string {
  return `lasso-selection-workflow:v1:${JSON.stringify({
    mode: descriptor.selectionMode.mode,
    workflow: descriptor.geometry.workflow,
    pointCount: descriptor.geometry.pointCount,
    closed: descriptor.geometry.closed,
    closure: descriptor.geometry.closure,
    bounds: descriptor.geometry.bounds,
    feather: descriptor.edgeProcessing.feather,
    antiAlias: descriptor.edgeProcessing.antiAlias,
    smoothing: descriptor.edgeProcessing.smoothing,
    limitations: descriptor.limitations.map((limitation) => limitation.code),
  })}`;
}

function getLassoSelectionReadinessBlockers(options: {
  requireTransformSelection: boolean;
  requireValidPath: boolean;
  hasActiveSelection: boolean;
  path: LassoSelectionPathDescriptor;
  magnetic: MagneticLassoPlanDescriptor;
}): LassoSelectionReadinessBlocker[] {
  const blockers: LassoSelectionReadinessBlocker[] = [];
  if (options.requireValidPath && !options.path.commit.validForCommit) {
    blockers.push({
      code: 'invalid-lasso-path',
      severity: 'error',
      operation: 'selection-commit',
      message: 'A committed lasso selection needs at least three non-collinear points before it can create selection history.',
    });
  }
  if (options.requireTransformSelection && !options.hasActiveSelection) {
    blockers.push({
      code: 'transform-selection-needs-active-selection',
      severity: 'error',
      operation: 'transform-selection',
      message: 'Transform Selection interop requires a committed non-empty selection in the document selection registry.',
    });
  }
  if (options.magnetic.readiness !== 'ready-for-descriptor-preview') {
    blockers.push({
      code: 'magnetic-lasso-descriptor-only',
      severity: 'warning',
      operation: 'magnetic-lasso',
      message: 'Magnetic Lasso remains descriptor-only here; readiness does not imply real edge detection or refine-edge execution.',
    });
  }
  return blockers;
}

function buildLassoSelectionReadinessPreviewSignature(
  descriptor: Omit<LassoSelectionReadinessDescriptor, 'previewSignatures'>,
): string {
  return `lasso-selection-readiness:v1:${JSON.stringify({
    status: descriptor.status,
    workflow: descriptor.workflow.workflow,
    pointCount: descriptor.workflow.pointCount,
    feather: descriptor.edgeModes.feather,
    antiAlias: descriptor.edgeModes.antiAlias,
    smoothing: descriptor.edgeModes.smoothing,
    magnetic: descriptor.magneticLasso.readiness,
    blockers: descriptor.blockers.map((blocker) => blocker.code),
  })}`;
}

function buildLassoSelectionBlockerSignature(
  blockers: LassoSelectionReadinessBlocker[],
): string {
  return `lasso-selection-blockers:v1:${JSON.stringify(blockers.map((blocker) => blocker.code))}`;
}

function getMagneticLassoReadiness(
  anchorCount: number,
  hasPixelSource: boolean,
): MagneticLassoPlanDescriptor['readiness'] {
  if (anchorCount === 0) return 'waiting-for-anchor-points';
  if (!hasPixelSource) return 'descriptor-only-no-pixel-source';
  return 'ready-for-descriptor-preview';
}

function getMagneticLassoUnsupportedStates(options: {
  hasPixelSource: boolean;
  refineEdgeRequested: boolean;
}): MagneticLassoUnsupportedState[] {
  const unsupported: MagneticLassoUnsupportedState[] = [];
  if (!options.hasPixelSource) {
    unsupported.push({
      code: 'pixel-source-required-for-edge-detection',
      severity: 'unsupported',
      message: 'Magnetic lasso planning can describe anchors and snapping settings, but true edge sampling needs a pixel source.',
    });
    unsupported.push({
      code: 'true-image-edge-detection-unsupported',
      severity: 'unsupported',
      message: 'No image-edge detector is run for this descriptor-only path, so cursor points are not snapped to real pixel edges.',
    });
  }
  if (options.refineEdgeRequested) {
    unsupported.push({
      code: 'refine-edge-unsupported',
      severity: 'unsupported',
      message: 'Refine Edge is recorded as requested but is not executed by the lasso planning helper.',
    });
  }
  return unsupported;
}

function buildMagneticLassoPreviewSignature(
  descriptor: Omit<MagneticLassoPlanDescriptor, 'previewSignature'>,
): string {
  return `magnetic-lasso-plan:v1:${JSON.stringify({
    readiness: descriptor.readiness,
    anchorCount: descriptor.geometry.anchorCount,
    previewPointCount: descriptor.geometry.previewPointCount,
    candidateSegmentCount: descriptor.geometry.candidateSegmentCount,
    bounds: descriptor.geometry.bounds,
    snapping: {
      ready: descriptor.snapping.ready,
      snapRadiusPx: descriptor.snapping.snapRadiusPx,
      contrastThreshold: descriptor.snapping.contrastThreshold,
      frequency: descriptor.snapping.frequency,
      candidateAnchorCount: descriptor.snapping.candidateAnchorCount,
      cursorWithinSnapRadius: descriptor.snapping.cursorWithinSnapRadius,
    },
    unsupported: descriptor.unsupported.map((state) => state.code),
  })}`;
}

function distanceBetweenPoints(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizePixels(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return roundNumber(value, 3);
}

function normalizeUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundNumber(Math.min(1, Math.max(0, value)), 3);
}

function normalizePositiveInteger(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.round(value);
}

function roundNumber(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
