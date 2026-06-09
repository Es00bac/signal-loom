import type { AspectRatio, EditorStageObject, EditorVisualClip, VideoExportPresetId, VideoResolution } from '../types/flow';
import { getVisualKeyframeStateAtProgress, normalizeVisualKeyframes } from './editorKeyframes';
import { buildStageObjectLayoutDescriptor, buildVisualClipLayoutDescriptor } from './editorVisualLayout';
import { inferMimeTypeFromFile } from './mediaFormatRegistry';

export type VideoParityPriority = 'high' | 'medium' | 'low';

export interface VideoPremiereParityRow {
  id: string;
  area: string;
  premiere: string;
  signalLoom: string;
  priority: VideoParityPriority;
  status: 'done' | 'partial' | 'gap';
  workflowImpact: string;
}

export interface VideoExportPresetPlan {
  presetId: VideoExportPresetId;
  notes?: string;
}

export interface VideoExportPresetOption {
  id: VideoExportPresetId;
  label: string;
  container: string;
  extension: string;
  mimeType: string;
  codec: string;
  outputPattern?: string;
  imageSequence?: boolean;
  videoCodecArgs: string[];
  audioCodecArgs: string[];
  bitrate?: string;
  crf?: number;
  profile?: string;
  frameRate?: number;
  intendedUse: string;
  caveat: string;
  capabilities: VideoExportPresetCapabilities;
  nativeMapping?: Partial<Record<'cpu' | 'amd-vaapi', VideoExportNativeMapping>>;
}

export interface VideoExportPresetCapabilities {
  browser: boolean;
  nativeCpu: boolean;
  nativeVaapi: boolean;
}

export interface VideoExportNativeMapping {
  videoCodecArgs: string[];
  audioCodecArgs?: string[];
  outputFilter?: 'yuv420p' | 'yuva420p' | 'nv12-hwupload';
  notes: string[];
}

export type VideoExportExecutionTarget = 'browser' | 'native-cpu' | 'native-amd-vaapi';

export interface VideoExportPresetAvailability {
  available: boolean;
  reason?: string;
  label: string;
}

export interface VideoSequenceSummary {
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  frameShapeLabel: string;
  sizeLabel: string;
  frameRateLabel: string;
  durationLabel: string;
}

export interface VideoClipParityDescriptor {
  clipId: string;
  sourceKind: EditorVisualClip['sourceKind'];
  progressPercent: number;
  positionX: number;
  positionY: number;
  scalePercent: number;
  rotationDeg: number;
  opacityPercent: number;
  fitMode: EditorVisualClip['fitMode'];
  cropSummary: string;
  keyframeCount: number;
  filterCount: number;
  blendMode: string;
  paritySensitive: boolean;
  frameRect: string;
  cropRect: string;
  textBounds?: string;
  shapeBounds?: string;
}

export interface VideoParityDiagnostic {
  id: string;
  severity: 'pass' | 'attention';
  title: string;
  detail: string;
  descriptor?: VideoClipParityDescriptor;
}

export const VIDEO_PREMIERE_PARITY_ROWS: VideoPremiereParityRow[] = [
  {
    id: 'monitor-render-parity',
    area: 'Monitor/render parity',
    premiere: 'Program Monitor closely matches sequence export for transforms, crops, opacity, text, and nested media.',
    signalLoom: 'Program Monitor preview and FFmpeg render descriptors now share computed layout values for positioned media, crops, text, shapes, transforms, opacity, and keyframes.',
    priority: 'high',
    status: 'done',
    workflowImpact: 'Prevents Flow/Image/Paper-generated clips from shifting between edit preview and final delivery.',
  },
  {
    id: 'source-bin-organization',
    area: 'Generated media bins',
    premiere: 'Bins, labels, search, and metadata keep generated variants organized across large projects.',
    signalLoom: 'Source Bin now mixes generated/imported media with editor assets and collapse/star controls.',
    priority: 'high',
    status: 'done',
    workflowImpact: 'High-volume AI generations need fast triage before they become timeline shots.',
  },
  {
    id: 'sequence-settings',
    area: 'Sequence settings clarity',
    premiere: 'Sequence presets expose frame size, pixel shape, timebase, and duration expectations together.',
    signalLoom: 'Aspect ratio, resolution, timeline length, and frame-rate/timebase are exposed and used by browser sequence renders.',
    priority: 'high',
    status: 'done',
    workflowImpact: 'Clear labels reduce mismatched social, storyboard, and generated-video exports.',
  },
  {
    id: 'export-presets',
    area: 'Export presets',
    premiere: 'Media Encoder presets separate delivery intent from timeline editing.',
    signalLoom: 'Browser FFmpeg uses executable delivery presets; native CPU maps safe H.264 preset settings, while VAAPI normalizes unsupported CRF/profile knobs to hardware QP output.',
    priority: 'medium',
    status: 'done',
    workflowImpact: 'Helps plan web/social/review deliverables without pretending unsupported encoder knobs are active.',
  },
  {
    id: 'transitions',
    area: 'Transitions',
    premiere: 'Rich dissolve and transition controls are editable per cut.',
    signalLoom: 'Clip fade transitions now act as edit-point overlap dissolves in preview timing descriptors and render graph timing when adjacent same-track clips meet.',
    priority: 'medium',
    status: 'done',
    workflowImpact: 'Useful for animatics, but less urgent than keeping generated media aligned and exportable.',
  },
];

