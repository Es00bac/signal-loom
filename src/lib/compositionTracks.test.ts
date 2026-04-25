import { describe, expect, it } from 'vitest';
import {
  getVisibleCompositionAudioHandles,
} from './compositionTracks';

describe('composition track layout helpers', () => {
  it('shows only requested mini-timeline audio handles by default', () => {
    expect(getVisibleCompositionAudioHandles(1, [])).toEqual(['composition-audio-1']);
    expect(getVisibleCompositionAudioHandles(3, [])).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
    ]);
  });

  it('keeps hidden connected audio tracks visible so existing edges stay reachable', () => {
    expect(getVisibleCompositionAudioHandles(1, [undefined, undefined, true])).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
    ]);
  });

  it('clamps invalid requested audio track counts into the supported mini-timeline range', () => {
    expect(getVisibleCompositionAudioHandles(0, [])).toEqual(['composition-audio-1']);
    expect(getVisibleCompositionAudioHandles(12, [])).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
      'composition-audio-4',
    ]);
  });
});
