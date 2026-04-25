import { describe, expect, it } from 'vitest';
import { buildCompositionCommand, buildSequenceCommand } from './mediaComposition';

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

describe('buildSequenceCommand', () => {
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
      outputName: 'sequence-output.mp4',
      nativeBackend: null,
    });

    const filterGraph = command[command.indexOf('-filter_complex') + 1];

    expect(command.join(' ')).toContain('-loop 1 -t 4.000 -i stage-text.png');
    expect(filterGraph).toContain('[base0][stage1]overlay=0:0[stagebase1]');
    expect(filterGraph).toContain('[stagebase1]format=yuv420p[vout]');
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
