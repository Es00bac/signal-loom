import { describe, expect, it } from 'vitest';
import { addTimelineMarker, normalizeTimelineMarkers, removeTimelineMarker, TIMELINE_MARKER_COLORS, updateTimelineMarker } from './editorTimelineMarkers';

describe('editor timeline markers', () => {
  it('normalizes junk: drops invalid entries, sorts by time, fills defaults', () => {
    const markers = normalizeTimelineMarkers([
      { seconds: 5, label: 'b' },
      { seconds: -1 },
      { seconds: 'x' },
      null,
      { id: 'keep', seconds: 1.2345, label: 'a', color: '#123456' },
    ]);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ id: 'keep', seconds: 1.235, label: 'a', color: '#123456' });
    expect(markers[1].label).toBe('b');
    expect(markers[1].color).toBe(TIMELINE_MARKER_COLORS[0]);
  });

  it('adds auto-labeled markers cycling the palette, sorted, no near-duplicates', () => {
    let markers = addTimelineMarker([], 4);
    markers = addTimelineMarker(markers, 2);
    expect(markers.map((m) => m.seconds)).toEqual([2, 4]);
    expect(markers.map((m) => m.label).sort()).toEqual(['Marker 1', 'Marker 2']);
    expect(markers[0].color).not.toBe(markers[1].color);
    // adding within 50ms of an existing marker is a no-op
    expect(addTimelineMarker(markers, 2.01)).toHaveLength(2);
  });

  it('removes and updates by id, keeping time order', () => {
    let markers = addTimelineMarker(addTimelineMarker([], 1), 3);
    const first = markers[0];
    markers = updateTimelineMarker(markers, first.id, { seconds: 5, label: 'moved' });
    expect(markers[1]).toMatchObject({ id: first.id, seconds: 5, label: 'moved' });
    expect(removeTimelineMarker(markers, first.id)).toHaveLength(1);
  });
});
