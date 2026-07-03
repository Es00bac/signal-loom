/**
 * Labeled, colored timeline markers for the Video sequencer (gap audit 808, rank 74).
 * Distinct from snap POINTS (bare seconds used by the snap tool): markers carry a label and
 * color for notes/sync/feedback, render as flags in the ruler, and also act as snap targets.
 */

export interface TimelineMarker {
  id: string;
  seconds: number;
  label: string;
  color: string;
}

export const TIMELINE_MARKER_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#f87171'] as const;

export function normalizeTimelineMarkers(value: unknown): TimelineMarker[] {
  if (!Array.isArray(value)) return [];
  const markers: TimelineMarker[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<TimelineMarker>;
    const seconds = Number(candidate.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    markers.push({
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `marker-${Math.random().toString(36).slice(2, 10)}`,
      seconds: Math.round(seconds * 1000) / 1000,
      label: typeof candidate.label === 'string' ? candidate.label : '',
      color: typeof candidate.color === 'string' && candidate.color ? candidate.color : TIMELINE_MARKER_COLORS[0],
    });
  }
  return markers.sort((a, b) => a.seconds - b.seconds);
}

/** Add a marker at `seconds`; auto-label ("Marker N") and cycle the palette. No duplicates within 50ms. */
export function addTimelineMarker(markers: readonly TimelineMarker[], seconds: number): TimelineMarker[] {
  const normalized = Math.max(0, Math.round(seconds * 1000) / 1000);
  if (markers.some((marker) => Math.abs(marker.seconds - normalized) < 0.05)) {
    return [...markers];
  }
  const marker: TimelineMarker = {
    id: `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seconds: normalized,
    label: `Marker ${markers.length + 1}`,
    color: TIMELINE_MARKER_COLORS[markers.length % TIMELINE_MARKER_COLORS.length],
  };
  return [...markers, marker].sort((a, b) => a.seconds - b.seconds);
}

export function removeTimelineMarker(markers: readonly TimelineMarker[], markerId: string): TimelineMarker[] {
  return markers.filter((marker) => marker.id !== markerId);
}

export function updateTimelineMarker(
  markers: readonly TimelineMarker[],
  markerId: string,
  patch: Partial<Pick<TimelineMarker, 'label' | 'color' | 'seconds'>>,
): TimelineMarker[] {
  return markers
    .map((marker) => (marker.id === markerId ? { ...marker, ...patch } : marker))
    .sort((a, b) => a.seconds - b.seconds);
}
