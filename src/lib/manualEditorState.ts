import type {
  EditorAudioClip,
  EditorClipFilter,
  EditorVisualSourceKind,
  EditorVisualClip,
  NodeData,
  TimelineAutomationPoint,
  TextClipEffect,
  VisualClipTransition,
} from '../types/flow';
import {
  audioKeyframesToVolumeAutomation,
  ensureVisualClipHasKeyframes,
  normalizeAudioKeyframes,
  normalizeVisualKeyframes,
  visualKeyframesToOpacityAutomation,
} from './editorKeyframes';
import { normalizeClipBlendMode } from './editorClipEffects';

export function getEditorVisualClips(nodeData: NodeData): EditorVisualClip[] {
  const value = nodeData.editorVisualClips;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((clip) => {
    if (!isRecord(clip) || typeof clip.id !== 'string' || typeof clip.sourceNodeId !== 'string') {
      return [];
    }

    const sourceKind = normalizeVisualSourceKind(clip.sourceKind);

    if (!sourceKind) {
      return [];
    }

    const normalizedClip: EditorVisualClip = {
      id: clip.id,
      sourceNodeId: clip.sourceNodeId,
      sourceKind,
      trackIndex: normalizeInteger(clip.trackIndex, 0),
      startMs: normalizeNonNegativeNumber(clip.startMs, 0),
      sourceInMs: normalizeNonNegativeNumber(clip.sourceInMs, normalizeNonNegativeNumber(clip.trimStartMs, 0)),
      sourceOutMs: typeof clip.sourceOutMs === 'number' ? Math.max(0, clip.sourceOutMs) : undefined,
      durationSeconds: typeof clip.durationSeconds === 'number' ? clip.durationSeconds : undefined,
      trimStartMs: normalizeNonNegativeNumber(clip.trimStartMs, 0),
      trimEndMs: normalizeNonNegativeNumber(clip.trimEndMs, 0),
      playbackRate: normalizePlaybackRate(clip.playbackRate),
      reversePlayback: typeof clip.reversePlayback === 'boolean' ? clip.reversePlayback : false,
      fitMode: clip.fitMode === 'cover' || clip.fitMode === 'stretch' ? clip.fitMode : 'contain',
      scalePercent: normalizeInteger(clip.scalePercent, 100),
      scaleMotionEnabled: typeof clip.scaleMotionEnabled === 'boolean' ? clip.scaleMotionEnabled : false,
      endScalePercent: normalizeInteger(clip.endScalePercent, 100),
      opacityPercent: normalizeInteger(clip.opacityPercent, 100),
      opacityAutomationPoints: normalizeAutomationPoints(
        clip.opacityAutomationPoints,
        normalizeInteger(clip.opacityPercent, 100),
      ),
      rotationDeg: normalizeInteger(clip.rotationDeg, 0),
      rotationMotionEnabled: typeof clip.rotationMotionEnabled === 'boolean' ? clip.rotationMotionEnabled : false,
      endRotationDeg: normalizeInteger(clip.endRotationDeg, normalizeInteger(clip.rotationDeg, 0)),
      flipHorizontal: typeof clip.flipHorizontal === 'boolean' ? clip.flipHorizontal : false,
      flipVertical: typeof clip.flipVertical === 'boolean' ? clip.flipVertical : false,
      positionX: normalizeInteger(clip.positionX, 0),
      positionY: normalizeInteger(clip.positionY, 0),
      motionEnabled: typeof clip.motionEnabled === 'boolean' ? clip.motionEnabled : false,
      endPositionX: normalizeInteger(clip.endPositionX, 0),
      endPositionY: normalizeInteger(clip.endPositionY, 0),
      cropLeftPercent: normalizePercent(clip.cropLeftPercent, 0),
      cropRightPercent: normalizePercent(clip.cropRightPercent, 0),
      cropTopPercent: normalizePercent(clip.cropTopPercent, 0),
      cropBottomPercent: normalizePercent(clip.cropBottomPercent, 0),
      cropPanXPercent: normalizeSignedPercent(clip.cropPanXPercent, 0),
      cropPanYPercent: normalizeSignedPercent(clip.cropPanYPercent, 0),
      cropRotationDeg: normalizeInteger(clip.cropRotationDeg, 0),
      filterStack: normalizeFilterStack(clip.filterStack),
      blendMode: normalizeClipBlendMode(clip.blendMode),
      transitionIn: normalizeTransition(clip.transitionIn),
      transitionOut:
        clip.transitionOut !== undefined
          ? normalizeTransition(clip.transitionOut)
          : normalizeTransition(clip.transitionAfter),
      transitionDurationMs: normalizeNonNegativeNumber(clip.transitionDurationMs, 500),
      textContent: typeof clip.textContent === 'string' ? clip.textContent : undefined,
      textFontFamily: typeof clip.textFontFamily === 'string' ? clip.textFontFamily : 'Inter, system-ui, sans-serif',
      textSizePx: normalizeInteger(clip.textSizePx, 64),
      textColor: typeof clip.textColor === 'string' ? clip.textColor : '#f3f4f6',
      textEffect: normalizeTextEffect(clip.textEffect),
      textBackgroundOpacityPercent: normalizeInteger(clip.textBackgroundOpacityPercent, 0),
      shapeFillColor: typeof clip.shapeFillColor === 'string' ? clip.shapeFillColor : undefined,
      shapeBorderColor: typeof clip.shapeBorderColor === 'string' ? clip.shapeBorderColor : undefined,
      shapeBorderWidth: typeof clip.shapeBorderWidth === 'number' ? Math.max(0, Math.round(clip.shapeBorderWidth)) : undefined,
      shapeCornerRadius: typeof clip.shapeCornerRadius === 'number' ? Math.max(0, Math.round(clip.shapeCornerRadius)) : undefined,
    };

    if (Array.isArray(clip.keyframes) && clip.keyframes.length > 0) {
      const clipWithKeyframes = {
        ...normalizedClip,
        keyframes: clip.keyframes as EditorVisualClip['keyframes'],
      };
      const keyframes = normalizeVisualKeyframes(clipWithKeyframes);

      normalizedClip.keyframes = keyframes;
      normalizedClip.opacityAutomationPoints = visualKeyframesToOpacityAutomation({
        ...normalizedClip,
        keyframes,
      });
    }

    return [ensureVisualClipHasKeyframes(normalizedClip)];
  });
}

