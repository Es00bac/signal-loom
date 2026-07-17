import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

vi.mock('./localNativeRender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./localNativeRender')>();

  return {
    ...actual,
    renderViaLocalNativeFFmpeg: vi.fn(),
    renderViaLocalNativeFFmpegWithArtifacts: vi.fn(),
    resolveNativeRenderTarget: vi.fn(),
  };
});

vi.mock('./gifFrames', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gifFrames')>();

  return {
    ...actual,
    probeGifAnimation: vi.fn(actual.probeGifAnimation),
  };
});

import {
  buildCompositionCommand,
  buildSequenceCommand,
  buildVisualClipInputArgs,
  composeSequenceMedia,
  describeSequenceRenderBackend,
  describeSequenceRenderBackendCaveat,
  drawTextStageObject,
  assertCanvasCanPaintExactManagedVideoFace,
  packageSequenceFramesAsZip,
  resolveSequenceVisualClipDuration,
} from './mediaComposition';
import {
  renderViaLocalNativeFFmpeg,
  renderViaLocalNativeFFmpegWithArtifacts,
  resolveNativeRenderTarget,
} from './localNativeRender';
import { probeGifAnimation } from './gifFrames';
import { getVideoExportPresetOption } from './videoPremiereParity';
import { resolveVideoExportPreset } from './videoPremiereParity';
import type { ComposeSequenceVisualClip } from './mediaComposition';
import type { ProviderSettings, VideoRenderAssemblyManifestData } from '../types/flow';

const mockedRenderViaLocalNativeFFmpeg = vi.mocked(renderViaLocalNativeFFmpeg);
const mockedRenderViaLocalNativeFFmpegWithArtifacts = vi.mocked(renderViaLocalNativeFFmpegWithArtifacts);
const mockedResolveNativeRenderTarget = vi.mocked(resolveNativeRenderTarget);
const mockedProbeGifAnimation = vi.mocked(probeGifAnimation);

function comicClip(): ComposeSequenceVisualClip {
  return {
    sourceNodeId: 'comic-source',
    sourceKind: 'comic',
    trackIndex: 0,
    startMs: 0,
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
    transitionIn: 'none',
    transitionOut: 'none',
    transitionDurationMs: 0,
    textFontFamily: 'Inter, system-ui, sans-serif',
    textSizePx: 64,
    textColor: '#ffffff',
    textEffect: 'none',
    textBackgroundOpacityPercent: 0,
  };
}

beforeEach(() => {
  mockedRenderViaLocalNativeFFmpeg.mockReset();
  mockedRenderViaLocalNativeFFmpegWithArtifacts.mockReset();
  mockedResolveNativeRenderTarget.mockReset();
  mockedProbeGifAnimation.mockClear();
});

describe('buildCompositionCommand', () => {
  it('builds an ffmpeg command that delays and mixes enabled audio tracks into the video', () => {
    const command = buildCompositionCommand({
      videoInputName: 'video.mp4',
      audioTracks: [
        {
          inputName: 'audio-1.mp3',
          delayMs: 0,
          volumePercent: 100,
          enabled: true,
        },
        {
          inputName: 'audio-2.mp3',
          delayMs: 1250,
          volumePercent: 65,
          enabled: true,
        },
      ],
      outputName: 'composition.mp4',
    });

    expect(command).toContain('-filter_complex');
    expect(command.join(' ')).toContain('adelay=0|0');
    expect(command.join(' ')).toContain('adelay=1250|1250');
    expect(command.join(' ')).toContain('volume=0.65');
    expect(command.join(' ')).toContain('amix=inputs=2:duration=longest');
    expect(command).not.toContain('-shortest');
    expect(command.slice(-1)[0]).toBe('composition.mp4');
  });

  it('passes the source video through when no enabled audio tracks are present', () => {
    const command = buildCompositionCommand({
      videoInputName: 'video.mp4',
      audioTracks: [
        {
          inputName: 'audio-1.mp3',
          delayMs: 250,
          volumePercent: 100,
          enabled: false,
        },
      ],
      outputName: 'composition.mp4',
    });

    expect(command.join(' ')).not.toContain('amix=');
    expect(command).toEqual([
      '-y',
      '-i',
      'video.mp4',
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      'composition.mp4',
    ]);
  });

  it('preserves embedded video audio when requested without extra tracks', () => {
    const command = buildCompositionCommand({
      videoInputName: 'video.mp4',
      audioTracks: [],
      outputName: 'composition.mp4',
      useVideoAudio: true,
    });

    expect(command).toEqual([
      '-y',
      '-i',
      'video.mp4',
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      'composition.mp4',
    ]);
  });
});

