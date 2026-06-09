import { useState } from 'react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import type { PaperComicSfxDesign, PaperComicSfxPresetId } from '../../lib/paperComicSfx';
import { ComicSfxDesigner } from '../Paper/ComicSfxDesigner';
import {
  buildComicSfxLayerUpdate,
  createComicMangaLayer,
  createComicSfxLayer,
  type ImageComicLayerKind,
} from './ImageComicTools';
import { IMAGE_TEXT_PRESETS, applyImageTextPresetToStyle } from './ImageTextPresets';
import { Slider } from './ImageEditorPropertyControls';

export function TextPanel() {
  const settings = useImageEditorStore((s) => s.textToolSettings);
  const set = useImageEditorStore((s) => s.setTextToolSettings);
  const applyPreset = (presetId: (typeof IMAGE_TEXT_PRESETS)[number]['id']) => {
    set(applyImageTextPresetToStyle(settings, presetId));
  };

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <div>
        <div className="mb-1 text-cyan-100/45">Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {IMAGE_TEXT_PRESETS.map((preset) => (
            <button
              className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-left text-[11px] font-semibold text-cyan-100/65 hover:border-cyan-400/40 hover:text-white"
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block">Content</span>
        <textarea
          className="min-h-24 w-full resize-y rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85 outline-none focus:border-cyan-300/50"
          onChange={(e) => set({ content: e.target.value })}
          value={settings.content}
        />
      </label>
      <label className="block">
        <span className="mb-1 block">Font Family</span>
        <input
          className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85 outline-none focus:border-cyan-300/50"
          onChange={(e) => set({ fontFamily: e.target.value })}
          value={settings.fontFamily}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Slider
          label="Size"
          value={settings.fontSize}
          max={180}
          min={6}
          step={1}
          onChange={(v) => set({ fontSize: v })}
          format={(v) => `${Math.round(v)}px`}
        />
        <Slider
          label="Leading"
          value={settings.lineHeight}
          max={2.5}
          min={0.8}
          step={0.05}
          onChange={(v) => set({ lineHeight: v })}
          format={(v) => `${v.toFixed(2)}x`}
        />
        <Slider
          label="Tracking"
          value={settings.letterSpacing}
          max={40}
          min={-5}
          step={1}
          onChange={(v) => set({ letterSpacing: v })}
          format={(v) => `${Math.round(v)}px`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Box W" value={settings.boxWidth ?? 0} max={1200} min={0} step={10} onChange={(v) => set({ boxWidth: v > 0 ? v : null })} format={(v) => v > 0 ? `${Math.round(v)}px` : 'Auto'} />
        <Slider label="Box H" value={settings.boxHeight ?? 0} max={1200} min={0} step={10} onChange={(v) => set({ boxHeight: v > 0 ? v : null })} format={(v) => v > 0 ? `${Math.round(v)}px` : 'Auto'} />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-16">Color</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent"
          onChange={(e) => set({ color: e.target.value })}
          type="color"
          value={settings.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(e) => set({ color: e.target.value })}
          type="text"
          value={settings.color}
        />
      </div>
      <div>
        <label className="mb-1 block">Weight</label>
        <select
          className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85"
          onChange={(e) => set({ fontWeight: e.target.value })}
          value={settings.fontWeight}
        >
          <option value="300">Light</option>
          <option value="400">Regular</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
          <option value="900">Black</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['normal', 'italic'] as const).map((fontStyle) => (
          <button className={`rounded border px-2 py-1 text-[11px] font-semibold capitalize ${settings.fontStyle === fontStyle ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100' : 'border-cyan-300/10 bg-[#252630] text-cyan-100/55 hover:border-cyan-300/30'}`} key={fontStyle} onClick={() => set({ fontStyle })} type="button">{fontStyle}</button>
        ))}
        <button className={`rounded border px-2 py-1 text-[11px] font-semibold ${settings.wrap ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100' : 'border-cyan-300/10 bg-[#252630] text-cyan-100/55 hover:border-cyan-300/30'}`} onClick={() => set({ wrap: !settings.wrap })} type="button">Wrap</button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['left', 'center', 'right', 'justify'] as const).map((align) => (
          <button
            className={`rounded border px-2 py-1 text-[11px] font-semibold capitalize ${
              settings.align === align
                ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
                : 'border-cyan-300/10 bg-[#252630] text-cyan-100/55 hover:border-cyan-300/30'
            }`}
            key={align}
            onClick={() => set({ align })}
            type="button"
          >
            {align}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['top', 'middle', 'bottom'] as const).map((verticalAlign) => (
          <button className={`rounded border px-2 py-1 text-[11px] font-semibold capitalize ${settings.verticalAlign === verticalAlign ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100' : 'border-cyan-300/10 bg-[#252630] text-cyan-100/55 hover:border-cyan-300/30'}`} key={verticalAlign} onClick={() => set({ verticalAlign })} type="button">{verticalAlign}</button>
        ))}
      </div>
      <select className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1.5 text-xs text-cyan-100/85" onChange={(e) => set({ warp: e.target.value as 'none' | 'arc' | 'flag' })} value={settings.warp}>
        <option value="none">No warp</option>
        <option value="arc">Arc warp</option>
        <option value="flag">Flag warp</option>
      </select>
      <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
        Click the canvas to place the configured multiline text as a new raster text layer.
      </p>
    </div>
  );
}

