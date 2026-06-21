import type { BrushSettings } from '../../types/imageEditor';
import {
  buildBrushStrokePreviewMetadata,
  describeUnsupportedBrushDynamicsReadiness,
  getUnsupportedBrushCapabilityWarnings,
  normalizeBrushSettings,
  summarizeBrushPresetCapabilities,
  type BrushCapabilityWarning,
  type BrushPresetWorkflow,
  type BrushUnsupportedDynamicsReadinessDescriptor,
} from './ImageBrushEngine';

export type ImageBrushPresetGroup =
  | 'Sketch'
  | 'Ink'
  | 'Paint'
  | 'Comic / Manga'
  | 'FX'
  | 'Utility'
  | 'User';

export type ImageBrushPresetCategory =
  | 'basic-round'
  | 'soft-round'
  | 'hard-round'
  | 'pencil-inking'
  | 'airbrush'
  | 'texture'
  | 'smudge-retouch'
  | 'eraser'
  | 'utility';

export interface ImageBrushPresetCompatibility {
  paint: boolean;
  erase: boolean;
  mask: boolean;
  retouch: boolean;
}

export type ImageBrushPresetUseCase =
  | 'paint'
  | 'ink'
  | 'linework'
  | 'texture'
  | 'retouch'
  | 'blend'
  | 'cleanup';

export interface ImageBrushPresetStandardProfile {
  category: ImageBrushPresetCategory;
  categories: ImageBrushPresetCategory[];
  useCases: ImageBrushPresetUseCase[];
  compatibility?: ImageBrushPresetCompatibility;
}

type ResolvedImageBrushPresetStandardProfile = ImageBrushPresetStandardProfile & {
  compatibility: ImageBrushPresetCompatibility;
};

export interface ImageBrushPreset {
  id: string;
  label: string;
  group: ImageBrushPresetGroup;
  settings: Partial<BrushSettings>;
}

export interface ImageBrushPresetPack {
  version: 1;
  metadata?: ImageBrushPresetPackMetadata;
  presets: Array<{
    label: string;
    settings: Partial<BrushSettings>;
    metadata?: ImageBrushPresetDescriptor;
  }>;
}

export type ImageBrushPresetOrigin = 'built-in' | 'user';
export type ImageBrushPresetStorage = 'bundled' | 'localStorage';

export interface ImageBrushPresetPreviewDescriptor {
  deterministic: true;
  tileViewBox: string;
  signature: string;
  sampleDabCount: number;
  totalDabCount: number;
  spacingCoverage: 'continuous' | 'spaced' | 'stamp';
  sampleStroke: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    pressure: number;
    seed: number;
  };
  dynamics: {
    size: number;
    opacity: number;
    flow: number;
    spacingPx: number;
    hardness: number;
    roundness: number;
    angleDeg: number;
    tipShape: BrushSettings['tipShape'];
  };
  pressureAffects: Array<'size' | 'opacity' | 'flow' | 'roundness' | 'hardness'>;
  scatterPx: number;
}

export interface ImageBrushPresetDynamicsDescriptor {
  implemented: {
    brushDabs: true;
    smoothing: boolean;
    pressureAffects: Array<'size' | 'opacity' | 'flow' | 'roundness' | 'hardness'>;
    tiltAffects: Array<'angle'>;
    symmetryMode: BrushSettings['symmetryMode'];
  };
  texture: BrushUnsupportedDynamicsReadinessDescriptor['texture'];
  scattering: BrushUnsupportedDynamicsReadinessDescriptor['scattering'];
  unsupportedWarnings: BrushCapabilityWarning[];
  previewSignature: string;
}

export interface ImageBrushPresetImportExportReadiness {
  storage: ImageBrushPresetStorage;
  packVersion: ImageBrushPresetPack['version'];
  importableFromPack: boolean;
  exportableToPack: boolean;
  roundTripReady: boolean;
  warnings: string[];
}

export interface ImageBrushPresetDescriptor {
  descriptorId: string;
  version: 1;
  id: string;
  label: string;
  group: ImageBrushPresetGroup;
  category: ImageBrushPresetCategory;
  categories: ImageBrushPresetCategory[];
  useCases: ImageBrushPresetUseCase[];
  compatibility: ImageBrushPresetCompatibility;
  origin: ImageBrushPresetOrigin;
  workflows: BrushPresetWorkflow[];
  tags: string[];
  settings: BrushSettings;
  preview: ImageBrushPresetPreviewDescriptor;
  dynamics: ImageBrushPresetDynamicsDescriptor;
  importExport: ImageBrushPresetImportExportReadiness;
  unsupportedWarnings: BrushCapabilityWarning[];
}

export interface ImageBrushPresetLibraryDescriptor {
  descriptorId: 'image-brush-preset-library:v1';
  version: 1;
  counts: {
    builtIn: number;
    user: number;
    total: number;
  };
  groups: Record<string, number>;
  tags: string[];
  presets: ImageBrushPresetDescriptor[];
  importExport: {
    packVersion: ImageBrushPresetPack['version'];
    exportableUserPresets: number;
    importableUserPresets: number;
    builtInsBundled: number;
    ready: boolean;
  };
  unsupportedWarnings: BrushCapabilityWarning[];
}

export interface ImageBrushPresetPackMetadata {
  descriptorId: 'image-brush-preset-pack:v1';
  version: 1;
  tags: string[];
  importExport: ImageBrushPresetLibraryDescriptor['importExport'];
  unsupportedWarnings: BrushCapabilityWarning[];
}

export interface ImageBrushPresetPackSerializationDescriptor {
  descriptorId: 'image-brush-preset-pack-serialization:v1';
  version: 1;
  packVersion: ImageBrushPresetPack['version'];
  presetCount: number;
  portable: boolean;
  previewSignatures: string[];
  symmetryModes: Array<BrushSettings['symmetryMode']>;
  portabilityWarnings: string[];
  unsupportedWarnings: BrushCapabilityWarning[];
  signature: string;
}

export interface ImageBrushPresetPackValidationDescriptor {
  descriptorId: 'image-brush-preset-pack-validation:v1';
  version: 1;
  packVersion: number | null;
  parseable: boolean;
  importable: boolean;
  exportableAfterImport: boolean;
  presetCount: number;
  acceptedPresetCount: number;
  rejectedPresetCount: number;
  rejectedReasons: string[];
  importedPresetIds: string[];
  previewSignatures: string[];
  unsupportedWarnings: BrushCapabilityWarning[];
  signature: string;
}

