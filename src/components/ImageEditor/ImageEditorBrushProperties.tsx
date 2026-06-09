import { useImageEditorStore } from '../../store/imageEditorStore';
import { BRUSH_PRESET_GROUPS, IMAGE_BRUSH_PRESETS, applyBrushPreset } from './ImageBrushPresets';
import { normalizeBrushSettings } from './ImageBrushEngine';
import { Slider } from './ImageEditorPropertyControls';

export function BrushPanel() {
  const settings = normalizeBrushSettings(useImageEditorStore((s) => s.brushSettings));
  const set = useImageEditorStore((s) => s.setBrushSettings);
  const groupedPresets = BRUSH_PRESET_GROUPS.map((group) => ({
    group,
    presets: IMAGE_BRUSH_PRESETS.filter((preset) => preset.group === group),
  })).filter((entry) => entry.presets.length > 0);

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <div>
        <label className="mb-1 block">Presets</label>
        {groupedPresets.map((group) => (
          <div className="mb-2" key={group.group}>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">{group.group}</div>
            <div className="grid grid-cols-2 gap-1">
              {group.presets.map((preset) => (
                <button
                  className={`rounded border px-2 py-1 text-left text-[11px] hover:border-cyan-400/40 hover:text-white ${
                    settings.presetId === preset.id
                      ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50'
                      : 'border-cyan-300/10 bg-[#252630] text-cyan-100/65'
                  }`}
                  key={preset.id}
                  onClick={() => set(applyBrushPreset(settings, preset))}
                  title={preset.label}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Slider
        label="Size"
        value={settings.size}
        max={256}
        min={1}
        step={1}
        onChange={(v) => set({ size: v, presetId: undefined })}
        format={(v) => `${Math.round(v)}px`}
      />
      <Slider
        label="Opacity"
        value={settings.opacity}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ opacity: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Hardness"
        value={settings.hardness}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ hardness: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Flow"
        value={settings.flow}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ flow: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Spacing"
        value={settings.spacing}
        max={1.5}
        min={0.02}
        step={0.01}
        onChange={(v) => set({ spacing: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Roundness"
        value={settings.roundness}
        max={1}
        min={0.05}
        step={0.01}
        onChange={(v) => set({ roundness: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Angle"
        value={settings.angleDeg}
        max={359}
        min={0}
        step={1}
        onChange={(v) => set({ angleDeg: v, presetId: undefined })}
        format={(v) => `${Math.round(v)}°`}
      />
      <Slider
        label="Scatter"
        value={settings.scatter}
        max={2}
        min={0}
        step={0.01}
        onChange={(v) => set({ scatter: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <Slider
        label="Smoothing"
        value={settings.smoothing}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ smoothing: v, presetId: undefined })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <div className="flex items-center gap-2">
        <label className="w-16">Tip</label>
        <select
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(event) => set({ tipShape: event.target.value as typeof settings.tipShape, presetId: undefined })}
          value={settings.tipShape}
        >
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Pressure</div>
        <Slider
          label="Size"
          value={settings.pressureSize}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ pressureSize: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="Opacity"
          value={settings.pressureOpacity}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ pressureOpacity: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="Flow"
          value={settings.pressureFlow}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ pressureFlow: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-16">Color</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent"
          onChange={(e) => set({ color: e.target.value, presetId: undefined })}
          type="color"
          value={settings.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(e) => set({ color: e.target.value, presetId: undefined })}
          type="text"
          value={settings.color}
        />
      </div>
      <CloneStampHint />
      <SpotHealHint />
      <BlurBrushHint />
      <SharpenBrushHint />
      <SmudgeBrushHint />
      <DodgeBurnHint />
      <SpongeBrushHint />
    </div>
  );
}

export function CloneStampHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'cloneStamp') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Alt-click a source point, then paint to clone sampled pixels. Size and opacity use the brush controls above.
    </p>
  );
}

export function SpongeBrushHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'spongeSaturateBrush' && tool !== 'spongeDesaturateBrush') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Paint to {tool === 'spongeSaturateBrush' ? 'increase' : 'reduce'} local saturation. Size controls the affected area; opacity controls strength.
    </p>
  );
}

export function DodgeBurnHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'dodgeBrush' && tool !== 'burnBrush') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Paint to {tool === 'dodgeBrush' ? 'brighten' : 'darken'} local tones. Size controls the affected area; opacity controls exposure strength.
    </p>
  );
}

export function SmudgeBrushHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'smudgeBrush') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Drag to smear pixels along the stroke. Size controls the affected area; opacity controls smudge strength.
    </p>
  );
}

export function SharpenBrushHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'sharpenBrush') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Paint to add local contrast. Size controls the affected area; opacity controls sharpening strength.
    </p>
  );
}

export function BlurBrushHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'blurBrush') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Paint to soften local detail. Size controls the affected area; opacity controls blur strength.
    </p>
  );
}

export function SpotHealHint() {
  const tool = useImageEditorStore((s) => s.tool);
  if (tool !== 'spotHeal') return null;
  return (
    <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
      Paint over small blemishes to blend them from nearby pixels. Size and opacity use the brush controls above.
    </p>
  );
}
