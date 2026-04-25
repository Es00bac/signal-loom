import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type {
  AspectRatio,
  EditorClipFilter,
  EditorAudioKeyframe,
  EditorStageBlendMode,
  EditorStageObject,
  EditorVisualKeyframe,
  EditorVisualSourceKind,
  ProviderSettings,
  TimelineAutomationPoint,
  VideoResolution,
} from '../types/flow';
import { buildAutomationExpression } from './clipAutomation';
import {
  audioKeyframesToVolumeAutomation,
  normalizeVisualKeyframes,
  visualKeyframesToOpacityAutomation,
} from './editorKeyframes';
import { buildClipEffectDescriptor, mapClipBlendModeToFFmpeg } from './editorClipEffects';
import { buildTextOverlaySvgAsset } from './editorTextRender';
import { resolveVisualClipSourceRangeMs } from './editorTimelineSourceRange';
import { createMediaDurationResolver, type MediaDurationLoader } from './mediaDurationCache';
import { renderViaLocalNativeFFmpeg, resolveNativeRenderTarget } from './localNativeRender';
import {
  getNativeRenderThreadArgs,
  getNativeSequenceCommandPrefix,
  getNativeSequenceEncoderArgs,
  getNativeSequenceOutputFilter,
  type NativeRenderExecutionBackend,
} from './nativeRenderSupport';
import { getVideoCanvasDimensions } from './videoCanvas';

interface CompositionCommandTrack {
  inputName: string;
  delayMs: number;
  volumePercent: number;
  enabled: boolean;
}

interface BuildCompositionCommandOptions {
  videoInputName: string;
  audioTracks: CompositionCommandTrack[];
  outputName: string;
  useVideoAudio?: boolean;
  videoAudioVolumePercent?: number;
}

interface ComposeAudioTrack {
  url: string;
  delayMs: number;
  volumePercent: number;
  enabled: boolean;
}

interface ComposeMediaOptions {
  videoUrl: string;
  audioTracks: ComposeAudioTrack[];
  useVideoAudio?: boolean;
  videoAudioVolumePercent?: number;
  providerSettings?: ProviderSettings;
}

interface ComposeSequenceVisualClip {
  sourceNodeId: string;
  sourceKind: EditorVisualSourceKind;
  trackIndex: number;
  startMs: number;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  assetUrl?: string;
  text?: string;
  sourceInMs?: number;
  sourceOutMs?: number;
  durationSeconds?: number;
  trimStartMs: number;
  trimEndMs: number;
  playbackRate: number;
  reversePlayback: boolean;
  fitMode: 'contain' | 'cover' | 'stretch';
  scalePercent: number;
  scaleMotionEnabled: boolean;
  endScalePercent: number;
  opacityPercent: number;
  opacityAutomationPoints?: TimelineAutomationPoint[];
  keyframes?: EditorVisualKeyframe[];
  rotationDeg: number;
  rotationMotionEnabled: boolean;
  endRotationDeg: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  positionX: number;
  positionY: number;
  motionEnabled: boolean;
  endPositionX: number;
  endPositionY: number;
  cropLeftPercent?: number;
  cropRightPercent?: number;
  cropTopPercent?: number;
  cropBottomPercent?: number;
  cropPanXPercent?: number;
  cropPanYPercent?: number;
  cropRotationDeg?: number;
  filterStack?: EditorClipFilter[];
  blendMode?: EditorStageBlendMode;
  transitionIn: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';
  transitionOut: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';
  transitionDurationMs: number;
  textContent?: string;
  textFontFamily: string;
  textSizePx: number;
  textColor: string;
  textEffect: 'none' | 'shadow' | 'glow' | 'outline';
  textBackgroundOpacityPercent: number;
  shapeFillColor?: string;
  shapeBorderColor?: string;
  shapeBorderWidth?: number;
  shapeCornerRadius?: number;
}

interface ComposeSequenceAudioTrack {
  url: string;
  sourceNodeId: string;
  sourceKind: 'audio' | 'video' | 'composition';
  mimeType?: string;
  offsetMs: number;
  trackIndex: number;
  trackVolumePercent?: number;
  volumePercent: number;
  volumeAutomationPoints?: TimelineAutomationPoint[];
  volumeKeyframes?: EditorAudioKeyframe[];
  enabled: boolean;
}

interface ComposeSequenceMediaOptions {
  visualClips: ComposeSequenceVisualClip[];
  audioTracks: ComposeSequenceAudioTrack[];
  stageObjects?: EditorStageObject[];
  aspectRatio?: AspectRatio;
  videoResolution?: VideoResolution;
  providerSettings?: ProviderSettings;
}

interface SequenceCanvas {
  width: number;
  height: number;
}

interface PreparedSequenceVisualClip {
  clip: ComposeSequenceVisualClip;
  inputIndex: number;
  inputName: string;
  sourceUrl: string;
  clipDurationSeconds: number;
}

interface PreparedSequenceAudioTrack {
  track: ComposeSequenceAudioTrack;
  inputName: string;
  sourceUrl: string;
  durationSeconds: number;
}

interface PreparedSequenceStageObject {
  object: EditorStageObject;
  inputIndex: number;
  inputName: string;
  sourceUrl: string;
}

let ffmpegPromise: Promise<FFmpeg> | undefined;
const SEQUENCE_FRAME_RATE = 30;
const MIN_SEQUENCE_VISUAL_SCALE_FACTOR = 0.1;