export const BRUSH_PRESET_GROUPS: Array<Exclude<ImageBrushPresetGroup, 'User'>> = [
  'Sketch',
  'Ink',
  'Paint',
  'Comic / Manga',
  'FX',
  'Utility',
];

export const IMAGE_BRUSH_PRESET_CATEGORIES: ImageBrushPresetCategory[] = [
  'basic-round',
  'soft-round',
  'hard-round',
  'pencil-inking',
  'airbrush',
  'texture',
  'smudge-retouch',
  'eraser',
  'utility',
];

const BRUSH_PRESET_COMPATIBILITY_BY_CATEGORY: Record<ImageBrushPresetCategory, ImageBrushPresetCompatibility> = {
  'basic-round': { paint: true, erase: false, mask: true, retouch: false },
  'soft-round': { paint: true, erase: false, mask: true, retouch: false },
  'hard-round': { paint: true, erase: false, mask: true, retouch: false },
  'pencil-inking': { paint: true, erase: false, mask: true, retouch: true },
  'airbrush': { paint: true, erase: false, mask: true, retouch: true },
  texture: { paint: true, erase: false, mask: true, retouch: true },
  'smudge-retouch': { paint: true, erase: false, mask: true, retouch: true },
  eraser: { paint: false, erase: true, mask: true, retouch: false },
  utility: { paint: true, erase: false, mask: true, retouch: false },
};

const BRUSH_PRESET_CATEGORY_PROFILE_BY_ID: Record<string, ImageBrushPresetStandardProfile> = {
  pencil: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  marker: {
    category: 'basic-round',
    categories: ['basic-round'],
    useCases: ['paint', 'linework'],
  },
  charcoal: {
    category: 'texture',
    categories: ['texture'],
    useCases: ['texture', 'paint'],
    compatibility: { paint: true, erase: false, mask: true, retouch: true },
  },
  textureStipple: {
    category: 'texture',
    categories: ['texture', 'smudge-retouch'],
    useCases: ['texture', 'retouch'],
  },
  inker: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  brushPen: {
    category: 'pencil-inking',
    categories: ['pencil-inking', 'basic-round'],
    useCases: ['ink', 'linework', 'paint'],
  },
  calligraphyChisel: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  technicalLiner: {
    category: 'pencil-inking',
    categories: ['pencil-inking', 'hard-round'],
    useCases: ['ink', 'cleanup', 'linework'],
  },
  airbrush: {
    category: 'airbrush',
    categories: ['airbrush', 'smudge-retouch'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  dryBrush: {
    category: 'texture',
    categories: ['texture', 'smudge-retouch'],
    useCases: ['texture', 'paint', 'retouch'],
  },
  watercolorWash: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch', 'texture'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  gouacheFlat: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch', 'texture'],
    useCases: ['paint', 'texture', 'retouch'],
  },
  oilBristle: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch', 'texture'],
    useCases: ['paint', 'retouch'],
    compatibility: { paint: true, erase: false, mask: true, retouch: true },
  },
  cloudGlaze: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  mangaInker: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  screentoneDots: {
    category: 'texture',
    categories: ['texture', 'smudge-retouch'],
    useCases: ['texture', 'paint'],
  },
  speedLine: {
    category: 'basic-round',
    categories: ['basic-round', 'pencil-inking'],
    useCases: ['linework', 'cleanup', 'paint'],
  },
  storyboardBlue: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  halftoneBlock: {
    category: 'texture',
    categories: ['texture'],
    useCases: ['texture', 'paint'],
  },
  fxSpark: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch'],
    useCases: ['paint', 'blend'],
  },
  rimLight: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch', 'airbrush'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  glowBloom: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch', 'airbrush'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  hardRound: {
    category: 'hard-round',
    categories: ['hard-round', 'basic-round'],
    useCases: ['paint', 'linework'],
  },
  softRound: {
    category: 'soft-round',
    categories: ['soft-round', 'basic-round'],
    useCases: ['paint', 'linework'],
  },
  softEraser: {
    category: 'eraser',
    categories: ['eraser', 'utility'],
    useCases: ['cleanup'],
    compatibility: { paint: false, erase: true, mask: true, retouch: false },
  },
  hardEraser: {
    category: 'eraser',
    categories: ['eraser'],
    useCases: ['cleanup'],
    compatibility: { paint: false, erase: true, mask: true, retouch: false },
  },
};

const BRUSH_PRESET_CATEGORY_PROFILE_BY_GROUP: Record<string, ImageBrushPresetStandardProfile> = {
  Sketch: {
    category: 'basic-round',
    categories: ['basic-round'],
    useCases: ['linework', 'paint'],
  },
  Ink: {
    category: 'pencil-inking',
    categories: ['pencil-inking'],
    useCases: ['ink', 'linework', 'paint'],
  },
  Paint: {
    category: 'airbrush',
    categories: ['airbrush', 'smudge-retouch'],
    useCases: ['paint', 'blend'],
  },
  'Comic / Manga': {
    category: 'texture',
    categories: ['texture'],
    useCases: ['linework', 'paint', 'texture'],
  },
  FX: {
    category: 'smudge-retouch',
    categories: ['smudge-retouch'],
    useCases: ['paint', 'blend', 'retouch'],
  },
  Utility: {
    category: 'utility',
    categories: ['utility'],
    useCases: ['paint'],
  },
  User: {
    category: 'utility',
    categories: ['utility'],
    useCases: ['paint'],
  },
};

const BRUSH_PRESET_DESCRIPTOR_VERSION = 1;
const BRUSH_PRESET_LIBRARY_DESCRIPTOR_ID = 'image-brush-preset-library:v1';
const BRUSH_PRESET_PACK_DESCRIPTOR_ID = 'image-brush-preset-pack:v1';
const BRUSH_PRESET_PACK_VERSION = 1;
const BRUSH_PRESET_PREVIEW_FROM = { x: 6, y: 9 };
const BRUSH_PRESET_PREVIEW_TO = { x: 66, y: 9 };
const BRUSH_PRESET_PREVIEW_PRESSURE = 0.72;
const BRUSH_PRESET_PREVIEW_SEED = 17;
const BRUSH_PRESET_PREVIEW_MAX_DABS = 6;
const BRUSH_PRESET_TILE_VIEW_BOX = '0 0 72 18';

