import type {
  AspectRatio,
  EditorClipFilter,
  EditorStageBlendMode,
  EditorVisualKeyframe,
  EditorVisualClip,
  EditorVisualSourceKind,
  TimelineAutomationPoint,
} from '../types/flow';

export interface ManualEditorVisualSequenceSource {
  assetUrl?: string;
  aspectRatio?: AspectRatio;
  text?: string;
}

export interface ManualEditorVisualSequenceClip {
  sourceNodeId: string;
  sourceKind: EditorVisualSourceKind;
  trackIndex: number;
  startMs: number;
  aspectRatio?: AspectRatio;
  assetUrl?: string;
  text?: string;
  sourceInMs: number;
  sourceOutMs?: number;
  durationSeconds?: number;
  trimStartMs: number;
  trimEndMs: number;
  playbackRate: number;
  reversePlayback: boolean;
  fitMode: 'contain' | 'cover' | 'stretch';
  scalePercent: number;
  scaleMotionEnabled: boolean;
  endScalePercent: number;
  opacityPercent: number;
  opacityAutomationPoints?: TimelineAutomationPoint[];
  keyframes?: EditorVisualKeyframe[];
  rotationDeg: number;
  rotationMotionEnabled: boolean;
  endRotationDeg: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  positionX: number;
  positionY: number;
  motionEnabled: boolean;
  endPositionX: number;
  endPositionY: number;
  cropLeftPercent: number;
  cropRightPercent: number;
  cropTopPercent: number;
  cropBottomPercent: number;
  cropPanXPercent: number;
  cropPanYPercent: number;
  cropRotationDeg: number;
  filterStack: EditorClipFilter[];
  blendMode: EditorStageBlendMode;
  transitionIn: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';
  transitionOut: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';
  transitionDurationMs: number;
  textContent?: string;
  textFontFamily: string;
  textSizePx: number;
  textColor: string;
  textEffect: 'none' | 'shadow' | 'glow' | 'outline';
  textBackgroundOpacityPercent: number;
  shapeFillColor?: string;
  shapeBorderColor?: string;
  shapeBorderWidth?: number;
  shapeCornerRadius?: number;
}

export function buildManualEditorVisualSequenceClip(
  clip: EditorVisualClip,
  source: ManualEditorVisualSequenceSource,
): ManualEditorVisualSequenceClip {
  return {
    sourceNodeId: clip.sourceNodeId,
    sourceKind: clip.sourceKind,
    trackIndex: clip.trackIndex,
    startMs: clip.startMs,
    aspectRatio: source.aspectRatio,
    assetUrl: source.assetUrl,
    text: source.text,
    sourceInMs: clip.sourceInMs,
    sourceOutMs: clip.sourceOutMs,
    durationSeconds: clip.durationSeconds,
    trimStartMs: clip.trimStartMs,
    trimEndMs: clip.trimEndMs,
    playbackRate: clip.playbackRate,
    reversePlayback: clip.reversePlayback,
    fitMode: clip.fitMode,
    scalePercent: clip.scalePercent,
    scaleMotionEnabled: clip.scaleMotionEnabled,
    endScalePercent: clip.endScalePercent,
    opacityPercent: clip.opacityPercent,
    opacityAutomationPoints: cloneAutomationPoints(clip.opacityAutomationPoints),
    keyframes: clip.keyframes?.map((keyframe) => ({ ...keyframe })),
    rotationDeg: clip.rotationDeg,
    rotationMotionEnabled: clip.rotationMotionEnabled,
    endRotationDeg: clip.endRotationDeg,
    flipHorizontal: clip.flipHorizontal,
    flipVertical: clip.flipVertical,
    positionX: clip.positionX,
    positionY: clip.positionY,
    motionEnabled: clip.motionEnabled,
    endPositionX: clip.endPositionX,
    endPositionY: clip.endPositionY,
    cropLeftPercent: clip.cropLeftPercent ?? 0,
    cropRightPercent: clip.cropRightPercent ?? 0,
    cropTopPercent: clip.cropTopPercent ?? 0,
    cropBottomPercent: clip.cropBottomPercent ?? 0,
    cropPanXPercent: clip.cropPanXPercent ?? 0,
    cropPanYPercent: clip.cropPanYPercent ?? 0,
    cropRotationDeg: clip.cropRotationDeg ?? 0,
    filterStack: clip.filterStack?.map((filter) => ({ ...filter })) ?? [],
    blendMode: clip.blendMode ?? 'normal',
    transitionIn: clip.transitionIn,
    transitionOut: clip.transitionOut,
    transitionDurationMs: clip.transitionDurationMs,
    textContent: clip.textContent,
    textFontFamily: clip.textFontFamily,
    textSizePx: clip.textSizePx,
    textColor: clip.textColor,
    textEffect: clip.textEffect,
    textBackgroundOpacityPercent: clip.textBackgroundOpacityPercent,
    shapeFillColor: clip.shapeFillColor,
    shapeBorderColor: clip.shapeBorderColor,
    shapeBorderWidth: clip.shapeBorderWidth,
    shapeCornerRadius: clip.shapeCornerRadius,
  };
}

function cloneAutomationPoints(
  points: TimelineAutomationPoint[] | undefined,
): TimelineAutomationPoint[] | undefined {
  return points?.map((point) => ({ ...point }));
}
