import {
  ChevronDown,
  Circle,
  CircleOff,
  Copy,
  Layers as LayersIcon,
  Plus,
  RefreshCcw,
  Scissors,
  ShieldPlus,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { createEmptyLayer, flattenDocument, mergeLayersDown, mergeVisibleLayers } from './LayerOps';
import { createAdjustmentLayer, renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import { loadSourceLinkedLayerBitmap, markSourceLinkedLayerMissing, replaceSourceLinkedLayerBitmap } from './ImageSourceDocument';
import { addImageDocumentSnapshot, deleteImageDocumentSnapshot, restoreImageDocumentSnapshot } from './ImageSnapshots';
import { updateTextLayerFromStyle } from './ImageTextLayer';
import { applyImageTextPresetToLayer } from './ImageTextPresets';
import { copyImageLayerStyle, pasteImageLayerStyle, type ImageLayerStyleClipboard } from './ImageLayerStyleClipboard';
import { renderLayerWithEffects } from './ImageLayerEffects';
import { SharedContextMenu } from '../Common/SharedContextMenu';
import { getKeyboardShortcutLabel } from '../../lib/keyboardShortcuts';
import { useSettingsStore } from '../../store/settingsStore';
import {
  applyLayerMaskToLayer,
  createHideAllLayerMask,
  createLayerMaskFromSelection,
  createRevealAllLayerMask,
  invertLayerMask,
} from './LayerMaskOps';
import { getSelection } from './selectionRegistry';
import {
  ActionButton,
  AddMenuItem,
  AdjustmentLayerControls,
  EditableTextLayerControls,
  LayerEffectsControls,
  LayerFiltersControls,
  LayerRow,
  LayerSourceFormatBadges,
  MaskActionButton,
  SnapshotsControls,
  SourceLinkedLayerControls,
} from './ImageEditorLayersPanelControls';
import type {
  AdjustmentLayerKind,
  BlendMode,
  ImageDocument,
  ImageLayer,
  LayerType,
} from '../../types/imageEditor';

const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export function ImageEditorLayersPanel() {
  const activeDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1a1b23] p-3 text-xs text-cyan-100/40">
        No document open
      </div>
    );
  }

  return <LayersPanelInner doc={activeDoc} />;
}