export function getEditorAudioClips(nodeData: NodeData): EditorAudioClip[] {
  const value = nodeData.editorAudioClips;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((clip) => {
    if (!isRecord(clip) || typeof clip.id !== 'string' || typeof clip.sourceNodeId !== 'string') {
      return [];
    }

    const volumePercent = normalizeInteger(clip.volumePercent, 100);

    const normalizedClip: EditorAudioClip = {
      id: clip.id,
      sourceNodeId: clip.sourceNodeId,
      offsetMs: typeof clip.offsetMs === 'number' ? clip.offsetMs : 0,
      trackIndex: typeof clip.trackIndex === 'number' ? clip.trackIndex : 0,
      volumePercent,
      volumeAutomationPoints: normalizeAutomationPoints(clip.volumeAutomationPoints, volumePercent),
      enabled: typeof clip.enabled === 'boolean' ? clip.enabled : true,
    };

    if (Array.isArray(clip.volumeKeyframes) && clip.volumeKeyframes.length > 0) {
      const clipWithKeyframes = {
        ...normalizedClip,
        volumeKeyframes: clip.volumeKeyframes as EditorAudioClip['volumeKeyframes'],
      };
      const volumeKeyframes = normalizeAudioKeyframes(clipWithKeyframes);

      normalizedClip.volumeKeyframes = volumeKeyframes;
      normalizedClip.volumeAutomationPoints = audioKeyframesToVolumeAutomation({
        ...normalizedClip,
        volumeKeyframes,
      });
    }

    return [normalizedClip];
  });
}

