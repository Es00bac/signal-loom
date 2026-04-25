import { describe, expect, it } from 'vitest';
import { buildManualEditorVisualSequenceClip } from './manualEditorSequence';
import type { EditorVisualClip } from '../types/flow';

function createVisualClip(overrides: Partial<EditorVisualClip> = {}): EditorVisualClip {
  return {
    id: 'visual-1',
    sourceNodeId: 'source-1',
    sourceKind: 'image',
    trackIndex: 0,
    startMs: 0,
    sourceInMs: 0,
    durationSeconds: 4,
    trimStartMs: 0,
    trimEndMs: 0,
    playbackRate: 1,
    reversePlayback: false,
    fitMode: 'contain',
    scalePercent: 100,
    scaleMotionEnabled: false,
    endScalePercent: 100,
    opacityPercent: 100,
    rotationDeg: 0,
    rotationMotionEnabled: false,
    endRotationDeg: 0,
    flipHorizontal: false,
    flipVertical: false,
    positionX: 0,
    positionY: 0,
    motionEnabled: false,
    endPositionX: 0,
    endPositionY: 0,
    cropLeftPercent: 0,
    cropRightPercent: 0,
    cropTopPercent: 0,
    cropBottomPercent: 0,
    cropPanXPercent: 0,
    cropPanYPercent: 0,
    cropRotationDeg: 0,
    filterStack: [],
    transitionIn: 'none',
    transitionOut: 'none',
    transitionDurationMs: 500,
    textFontFamily: 'Inter, system-ui, sans-serif',
    textSizePx: 64,
    textColor: '#f3f4f6',
    textEffect: 'shadow',
    textBackgroundOpacityPercent: 0,
    ...overrides,
  };
}

describe('buildManualEditorVisualSequenceClip', () => {
  it('preserves opacity automation points for the render sequence', () => {
    const sequenceClip = buildManualEditorVisualSequenceClip(
      createVisualClip({
        opacityPercent: 80,
        opacityAutomationPoints: [
          { timePercent: 0, valuePercent: 0 },
          { timePercent: 35, valuePercent: 100 },
          { timePercent: 70, valuePercent: 20 },
          { timePercent: 100, valuePercent: 80 },
        ],
      }),
      {
        assetUrl: 'data:image/png;base64,abc',
        aspectRatio: '16:9',
      },
    );

    expect(sequenceClip.opacityAutomationPoints).toEqual([
      { timePercent: 0, valuePercent: 0 },
      { timePercent: 35, valuePercent: 100 },
      { timePercent: 70, valuePercent: 20 },
      { timePercent: 100, valuePercent: 80 },
    ]);
  });
});