export const VIDEO_EXPORT_PRESET_OPTIONS: VideoExportPresetOption[] = [
  {
    id: 'review-h264-1080p',
    label: 'Review H.264 1080p',
    container: 'MP4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    codec: 'H.264/AAC',
    videoCodecArgs: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p'],
    audioCodecArgs: ['-c:a', 'aac', '-b:a', '160k'],
    crf: 23,
    profile: 'high',
    frameRate: 30,
    intendedUse: 'Client review, quick iteration, and Flow share-outs.',
    caveat: 'Browser render applies H.264/AAC delivery args; native render may keep its selected acceleration encoder.',
    capabilities: { browser: true, nativeCpu: true, nativeVaapi: true },
  },
  {
    id: 'social-vertical-h264',
    label: 'Social Vertical H.264',
    container: 'MP4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    codec: 'H.264/AAC vertical delivery',
    videoCodecArgs: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p'],
    audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k'],
    crf: 21,
    profile: 'high',
    frameRate: 30,
    intendedUse: '9:16 shorts and generated-video reels.',
    caveat: 'Use sequence shape/size for the actual vertical canvas; browser render applies this preset codec profile.',
    capabilities: { browser: true, nativeCpu: true, nativeVaapi: true },
  },
  {
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
    caveat: 'Browser render favors quality over speed; native render may use its configured backend encoder.',
    capabilities: { browser: true, nativeCpu: true, nativeVaapi: true },
  },
  {
    id: 'webm-vp9-opus',
    label: 'WebM VP9 + Opus',
    container: 'WebM',
    extension: 'webm',
    mimeType: 'video/webm',
    codec: 'VP9/Opus',
    videoCodecArgs: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p'],
    audioCodecArgs: ['-c:a', 'libopus', '-b:a', '160k'],
    crf: 32,
    intendedUse: 'Open web delivery and smaller review files when VP9 is acceptable.',
    caveat: 'Browser FFmpeg must include libvpx/libopus; native VAAPI is not used for VP9 in this workspace.',
    capabilities: { browser: true, nativeCpu: true, nativeVaapi: false },
    nativeMapping: {
      cpu: {
        videoCodecArgs: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p'],
        audioCodecArgs: ['-c:a', 'libopus', '-b:a', '160k'],
        notes: ['WebM maps to native CPU libvpx-vp9 plus libopus.'],
      },
    },
  },
  {
    id: 'gif-preview',
    label: 'Animated GIF Preview',
    container: 'GIF',
    extension: 'gif',
    mimeType: 'image/gif',
    codec: 'GIF image stream',
    videoCodecArgs: ['-r', '12', '-loop', '0'],
    audioCodecArgs: [],
    frameRate: 12,
    intendedUse: 'Silent looping previews for quick sharing.',
    caveat: 'GIF export is silent and color-limited; audio is intentionally disabled.',
    capabilities: { browser: true, nativeCpu: true, nativeVaapi: false },
    nativeMapping: {
      cpu: {
        videoCodecArgs: ['-vf', 'fps=12,scale=960:-2:flags=lanczos', '-loop', '0'],
        audioCodecArgs: [],
        notes: ['GIF maps to native CPU GIF muxing and omits audio.'],
      },
    },
  },
  {
    id: 'prores-mov',
    label: 'ProRes 422 HQ MOV',
    container: 'MOV',
    extension: 'mov',
    mimeType: 'video/quicktime',
    codec: 'ProRes 422 HQ/PCM',
    videoCodecArgs: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'],
    audioCodecArgs: ['-c:a', 'pcm_s16le'],
    profile: '3',
    intendedUse: 'Intermediate handoff to downstream NLEs.',
    caveat: 'ProRes requires native CPU FFmpeg; browser FFmpeg builds commonly omit prores_ks.',
    capabilities: { browser: false, nativeCpu: true, nativeVaapi: false },
    nativeMapping: {
      cpu: {
        videoCodecArgs: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'],
        audioCodecArgs: ['-c:a', 'pcm_s16le'],
        outputFilter: 'yuv420p',
        notes: ['ProRes maps to native CPU prores_ks profile 3 in a MOV container.'],
      },
    },
  },
  {
    id: 'hevc-h265-mp4',
    label: 'HEVC/H.265 MP4',
    container: 'MP4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    codec: 'HEVC/AAC',
    videoCodecArgs: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
    audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k'],
    crf: 24,
    intendedUse: 'Compact high-quality MP4 delivery where HEVC playback is supported.',
    caveat: 'HEVC requires native CPU FFmpeg; browser FFmpeg builds commonly omit libx265.',
    capabilities: { browser: false, nativeCpu: true, nativeVaapi: false },
    nativeMapping: {
      cpu: {
        videoCodecArgs: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
        audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k'],
        notes: ['HEVC MP4 maps to native CPU libx265 with hvc1 tagging for Apple-compatible MP4 playback.'],
      },
    },
  },
  {
    id: 'hevc-h265-mov',
    label: 'HEVC/H.265 MOV',
    container: 'MOV',
    extension: 'mov',
    mimeType: 'video/quicktime',
    codec: 'HEVC/AAC',
    videoCodecArgs: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
    audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k'],
    crf: 24,
    intendedUse: 'HEVC handoff in a QuickTime container.',
    caveat: 'HEVC MOV requires native CPU FFmpeg; browser and VAAPI are marked unavailable.',
    capabilities: { browser: false, nativeCpu: true, nativeVaapi: false },
    nativeMapping: {
      cpu: {
        videoCodecArgs: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
        audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k'],
        notes: ['HEVC MOV maps to native CPU libx265 in a QuickTime container.'],
      },
    },
  },
  {
    id: 'png-image-sequence',
    label: 'PNG Image Sequence',
    container: 'Image sequence',
    extension: 'png',
    outputPattern: 'sequence-frame-%05d.png',
    imageSequence: true,
    mimeType: 'image/png',
    codec: 'PNG frames',
    videoCodecArgs: ['-vsync', '0', '-start_number', '1', '-c:v', 'png'],
    audioCodecArgs: [],
    intendedUse: 'Frame-by-frame interchange when a directory/archive writer is available.',
    caveat: 'Browser FFmpeg renders numbered PNG frames and returns them as a ZIP archive with manifest.json; audio is ignored.',
    capabilities: { browser: true, nativeCpu: false, nativeVaapi: false },
  },
  {
    id: 'jpeg-image-sequence',
    label: 'JPEG Image Sequence',
    container: 'Image sequence',
    extension: 'jpg',
    outputPattern: 'sequence-frame-%05d.jpg',
    imageSequence: true,
    mimeType: 'image/jpeg',
    codec: 'JPEG frames',
    videoCodecArgs: ['-vsync', '0', '-start_number', '1', '-q:v', '2', '-c:v', 'mjpeg'],
    audioCodecArgs: [],
    intendedUse: 'Lightweight frame sequence proxies when a directory/archive writer is available.',
    caveat: 'Browser FFmpeg renders numbered JPEG frames and returns them as a ZIP archive with manifest.json; audio is ignored.',
    capabilities: { browser: true, nativeCpu: false, nativeVaapi: false },
  },
];