describe('composeSequenceMedia', () => {
  it('passes safe artifact assembly manifests to local render jobs', async () => {
    mockedResolveNativeRenderTarget.mockResolvedValue({
      endpoint: 'http://127.0.0.1:41736',
      backend: 'cpu',
    });
    const nativeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
    mockedRenderViaLocalNativeFFmpeg.mockResolvedValue(nativeBlob);
    const assemblyManifest = {
      version: 1,
      kind: 'video-render-segment-assembly',
      mode: 'safe-artifact-assembly',
      summary: 'Segment artifact reuse: 1 reusable cached span, 1 queued dirty span.',
      caveat: 'Native artifact assembly can reuse materialized cached spans; dirty spans are still extracted from a full render until dirty-span-only rendering lands.',
      segments: [
        {
          key: '0-1000',
          startMs: 0,
          endMs: 1000,
          activeClipIds: ['clip-clean'],
          signature: 'sig-clean',
          action: 'reuse-cached-segment',
          cachedUrl: 'blob:clean-span',
        },
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

    await expect(composeSequenceMedia({
      visualClips: [
        {
          sourceNodeId: 'clip-clean',
          sourceKind: 'image',
          trackIndex: 0,
          startMs: 0,
          assetUrl: 'data:image/png;base64,UE5H',
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
          transitionIn: 'none',
          transitionOut: 'none',
          transitionDurationMs: 0,
          textFontFamily: 'Inter, system-ui, sans-serif',
          textSizePx: 64,
          textColor: '#f3f4f6',
          textEffect: 'shadow',
          textBackgroundOpacityPercent: 0,
        },
      ],
      audioTracks: [],
      aspectRatio: '16:9',
      videoResolution: '720p',
      frameRate: 30,
      providerSettings: {
        renderBackendPreference: 'native-cpu',
        localNativeRenderUrl: 'http://127.0.0.1:41736',
      } as ProviderSettings,
      nativeAssemblyManifest: assemblyManifest,
    })).resolves.toMatchObject({
      blob: nativeBlob,
      renderBackend: 'cpu',
    });

    expect(mockedRenderViaLocalNativeFFmpeg).toHaveBeenCalledWith(expect.objectContaining({
      assemblyManifest,
    }));
  });

  it('returns native segment artifacts from artifact-aware sequence renders', async () => {
    mockedResolveNativeRenderTarget.mockResolvedValue({
      endpoint: 'http://127.0.0.1:41736',
      backend: 'cpu',
    });
    const nativeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
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
    mockedRenderViaLocalNativeFFmpegWithArtifacts.mockResolvedValue({
      blob: nativeBlob,
      segmentArtifacts,
      assemblyResult: {
        assembledFromSegments: true,
      },
    });
    const assemblyManifest = {
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

    await expect(composeSequenceMedia({
      visualClips: [
        {
          sourceNodeId: 'clip-dirty',
          sourceKind: 'image',
          trackIndex: 0,
          startMs: 0,
          assetUrl: 'data:image/png;base64,UE5H',
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
          transitionIn: 'none',
          transitionOut: 'none',
          transitionDurationMs: 0,
          textFontFamily: 'Inter, system-ui, sans-serif',
          textSizePx: 64,
          textColor: '#f3f4f6',
          textEffect: 'shadow',
          textBackgroundOpacityPercent: 0,
        },
      ],
      audioTracks: [],
      aspectRatio: '16:9',
      videoResolution: '720p',
      frameRate: 30,
      providerSettings: {
        renderBackendPreference: 'native-cpu',
        localNativeRenderUrl: 'http://127.0.0.1:41736',
      } as ProviderSettings,
      nativeAssemblyManifest: assemblyManifest,
    })).resolves.toMatchObject({
      blob: nativeBlob,
      renderBackend: 'cpu',
      segmentArtifacts,
      assemblyResult: {
        assembledFromSegments: true,
      },
    });

    expect(mockedRenderViaLocalNativeFFmpegWithArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      assemblyManifest,
    }));
    expect(mockedRenderViaLocalNativeFFmpeg).not.toHaveBeenCalled();
  });

  it('loops an image clip detected as an animated GIF instead of freezing it', async () => {
    mockedResolveNativeRenderTarget.mockResolvedValue({
      endpoint: 'http://127.0.0.1:41736',
      backend: 'cpu',
    });
    mockedProbeGifAnimation.mockResolvedValueOnce({ isAnimated: true, frameCount: 12 });
    mockedRenderViaLocalNativeFFmpeg.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'video/mp4' }));

    await composeSequenceMedia({
      visualClips: [
        {
          sourceNodeId: 'clip-gif',
          sourceKind: 'image',
          trackIndex: 0,
          startMs: 0,
          assetUrl: 'data:image/gif;base64,AAAA',
          mimeType: 'image/gif',
          durationSeconds: 3,
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
          transitionIn: 'none',
          transitionOut: 'none',
          transitionDurationMs: 0,
          textFontFamily: 'Inter, system-ui, sans-serif',
          textSizePx: 64,
          textColor: '#f3f4f6',
          textEffect: 'shadow',
          textBackgroundOpacityPercent: 0,
        },
      ],
      audioTracks: [],
      aspectRatio: '16:9',
      videoResolution: '720p',
      frameRate: 30,
      providerSettings: {
        renderBackendPreference: 'native-cpu',
        localNativeRenderUrl: 'http://127.0.0.1:41736',
      } as ProviderSettings,
    });

    expect(mockedProbeGifAnimation).toHaveBeenCalledTimes(1);
    const [request] = mockedRenderViaLocalNativeFFmpeg.mock.calls[0] as [{ command: string[] }];
    expect(request.command.join(' ')).toContain('-ignore_loop 0 -t 3.000');
    expect(request.command.join(' ')).not.toContain('-loop 1');
  });

  it('never probes a non-GIF image clip for animation', async () => {
    mockedResolveNativeRenderTarget.mockResolvedValue({
      endpoint: 'http://127.0.0.1:41736',
      backend: 'cpu',
    });
    mockedRenderViaLocalNativeFFmpeg.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'video/mp4' }));

    await composeSequenceMedia({
      visualClips: [
        {
          sourceNodeId: 'clip-png',
          sourceKind: 'image',
          trackIndex: 0,
          startMs: 0,
          assetUrl: 'data:image/png;base64,UE5H',
          mimeType: 'image/png',
          durationSeconds: 3,
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
          transitionIn: 'none',
          transitionOut: 'none',
          transitionDurationMs: 0,
          textFontFamily: 'Inter, system-ui, sans-serif',
          textSizePx: 64,
          textColor: '#f3f4f6',
          textEffect: 'shadow',
          textBackgroundOpacityPercent: 0,
        },
      ],
      audioTracks: [],
      aspectRatio: '16:9',
      videoResolution: '720p',
      frameRate: 30,
      providerSettings: {
        renderBackendPreference: 'native-cpu',
        localNativeRenderUrl: 'http://127.0.0.1:41736',
      } as ProviderSettings,
    });

    expect(mockedProbeGifAnimation).not.toHaveBeenCalled();
    const [request] = mockedRenderViaLocalNativeFFmpeg.mock.calls[0] as [{ command: string[] }];
    expect(request.command.join(' ')).toContain('-loop 1 -t 3.000');
  });
});