function LayersPanelInner({ doc }: { doc: ImageDocument }) {
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);
  const setActiveLayer = useImageEditorStore((s) => s.setActiveLayer);
  const setLayers = useImageEditorStore((s) => s.setLayers);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const sourceBins = useSourceBinStore((s) => s.bins);
  const setSourceSidebarOpen = useSourceBinStore((s) => s.setSidebarOpen);
  const keyboardShortcuts = useSettingsStore((s) => s.keyboardShortcuts);

  // Layers in display order — top of stack first.
  const visualLayers = useMemo(() => [...doc.layers].reverse(), [doc.layers]);
  const activeLayer = useMemo(
    () => doc.layers.find((l) => l.id === doc.activeLayerId) ?? null,
    [doc.layers, doc.activeLayerId],
  );
  const sourceItems = useMemo(() => sourceBins.flatMap((bin) => bin.items), [sourceBins]);

  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [styleClipboard, setStyleClipboard] = useState<ImageLayerStyleClipboard | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const commitActiveLayer = (nextLayer: ImageLayer) => {
    if (!activeLayer) return;
    commitLayer(activeLayer.id, nextLayer);
  };

  const commitLayer = (layerId: string, nextLayer: ImageLayer) => {
    if (!doc.layers.some((candidate) => candidate.id === layerId)) return;
    const before = doc.layers;
    const after = doc.layers.map((layer) =>
      layer.id === layerId ? nextLayer : layer,
    );
    pushOperation({
      kind: 'layerOp',
      docId: doc.id,
      before,
      after,
    });
    updateLayer(doc.id, layerId, nextLayer);
  };

  const addLayerUndoable = (layer: ImageLayer) => {
    const before = doc.layers;
    addLayer(doc.id, layer);
    const after = useImageEditorStore.getState().documents.find((d) => d.id === doc.id)?.layers;
    if (!after) return;
    pushOperation({ kind: 'layerOp', docId: doc.id, before, after });
  };

  const handleAdd = (type: LayerType) => {
    addLayerUndoable(createEmptyLayer(doc, type));
    setShowAddMenu(false);
  };

  const handleAddAdjustment = (kind: AdjustmentLayerKind) => {
    addLayerUndoable(createAdjustmentLayer(doc, kind));
    setShowAddMenu(false);
  };

  const handleDuplicate = () => {
    if (activeLayer) duplicateLayer(doc.id, activeLayer.id);
  };

  const handleDelete = () => {
    if (activeLayer) removeLayer(doc.id, activeLayer.id);
  };

  const handleMergeDown = () => {
    if (!activeLayer) return;
    handleMergeDownLayer(activeLayer);
  };

  const handleMergeDownLayer = (layer: ImageLayer) => {
    const idx = doc.layers.findIndex((l) => l.id === layer.id);
    if (idx <= 0) return;
    const lower = doc.layers[idx - 1];
    const merged = mergeLayersDown(doc, layer, lower);
    addLayer(doc.id, merged, idx - 1);
    removeLayer(doc.id, layer.id);
    removeLayer(doc.id, lower.id);
  };

  const handleFlatten = () => {
    if (doc.layers.length < 2) return;
    const flat = flattenDocument(doc);
    const ids = doc.layers.map((l) => l.id);
    addLayer(doc.id, flat, 0);
    for (const id of ids) removeLayer(doc.id, id);
  };

  const handleMergeVisible = () => {
    const visibleCount = doc.layers.filter((l) => l.visible).length;
    if (visibleCount < 2) return;
    const beforeLayers = doc.layers;
    const mergedDoc = mergeVisibleLayers(doc);
    setLayers(doc.id, mergedDoc.layers, mergedDoc.activeLayerId);
    pushOperation({
      kind: 'layerOp',
      docId: doc.id,
      before: beforeLayers,
      after: mergedDoc.layers,
    });
  };

  const handleMaskFromSelection = () => {
    if (!activeLayer || activeLayer.locked) return;
    const selection = getSelection(doc.id);
    if (!selection) return;
    commitActiveLayer({
      ...activeLayer,
      mask: createLayerMaskFromSelection(doc, activeLayer, selection, 'reveal-selection'),
    });
  };

  const handleRevealAllMask = () => {
    if (!activeLayer || activeLayer.locked) return;
    commitActiveLayer({
      ...activeLayer,
      mask: createRevealAllLayerMask(doc, activeLayer),
    });
  };

  const handleHideAllMask = () => {
    if (!activeLayer || activeLayer.locked) return;
    commitActiveLayer({
      ...activeLayer,
      mask: createHideAllLayerMask(doc, activeLayer),
    });
  };

  const handleInvertMask = () => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    commitActiveLayer({
      ...activeLayer,
      mask: invertLayerMask(activeLayer.mask),
    });
  };

  const handleApplyMask = () => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    commitActiveLayer(applyLayerMaskToLayer(activeLayer));
  };

  const handleDeleteMask = () => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    commitActiveLayer({
      ...activeLayer,
      mask: null,
    });
  };

  const handleUpdateSourceLinkedLayer = async () => {
    const sourceId = activeLayer?.metadata?.smartLinkedSourceId;
    if (!activeLayer || activeLayer.locked || !sourceId) return;
    const item = sourceItems.find((candidate) => candidate.id === sourceId);
    if (!item) {
      commitActiveLayer(markSourceLinkedLayerMissing(activeLayer));
      return;
    }
    const bitmap = await loadSourceLinkedLayerBitmap(item);
    commitActiveLayer(replaceSourceLinkedLayerBitmap(activeLayer, item, bitmap));
  };

  const handleRelinkSourceLinkedLayer = async (sourceId: string) => {
    if (!activeLayer || activeLayer.locked || !sourceId) return;
    const item = sourceItems.find((candidate) => candidate.id === sourceId);
    if (!item) return;
    const bitmap = await loadSourceLinkedLayerBitmap(item);
    commitActiveLayer(replaceSourceLinkedLayerBitmap(activeLayer, item, bitmap));
  };

  const commitDocumentState = (nextDoc: ImageDocument) => {
    const before = doc;
    useImageEditorStore.setState((state) => ({
      documents: state.documents.map((candidate) => candidate.id === doc.id ? nextDoc : candidate),
    }));
    pushOperation({ kind: 'documentState', docId: doc.id, before, after: nextDoc });
  };

  const handleDragStart = (layerId: string) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragLayerId(layerId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnLayer = (overLayerId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragLayerId || dragLayerId === overLayerId) {
      setDragLayerId(null);
      return;
    }
    const overIdx = doc.layers.findIndex((l) => l.id === overLayerId);
    reorderLayer(doc.id, dragLayerId, overIdx);
    setDragLayerId(null);
  };

  const contextLayer = layerMenu ? doc.layers.find((layer) => layer.id === layerMenu.layerId) ?? null : null;
  const handleOpenLayerMenu = (event: React.MouseEvent<HTMLElement>, layerId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(doc.id, layerId);
    setLayerMenu({ x: event.clientX, y: event.clientY, layerId });
  };

  const handleRasterizeLayer = (layer: ImageLayer) => {
    if (layer.locked) return;
    commitLayer(layer.id, rasterizeImageLayer(doc, layer));
  };

  return (
    <div className="flex h-full flex-col bg-[#1a1b23]">
      <div className="flex items-center justify-between border-b border-cyan-300/10 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-100/70">
          <LayersIcon size={12} /> Layers
        </span>
        <div className="relative">
          <button
            className="flex items-center gap-0.5 rounded p-0.5 text-cyan-100/40 hover:text-white"
            onClick={() => setShowAddMenu((v) => !v)}
            title="Add layer"
            type="button"
          >
            <Plus size={14} />
            <ChevronDown size={10} />
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-cyan-300/10 bg-[#252630] py-1 shadow-2xl">
              <AddMenuItem label="Image" onClick={() => handleAdd('image')} />
              <AddMenuItem label="Mask" onClick={() => handleAdd('mask')} />
              <AddMenuItem label="Text" onClick={() => handleAdd('text')} />
              <AddMenuItem label="Adjustment" onClick={() => handleAdd('adjustment')} />
              <AddMenuItem label="Levels" onClick={() => handleAddAdjustment('levels')} />
              <AddMenuItem label="Curves" onClick={() => handleAddAdjustment('curves')} />
            </div>
          )}
        </div>
      </div>

      {activeLayer && (
        <div className="border-b border-cyan-300/10 px-3 py-2 text-xs text-cyan-100/50">
          <div className="mb-2 flex items-center gap-2">
            <label className="w-12 text-cyan-100/40">Mode</label>
            <select
              className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
              onChange={(e) =>
                updateLayer(doc.id, activeLayer.id, { blendMode: e.target.value as BlendMode })
              }
              value={activeLayer.blendMode}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-12 text-cyan-100/40">Opacity</label>
            <input
              className="flex-1 cursor-pointer accent-cyan-400"
              max={1}
              min={0}
              onChange={(e) =>
                updateLayer(doc.id, activeLayer.id, { opacity: parseFloat(e.target.value) })
              }
              step={0.01}
              type="range"
              value={activeLayer.opacity}
            />
            <span className="w-8 text-right text-[11px] text-cyan-100/40">
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>
          {activeLayer.type === 'adjustment' && activeLayer.adjustment ? (
            <AdjustmentLayerControls
              adjustment={activeLayer.adjustment}
              disabled={activeLayer.locked}
              onChange={(adjustment) => commitActiveLayer({ ...activeLayer, adjustment })}
            />
          ) : null}
          {activeLayer.type === 'text' || activeLayer.metadata?.editableText ? (
            <EditableTextLayerControls
              disabled={activeLayer.locked}
              layer={activeLayer}
              onApplyPreset={(presetId) => commitActiveLayer(applyImageTextPresetToLayer(activeLayer, presetId))}
              onChange={(patch) => commitActiveLayer(updateTextLayerFromStyle(activeLayer, patch))}
            />
          ) : null}
          {activeLayer.metadata?.smartLinkedSourceId ? (
            <SourceLinkedLayerControls
              disabled={activeLayer.locked}
              layer={activeLayer}
              sourceExists={sourceItems.some((item) => item.id === activeLayer.metadata?.smartLinkedSourceId)}
              sourceItems={sourceItems.filter((item) => item.kind === 'image' && item.assetUrl)}
              onRelink={handleRelinkSourceLinkedLayer}
              onReveal={() => setSourceSidebarOpen(true)}
              onUpdate={handleUpdateSourceLinkedLayer}
            />
          ) : null}
          {activeLayer.metadata?.sourceFormat || activeLayer.metadata?.sourceWarnings?.length ? (
            <LayerSourceFormatBadges layer={activeLayer} />
          ) : null}
          {activeLayer.bitmap ? (
            <>
              <LayerFiltersControls
                disabled={activeLayer.locked}
                filters={activeLayer.filters ?? []}
                onChange={(filters) => updateLayer(doc.id, activeLayer.id, { filters })}
              />
              <LayerEffectsControls
                disabled={activeLayer.locked}
                effects={activeLayer.effects ?? []}
                onChange={(effects) => updateLayer(doc.id, activeLayer.id, { effects })}
              />
            </>
          ) : null}
          <div className="mt-2 border-t border-cyan-300/10 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-cyan-100/40">Mask</label>
              <span className="text-[10px] uppercase tracking-wide text-cyan-100/30">
                {activeLayer.mask ? 'Active' : 'None'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <MaskActionButton
                disabled={!doc.hasSelection || activeLayer.locked}
                icon={<ShieldPlus size={12} />}
                label="From Sel"
                onClick={handleMaskFromSelection}
              />
              <MaskActionButton
                disabled={activeLayer.locked}
                icon={<Circle size={12} />}
                label="Reveal"
                onClick={handleRevealAllMask}
              />
              <MaskActionButton
                disabled={activeLayer.locked}
                icon={<CircleOff size={12} />}
                label="Hide"
                onClick={handleHideAllMask}
              />
              <MaskActionButton
                disabled={!activeLayer.mask || activeLayer.locked}
                icon={<RefreshCcw size={12} />}
                label="Invert"
                onClick={handleInvertMask}
              />
              <MaskActionButton
                disabled={!activeLayer.mask || activeLayer.locked}
                icon={<Scissors size={12} />}
                label="Apply"
                onClick={handleApplyMask}
              />
              <MaskActionButton
                disabled={!activeLayer.mask || activeLayer.locked}
                icon={<ShieldX size={12} />}
                label="Delete"
                onClick={handleDeleteMask}
              />
            </div>
          </div>
          <SnapshotsControls
            doc={doc}
            onDelete={(snapshotId) => commitDocumentState(deleteImageDocumentSnapshot(doc, snapshotId))}
            onNew={() => commitDocumentState(addImageDocumentSnapshot(doc))}
            onRestore={(snapshotId) => commitDocumentState(restoreImageDocumentSnapshot(doc, snapshotId))}
          />
        </div>
      )}

      <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
        {visualLayers.map((layer) => (
          <LayerRow
            key={layer.id}
            active={layer.id === doc.activeLayerId}
            dragging={layer.id === dragLayerId}
            layer={layer}
            onClick={() => setActiveLayer(doc.id, layer.id)}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart(layer.id)}
            onDrop={handleDropOnLayer(layer.id)}
            onOpenMenu={handleOpenLayerMenu}
            onRename={(name) => updateLayer(doc.id, layer.id, { name })}
            onToggleLocked={() =>
              updateLayer(doc.id, layer.id, { locked: !layer.locked })
            }
            onToggleVisible={() =>
              updateLayer(doc.id, layer.id, { visible: !layer.visible })
            }
          />
        ))}
        {visualLayers.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-cyan-100/30">No layers</div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-cyan-300/10 px-2 py-1.5">
        <ActionButton
          disabled={!activeLayer}
          icon={<Copy size={12} />}
          label="Duplicate"
          onClick={handleDuplicate}
        />
        <ActionButton
          disabled={!activeLayer}
          icon={<Trash2 size={12} />}
          label="Delete"
          onClick={handleDelete}
        />
        <ActionButton
          disabled={
            !activeLayer || doc.layers.findIndex((l) => l.id === activeLayer?.id) <= 0
          }
          icon={<span className="text-[10px]">↓</span>}
          label="Merge Down"
          onClick={handleMergeDown}
        />
        <ActionButton
          disabled={doc.layers.length < 2}
          icon={<span className="text-[10px]">≡</span>}
          label="Flatten"
          onClick={handleFlatten}
        />
        <ActionButton
          disabled={doc.layers.filter((l) => l.visible).length < 2}
          icon={<span className="text-[10px]">👁≡</span>}
          label="Merge Visible"
          onClick={handleMergeVisible}
        />
      </div>
      {layerMenu && contextLayer ? (
        <SharedContextMenu
          ariaLabel="Layer actions"
          items={[
            {
              id: 'copy-layer-style',
              label: 'Copy Layer Style',
              action: () => setStyleClipboard(copyImageLayerStyle(contextLayer)),
            },
            {
              id: 'paste-layer-style',
              label: 'Paste Layer Style',
              disabled: !styleClipboard || contextLayer.locked,
              action: () => {
                if (styleClipboard) commitLayer(contextLayer.id, pasteImageLayerStyle(contextLayer, styleClipboard));
              },
            },
            {
              id: 'rasterize-layer',
              label: 'Rasterize Layer',
              disabled: contextLayer.locked,
              action: () => handleRasterizeLayer(contextLayer),
            },
            {
              id: 'duplicate-layer',
              label: 'Duplicate Layer',
              action: () => duplicateLayer(doc.id, contextLayer.id),
            },
            {
              id: 'merge-down',
              label: 'Merge Down',
              disabled: doc.layers.findIndex((layer) => layer.id === contextLayer.id) <= 0,
              action: () => handleMergeDownLayer(contextLayer),
            },
            {
              id: 'flatten-document',
              label: 'Flatten Document',
              disabled: doc.layers.length < 2,
              action: handleFlatten,
            },
            {
              id: 'merge-visible',
              label: 'Merge Visible',
              disabled: doc.layers.filter((layer) => layer.visible).length < 2,
              action: handleMergeVisible,
            },
            {
              id: 'delete-layer',
              label: 'Delete Layer',
              shortcut: getKeyboardShortcutLabel('edit:delete', keyboardShortcuts),
              tone: 'danger',
              action: () => removeLayer(doc.id, contextLayer.id),
            },
          ]}
          onClose={() => setLayerMenu(null)}
          title={contextLayer.name}
          x={layerMenu.x}
          y={layerMenu.y}
        />
      ) : null}
    </div>
  );
}

function rasterizeImageLayer(doc: ImageDocument, layer: ImageLayer): ImageLayer {
  if (layer.type === 'adjustment') {
    const index = doc.layers.findIndex((candidate) => candidate.id === layer.id);
    const bitmap = renderImageDocumentLayersToBitmap({
      ...doc,
      layers: index >= 0 ? doc.layers.slice(0, index + 1) : doc.layers,
    });
    return {
      ...layer,
      type: 'image',
      name: `${layer.name} rasterized`,
      x: 0,
      y: 0,
      bitmap,
      bitmapVersion: layer.bitmapVersion + 1,
      adjustment: undefined,
      effects: [],
      filters: [],
      mask: null,
    };
  }

  const rendered = renderLayerWithEffects(layer);
  return {
    ...layer,
    type: 'image',
    name: layer.type === 'image' ? layer.name : `${layer.name} rasterized`,
    x: layer.x + (rendered?.offsetX ?? 0),
    y: layer.y + (rendered?.offsetY ?? 0),
    bitmap: rendered?.bitmap ?? layer.bitmap,
    bitmapVersion: layer.bitmapVersion + 1,
    text: undefined,
    adjustment: undefined,
    effects: [],
    filters: [],
    mask: null,
  };
}
