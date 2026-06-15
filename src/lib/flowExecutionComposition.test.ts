import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import { composeSequenceMedia } from './mediaComposition';
import type { ManualEditorVisualSequenceClip } from './manualEditorSequence';
import type { AppNode, RuntimeSettingsSnapshot, VideoRenderAssemblyManifestData } from '../types/flow';

vi.mock('./mediaComposition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mediaComposition')>();
  return {
    ...actual,
    composeSequenceMedia: vi.fn(),
  };
});

const mockedComposeSequenceMedia = vi.mocked(composeSequenceMedia);

const settings = {
  apiKeys: {},
  defaultModels: {},
  providerSettings: {
    renderBackendPreference: 'native-cpu',
    localNativeRenderUrl: 'http://127.0.0.1:41736',
    batchMaxRetries: 0,
    batchRetryBaseDelayMs: 1,
  },
} as RuntimeSettingsSnapshot;

const compositionNode = {
  id: 'composition-1',
  type: 'composition',
  position: { x: 0, y: 0 },
  data: {},
} as AppNode;

const visualClip = {
  sourceNodeId: 'clip-dirty',
  sourceKind: 'image',
  trackIndex: 0,
  startMs: 0,
  assetUrl: 'data:image/png;base64,UE5H',
  sourceInMs: 0,
  durationSeconds: 2,
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
  blendMode: 'normal',
  transitionIn: 'none',
  transitionOut: 'none',
  transitionDurationMs: 0,
  textFontFamily: 'Inter, system-ui, sans-serif',
  textSizePx: 64,
  textColor: '#f3f4f6',
  textEffect: 'shadow',
  textBackgroundOpacityPercent: 0,
} satisfies ManualEditorVisualSequenceClip;

describe('executeNodeRequest composition metadata', () => {
  beforeEach(() => {
    mockedComposeSequenceMedia.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sequence-output');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps native segment artifacts on composition output metadata', async () => {
    const segmentArtifacts = [
      {
        key: '1000-2000',
        signature: 'sig-dirty',
        startMs: 1000,
        endMs: 2000,
        fileName: 'segment-1000-2000.mp4',
        mimeType: 'video/mp4',
        base64: 'AQID',
      },
    ];
    const nativeAssemblyManifest = {
      version: 1,
      kind: 'video-render-segment-assembly',
      mode: 'safe-artifact-assembly',
      segments: [
        {
          key: '1000-2000',
          startMs: 1000,
          endMs: 2000,
          activeClipIds: ['clip-dirty'],
          signature: 'sig-dirty',
          action: 'render-dirty-span',
          reason: 'timeline span changed',
        },
      ],
    } satisfies VideoRenderAssemblyManifestData;
    mockedComposeSequenceMedia.mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      extension: 'mp4',
      fileName: 'sequence-output.mp4',
      renderBackend: 'cpu',
      segmentArtifacts,
      assemblyResult: {
        assembledFromSegments: false,
        assemblyUnavailableReason: 'Cached segment 0-1000 must be a materialized data URL for native assembly.',
      },
    });

    const result = await executeNodeRequest(
      compositionNode,
      {
        prompt: '',
        config: DEFAULT_EXECUTION_CONFIG,
        visualSequenceClips: [visualClip],
        sequenceAudioInputs: [],
        nativeAssemblyManifest,
      },
      settings,
    );

    expect(result.outputMetadata).toEqual({
      segmentArtifacts,
      assemblyResult: {
        assembledFromSegments: false,
        assemblyUnavailableReason: 'Cached segment 0-1000 must be a materialized data URL for native assembly.',
      },
    });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(mockedComposeSequenceMedia).toHaveBeenCalledWith(expect.objectContaining({
      nativeAssemblyManifest,
    }));
  });
});