export function getHighPriorityVideoParityRows(): VideoPremiereParityRow[] {
  return VIDEO_PREMIERE_PARITY_ROWS.filter((row) => row.priority === 'high');
}

export function getVideoExportPresetOption(presetId?: string): VideoExportPresetOption {
  return VIDEO_EXPORT_PRESET_OPTIONS.find((preset) => preset.id === presetId) ?? VIDEO_EXPORT_PRESET_OPTIONS[0];
}

export function resolveVideoExportPreset(presetId?: string): VideoExportPresetOption {
  return getVideoExportPresetOption(presetId);
}

export function getVideoExportPresetAvailability(
  preset: VideoExportPresetOption,
  target: VideoExportExecutionTarget,
): VideoExportPresetAvailability {
  const available = target === 'browser'
    ? preset.capabilities.browser
    : target === 'native-cpu'
      ? preset.capabilities.nativeCpu
      : preset.capabilities.nativeVaapi;
  const label = target === 'browser' ? 'Browser' : target === 'native-cpu' ? 'Native CPU' : 'AMD VAAPI';

  if (available) {
    return { available: true, label };
  }

  if (preset.imageSequence) {
    return { available: false, label, reason: 'Native image sequence ZIP export is not implemented for this render target.' };
  }

  if (target === 'browser') {
    return { available: false, label, reason: `${preset.codec} is not enabled for browser FFmpeg in this workspace.` };
  }

  if (target === 'native-amd-vaapi') {
    return { available: false, label, reason: `${preset.codec} is not mapped to AMD VAAPI output.` };
  }

  return { available: false, label, reason: `${preset.codec} is not mapped for this render target.` };
}

