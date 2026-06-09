import type { ColorSwatchUsageMode, NodeData } from '../types/flow';

export const DEFAULT_COLOR_SWATCH_DRAFT_COLOR = '#38BDF8';

export interface ColorSwatchUsageOption {
  id: ColorSwatchUsageMode;
  label: string;
  instruction: string;
}

export const COLOR_SWATCH_USAGE_OPTIONS: ColorSwatchUsageOption[] = [
  {
    id: 'primary',
    label: 'Primary palette',
    instruction: 'Use these colors primarily and keep generated media aligned with this palette.',
  },
  {
    id: 'theme',
    label: 'Mood / theme',
    instruction: 'Follow this palette as the overall mood and theme while allowing supporting neutrals.',
  },
  {
    id: 'brand',
    label: 'Brand colors',
    instruction: 'Treat these as brand colors; keep accents and key subjects consistent with this palette.',
  },
  {
    id: 'grade',
    label: 'Lighting / grade',
    instruction: 'Use these colors as the color grade and lighting direction for the scene.',
  },
];

const COLOR_SWATCH_USAGE_IDS = new Set<ColorSwatchUsageMode>(
  COLOR_SWATCH_USAGE_OPTIONS.map((option) => option.id),
);

type ColorSwatchPromptData = Pick<
  NodeData,
  'colorSwatchColors' | 'colorSwatchUsageMode'
>;

export function isColorSwatchUsageMode(value: unknown): value is ColorSwatchUsageMode {
  return typeof value === 'string' && COLOR_SWATCH_USAGE_IDS.has(value as ColorSwatchUsageMode);
}

export function resolveColorSwatchUsageMode(value: unknown): ColorSwatchUsageMode {
  return isColorSwatchUsageMode(value) ? value : 'primary';
}

export function getColorSwatchUsageOption(value: unknown): ColorSwatchUsageOption {
  const mode = resolveColorSwatchUsageMode(value);
  return COLOR_SWATCH_USAGE_OPTIONS.find((option) => option.id === mode) ?? COLOR_SWATCH_USAGE_OPTIONS[0];
}

export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const raw = match[1].toUpperCase();
  const expanded = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;

  return `#${expanded}`;
}

export function normalizeColorSwatchColors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const colors: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    const color = normalizeHexColor(candidate);
    if (!color || seen.has(color)) {
      continue;
    }
    colors.push(color);
    seen.add(color);
  }

  return colors;
}

export function formatColorSwatchPrompt(data: ColorSwatchPromptData): string {
  const colors = normalizeColorSwatchColors(data.colorSwatchColors);
  if (colors.length === 0) {
    return '';
  }

  const option = getColorSwatchUsageOption(data.colorSwatchUsageMode);
  return `Color swatch: ${colors.join(', ')}. ${option.instruction}`;
}

export function resolveColorSwatchDraftColor(value: unknown): string {
  return normalizeHexColor(value) ?? DEFAULT_COLOR_SWATCH_DRAFT_COLOR;
}

export function resolveColorSwatchSelectedIndex(value: unknown, colorCount: number): number | undefined {
  if (!Number.isInteger(value) || colorCount <= 0) {
    return undefined;
  }

  const index = Number(value);
  return index >= 0 && index < colorCount ? index : undefined;
}