export function buildCompositionCommand({
  videoInputName,
  audioTracks,
  outputName,
  useVideoAudio = false,
  videoAudioVolumePercent = 100,
}: BuildCompositionCommandOptions): string[] {
  const enabledTracks = audioTracks.filter((track) => track.enabled);
  const videoAudioVolume = Math.max(0, videoAudioVolumePercent) / 100;

  if (enabledTracks.length === 0) {
    if (useVideoAudio) {
      if (videoAudioVolumePercent === 100) {
        return [
          '-i',
          videoInputName,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c:v',
          'copy',
          '-c:a',
          'copy',
          outputName,
        ];
      }

      return [
        '-i',
        videoInputName,
        '-filter_complex',
        `[0:a]volume=${videoAudioVolume.toFixed(2)}[aout]`,
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        outputName,
      ];
    }

    return [
      '-i',
      videoInputName,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      outputName,
    ];
  }

  const args = ['-i', videoInputName];

  for (const track of enabledTracks) {
    args.push('-i', track.inputName);
  }

  const filterParts: string[] = [];
  const mixInputs: string[] = [];

  if (useVideoAudio) {
    filterParts.push(`[0:a]volume=${videoAudioVolume.toFixed(2)}[va0]`);
    mixInputs.push('[va0]');
  }

  enabledTracks.forEach((track, index) => {
    const inputIndex = index + 1;
    const label = `a${index}`;
    const volume = Math.max(0, track.volumePercent) / 100;
    filterParts.push(`[${inputIndex}:a]adelay=${track.delayMs}|${track.delayMs},volume=${volume.toFixed(2)}[${label}]`);
    mixInputs.push(`[${label}]`);
  });

  const filterComplex = `${filterParts.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest[aout]`;

  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    outputName,
  );

  return args;
}

export async function composeMedia({
  videoUrl,
  audioTracks,
  useVideoAudio = false,
  videoAudioVolumePercent = 100,
  providerSettings,
}: ComposeMediaOptions): Promise<Blob> {
  const videoInputName = 'composition-input-video.mp4';
  const outputName = 'composition-output.mp4';
  const enabledTracks = audioTracks.filter((track) => track.enabled);

  const compositionTracks: CompositionCommandTrack[] = [];
  const nativeInputs: Array<{ name: string; url: string }> = [
    {
      name: videoInputName,
      url: videoUrl,
    },
  ];

  for (const [index, track] of enabledTracks.entries()) {
    const audioInputName = `composition-audio-${index + 1}.mp3`;
    compositionTracks.push({
      inputName: audioInputName,
      delayMs: track.delayMs,
      volumePercent: track.volumePercent,
      enabled: true,
    });
    nativeInputs.push({
      name: audioInputName,
      url: track.url,
    });
  }

  const baseCommand = buildCompositionCommand({
    videoInputName,
    audioTracks: compositionTracks,
    outputName,
    useVideoAudio,
    videoAudioVolumePercent,
  });
  const nativeCommand = [...getNativeRenderThreadArgs(), ...baseCommand];

  if (providerSettings) {
    const nativeBlob = await renderViaLocalNativeFFmpeg({
      providerSettings,
      outputName,
      command: nativeCommand,
      inputs: nativeInputs,
    });

    if (nativeBlob) {
      return nativeBlob;
    }
  }

  const ffmpeg = await getFFmpeg();

  await ffmpeg.writeFile(videoInputName, await fetchFile(videoUrl));

  for (const [index, track] of enabledTracks.entries()) {
    await ffmpeg.writeFile(`composition-audio-${index + 1}.mp3`, await fetchFile(track.url));
  }

  await ffmpeg.exec(baseCommand);
  const output = await ffmpeg.readFile(outputName);
  const bytes = output instanceof Uint8Array ? output : new TextEncoder().encode(String(output));

  await ffmpeg.deleteFile(videoInputName);
  for (const track of compositionTracks) {
    await ffmpeg.deleteFile(track.inputName);
  }
  await ffmpeg.deleteFile(outputName);

  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);

  return new Blob([blobBytes], { type: 'video/mp4' });
}