export function isVideoExportPresetAvailable(
  preset: VideoExportPresetOption,
  target: VideoExportExecutionTarget,
): boolean {
  return getVideoExportPresetAvailability(preset, target).available;
}

export function getVideoExportPresetMimeType(presetId?: string): string {
  const preset = resolveVideoExportPreset(presetId);
  return inferMimeTypeFromFile(`output.${preset.extension}`, 'video') ?? preset.mimeType;
}

export function buildVideoSequenceSummary(
  aspectRatio: AspectRatio,
  resolution: VideoResolution,
  dimensions: { width: number; height: number },
  durationSeconds: number,
  frameRate = 30,
): VideoSequenceSummary {
  const frameShapeLabel = aspectRatio === '16:9' ? 'Landscape 16:9' : aspectRatio === '9:16' ? 'Vertical 9:16' : 'Square 1:1';
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;

  return {
    aspectRatio,
    resolution,
    width: dimensions.width,
    height: dimensions.height,
    durationSeconds: safeDuration,
    frameRate,
    frameShapeLabel,
    sizeLabel: `${dimensions.width} x ${dimensions.height} (${resolution})`,
    frameRateLabel: `${frameRate} fps timebase`,
    durationLabel: safeDuration > 0 ? `${safeDuration.toFixed(1)}s timeline` : 'No timed clips yet',
  };
}

export function getVideoMonitorParityNotices({
  visualClips,
  stageObjects,
  exportPresetPlan,
}: {
  visualClips: EditorVisualClip[];
  stageObjects: EditorStageObject[];
  exportPresetPlan?: VideoExportPresetPlan;
}): string[] {
  const notices: string[] = [];

  if (visualClips.some(hasParitySensitiveClipSettings)) {
    notices.push('Export diagnostics found preview/render-sensitive clip settings. Open diagnostics before delivery to verify transforms, crops, filters, blend modes, and text placement.');
  }

  if (stageObjects.length > 0) {
    notices.push('Legacy monitor objects are present; timeline-backed text/shape assets are preferred for render parity.');
  }

  if (exportPresetPlan?.presetId) {
    notices.push(`Export preset "${getVideoExportPresetOption(exportPresetPlan.presetId).label}" will be applied by browser FFmpeg; native render may keep backend-specific encoder settings.`);
  }

  return notices;
}

export function buildVideoClipParityDescriptor(
  clip: EditorVisualClip,
  progressPercent = 0,
): VideoClipParityDescriptor {
  const state = getVisualKeyframeStateAtProgress(clip, progressPercent);
  const cropSummary = buildCropSummary(clip);
  const filterCount = clip.filterStack.filter((filter) => filter.enabled).length;
  const keyframeCount = normalizeVisualKeyframes(clip).length;
  const layout = buildVisualClipLayoutDescriptor({
    clip,
    canvas: { width: 1920, height: 1080 },
    source: resolveDiagnosticSourceDimensions(clip),
    progressPercent,
    text: clip.textContent ?? 'Text',
  });

  return {
    clipId: clip.id,
    sourceKind: clip.sourceKind,
    progressPercent,
    positionX: state.positionX,
    positionY: state.positionY,
    scalePercent: state.scalePercent,
    rotationDeg: state.rotationDeg,
    opacityPercent: state.opacityPercent,
    fitMode: clip.fitMode,
    cropSummary,
    keyframeCount,
    filterCount,
    blendMode: clip.blendMode ?? 'normal',
    paritySensitive: hasParitySensitiveClipSettings(clip),
    frameRect: `${round(layout.left)},${round(layout.top)} ${round(layout.width)}x${round(layout.height)}`,
    cropRect: `${round(layout.crop.renderCropXPercent)}%,${round(layout.crop.renderCropYPercent)}% ${round(layout.crop.visibleWidthPercent)}%x${round(layout.crop.visibleHeightPercent)}%`,
    textBounds: layout.text ? `${round(layout.text.width)}x${round(layout.text.height)} lh ${layout.text.lineHeight}` : undefined,
    shapeBounds: layout.shape ? `${round(layout.shape.innerLeft)},${round(layout.shape.innerTop)} ${round(layout.shape.innerWidth)}x${round(layout.shape.innerHeight)}` : undefined,
  };
}

