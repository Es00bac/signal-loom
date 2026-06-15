import { useEffect, useMemo, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export type AdvancedColorPickerSupportState = 'ready' | 'limited' | 'unsupported';
export type AdvancedColorPickerControlSupportState = 'ready' | 'unavailable';
export type AdvancedColorPickerAndroidUnsupportedCode =
  | 'not-android'
  | 'native-color-input'
  | 'eyedropper-unavailable';

export interface AdvancedColorPickerAndroidSupportInput {
  platform?: string;
  viewportWidth?: number;
  pointer?: 'coarse' | 'fine' | 'unknown';
  hasEyeDropperCallback?: boolean;
  nativeColorInputUsed?: boolean;
}

export interface AdvancedColorPickerAndroidUnsupportedState {
  code: AdvancedColorPickerAndroidUnsupportedCode;
  summary: string;
}

export interface AdvancedColorPickerAndroidSupportDescriptor {
  descriptorId: 'advanced-color-picker-android-support:v1';
  platform: string;
  state: AdvancedColorPickerSupportState;
  compactLayout: boolean;
  usesNativeColorInput: boolean;
  controls: {
    hex: AdvancedColorPickerControlSupportState;
    hsv: AdvancedColorPickerControlSupportState;
    rgb: AdvancedColorPickerControlSupportState;
    alpha: AdvancedColorPickerControlSupportState;
    swatches: AdvancedColorPickerControlSupportState;
    eyedropper: AdvancedColorPickerControlSupportState;
  };
  unsupportedStates: AdvancedColorPickerAndroidUnsupportedState[];
  stableSignature: string;
}

interface AdvancedColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  onEyeDropper?: () => void;
  label: string;
  recentColors?: string[];
  className?: string;
  buttonClassName?: string;
  title?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
}

interface PanelPosition {
  left: number;
  top: number;
}

interface PanelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface PanelViewport {
  width: number;
  height: number;
}

const PANEL_WIDTH = 272;
const PANEL_HEIGHT = 432;
const PANEL_GAP = 8;
const VIEWPORT_PADDING = 8;
const TOUCH_COMPACT_MAX_WIDTH = 420;

