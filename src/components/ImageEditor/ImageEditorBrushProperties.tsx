import { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { AdvancedColorPicker } from '../Common/AdvancedColorPicker';
import {
  BRUSH_PRESET_GROUPS,
  IMAGE_BRUSH_PRESETS,
  applyBrushPreset,
  describeImageBrushPreset,
  exportUserBrushPresetPack,
  importUserBrushPresetPack,
  type ImageBrushPreset,
} from './ImageBrushPresets';
import { normalizeBrushSettings } from './ImageBrushEngine';
import { Slider } from './ImageEditorPropertyControls';
import { useImageEditorStore } from '../../store/imageEditorStore';
import type { EditorTool, RetouchSampleMode, RetouchToneRange } from '../../types/imageEditor';

const TONE_BRUSH_TOOLS = new Set<EditorTool>(['dodgeBrush', 'burnBrush']);
const SPONGE_BRUSH_TOOLS = new Set<EditorTool>(['spongeSaturateBrush', 'spongeDesaturateBrush']);
const SAMPLE_SOURCE_BRUSH_TOOLS = new Set<EditorTool>(['blurBrush', 'sharpenBrush']);
const FINISHING_BRUSH_TOOLS = new Set<EditorTool>([
  'blurBrush',
  'sharpenBrush',
  'smudgeBrush',
  'dodgeBrush',
  'burnBrush',
  'spongeSaturateBrush',
  'spongeDesaturateBrush',
]);

export function BrushPanel() {
  const settings = normalizeBrushSettings(useImageEditorStore((s) => s.brushSettings));
  const set = useImageEditorStore((s) => s.setBrushSettings);
  const tool = useImageEditorStore((s) => s.tool);
  const retouchToolSettings = useImageEditorStore((s) => s.retouchToolSettings);
  const setRetouchToolSettings = useImageEditorStore((s) => s.setRetouchToolSettings);
  const customBrushPresets = useSettingsStore((s) => s.customBrushPresets);
  const saveCustomBrushPreset = useSettingsStore((s) => s.saveCustomBrushPreset);
  const renameCustomBrushPreset = useSettingsStore((s) => s.renameCustomBrushPreset);
  const deleteCustomBrushPreset = useSettingsStore((s) => s.deleteCustomBrushPreset);
  const setCustomBrushPresets = useSettingsStore((s) => s.setCustomBrushPresets);
  const groupedPresets = BRUSH_PRESET_GROUPS.map((group) => ({
    group,
    presets: IMAGE_BRUSH_PRESETS.filter((preset) => preset.group === group),
  })).filter((entry) => entry.presets.length > 0);

  const [presetName, setPresetName] = useState('');
  const [renamePresetId, setRenamePresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [presetPackJson, setPresetPackJson] = useState('');
  const [presetPackError, setPresetPackError] = useState('');

  const applyPreset = (preset: ImageBrushPreset) => {
    set(applyBrushPreset(settings, preset));
  };

  const savePreset = () => {
    saveCustomBrushPreset(presetName, settings);
    setPresetName('');
    setPresetPackError('');
  };

  const exportPresets = () => {
    setPresetPackJson(exportUserBrushPresetPack(customBrushPresets));
    setPresetPackError('');
  };

  const importPresets = () => {
    try {
      const imported = importUserBrushPresetPack(
        presetPackJson,
        [...IMAGE_BRUSH_PRESETS, ...customBrushPresets].map((preset) => preset.id),
      );
      setCustomBrushPresets([
        ...customBrushPresets,
        ...imported,
      ]);
      setPresetPackError('');
    } catch {
      setPresetPackError('Invalid preset pack JSON.');
    }
  };

  const beginRename = (preset: ImageBrushPreset) => {
    setRenamePresetId(preset.id);
    setRenameValue(preset.label);
  };

  const commitRename = () => {
    if (!renamePresetId) return;
    renameCustomBrushPreset(renamePresetId, renameValue);
    setRenamePresetId(null);
    setRenameValue('');
  };

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <div>
        <label className="mb-1 block">Presets</label>
        {groupedPresets.map((group) => (
          <div className="mb-2" key={group.group}>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">{group.group}</div>
            <div className="grid grid-cols-2 gap-1">
              {group.presets.map((preset) => (
                <PresetTile
                  active={settings.presetId === preset.id}
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  preset={preset}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">My Presets</div>
        <div className="mb-2 flex gap-2">
          <input
            aria-label="Brush preset name"
            className="min-w-0 flex-1 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-xs text-cyan-100/80"
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="Preset name"
            type="text"
            value={presetName}
          />
          <button
            className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/80 hover:border-cyan-400/40 hover:text-white"
            onClick={savePreset}
            type="button"
          >
            Save Preset
          </button>
        </div>
        {customBrushPresets.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              {customBrushPresets.map((preset) => (
                <div className="rounded border border-cyan-300/10 bg-[#171922] p-1" key={preset.id}>
                  <PresetTile
                    active={settings.presetId === preset.id}
                    onClick={() => applyPreset(preset)}
                    preset={preset}
                  />
                  {renamePresetId === preset.id ? (
                    <div className="mt-1 space-y-1">
                      <input
                        aria-label={`Rename ${preset.label}`}
                        className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/80"
                        onChange={(event) => setRenameValue(event.target.value)}
                        type="text"
                        value={renameValue}
                      />
                      <div className="flex gap-1">
                        <button
                          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/80 hover:border-cyan-400/40 hover:text-white"
                          onClick={commitRename}
                          type="button"
                        >
                          Apply Name
                        </button>
                        <button
                          className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/60 hover:border-cyan-400/40 hover:text-white"
                          onClick={() => {
                            setRenamePresetId(null);
                            setRenameValue('');
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-1">
                      <button
                        aria-label={`Rename ${preset.label}`}
                        className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/60 hover:border-cyan-400/40 hover:text-white"
                        onClick={() => beginRename(preset)}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        aria-label={`Delete ${preset.label}`}
                        className="rounded border border-red-400/15 bg-[#252630] px-2 py-1 text-[11px] text-red-100/70 hover:border-red-400/40 hover:text-red-50"
                        onClick={() => deleteCustomBrushPreset(preset.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-cyan-100/40">Saved custom presets appear here.</p>
        )}
        <div className="mt-2 space-y-1">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Brush preset pack JSON</label>
          <textarea
            aria-label="Brush preset pack JSON"
            className="min-h-24 w-full rounded border border-cyan-300/10 bg-[#0e1017] px-2 py-1.5 text-[11px] text-cyan-100/70"
            onChange={(event) => setPresetPackJson(event.target.value)}
            spellCheck={false}
            value={presetPackJson}
          />
          <div className="flex gap-1">
            <button
              className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/80 hover:border-cyan-400/40 hover:text-white"
              onClick={exportPresets}
              type="button"
            >
              Export Presets
            </button>
            <button
              className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] text-cyan-100/80 hover:border-cyan-400/40 hover:text-white"
              onClick={importPresets}
              type="button"
            >
              Import Presets
            </button>
          </div>
          {presetPackError ? <p className="text-[11px] text-red-100/75">{presetPackError}</p> : null}
        </div>
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
      <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Symmetry</div>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: 'Off', value: 'none' },
            { label: 'Vertical', value: 'vertical' },
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Four-Way', value: 'both' },
          ].map((option) => (
            <button
              className={`rounded border px-2 py-1 text-left text-[11px] hover:border-cyan-400/40 hover:text-white ${
                settings.symmetryMode === option.value
                  ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50'
                  : 'border-cyan-300/10 bg-[#252630] text-cyan-100/65'
              }`}
              key={option.value}
              onClick={() => set({ symmetryMode: option.value as typeof settings.symmetryMode, presetId: undefined })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-cyan-100/35">Centered on the active document.</p>
      </div>
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
      <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Advanced Dynamics</div>
        <Slider
          ariaLabel="Velocity size"
          label="Velocity Size"
          value={settings.velocitySize ?? 0}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ velocitySize: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          ariaLabel="Velocity opacity"
          label="Velocity Opacity"
          value={settings.velocityOpacity ?? 0}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ velocityOpacity: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          ariaLabel="Velocity flow"
          label="Velocity Flow"
          value={settings.velocityFlow ?? 0}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ velocityFlow: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          ariaLabel="Velocity spacing"
          label="Velocity Spacing"
          value={settings.velocitySpacing ?? 0}
          max={1}
          min={0}
          step={0.01}
          onChange={(v) => set({ velocitySpacing: v, presetId: undefined })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="mt-2 space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Texture</label>
          <input
            aria-label="Brush texture name"
            className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-xs text-cyan-100/80"
            onChange={(event) => set({ texture: event.target.value || undefined, presetId: undefined })}
            placeholder="Texture name"
            type="text"
            value={settings.texture ?? ''}
          />
          <Slider
            ariaLabel="Texture scale"
            label="Scale"
            value={settings.textureScale ?? 1}
            max={4}
            min={0.05}
            step={0.05}
            onChange={(v) => set({ textureScale: v, presetId: undefined })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            ariaLabel="Texture depth"
            label="Depth"
            value={settings.textureDepth ?? 0}
            max={1}
            min={0}
            step={0.01}
            onChange={(v) => set({ textureDepth: v, presetId: undefined })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Dual-brush composition"
              checked={Boolean(settings.dualBrush)}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => set({ dualBrush: event.target.checked, presetId: undefined })}
              type="checkbox"
            />
            Dual-brush composition
          </label>
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Wet media"
              checked={Boolean(settings.wetMedia)}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => set({ wetMedia: event.target.checked, wetEdges: event.target.checked, presetId: undefined })}
              type="checkbox"
            />
            Wet media
          </label>
          <Slider
            ariaLabel="Wet media mix"
            label="Mix"
            value={settings.wetMix ?? 0}
            max={1}
            min={0}
            step={0.01}
            onChange={(v) => set({ wetMix: v, presetId: undefined })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            ariaLabel="Wet media load"
            label="Load"
            value={settings.wetLoad ?? 1}
            max={1}
            min={0}
            step={0.01}
            onChange={(v) => set({ wetLoad: v, presetId: undefined })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            ariaLabel="Wet media pull"
            label="Pull"
            value={settings.wetPull ?? 0}
            max={1}
            min={0}
            step={0.01}
            onChange={(v) => set({ wetPull: v, presetId: undefined })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1">
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="GPU brush engine"
              checked={Boolean(settings.gpuBrushEngine)}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => set({ gpuBrushEngine: event.target.checked, gpuAcceleration: event.target.checked, presetId: undefined })}
              type="checkbox"
            />
            GPU brush engine
          </label>
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Android brush controls"
              checked={Boolean(settings.androidBrushControls)}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => set({ androidBrushControls: event.target.checked, androidStylusControls: event.target.checked, presetId: undefined })}
              type="checkbox"
            />
            Android brush controls
          </label>
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Gamepad brush controls"
              checked={Boolean(settings.gamepadBrushControls)}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => set({ gamepadBrushControls: event.target.checked, gamepadPressure: event.target.checked, presetId: undefined })}
              type="checkbox"
            />
            Gamepad brush controls
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            aria-label="ABR preset id"
            className="min-w-0 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-xs text-cyan-100/80"
            onChange={(event) => set({ abrPresetId: event.target.value || undefined, presetId: undefined })}
            placeholder="ABR preset id"
            type="text"
            value={settings.abrPresetId ?? ''}
          />
          <input
            aria-label="ABR version"
            className="min-w-0 rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-xs text-cyan-100/80"
            min={0}
            onChange={(event) => set({ abrVersion: Number.parseInt(event.target.value, 10) || undefined, presetId: undefined })}
            placeholder="ABR version"
            type="number"
            value={settings.abrVersion ?? ''}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="w-16">Color</label>
        <AdvancedColorPicker
          className="h-6 w-12"
          buttonClassName="rounded border border-cyan-300/10"
          label="Brush color"
          onChange={(color) => set({ color, presetId: undefined })}
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
      {tool === 'cloneStamp' || tool === 'spotHeal' ? (
        <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
          <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Retouch Source</div>
          <div className="mb-2 flex items-center gap-2">
            <label className="w-16">Sample</label>
            <select
              aria-label="Retouch sample mode"
              className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
              onChange={(event) => setRetouchToolSettings({ sampleMode: event.target.value as typeof retouchToolSettings.sampleMode })}
              value={retouchToolSettings.sampleMode}
            >
              <option value="currentLayer">Current Layer</option>
              <option value="currentAndBelow">Current & Below</option>
              <option value="allLayers">All Layers</option>
            </select>
          </div>
          {tool === 'cloneStamp' ? (
            <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
              <input
                aria-label="Aligned clone stamp"
                checked={retouchToolSettings.aligned}
                className="h-3.5 w-3.5 accent-cyan-300"
                onChange={(event) => setRetouchToolSettings({ aligned: event.target.checked })}
                type="checkbox"
              />
              Aligned
            </label>
          ) : null}
        </div>
      ) : null}
      <FinishingBrushOptions />
      <BlurBrushHint />
      <SharpenBrushHint />
      <SmudgeBrushHint />
      <DodgeBurnHint />
      <SpongeBrushHint />
    </div>
  );
}

function FinishingBrushOptions() {
  const tool = useImageEditorStore((s) => s.tool);
  const retouchToolSettings = useImageEditorStore((s) => s.retouchToolSettings);
  const setRetouchToolSettings = useImageEditorStore((s) => s.setRetouchToolSettings);
  if (!FINISHING_BRUSH_TOOLS.has(tool)) return null;
  const isToneBrush = TONE_BRUSH_TOOLS.has(tool);
  const rateLabel = isToneBrush ? 'Dodge and burn rate' : 'Sponge rate';
  const rateFormatLabel = `${Math.round(retouchToolSettings.rate * 100)}%`;

  return (
    <div className="rounded border border-cyan-300/10 bg-[#10131b] p-2">
      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100/35">Finishing Brush</div>
      <div className="mb-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
        <span className="text-cyan-100/40">Source</span>
        <span className="text-cyan-100/65">{finishingBrushSourceLabel(tool)}</span>
        <span className="text-cyan-100/40">Strength</span>
        <span className="text-cyan-100/65">Brush opacity</span>
      </div>
      {(TONE_BRUSH_TOOLS.has(tool) || SPONGE_BRUSH_TOOLS.has(tool)) ? (
        <div className="mb-2 flex items-center gap-2">
          <label className="w-16">Output</label>
          <select
            aria-label="Retouch output mode"
            className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
            onChange={(event) => setRetouchToolSettings({ outputMode: event.target.value as typeof retouchToolSettings.outputMode })}
            value={retouchToolSettings.outputMode}
          >
            <option value="activeLayer">Active Layer</option>
            <option value="newLayer">New Retouch Layer</option>
          </select>
        </div>
      ) : null}
      {SAMPLE_SOURCE_BRUSH_TOOLS.has(tool) ? (
        <div className="mb-2 flex items-center gap-2">
          <label className="w-16">Sample</label>
          <select
            aria-label="Finishing brush sample mode"
            className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
            onChange={(event) => setRetouchToolSettings({ sampleMode: event.target.value as RetouchSampleMode })}
            value={retouchToolSettings.sampleMode}
          >
            <option value="currentLayer">Current Layer</option>
            <option value="currentAndBelow">Current & Below</option>
            <option value="allLayers">All Layers</option>
          </select>
        </div>
      ) : null}
      {TONE_BRUSH_TOOLS.has(tool) ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="w-16">Range</label>
            <select
              aria-label="Dodge and burn tonal range"
              className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
              onChange={(event) => setRetouchToolSettings({ toneRange: event.target.value as RetouchToneRange })}
              value={retouchToolSettings.toneRange}
            >
              <option value="all">All Tones</option>
              <option value="shadows">Shadows</option>
              <option value="midtones">Midtones</option>
              <option value="highlights">Highlights</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Protect tones"
              checked={retouchToolSettings.protectTones}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => setRetouchToolSettings({ protectTones: event.target.checked })}
              type="checkbox"
            />
            Protect tones
          </label>
        </div>
      ) : null}
      {(TONE_BRUSH_TOOLS.has(tool) || SPONGE_BRUSH_TOOLS.has(tool)) ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Airbrush"
              checked={retouchToolSettings.airbrush}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => setRetouchToolSettings({ airbrush: event.target.checked })}
              type="checkbox"
            />
            Airbrush
          </label>
          <Slider
            ariaLabel={rateLabel}
            label="Rate"
            value={retouchToolSettings.rate}
            max={1}
            min={0}
            step={0.01}
            onChange={(value) => setRetouchToolSettings({ rate: value })}
            format={() => rateFormatLabel}
          />
        </div>
      ) : null}
      {SPONGE_BRUSH_TOOLS.has(tool) ? (
        <div className="space-y-2">
          <Slider
            ariaLabel="Sponge vibrance"
            label="Vibrance"
            value={retouchToolSettings.spongeVibrance}
            max={1}
            min={0}
            step={0.01}
            onChange={(value) => setRetouchToolSettings({ spongeVibrance: value })}
            format={(value) => `${Math.round(value * 100)}%`}
          />
          <label className="flex items-center gap-2 text-[11px] text-cyan-100/55">
            <input
              aria-label="Preserve sponge luminosity"
              checked={retouchToolSettings.spongePreserveLuminosity}
              className="h-3.5 w-3.5 accent-cyan-300"
              onChange={(event) => setRetouchToolSettings({ spongePreserveLuminosity: event.target.checked })}
              type="checkbox"
            />
            Preserve luminosity
          </label>
        </div>
      ) : null}
    </div>
  );
}

function finishingBrushSourceLabel(tool: EditorTool): string {
  if (tool === 'smudgeBrush') return 'Previous stroke point';
  if (tool === 'blurBrush' || tool === 'sharpenBrush') return 'Selectable layer/composite snapshot';
  return 'Active layer pixels';
}

function PresetTile({
  active,
  onClick,
  preset,
}: {
  active: boolean;
  onClick: () => void;
  preset: ImageBrushPreset;
}) {
  const settings = normalizeBrushSettings(preset.settings);
  const descriptor = describeImageBrushPreset(preset, preset.group === 'User' ? 'user' : 'built-in');
  const fill = preset.settings.color ?? '#9be7ff';

  const previewSize = Math.max(1, Math.min(14, settings.size / 4));
  const step = Math.max(1, previewSize * Math.max(0.01, settings.spacing));
  const curveLength = 64;
  const numSteps = Math.min(80, Math.max(3, Math.floor(curveLength / step)));

  return (
    <button
      className={`rounded border px-1.5 py-1 text-left text-[11px] hover:border-cyan-400/40 hover:text-white ${
        active
          ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50'
          : 'border-cyan-300/10 bg-[#252630] text-cyan-100/65'
      }`}
      onClick={onClick}
      title={preset.label}
      type="button"
    >
      <svg
        className="mb-1 block h-6 w-full rounded bg-[#10131b]"
        data-brush-preset-preview={preset.id}
        data-brush-preset-preview-signature={descriptor.preview.signature}
        role="img"
        viewBox="0 0 72 18"
      >
        <rect fill="#10131b" height="18" rx="3" width="72" x="0" y="0" />
        {Array.from({ length: numSteps }, (_, index) => {
          const t = numSteps > 1 ? index / (numSteps - 1) : 0.5;
          const u = 1 - t;
          
          // Bezier curve P0(6, 12), P1(26, 2), P2(46, 16), P3(66, 6)
          const x = u*u*u*6 + 3*u*u*t*26 + 3*u*t*t*46 + t*t*t*66;
          let y = u*u*u*12 + 3*u*u*t*2 + 3*u*t*t*16 + t*t*t*6;

          const hash = Math.sin(index * 12.9898) * 43758.5453;
          const rand = hash - Math.floor(hash);
          y += (rand - 0.5) * 2 * settings.scatter * 8;

          const pressure = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
          const sizeMod = 1 - (settings.pressureSize || 0) * (1 - pressure);
          const opacityMod = 1 - (settings.pressureOpacity || 0) * (1 - Math.pow(pressure, 0.5));

          const currentSize = previewSize * sizeMod;
          const currentOpacity = Math.max(0, Math.min(1, settings.opacity * settings.flow * opacityMod));
          const strokeHeight = Math.max(1, (settings.hardness * 2 + 1) * currentSize * 0.5);
          const stretchY = Math.max(0.1, settings.roundness);
          const width = Math.max(1, currentSize * 0.5 * (settings.tipShape === 'square' ? 1.15 : 1));

          return (
            <ellipse
              cx={x}
              cy={y}
              fill={fill}
              fillOpacity={currentOpacity}
              key={`${preset.id}-${index}`}
              rx={width}
              ry={strokeHeight * stretchY}
              transform={`rotate(${settings.angleDeg} ${x} ${y})`}
            />
          );
        })}
      </svg>
      <span className="block truncate">{preset.label}</span>
    </button>
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
      Paint to {tool === 'spongeSaturateBrush' ? 'increase' : 'reduce'} local saturation. Opacity controls strength; Vibrance and Preserve luminosity refine color response.
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
