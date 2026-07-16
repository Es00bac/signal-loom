import { describe, expect, it } from 'vitest';
import {
  buildVideoRenderClipSignature,
  buildVideoRenderDirtyPlan,
} from './videoRenderSegments';

describe('buildVideoRenderClipSignature', () => {
  it('changes when clip effects change but ignores label-only metadata', () => {
    const baseClip = {
      id: 'clip-a',
      sourceNodeId: 'source-a',
      trackIndex: 0,
      startMs: 0,
      durationMs: 4000,
      sourceInMs: 0,
      fitMode: 'contain',
      opacityPercent: 100,
      scalePercent: 60,
      positionX: -180,
      positionY: 0,
      chromaKey: { enabled: true, color: '#00ff00', similarityPercent: 20, blendPercent: 6 },
      stroke: { enabled: true, color: '#ffffff', widthPx: 4, opacityPercent: 100 },
      filterStack: [],
      label: 'Presenter',
    };

    const base = buildVideoRenderClipSignature(baseClip);
    const relabeled = buildVideoRenderClipSignature({ ...baseClip, label: 'Renamed presenter' });
    const changed = buildVideoRenderClipSignature({
      ...baseClip,
      stroke: { enabled: true, color: '#ff00cc', widthPx: 4, opacityPercent: 100 },
    });

    expect(relabeled).toBe(base);
    expect(changed).not.toBe(base);
  });

  it('changes when text clip content or styling changes', () => {
    const baseClip = {
      id: 'title',
      sourceNodeId: 'title-source',
      sourceKind: 'text',
      trackIndex: 0,
      startMs: 0,
      durationMs: 3000,
      sourceInMs: 0,
      textContent: 'Opening title',
      textFontFamily: 'Inter, system-ui, sans-serif',
      textSizePx: 72,
      textColor: '#f3f4f6',
      textEffect: 'shadow',
      textBackgroundOpacityPercent: 0,
    };

    const base = buildVideoRenderClipSignature(baseClip);
    const changedText = buildVideoRenderClipSignature({ ...baseClip, textContent: 'Revised title' });
    const changedStyle = buildVideoRenderClipSignature({ ...baseClip, textColor: '#ff00cc' });
    const changedManagedFace = buildVideoRenderClipSignature({
      ...baseClip,
      textTypography: {
        fontWeight: 400,
        fontStyle: 'normal',
        managedFace: {
          kind: 'bundled', faceId: 'liberation:regular', family: 'Liberation Sans',
          weight: 400, style: 'normal', stretchPercent: 100,
        },
      },
    });

    expect(changedText).not.toBe(base);
    expect(changedStyle).not.toBe(base);
    expect(changedManagedFace).not.toBe(base);
  });
});

describe('buildVideoRenderDirtyPlan', () => {
  it('marks only timeline spans touched by changed active clip signatures', () => {
    const unchangedPresenterSignature = buildVideoRenderClipSignature({
      id: 'presenter',
      sourceNodeId: 'presenter-source',
      trackIndex: 1,
      startMs: 1000,
      durationMs: 3000,
      sourceInMs: 0,
      chromaKey: { enabled: true, color: '#00ff00', similarityPercent: 20, blendPercent: 6 },
    });
    const oldOverlaySignature = buildVideoRenderClipSignature({
      id: 'overlay',
      sourceNodeId: 'overlay-source',
      trackIndex: 2,
      startMs: 2500,
      durationMs: 2000,
      sourceInMs: 0,
      stroke: { enabled: true, color: '#ffffff', widthPx: 2, opacityPercent: 100 },
    });
    const oldPlan = buildVideoRenderDirtyPlan({
      clips: [
        { id: 'presenter', trackIndex: 1, startMs: 1000, durationMs: 3000, signature: unchangedPresenterSignature },
        { id: 'overlay', trackIndex: 2, startMs: 2500, durationMs: 2000, signature: oldOverlaySignature },
      ],
      previousSegmentSignatures: {},
    });
    const previousSegmentSignatures = Object.fromEntries(
      oldPlan.segments.map((segment) => [segment.key, segment.signature]),
    );
    const newOverlaySignature = buildVideoRenderClipSignature({
      id: 'overlay',
      sourceNodeId: 'overlay-source',
      trackIndex: 2,
      startMs: 2500,
      durationMs: 2000,
      sourceInMs: 0,
      stroke: { enabled: true, color: '#ff00cc', widthPx: 2, opacityPercent: 100 },
    });

    const nextPlan = buildVideoRenderDirtyPlan({
      clips: [
        { id: 'presenter', trackIndex: 1, startMs: 1000, durationMs: 3000, signature: unchangedPresenterSignature },
        { id: 'overlay', trackIndex: 2, startMs: 2500, durationMs: 2000, signature: newOverlaySignature },
      ],
      previousSegmentSignatures,
    });

    expect(nextPlan.segments.map((segment) => ({
      key: segment.key,
      activeClipIds: segment.activeClipIds,
      dirty: segment.dirty,
    }))).toEqual([
      { key: '1000-2500', activeClipIds: ['presenter'], dirty: false },
      { key: '2500-4000', activeClipIds: ['presenter', 'overlay'], dirty: true },
      { key: '4000-4500', activeClipIds: ['overlay'], dirty: true },
    ]);
    expect(nextPlan.dirtySegments.map((segment) => segment.key)).toEqual(['2500-4000', '4000-4500']);
  });
});