const DEFAULT_SWATCHES = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function AdvancedColorPicker({
  value,
  onChange,
  onEyeDropper,
  label,
  recentColors,
  className,
  buttonClassName,
  title,
  disabled = false,
  defaultOpen = false,
}: AdvancedColorPickerProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const compactLayout = isTouchCompactLayout();
  const swatches = useMemo(() => getSortedSwatches(recentColors), [recentColors]);
  const color = normalizePickerHex(value);
  const [draftHex, setDraftHex] = useState(color);
  const [draftAlpha, setDraftAlpha] = useState(() => pickAlphaFromValue(value));
  const hsv = useMemo(() => hexToHsv(color), [color]);
  const rgb = useMemo(() => hexToRgb(color), [color]);

  useEffect(() => {
    setDraftHex(color);
    setDraftAlpha(pickAlphaFromValue(value));
  }, [color, value]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const trigger = buttonRef.current;
      const panel = typeof document !== 'undefined'
        ? document.querySelector('[data-advanced-color-picker-panel="true"]')
        : null;
      if (target && (trigger?.contains(target) || panel?.contains(target))) return;
      setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [open]);

  const applyColor = (nextColor: string) => {
    const normalized = normalizePickerHex(nextColor, color);
    setDraftHex(normalized);
    onChange(normalized);
  };

  const applyHsv = (patch: Partial<HsvColor>) => {
    applyColor(hsvToHex({ ...hsv, ...patch }));
  };

  const applyRgb = (channel: keyof RgbColor, nextValue: number) => {
    applyColor(rgbToHex({
      ...rgb,
      [channel]: clamp(Math.round(nextValue), 0, 255),
    }));
  };

  const applyAlpha = (nextValue: number) => {
    setDraftAlpha(clamp(Math.round(nextValue), 0, 100));
  };

  function updatePanelPosition() {
    if (typeof window === 'undefined') return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const compactPanel = buttonRef.current?.closest('[data-dockable-panel-chrome="compact-floating"], [data-compact-tool-palette="true"]');
    setPanelPosition(calculateAdvancedColorPickerPosition(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      compactPanel?.getBoundingClientRect(),
    ));
  }

  const openPanel = () => {
    if (disabled) return;
    setOpen((wasOpen) => !wasOpen);
    window.setTimeout(updatePanelPosition, 0);
  };

  const panel = open ? (
    <div
      className={joinClasses(
        'z-[10000] w-[272px] max-w-[calc(100vw-16px)] rounded-lg border border-cyan-300/20 bg-[#0b1018] p-3 text-xs text-cyan-100 shadow-2xl shadow-black/60',
      )}
      data-advanced-color-picker-panel="true"
      data-advanced-color-picker-compact-layout={compactLayout}
      onPointerDown={(event) => event.stopPropagation()}
      role="dialog"
      style={panelPosition && typeof document !== 'undefined'
        ? { position: 'fixed', left: panelPosition.left, top: panelPosition.top }
        : undefined}
    >
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded border border-white/30 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.65)]"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="font-semibold text-cyan-50">{label}</div>
          <div className="font-mono text-[11px] text-cyan-100/55">{color}</div>
        </div>
        {onEyeDropper ? (
          <button
            aria-label={`${label} eyedropper`}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 transition hover:bg-cyan-300/15 active:bg-cyan-300/25"
            data-advanced-color-picker-eyedropper="true"
            onClick={onEyeDropper}
            type="button"
          >
            <Pipette size={13} />
          </button>
        ) : null}
      </div>

      <label className="mb-3 block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/45">{label} HEX</span>
        <input
          aria-label={`${label} HEX`}
          className="w-full rounded border border-cyan-300/15 bg-[#141b25] px-2 py-1.5 font-mono text-xs text-cyan-50 outline-none focus:border-cyan-300/60"
          onBlur={() => setDraftHex(color)}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraftHex(nextDraft);
            const normalized = normalizePickerHex(nextDraft, '');
            if (normalized) {
              onChange(normalized);
            }
          }}
          spellCheck={false}
          type="text"
          value={draftHex}
        />
      </label>

      <div
        className={joinClasses('mb-3 rounded border border-cyan-300/15', compactLayout ? 'h-14' : 'h-20')}
        style={{
          background:
            `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
        }}
      />

      <RangeRow
        compact={compactLayout}
        label={`${label} alpha`}
        max={100}
        onChange={(next) => applyAlpha(next)}
        value={draftAlpha}
      />

      <RangeRow
        compact={compactLayout}
        label={`${label} hue`}
        max={360}
        onChange={(next) => applyHsv({ h: next })}
        value={Math.round(hsv.h)}
      />
      <RangeRow
        compact={compactLayout}
        label={`${label} saturation`}
        max={100}
        onChange={(next) => applyHsv({ s: next })}
        value={Math.round(hsv.s)}
      />
      <RangeRow
        compact={compactLayout}
        label={`${label} value`}
        max={100}
        onChange={(next) => applyHsv({ v: next })}
        value={Math.round(hsv.v)}
      />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberRow label={`${label} red`} onChange={(next) => applyRgb('r', next)} value={rgb.r} />
        <NumberRow label={`${label} green`} onChange={(next) => applyRgb('g', next)} value={rgb.g} />
        <NumberRow label={`${label} blue`} onChange={(next) => applyRgb('b', next)} value={rgb.b} />
      </div>

      <div className={joinClasses('mt-3 gap-1', compactLayout ? 'grid grid-cols-5' : 'grid grid-cols-10')}>
        {swatches.map(({ color: swatch, source }) => (
          <button
            aria-label={`${label} ${source} ${swatch}`}
            className="h-5 rounded border border-white/20"
            key={swatch}
            onClick={() => applyColor(swatch)}
            style={{ backgroundColor: swatch }}
            type="button"
          />
        ))}
      </div>
    </div>
  ) : null;

  const shouldPortal = open && typeof document !== 'undefined' && document.body;

  return (
    <span className={joinClasses('inline-flex', className)} data-advanced-color-picker="true">
      <button
        aria-label={label}
        className={joinClasses(
          'h-full w-full cursor-pointer rounded border border-cyan-300/20 bg-transparent p-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)] disabled:cursor-not-allowed disabled:opacity-50',
          buttonClassName,
        )}
        disabled={disabled}
        onClick={openPanel}
        ref={buttonRef}
        style={{ backgroundColor: color }}
        title={title ?? label}
        type="button"
      />
      {shouldPortal ? createPortal(panel, document.body) : panel}
    </span>
  );
}

export function calculateAdvancedColorPickerPosition(
  triggerRect: PanelRect,
  viewport: PanelViewport,
  avoidRect?: PanelRect,
): PanelPosition {
  const maxLeft = Math.max(VIEWPORT_PADDING, viewport.width - PANEL_WIDTH - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewport.height - PANEL_HEIGHT - VIEWPORT_PADDING);

  if (avoidRect) {
    const rightOfAvoid = avoidRect.right + PANEL_GAP;
    const leftOfAvoid = avoidRect.left - PANEL_WIDTH - PANEL_GAP;
    const opensRight = rightOfAvoid + PANEL_WIDTH <= viewport.width - VIEWPORT_PADDING;
    const opensLeft = leftOfAvoid >= VIEWPORT_PADDING;

    if (opensRight || opensLeft) {
      return {
        left: opensRight ? rightOfAvoid : leftOfAvoid,
        top: clamp(avoidRect.top, VIEWPORT_PADDING, maxTop),
      };
    }

    const belowAvoid = avoidRect.bottom + PANEL_GAP;
    const aboveAvoid = avoidRect.top - PANEL_HEIGHT - PANEL_GAP;
    const top = belowAvoid + PANEL_HEIGHT <= viewport.height - VIEWPORT_PADDING
      ? belowAvoid
      : clamp(aboveAvoid, VIEWPORT_PADDING, maxTop);
    return {
      left: clamp(triggerRect.left, VIEWPORT_PADDING, maxLeft),
      top,
    };
  }

  const left = clamp(triggerRect.left, VIEWPORT_PADDING, maxLeft);
  const preferredTop = triggerRect.bottom + PANEL_GAP;
  const fallbackTop = triggerRect.top - PANEL_HEIGHT - PANEL_GAP;
  const top = preferredTop + PANEL_HEIGHT <= viewport.height - VIEWPORT_PADDING
    ? preferredTop
    : clamp(fallbackTop, VIEWPORT_PADDING, maxTop);
  return { left, top };
}

export function describeAdvancedColorPickerAndroidSupport(
  input: AdvancedColorPickerAndroidSupportInput = {},
): AdvancedColorPickerAndroidSupportDescriptor {
  const platform = input.platform?.trim().toLowerCase() || 'unknown';
  const compactLayout = input.viewportWidth !== undefined
    ? input.viewportWidth <= TOUCH_COMPACT_MAX_WIDTH
    : input.pointer === 'coarse';
  const usesNativeColorInput = input.nativeColorInputUsed === true;
  const controls: AdvancedColorPickerAndroidSupportDescriptor['controls'] = {
    hex: 'ready',
    hsv: 'ready',
    rgb: 'ready',
    alpha: 'ready',
    swatches: 'ready',
    eyedropper: input.hasEyeDropperCallback === true ? 'ready' : 'unavailable',
  };
  const unsupportedStates = buildAdvancedColorPickerAndroidUnsupportedStates({
    platform,
    usesNativeColorInput,
    controls,
  });
  const state: AdvancedColorPickerSupportState = platform !== 'android'
    ? 'unsupported'
    : usesNativeColorInput
      ? 'unsupported'
      : unsupportedStates.length > 0
        ? 'limited'
        : 'ready';
  const descriptorWithoutSignature = {
    descriptorId: 'advanced-color-picker-android-support:v1' as const,
    platform,
    state,
    compactLayout,
    usesNativeColorInput,
    controls,
    unsupportedStates,
  };

  return {
    ...descriptorWithoutSignature,
    stableSignature: buildAdvancedColorPickerAndroidSupportSignature(descriptorWithoutSignature),
  };
}

function buildAdvancedColorPickerAndroidUnsupportedStates(input: {
  platform: string;
  usesNativeColorInput: boolean;
  controls: AdvancedColorPickerAndroidSupportDescriptor['controls'];
}): AdvancedColorPickerAndroidUnsupportedState[] {
  const states: AdvancedColorPickerAndroidUnsupportedState[] = [];
  if (input.platform !== 'android') {
    states.push({
      code: 'not-android',
      summary: 'Android advanced color picker readiness only applies to the Android app surface.',
    });
  }
  if (input.usesNativeColorInput) {
    states.push({
      code: 'native-color-input',
      summary: 'Android readiness requires the app-controlled advanced picker, not a browser native color input.',
    });
  }
  if (input.controls.eyedropper !== 'ready') {
    states.push({
      code: 'eyedropper-unavailable',
      summary: 'Eyedropper readiness requires an app-provided sampling callback.',
    });
  }
  return states;
}

function buildAdvancedColorPickerAndroidSupportSignature(
  descriptor: Omit<AdvancedColorPickerAndroidSupportDescriptor, 'stableSignature'>,
): string {
  const controls = Object.entries(descriptor.controls)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
  const unsupported = descriptor.unsupportedStates.map((state) => state.code).join(',') || 'none';
  return [
    'advanced-color-picker-android-support:v1',
    `platform=${descriptor.platform}`,
    `state=${descriptor.state}`,
    `compact=${descriptor.compactLayout ? 'yes' : 'no'}`,
    `native-input=${descriptor.usesNativeColorInput ? 'yes' : 'no'}`,
    `controls=${controls}`,
    `unsupported=${unsupported}`,
  ].join('|');
}

function isTouchCompactLayout(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.innerWidth <= TOUCH_COMPACT_MAX_WIDTH) {
    return true;
  }

  if (!window.matchMedia) {
    return false;
  }

  return window.matchMedia('(pointer: coarse), (hover: none)').matches;
}

function getSortedSwatches(recentColors?: string[]) {
  const swatches: Array<{ color: string; source: 'recent' | 'preset' }> = [];
  const seen = new Set<string>();

  const add = (swatch: string, source: 'recent' | 'preset') => {
    const normalized = normalizePickerHex(swatch, '');
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    swatches.push({ color: normalized, source });
  };

  for (const swatch of recentColors ?? []) {
    add(swatch, 'recent');
  }

  for (const swatch of DEFAULT_SWATCHES) {
    add(swatch, 'preset');
  }

  return swatches;
}

function pickAlphaFromValue(value: string): number {
  const trimmed = value.trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (!match) return 100;

  const raw = match[1].toLowerCase();
  if (raw.length === 4) {
    return Number.parseInt(`${raw[3]}${raw[3]}`, 16) / 255 * 100;
  }

  if (raw.length === 8) {
    return Number.parseInt(raw.slice(6, 8), 16) / 255 * 100;
  }

  return 100;
}

function RangeRow({
  label,
  value,
  max,
  compact,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  compact: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className={joinClasses(
        'mb-2 items-center gap-2',
        compact ? 'grid grid-cols-[4rem_1fr_2rem]' : 'grid grid-cols-[4.5rem_1fr_3rem]',
      )}
    >
      <span className="truncate text-[10px] uppercase tracking-[0.12em] text-cyan-100/45">{lastWord(label)}</span>
      <input
        aria-label={label}
        className="accent-cyan-300"
        max={max}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
      <span className="font-mono text-[11px] text-cyan-100/60">{value}</span>
    </label>
  );
}

function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-cyan-100/45">{lastWord(label).slice(0, 1)}</span>
      <input
        aria-label={label}
        className="w-full rounded border border-cyan-300/15 bg-[#141b25] px-1.5 py-1 font-mono text-xs text-cyan-50 outline-none focus:border-cyan-300/60"
        max={255}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function normalizePickerHex(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (!match) return fallback;
  const raw = match[1].toLowerCase();
  if (raw.length === 3) {
    return `#${raw.split('').map((part) => `${part}${part}`).join('')}`;
  }
  if (raw.length === 4) {
    return `#${raw.slice(0, 3).split('').map((part) => `${part}${part}`).join('')}`;
  }
  if (raw.length === 8) {
    return `#${raw.slice(0, 6)}`;
  }
  return `#${raw}`;
}

export function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(normalizePickerHex(hex));
  const rUnit = r / 255;
  const gUnit = g / 255;
  const bUnit = b / 255;
  const max = Math.max(rUnit, gUnit, bUnit);
  const min = Math.min(rUnit, gUnit, bUnit);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rUnit) {
      h = 60 * (((gUnit - bUnit) / delta) % 6);
    } else if (max === gUnit) {
      h = 60 * ((bUnit - rUnit) / delta + 2);
    } else {
      h = 60 * ((rUnit - gUnit) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const match = value - chroma;
  const [r1, g1, b1] = hue < 1
    ? [chroma, x, 0]
    : hue < 2
      ? [x, chroma, 0]
      : hue < 3
        ? [0, chroma, x]
        : hue < 4
          ? [0, x, chroma]
          : hue < 5
            ? [x, 0, chroma]
            : [chroma, 0, x];

  return rgbToHex({
    r: Math.round((r1 + match) * 255),
    g: Math.round((g1 + match) * 255),
    b: Math.round((b1 + match) * 255),
  });
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizePickerHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function lastWord(value: string): string {
  return value.trim().split(/\s+/).at(-1) ?? value;
}