export async function composeSequenceMedia({
  visualClips,
  audioTracks,
  stageObjects = [],
  aspectRatio = '16:9',
  videoResolution = '1080p',
  providerSettings,
}: ComposeSequenceMediaOptions): Promise<Blob> {
  if (visualClips.length === 0 && stageObjects.length === 0) {
    throw new Error('Manual editor compositions need at least one visual clip or stage object.');
  }

  const outputName = 'sequence-output.mp4';
  const canvas = getSequenceCanvas(aspectRatio, videoResolution);
  const resolveMediaDuration = createMediaDurationResolver(getMediaDuration);
  const preparedClips = await Promise.all(
    visualClips.map(async (clip, index) => {
      const preparedInput = await prepareVisualClipInput(clip, index);

      return {
        clip,
        inputIndex: index + 1,
        inputName: preparedInput.inputName,
        sourceUrl: preparedInput.sourceUrl,
        clipDurationSeconds: await resolveSequenceVisualClipDuration(clip, resolveMediaDuration),
      } satisfies PreparedSequenceVisualClip;
    }),
  );
  const enabledAudioTracks = audioTracks.filter((track) => track.enabled);
  const preparedAudioTracks = await Promise.all(
    enabledAudioTracks.map(async (track, index) => {
      const audioInputName = `sequence-audio-${index + 1}.${resolveSequenceAudioExtension(track)}`;

      return {
        track,
        inputName: audioInputName,
        sourceUrl: track.url,
        durationSeconds: await resolveMediaDuration(
          track.url,
          track.sourceKind === 'audio' ? 'audio' : 'video',
        ),
      } satisfies PreparedSequenceAudioTrack;
    }),
  );
  const preparedStageObjects = await Promise.all(
    stageObjects.map(async (object, index) => ({
      object,
      inputIndex: preparedClips.length + index + 1,
      inputName: `sequence-stage-object-${index + 1}.png`,
      sourceUrl: await renderStageObjectImage(object, canvas),
    }) satisfies PreparedSequenceStageObject),
  );
  const timelineDurationSeconds = resolveSequenceTimelineDurationSeconds(preparedClips, preparedAudioTracks);
  const nativeBackend = providerSettings
    ? (await resolveNativeSequenceBackend(providerSettings))
    : null;
  const command = buildSequenceCommand({
    preparedClips,
    preparedAudioTracks,
    preparedStageObjects,
    canvas,
    timelineDurationSeconds,
    outputName,
    nativeBackend,
  });

  if (providerSettings && nativeBackend) {
    const nativeBlob = await renderViaLocalNativeFFmpeg({
      providerSettings,
      outputName,
      command,
      inputs: [
        ...preparedClips.map((clip) => ({
          name: clip.inputName,
          url: clip.sourceUrl,
        })),
        ...preparedAudioTracks.map((track) => ({
          name: track.inputName,
          url: track.sourceUrl,
        })),
        ...preparedStageObjects.map((object) => ({
          name: object.inputName,
          url: object.sourceUrl,
        })),
      ],
    });

    if (nativeBlob) {
      return nativeBlob;
    }
  }

  const ffmpeg = await getFFmpeg();

  for (const preparedClip of preparedClips) {
    await ffmpeg.writeFile(preparedClip.inputName, await fetchFile(preparedClip.sourceUrl));
  }

  for (const preparedAudioTrack of preparedAudioTracks) {
    await ffmpeg.writeFile(preparedAudioTrack.inputName, await fetchFile(preparedAudioTrack.sourceUrl));
  }

  for (const preparedStageObject of preparedStageObjects) {
    await ffmpeg.writeFile(preparedStageObject.inputName, await fetchFile(preparedStageObject.sourceUrl));
  }

  await ffmpeg.exec(command);
  const output = await ffmpeg.readFile(outputName);
  const bytes = output instanceof Uint8Array ? output : new TextEncoder().encode(String(output));

  for (const inputName of [
    ...preparedClips.map((clip) => clip.inputName),
    ...preparedAudioTracks.map((track) => track.inputName),
    ...preparedStageObjects.map((object) => object.inputName),
    outputName,
  ]) {
    await ffmpeg.deleteFile(inputName);
  }

  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);

  return new Blob([blobBytes], { type: 'video/mp4' });
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
        wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
      });
      return ffmpeg;
    })();
  }

  return ffmpegPromise;
}

async function prepareVisualClipInput(
  clip: ComposeSequenceVisualClip,
  index: number,
): Promise<{ inputName: string; sourceUrl: string }> {
  if (clip.sourceKind === 'text') {
    const renderedCard = await renderTextCard({
      text: clip.textContent ?? clip.text ?? '',
      fontFamily: clip.textFontFamily,
      fontSizePx: clip.textSizePx,
      color: clip.textColor,
      effect: clip.textEffect,
      opacityPercent: 100,
    });
    const inputName = `sequence-text-${index + 1}.png`;
    return {
      inputName,
      sourceUrl: renderedCard,
    };
  }

  if (clip.sourceKind === 'shape') {
    const renderedCard = await renderShapeCard({
      fillColor: clip.shapeFillColor ?? '#0ea5e9',
      borderColor: clip.shapeBorderColor ?? '#f8fafc',
      borderWidth: clip.shapeBorderWidth ?? 2,
      cornerRadius: clip.shapeCornerRadius ?? 18,
      opacityPercent: clip.opacityPercent,
    });
    const inputName = `sequence-shape-${index + 1}.png`;
    return {
      inputName,
      sourceUrl: renderedCard,
    };
  }

  if (!clip.assetUrl) {
    throw new Error('A manual editor clip is missing its source media.');
  }

  const extension =
    clip.sourceKind === 'image'
      ? 'png'
      : 'mp4';
  const inputName = `sequence-visual-${index + 1}.${extension}`;
  return {
    inputName,
    sourceUrl: clip.assetUrl,
  };
}

async function resolveSequenceVisualClipDuration(
  clip: ComposeSequenceVisualClip,
  resolveMediaDuration: MediaDurationLoader,
): Promise<number> {
  if (clip.sourceKind === 'image' || clip.sourceKind === 'text' || clip.sourceKind === 'shape') {
    return Math.max(0.25, clip.durationSeconds ?? 4);
  }

  if (!clip.assetUrl) {
    return 0.25;
  }

  const sourceDurationSeconds = await resolveMediaDuration(clip.assetUrl, 'video');
  const availableMs = Math.max(250, resolveVisualClipSourceRangeMs(clip, sourceDurationSeconds).durationMs);

  return availableMs / 1000 / Math.max(0.25, clip.playbackRate || 1);
}