describe('buildVisualClipInputArgs', () => {
  it('loops an animated GIF image clip instead of freezing it, honoring the clip duration', () => {
    expect(buildVisualClipInputArgs('image', 'clip-1.gif', 4, true)).toEqual([
      '-ignore_loop', '0', '-t', '4.000', '-i', 'clip-1.gif',
    ]);
  });

  it('keeps the exact -loop 1 behavior for non-animated image clips (including static GIFs)', () => {
    expect(buildVisualClipInputArgs('image', 'clip-1.png', 4, false)).toEqual([
      '-loop', '1', '-t', '4.000', '-i', 'clip-1.png',
    ]);
    expect(buildVisualClipInputArgs('image', 'clip-1.png', 4, undefined)).toEqual([
      '-loop', '1', '-t', '4.000', '-i', 'clip-1.png',
    ]);
  });

  it('keeps looping text and shape clips regardless of the (irrelevant) isAnimatedGif flag', () => {
    expect(buildVisualClipInputArgs('text', 'clip-1.png', 2, true)).toEqual([
      '-loop', '1', '-t', '2.000', '-i', 'clip-1.png',
    ]);
    expect(buildVisualClipInputArgs('shape', 'clip-1.png', 2, true)).toEqual([
      '-loop', '1', '-t', '2.000', '-i', 'clip-1.png',
    ]);
  });

  it('loops rendered comic cards for their resolved still duration', async () => {
    const comicDuration = await resolveSequenceVisualClipDuration(comicClip(), async () => 0);

    expect(comicDuration).toBe(4);
    expect(buildVisualClipInputArgs('comic', 'sequence-comic-1.png', comicDuration)).toEqual([
      '-loop', '1', '-t', '4.000', '-i', 'sequence-comic-1.png',
    ]);
  });

  it('never loops video/composition clips, regardless of the (irrelevant) isAnimatedGif flag', () => {
    expect(buildVisualClipInputArgs('video', 'clip-1.mp4', 4, true)).toEqual(['-i', 'clip-1.mp4']);
    expect(buildVisualClipInputArgs('composition', 'clip-1.mp4', 4, true)).toEqual(['-i', 'clip-1.mp4']);
  });
});

