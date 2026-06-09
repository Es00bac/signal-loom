import type { BrushSettings } from '../../types/imageEditor';
import { normalizeBrushSettings } from './ImageBrushEngine';

export interface ImageBrushPreset {
  id: string;
  label: string;
  group: 'Sketch' | 'Ink' | 'Paint' | 'Comic / Manga' | 'Utility';
  settings: Partial<BrushSettings>;
}

export const BRUSH_PRESET_GROUPS: ImageBrushPreset['group'][] = [
  'Sketch',
  'Ink',
  'Paint',
  'Comic / Manga',
  'Utility',
];

export const IMAGE_BRUSH_PRESETS: ImageBrushPreset[] = [
  {
    id: 'pencil',
    label: 'Pencil',
    group: 'Sketch',
    settings: { size: 4, opacity: 1, hardness: 0.95, flow: 1, spacing: 0.08, pressureSize: 0.75, pressureFlow: 0.2 },
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
    id: 'marker',
    label: 'Marker',
    group: 'Sketch',
    settings: {
      size: 24,
      opacity: 0.7,
      hardness: 0.65,
      flow: 0.8,
      spacing: 0.14,
      roundness: 0.72,
      angleDeg: 8,
      pressureSize: 0.25,
      pressureOpacity: 0.2,
    },
  },
  {
    id: 'airbrush',
    label: 'Airbrush',
    group: 'Paint',
    settings: { size: 80, opacity: 0.3, hardness: 0.05, flow: 0.35, spacing: 0.06, pressureFlow: 0.8, smoothing: 0.35 },
  },
  {
    id: 'inker',
    label: 'Inker',
    group: 'Ink',
    settings: { size: 10, opacity: 1, hardness: 1, flow: 1, spacing: 0.05, pressureSize: 0.85, smoothing: 0.25 },
  },
  {
    id: 'mangaInker',
    label: 'Manga Inker',
    group: 'Comic / Manga',
    settings: { size: 14, opacity: 1, hardness: 0.92, flow: 1, spacing: 0.045, pressureSize: 1, pressureFlow: 0.15, smoothing: 0.35 },
  },
  {
    id: 'brushPen',
    label: 'Brush Pen',
    group: 'Ink',
    settings: { size: 28, opacity: 0.95, hardness: 0.78, flow: 0.92, spacing: 0.06, roundness: 0.42, angleDeg: 22, pressureSize: 0.9, pressureOpacity: 0.15, smoothing: 0.45 },
  },
  {
    id: 'dryBrush',
    label: 'Dry Brush',
    group: 'Paint',
    settings: { size: 42, opacity: 0.8, hardness: 0.55, flow: 0.42, spacing: 0.22, scatter: 0.28, roundness: 0.5, angleDeg: 18, pressureFlow: 0.6 },
  },
  {
    id: 'charcoal',
    label: 'Charcoal',
    group: 'Sketch',
    settings: { size: 34, opacity: 0.62, hardness: 0.18, flow: 0.52, spacing: 0.18, scatter: 0.18, roundness: 0.65, pressureOpacity: 0.45, pressureFlow: 0.55 },
  },
  {
    id: 'watercolorWash',
    label: 'Watercolor Wash',
    group: 'Paint',
    settings: { size: 96, opacity: 0.28, hardness: 0.03, flow: 0.18, spacing: 0.08, scatter: 0.05, pressureFlow: 0.85, smoothing: 0.4 },
  },
  {
    id: 'gouacheFlat',
    label: 'Gouache Flat',
    group: 'Paint',
    settings: { size: 48, opacity: 0.92, hardness: 0.62, flow: 0.62, spacing: 0.12, tipShape: 'square', roundness: 0.58, angleDeg: 6, pressureFlow: 0.4 },
  },
  {
    id: 'screentoneDots',
    label: 'Screentone Dots',
    group: 'Comic / Manga',
    settings: { size: 9, opacity: 0.55, hardness: 1, flow: 1, spacing: 0.9, scatter: 0.2, pressureSize: 0, pressureOpacity: 0 },
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
    settings: { size: 8, opacity: 0.85, hardness: 0.75, flow: 0.9, spacing: 0.08, pressureSize: 0.65, color: '#38bdf8' },
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
