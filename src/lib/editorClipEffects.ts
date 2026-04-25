import type { EditorClipFilter, EditorStageBlendMode, EditorVisualClip } from '../types/flow';

export interface ClipCropSettings {
  cropLeftPercent: number;
  cropRightPercent: number;
  cropTopPercent: number;
  cropBottomPercent: number;
  cropPanXPercent: number;
  cropPanYPercent: number;
  cropRotationDeg: number;
}

export interface ClipEffectSettings extends ClipCropSettings {
  filterStack: EditorClipFilter[];
  blendMode?: EditorStageBlendMode;
}

export interface ClipEffectDescriptor {
  crop: ClipCropSettings;
  filterStack: EditorClipFilter[];
  cssFilter: string;
  cssBlendMode: EditorStageBlendMode;
  ffmpegFilters: string[];
  ffmpegBlendMode?: string;
}

const CLIP_BLEND_MODES: EditorStageBlendMode[] = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'darken',
  'color-dodge',
  'color-burn',
];

export function normalizeClipCrop(settings: ClipCropSettings): ClipCropSettings {
  let left = clamp(settings.cropLeftPercent, 0, 95);
  let right = clamp(settings.cropRightPercent, 0, 95);
  let top = clamp(settings.cropTopPercent, 0, 95);
  let bottom = clamp(settings.cropBottomPercent, 0, 95);

  if (left + right > 95) {
    const scale = 95 / (left + right);
    left = Math.floor(left * scale);
    right = 95 - left;
  }

  if (top + bottom > 95) {
    const scale = 95 / (top + bottom);
    top = Math.floor(top * scale);
    bottom = 95 - top;
  }

  return {
    cropLeftPercent: left,
    cropRightPercent: right,
    cropTopPercent: top,
    cropBottomPercent: bottom,
    cropPanXPercent: clamp(settings.cropPanXPercent, -100, 100),
    cropPanYPercent: clamp(settings.cropPanYPercent, -100, 100),
    cropRotationDeg: settings.cropRotationDeg,
  };
}

export function getClipEffectSettings(clip: EditorVisualClip): ClipEffectSettings {
  return {
    cropLeftPercent: clip.cropLeftPercent,
    cropRightPercent: clip.cropRightPercent,
    cropTopPercent: clip.cropTopPercent,
    cropBottomPercent: clip.cropBottomPercent,
    cropPanXPercent: clip.cropPanXPercent,
    cropPanYPercent: clip.cropPanYPercent,
    cropRotationDeg: clip.cropRotationDeg,
    filterStack: clip.filterStack,
    blendMode: normalizeClipBlendMode(clip.blendMode),
  };
}

export function buildClipEffectDescriptor(settings: ClipEffectSettings): ClipEffectDescriptor {
  const filterStack = settings.filterStack ?? [];

  return {
    crop: normalizeClipCrop(settings),
    filterStack,
    cssFilter: buildCssClipFilter(filterStack),
    cssBlendMode: buildCssClipBlendMode(settings.blendMode),
    ffmpegFilters: buildFFmpegClipEffectFilters(settings),
    ffmpegBlendMode: mapClipBlendModeToFFmpeg(settings.blendMode),
  };
}

export function buildClipEffectDescriptorForClip(clip: EditorVisualClip): ClipEffectDescriptor {
  return buildClipEffectDescriptor(getClipEffectSettings(clip));
}

export function normalizeClipBlendMode(value: unknown): EditorStageBlendMode {
  return CLIP_BLEND_MODES.includes(value as EditorStageBlendMode)
    ? value as EditorStageBlendMode
    : 'normal';
}

export function getClipBlendModes(): EditorStageBlendMode[] {
  return [...CLIP_BLEND_MODES];
}

export function buildCssClipBlendMode(value: unknown): EditorStageBlendMode {
  return normalizeClipBlendMode(value);
}

export function mapClipBlendModeToFFmpeg(value: unknown): string | undefined {
  switch (normalizeClipBlendMode(value)) {
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

export function buildFFmpegClipEffectFilters(settings: ClipEffectSettings): string[] {
  const crop = normalizeClipCrop(settings);
  const filters: string[] = [];
  const widthPercent = (100 - crop.cropLeftPercent - crop.cropRightPercent) / 100;
  const heightPercent = (100 - crop.cropTopPercent - crop.cropBottomPercent) / 100;

  if (widthPercent < 1 || heightPercent < 1) {
    const maxXPercent = 1 - widthPercent;
    const maxYPercent = 1 - heightPercent;
    const xPercent = clampFloat(
      crop.cropLeftPercent / 100 - (crop.cropPanXPercent / 100) * (maxXPercent / 2),
      0,
      maxXPercent,
    );
    const yPercent = clampFloat(
      crop.cropTopPercent / 100 - (crop.cropPanYPercent / 100) * (maxYPercent / 2),
      0,
      maxYPercent,
    );

    filters.push(
      `crop=w='iw*${widthPercent.toFixed(4)}':h='ih*${heightPercent.toFixed(4)}':x='iw*${xPercent.toFixed(4)}':y='ih*${yPercent.toFixed(4)}'`,
    );
  }

  if (crop.cropRotationDeg !== 0) {
    filters.push(`rotate='${(crop.cropRotationDeg * Math.PI / 180).toFixed(6)}':c=none:ow=rotw(iw):oh=roth(ih)`);
  }

  for (const filter of settings.filterStack.filter((item) => item.enabled)) {
    if (filter.kind === 'brightness') {
      filters.push(`eq=brightness=${(filter.amount / 100).toFixed(4)}`);
    } else if (filter.kind === 'contrast') {
      filters.push(`eq=contrast=${Math.max(0, 1 + filter.amount / 100).toFixed(4)}`);
    } else if (filter.kind === 'saturation') {
      filters.push(`eq=saturation=${Math.max(0, 1 + filter.amount / 100).toFixed(4)}`);
    } else if (filter.kind === 'blur') {
      filters.push(`boxblur=${Math.max(0, filter.amount / 10).toFixed(2)}:1`);
    } else if (filter.kind === 'grayscale') {
      filters.push('format=gray,format=rgba');
    }
  }

  return filters;
}

export function buildCssClipFilter(filters: EditorClipFilter[]): string {
  const parts = filters.filter((filter) => filter.enabled).flatMap((filter) => {
    if (filter.kind === 'brightness') {
      return [`brightness(${formatCssNumber(Math.max(0, 1 + filter.amount / 100))})`];
    }

    if (filter.kind === 'contrast') {
      return [`contrast(${formatCssNumber(Math.max(0, 1 + filter.amount / 100))})`];
    }

    if (filter.kind === 'saturation') {
      return [`saturate(${formatCssNumber(Math.max(0, 1 + filter.amount / 100))})`];
    }

    if (filter.kind === 'blur') {
      return [`blur(${formatCssNumber(Math.max(0, filter.amount / 5))}px)`];
    }

    if (filter.kind === 'grayscale') {
      return [`grayscale(${formatCssNumber(Math.max(0, Math.min(1, filter.amount / 100)))})`];
    }

    return [];
  });

  return parts.join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCssNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
