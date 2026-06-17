import {
  ChevronDown,
  Circle,
  CircleOff,
  Copy,
  Layers as LayersIcon,
  Plus,
  RefreshCcw,
  Search,
  Scissors,
  ShieldPlus,
  ShieldX,
  SquareDashed,
  X,
  Trash2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useDockExpandToContent } from '../DockablePanel/dockExpandContext';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { createEmptyLayer, flattenDocument, mergeLayersDown, mergeVisibleLayers } from './LayerOps';
import { createAdjustmentLayer, renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import { buildAdjustmentLayerHistogram } from './ImageAdjustmentHistogram';
import { loadSourceLinkedLayerBitmap, markSourceLinkedLayerMissing, replaceSourceLinkedLayerBitmap } from './ImageSourceDocument';
import { attachTextLayerToVectorPath, updateTextLayerFromStyle } from './ImageTextLayer';
import { applyImageTextPresetToLayer } from './ImageTextPresets';
import { copyImageLayerStyle, pasteImageLayerStyle, type ImageLayerStyleClipboard } from './ImageLayerStyleClipboard';
import { renderLayerWithEffects } from './ImageLayerEffects';
import {
  describeImageLayerGroupHierarchyReadiness,
  getImageLayerGroupOptions,
  getImageLayerPanelRows,
  isImageLayerGroup,
  setImageLayerGroup,
} from './ImageLayerGroups';
import {
  IMAGE_LAYER_COLOR_LABELS,
  IMAGE_LAYER_TYPE_FILTERS,
  countActiveImageLayerPanelFilters,
  describeImageLayerOrganizationParityReadiness,
  filterImageLayersForPanel,
  imageLayerColorLabelById,
  type ImageLayerPanelColorFilter,
  type ImageLayerPanelLockFilter,
  type ImageLayerPanelSourceFilter,
  type ImageLayerPanelTypeFilter,
  type ImageLayerPanelVisibilityFilter,
} from './ImageLayerOrganization';
import { rangeLayerSelection, resolveSelectedLayerIds } from './ImageGroupTransform';
import { SharedContextMenu } from '../Common/SharedContextMenu';
import { getKeyboardShortcutLabel } from '../../lib/keyboardShortcuts';
import { canEditImageLayerPixels, setImageLayerLockVariant, type ImageLayerLockKey } from '../../lib/imageLayerLocks';
import {
  isImageLayerLinked,
  linkImageLayers,
  unlinkImageLayer,
} from '../../lib/imageLayerLinks';
import { useSettingsStore } from '../../store/settingsStore';
import {
  applyLayerMaskToLayer,
  createHideAllLayerMask,
  createLayerMaskFromSelection,
  createRevealAllLayerMask,
  invertLayerMask,
} from './LayerMaskOps';
import {
  clampImageLayerMaskDensity,
  clampImageLayerMaskFeather,
} from './ImageLayerMask';
import { getSelection } from './selectionRegistry';
import {
  ActionButton,
  AddMenuItem,
  AdjustmentLayerControls,
  EditableTextLayerControls,
  EditableVectorShapeLayerControls,
  LayerEffectsControls,
  LayerFiltersControls,
  LayerRow,
  LayerSourceFormatBadges,
  MaskActionButton,
  SourceLinkedLayerControls,
} from './ImageEditorLayersPanelControls';
import {
  convertEditableVectorShapeLayerToPath,
  getEditableVectorShape,
  isEditableVectorShapeLayer,
  materializeImageVectorBooleanLayers,
  rasterizeEditableVectorShapeLayer,
  updateEditableVectorShapeLayer,
} from './ImageVectorShape';
import type { ImageVectorBooleanOperation } from './ImageVectorBooleans';
import type {
  AdjustmentLayerKind,
  BlendMode,
  ImageDocument,
  ImageLayerColorLabel,
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

const VECTOR_BOOLEAN_OPERATIONS: Array<{ operation: ImageVectorBooleanOperation; label: string }> = [
  { operation: 'union', label: 'Union' },
  { operation: 'intersect', label: 'Intersect' },
  { operation: 'subtract', label: 'Subtract' },
  { operation: 'xor', label: 'Xor' },
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
  const expandToContent = useDockExpandToContent();
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);
  const setActiveLayer = useImageEditorStore((s) => s.setActiveLayer);
  const setActiveLayerEditTarget = useImageEditorStore((s) => s.setActiveLayerEditTarget);
  const toggleLayerSelection = useImageEditorStore((s) => s.toggleLayerSelection);
  const setSelectedLayers = useImageEditorStore((s) => s.setSelectedLayers);
  const setLayers = useImageEditorStore((s) => s.setLayers);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const sourceBins = useSourceBinStore((s) => s.bins);
  const setSourceSidebarOpen = useSourceBinStore((s) => s.setSidebarOpen);
  const keyboardShortcuts = useSettingsStore((s) => s.keyboardShortcuts);

  // Layers in display order — top of stack first.
  const visualLayers = useMemo(() => [...doc.layers].reverse(), [doc.layers]);
  const visualLayerRows = useMemo(() => getImageLayerPanelRows(visualLayers), [visualLayers]);
  const activeLayer = useMemo(
    () => doc.layers.find((l) => l.id === doc.activeLayerId) ?? null,
    [doc.layers, doc.activeLayerId],
  );
  const groupOptions = useMemo(() => getImageLayerGroupOptions(doc.layers), [doc.layers]);
  const activeLayerIndex = useMemo(
    () => activeLayer ? doc.layers.findIndex((layer) => layer.id === activeLayer.id) : -1,
    [activeLayer, doc.layers],
  );
  const activeLayerBelow = activeLayerIndex > 0 ? doc.layers[activeLayerIndex - 1] : null;
  const activeLayerCanClip = activeLayerIndex > 0 && !activeLayer?.locked;
  const activeLayerCaveats = useMemo(
    () => buildActiveLayerCaveats(activeLayer, doc.layers),
    [activeLayer, doc.layers],
  );
  const textPathTargets = useMemo(() => (
    doc.layers.filter((layer) => (
      layer.id !== activeLayer?.id && getEditableVectorShape(layer)?.kind === 'path'
    ))
  ), [activeLayer?.id, doc.layers]);
  const activeLayerEditTarget = doc.activeLayerEditTarget ?? 'layer';
  const activeAdjustmentHistogram = useMemo(() => (
    activeLayer ? buildAdjustmentLayerHistogram(doc, activeLayer) : null
  ), [doc, activeLayer]);
  const sourceItems = useMemo(() => sourceBins.flatMap((bin) => bin.items), [sourceBins]);

  const selectionAnchorRef = useRef<string | null>(null);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [styleClipboard, setStyleClipboard] = useState<ImageLayerStyleClipboard | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [layerSearch, setLayerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ImageLayerPanelTypeFilter>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<ImageLayerPanelVisibilityFilter>('all');
  const [lockFilter, setLockFilter] = useState<ImageLayerPanelLockFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<ImageLayerPanelSourceFilter>('all');
  const [colorFilter, setColorFilter] = useState<ImageLayerPanelColorFilter>('all');
  const [layerActionWarning, setLayerActionWarning] = useState<string | null>(null);
  const activeFilterCount = countActiveImageLayerPanelFilters({
    query: layerSearch,
    type: typeFilter,
    visibility: visibilityFilter,
    lockState: lockFilter,
    source: sourceFilter,
    colorLabel: colorFilter,
  });
  const filteredVisualLayerRows = useMemo(() => {
    const filteredIds = new Set(filterImageLayersForPanel(visualLayerRows.map((row) => row.layer), {
      query: layerSearch,
      type: typeFilter,
      visibility: visibilityFilter,
      lockState: lockFilter,
      source: sourceFilter,
      colorLabel: colorFilter,
    }).map((layer) => layer.id));
    return visualLayerRows.filter((row) => filteredIds.has(row.layer.id));
  }, [colorFilter, layerSearch, lockFilter, sourceFilter, typeFilter, visibilityFilter, visualLayerRows]);

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

  const setActiveLayerColorLabel = (colorLabel: ImageLayerColorLabel) => {
    if (!activeLayer) return;
    const nextLayer = colorLabel === 'none'
      ? omitLayerColorLabel(activeLayer)
      : { ...activeLayer, colorLabel };
    commitActiveLayer(nextLayer);
  };

  const setActiveLayerClippingMask = (clippingMask: boolean) => {
    if (!activeLayer) return;
    const nextLayer = clippingMask
      ? { ...activeLayer, clippingMask: true }
      : omitLayerClippingMask(activeLayer);
    commitActiveLayer(nextLayer);
  };

  const setActiveLayerGroupId = (groupId: string | null) => {
    if (!activeLayer || isImageLayerGroup(activeLayer)) return;
    const validGroupId = groupId && groupOptions.some((group) => group.id === groupId)
      ? groupId
      : null;
    commitActiveLayer(setImageLayerGroup(activeLayer, validGroupId));
  };

  const attachActiveTextToPath = (
    pathLayerId: string,
    options: { startOffset: number; reverse: boolean },
  ) => {
    if (!activeLayer) return;
    const pathLayer = doc.layers.find((layer) => layer.id === pathLayerId);
    if (!pathLayer) return;
    commitActiveLayer(attachTextLayerToVectorPath(activeLayer, pathLayer, options));
  };

  const clearActiveTextPath = () => {
    if (!activeLayer) return;
    commitActiveLayer(updateTextLayerFromStyle(activeLayer, {
      pathReference: null,
      pathLayout: null,
    }));
  };

  const setLayerGroupId = (layer: ImageLayer, groupId: string | null) => {
    if (isImageLayerGroup(layer)) return;
    const validGroupId = groupId && groupOptions.some((group) => group.id === groupId)
      ? groupId
      : null;
    commitLayer(layer.id, setImageLayerGroup(layer, validGroupId));
  };

  const setGroupExpanded = (layer: ImageLayer, groupExpanded: boolean) => {
    if (!isImageLayerGroup(layer)) return;
    commitLayer(layer.id, { ...layer, groupExpanded });
  };

  const commitLayerCollection = (nextLayers: ImageLayer[], nextActiveLayerId = doc.activeLayerId) => {
    const before = doc.layers;
    pushOperation({
      kind: 'layerOp',
      docId: doc.id,
      before,
      after: nextLayers,
    });
    setLayers(doc.id, nextLayers, nextActiveLayerId);
  };

  const linkLayerWithLayerBelow = (layer: ImageLayer) => {
    const layerIndex = doc.layers.findIndex((candidate) => candidate.id === layer.id);
    const lowerLayer = layerIndex > 0 ? doc.layers[layerIndex - 1] : null;
    if (!lowerLayer || isImageLayerGroup(layer) || isImageLayerGroup(lowerLayer)) return;
    commitLayerCollection(linkImageLayers(doc.layers, layer.id, lowerLayer.id), layer.id);
  };

  const unlinkLayer = (layer: ImageLayer) => {
    if (!isImageLayerLinked(layer)) return;
    commitLayerCollection(unlinkImageLayer(doc.layers, layer.id), layer.id);
  };

  const getClippingBatchTargetsAbove = (baseLayer: ImageLayer, mode: 'create' | 'release'): ImageLayer[] => {
    const baseIndex = doc.layers.findIndex((candidate) => candidate.id === baseLayer.id);
    if (baseIndex < 0) return [];
    const targets: ImageLayer[] = [];
    for (let index = baseIndex + 1; index < doc.layers.length; index += 1) {
      const candidate = doc.layers[index];
      if (!candidate || isImageLayerGroup(candidate)) break;
      if (candidate.locked) continue;
      if (mode === 'create' && !candidate.clippingMask) {
        targets.push(candidate);
      }
      if (mode === 'release' && candidate.clippingMask) {
        targets.push(candidate);
      }
    }
    return targets;
  };

  const setClippingMasksAbove = (baseLayer: ImageLayer, enabled: boolean) => {
    const targets = getClippingBatchTargetsAbove(baseLayer, enabled ? 'create' : 'release');
    if (targets.length === 0) return;
    const targetIds = new Set(targets.map((layer) => layer.id));
    const nextLayers = doc.layers.map((layer) => {
      if (!targetIds.has(layer.id)) return layer;
      return enabled ? { ...layer, clippingMask: true } : omitLayerClippingMask(layer);
    });
    commitLayerCollection(nextLayers, baseLayer.id);
  };

  const getVectorBooleanPartner = (layer: ImageLayer): ImageLayer | null => {
    if (!isEditableVectorShapeLayer(layer) || layer.locked) return null;
    const layerIndex = doc.layers.findIndex((candidate) => candidate.id === layer.id);
    if (layerIndex < 0) return null;

    for (let index = layerIndex - 1; index >= 0; index -= 1) {
      const candidate = doc.layers[index];
      if (candidate && isEditableVectorShapeLayer(candidate) && !candidate.locked) return candidate;
    }
    for (let index = layerIndex + 1; index < doc.layers.length; index += 1) {
      const candidate = doc.layers[index];
      if (candidate && isEditableVectorShapeLayer(candidate) && !candidate.locked) return candidate;
    }
    return null;
  };

  const handleVectorBooleanOperation = (operation: ImageVectorBooleanOperation, layer: ImageLayer) => {
    const partner = getVectorBooleanPartner(layer);
    if (!partner) {
      setLayerActionWarning('Vector boolean unsupported: select a retained vector layer with another unlocked vector layer nearby.');
      return;
    }

    const materialization = materializeImageVectorBooleanLayers(operation, layer, partner);
    if (materialization.status !== 'exact') {
      const warning = materialization.warnings[0]?.message ?? 'This vector boolean cannot be materialized yet.';
      setLayerActionWarning(`Vector boolean unsupported: ${warning}`);
      return;
    }

    const sourceIds = new Set(materialization.sourceLayerIds);
    const sourceIndexes = materialization.sourceLayerIds
      .map((id) => doc.layers.findIndex((candidate) => candidate.id === id))
      .filter((index) => index >= 0);
    const insertAt = Math.min(...sourceIndexes);
    const nextLayersWithoutSources = doc.layers.filter((candidate) => !sourceIds.has(candidate.id));
    const adjustedInsertAt = doc.layers
      .slice(0, insertAt)
      .filter((candidate) => !sourceIds.has(candidate.id))
      .length;
    const nextLayers = [
      ...nextLayersWithoutSources.slice(0, adjustedInsertAt),
      ...materialization.outputLayers,
      ...nextLayersWithoutSources.slice(adjustedInsertAt),
    ];
    const nextActiveLayerId = materialization.outputLayers[0]?.id ?? nextLayers[Math.min(adjustedInsertAt, nextLayers.length - 1)]?.id ?? null;

    setLayerActionWarning(null);
    commitLayerCollection(nextLayers, nextActiveLayerId);
  };

  const setActiveLayerLockVariant = (key: ImageLayerLockKey, enabled: boolean) => {
    if (!activeLayer || activeLayer.locked) return;
    commitActiveLayer(setImageLayerLockVariant(activeLayer, key, enabled));
  };

  const setLayerLockVariant = (layer: ImageLayer, key: ImageLayerLockKey, enabled: boolean) => {
    if (layer.locked) return;
    commitLayer(layer.id, setImageLayerLockVariant(layer, key, enabled));
  };

  const resetLayerFilters = () => {
    setLayerSearch('');
    setTypeFilter('all');
    setVisibilityFilter('all');
    setLockFilter('all');
    setSourceFilter('all');
    setColorFilter('all');
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
    if (isImageLayerGroup(layer) || isImageLayerGroup(lower)) return;
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
    setActiveLayerEditTarget(doc.id, 'layer');
  };

  const handleDeleteMask = () => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    commitActiveLayer({
      ...activeLayer,
      mask: null,
    });
    setActiveLayerEditTarget(doc.id, 'layer');
  };

  const handleSetMaskDensity = (value: number) => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    const maskDensity = clampImageLayerMaskDensity(value);
    if (maskDensity === (activeLayer.maskDensity ?? 1)) return;
    commitActiveLayer({
      ...activeLayer,
      maskDensity,
    });
  };

  const handleSetMaskFeather = (value: number) => {
    if (!activeLayer?.mask || activeLayer.locked) return;
    const maskFeather = clampImageLayerMaskFeather(value);
    if (maskFeather === (activeLayer.maskFeather ?? 0)) return;
    commitActiveLayer({
      ...activeLayer,
      maskFeather,
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

  const handleLayerRowClick = (layerId: string) => (event: React.MouseEvent) => {
    // Shift-click extends a contiguous range from the anchor; Ctrl/Cmd-click toggles a
    // single layer in/out; a plain click selects just this layer (collapsing any group).
    if (event.shiftKey && selectionAnchorRef.current) {
      const orderedIds = filteredVisualLayerRows.map(({ layer }) => layer.id);
      setSelectedLayers(doc.id, rangeLayerSelection(orderedIds, selectionAnchorRef.current, layerId));
      setActiveLayerEditTarget(doc.id, 'layer');
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      toggleLayerSelection(doc.id, layerId);
      setActiveLayerEditTarget(doc.id, 'layer');
      selectionAnchorRef.current = layerId;
      return;
    }
    selectionAnchorRef.current = layerId;
    setActiveLayer(doc.id, layerId);
    setActiveLayerEditTarget(doc.id, 'layer');
  };

  const selectedLayerIdSet = new Set(resolveSelectedLayerIds(doc));

  const contextLayer = layerMenu ? doc.layers.find((layer) => layer.id === layerMenu.layerId) ?? null : null;
  const contextVectorBooleanPartner = contextLayer ? getVectorBooleanPartner(contextLayer) : null;
  const handleOpenLayerMenu = (event: React.MouseEvent<HTMLElement>, layerId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(doc.id, layerId);
    setLayerActionWarning(null);
    setLayerMenu({ x: event.clientX, y: event.clientY, layerId });
  };

  const handleRasterizeLayer = (layer: ImageLayer) => {
    if (!canEditImageLayerPixels(layer)) return;
    commitLayerCollection(
      doc.layers.map((candidate) => candidate.id === layer.id ? rasterizeImageLayer(doc, layer) : candidate),
      layer.id,
    );
  };

  const handleConvertVectorShapeToPath = (layer: ImageLayer) => {
    const shape = layer.metadata?.vectorShape;
    if (!isEditableVectorShapeLayer(layer) || layer.locked || !shape || shape.kind === 'path') return;
    commitLayerCollection(
      doc.layers.map((candidate) => candidate.id === layer.id ? convertEditableVectorShapeLayerToPath(layer) : candidate),
      layer.id,
    );
  };

  return (
    <div className={`flex flex-col bg-[#1a1b23] ${expandToContent ? '' : 'h-full'}`}>
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
              <AddMenuItem label="Group" onClick={() => handleAdd('group')} />
              <AddMenuItem label="Adjustment" onClick={() => handleAdd('adjustment')} />
              <AddMenuItem label="Levels" onClick={() => handleAddAdjustment('levels')} />
              <AddMenuItem label="Curves" onClick={() => handleAddAdjustment('curves')} />
            </div>
          )}
        </div>
      </div>

      {layerActionWarning ? (
        <div
          className="border-b border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100"
          role="status"
        >
          {layerActionWarning}
        </div>
      ) : null}

      {activeLayerCaveats.length > 0 ? (
        <div className="border-b border-cyan-300/10 bg-cyan-400/5 px-3 py-2 text-[11px] text-cyan-100/70">
          <div className="mb-1 font-semibold uppercase tracking-wide text-cyan-100/45">Layer caveats</div>
          <ul className="space-y-1">
            {activeLayerCaveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeLayer && (
        <div className={`shrink-0 border-b border-cyan-300/10 px-3 py-2 pr-2 text-xs text-cyan-100/50 ${expandToContent ? '' : 'max-h-28 overflow-y-auto overscroll-contain'}`}>
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
          <div className="mt-2 grid grid-cols-2 gap-1">
            <label className="flex items-center gap-1.5 rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-[11px] font-semibold text-cyan-100/55">
              <input
                aria-label="Lock layer pixels"
                checked={Boolean(activeLayer.locks?.pixels)}
                className="h-3.5 w-3.5 accent-cyan-400"
                disabled={activeLayer.locked}
                onChange={(event) => setActiveLayerLockVariant('pixels', event.target.checked)}
                type="checkbox"
              />
              <span>Pixels</span>
            </label>
            <label className="flex items-center gap-1.5 rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-[11px] font-semibold text-cyan-100/55">
              <input
                aria-label="Lock layer position"
                checked={Boolean(activeLayer.locks?.position)}
                className="h-3.5 w-3.5 accent-cyan-400"
                disabled={activeLayer.locked}
                onChange={(event) => setActiveLayerLockVariant('position', event.target.checked)}
                type="checkbox"
              />
              <span>Position</span>
            </label>
          </div>
          {!isImageLayerGroup(activeLayer) ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button
                aria-label="Link layer with layer below"
                className="rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-left text-[11px] font-semibold text-cyan-100/55 hover:border-cyan-300/30 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!activeLayerBelow || isImageLayerGroup(activeLayerBelow)}
                onClick={() => linkLayerWithLayerBelow(activeLayer)}
                type="button"
              >
                Link below
              </button>
              <button
                aria-label="Unlink layer"
                className="rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-left text-[11px] font-semibold text-cyan-100/55 hover:border-cyan-300/30 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!isImageLayerLinked(activeLayer)}
                onClick={() => unlinkLayer(activeLayer)}
                type="button"
              >
                Unlink
              </button>
            </div>
          ) : null}
          {isImageLayerGroup(activeLayer) ? (
            <label className="mt-2 flex items-center gap-2 rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-[11px] font-semibold text-cyan-100/55">
              <input
                aria-label="Group expanded"
                checked={activeLayer.groupExpanded !== false}
                className="h-3.5 w-3.5 accent-cyan-400"
                onChange={(event) => setGroupExpanded(activeLayer, event.target.checked)}
                type="checkbox"
              />
              <span>Group open</span>
            </label>
          ) : groupOptions.length > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <label className="w-12 text-cyan-100/40">Group</label>
              <select
                aria-label="Layer group"
                className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
                disabled={activeLayer.locked}
                onChange={(event) => setActiveLayerGroupId(event.target.value || null)}
                value={activeLayer.groupId ?? ''}
              >
                <option value="">None</option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <label className="w-12 text-cyan-100/40">Label</label>
            <select
              aria-label="Layer color label"
              className="flex-1 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-0.5 text-xs text-cyan-100/80"
              disabled={activeLayer.locked}
              onChange={(event) => setActiveLayerColorLabel(event.target.value as ImageLayerColorLabel)}
              value={imageLayerColorLabelById(activeLayer.colorLabel).id}
            >
              {IMAGE_LAYER_COLOR_LABELS.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.label}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 rounded-full border border-white/20"
              style={{
                backgroundColor: imageLayerColorLabelById(activeLayer.colorLabel).id === 'none'
                  ? 'transparent'
                  : imageLayerColorLabelById(activeLayer.colorLabel).swatch,
              }}
            />
          </div>
          <label className="mt-2 flex items-center gap-2 rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-[11px] font-semibold text-cyan-100/55">
            <input
              aria-label="Clip layer to layer below"
              checked={Boolean(activeLayer.clippingMask)}
              className="h-3.5 w-3.5 accent-cyan-400"
              disabled={!activeLayerCanClip}
              onChange={(event) => setActiveLayerClippingMask(event.target.checked)}
              type="checkbox"
            />
            <span>Clip</span>
            <span className="ml-auto text-[10px] font-normal text-cyan-100/35">
              to layer below
            </span>
          </label>
          {activeLayer.type === 'adjustment' && activeLayer.adjustment ? (
            <AdjustmentLayerControls
              adjustment={activeLayer.adjustment}
              disabled={activeLayer.locked}
              histogram={activeAdjustmentHistogram}
              onChange={(adjustment) => commitActiveLayer({ ...activeLayer, adjustment })}
            />
          ) : null}
          {activeLayer.type === 'text' || activeLayer.metadata?.editableText ? (
            <EditableTextLayerControls
              disabled={activeLayer.locked}
              layer={activeLayer}
              onAttachToPath={attachActiveTextToPath}
              onApplyPreset={(presetId) => commitActiveLayer(applyImageTextPresetToLayer(activeLayer, presetId))}
              onClearTextPath={clearActiveTextPath}
              onChange={(patch) => commitActiveLayer(updateTextLayerFromStyle(activeLayer, patch))}
              pathTargets={textPathTargets}
            />
          ) : null}
          {isEditableVectorShapeLayer(activeLayer) ? (
            <EditableVectorShapeLayerControls
              disabled={activeLayer.locked}
              layer={activeLayer}
              onChange={(patch) => commitActiveLayer(updateEditableVectorShapeLayer(activeLayer, patch))}
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
            {activeLayer.mask ? (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <MaskActionButton
                    disabled={activeLayer.locked}
                    icon={<LayersIcon size={12} />}
                    label="Edit Layer"
                    ariaLabel="Edit layer target"
                    onClick={() => setActiveLayerEditTarget(doc.id, 'layer')}
                    active={activeLayerEditTarget === 'layer'}
                  />
                  <MaskActionButton
                    disabled={!activeLayer.mask || activeLayer.locked}
                    icon={<SquareDashed size={12} />}
                    label="Edit Mask"
                    ariaLabel="Edit mask target"
                    onClick={() => setActiveLayerEditTarget(doc.id, 'mask')}
                    active={activeLayerEditTarget === 'mask'}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <label className="w-12 text-cyan-100/35" htmlFor="image-layer-mask-density">
                    Density
                  </label>
                  <input
                    aria-label="Mask density"
                    className="min-w-0 flex-1 cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={activeLayer.locked}
                    id="image-layer-mask-density"
                    max={1}
                    min={0}
                    onChange={(event) => handleSetMaskDensity(parseFloat(event.target.value))}
                    step={0.01}
                    type="range"
                    value={activeLayer.maskDensity ?? 1}
                  />
                  <span className="w-9 text-right text-cyan-100/35">
                    {Math.round((activeLayer.maskDensity ?? 1) * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <label className="w-12 text-cyan-100/35" htmlFor="image-layer-mask-feather">
                    Feather
                  </label>
                  <input
                    aria-label="Mask feather"
                    className="min-w-0 flex-1 cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={activeLayer.locked}
                    id="image-layer-mask-feather"
                    max={64}
                    min={0}
                    onChange={(event) => handleSetMaskFeather(parseFloat(event.target.value))}
                    step={1}
                    type="range"
                    value={activeLayer.maskFeather ?? 0}
                  />
                  <span className="w-9 text-right text-cyan-100/35">
                    {Math.round(activeLayer.maskFeather ?? 0)}px
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="border-b border-cyan-300/10 p-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-cyan-100/35" size={12} />
          <input
            aria-label="Search layers"
            className="w-full rounded border border-cyan-300/10 bg-[#0d0f15] py-1 pl-7 pr-2 text-xs text-cyan-50 outline-none placeholder:text-cyan-100/25 focus:border-cyan-300/40"
            onChange={(event) => setLayerSearch(event.target.value)}
            placeholder="Search layers"
            value={layerSearch}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <LayerFilterSelect
            ariaLabel="Layer type filter"
            onChange={(value) => setTypeFilter(value as ImageLayerPanelTypeFilter)}
            options={IMAGE_LAYER_TYPE_FILTERS}
            value={typeFilter}
          />
          <LayerFilterSelect
            ariaLabel="Layer visibility filter"
            onChange={(value) => setVisibilityFilter(value as ImageLayerPanelVisibilityFilter)}
            options={[
              { id: 'all', label: 'All Visibility' },
              { id: 'visible', label: 'Visible' },
              { id: 'hidden', label: 'Hidden' },
            ]}
            value={visibilityFilter}
          />
          <LayerFilterSelect
            ariaLabel="Layer lock filter"
            onChange={(value) => setLockFilter(value as ImageLayerPanelLockFilter)}
            options={[
              { id: 'all', label: 'All Locks' },
              { id: 'locked', label: 'Locked' },
              { id: 'unlocked', label: 'Unlocked' },
            ]}
            value={lockFilter}
          />
          <LayerFilterSelect
            ariaLabel="Layer source filter"
            onChange={(value) => setSourceFilter(value as ImageLayerPanelSourceFilter)}
            options={[
              { id: 'all', label: 'All Sources' },
              { id: 'linked', label: 'Linked' },
              { id: 'unlinked', label: 'Unlinked' },
            ]}
            value={sourceFilter}
          />
          <LayerFilterSelect
            ariaLabel="Layer color label filter"
            className="col-span-2"
            onChange={(value) => setColorFilter(value as ImageLayerPanelColorFilter)}
            options={[
              { id: 'all', label: 'All Labels' },
              ...IMAGE_LAYER_COLOR_LABELS,
            ]}
            value={colorFilter}
          />
        </div>
        {activeFilterCount > 0 ? (
          <button
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/55 hover:border-cyan-300/30 hover:text-cyan-50"
            onClick={resetLayerFilters}
            type="button"
          >
            <X size={11} />
            Clear {activeFilterCount}
          </button>
        ) : null}
      </div>

      <div className={expandToContent ? 'min-h-0 space-y-0.5 p-1' : 'min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1'}>
        {filteredVisualLayerRows.map(({ layer, depth }) => (
          <LayerRow
            key={layer.id}
            active={layer.id === doc.activeLayerId}
            selected={selectedLayerIdSet.has(layer.id) && layer.id !== doc.activeLayerId}
            activeEditTarget={layer.id === doc.activeLayerId ? activeLayerEditTarget : 'layer'}
            dragging={layer.id === dragLayerId}
            indentLevel={depth}
            layer={layer}
            onClick={handleLayerRowClick(layer.id)}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart(layer.id)}
            onDrop={handleDropOnLayer(layer.id)}
            onOpenMenu={handleOpenLayerMenu}
            onRename={(name) => updateLayer(doc.id, layer.id, { name })}
            onSelectLayerTarget={() => {
              setActiveLayer(doc.id, layer.id);
              setActiveLayerEditTarget(doc.id, 'layer');
            }}
            onSelectMaskTarget={() => {
              setActiveLayer(doc.id, layer.id);
              setActiveLayerEditTarget(doc.id, 'mask');
            }}
            onToggleGroupExpanded={() => setGroupExpanded(layer, layer.groupExpanded === false)}
            onToggleLocked={() =>
              updateLayer(doc.id, layer.id, { locked: !layer.locked })
            }
            onToggleVisible={() =>
              updateLayer(doc.id, layer.id, { visible: !layer.visible })
            }
          />
        ))}
        {visualLayers.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-cyan-100/30">No layers</div>
        ) : null}
        {visualLayers.length > 0 && filteredVisualLayerRows.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-cyan-100/30">No matching layers</div>
        ) : null}
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
            !activeLayer
            || isImageLayerGroup(activeLayer)
            || doc.layers.findIndex((l) => l.id === activeLayer?.id) <= 0
            || isImageLayerGroup(doc.layers[doc.layers.findIndex((l) => l.id === activeLayer?.id) - 1])
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
              disabled: !canEditImageLayerPixels(contextLayer),
              action: () => handleRasterizeLayer(contextLayer),
            },
            {
              id: 'convert-shape-to-path',
              label: 'Convert Shape to Editable Path',
              hidden: !isEditableVectorShapeLayer(contextLayer) || contextLayer.metadata?.vectorShape?.kind === 'path',
              disabled: contextLayer.locked,
              action: () => handleConvertVectorShapeToPath(contextLayer),
            },
            {
              id: 'toggle-pixel-lock',
              label: contextLayer.locks?.pixels ? 'Unlock Pixel Edits' : 'Lock Pixel Edits',
              disabled: contextLayer.locked,
              action: () => setLayerLockVariant(contextLayer, 'pixels', !contextLayer.locks?.pixels),
            },
            {
              id: 'toggle-position-lock',
              label: contextLayer.locks?.position ? 'Unlock Position' : 'Lock Position',
              disabled: contextLayer.locked,
              action: () => setLayerLockVariant(contextLayer, 'position', !contextLayer.locks?.position),
            },
            {
              id: 'link-layer-below',
              label: 'Link With Layer Below',
              disabled: isImageLayerGroup(contextLayer)
                || doc.layers.findIndex((layer) => layer.id === contextLayer.id) <= 0
                || isImageLayerGroup(doc.layers[doc.layers.findIndex((layer) => layer.id === contextLayer.id) - 1]),
              action: () => linkLayerWithLayerBelow(contextLayer),
            },
            {
              id: 'unlink-layer',
              label: 'Unlink Layer',
              disabled: !isImageLayerLinked(contextLayer),
              action: () => unlinkLayer(contextLayer),
            },
            {
              id: 'toggle-group-expanded',
              label: contextLayer.groupExpanded === false ? 'Expand Group' : 'Collapse Group',
              hidden: !isImageLayerGroup(contextLayer),
              action: () => setGroupExpanded(contextLayer, contextLayer.groupExpanded === false),
            },
            {
              id: 'move-to-group',
              label: 'Move to Group',
              hidden: isImageLayerGroup(contextLayer),
              children: [
                {
                  id: 'move-to-no-group',
                  label: 'None',
                  action: () => setLayerGroupId(contextLayer, null),
                },
                ...groupOptions.map((group) => ({
                  id: `move-to-group-${group.id}`,
                  label: group.name,
                  action: () => setLayerGroupId(contextLayer, group.id),
                })),
              ],
            },
            {
              id: 'toggle-clipping-mask',
              label: contextLayer.clippingMask ? 'Release Clipping Mask' : 'Create Clipping Mask',
              disabled: contextLayer.locked || isImageLayerGroup(contextLayer) || doc.layers.findIndex((layer) => layer.id === contextLayer.id) <= 0,
              action: () => {
                const nextLayer = contextLayer.clippingMask
                  ? omitLayerClippingMask(contextLayer)
                  : { ...contextLayer, clippingMask: true };
                commitLayer(contextLayer.id, nextLayer);
              },
            },
            {
              id: 'clip-layers-above',
              label: 'Clip Layers Above to This Layer',
              disabled: getClippingBatchTargetsAbove(contextLayer, 'create').length === 0,
              action: () => setClippingMasksAbove(contextLayer, true),
            },
            {
              id: 'release-clipping-masks-above',
              label: 'Release Clipping Masks Above',
              disabled: getClippingBatchTargetsAbove(contextLayer, 'release').length === 0,
              action: () => setClippingMasksAbove(contextLayer, false),
            },
            {
              id: 'vector-boolean',
              label: 'Vector Boolean',
              hidden: !isEditableVectorShapeLayer(contextLayer),
              children: VECTOR_BOOLEAN_OPERATIONS.map(({ operation, label }) => ({
                id: `vector-boolean-${operation}`,
                label: contextVectorBooleanPartner
                  ? `${label} with ${contextVectorBooleanPartner.name}`
                  : `${label} (needs another vector layer)`,
                disabled: !contextVectorBooleanPartner,
                action: () => handleVectorBooleanOperation(operation, contextLayer),
              })),
            },
            {
              id: 'duplicate-layer',
              label: 'Duplicate Layer',
              action: () => duplicateLayer(doc.id, contextLayer.id),
            },
            {
              id: 'merge-down',
              label: 'Merge Down',
              disabled: isImageLayerGroup(contextLayer) || doc.layers.findIndex((layer) => layer.id === contextLayer.id) <= 0,
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

  if (isEditableVectorShapeLayer(layer)) {
    layer = rasterizeEditableVectorShapeLayer(layer);
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

function LayerFilterSelect({
  ariaLabel,
  className = '',
  options,
  onChange,
  value,
}: {
  ariaLabel: string;
  className?: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={`min-w-0 rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-1 text-[11px] text-cyan-100/70 outline-none focus:border-cyan-300/40 ${className}`}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function omitLayerColorLabel(layer: ImageLayer): ImageLayer {
  const { colorLabel: _colorLabel, ...rest } = layer;
  return rest;
}

function omitLayerClippingMask(layer: ImageLayer): ImageLayer {
  const { clippingMask: _clippingMask, ...rest } = layer;
  return rest;
}

function buildActiveLayerCaveats(
  activeLayer: ImageLayer | null,
  layers: readonly ImageLayer[],
): string[] {
  if (!activeLayer) return [];

  const readiness = describeImageLayerGroupHierarchyReadiness(layers, {
    selectedLayerIds: [activeLayer.id],
    requestedBatchOperations: ['move', 'transform', 'visibility'],
  });
  const organizationParity = describeImageLayerOrganizationParityReadiness(layers, {
    selectedLayerIds: [activeLayer.id],
    suiteHandoffTarget: 'psd-export',
  });
  const caveats: string[] = [];

  if (readiness.caveats.includes('nested-group-normalized')) {
    caveats.push('Nested groups are normalized for preview only.');
  }
  if (readiness.caveats.includes('pass-through-group-metadata-only')) {
    caveats.push('Pass-through folders do not have full Photoshop compositing semantics.');
  }
  if (readiness.caveats.includes('group-mask-metadata-only')) {
    caveats.push('Group masks stay metadata-only and can flatten through visible descendants on PSD handoff.');
  }
  if (readiness.caveats.includes('inherited-locks-block-batch')) {
    caveats.push('Inherited folder locks can still block child and batch actions.');
  }
  if (
    activeLayer.clippingMask
    && organizationParity.suiteHandoffCaveats.some((caveat) => caveat.includes('clipping-mask flags as Signal Loom metadata'))
  ) {
    caveats.push('PSD handoff keeps clipping masks as Signal Loom metadata; native Photoshop clipping groups are not guaranteed.');
  }

  return caveats;
}