export function getEditorAudioTrackVolumes(nodeData: NodeData, trackCount = 4): number[] {
  const value = Array.isArray(nodeData.editorAudioTrackVolumes) ? nodeData.editorAudioTrackVolumes : [];

  return Array.from({ length: Math.max(0, trackCount) }, (_, index) =>
    normalizeTrackVolume(value[index]),
  );
}

export function createEditorVisualClip(
  sourceNodeId: string,
  sourceKind: EditorVisualSourceKind,
  overrides: Partial<EditorVisualClip> = {},
): EditorVisualClip {
  const clip: EditorVisualClip = {
    id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceNodeId,
    sourceKind,
    trackIndex: overrides.trackIndex ?? 0,
    startMs: overrides.startMs ?? 0,
    sourceInMs: overrides.sourceInMs ?? overrides.trimStartMs ?? 0,
    sourceOutMs: overrides.sourceOutMs,
    durationSeconds:
      overrides.durationSeconds ?? (sourceKind === 'image' || sourceKind === 'text' || sourceKind === 'shape' ? 4 : undefined),
    trimStartMs: overrides.trimStartMs ?? 0,
    trimEndMs: overrides.trimEndMs ?? 0,
    playbackRate: overrides.playbackRate ?? 1,
    reversePlayback: overrides.reversePlayback ?? false,
    fitMode: overrides.fitMode ?? 'contain',
    scalePercent: overrides.scalePercent ?? 100,
    scaleMotionEnabled: overrides.scaleMotionEnabled ?? false,
    endScalePercent: overrides.endScalePercent ?? overrides.scalePercent ?? 100,
    opacityPercent: overrides.opacityPercent ?? 100,
    opacityAutomationPoints: normalizeAutomationPoints(
      overrides.opacityAutomationPoints,
      overrides.opacityPercent ?? 100,
    ),
    rotationDeg: overrides.rotationDeg ?? 0,
    rotationMotionEnabled: overrides.rotationMotionEnabled ?? false,
    endRotationDeg: overrides.endRotationDeg ?? overrides.rotationDeg ?? 0,
    flipHorizontal: overrides.flipHorizontal ?? false,
    flipVertical: overrides.flipVertical ?? false,
    positionX: overrides.positionX ?? 0,
    positionY: overrides.positionY ?? 0,
    motionEnabled: overrides.motionEnabled ?? false,
    endPositionX: overrides.endPositionX ?? 0,
    endPositionY: overrides.endPositionY ?? 0,
    cropLeftPercent: overrides.cropLeftPercent ?? 0,
    cropRightPercent: overrides.cropRightPercent ?? 0,
    cropTopPercent: overrides.cropTopPercent ?? 0,
    cropBottomPercent: overrides.cropBottomPercent ?? 0,
    cropPanXPercent: overrides.cropPanXPercent ?? 0,
    cropPanYPercent: overrides.cropPanYPercent ?? 0,
    cropRotationDeg: overrides.cropRotationDeg ?? 0,
    filterStack: overrides.filterStack ?? [],
    blendMode: normalizeClipBlendMode(overrides.blendMode),
    transitionIn: overrides.transitionIn ?? 'none',
    transitionOut: overrides.transitionOut ?? 'none',
    transitionDurationMs: overrides.transitionDurationMs ?? 500,
    textContent: overrides.textContent,
    textFontFamily: overrides.textFontFamily ?? 'Inter, system-ui, sans-serif',
    textSizePx: overrides.textSizePx ?? 64,
    textColor: overrides.textColor ?? '#f3f4f6',
    textEffect: overrides.textEffect ?? 'shadow',
    textBackgroundOpacityPercent: overrides.textBackgroundOpacityPercent ?? 0,
    shapeFillColor: overrides.shapeFillColor,
    shapeBorderColor: overrides.shapeBorderColor,
    shapeBorderWidth: overrides.shapeBorderWidth,
    shapeCornerRadius: overrides.shapeCornerRadius,
  };

  if (overrides.keyframes?.length) {
    const keyframes = normalizeVisualKeyframes({ ...clip, keyframes: overrides.keyframes });

    return ensureVisualClipHasKeyframes({
      ...clip,
      keyframes,
      opacityAutomationPoints: visualKeyframesToOpacityAutomation({ ...clip, keyframes }),
    });
  }

  return ensureVisualClipHasKeyframes(clip);
}

