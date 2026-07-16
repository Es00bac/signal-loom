// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveVisualClipDuration } from '../../../lib/manualEditorTimeline';
import { createEditorVisualClip } from '../../../lib/manualEditorState';
import { InspectorPanel } from './VideoWorkspace';

describe('InspectorPanel comic duration', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
  });

  it.each(['speech-bubble', 'thought-bubble', 'caption'] as const)(
    'edits %s through the still-duration field consumed by the timeline resolver',
    (comicKind) => {
      const clip = createEditorVisualClip(`comic-${comicKind}`, 'comic', {
        durationSeconds: 4,
        comicKind,
      });
      const onUpdateVisualClip = vi.fn();

      act(() => {
        root!.render(
          <InspectorPanel
            audioTrackVolumes={[]}
            onAddOrUpdateKeyframe={vi.fn()}
            onCommitVisualCropAsImageAsset={vi.fn()}
            onEditVisualText={vi.fn()}
            onGenerateNarrationFromText={vi.fn()}
            onJumpKeyframe={vi.fn()}
            onMoveAudioToTrack={vi.fn()}
            onMoveVisualToTrack={vi.fn()}
            onRemoveAudioClip={vi.fn()}
            onRemoveAudioKeyframe={vi.fn()}
            onRemoveStageObject={vi.fn()}
            onRemoveVisualClip={vi.fn()}
            onRemoveVisualKeyframe={vi.fn()}
            onSelectSource={vi.fn()}
            onUpdateAudioClip={vi.fn()}
            onUpdateAudioKeyframe={vi.fn()}
            onUpdateStageObject={vi.fn()}
            onUpdateVisualClip={onUpdateVisualClip}
            onUpdateVisualKeyframe={vi.fn()}
            sequenceDurationSeconds={4}
            timelineCursorSeconds={0}
            visualClip={clip}
            visualDurationSeconds={resolveVisualClipDuration(clip, new Map(), {})}
          />,
        );
      });

      const durationInput = [...host!.querySelectorAll('label')].find((label) =>
        label.firstElementChild?.textContent === 'Clip duration',
      )?.querySelector('input');
      expect(durationInput).toBeTruthy();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(durationInput, '6');
      act(() => durationInput!.dispatchEvent(new Event('input', { bubbles: true })));

      expect(onUpdateVisualClip).toHaveBeenCalledWith({ durationSeconds: 6 });
      expect(resolveVisualClipDuration({ ...clip, ...onUpdateVisualClip.mock.calls[0][0] }, new Map(), {})).toBe(6);
    },
  );
});