export const IMAGE_BRUSH_PRESETS: ImageBrushPreset[] = [
  {
    id: 'pencil',
    label: 'Pencil',
    group: 'Sketch',
    // Graphite on paper: tone builds up rather than laying down flat (flow < 1), pressure mostly
    // darkens (pressureOpacity) with only a little width gain, a fine paper-tooth grain breaks the
    // stroke, and a soft-ish edge avoids the hard ink look. Tilt lays the lead on its side —
    // widening + flattening the tip toward the lean direction, like a real pencil.
    settings: {
      size: 4, opacity: 1, hardness: 0.82, flow: 0.9, spacing: 0.06,
      pressureSize: 0.55, pressureOpacity: 0.6, pressureFlow: 0.4, scatter: 0.05,
      texture: 'fine-grain', textureScale: 0.7, textureDepth: 0.4,
      tiltSize: 1, tiltRoundness: 0.85, tiltAngle: 1,
    },
  },
  {
    id: 'marker',
    label: 'Marker',
    group: 'Sketch',
    // Felt marker: ink is nearly pressure-insensitive and pools darker at the stroke edge
    // (wetEdges); a chisel-ish tip with a crisp felt edge.
    settings: {
      size: 24, opacity: 0.72, hardness: 0.7, flow: 0.85, spacing: 0.12,
      roundness: 0.7, angleDeg: 8, pressureSize: 0.08, pressureOpacity: 0.1, wetEdges: true,
    },
  },
  {
    id: 'charcoal',
    label: 'Charcoal',
    group: 'Sketch',
    // Charcoal stick: dusty chalk grain, laid on its side via tilt; pressure mostly darkens.
    settings: { size: 34, opacity: 0.62, hardness: 0.2, flow: 0.52, spacing: 0.16, scatter: 0.22, roundness: 0.65, pressureOpacity: 0.5, pressureFlow: 0.55, texture: 'chalk', textureScale: 1, textureDepth: 0.55, tiltSize: 0.8, tiltRoundness: 0.7, tiltAngle: 1 },
  },
  {
    id: 'textureStipple',
    label: 'Texture Stipple',
    group: 'Sketch',
    // Stipple: real broken grain from a spatter texture, not just scattered round dabs.
    settings: { size: 22, opacity: 0.74, hardness: 0.6, flow: 0.48, spacing: 0.2, scatter: 0.55, pressureFlow: 0.35, roundness: 0.78, texture: 'spatter', textureScale: 1, textureDepth: 0.6 },
  },
  {
    id: 'inker',
    label: 'Inker',
    group: 'Ink',
    settings: { size: 10, opacity: 1, hardness: 1, flow: 1, spacing: 0.05, pressureSize: 0.85, smoothing: 0.25 },
  },
  {
    id: 'brushPen',
    label: 'Brush Pen',
    group: 'Ink',
    settings: { size: 28, opacity: 0.95, hardness: 0.78, flow: 0.92, spacing: 0.06, roundness: 0.42, angleDeg: 22, pressureSize: 0.9, pressureOpacity: 0.15, smoothing: 0.45 },
  },
  {
    id: 'calligraphyChisel',
    label: 'Calligraphy Chisel',
    group: 'Ink',
    settings: { size: 30, opacity: 1, hardness: 0.92, flow: 0.84, spacing: 0.07, tipShape: 'square', roundness: 0.34, angleDeg: 42, pressureSize: 0.55, smoothing: 0.24 },
  },
  {
    id: 'technicalLiner',
    label: 'Technical Liner',
    group: 'Ink',
    // Technical pen (Rapidograph): perfectly constant width — pressure must not change the line.
    settings: { size: 6, opacity: 1, hardness: 1, flow: 1, spacing: 0.03, pressureSize: 0, smoothing: 0.22 },
  },
  {
    id: 'airbrush',
    label: 'Airbrush',
    group: 'Paint',
    settings: { size: 80, opacity: 0.3, hardness: 0.05, flow: 0.35, spacing: 0.06, pressureFlow: 0.8, smoothing: 0.35 },
  },
  {
    id: 'dryBrush',
    label: 'Dry Brush',
    group: 'Paint',
    // Dry brush: paint skips over the canvas tooth, leaving a broken grainy stroke.
    settings: { size: 42, opacity: 0.8, hardness: 0.55, flow: 0.42, spacing: 0.2, scatter: 0.3, roundness: 0.5, angleDeg: 18, pressureFlow: 0.6, texture: 'canvas-grain', textureScale: 1, textureDepth: 0.6 },
  },
  {
    id: 'watercolorWash',
    label: 'Watercolor Wash',
    group: 'Paint',
    // Watercolor: transparent pigment that pools darker at the drying edge (wetEdges) and settles
    // into the paper grain.
    settings: { size: 96, opacity: 0.28, hardness: 0.03, flow: 0.18, spacing: 0.08, scatter: 0.05, pressureFlow: 0.85, smoothing: 0.4, wetEdges: true, texture: 'canvas-grain', textureScale: 1.4, textureDepth: 0.18 },
  },
  {
    id: 'gouacheFlat',
    label: 'Gouache Flat',
    group: 'Paint',
    // Gouache: flat, fully opaque matte paint with a faint canvas tooth.
    settings: { size: 48, opacity: 1, hardness: 0.66, flow: 0.65, spacing: 0.1, tipShape: 'square', roundness: 0.58, angleDeg: 6, pressureFlow: 0.35, texture: 'canvas-grain', textureScale: 1.2, textureDepth: 0.15 },
  },
  {
    id: 'oilBristle',
    label: 'Oil Bristle',
    group: 'Paint',
    // Oil bristle: thick paint dragged by stiff bristles, raking the canvas grain.
    settings: { size: 58, opacity: 0.9, hardness: 0.5, flow: 0.54, spacing: 0.16, scatter: 0.16, roundness: 0.66, angleDeg: 14, pressureFlow: 0.52, smoothing: 0.28, texture: 'canvas-grain', textureScale: 0.9, textureDepth: 0.4 },
  },
  {
    id: 'cloudGlaze',
    label: 'Cloud Glaze',
    group: 'Paint',
    settings: { size: 110, opacity: 0.18, hardness: 0.02, flow: 0.14, spacing: 0.07, scatter: 0.04, smoothing: 0.45, pressureFlow: 0.9 },
  },
  {
    id: 'wet-mixer',
    label: 'Wet Mixer',
    group: 'Paint',
    settings: { size: 30, opacity: 1, hardness: 0.7, flow: 0.9, spacing: 0.06, mixerEnabled: true, smudgeLength: 0.7, smudgeRadius: 14, colorRate: 0.45 },
  },
  {
    id: 'spectral-mixer',
    label: 'Spectral Mixer',
    group: 'Paint',
    settings: { size: 30, opacity: 1, hardness: 0.7, flow: 0.9, spacing: 0.06, mixerEnabled: true, smudgeLength: 0.7, smudgeRadius: 14, colorRate: 0.35, mixMode: 'spectral' },
  },
  {
    id: 'dry-bristle',
    label: 'Dry Bristle',
    group: 'Paint',
    // Dry bristle: separates into individual bristle streaks over the canvas tooth as paint runs out.
    settings: { size: 18, opacity: 1, hardness: 0.85, flow: 0.85, spacing: 0.07, scatter: 0.18, fadeLength: 6, paintLoad: 1, loadFalloff: 0.004, texture: 'canvas-grain', textureScale: 0.8, textureDepth: 0.5 },
  },
  {
    id: 'mangaInker',
    label: 'Manga Inker',
    group: 'Comic / Manga',
    // G-pen manga ink: razor-crisp edge with dramatic pressure-driven line weight.
    settings: { size: 14, opacity: 1, hardness: 1, flow: 1, spacing: 0.04, pressureSize: 1, pressureFlow: 0, smoothing: 0.4 },
  },
  {
    id: 'screentoneDots',
    label: 'Screentone Dots',
    group: 'Comic / Manga',
    // Screentone: lay an even tone and let the halftone-dots texture punch the real dot pattern.
    settings: { size: 28, opacity: 0.85, hardness: 1, flow: 1, spacing: 0.12, scatter: 0, pressureSize: 0, pressureOpacity: 0, texture: 'dots', textureScale: 1, textureDepth: 0.9 },
  },
  {
    id: 'speedLine',
    label: 'Speed Line',
    group: 'Comic / Manga',
    settings: { size: 5, opacity: 1, hardness: 1, flow: 1, spacing: 0.03, roundness: 0.18, angleDeg: 0, pressureSize: 0.65, smoothing: 0.2 },
  },
  {
    id: 'storyboardBlue',
    label: 'Storyboard Blue',
    group: 'Comic / Manga',
    // Non-photo blue pencil: a blue graphite — same paper tooth + pressure-darkening as the Pencil.
    settings: { size: 8, opacity: 0.9, hardness: 0.8, flow: 0.85, spacing: 0.06, pressureSize: 0.5, pressureOpacity: 0.5, scatter: 0.05, texture: 'fine-grain', textureScale: 0.7, textureDepth: 0.35, color: '#38bdf8' },
  },
  {
    id: 'halftoneBlock',
    label: 'Halftone Block',
    group: 'Comic / Manga',
    // Halftone block: blocky tone broken by a coarse halftone-dot texture.
    settings: { size: 18, opacity: 0.7, hardness: 1, flow: 0.92, spacing: 0.18, tipShape: 'square', roundness: 0.72, scatter: 0.08, pressureSize: 0.12, texture: 'dots', textureScale: 1.2, textureDepth: 0.6 },
  },
  {
    id: 'fxSpark',
    label: 'FX Spark',
    group: 'FX',
    // Sparks: flung specks of light — a spatter texture sharpens the broken-particle look.
    settings: { size: 16, opacity: 0.9, hardness: 0.8, flow: 0.84, spacing: 0.22, scatter: 1.2, pressureSize: 0.24, pressureOpacity: 0.1, texture: 'spatter', textureScale: 1, textureDepth: 0.5 },
  },
  {
    id: 'rimLight',
    label: 'Rim Light',
    group: 'FX',
    settings: { size: 44, opacity: 0.38, hardness: 0.16, flow: 0.42, spacing: 0.08, smoothing: 0.3, pressureFlow: 0.75, color: '#dbeafe' },
  },
  {
    id: 'glowBloom',
    label: 'Glow Bloom',
    group: 'FX',
    settings: { size: 88, opacity: 0.22, hardness: 0.01, flow: 0.16, spacing: 0.06, scatter: 0.12, smoothing: 0.38, pressureFlow: 0.82 },
  },
  {
    id: 'hardRound',
    label: 'Hard Round',
    group: 'Utility',
    settings: { size: 18, opacity: 1, hardness: 1, flow: 1, spacing: 0.1, pressureSize: 0.35, pressureFlow: 0.15 },
  },
  {
    id: 'softRound',
    label: 'Soft Round',
    group: 'Utility',
    settings: { size: 32, opacity: 0.55, hardness: 0.2, flow: 0.65, spacing: 0.12, pressureSize: 0.5, pressureFlow: 0.35 },
  },
  {
    id: 'softEraser',
    label: 'Soft Eraser',
    group: 'Utility',
    settings: { size: 56, opacity: 0.75, hardness: 0.12, flow: 0.7, spacing: 0.1, pressureFlow: 0.5 },
  },
  {
    id: 'hardEraser',
    label: 'Hard Eraser',
    group: 'Utility',
    settings: { size: 18, opacity: 1, hardness: 1, flow: 1, spacing: 0.08, pressureSize: 0.25 },
  },
];

