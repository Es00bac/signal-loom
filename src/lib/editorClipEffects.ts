import type {
  EditorClipChromaKeySettings,
  EditorClipFilter,
  EditorClipFilterKind,
  EditorClipStrokeSettings,
  EditorStageBlendMode,
} from '../types/flow';

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
  chromaKey?: EditorClipChromaKeySettings;
  stroke?: EditorClipStrokeSettings;
}

export interface ClipEffectDescriptor {
  crop: ClipCropSettings;
  filterStack: EditorClipFilter[];
  chromaKey?: EditorClipChromaKeySettings;
  stroke?: EditorClipStrokeSettings;
  cssFilter: string;
  cssBlendMode: EditorStageBlendMode;
  cssOutline?: {
    color: string;
    widthPx: number;
    opacityPercent: number;
  };
  ffmpegFilters: string[];
  ffmpegBlendMode?: string;
}

/**
 * The full 16-mode Photoshop/canvas blend set (matches Image's `BlendMode`,
 * src/types/imageEditor.ts, and `EditorStageBlendMode`, src/types/flow.ts). CSS `mix-blend-mode`
 * keywords are identical to these strings verbatim, so `buildCssClipBlendMode` needs no translation
 * table — only `mapClipBlendModeToFFmpeg` (below) needs a name table, since FFmpeg's `blend=` filter
 * uses different spellings for a few modes and has no equivalent for the four non-separable HSL
 * modes (hue/saturation/color/luminosity).
 */
const CLIP_BLEND_MODES: EditorStageBlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

const CLIP_FILTER_KINDS: readonly EditorClipFilterKind[] = [
  'brightness',
  'contrast',
  'saturation',
  'blur',
  'grayscale',
  'sepia',
  'invert',
  'hue-rotate',
];

export const DEFAULT_CLIP_CHROMA_KEY: EditorClipChromaKeySettings = {
  enabled: false,
  color: '#00ff00',
  similarityPercent: 20,
  blendPercent: 6,
};

export const DEFAULT_CLIP_STROKE: EditorClipStrokeSettings = {
  enabled: false,
  color: '#ffffff',
  widthPx: 0,
  opacityPercent: 100,
};

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

/**
 * The subset of `EditorVisualClip` the crop/filter/blend/chroma-key/stroke descriptor actually
 * reads. Widened from the concrete `EditorVisualClip` (rather than left nominal) so the SAME
 * descriptor builder is callable from both the Edit Stage preview (which has a real
 * `EditorVisualClip`) and the frame-server export driver (which works from
 * `mediaComposition.ts`'s flattened `ComposeSequenceVisualClip` — a structurally compatible but
 * separate interface) — see `src/lib/stageFrameCompositor.ts`. One function, two structurally
 * compatible callers, zero behavior change.
 */
export interface ClipEffectSourceClip {
  // Required on `EditorVisualClip`, but `mediaComposition.ts`'s `ComposeSequenceVisualClip` (the
  // export driver's flattened clip shape) declares these optional — every reader below
  // (`normalizeClipCrop`'s `clamp`, `normalizeClipFilterStack`, `normalizeClipBlendMode`, ...)
  // already treats a missing/non-finite value as its documented default, so widening to optional
  // here is a pure type-level accommodation, not a behavior change.
  cropLeftPercent?: number;
  cropRightPercent?: number;
  cropTopPercent?: number;
  cropBottomPercent?: number;
  cropPanXPercent?: number;
  cropPanYPercent?: number;
  cropRotationDeg?: number;
  filterStack?: EditorClipFilter[];
  blendMode?: EditorStageBlendMode;
  chromaKey?: EditorClipChromaKeySettings;
  stroke?: EditorClipStrokeSettings;
}

export function getClipEffectSettings(clip: ClipEffectSourceClip): ClipEffectSettings {
  return {
    cropLeftPercent: clip.cropLeftPercent ?? 0,
    cropRightPercent: clip.cropRightPercent ?? 0,
    cropTopPercent: clip.cropTopPercent ?? 0,
    cropBottomPercent: clip.cropBottomPercent ?? 0,
    cropPanXPercent: clip.cropPanXPercent ?? 0,
    cropPanYPercent: clip.cropPanYPercent ?? 0,
    cropRotationDeg: clip.cropRotationDeg ?? 0,
    filterStack: normalizeClipFilterStack(clip.filterStack),
    blendMode: normalizeClipBlendMode(clip.blendMode),
    chromaKey: normalizeClipChromaKey(clip.chromaKey),
    stroke: normalizeClipStroke(clip.stroke),
  };
}

export function buildClipEffectDescriptor(settings: ClipEffectSettings): ClipEffectDescriptor {
  const filterStack = normalizeClipFilterStack(settings.filterStack);
  const chromaKey = normalizeClipChromaKey(settings.chromaKey);
  const stroke = normalizeClipStroke(settings.stroke);

  return {
    crop: normalizeClipCrop(settings),
    filterStack,
    chromaKey,
    stroke,
    cssFilter: buildCssClipFilter(filterStack),
    cssBlendMode: buildCssClipBlendMode(settings.blendMode),
    cssOutline: stroke.enabled && stroke.widthPx > 0
      ? {
          color: stroke.color,
          widthPx: stroke.widthPx,
          opacityPercent: stroke.opacityPercent,
        }
      : undefined,
    ffmpegFilters: buildFFmpegClipEffectFilters({ ...settings, chromaKey, filterStack, stroke }),
    ffmpegBlendMode: mapClipBlendModeToFFmpeg(settings.blendMode),
  };
}