function resolveSequenceTimelineDurationSeconds(
  visualClips: PreparedSequenceVisualClip[],
  audioTracks: PreparedSequenceAudioTrack[],
): number {
  const longestVisual = visualClips.reduce((maxSeconds, clip) => {
    return Math.max(maxSeconds, clip.clip.startMs / 1000 + clip.clipDurationSeconds);
  }, 0);
  const longestAudio = audioTracks.reduce((maxSeconds, track) => {
    return Math.max(maxSeconds, track.track.offsetMs / 1000 + track.durationSeconds);
  }, 0);

  return Math.max(1, longestVisual, longestAudio);
}

function getSequenceCanvas(aspectRatio: AspectRatio, videoResolution: VideoResolution): SequenceCanvas {
  return getVideoCanvasDimensions(aspectRatio, videoResolution);
}

export function buildSequenceCommand({
  preparedClips,
  preparedAudioTracks,
  preparedStageObjects = [],
  canvas,
  timelineDurationSeconds,
  outputName,
  nativeBackend,
}: {
  preparedClips: PreparedSequenceVisualClip[];
  preparedAudioTracks: PreparedSequenceAudioTrack[];
  preparedStageObjects?: PreparedSequenceStageObject[];
  canvas: SequenceCanvas;
  timelineDurationSeconds: number;
  outputName: string;
  nativeBackend: NativeRenderExecutionBackend | null;
}): string[] {
  const command: string[] = [];

  if (nativeBackend) {
    command.push(...getNativeSequenceCommandPrefix(nativeBackend));
  }

  command.push(
    '-f',
    'lavfi',
    '-t',
    formatSeconds(timelineDurationSeconds),
    '-i',
    `color=c=black:s=${canvas.width}x${canvas.height}:r=${SEQUENCE_FRAME_RATE}`,
  );

  for (const preparedClip of preparedClips) {
    if (
      preparedClip.clip.sourceKind === 'image' ||
      preparedClip.clip.sourceKind === 'text' ||
      preparedClip.clip.sourceKind === 'shape'
    ) {
      command.push('-loop', '1', '-t', formatSeconds(preparedClip.clipDurationSeconds), '-i', preparedClip.inputName);
    } else {
      command.push('-i', preparedClip.inputName);
    }
  }

  for (const preparedStageObject of preparedStageObjects) {
    command.push('-loop', '1', '-t', formatSeconds(timelineDurationSeconds), '-i', preparedStageObject.inputName);
  }

  for (const preparedAudioTrack of preparedAudioTracks) {
    command.push('-i', preparedAudioTrack.inputName);
  }

  const filterParts: string[] = [];
  filterParts.push(`[0:v]format=rgba[base0]`);

  for (const preparedClip of preparedClips) {
    filterParts.push(buildSequenceVisualFilter(preparedClip, canvas));
  }

  const overlayOrder = [...preparedClips].sort(
    (left, right) =>
      left.clip.trackIndex - right.clip.trackIndex ||
      left.clip.startMs - right.clip.startMs ||
      left.inputIndex - right.inputIndex,
  );

  let currentBaseLabel = 'base0';

  overlayOrder.forEach((preparedClip, index) => {
    const outputLabel = `base${index + 1}`;
    const clipLabel = `clip${preparedClip.inputIndex}`;
    filterParts.push(...buildClipCompositeFilters(currentBaseLabel, clipLabel, outputLabel, preparedClip));
    currentBaseLabel = outputLabel;
  });

  preparedStageObjects.forEach((preparedStageObject, index) => {
    const objectLabel = `stage${preparedStageObject.inputIndex}`;
    const outputLabel = `stagebase${index + 1}`;
    filterParts.push(`[${preparedStageObject.inputIndex}:v]format=rgba[${objectLabel}]`);
    filterParts.push(
      buildStageObjectOverlayFilter(currentBaseLabel, objectLabel, outputLabel, preparedStageObject.object),
    );
    currentBaseLabel = outputLabel;
  });

  filterParts.push(
    nativeBackend
      ? getNativeSequenceOutputFilter(currentBaseLabel, nativeBackend)
      : `[${currentBaseLabel}]format=yuv420p[vout]`,
  );

  const audioLabels: string[] = [];
  const audioInputOffset = preparedClips.length + preparedStageObjects.length + 1;

  preparedAudioTracks.forEach((preparedAudioTrack, index) => {
    const { track } = preparedAudioTrack;
    const inputIndex = audioInputOffset + index;
    const label = `a${index}`;
    const delay = Math.max(0, track.offsetMs);
    const volumeFilter = buildSequenceAudioVolumeFilter(track, preparedAudioTrack.durationSeconds);
    filterParts.push(`[${inputIndex}:a]${volumeFilter},adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(`[${label}]`);
  });

  if (audioLabels.length > 0) {
    filterParts.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest,atrim=duration=${formatSeconds(timelineDurationSeconds)}[aout]`,
    );
  }

  command.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
  );

  if (audioLabels.length > 0) {
    command.push('-map', '[aout]', '-c:a', 'aac');
  } else {
    command.push('-an');
  }

  if (nativeBackend) {
    command.push(...getNativeSequenceEncoderArgs(nativeBackend));
  } else {
    command.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
  }

  command.push(outputName);

  return command;
}

function buildStageObjectOverlayFilter(
  baseLabel: string,
  objectLabel: string,
  outputLabel: string,
  object: EditorStageObject,
): string {
  const ffmpegBlendMode = mapStageBlendModeToFFmpeg(object.blendMode);

  if (!ffmpegBlendMode) {
    return `[${baseLabel}][${objectLabel}]overlay=0:0[${outputLabel}]`;
  }

  return `[${baseLabel}][${objectLabel}]blend=all_mode=${ffmpegBlendMode}[${outputLabel}]`;
}

