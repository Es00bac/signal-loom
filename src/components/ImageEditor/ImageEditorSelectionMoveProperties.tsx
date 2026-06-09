import { useImageEditorStore } from '../../store/imageEditorStore';
import type { SelectionMode } from '../../types/imageEditor';
import { Field, Slider } from './ImageEditorPropertyControls';

const SELECTION_MODES: { mode: SelectionMode; label: string }[] = [
  { mode: 'replace', label: 'New' },
  { mode: 'add', label: '+' },
  { mode: 'subtract', label: '−' },
  { mode: 'intersect', label: '∩' },
];

export function SelectionPanel({ showShape, showTolerance }: { showShape?: boolean; showTolerance?: boolean }) {
  const settings = useImageEditorStore((s) => s.selectionToolSettings);
  const set = useImageEditorStore((s) => s.setSelectionToolSettings);
  const tool = useImageEditorStore((s) => s.tool);

  return (
    <div className="space-y-3 text-xs text-cyan-100/60">
      <div>
        <label className="mb-1 block">Mode</label>
        <div className="flex gap-1">
          {SELECTION_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              className={`flex-1 rounded border px-2 py-1 text-xs ${
                settings.mode === mode
                  ? 'border-cyan-400 bg-cyan-400/20 text-cyan-50'
                  : 'border-cyan-300/10 bg-[#252630] text-cyan-100/60 hover:border-cyan-400/40'
              }`}
              onClick={() => set({ mode })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {showShape && tool === 'marquee' && (
        <div>
          <label className="mb-1 block">Shape</label>
          <div className="flex gap-1">
            {(['rectangle', 'ellipse'] as const).map((shape) => (
              <button
                key={shape}
                className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
                  settings.marqueeShape === shape
                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-50'
                    : 'border-cyan-300/10 bg-[#252630] text-cyan-100/60 hover:border-cyan-400/40'
                }`}
                onClick={() => set({ marqueeShape: shape })}
                type="button"
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      )}
      {showShape && tool === 'lasso' && (
        <div>
          <label className="mb-1 block">Lasso</label>
          <div className="flex gap-1">
            {(['freehand', 'polygonal'] as const).map((shape) => (
              <button
                key={shape}
                className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
                  settings.lassoShape === shape
                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-50'
                    : 'border-cyan-300/10 bg-[#252630] text-cyan-100/60 hover:border-cyan-400/40'
                }`}
                onClick={() => set({ lassoShape: shape })}
                type="button"
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      )}
      <Slider
        label="Feather"
        value={settings.feather}
        max={64}
        min={0}
        step={1}
        onChange={(v) => set({ feather: v })}
        format={(v) => `${Math.round(v)}px`}
      />
      <div className="flex items-center gap-2">
        <input
          checked={settings.antiAlias}
          id="anti-alias"
          onChange={(e) => set({ antiAlias: e.target.checked })}
          type="checkbox"
        />
        <label htmlFor="anti-alias">Anti-alias</label>
      </div>
      {showTolerance && (
        <Slider
          label="Tolerance"
          value={settings.magicWandTolerance}
          max={255}
          min={0}
          step={1}
          onChange={(v) => set({ magicWandTolerance: v })}
          format={(v) => `${Math.round(v)}`}
        />
      )}
    </div>
  );
}

export function MovePanel() {
  const activeDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const layer = activeDoc?.layers.find((l) => l.id === activeDoc.activeLayerId) ?? null;
  if (!layer) {
    return <p className="text-xs text-cyan-100/40">Select a layer to move it.</p>;
  }
  const setRotation = (rotationDeg: number) => {
    if (!activeDoc || !layer || layer.locked) return;
    const before = { x: layer.x, y: layer.y, rotationDeg: layer.rotationDeg ?? 0 };
    const after = { ...before, rotationDeg: normalizeLayerRotation(rotationDeg) };
    updateLayer(activeDoc.id, layer.id, { rotationDeg: after.rotationDeg });
    pushOperation({
      kind: 'transform',
      docId: activeDoc.id,
      layerId: layer.id,
      before,
      after,
    });
  };
  return (
    <div className="space-y-2 text-xs text-cyan-100/60">
      <div className="flex gap-2">
        <Field label="X" value={Math.round(layer.x)} />
        <Field label="Y" value={Math.round(layer.y)} />
      </div>
      <div className="flex gap-2">
        <Field label="W" value={layer.bitmap?.width ?? 0} />
        <Field label="H" value={layer.bitmap?.height ?? 0} />
      </div>
      <div>
        <label className="mb-1 flex items-center justify-between">
          <span>Rotation</span>
          <span className="text-cyan-100/40">{Math.round(layer.rotationDeg ?? 0)}deg</span>
        </label>
        <div className="grid grid-cols-4 gap-1">
          <MoveActionButton disabled={layer.locked} onClick={() => setRotation((layer.rotationDeg ?? 0) - 15)}>−15</MoveActionButton>
          <MoveActionButton disabled={layer.locked} onClick={() => setRotation((layer.rotationDeg ?? 0) + 15)}>+15</MoveActionButton>
          <MoveActionButton disabled={layer.locked} onClick={() => setRotation((layer.rotationDeg ?? 0) - 90)}>−90</MoveActionButton>
          <MoveActionButton disabled={layer.locked} onClick={() => setRotation(0)}>Reset</MoveActionButton>
        </div>
        <input
          className="mt-2 w-full cursor-pointer accent-cyan-400"
          disabled={layer.locked}
          max={180}
          min={-180}
          onChange={(event) => setRotation(Number(event.target.value))}
          step={1}
          type="range"
          value={normalizeSignedRotation(layer.rotationDeg ?? 0)}
        />
      </div>
      <p className="text-cyan-100/30">
        Drag on the canvas to move the active layer. Use rotation controls for comic panel angles and manga action elements.
      </p>
    </div>
  );
}

export function MoveActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-1 text-[11px] font-semibold text-cyan-100/65 hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function normalizeLayerRotation(rotationDeg: number): number {
  if (!Number.isFinite(rotationDeg)) return 0;
  return Math.round((((rotationDeg % 360) + 360) % 360) * 100) / 100;
}

function normalizeSignedRotation(rotationDeg: number): number {
  const normalized = normalizeLayerRotation(rotationDeg);
  return normalized > 180 ? normalized - 360 : normalized;
}
