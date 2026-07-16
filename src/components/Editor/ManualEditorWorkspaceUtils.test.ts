import { describe, expect, it } from 'vitest';
import { createEditorVisualClip } from '../../lib/manualEditorState';
import { getProgramStageClips } from './ManualEditorWorkspaceUtils';

describe('getProgramStageClips', () => {
  it.each(['speech-bubble', 'thought-bubble', 'caption'] as const)(
    'keeps a %s comic visible throughout its resolved interval, including its end boundary',
    (comicKind) => {
      const clip = createEditorVisualClip(`comic-${comicKind}`, 'comic', {
        startMs: 2_000,
        durationSeconds: 4,
        comicKind,
      });
      const stageAt = (playheadSeconds: number) => getProgramStageClips(
        [clip],
        new Map(),
        new Map(),
        {},
        {},
        playheadSeconds,
      );

      expect(stageAt(1.999)).toEqual([]);
      expect(stageAt(2)).toHaveLength(1);
      expect(stageAt(5.999)).toHaveLength(1);
      expect(stageAt(6)).toHaveLength(1);
      expect(stageAt(6.001)).toEqual([]);
    },
  );
});
