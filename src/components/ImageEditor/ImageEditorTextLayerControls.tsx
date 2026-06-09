import { AdjustmentSlider } from './ImageEditorAdjustmentControls';
import type { ImageLayer, TextLayerStyle } from '../../types/imageEditor';
import { IMAGE_TEXT_PRESETS, type ImageTextPresetId } from './ImageTextPresets';

export function EditableTextLayerControls({
  disabled,
  layer,
  onChange,
  onApplyPreset,
}: {
  disabled?: boolean;
  layer: ImageLayer;
  onChange: (patch: Partial<TextLayerStyle>) => void;
  onApplyPreset?: (presetId: ImageTextPresetId) => void;
}) {
  const text = layer.text;
  if (!text) {
    return (
      <div className="mt-2 rounded border border-cyan-300/10 bg-[#10131b] p-2 text-[11px] text-cyan-100/35">
        This text layer has no retained text style metadata to edit.
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-cyan-300/10 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-cyan-100/40">Text Layer</label>
        <span className="text-[10px] uppercase tracking-wide text-cyan-100/30">Editable</span>
      </div>
      {onApplyPreset ? (
        <div className="mb-2 grid grid-cols-2 gap-1">
          {IMAGE_TEXT_PRESETS.map((preset) => (
            <button
              className="rounded border border-cyan-300/10 px-1.5 py-1 text-left text-[10px] font-semibold text-cyan-100/60 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        className="mb-2 min-h-20 w-full resize-y rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85 outline-none focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange({ content: event.target.value })}
        value={text.content}
      />
      <div className="grid grid-cols-2 gap-2">
        <AdjustmentSlider
          disabled={disabled}
          label="Size"
          max={180}
          min={6}
          onChange={(fontSize) => onChange({ fontSize })}
          step={1}
          value={text.fontSize}
        />
        <AdjustmentSlider
          disabled={disabled}
          label="Leading"
          max={2.5}
          min={0.8}
          onChange={(lineHeight) => onChange({ lineHeight })}
          step={0.05}
          value={text.lineHeight}
        />
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-cyan-100/40">Font</span>
        <input
          className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85 outline-none focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => onChange({ fontFamily: event.target.value })}
          value={text.fontFamily}
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <label className="w-12 text-cyan-100/40">Color</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => onChange({ color: event.target.value })}
          type="color"
          value={text.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => onChange({ color: event.target.value })}
          type="text"
          value={text.color}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            className={`rounded border px-2 py-1 text-[11px] font-semibold capitalize disabled:cursor-not-allowed disabled:opacity-40 ${
              text.align === align
                ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
                : 'border-cyan-300/10 bg-[#252630] text-cyan-100/55 hover:border-cyan-300/30'
            }`}
            disabled={disabled}
            key={align}
            onClick={() => onChange({ align })}
            type="button"
          >
            {align}
          </button>
        ))}
      </div>
    </div>
  );
}