export function buildVideoParityDiagnostics({
  visualClips,
  stageObjects,
}: {
  visualClips: EditorVisualClip[];
  stageObjects: EditorStageObject[];
}): VideoParityDiagnostic[] {
  const diagnostics: VideoParityDiagnostic[] = [];

  for (const clip of visualClips) {
    const descriptor = buildVideoClipParityDescriptor(clip);

    diagnostics.push({
      id: `clip-${clip.id}`,
      severity: descriptor.paritySensitive ? 'attention' : 'pass',
      title: descriptor.paritySensitive ? `${clip.sourceKind} clip verified with render-sensitive layout` : `${clip.sourceKind} clip layout parity verified`,
      detail: `Descriptor values: frame ${descriptor.frameRect}; pos ${descriptor.positionX}, ${descriptor.positionY}; scale ${descriptor.scalePercent}%; rotation ${descriptor.rotationDeg}deg; opacity ${descriptor.opacityPercent}%; crop ${descriptor.cropSummary} (${descriptor.cropRect}); ${descriptor.keyframeCount} keyframes; ${descriptor.filterCount} filters; blend ${descriptor.blendMode}${descriptor.textBounds ? `; text ${descriptor.textBounds}` : ''}${descriptor.shapeBounds ? `; shape ${descriptor.shapeBounds}` : ''}.`,
      descriptor,
    });
  }

  for (const object of stageObjects) {
    const descriptor = buildStageObjectLayoutDescriptor(object);
    diagnostics.push({
      id: `stage-${object.id}`,
      severity: 'attention',
      title: 'Legacy monitor object verified through shared descriptor',
      detail: `Descriptor values: ${descriptor.kind} frame ${round(descriptor.left)},${round(descriptor.top)} ${round(descriptor.width)}x${round(descriptor.height)}; rotation ${descriptor.rotationDeg}deg; opacity ${descriptor.opacityPercent}%; blend ${descriptor.blendMode}. Timeline-backed assets still provide easier keyframe editing.`,
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      id: 'parity-clear',
      severity: 'pass',
      title: 'No render-sensitive parity issues detected',
      detail: 'No visual clips or legacy stage objects are currently present; monitor/render layout descriptors have no mismatches to report.',
    });
  }

  return diagnostics;
}

function resolveDiagnosticSourceDimensions(clip: EditorVisualClip): { width: number; height: number } {
  if (clip.sourceKind === 'text') {
    return { width: 640, height: 180 };
  }

  if (clip.sourceKind === 'shape') {
    return { width: 1280, height: 720 };
  }

  return { width: 1920, height: 1080 };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function buildCropSummary(clip: EditorVisualClip): string {
  const parts = [
    clip.cropLeftPercent ? `L${clip.cropLeftPercent}%` : '',
    clip.cropRightPercent ? `R${clip.cropRightPercent}%` : '',
    clip.cropTopPercent ? `T${clip.cropTopPercent}%` : '',
    clip.cropBottomPercent ? `B${clip.cropBottomPercent}%` : '',
    clip.cropPanXPercent ? `panX ${clip.cropPanXPercent}%` : '',
    clip.cropPanYPercent ? `panY ${clip.cropPanYPercent}%` : '',
    clip.cropRotationDeg ? `rot ${clip.cropRotationDeg}deg` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : 'none';
}

function hasParitySensitiveClipSettings(clip: EditorVisualClip): boolean {
  const hasCrop = clip.cropLeftPercent > 0
    || clip.cropRightPercent > 0
    || clip.cropTopPercent > 0
    || clip.cropBottomPercent > 0
    || clip.cropPanXPercent !== 0
    || clip.cropPanYPercent !== 0
    || clip.cropRotationDeg !== 0;
  const hasMotion = clip.keyframes !== undefined && clip.keyframes.length > 2;
  const hasFilters = clip.filterStack.some((filter) => filter.enabled);
  const hasBlend = Boolean(clip.blendMode && clip.blendMode !== 'normal');
  const hasText = clip.sourceKind === 'text';

  return hasCrop || hasMotion || hasFilters || hasBlend || hasText;
}