function mapStageBlendModeToFFmpeg(mode: EditorStageBlendMode): string | undefined {
  switch (mode) {
    case 'screen':
      return 'screen';
    case 'multiply':
      return 'multiply';
    case 'overlay':
      return 'overlay';
    case 'lighten':
      return 'lighten';
    case 'darken':
      return 'darken';
    case 'color-dodge':
      return 'colordodge';
    case 'color-burn':
      return 'colorburn';
    case 'normal':
      return undefined;
  }
}

async function renderStageObjectImage(
  object: EditorStageObject,
  canvasSize: SequenceCanvas,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create a canvas context for a program-stage object.');
  }

  paintStageBlendNeutralBackground(context, object.blendMode, canvasSize);
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, object.opacityPercent / 100));
  context.translate(object.x + object.width / 2, object.y + object.height / 2);
  context.rotate((object.rotationDeg * Math.PI) / 180);

  if (object.kind === 'text') {
    drawTextStageObject(context, object);
  } else {
    drawRectangleStageObject(context, object);
  }

  context.restore();

  return canvas.toDataURL('image/png');
}

function paintStageBlendNeutralBackground(
  context: CanvasRenderingContext2D,
  blendMode: EditorStageBlendMode,
  canvasSize: SequenceCanvas,
) {
  if (blendMode === 'normal') {
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    return;
  }

  context.fillStyle = blendMode === 'darken' || blendMode === 'multiply' || blendMode === 'color-burn'
    ? '#ffffff'
    : '#000000';
  context.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

function drawTextStageObject(
  context: CanvasRenderingContext2D,
  object: Extract<EditorStageObject, { kind: 'text' }>,
) {
  context.fillStyle = object.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${object.fontSizePx}px ${object.fontFamily}`;
  const lines = object.text.split('\n');
  const lineHeight = object.fontSizePx * 1.15;
  const startY = -((lines.length - 1) * lineHeight) / 2;

  for (const [index, line] of lines.entries()) {
    context.fillText(line, 0, startY + index * lineHeight, object.width);
  }
}

function drawRectangleStageObject(
  context: CanvasRenderingContext2D,
  object: Extract<EditorStageObject, { kind: 'rectangle' }>,
) {
  const left = -object.width / 2;
  const top = -object.height / 2;
  const radius = Math.min(object.cornerRadius, object.width / 2, object.height / 2);

  context.beginPath();
  context.roundRect(left, top, object.width, object.height, radius);
  context.fillStyle = object.fillColor;
  context.fill();

  if (object.borderWidth > 0) {
    context.lineWidth = object.borderWidth;
    context.strokeStyle = object.borderColor;
    context.stroke();
  }
}

function buildSequenceAudioVolumeFilter(
  track: ComposeSequenceAudioTrack,
  durationSeconds: number,
): string {
  const trackVolume = Math.max(0, track.trackVolumePercent ?? 100) / 100;

  if ((track.volumeKeyframes?.length ?? 0) > 0) {
    const keyframeExpression = buildAutomationPercentExpression(
      audioKeyframesToVolumeAutomation(track),
      Math.max(0.001, durationSeconds),
      track.volumePercent,
      't',
      150,
    );

    return `volume='${trackVolume.toFixed(4)}*(${keyframeExpression})':eval=frame`;
  }

  const clipVolume = Math.max(0, track.volumePercent) / 100;
  const baseVolume = trackVolume * clipVolume;

  if ((track.volumeAutomationPoints?.length ?? 0) === 0) {
    return `volume=${baseVolume.toFixed(2)}`;
  }

  const automationExpression = buildAutomationExpression(
    track.volumeAutomationPoints,
    Math.max(0.001, durationSeconds),
    100,
    't',
  );

  return `volume='${baseVolume.toFixed(4)}*(${automationExpression})':eval=frame`;
}

async function resolveNativeSequenceBackend(
  providerSettings: ProviderSettings,
): Promise<NativeRenderExecutionBackend | null> {
  const target = await resolveNativeRenderTarget(providerSettings);
  return target?.backend ?? null;
}

function buildSequenceVisualFilter(
  preparedClip: PreparedSequenceVisualClip,
  canvas: SequenceCanvas,
): string {
  const { clip, inputIndex, clipDurationSeconds } = preparedClip;
  const filters: string[] = [];

  if (clip.sourceKind === 'video' || clip.sourceKind === 'composition') {
    const sourceRange = resolveVisualClipSourceRangeMs(clip, 0);

    if (sourceRange.sourceInMs > 0) {
      filters.push(`trim=start=${formatSeconds(sourceRange.sourceInMs / 1000)}`);
    }

    if (clip.reversePlayback) {
      filters.push('reverse');
    }

    filters.push(`setpts=(PTS-STARTPTS)/${formatRate(clip.playbackRate)}`);
  } else {
    filters.push('setpts=PTS-STARTPTS');
  }

  filters.push(
    `trim=duration=${formatSeconds(clipDurationSeconds)}`,
    `fps=${SEQUENCE_FRAME_RATE}`,
    'setsar=1',
    'format=rgba',
  );

  const effectDescriptor = buildClipEffectDescriptor({
    cropLeftPercent: clip.cropLeftPercent ?? 0,
    cropRightPercent: clip.cropRightPercent ?? 0,
    cropTopPercent: clip.cropTopPercent ?? 0,
    cropBottomPercent: clip.cropBottomPercent ?? 0,
    cropPanXPercent: clip.cropPanXPercent ?? 0,
    cropPanYPercent: clip.cropPanYPercent ?? 0,
    cropRotationDeg: clip.cropRotationDeg ?? 0,
    filterStack: clip.filterStack ?? [],
    blendMode: clip.blendMode,
  });

  filters.push(...effectDescriptor.ffmpegFilters);

  if (clip.sourceKind !== 'text') {
    if (clip.fitMode === 'stretch') {
      filters.push(`scale=${canvas.width}:${canvas.height}`);
    } else {
      filters.push(
        `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=${clip.fitMode === 'cover' ? 'increase' : 'decrease'}`,
      );
    }
  }

  const startScaleFactor = Math.max(MIN_SEQUENCE_VISUAL_SCALE_FACTOR, clip.scalePercent / 100);
  const endScaleFactor = Math.max(
    MIN_SEQUENCE_VISUAL_SCALE_FACTOR,
    (clip.scaleMotionEnabled ? clip.endScalePercent : clip.scalePercent) / 100,
  );
  const hasVisualKeyframes = (clip.keyframes?.length ?? 0) > 0;

  if (hasVisualKeyframes || clip.scaleMotionEnabled || clip.scalePercent !== 100 || clip.endScalePercent !== 100) {
    const scaleExpression = hasVisualKeyframes
      ? buildKeyframedValueExpression(
          normalizeVisualKeyframes(clip),
          clipDurationSeconds,
          't',
          (keyframe) => Math.max(MIN_SEQUENCE_VISUAL_SCALE_FACTOR, keyframe.scalePercent / 100).toFixed(4),
        )
      : clip.scaleMotionEnabled
      ? buildInterpolationValueExpression(
          startScaleFactor.toFixed(4),
          endScaleFactor.toFixed(4),
          0,
          clipDurationSeconds,
        )
      : startScaleFactor.toFixed(4);
    const evaluationMode = hasVisualKeyframes || clip.scaleMotionEnabled ? ':eval=frame' : '';
    filters.push(
      `scale='max(2,trunc(iw*(${scaleExpression})/2)*2)':'max(2,trunc(ih*(${scaleExpression})/2)*2)'${evaluationMode}`,
    );
  }

  if (clip.flipHorizontal) {
    filters.push('hflip');
  }

  if (clip.flipVertical) {
    filters.push('vflip');
  }

  if (hasVisualKeyframes || clip.rotationMotionEnabled || clip.rotationDeg !== 0) {
    const startRotationRadians = (clip.rotationDeg * Math.PI / 180).toFixed(6);
    const endRotationRadians = (
      (clip.rotationMotionEnabled ? clip.endRotationDeg : clip.rotationDeg) * Math.PI / 180
    ).toFixed(6);
    const rotationExpression = hasVisualKeyframes
      ? buildKeyframedValueExpression(
          normalizeVisualKeyframes(clip),
          clipDurationSeconds,
          't',
          (keyframe) => (keyframe.rotationDeg * Math.PI / 180).toFixed(6),
        )
      : clip.rotationMotionEnabled
      ? buildInterpolationValueExpression(
          startRotationRadians,
          endRotationRadians,
          0,
          clipDurationSeconds,
        )
      : startRotationRadians;

    filters.push(
      `rotate='${rotationExpression}':c=none:ow=rotw(iw):oh=roth(ih)`,
    );
  }

  const transitionDurationSeconds = Math.min(
    clipDurationSeconds / 2,
    Math.max(0, clip.transitionDurationMs) / 1000,
  );

  if (clip.transitionIn === 'fade' && transitionDurationSeconds > 0) {
    filters.push(`fade=t=in:st=0:d=${formatSeconds(transitionDurationSeconds)}:alpha=1`);
  }

  if (clip.transitionOut === 'fade' && transitionDurationSeconds > 0) {
    filters.push(
      `fade=t=out:st=${formatSeconds(Math.max(0, clipDurationSeconds - transitionDurationSeconds))}:d=${formatSeconds(transitionDurationSeconds)}:alpha=1`,
    );
  }

  const opacityAutomationPoints = hasVisualKeyframes
    ? visualKeyframesToOpacityAutomation(clip)
    : clip.opacityAutomationPoints;

  if ((opacityAutomationPoints?.length ?? 0) > 0 || clip.opacityPercent !== 100) {
    const opacityExpression = buildAutomationExpression(
      opacityAutomationPoints,
      clipDurationSeconds,
      clip.opacityPercent,
    );
    filters.push(
      `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacityExpression})'`,
    );
  }

  filters.push(`setpts=PTS-STARTPTS+${formatSeconds(clip.startMs / 1000)}/TB`);

  return `[${inputIndex}:v]${filters.join(',')}[clip${inputIndex}]`;
}