export function ComicMangaPanel() {
  const activeDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const [sfxDesignerPreset, setSfxDesignerPreset] = useState<PaperComicSfxPresetId | null>(null);
  const [editingSfxLayerId, setEditingSfxLayerId] = useState<string | null>(null);
  const activeLayer = activeDoc?.layers.find((layer) => layer.id === activeDoc.activeLayerId) ?? null;
  const activeSfxDesign = activeLayer?.metadata?.comicSfxDesign ?? null;

  const addComicLayer = (kind: ImageComicLayerKind) => {
    if (!activeDoc) return;
    const before = activeDoc.layers;
    const layer = createComicMangaLayer(activeDoc, kind);
    addLayer(activeDoc.id, layer);
    const after = useImageEditorStore.getState()
      .documents.find((doc) => doc.id === activeDoc.id)?.layers;
    if (!after) return;
    pushOperation({
      kind: 'layerOp',
      docId: activeDoc.id,
      before,
      after,
    });
  };

  const addSfxLayer = (design: PaperComicSfxDesign) => {
    if (!activeDoc) return;
    const before = activeDoc.layers;
    if (editingSfxLayerId) {
      const layer = activeDoc.layers.find((candidate) => candidate.id === editingSfxLayerId);
      if (!layer) {
        setEditingSfxLayerId(null);
        setSfxDesignerPreset(null);
        return;
      }
      updateLayer(activeDoc.id, layer.id, buildComicSfxLayerUpdate(activeDoc, layer, design));
    } else {
      const layer = createComicSfxLayer(activeDoc, design);
      addLayer(activeDoc.id, layer);
    }
    const after = useImageEditorStore.getState()
      .documents.find((doc) => doc.id === activeDoc.id)?.layers;
    if (after) {
      pushOperation({
        kind: 'layerOp',
        docId: activeDoc.id,
        before,
        after,
      });
    }
    setEditingSfxLayerId(null);
    setSfxDesignerPreset(null);
  };

  return (
    <div className="mt-3 space-y-2 rounded border border-cyan-300/10 bg-[#10131b] p-2 text-xs text-cyan-100/60">
      <div className="font-semibold uppercase tracking-[0.16em] text-cyan-100/45">Comic / Manga</div>
      <div className="grid grid-cols-2 gap-1">
        <ComicButton disabled={!activeDoc} label="Speech" onClick={() => addComicLayer('speechBubble')} />
        <ComicButton disabled={!activeDoc} label="Thought" onClick={() => addComicLayer('thoughtBubble')} />
        <ComicButton disabled={!activeDoc} label="Caption" onClick={() => addComicLayer('caption')} />
        <ComicButton disabled={!activeDoc} label="Panel" onClick={() => addComicLayer('panelBorder')} />
        <ComicButton disabled={!activeDoc} label="Speed Lines" onClick={() => addComicLayer('mangaSpeedLine')} wide />
        <ComicButton disabled={!activeDoc} label="SFX Designer" onClick={() => setSfxDesignerPreset('bang')} wide />
        <ComicButton
          disabled={!activeDoc || !activeSfxDesign || !activeLayer}
          label="Edit Selected SFX"
          onClick={() => {
            if (!activeLayer || !activeSfxDesign) return;
            setEditingSfxLayerId(activeLayer.id);
            setSfxDesignerPreset(activeSfxDesign.presetId);
          }}
          wide
        />
      </div>
      {sfxDesignerPreset ? (
        <ComicSfxDesigner
          initialDesign={editingSfxLayerId && activeSfxDesign ? activeSfxDesign : undefined}
          initialPresetId={sfxDesignerPreset}
          onClose={() => {
            setEditingSfxLayerId(null);
            setSfxDesignerPreset(null);
          }}
          onPlace={addSfxLayer}
          placeLabel={editingSfxLayerId ? 'Update Layer' : 'Place Layer'}
        />
      ) : null}
    </div>
  );
}

