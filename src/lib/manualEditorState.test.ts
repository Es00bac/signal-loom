import { describe, expect, it } from 'vitest';
import {
  getEditorVisualClips,
  getEditorAudioClips,
  getEditorAudioTrackVolumes,
} from './manualEditorState';
import type { NodeData } from '../types/flow';

describe('getEditorVisualClips', () => {
  it('normalizes saved visual keyframes and syncs opacity automation from them', () => {
    const clips = getEditorVisualClips({
      editorVisualClips: [
        {
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
          keyframes: [
            {
              timePercent: 50,
              positionX: 20,
              positionY: 10,
              scalePercent: 150,
              rotationDeg: 45,
              opacityPercent: 35,
            },
          ],
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
          textFontFamily: 'Inter',
          textSizePx: 64,
          textColor: '#fff',
          textEffect: 'shadow',
          textBackgroundOpacityPercent: 0,
        },
      ],
    } as Partial<NodeData> as NodeData);

    expect(clips[0].keyframes?.map((keyframe) => keyframe.timePercent)).toEqual([0, 50, 100]);
    expect(clips[0].opacityAutomationPoints).toEqual([
      { timePercent: 0, valuePercent: 100 },
      { timePercent: 50, valuePercent: 35 },
      { timePercent: 100, valuePercent: 100 },
    ]);
  });
});

describe('getEditorAudioClips', () => {
  it('normalizes audio volume automation points from saved node data', () => {
    const clips = getEditorAudioClips({
      editorAudioClips: [
        {
          id: 'audio-1',
          sourceNodeId: 'source-1',
          offsetMs: 0,
          trackIndex: 0,
          volumePercent: 80,
          volumeAutomationPoints: [
            { timePercent: 50, valuePercent: 25 },
          ],
          enabled: true,
        },
      ],
    } as Partial<NodeData> as NodeData);

    expect(clips[0].volumeAutomationPoints).toEqual([
      { timePercent: 0, valuePercent: 80 },
      { timePercent: 50, valuePercent: 25 },
      { timePercent: 100, valuePercent: 80 },
    ]);
  });

  it('normalizes saved audio volume keyframes and syncs volume automation from them', () => {
    const clips = getEditorAudioClips({
      editorAudioClips: [
        {
          id: 'audio-1',
          sourceNodeId: 'source-1',
          offsetMs: 0,
          trackIndex: 0,
          volumePercent: 100,
          volumeKeyframes: [
            { timePercent: 50, volumePercent: 40 },
          ],
          enabled: true,
        },
      ],
    } as Partial<NodeData> as NodeData);

    expect(clips[0].volumeKeyframes).toEqual([
      { timePercent: 0, volumePercent: 100 },
      { timePercent: 50, volumePercent: 40 },
      { timePercent: 100, volumePercent: 100 },
    ]);
    expect(clips[0].volumeAutomationPoints).toEqual([
      { timePercent: 0, valuePercent: 100 },
      { timePercent: 50, valuePercent: 40 },
      { timePercent: 100, valuePercent: 100 },
    ]);
  });
});

describe('getEditorAudioTrackVolumes', () => {
  it('returns clamped per-track timeline volume controls with defaults', () => {
    expect(
      getEditorAudioTrackVolumes({
        editorAudioTrackVolumes: [100, 25, -10, 140],
      } as Partial<NodeData> as NodeData, 5),
    ).toEqual([100, 25, 0, 100, 100]);
  });
});
