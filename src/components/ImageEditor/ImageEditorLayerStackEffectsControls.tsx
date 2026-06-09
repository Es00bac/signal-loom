import { X } from 'lucide-react';
import { createDefaultLayerEffect, layerEffectLabel } from './ImageLayerEffects';
import { createDefaultLayerFilter, layerFilterLabel } from './ImageLayerFilters';
import type { ImageLayerEffect, ImageLayerFilter, LayerEffectKind, LayerFilterKind } from '../../types/imageEditor';

const LAYER_EFFECT_KINDS: LayerEffectKind[] = [
  'stroke',
  'dropShadow',
  'outerGlow',
  'colorOverlay',
];

const LAYER_FILTER_KINDS: LayerFilterKind[] = [
  'blur',
  'sharpen',
  'grayscale',
  'sepia',
  'invert',
  'noise',
  'pixelate',
];

export function LayerEffectsControls({
  disabled,
  effects,
  onChange,
}: {
  disabled?: boolean;
  effects: ImageLayerEffect[];
  onChange: (effects: ImageLayerEffect[]) => void;
}) {
  const addEffect = (kind: LayerEffectKind) => {
    onChange([...effects, createDefaultLayerEffect(kind)]);
  };
  const updateEffect = (effectId: string, patch: Partial<ImageLayerEffect>) => {
    onChange(
      effects.map((effect) =>
        effect.id === effectId ? ({ ...effect, ...patch } as ImageLayerEffect) : effect,
      ),
    );
  };
  const removeEffect = (effectId: string) => {
    onChange(effects.filter((effect) => effect.id !== effectId));
  };

  return (
    <div className="mt-2 border-t border-cyan-300/10 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-cyan-100/40">Effects</label>
        <span className="text-[10px] uppercase tracking-wide text-cyan-100/30">
          {effects.filter((effect) => effect.enabled).length} active
        </span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {LAYER_EFFECT_KINDS.map((kind) => (
          <button
            className="rounded border border-cyan-300/10 px-1.5 py-1 text-[10px] text-cyan-100/60 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            key={kind}
            onClick={() => addEffect(kind)}
            title={`Add ${layerEffectLabel(kind)}`}
            type="button"
          >
            {layerEffectLabel(kind)}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {effects.map((effect) => (
          <LayerEffectRow
            disabled={disabled}
            effect={effect}
            key={effect.id}
            onRemove={() => removeEffect(effect.id)}
            onUpdate={(patch) => updateEffect(effect.id, patch)}
          />
        ))}
        {effects.length === 0 ? (
          <p className="text-[11px] text-cyan-100/30">
            Add a stroke, shadow, glow, or overlay to style this layer.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LayerFiltersControls({
  disabled,
  filters,
  onChange,
}: {
  disabled?: boolean;
  filters: ImageLayerFilter[];
  onChange: (filters: ImageLayerFilter[]) => void;
}) {
  const addFilter = (kind: LayerFilterKind) => {
    onChange([...filters, createDefaultLayerFilter(kind)]);
  };
  const updateFilter = (filterId: string, patch: Partial<ImageLayerFilter>) => {
    onChange(filters.map((filter) => (filter.id === filterId ? { ...filter, ...patch } : filter)));
  };
  const removeFilter = (filterId: string) => {
    onChange(filters.filter((filter) => filter.id !== filterId));
  };

  return (
    <div className="mt-2 border-t border-cyan-300/10 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-cyan-100/40">Filters</label>
        <span className="text-[10px] uppercase tracking-wide text-cyan-100/30">
          {filters.filter((filter) => filter.enabled).length} active
        </span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {LAYER_FILTER_KINDS.map((kind) => (
          <button
            className="rounded border border-cyan-300/10 px-1.5 py-1 text-[10px] text-cyan-100/60 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            key={kind}
            onClick={() => addFilter(kind)}
            title={`Add ${layerFilterLabel(kind)}`}
            type="button"
          >
            {layerFilterLabel(kind)}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {filters.map((filter) => (
          <LayerFilterRow
            disabled={disabled}
            filter={filter}
            key={filter.id}
            onRemove={() => removeFilter(filter.id)}
            onUpdate={(patch) => updateFilter(filter.id, patch)}
          />
        ))}
        {filters.length === 0 ? (
          <p className="text-[11px] text-cyan-100/30">
            Add blur, sharpen, grayscale, sepia, invert, noise, or pixelate filters to this layer.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LayerFilterRow({
  disabled,
  filter,
  onRemove,
  onUpdate,
}: {
  disabled?: boolean;
  filter: ImageLayerFilter;
  onRemove: () => void;
  onUpdate: (patch: Partial<ImageLayerFilter>) => void;
}) {
  return (
    <div className="rounded border border-cyan-300/10 bg-[#10131b] p-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <input
          checked={filter.enabled}
          disabled={disabled}
          onChange={(event) => onUpdate({ enabled: event.target.checked })}
          title="Enable filter"
          type="checkbox"
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-cyan-100/65">
          {layerFilterLabel(filter.kind)}
        </span>
        <button
          className="rounded p-0.5 text-cyan-100/35 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          title="Remove filter"
          type="button"
        >
          <X size={12} />
        </button>
      </div>
      <MiniEffectSlider
        disabled={disabled}
        label="Amount"
        max={filter.kind === 'blur' || filter.kind === 'pixelate' ? 32 : 100}
        min={0}
        onChange={(amount) => onUpdate({ amount })}
        step={1}
        value={filter.amount}
        format={(value) => (filter.kind === 'blur' || filter.kind === 'pixelate' ? `${Math.round(value)}px` : `${Math.round(value)}%`)}
      />
    </div>
  );
}

export function LayerEffectRow({
  disabled,
  effect,
  onRemove,
  onUpdate,
}: {
  disabled?: boolean;
  effect: ImageLayerEffect;
  onRemove: () => void;
  onUpdate: (patch: Partial<ImageLayerEffect>) => void;
}) {
  return (
    <div className="rounded border border-cyan-300/10 bg-[#10131b] p-1.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          checked={effect.enabled}
          disabled={disabled}
          onChange={(event) => onUpdate({ enabled: event.target.checked })}
          title="Enable effect"
          type="checkbox"
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-cyan-100/65">
          {layerEffectLabel(effect.kind)}
        </span>
        {'color' in effect ? (
          <input
            className="h-5 w-7 cursor-pointer rounded border border-cyan-300/10 bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            onChange={(event) => onUpdate({ color: event.target.value } as Partial<ImageLayerEffect>)}
            title="Effect color"
            type="color"
            value={effect.color}
          />
        ) : null}
        <button
          className="rounded p-0.5 text-cyan-100/35 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          title="Remove effect"
          type="button"
        >
          <X size={12} />
        </button>
      </div>
      <div className="space-y-1">
        {'opacity' in effect ? (
          <MiniEffectSlider
            disabled={disabled}
            label="Opacity"
            max={1}
            min={0}
            onChange={(opacity) => onUpdate({ opacity } as Partial<ImageLayerEffect>)}
            step={0.01}
            value={effect.opacity}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        ) : null}
        {effect.kind === 'stroke' ? (
          <>
            <MiniEffectSlider
              disabled={disabled}
              label="Size"
              max={64}
              min={1}
              onChange={(size) => onUpdate({ size } as Partial<ImageLayerEffect>)}
              step={1}
              value={effect.size}
              format={(value) => `${Math.round(value)}px`}
            />
            <select
              className="w-full rounded border border-cyan-300/10 bg-[#252630] px-1 py-0.5 text-[11px] text-cyan-100/70 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              onChange={(event) =>
                onUpdate({ position: event.target.value as 'outside' | 'inside' | 'center' } as Partial<ImageLayerEffect>)
              }
              value={effect.position}
            >
              <option value="outside">Outside</option>
              <option value="center">Center</option>
              <option value="inside">Inside</option>
            </select>
          </>
        ) : null}
        {effect.kind === 'dropShadow' ? (
          <>
            <MiniEffectSlider
              disabled={disabled}
              label="Distance"
              max={96}
              min={0}
              onChange={(distance) => onUpdate({ distance } as Partial<ImageLayerEffect>)}
              step={1}
              value={effect.distance}
              format={(value) => `${Math.round(value)}px`}
            />
            <MiniEffectSlider
              disabled={disabled}
              label="Size"
              max={96}
              min={0}
              onChange={(size) => onUpdate({ size } as Partial<ImageLayerEffect>)}
              step={1}
              value={effect.size}
              format={(value) => `${Math.round(value)}px`}
            />
            <MiniEffectSlider
              disabled={disabled}
              label="Angle"
              max={180}
              min={-180}
              onChange={(angle) => onUpdate({ angle } as Partial<ImageLayerEffect>)}
              step={1}
              value={effect.angle}
              format={(value) => `${Math.round(value)}°`}
            />
          </>
        ) : null}
        {effect.kind === 'outerGlow' ? (
          <MiniEffectSlider
            disabled={disabled}
            label="Size"
            max={96}
            min={1}
            onChange={(size) => onUpdate({ size } as Partial<ImageLayerEffect>)}
            step={1}
            value={effect.size}
            format={(value) => `${Math.round(value)}px`}
          />
        ) : null}
      </div>
    </div>
  );
}

export function MiniEffectSlider({
  disabled,
  format,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  disabled?: boolean;
  format: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <label className="w-12 text-cyan-100/35">{label}</label>
      <input
        className="min-w-0 flex-1 cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="w-9 text-right text-cyan-100/35">{format(value)}</span>
    </div>
  );
}
