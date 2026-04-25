import type { CompositionTargetHandle, NodeData } from '../types/flow';

export const COMPOSITION_VIDEO_HANDLE: CompositionTargetHandle = 'composition-video';
export const COMPOSITION_AUDIO_HANDLES: CompositionTargetHandle[] = [
  'composition-audio-1',
  'composition-audio-2',
  'composition-audio-3',
  'composition-audio-4',
];

export function getVisibleCompositionAudioHandles(
  requestedTrackCount: unknown,
  connectedTracks: readonly unknown[] = [],
): CompositionTargetHandle[] {
  const requestedCount = clampCompositionAudioTrackCount(requestedTrackCount);
  const highestConnectedCount = connectedTracks.reduce<number>((highest, track, index) => (
    track ? Math.max(highest, index + 1) : highest
  ), 0);
  const visibleCount = clampCompositionAudioTrackCount(Math.max(requestedCount, highestConnectedCount));

  return COMPOSITION_AUDIO_HANDLES.slice(0, visibleCount);
}

interface CompositionTrackSettings {
  offsetMs: number;
  volumePercent: number;
  enabled: boolean;
}

export function getCompositionTrackSettings(
  nodeData: NodeData,
  handle: CompositionTargetHandle,
): CompositionTrackSettings {
  switch (handle) {
    case 'composition-audio-1':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio1OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio1Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio1Enabled, true),
      };
    case 'composition-audio-2':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio2OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio2Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio2Enabled, true),
      };
    case 'composition-audio-3':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio3OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio3Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio3Enabled, true),
      };
    case 'composition-audio-4':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio4OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio4Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio4Enabled, true),
      };
    case 'composition-video':
      return {
        offsetMs: 0,
        volumePercent: coerceNumber(nodeData.compositionVideoAudioVolume, 100),
        enabled: true,
      };
  }
}

export function getCompositionTrackKeys(handle: CompositionTargetHandle): {
  offsetKey?: keyof NodeData;
  volumeKey?: keyof NodeData;
  enabledKey?: keyof NodeData;
} {
  switch (handle) {
    case 'composition-audio-1':
      return {
        offsetKey: 'compositionAudio1OffsetMs',
        volumeKey: 'compositionAudio1Volume',
        enabledKey: 'compositionAudio1Enabled',
      };
    case 'composition-audio-2':
      return {
        offsetKey: 'compositionAudio2OffsetMs',
        volumeKey: 'compositionAudio2Volume',
        enabledKey: 'compositionAudio2Enabled',
      };
    case 'composition-audio-3':
      return {
        offsetKey: 'compositionAudio3OffsetMs',
        volumeKey: 'compositionAudio3Volume',
        enabledKey: 'compositionAudio3Enabled',
      };
    case 'composition-audio-4':
      return {
        offsetKey: 'compositionAudio4OffsetMs',
        volumeKey: 'compositionAudio4Volume',
        enabledKey: 'compositionAudio4Enabled',
      };
    case 'composition-video':
      return {};
  }
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function clampCompositionAudioTrackCount(value: unknown): number {
  return Math.max(1, Math.min(COMPOSITION_AUDIO_HANDLES.length, Math.floor(coerceNumber(value, 1))));
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}