function buildOverlayOptions(preparedClip: PreparedSequenceVisualClip): string {
  const { clip, clipDurationSeconds } = preparedClip;
  const xExpression = buildOverlayXExpression(clip, clipDurationSeconds);
  const yExpression = buildOverlayYExpression(clip, clipDurationSeconds);

  return `x='${xExpression}':y='${yExpression}':eof_action=pass:eval=frame`;
}

function buildClipCompositeFilters(
  baseLabel: string,
  clipLabel: string,
  outputLabel: string,
  preparedClip: PreparedSequenceVisualClip,
): string[] {
  const ffmpegBlendMode = mapClipBlendModeToFFmpeg(preparedClip.clip.blendMode);

  if (!ffmpegBlendMode) {
    return [`[${baseLabel}][${clipLabel}]overlay=${buildOverlayOptions(preparedClip)}[${outputLabel}]`];
  }

  const baseForBlendLabel = `${outputLabel}blendbase`;
  const blankSourceLabel = `${outputLabel}blanksrc`;
  const blankLabel = `clipblank${preparedClip.inputIndex}`;
  const layerLabel = `cliplayer${preparedClip.inputIndex}`;

  return [
    `[${baseLabel}]split=2[${baseForBlendLabel}][${blankSourceLabel}]`,
    `[${blankSourceLabel}]${getBlendNeutralFilter(ffmpegBlendMode)}[${blankLabel}]`,
    `[${blankLabel}][${clipLabel}]overlay=${buildOverlayOptions(preparedClip)}[${layerLabel}]`,
    `[${baseForBlendLabel}][${layerLabel}]blend=all_mode=${ffmpegBlendMode}[${outputLabel}]`,
  ];
}