describe('buildSequenceCommand', () => {
  it('keeps a static comic visible for its resolved interval in browser video and image-sequence exports', async () => {
    const clip = comicClip();
    const clipDurationSeconds = await resolveSequenceVisualClipDuration(clip, async () => 0);
    const preparedClips = [{
      clip,
      inputIndex: 1,
      inputName: 'sequence-comic-1.png',
      sourceUrl: 'data:image/png;base64,comic',
      clipDurationSeconds,
    }];
    const common = {
      preparedClips,
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: clipDurationSeconds,
      frameRate: 30,
      nativeBackend: null,
    };

    const browserCommand = buildSequenceCommand({
      ...common,
      outputName: 'sequence-output.mp4',
    });
    const imageSequenceCommand = buildSequenceCommand({
      ...common,
      exportPreset: resolveVideoExportPreset('png-image-sequence'),
      outputName: 'sequence-frame-%05d.png',
    });

    for (const command of [browserCommand, imageSequenceCommand]) {
      const filterGraph = command[command.indexOf('-filter_complex') + 1];
      expect(command.join(' ')).toContain('-loop 1 -t 4.000 -i sequence-comic-1.png');
      expect(filterGraph).toContain('[1:v]setpts=PTS-STARTPTS,trim=duration=4.000,fps=30,format=rgba');
      expect(filterGraph).toContain('eof_action=pass');
    }
    expect(imageSequenceCommand).toEqual(expect.arrayContaining(['-frames:v', '120']));
  });

  it('describes render backends in user-facing GPU/CPU terms', () => {
    expect(describeSequenceRenderBackend('amd-vaapi')).toBe('AMD VAAPI GPU encode (h264_vaapi)');
    expect(describeSequenceRenderBackend('cpu')).toBe('native CPU FFmpeg');
    expect(describeSequenceRenderBackend('browser')).toBe('browser FFmpeg');
    expect(describeSequenceRenderBackendCaveat('amd-vaapi')).toContain('final encode is GPU accelerated');
    expect(describeSequenceRenderBackendCaveat('cpu')).not.toContain('GPU');
    expect(describeSequenceRenderBackendCaveat('browser')).not.toContain('GPU');
  });

  it('overlays prepared stage objects after timeline visual clips', () => {
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [],
      preparedStageObjects: [
        {
          inputIndex: 1,
          inputName: 'stage-text.png',
          sourceUrl: 'stage-text.png',
          object: {
            id: 'text-1',
            kind: 'text',
            x: 120,
            y: 80,
            width: 420,
            height: 120,
            rotationDeg: 0,
            opacityPercent: 80,
            blendMode: 'normal',
            text: 'Title',
            fontFamily: 'Inter',
            fontSizePx: 72,
            color: '#ffffff',
          },
        },
      ],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 24,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(command.join(' ')).toContain('-i color=c=black:s=1280x720:r=24');
    expect(command.join(' ')).toContain('-loop 1 -t 4.000 -i stage-text.png');
    expect(filterGraph).toContain('[base0][stage1]overlay=0:0[stagebase1]');
    expect(filterGraph).toContain('[stagebase1]format=yuv420p[vout]');
  });

  it('applies executable browser export preset codec args', () => {
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 30,
      exportPreset: {
        id: 'archive-high-quality',
        label: 'Archive High Quality',
        container: 'MP4',
        extension: 'mp4',
        mimeType: 'video/mp4',
        codec: 'High-quality H.264/AAC',
        videoCodecArgs: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p'],
        audioCodecArgs: ['-c:a', 'aac', '-b:a', '320k'],
        crf: 18,
        profile: 'high',
        frameRate: 30,
        intendedUse: 'Master handoff before downstream edits.',
        caveat: 'Browser render favors quality over speed.',
        capabilities: { browser: true, nativeCpu: true, nativeVaapi: true },
      },
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    expect(command.join(' ')).toContain('-r 30 -c:v libx264 -preset slow -crf 18');
    expect(command).not.toContain('ultrafast');
  });

  it('maps AMD VAAPI sequence renders to GPU upload and h264_vaapi encode args', () => {
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 30,
      exportPreset: {
        id: 'archive-high-quality',
        label: 'Archive High Quality',
        container: 'MP4',
        extension: 'mp4',
        mimeType: 'video/mp4',
        codec: 'High-quality H.264/AAC',
        videoCodecArgs: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p'],
        audioCodecArgs: ['-c:a', 'aac', '-b:a', '320k'],
        crf: 18,
        profile: 'high',
        frameRate: 30,
        intendedUse: 'Master handoff before downstream edits.',
        caveat: 'Browser render favors quality over speed.',
        capabilities: { browser: true, nativeCpu: true, nativeVaapi: true },
      },
      outputName: 'sequence-output.mp4',
      nativeBackend: 'amd-vaapi',
    });
    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(command).toEqual(expect.arrayContaining(['-vaapi_device', '/dev/dri/renderD128']));
    expect(filterGraph).toContain('[base0]format=nv12,hwupload[vout]');
    expect(command).toEqual(expect.arrayContaining(['-c:v', 'h264_vaapi']));
    expect(command.join(' ')).not.toContain('libx264');
  });

  it('omits audio mapping for silent GIF export presets', () => {
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [
        {
          inputName: 'music.opus',
          sourceUrl: 'music.opus',
          durationSeconds: 4,
          track: {
            url: 'music.opus',
            sourceNodeId: 'audio-1',
            sourceKind: 'audio',
            offsetMs: 0,
            trackIndex: 0,
            volumePercent: 100,
            enabled: true,
          },
        },
      ],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 30,
      exportPreset: {
        id: 'gif-preview',
        label: 'Animated GIF Preview',
        container: 'GIF',
        extension: 'gif',
        mimeType: 'image/gif',
        codec: 'GIF image stream',
        videoCodecArgs: ['-r', '12', '-loop', '0'],
        audioCodecArgs: [],
        intendedUse: 'Silent preview.',
        caveat: 'Silent.',
        capabilities: { browser: true, nativeCpu: true, nativeVaapi: false },
      },
      outputName: 'sequence-output.gif',
      nativeBackend: null,
    });

    expect(command).toContain('-an');
    expect(command).not.toEqual(expect.arrayContaining(['-map', '[aout]']));
    expect(command.slice(-1)[0]).toBe('sequence-output.gif');
  });

  it('renders PNG image sequences to a numbered MEMFS output pattern without audio', () => {
    const preset = getVideoExportPresetOption('png-image-sequence');
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [
        {
          inputName: 'music.mp3',
          sourceUrl: 'music.mp3',
          durationSeconds: 2,
          track: {
            url: 'music.mp3',
            sourceNodeId: 'audio-1',
            sourceKind: 'audio',
            offsetMs: 0,
            trackIndex: 0,
            volumePercent: 100,
            enabled: true,
          },
        },
      ],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 2,
      frameRate: 24,
      exportPreset: preset,
      outputName: preset.outputPattern ?? 'sequence-frame-%05d.png',
      nativeBackend: null,
    });
    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(command.join(' ')).not.toContain('-i music.mp3');
    expect(filterGraph).toContain('format=rgba[vout]');
    expect(command).toEqual(expect.arrayContaining(['-an', '-frames:v', '48', '-c:v', 'png']));
    expect(command.slice(-1)[0]).toBe('sequence-frame-%05d.png');
  });

  it('packages image sequence frames as a ZIP with manifest metadata', async () => {
    const result = packageSequenceFramesAsZip({
      frames: [
        { name: 'sequence-frame-00002.png', data: new Uint8Array([2]) },
        { name: 'sequence-frame-00001.png', data: new Uint8Array([1]) },
      ],
      exportPreset: getVideoExportPresetOption('png-image-sequence'),
      canvas: { width: 1920, height: 1080 },
      frameRate: 30,
      durationSeconds: 0.067,
    });
    const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));

    expect(result.mimeType).toBe('application/zip');
    expect(result.extension).toBe('zip');
    expect(result.imageSequence).toBe(true);
    expect(Object.keys(entries)).toEqual(expect.arrayContaining([
      'manifest.json',
      'sequence-frame-00001.png',
      'sequence-frame-00002.png',
    ]));
    expect(manifest).toMatchObject({
      presetId: 'png-image-sequence',
      frameMimeType: 'image/png',
      width: 1920,
      height: 1080,
      frameRate: 30,
      frameCount: 2,
      frames: ['sequence-frame-00001.png', 'sequence-frame-00002.png'],
    });
  });

  it('starts adjacent fade-in clips early for edit-point dissolve render overlap', () => {
    const baseClip = {
      sourceNodeId: 'source-1',
      sourceKind: 'image' as const,
      trackIndex: 0,
      sourceInMs: 0,
      trimStartMs: 0,
      trimEndMs: 0,
      playbackRate: 1,
      reversePlayback: false,
      fitMode: 'contain' as const,
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
      transitionDurationMs: 1000,
      textFontFamily: 'Inter, system-ui, sans-serif',
      textSizePx: 72,
      textColor: '#ffffff',
      textEffect: 'none' as const,
      textBackgroundOpacityPercent: 0,
    };
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'a.png',
          sourceUrl: 'a.png',
          clipDurationSeconds: 4,
          clip: { ...baseClip, id: 'a', startMs: 0, assetUrl: 'a.png', transitionIn: 'none' as const, transitionOut: 'fade' as const },
        },
        {
          inputIndex: 2,
          inputName: 'b.png',
          sourceUrl: 'b.png',
          clipDurationSeconds: 4,
          clip: { ...baseClip, id: 'b', startMs: 4000, assetUrl: 'b.png', transitionIn: 'fade' as const, transitionOut: 'none' as const },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 8,
      frameRate: 30,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain('fade=t=out:st=3.000:d=1.000:alpha=1');
    expect(filterGraph).toContain('fade=t=in:st=0:d=1.000:alpha=1');
    expect(filterGraph).toContain('setpts=PTS-STARTPTS+3.000/TB');
  });

  it('loops an animated GIF image clip in the ffmpeg command instead of freezing it', () => {
    const baseClip = {
      sourceNodeId: 'source-1',
      sourceKind: 'image' as const,
      trackIndex: 0,
      startMs: 0,
      assetUrl: 'a.gif',
      mimeType: 'image/gif',
      sourceInMs: 0,
      trimStartMs: 0,
      trimEndMs: 0,
      playbackRate: 1,
      reversePlayback: false,
      fitMode: 'contain' as const,
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
      transitionIn: 'none' as const,
      transitionOut: 'none' as const,
      transitionDurationMs: 0,
      textFontFamily: 'Inter, system-ui, sans-serif',
      textSizePx: 72,
      textColor: '#ffffff',
      textEffect: 'none' as const,
      textBackgroundOpacityPercent: 0,
    };
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'a.gif',
          sourceUrl: 'a.gif',
          clipDurationSeconds: 4,
          isAnimatedGif: true,
          clip: baseClip,
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 30,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    expect(command.join(' ')).toContain('-ignore_loop 0 -t 4.000 -i a.gif');
    expect(command.join(' ')).not.toContain('-loop 1 -t 4.000 -i a.gif');
  });

  it('keeps freezing a non-animated (static) GIF image clip exactly as before', () => {
    const baseClip = {
      sourceNodeId: 'source-1',
      sourceKind: 'image' as const,
      trackIndex: 0,
      startMs: 0,
      assetUrl: 'a.gif',
      mimeType: 'image/gif',
      sourceInMs: 0,
      trimStartMs: 0,
      trimEndMs: 0,
      playbackRate: 1,
      reversePlayback: false,
      fitMode: 'contain' as const,
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
      transitionIn: 'none' as const,
      transitionOut: 'none' as const,
      transitionDurationMs: 0,
      textFontFamily: 'Inter, system-ui, sans-serif',
      textSizePx: 72,
      textColor: '#ffffff',
      textEffect: 'none' as const,
      textBackgroundOpacityPercent: 0,
    };
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'a.gif',
          sourceUrl: 'a.gif',
          clipDurationSeconds: 4,
          isAnimatedGif: false,
          clip: baseClip,
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      frameRate: 30,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    expect(command.join(' ')).toContain('-loop 1 -t 4.000 -i a.gif');
    expect(command.join(' ')).not.toContain('-ignore_loop');
  });

  it('multiplies track volume with clip volume and clip automation for sequence audio', () => {
    const command = buildSequenceCommand({
      preparedClips: [],
      preparedAudioTracks: [
        {
          inputName: 'voice.mp3',
          sourceUrl: 'voice.mp3',
          durationSeconds: 4,
          track: {
            url: 'voice.mp3',
            sourceNodeId: 'audio-1',
            sourceKind: 'audio',
            offsetMs: 500,
            trackIndex: 1,
            trackVolumePercent: 25,
            volumePercent: 80,
            volumeAutomationPoints: [
              { timePercent: 0, valuePercent: 0 },
              { timePercent: 100, valuePercent: 100 },
            ],
            enabled: true,
          },
        },
      ],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain("volume='0.2000*(if(lte(t,4.0000)");
    expect(filterGraph).toContain('adelay=500|500');
  });

  it('sets scale filters with animated scale expressions to frame evaluation mode', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'clip.png',
          sourceUrl: 'clip.png',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'source-1',
            sourceKind: 'image',
            trackIndex: 0,
            startMs: 0,
            assetUrl: 'clip.png',
            durationSeconds: 4,
            trimStartMs: 0,
            trimEndMs: 0,
            playbackRate: 1,
            reversePlayback: false,
            fitMode: 'contain',
            scalePercent: 100,
            scaleMotionEnabled: true,
            endScalePercent: 150,
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
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain("scale='max(2,trunc(iw*((1.0000)+((1.5000)-(1.0000))*");
    expect(filterGraph).toContain(")*2)':eval=frame");
  });

  it('preserves source display aspect until after fit scaling media clips', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'clip.mp4',
          sourceUrl: 'clip.mp4',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'source-1',
            sourceKind: 'video',
            trackIndex: 0,
            startMs: 0,
            assetUrl: 'clip.mp4',
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
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];
    const clipFilter = filterGraph.split(';').find((part) => part.startsWith('[1:v]'));

    expect(clipFilter).toBeDefined();
    expect(clipFilter!.indexOf('scale=1280:720:force_original_aspect_ratio=decrease')).toBeGreaterThan(-1);
    expect(clipFilter!.indexOf('scale=1280:720:force_original_aspect_ratio=decrease')).toBeLessThan(
      clipFilter!.indexOf('setsar=1'),
    );
  });

  it('renders non-normal clip blend modes through a full-frame blend layer', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'overlay.png',
          sourceUrl: 'overlay.png',
          clipDurationSeconds: 3,
          clip: {
            sourceNodeId: 'overlay-1',
            sourceKind: 'image',
            trackIndex: 0,
            startMs: 0,
            assetUrl: 'overlay.png',
            durationSeconds: 3,
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
            blendMode: 'screen',
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 3,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain('[base0]split=2[base1blendbase][base1blanksrc]');
    expect(filterGraph).toContain('[base1blanksrc]lutrgb=r=0:g=0:b=0,format=rgba[clipblank1]');
    expect(filterGraph).toContain("[clipblank1][clip1]overlay=x='");
    expect(filterGraph).toContain('[base1blendbase][cliplayer1]blend=all_mode=screen[base1]');
  });

  it('renders clip chroma key and stroke settings in the sequence filter graph', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'green-screen.mp4',
          sourceUrl: 'green-screen.mp4',
          clipDurationSeconds: 5,
          clip: {
            sourceNodeId: 'clip-1',
            sourceKind: 'video',
            trackIndex: 1,
            startMs: 0,
            assetUrl: 'green-screen.mp4',
            sourceInMs: 0,
            durationSeconds: 5,
            trimStartMs: 0,
            trimEndMs: 0,
            playbackRate: 1,
            reversePlayback: false,
            fitMode: 'contain',
            scalePercent: 50,
            scaleMotionEnabled: false,
            endScalePercent: 50,
            opacityPercent: 90,
            rotationDeg: 0,
            rotationMotionEnabled: false,
            endRotationDeg: 0,
            flipHorizontal: false,
            flipVertical: false,
            positionX: 120,
            positionY: 80,
            motionEnabled: false,
            endPositionX: 120,
            endPositionY: 80,
            filterStack: [
              { id: 'hue', kind: 'hue-rotate', amount: 30, enabled: true },
            ],
            chromaKey: {
              enabled: true,
              color: '#00ff00',
              similarityPercent: 22,
              blendPercent: 7,
            },
            stroke: {
              enabled: true,
              color: '#ff00cc',
              widthPx: 8,
              opacityPercent: 80,
            },
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 5,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain('chromakey=0x00ff00:0.2200:0.0700');
    expect(filterGraph).toContain("hue=h='30.0000'");
    expect(filterGraph).toContain('drawbox=x=0:y=0:w=iw:h=ih:color=0xff00cc@0.8000:t=8');
  });

  it('does not fit text clips to the full video frame before clip scale animation', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'title.png',
          sourceUrl: 'title.png',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'title-1',
            sourceKind: 'text',
            trackIndex: 0,
            startMs: 0,
            durationSeconds: 4,
            trimStartMs: 0,
            trimEndMs: 0,
            playbackRate: 1,
            reversePlayback: false,
            fitMode: 'contain',
            scalePercent: 100,
            scaleMotionEnabled: true,
            endScalePercent: 200,
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
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textContent: 'Title',
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 80,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).not.toContain('scale=1280:720:force_original_aspect_ratio=decrease');
    expect(filterGraph).toContain("scale='max(2,trunc(iw*((1.0000)+((2.0000)-(1.0000))*");
  });

  it('preserves small animated text scale values used by the program monitor', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'title.png',
          sourceUrl: 'title.png',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'title-1',
            sourceKind: 'text',
            trackIndex: 0,
            startMs: 0,
            durationSeconds: 4,
            trimStartMs: 0,
            trimEndMs: 0,
            playbackRate: 1,
            reversePlayback: false,
            fitMode: 'contain',
            scalePercent: 14,
            scaleMotionEnabled: true,
            endScalePercent: 200,
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
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textContent: 'Thanks for watching',
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 72,
            textColor: '#a7f3d0',
            textEffect: 'glow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1920, height: 1080 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain("scale='max(2,trunc(iw*((0.1400)+((2.0000)-(0.1400))*");
    expect(filterGraph).not.toContain('0.2500');
  });

  it('sets animated rotation expressions for visual clips with end rotation keyframes', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'clip.png',
          sourceUrl: 'clip.png',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'source-1',
            sourceKind: 'image',
            trackIndex: 0,
            startMs: 0,
            assetUrl: 'clip.png',
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
            rotationMotionEnabled: true,
            endRotationDeg: 90,
            flipHorizontal: false,
            flipVertical: false,
            positionX: 0,
            positionY: 0,
            motionEnabled: false,
            endPositionX: 0,
            endPositionY: 0,
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 4,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain("rotate='(0.000000)+((1.570796)-(0.000000))*min(max((t-0.000)/4.000,0),1)'");
  });

  it('renders multi-point visual keyframes for scale, rotation, opacity, and overlay position', () => {
    const command = buildSequenceCommand({
      preparedClips: [
        {
          inputIndex: 1,
          inputName: 'clip.png',
          sourceUrl: 'clip.png',
          clipDurationSeconds: 4,
          clip: {
            sourceNodeId: 'source-1',
            sourceKind: 'image',
            trackIndex: 0,
            startMs: 1000,
            assetUrl: 'clip.png',
            durationSeconds: 4,
            trimStartMs: 0,
            trimEndMs: 0,
            playbackRate: 1,
            reversePlayback: false,
            fitMode: 'contain',
            scalePercent: 100,
            scaleMotionEnabled: true,
            endScalePercent: 100,
            opacityPercent: 100,
            opacityAutomationPoints: [
              { timePercent: 0, valuePercent: 100 },
              { timePercent: 50, valuePercent: 50 },
              { timePercent: 100, valuePercent: 100 },
            ],
            keyframes: [
              {
                timePercent: 0,
                positionX: 0,
                positionY: 0,
                scalePercent: 100,
                rotationDeg: 0,
                opacityPercent: 100,
              },
              {
                timePercent: 50,
                positionX: 240,
                positionY: 80,
                scalePercent: 200,
                rotationDeg: 90,
                opacityPercent: 50,
              },
              {
                timePercent: 100,
                positionX: 0,
                positionY: 0,
                scalePercent: 100,
                rotationDeg: 0,
                opacityPercent: 100,
              },
            ],
            rotationDeg: 0,
            rotationMotionEnabled: true,
            endRotationDeg: 0,
            flipHorizontal: false,
            flipVertical: false,
            positionX: 0,
            positionY: 0,
            motionEnabled: true,
            endPositionX: 0,
            endPositionY: 0,
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDurationMs: 500,
            textFontFamily: 'Inter, system-ui, sans-serif',
            textSizePx: 64,
            textColor: '#f3f4f6',
            textEffect: 'shadow',
            textBackgroundOpacityPercent: 0,
          },
        },
      ],
      preparedAudioTracks: [],
      canvas: { width: 1280, height: 720 },
      timelineDurationSeconds: 5,
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(filterGraph).toContain("scale='max(2,trunc(iw*(if(lte(t,2.0000)");
    expect(filterGraph).toContain("rotate='if(lte(t,2.0000)");
    expect(filterGraph).toContain("a='alpha(X,Y)*(if(lte(T,2.0000)");
    expect(filterGraph).toContain("overlay=x='if(lte(t,3.0000)");
  });
});

describe('drawTextStageObject', () => {
  it('blocks variable managed Canvas paint rather than drawing a default instance', () => {
    expect(() => assertCanvasCanPaintExactManagedVideoFace({
      kind: 'bundled', schemaVersion: 2, faceId: 'variable', family: 'Variable', weight: 400, style: 'normal', stretchPercent: 100,
      collectionIndex: 0, variationSettings: { opsz: 18 }, sha256: 'a'.repeat(64), byteLength: 100,
    })).toThrow(/blocked before fallback pixels/i);
  });

  it('uses quoted multi-word families and object weight/style (FBL-012 / AUD-026)', () => {
    const state = {
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      saved: false,
      restored: false,
    };
    const ctx = {
      save: () => { state.saved = true; },
      restore: () => { state.restored = true; },
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      fontKerning: '',
      letterSpacing: '',
      fillText: () => undefined,
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    Object.defineProperty(ctx, 'font', {
      get: () => state.font,
      set: (value: string) => { state.font = value; },
      configurable: true,
    });
    Object.defineProperty(ctx, 'fillStyle', {
      get: () => state.fillStyle,
      set: (value: string) => { state.fillStyle = value; },
      configurable: true,
    });
    Object.defineProperty(ctx, 'textAlign', {
      get: () => state.textAlign,
      set: (value: string) => { state.textAlign = value; },
      configurable: true,
    });
    Object.defineProperty(ctx, 'textBaseline', {
      get: () => state.textBaseline,
      set: (value: string) => { state.textBaseline = value; },
      configurable: true,
    });
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ctx,
      }),
    });

    drawTextStageObject(ctx as unknown as CanvasRenderingContext2D, {
      kind: 'text',
      id: 'text-1',
      text: 'Hi',
      fontFamily: 'M PLUS 1, sans-serif',
      fontWeight: 700,
      fontStyle: 'italic',
      fontSizePx: 32,
      color: '#f8fafc',
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      rotationDeg: 0,
      opacityPercent: 100,
      blendMode: 'normal',
    });

    expect(state.font).toContain('"M PLUS 1"');
    expect(state.font).toContain('italic');
    expect(state.font).toContain('700');
    vi.unstubAllGlobals();
  });
});