export function getBrushPreset(id: string): ImageBrushPreset | undefined {
  return IMAGE_BRUSH_PRESETS.find((preset) => preset.id === id);
}

export function findBrushPresetsByCategory(
  category: ImageBrushPresetCategory,
  presets: readonly ImageBrushPreset[] = IMAGE_BRUSH_PRESETS,
): ImageBrushPresetDescriptor[] {
  return presets
    .map((preset) => describeImageBrushPreset(
      preset,
      preset.group === 'User' ? 'user' : 'built-in',
    ))
    .filter((preset) => preset.categories.includes(category));
}

export function filterBrushPresetsByCompatibility(
  requiredCompatibility: Partial<ImageBrushPresetCompatibility>,
  presets: readonly ImageBrushPreset[] = IMAGE_BRUSH_PRESETS,
): ImageBrushPresetDescriptor[] {
  return presets
    .map((preset) => describeImageBrushPreset(
      preset,
      preset.group === 'User' ? 'user' : 'built-in',
    ))
    .filter((preset) => matchesPresetCompatibility(preset.compatibility, requiredCompatibility));
}

export function applyBrushPreset(
  current: BrushSettings,
  preset: ImageBrushPreset,
): BrushSettings {
  return normalizeBrushSettings({
    ...current,
    ...preset.settings,
    presetId: preset.id,
    color: preset.settings.color ?? current.color,
  });
}