function getBlendNeutralFilter(ffmpegBlendMode: string): string {
  return ffmpegBlendMode === 'multiply' || ffmpegBlendMode === 'darken' || ffmpegBlendMode === 'colorburn'
    ? 'lutrgb=r=255:g=255:b=255,format=rgba'
    : 'lutrgb=r=0:g=0:b=0,format=rgba';
}

function resolveSequenceAudioExtension(track: ComposeSequenceAudioTrack): string {
  const mimeType = track.mimeType ?? '';

  if (mimeType.includes('mp4') || track.sourceKind === 'video' || track.sourceKind === 'composition') {
    return 'mp4';
  }

  if (mimeType.includes('wav')) {
    return 'wav';
  }

  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  return 'mp3';
}

function buildOverlayXExpression(
  clip: ComposeSequenceVisualClip,
  clipDurationSeconds: number,
): string {
  const centerExpression = (clip.keyframes?.length ?? 0) > 0
    ? buildKeyframedCenterExpression('W', clip, clipDurationSeconds)
    : buildAnimatedCenterExpression('W', clip.positionX, clip.endPositionX, clip.motionEnabled, clip.startMs / 1000, clipDurationSeconds);
  let expression = centerExpression;
  const transitionDurationSeconds = Math.min(
    clipDurationSeconds / 2,
    Math.max(0, clip.transitionDurationMs) / 1000,
  );
  const startSeconds = clip.startMs / 1000;
  const endSeconds = startSeconds + clipDurationSeconds;

  if (transitionDurationSeconds > 0) {
    if (clip.transitionIn === 'slide-left' || clip.transitionIn === 'slide-right') {
      const fromExpression = clip.transitionIn === 'slide-left' ? '-w' : 'W';
      expression = buildTimedInterpolationExpression(
        fromExpression,
        centerExpression,
        startSeconds,
        transitionDurationSeconds,
        expression,
      );
    }

    if (clip.transitionOut === 'slide-left' || clip.transitionOut === 'slide-right') {
      const toExpression = clip.transitionOut === 'slide-left' ? '-w' : 'W';
      expression = `if(gte(t,${formatSeconds(Math.max(0, endSeconds - transitionDurationSeconds))}),${buildInterpolationValueExpression(centerExpression, toExpression, Math.max(0, endSeconds - transitionDurationSeconds), transitionDurationSeconds)},${expression})`;
    }
  }

  return expression;
}

function buildOverlayYExpression(
  clip: ComposeSequenceVisualClip,
  clipDurationSeconds: number,
): string {
  const centerExpression = (clip.keyframes?.length ?? 0) > 0
    ? buildKeyframedCenterExpression('H', clip, clipDurationSeconds)
    : buildAnimatedCenterExpression('H', clip.positionY, clip.endPositionY, clip.motionEnabled, clip.startMs / 1000, clipDurationSeconds);
  let expression = centerExpression;
  const transitionDurationSeconds = Math.min(
    clipDurationSeconds / 2,
    Math.max(0, clip.transitionDurationMs) / 1000,
  );
  const startSeconds = clip.startMs / 1000;
  const endSeconds = startSeconds + clipDurationSeconds;

  if (transitionDurationSeconds > 0) {
    if (clip.transitionIn === 'slide-up' || clip.transitionIn === 'slide-down') {
      const fromExpression = clip.transitionIn === 'slide-up' ? '-h' : 'H';
      expression = buildTimedInterpolationExpression(
        fromExpression,
        centerExpression,
        startSeconds,
        transitionDurationSeconds,
        expression,
      );
    }

    if (clip.transitionOut === 'slide-up' || clip.transitionOut === 'slide-down') {
      const toExpression = clip.transitionOut === 'slide-up' ? '-h' : 'H';
      expression = `if(gte(t,${formatSeconds(Math.max(0, endSeconds - transitionDurationSeconds))}),${buildInterpolationValueExpression(centerExpression, toExpression, Math.max(0, endSeconds - transitionDurationSeconds), transitionDurationSeconds)},${expression})`;
    }
  }

  return expression;
}

function buildKeyframedCenterExpression(
  axisSize: 'W' | 'H',
  clip: ComposeSequenceVisualClip,
  clipDurationSeconds: number,
): string {
  const axis = axisSize === 'W' ? 'w' : 'h';
  const startSeconds = clip.startMs / 1000;

  return buildKeyframedValueExpression(
    normalizeVisualKeyframes(clip),
    clipDurationSeconds,
    't',
    (keyframe) => {
      const offset = axisSize === 'W' ? keyframe.positionX : keyframe.positionY;
      return `((${axisSize}-${axis})/2+${Math.round(offset)})`;
    },
    startSeconds,
  );
}