export function buildClipEffectDescriptorForClip(clip: ClipEffectSourceClip): ClipEffectDescriptor {
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

export function getClipFilterKinds(): EditorClipFilterKind[] {
  return [...CLIP_FILTER_KINDS];
}

export function normalizeClipFilterStack(value: unknown): EditorClipFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((filter) => {
    if (!isRecord(filter) || typeof filter.id !== 'string' || !CLIP_FILTER_KINDS.includes(filter.kind as EditorClipFilterKind)) {
      return [];
    }

    return [{
      id: filter.id,
      kind: filter.kind as EditorClipFilterKind,
      amount: normalizeClipFilterAmount(filter.kind as EditorClipFilterKind, filter.amount),
      enabled: typeof filter.enabled === 'boolean' ? filter.enabled : true,
    }];
  });
}

export function normalizeClipChromaKey(value: unknown): EditorClipChromaKeySettings {
  const input = isRecord(value) ? value : {};

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_CLIP_CHROMA_KEY.enabled,
    color: normalizeColor(input.color, DEFAULT_CLIP_CHROMA_KEY.color),
    similarityPercent: clamp(input.similarityPercent, 0, 100),
    blendPercent: clamp(input.blendPercent, 0, 100),
  };
}

export function normalizeClipStroke(value: unknown): EditorClipStrokeSettings {
  const input = isRecord(value) ? value : {};

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_CLIP_STROKE.enabled,
    color: normalizeColor(input.color, DEFAULT_CLIP_STROKE.color),
    widthPx: clamp(input.widthPx, 0, 80),
    opacityPercent: clamp(input.opacityPercent, 0, 100),
  };
}

export function buildCssClipBlendMode(value: unknown): EditorStageBlendMode {
  return normalizeClipBlendMode(value);
}

/**
 * Maps a clip blend mode to FFmpeg's `blend=all_mode=<name>` value. Most of the 16 modes are
 * spelled identically; a handful differ (`color-dodge`->`dodge`, `color-burn`->`burn`,
 * `hard-light`->`hardlight`, `soft-light`->`softlight` — verified against FFmpeg's `blend_modes.c`
 * enum, which has no `colordodge`/`colorburn` entries). The four non-separable HSL modes
 * (hue/saturation/color/luminosity) have no FFmpeg `blend=` equivalent at all and fall back to
 * `undefined` (normal) on export — that's a real fidelity gap between preview (CSS, which supports
 * them) and export, not a bug.
 */
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
      return 'dodge';
    case 'color-burn':
      return 'burn';
    case 'hard-light':
      return 'hardlight';
    case 'soft-light':
      return 'softlight';
    case 'difference':
      return 'difference';
    case 'exclusion':
      return 'exclusion';
    case 'hue':
    case 'saturation':
    case 'color':
    case 'luminosity':
    case 'normal':
      return undefined;
  }
}

export function buildFFmpegClipEffectFilters(settings: ClipEffectSettings): string[] {
  const crop = normalizeClipCrop(settings);
  const chromaKey = normalizeClipChromaKey(settings.chromaKey);
  const stroke = normalizeClipStroke(settings.stroke);
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

  if (chromaKey.enabled) {
    filters.push(`chromakey=${formatFFmpegHexColor(chromaKey.color)}:${(chromaKey.similarityPercent / 100).toFixed(4)}:${(chromaKey.blendPercent / 100).toFixed(4)}`);
  }

  for (const filter of normalizeClipFilterStack(settings.filterStack).filter((item) => item.enabled)) {
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
    } else if (filter.kind === 'sepia') {
      filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    } else if (filter.kind === 'invert') {
      filters.push('negate=negate_alpha=0');
    } else if (filter.kind === 'hue-rotate') {
      filters.push(`hue=h='${filter.amount.toFixed(4)}'`);
    }
  }

  if (stroke.enabled && stroke.widthPx > 0 && stroke.opacityPercent > 0) {
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${formatFFmpegHexColor(stroke.color)}@${(stroke.opacityPercent / 100).toFixed(4)}:t=${stroke.widthPx}`);
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

    if (filter.kind === 'sepia') {
      return [`sepia(${formatCssNumber(Math.max(0, Math.min(1, filter.amount / 100)))})`];
    }

    if (filter.kind === 'invert') {
      return [`invert(${formatCssNumber(Math.max(0, Math.min(1, filter.amount / 100)))})`];
    }

    if (filter.kind === 'hue-rotate') {
      return [`hue-rotate(${formatCssNumber(filter.amount)}deg)`];
    }

    return [];
  });

  return parts.join(' ');
}

function clamp(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(typeof value === 'number' && Number.isFinite(value) ? value : min)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCssNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function normalizeClipFilterAmount(kind: EditorClipFilterKind, value: unknown): number {
  if (kind === 'hue-rotate') {
    return clamp(value, -180, 180);
  }

  if (kind === 'blur' || kind === 'grayscale' || kind === 'sepia' || kind === 'invert') {
    return clamp(value, 0, 100);
  }

  return clamp(value, -100, 100);
}

function formatFFmpegHexColor(color: string): string {
  return `0x${normalizeColor(color, '#000000').slice(1).toLowerCase()}`;
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  const named: Record<string, string> = {
    green: '#00ff00',
    blue: '#0000ff',
    red: '#ff0000',
    black: '#000000',
    white: '#ffffff',
  };
  if (named[trimmed]) return named[trimmed];
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
