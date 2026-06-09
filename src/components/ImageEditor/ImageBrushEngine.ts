import type { BrushSettings } from '../../types/imageEditor';
import type { Point } from './tools/types';

export interface BrushDynamics {
  size: number;
  opacity: number;
  flow: number;
  spacingPx: number;
  hardness: number;
  roundness: number;
  angleDeg: number;
  tipShape: BrushSettings['tipShape'];
}

export interface BrushDab extends BrushDynamics {
  x: number;
  y: number;
  index: number;
}

export interface BuildBrushDabsOptions {
  seed?: number;
  startIndex?: number;
}

export function normalizeBrushSettings(settings: Partial<BrushSettings>): BrushSettings {
  const merged = {
    ...DEFAULT_NORMALIZED_BRUSH_SETTINGS,
    ...settings,
  };

  return {
    presetId: merged.presetId,
    size: clamp(round(merged.size), 1, 512),
    opacity: clamp(merged.opacity, 0, 1),
    hardness: clamp(merged.hardness, 0, 1),
    flow: clamp(merged.flow, 0, 1),
    color: normalizeBrushColor(merged.color),
    spacing: clamp(merged.spacing, 0.02, 2),
    angleDeg: normalizeAngle(merged.angleDeg),
    roundness: clamp(merged.roundness, 0.05, 1),
    scatter: clamp(merged.scatter, 0, 2),
    smoothing: clamp(merged.smoothing, 0, 1),
    pressureSize: clamp(merged.pressureSize, 0, 1),
    pressureOpacity: clamp(merged.pressureOpacity, 0, 1),
    pressureFlow: clamp(merged.pressureFlow, 0, 1),
    tipShape: merged.tipShape === 'square' ? 'square' : 'round',
  };
}

export function resolveBrushDynamics(settings: Partial<BrushSettings>, pressure: number): BrushDynamics {
  const normalized = normalizeBrushSettings(settings);
  const pressureValue = clamp(pressure, 0.05, 1);
  const sizeFactor = 1 - normalized.pressureSize + normalized.pressureSize * pressureValue;
  const opacityFactor = 1 - normalized.pressureOpacity + normalized.pressureOpacity * pressureValue;
  const flowFactor = 1 - normalized.pressureFlow + normalized.pressureFlow * pressureValue;
  const size = Math.max(1, normalized.size * sizeFactor);

  return {
    size: round(size),
    opacity: round(clamp(normalized.opacity * opacityFactor, 0, 1)),
    flow: round(clamp(normalized.flow * flowFactor, 0, 1)),
    spacingPx: round(Math.max(1, size * normalized.spacing)),
    hardness: normalized.hardness,
    roundness: normalized.roundness,
    angleDeg: normalized.angleDeg,
    tipShape: normalized.tipShape,
  };
}

export function buildBrushDabs(
  from: Point,
  to: Point,
  settings: Partial<BrushSettings>,
  pressure: number,
  options: BuildBrushDabsOptions = {},
): BrushDab[] {
  const normalized = normalizeBrushSettings(settings);
  const dynamics = resolveBrushDynamics(normalized, pressure);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const seed = options.seed ?? 0;
  const startIndex = options.startIndex ?? 0;
  const count = distance <= 0 ? 1 : Math.floor(distance / dynamics.spacingPx) + 1;
  const normalX = distance > 0 ? -dy / distance : 0;
  const normalY = distance > 0 ? dx / distance : 1;
  const scatterRadius = dynamics.size * normalized.scatter;

  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    const t = distance <= 0 ? 0 : Math.min(1, (offset * dynamics.spacingPx) / distance);
    const scatter = scatterRadius > 0
      ? (seededNoise(seed, index) * 2 - 1) * scatterRadius
      : 0;

    return {
      ...dynamics,
      x: round(from.x + dx * t + normalX * scatter),
      y: round(from.y + dy * t + normalY * scatter),
      index,
    };
  });
}

export function smoothBrushPoint(previous: Point, next: Point, smoothing: number): Point {
  const amount = clamp(smoothing, 0, 1);
  const follow = 1 - amount * 0.85;
  return {
    x: round(previous.x + (next.x - previous.x) * follow),
    y: round(previous.y + (next.y - previous.y) * follow),
  };
}

export function readBrushPressure(event: Pick<PointerEvent, 'pointerType' | 'pressure'>): number {
  if (event.pointerType !== 'pen') return 1;
  if (event.pressure <= 0) return 1;
  return clamp(event.pressure, 0.05, 1);
}

export function paintBrushDab(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  dab: BrushDab,
  color: string,
  compositeOperation: GlobalCompositeOperation,
): void {
  const radius = Math.max(0.5, dab.size / 2);

  context.save();
  context.translate(dab.x, dab.y);
  context.rotate((dab.angleDeg * Math.PI) / 180);
  context.scale(1, dab.roundness);
  context.globalAlpha = clamp(dab.opacity * dab.flow, 0, 1);
  context.globalCompositeOperation = compositeOperation;

  if (dab.tipShape === 'square') {
    context.fillStyle = color;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
    return;
  }

  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);

  if (dab.hardness >= 0.98 || compositeOperation === 'destination-out') {
    context.fillStyle = color;
  } else {
    const gradient = context.createRadialGradient(0, 0, Math.max(0, radius * dab.hardness), 0, 0, radius);
    gradient.addColorStop(0, colorWithAlpha(color, 1));
    gradient.addColorStop(1, colorWithAlpha(color, 0));
    context.fillStyle = gradient;
  }

  context.fill();
  context.restore();
}

const DEFAULT_NORMALIZED_BRUSH_SETTINGS: BrushSettings = {
  presetId: 'softRound',
  size: 12,
  opacity: 1,
  hardness: 0.8,
  flow: 1,
  color: '#ffffff',
  spacing: 0.12,
  angleDeg: 0,
  roundness: 1,
  scatter: 0,
  smoothing: 0.15,
  pressureSize: 0.65,
  pressureOpacity: 0,
  pressureFlow: 0.35,
  tipShape: 'round',
};

function normalizeBrushColor(color: string | undefined): string {
  if (!color) return DEFAULT_NORMALIZED_BRUSH_SETTINGS.color;
  return color.trim() || DEFAULT_NORMALIZED_BRUSH_SETTINGS.color;
}

function colorWithAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return color;
  const value = hex[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return round(((value % 360) + 360) % 360);
}

function seededNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