function buildAnimatedCenterExpression(
  axisSize: 'W' | 'H',
  startOffset: number,
  endOffset: number,
  motionEnabled: boolean,
  startSeconds: number,
  clipDurationSeconds: number,
): string {
  const axis = axisSize === 'W' ? 'w' : 'h';
  const startExpression = `((${axisSize}-${axis})/2+${Math.round(startOffset)})`;

  if (!motionEnabled) {
    return startExpression;
  }

  const endExpression = `((${axisSize}-${axis})/2+${Math.round(endOffset)})`;
  return buildInterpolationValueExpression(startExpression, endExpression, startSeconds, clipDurationSeconds);
}

function buildTimedInterpolationExpression(
  fromExpression: string,
  toExpression: string,
  startSeconds: number,
  durationSeconds: number,
  fallbackExpression: string,
): string {
  return `if(lt(t,${formatSeconds(startSeconds + durationSeconds)}),${buildInterpolationValueExpression(fromExpression, toExpression, startSeconds, durationSeconds)},${fallbackExpression})`;
}

function buildKeyframedValueExpression<T extends { timePercent: number }>(
  keyframes: T[],
  durationSeconds: number,
  variableName: string,
  formatValue: (keyframe: T) => string,
  startSeconds = 0,
): string {
  const safeDurationSeconds = Math.max(0.001, durationSeconds);
  const segments = keyframes.map((keyframe) => ({
    timeSeconds: startSeconds + (Math.max(0, Math.min(100, keyframe.timePercent)) / 100) * safeDurationSeconds,
    value: formatValue(keyframe),
  }));

  if (segments.length === 0) {
    return '0';
  }

  let expression = segments[segments.length - 1].value;

  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const start = segments[index];
    const end = segments[index + 1];
    const segmentDuration = Math.max(0.0001, end.timeSeconds - start.timeSeconds);
    const segmentExpression =
      Math.abs(end.timeSeconds - start.timeSeconds) < 0.0001
        ? end.value
        : buildInterpolationValueExpression(start.value, end.value, start.timeSeconds, segmentDuration);

    expression = `if(lte(${variableName},${end.timeSeconds.toFixed(4)}),${segmentExpression},${expression})`;
  }

  return expression;
}

function buildAutomationPercentExpression(
  points: TimelineAutomationPoint[] | undefined,
  durationSeconds: number,
  defaultValuePercent: number,
  variableName: string,
  maxValuePercent: number,
): string {
  return buildKeyframedValueExpression(
    (points ?? [
      { timePercent: 0, valuePercent: defaultValuePercent },
      { timePercent: 100, valuePercent: defaultValuePercent },
    ]).map((point) => ({
      timePercent: point.timePercent,
      valuePercent: Math.max(0, Math.min(maxValuePercent, point.valuePercent)),
    })),
    durationSeconds,
    variableName,
    (point) => (point.valuePercent / 100).toFixed(4),
  );
}

function buildInterpolationValueExpression(
  fromExpression: string,
  toExpression: string,
  startSeconds: number,
  durationSeconds: number,
): string {
  return `(${fromExpression})+((${toExpression})-(${fromExpression}))*min(max((t-${formatSeconds(startSeconds)})/${formatSeconds(durationSeconds)},0),1)`;
}

function formatRate(value: number): string {
  return Math.max(0.25, value || 1).toFixed(4);
}

function formatSeconds(value: number): string {
  return Math.max(0, value).toFixed(3);
}

async function getMediaDuration(url: string, kind: 'audio' | 'video'): Promise<number> {
  return new Promise((resolve) => {
    const media = document.createElement(kind);
    const cleanup = () => {
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
    };
    media.preload = 'metadata';
    media.src = url;

    media.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(media.duration) ? media.duration : 0;
      cleanup();
      resolve(durationSeconds);
    };

    media.onerror = () => {
      cleanup();
      resolve(0);
    };
  });
}

async function renderTextCard({
  text,
  fontFamily,
  fontSizePx,
  color,
  effect,
  opacityPercent,
}: {
  text: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  effect: 'none' | 'shadow' | 'glow' | 'outline';
  opacityPercent: number;
}): Promise<string> {
  const { bounds, svg } = buildTextOverlaySvgAsset({
    text,
    fontFamily,
    fontSizePx,
    color,
    effect,
    opacityPercent,
  });
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = svgUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || bounds.width;
  canvas.height = image.naturalHeight || bounds.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to create a text title card for the manual editor.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

async function renderShapeCard({
  fillColor,
  borderColor,
  borderWidth,
  cornerRadius,
  opacityPercent,
}: {
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  opacityPercent: number;
}): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to create a shape card for the manual editor.');
  }

  const width = 900;
  const height = 440;
  const left = (canvas.width - width) / 2;
  const top = (canvas.height - height) / 2;
  const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));

  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacityPercent / 100));
  context.beginPath();
  context.roundRect(left, top, width, height, radius);
  context.fillStyle = fillColor || '#0ea5e9';
  context.fill();

  if (borderWidth > 0) {
    context.lineWidth = Math.max(0, borderWidth);
    context.strokeStyle = borderColor || '#f8fafc';
    context.stroke();
  }

  context.restore();

  return canvas.toDataURL('image/png');
}