export function createEditorAudioClip(
  sourceNodeId: string,
  trackIndex = 0,
  overrides: Partial<EditorAudioClip> = {},
): EditorAudioClip {
  const clip: EditorAudioClip = {
    id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceNodeId,
    offsetMs: overrides.offsetMs ?? 0,
    trackIndex,
    volumePercent: overrides.volumePercent ?? 100,
    volumeAutomationPoints: overrides.volumeAutomationPoints,
    enabled: overrides.enabled ?? true,
  };

  if (overrides.volumeKeyframes?.length) {
    const volumeKeyframes = normalizeAudioKeyframes({ ...clip, volumeKeyframes: overrides.volumeKeyframes });

    return {
      ...clip,
      volumeKeyframes,
      volumeAutomationPoints: audioKeyframesToVolumeAutomation({ ...clip, volumeKeyframes }),
    };
  }

  return clip;
}

function normalizeVisualSourceKind(
  value: unknown,
): EditorVisualSourceKind | undefined {
  return value === 'text' || value === 'shape' || value === 'image' || value === 'video' || value === 'composition'
    ? value
    : undefined;
}

function normalizeTransition(value: unknown): VisualClipTransition {
  return value === 'fade' ||
    value === 'slide-left' ||
    value === 'slide-right' ||
    value === 'slide-up' ||
    value === 'slide-down'
    ? value
    : 'none';
}

function normalizeTextEffect(value: unknown): TextClipEffect {
  return value === 'shadow' || value === 'glow' || value === 'outline' ? value : 'none';
}

function normalizeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function normalizePercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function normalizeSignedPercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-100, Math.min(100, Math.round(value)))
    : fallback;
}

function normalizeFilterStack(value: unknown): EditorClipFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((filter) => {
    if (!isRecord(filter) || typeof filter.id !== 'string') {
      return [];
    }

    if (
      filter.kind !== 'brightness' &&
      filter.kind !== 'contrast' &&
      filter.kind !== 'saturation' &&
      filter.kind !== 'blur' &&
      filter.kind !== 'grayscale'
    ) {
      return [];
    }

    return [{
      id: filter.id,
      kind: filter.kind,
      amount: normalizeInteger(filter.amount, 0),
      enabled: typeof filter.enabled === 'boolean' ? filter.enabled : true,
    }];
  });
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeTrackVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 100;
}

function normalizePlaybackRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }

  return Math.min(4, Math.max(0.25, value));
}

function normalizeAutomationPoints(
  value: unknown,
  defaultValuePercent?: number,
): TimelineAutomationPoint[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const points = value.flatMap((point) => {
    if (!isRecord(point)) {
      return [];
    }

    const timePercent = normalizeNonNegativeNumber(point.timePercent, Number.NaN);
    const valuePercent = normalizeNonNegativeNumber(point.valuePercent, Number.NaN);

    if (!Number.isFinite(timePercent) || !Number.isFinite(valuePercent)) {
      return [];
    }

    return [{
      timePercent: Math.min(100, timePercent),
      valuePercent: Math.min(100, valuePercent),
    }];
  });

  if (points.length === 0) {
    return undefined;
  }

  points.sort((left, right) => left.timePercent - right.timePercent);

  if (defaultValuePercent === undefined) {
    return points;
  }

  const defaultPointValue = Math.min(100, Math.max(0, Math.round(defaultValuePercent)));
  const anchored = [...points];

  if (anchored[0].timePercent > 0) {
    anchored.unshift({ timePercent: 0, valuePercent: defaultPointValue });
  } else {
    anchored[0] = { ...anchored[0], timePercent: 0 };
  }

  const lastPoint = anchored[anchored.length - 1];

  if (lastPoint.timePercent < 100) {
    anchored.push({ timePercent: 100, valuePercent: defaultPointValue });
  } else {
    anchored[anchored.length - 1] = { ...lastPoint, timePercent: 100 };
  }

  return anchored;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