export function describeImageBrushPresetLibrary(
  userPresets: readonly unknown[] = [],
): ImageBrushPresetLibraryDescriptor {
  const usedIds = new Set(IMAGE_BRUSH_PRESETS.map((preset) => preset.id));
  const normalizedUserPresets = userPresets
    .map((preset) => normalizeUserPresetDescriptorInput(preset, usedIds))
    .filter((preset): preset is ImageBrushPreset => Boolean(preset));
  const presetDescriptors = [
    ...IMAGE_BRUSH_PRESETS.map((preset) => describeImageBrushPreset(preset, 'built-in')),
    ...normalizedUserPresets.map((preset) => describeImageBrushPreset(preset, 'user')),
  ];

  return buildLibraryDescriptor(presetDescriptors, IMAGE_BRUSH_PRESETS.length, normalizedUserPresets.length);
}

export function describeImageBrushPreset(
  preset: ImageBrushPreset,
  origin: ImageBrushPresetOrigin = preset.group === 'User' ? 'user' : 'built-in',
): ImageBrushPresetDescriptor {
  const normalizedSettings = normalizeBrushSettings(preset.settings);
  const profile = resolvePresetStandardProfile(preset);
  const capabilitySummary = summarizeBrushPresetCapabilities([
    {
      id: preset.id,
      label: preset.label,
      group: preset.group,
      settings: preset.settings,
    },
  ]);
  const capability = capabilitySummary.presetSummaries[0];
  const unsupportedWarnings = getUnsupportedBrushCapabilityWarnings(preset.settings).map((warning) => ({
    ...warning,
    presetId: preset.id,
    presetLabel: preset.label,
  }));
  const importExport = buildPresetImportExportReadiness(origin);
  const preview = buildPresetPreviewDescriptor(normalizedSettings);
  const dynamics = buildPresetDynamicsDescriptor(
    normalizedSettings,
    preset.settings as Partial<BrushSettings> & Record<string, unknown>,
    preview,
    unsupportedWarnings,
  );

  return {
    descriptorId: `image-brush-preset:${preset.id}:v1`,
    version: BRUSH_PRESET_DESCRIPTOR_VERSION,
    id: preset.id,
    label: preset.label,
    group: preset.group,
    category: profile.category,
    categories: profile.categories,
    useCases: profile.useCases,
    compatibility: profile.compatibility,
    origin,
    workflows: capability?.workflows ?? ['utility'],
    tags: buildPresetTags({
      origin,
      group: preset.group,
      workflows: capability?.workflows ?? ['utility'],
      settings: normalizedSettings,
      importExport,
      preview,
      unsupportedWarnings,
      hasFixedColor: typeof preset.settings.color === 'string' && preset.settings.color.trim().length > 0,
      profile,
    }),
    settings: normalizedSettings,
    preview,
    dynamics,
    importExport,
    unsupportedWarnings,
  };
}

export function createUserBrushPreset(
  label: string,
  settings: Partial<BrushSettings>,
  existingIds: Iterable<string> = [],
): ImageBrushPreset {
  const normalizedLabel = normalizePresetLabel(label);
  const normalizedSettings = normalizeBrushSettings({
    ...settings,
    presetId: undefined,
  });
  return {
    id: buildUniqueUserPresetId(normalizedLabel, existingIds),
    label: normalizedLabel,
    group: 'User',
    settings: {
      ...normalizedSettings,
      presetId: undefined,
    },
  };
}

export function renameUserBrushPreset(preset: ImageBrushPreset, label: string): ImageBrushPreset {
  return {
    ...preset,
    label: normalizePresetLabel(label, preset.label),
    group: 'User',
  };
}

export function sanitizeUserBrushPresets(value: unknown): ImageBrushPreset[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const presets: ImageBrushPreset[] = [];
  for (const entry of value) {
    const preset = sanitizeUserBrushPreset(entry, usedIds);
    if (!preset) continue;
    usedIds.add(preset.id);
    presets.push(preset);
  }
  return presets;
}

export function exportUserBrushPresetPack(presets: unknown[]): string {
  const sanitized = sanitizeUserBrushPresets(presets);
  const presetDescriptors = sanitized.map((preset) => describeImageBrushPreset(preset, 'user'));
  const pack: ImageBrushPresetPack = {
    version: BRUSH_PRESET_PACK_VERSION,
    metadata: buildBrushPresetPackMetadata(presetDescriptors),
    presets: sanitized.map((preset, index) => ({
      label: preset.label,
      settings: {
        ...normalizeBrushSettings({
          ...preset.settings,
          presetId: undefined,
        }),
        presetId: undefined,
      },
      metadata: presetDescriptors[index],
    })),
  };
  return JSON.stringify(pack, null, 2);
}

export function importUserBrushPresetPack(
  json: string,
  existingIds: Iterable<string> = [],
): ImageBrushPreset[] {
  const parsed = JSON.parse(json) as Partial<ImageBrushPresetPack> | Array<unknown>;
  const rawPresets = Array.isArray(parsed)
    ? parsed
    : (parsed?.version === 1 && Array.isArray(parsed.presets) ? parsed.presets : []);
  const usedIds = new Set(existingIds);
  const imported: ImageBrushPreset[] = [];
  for (const entry of rawPresets) {
    if (!entry || typeof entry !== 'object') continue;
    const label = 'label' in entry && typeof entry.label === 'string' ? entry.label : 'Imported Brush';
    const settings = 'settings' in entry && entry.settings && typeof entry.settings === 'object'
      ? entry.settings as Partial<BrushSettings>
      : {};
    const preset = createUserBrushPreset(label, settings, usedIds);
    usedIds.add(preset.id);
    imported.push(preset);
  }
  return imported;
}