export function ComicButton({
  disabled,
  label,
  onClick,
  wide,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      className={`rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-left text-[11px] font-semibold text-cyan-100/65 hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${wide ? 'col-span-2' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function ShapePanel() {
  const settings = useImageEditorStore((s) => s.brushSettings);
  const set = useImageEditorStore((s) => s.setBrushSettings);

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <Slider
        label="Opacity"
        value={settings.opacity}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ opacity: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <div className="flex items-center gap-2">
        <label className="w-16">Fill</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent"
          onChange={(e) => set({ color: e.target.value })}
          type="color"
          value={settings.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(e) => set({ color: e.target.value })}
          type="text"
          value={settings.color}
        />
      </div>
      <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
        Drag to draw a filled raster shape on the active layer.
      </p>
    </div>
  );
}

export function GradientPanel() {
  const settings = useImageEditorStore((s) => s.brushSettings);
  const set = useImageEditorStore((s) => s.setBrushSettings);

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <Slider
        label="Opacity"
        value={settings.opacity}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => set({ opacity: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <div className="flex items-center gap-2">
        <label className="w-16">Color</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent"
          onChange={(e) => set({ color: e.target.value })}
          type="color"
          value={settings.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(e) => set({ color: e.target.value })}
          type="text"
          value={settings.color}
        />
      </div>
      <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
        Drag to apply a foreground-to-transparent linear gradient on the active layer.
      </p>
    </div>
  );
}

export function PaintBucketPanel() {
  const settings = useImageEditorStore((s) => s.brushSettings);
  const selectionSettings = useImageEditorStore((s) => s.selectionToolSettings);
  const setBrush = useImageEditorStore((s) => s.setBrushSettings);
  const setSelection = useImageEditorStore((s) => s.setSelectionToolSettings);

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <Slider
        label="Tolerance"
        value={selectionSettings.magicWandTolerance}
        max={255}
        min={0}
        step={1}
        onChange={(v) => setSelection({ magicWandTolerance: v })}
        format={(v) => `${Math.round(v)}`}
      />
      <Slider
        label="Opacity"
        value={settings.opacity}
        max={1}
        min={0}
        step={0.01}
        onChange={(v) => setBrush({ opacity: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <div className="flex items-center gap-2">
        <label className="w-16">Color</label>
        <input
          className="h-6 w-12 cursor-pointer rounded border border-cyan-300/10 bg-transparent"
          onChange={(e) => setBrush({ color: e.target.value })}
          type="color"
          value={settings.color}
        />
        <input
          className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
          onChange={(e) => setBrush({ color: e.target.value })}
          type="text"
          value={settings.color}
        />
      </div>
      <p className="rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[11px] text-cyan-100/45">
        Click a contiguous color area to fill it. Tolerance shares the Magic Wand setting.
      </p>
    </div>
  );
}