export function validateImageBrushPresetPack(
  json: string,
  existingIds: Iterable<string> = [],
): ImageBrushPresetPackValidationDescriptor {
  let parsed: Partial<ImageBrushPresetPack> | Array<unknown>;
  try {
    parsed = JSON.parse(json) as Partial<ImageBrushPresetPack> | Array<unknown>;
  } catch {
    return buildPresetPackValidationDescriptor({
      packVersion: null,
      parseable: false,
      rawPresetCount: 0,
      descriptors: [],
      rejectedReasons: ['json:parse-error'],
    });
  }

  const packVersion = Array.isArray(parsed)
    ? BRUSH_PRESET_PACK_VERSION
    : (typeof parsed.version === 'number' ? parsed.version : null);
  const rawPresets = Array.isArray(parsed)
    ? parsed
    : (packVersion === BRUSH_PRESET_PACK_VERSION && Array.isArray(parsed.presets) ? parsed.presets : []);
  const usedIds = new Set(existingIds);
  const descriptors: ImageBrushPresetDescriptor[] = [];
  const rejectedReasons: string[] = [];

  rawPresets.forEach((entry, index) => {
    const labelPrefix = `preset-${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      rejectedReasons.push(`${labelPrefix}:not-object`);
      return;
    }

    const candidate = entry as Partial<ImageBrushPresetPack['presets'][number]>;
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const settings = candidate.settings;
    const entryReasons: string[] = [];
    if (!label) entryReasons.push('missing-label');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) entryReasons.push('missing-settings');
    if (entryReasons.length > 0) {
      rejectedReasons.push(...entryReasons.map((reason) => `${labelPrefix}:${reason}`));
      return;
    }

    const preset: ImageBrushPreset = {
      id: buildUniqueUserPresetId(label, usedIds),
      label,
      group: 'User',
      settings: settings as Partial<BrushSettings>,
    };
    usedIds.add(preset.id);
    descriptors.push(describeImageBrushPreset(preset, 'user'));
  });

  return buildPresetPackValidationDescriptor({
    packVersion,
    parseable: true,
    rawPresetCount: rawPresets.length,
    descriptors,
    rejectedReasons,
  });
}

export function describeUserBrushPresetPackSerialization(
  presets: unknown[],
): ImageBrushPresetPackSerializationDescriptor {
  const usedIds = new Set<string>();
  const sanitized = presets
    .map((preset) => normalizeUserPresetDescriptorInput(preset, usedIds))
    .filter((preset): preset is ImageBrushPreset => Boolean(preset));
  const descriptors = sanitized.map((preset) => describeImageBrushPreset(preset, 'user'));
  const previewSignatures = descriptors.map((descriptor) => descriptor.preview.signature);
  const symmetryModes = uniqueStrings(
    descriptors.map((descriptor) => descriptor.settings.symmetryMode),
  ) as Array<BrushSettings['symmetryMode']>;
  const unsupportedWarnings = descriptors.flatMap((descriptor) => descriptor.unsupportedWarnings);
  const portabilityWarnings = buildPackPortabilityWarnings(descriptors);

  return {
    descriptorId: 'image-brush-preset-pack-serialization:v1',
    version: BRUSH_PRESET_DESCRIPTOR_VERSION,
    packVersion: BRUSH_PRESET_PACK_VERSION,
    presetCount: descriptors.length,
    portable: portabilityWarnings.length === 0 && unsupportedWarnings.length === 0,
    previewSignatures,
    symmetryModes,
    portabilityWarnings,
    unsupportedWarnings,
    signature: buildPackSerializationSignature(descriptors),
  };
}

function sanitizeUserBrushPreset(
  value: unknown,
  usedIds: Set<string>,
): ImageBrushPreset | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ImageBrushPreset>;
  const label = normalizePresetLabel(input.label);
  const settings = normalizeBrushSettings({
    ...(input.settings ?? {}),
    presetId: undefined,
  });
  const requestedId = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : '';
  const id = requestedId && !usedIds.has(requestedId)
    ? requestedId
    : buildUniqueUserPresetId(label, usedIds);
  return {
    id,
    label,
    group: 'User',
    settings: {
      ...settings,
      presetId: undefined,
    },
  };
}

function normalizeUserPresetDescriptorInput(
  value: unknown,
  usedIds: Set<string>,
): ImageBrushPreset | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ImageBrushPreset>;
  const label = normalizePresetLabel(input.label);
  const requestedId = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : '';
  const id = requestedId && !usedIds.has(requestedId)
    ? requestedId
    : buildUniqueUserPresetId(label, usedIds);
  const settings = isRecord(input.settings) ? input.settings as Partial<BrushSettings> : {};

  usedIds.add(id);
  return {
    id,
    label,
    group: 'User',
    settings,
  };
}

function buildPresetPreviewDescriptor(settings: BrushSettings): ImageBrushPresetPreviewDescriptor {
  const preview = buildBrushStrokePreviewMetadata(
    BRUSH_PRESET_PREVIEW_FROM,
    BRUSH_PRESET_PREVIEW_TO,
    settings,
    {
      pressure: BRUSH_PRESET_PREVIEW_PRESSURE,
      seed: BRUSH_PRESET_PREVIEW_SEED,
      maxDabs: BRUSH_PRESET_PREVIEW_MAX_DABS,
      applySmoothing: false,
    },
  );

  return {
    deterministic: true,
    tileViewBox: BRUSH_PRESET_TILE_VIEW_BOX,
    signature: preview.signature,
    sampleDabCount: preview.dabPreview.length,
    totalDabCount: preview.spacing.dabCount,
    spacingCoverage: preview.spacing.coverage,
    sampleStroke: {
      from: preview.from,
      to: preview.to,
      pressure: preview.pressure.resolved,
      seed: preview.randomization.seed,
    },
    dynamics: preview.dynamics,
    pressureAffects: preview.pressure.affects,
    scatterPx: preview.randomization.scatterPx,
  };
}

function buildPresetDynamicsDescriptor(
  settings: BrushSettings,
  sourceSettings: Partial<BrushSettings> & Record<string, unknown>,
  preview: ImageBrushPresetPreviewDescriptor,
  unsupportedWarnings: BrushCapabilityWarning[],
): ImageBrushPresetDynamicsDescriptor {
  const unsupportedReadiness = describeUnsupportedBrushDynamicsReadiness(sourceSettings);

  return {
    implemented: {
      brushDabs: true,
      smoothing: settings.smoothing > 0,
      pressureAffects: preview.pressureAffects,
      tiltAffects: ['angle'],
      symmetryMode: settings.symmetryMode,
    },
    texture: unsupportedReadiness.texture,
    scattering: unsupportedReadiness.scattering,
    unsupportedWarnings,
    previewSignature: preview.signature,
  };
}

function buildPresetImportExportReadiness(
  origin: ImageBrushPresetOrigin,
): ImageBrushPresetImportExportReadiness {
  const userPreset = origin === 'user';
  return {
    storage: userPreset ? 'localStorage' : 'bundled',
    packVersion: BRUSH_PRESET_PACK_VERSION,
    importableFromPack: userPreset,
    exportableToPack: userPreset,
    roundTripReady: userPreset,
    warnings: userPreset
      ? []
      : ['Built-in presets are bundled by id and are not exported in user preset packs.'],
  };
}

function buildPresetPackValidationDescriptor({
  packVersion,
  parseable,
  rawPresetCount,
  descriptors,
  rejectedReasons,
}: {
  packVersion: number | null;
  parseable: boolean;
  rawPresetCount: number;
  descriptors: readonly ImageBrushPresetDescriptor[];
  rejectedReasons: readonly string[];
}): ImageBrushPresetPackValidationDescriptor {
  const unsupportedWarnings = descriptors.flatMap((descriptor) => descriptor.unsupportedWarnings);
  const previewSignatures = descriptors.map((descriptor) => descriptor.preview.signature);
  const importedPresetIds = descriptors.map((descriptor) => descriptor.id);
  const importable = parseable
    && packVersion === BRUSH_PRESET_PACK_VERSION
    && descriptors.length > 0;

  return {
    descriptorId: 'image-brush-preset-pack-validation:v1',
    version: BRUSH_PRESET_DESCRIPTOR_VERSION,
    packVersion,
    parseable,
    importable,
    exportableAfterImport: descriptors.length > 0,
    presetCount: rawPresetCount,
    acceptedPresetCount: descriptors.length,
    rejectedPresetCount: rejectedReasons.length > 0 ? rawPresetCount - descriptors.length : 0,
    rejectedReasons: [...rejectedReasons],
    importedPresetIds,
    previewSignatures,
    unsupportedWarnings,
    signature: buildPresetPackValidationSignature({
      packVersion,
      parseable,
      descriptors,
      rejectedReasons,
      previewSignatures,
      unsupportedWarnings,
    }),
  };
}

function resolvePresetStandardProfile(preset: ImageBrushPreset): ResolvedImageBrushPresetStandardProfile {
  const baseProfile = BRUSH_PRESET_CATEGORY_PROFILE_BY_ID[preset.id]
    ?? BRUSH_PRESET_CATEGORY_PROFILE_BY_GROUP[preset.group]
    ?? {
      category: 'utility',
      categories: ['utility'],
      useCases: ['paint'] as ImageBrushPresetUseCase[],
    };

  const categories = normalizeCategoryOrder(baseProfile.categories);
  const compatibility = baseProfile.compatibility ?? buildCompatibilityFromCategories(categories);

  return {
    ...baseProfile,
    categories,
    category: categories.includes('utility') ? (baseProfile.category ?? 'utility') : (baseProfile.category ?? categories[0]),
    compatibility,
    useCases: normalizeUseCases(baseProfile.useCases),
  };
}

function buildCompatibilityFromCategories(
  categories: ReadonlyArray<ImageBrushPresetCategory>,
): ImageBrushPresetCompatibility {
  const flags = categories.map((category) => BRUSH_PRESET_COMPATIBILITY_BY_CATEGORY[category]);
  return {
    paint: flags.some((compatibility) => compatibility.paint),
    erase: flags.some((compatibility) => compatibility.erase),
    mask: flags.some((compatibility) => compatibility.mask),
    retouch: flags.some((compatibility) => compatibility.retouch),
  };
}

function normalizeCategoryOrder(categories: ReadonlyArray<ImageBrushPresetCategory>): ImageBrushPresetCategory[] {
  const ordered = IMAGE_BRUSH_PRESET_CATEGORIES.filter((category) => categories.includes(category));
  const fallback = categories.filter((category) => !IMAGE_BRUSH_PRESET_CATEGORIES.includes(category));
  const merged = [...ordered, ...fallback];
  return [...new Set(merged)];
}

function normalizeUseCases(useCases: readonly ImageBrushPresetUseCase[]): ImageBrushPresetUseCase[] {
  return [...new Set(useCases)];
}

function matchesPresetCompatibility(
  value: ImageBrushPresetCompatibility,
  required: Partial<ImageBrushPresetCompatibility>,
): boolean {
  for (const [key, expected] of Object.entries(required) as Array<[keyof ImageBrushPresetCompatibility, boolean]>) {
    if (expected !== undefined && value[key] !== expected) {
      return false;
    }
  }
  return true;
}

function buildPresetTags({
  origin,
  group,
  profile,
  workflows,
  settings,
  importExport,
  preview,
  unsupportedWarnings,
  hasFixedColor,
}: {
  origin: ImageBrushPresetOrigin;
  group: ImageBrushPresetGroup;
  profile: ResolvedImageBrushPresetStandardProfile;
  workflows: BrushPresetWorkflow[];
  settings: BrushSettings;
  importExport: ImageBrushPresetImportExportReadiness;
  preview: ImageBrushPresetPreviewDescriptor;
  unsupportedWarnings: BrushCapabilityWarning[];
  hasFixedColor: boolean;
}): string[] {
  const tags = new Set<string>([
    `origin:${origin}`,
    `group:${slugify(group)}`,
    `tip:${settings.tipShape}`,
    `preview:${preview.spacingCoverage}`,
  ]);

  for (const workflow of workflows) tags.add(`workflow:${workflow}`);
  if (preview.pressureAffects.length > 0) tags.add('dynamic:pressure');
  if (settings.scatter > 0) tags.add('dynamic:scatter');
  if (settings.smoothing > 0) tags.add('dynamic:smoothing');
  if (hasFixedColor) tags.add('color:fixed');
  if (importExport.importableFromPack) tags.add('readiness:importable');
  if (importExport.exportableToPack) tags.add('readiness:exportable');
  if (unsupportedWarnings.length > 0) tags.add('warning:unsupported-dynamics');
  if (unsupportedWarnings.some((warning) => warning.category === 'texture')) tags.add('fallback:texture');
  if (unsupportedWarnings.some((warning) => isScatterFallbackWarningField(warning.field))) tags.add('fallback:scatter-jitter');
  for (const category of profile.categories) {
    tags.add(`category:${category}`);
  }
  for (const useCase of profile.useCases) {
    tags.add(`use-case:${useCase}`);
  }
  if (profile.compatibility.erase) tags.add('compatibility:erase');
  if (profile.compatibility.mask) tags.add('compatibility:mask');
  if (profile.compatibility.retouch) tags.add('compatibility:retouch');
  if (profile.compatibility.paint) tags.add('compatibility:paint');

  return [...tags].sort();
}

function buildLibraryDescriptor(
  presetDescriptors: ImageBrushPresetDescriptor[],
  builtInCount: number,
  userCount: number,
): ImageBrushPresetLibraryDescriptor {
  return {
    descriptorId: BRUSH_PRESET_LIBRARY_DESCRIPTOR_ID,
    version: BRUSH_PRESET_DESCRIPTOR_VERSION,
    counts: {
      builtIn: builtInCount,
      user: userCount,
      total: presetDescriptors.length,
    },
    groups: buildGroupCounts(presetDescriptors),
    tags: aggregatePresetTags(presetDescriptors),
    presets: presetDescriptors,
    importExport: buildImportExportSummary(presetDescriptors, builtInCount),
    unsupportedWarnings: presetDescriptors.flatMap((preset) => preset.unsupportedWarnings),
  };
}

function buildBrushPresetPackMetadata(
  presetDescriptors: ImageBrushPresetDescriptor[],
): ImageBrushPresetPackMetadata {
  return {
    descriptorId: BRUSH_PRESET_PACK_DESCRIPTOR_ID,
    version: BRUSH_PRESET_DESCRIPTOR_VERSION,
    tags: aggregatePresetTags(presetDescriptors),
    importExport: buildImportExportSummary(presetDescriptors, 0),
    unsupportedWarnings: presetDescriptors.flatMap((preset) => preset.unsupportedWarnings),
  };
}

function buildImportExportSummary(
  presetDescriptors: ImageBrushPresetDescriptor[],
  builtInCount: number,
): ImageBrushPresetLibraryDescriptor['importExport'] {
  return {
    packVersion: BRUSH_PRESET_PACK_VERSION,
    exportableUserPresets: presetDescriptors.filter((preset) => preset.importExport.exportableToPack).length,
    importableUserPresets: presetDescriptors.filter((preset) => preset.importExport.importableFromPack).length,
    builtInsBundled: builtInCount,
    ready: true,
  };
}

function buildPackPortabilityWarnings(
  descriptors: readonly ImageBrushPresetDescriptor[],
): string[] {
  const warnings: string[] = [];
  for (const descriptor of descriptors) {
    const fixedColor = descriptor.settings.color;
    if (typeof fixedColor === 'string' && fixedColor.trim().length > 0) {
      warnings.push(`${descriptor.label} uses fixed color ${fixedColor}; importing keeps the swatch but may not match the target foreground color.`);
    }
    for (const warning of descriptor.unsupportedWarnings) {
      warnings.push(`${descriptor.label} uses unsupported ${warning.field} dynamics; the preset imports with fallback brush dynamics.`);
    }
  }
  return warnings;
}

function buildPackSerializationSignature(
  descriptors: readonly ImageBrushPresetDescriptor[],
): string {
  const presetPart = descriptors.map((descriptor) => [
    descriptor.id,
    descriptor.preview.signature,
    descriptor.settings.symmetryMode,
    descriptor.unsupportedWarnings.map((warning) => warning.field).join(',') || 'none',
  ].join(':')).join('|');

  return [
    'brush-pack',
    'v1',
    descriptors.length,
    presetPart || 'empty',
  ].join(':');
}

function buildPresetPackValidationSignature({
  packVersion,
  parseable,
  descriptors,
  rejectedReasons,
  previewSignatures,
  unsupportedWarnings,
}: {
  packVersion: number | null;
  parseable: boolean;
  descriptors: readonly ImageBrushPresetDescriptor[];
  rejectedReasons: readonly string[];
  previewSignatures: readonly string[];
  unsupportedWarnings: readonly BrushCapabilityWarning[];
}): string {
  return [
    'brush-pack-validation',
    'v1',
    `parseable=${parseable}`,
    `version=${packVersion ?? 'unknown'}`,
    `accepted=${descriptors.length}`,
    `rejected=${rejectedReasons.length > 0 ? '1' : '0'}`,
    `ids=${descriptors.map((descriptor) => descriptor.id).join(',') || 'none'}`,
    `previews=${previewSignatures.join(',') || 'none'}`,
    `warnings=${unsupportedWarnings.map((warning) => warning.field).join(',') || 'none'}`,
    `reasons=${rejectedReasons.join(',') || 'none'}`,
  ].join(':');
}

function buildGroupCounts(presetDescriptors: ImageBrushPresetDescriptor[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const preset of presetDescriptors) {
    groups[preset.group] = (groups[preset.group] ?? 0) + 1;
  }
  return groups;
}

function aggregatePresetTags(presetDescriptors: ImageBrushPresetDescriptor[]): string[] {
  return [...new Set(presetDescriptors.flatMap((preset) => preset.tags))].sort();
}

function normalizePresetLabel(label: string | undefined, fallback = 'Custom Brush'): string {
  const value = typeof label === 'string' ? label.trim() : '';
  return value || fallback;
}

function buildUniqueUserPresetId(label: string, existingIds: Iterable<string>): string {
  const usedIds = new Set(existingIds);
  const baseSlug = slugify(label) || 'custom-brush';
  let candidate = `user-${baseSlug}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `user-${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScatterFallbackWarningField(field: string): boolean {
  const normalized = field.toLowerCase();
  return normalized.includes('jitter') || normalized.includes('scatter');
}

function uniqueStrings(values: ReadonlyArray<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}
