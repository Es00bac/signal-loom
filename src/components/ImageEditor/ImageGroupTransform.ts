/**
 * Pure helpers for multi-layer ("linked") transforms: resolving the active selection,
 * computing the combined bounding box, and applying a group translate / rotate / scale
 * around a shared pivot so several selected layers move as one. Canvas-free + tested; the
 * store and the transform overlay drive it.
 */
import type { ImageDocument, ImageLayer } from '../../types/imageEditor';

/** A layer's axis-aligned placement used for group geometry (top-left + size). */
export interface GroupLayerRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The current multi-selection for linked transforms: the document's `selectedLayerIds`
 * (deduped, filtered to existing layers) or just the active layer. Always returns the
 * active layer first when present so single-selection behaviour is unchanged.
 */
export function resolveSelectedLayerIds(doc: Pick<ImageDocument, 'layers' | 'activeLayerId' | 'selectedLayerIds'>): string[] {
  const existing = new Set(doc.layers.map((layer) => layer.id));
  const raw = doc.selectedLayerIds && doc.selectedLayerIds.length > 0
    ? doc.selectedLayerIds
    : (doc.activeLayerId ? [doc.activeLayerId] : []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (existing.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Toggles a layer in/out of the selection (Ctrl/Cmd-click). Removing the active layer
 * promotes another selected layer to active. Returns the next {selectedLayerIds,
 * activeLayerId}; a selection never becomes empty (a final toggle-off is a no-op).
 */
export function toggleLayerInSelection(
  current: readonly string[],
  activeLayerId: string | null,
  layerId: string,
): { selectedLayerIds: string[]; activeLayerId: string | null } {
  const base = current.length > 0 ? current : (activeLayerId ? [activeLayerId] : []);
  if (base.includes(layerId)) {
    const next = base.filter((id) => id !== layerId);
    if (next.length === 0) {
      return { selectedLayerIds: base.slice(), activeLayerId }; // don't allow empty
    }
    return {
      selectedLayerIds: next,
      activeLayerId: activeLayerId === layerId ? next[next.length - 1] : activeLayerId,
    };
  }
  return { selectedLayerIds: [...base, layerId], activeLayerId: layerId };
}

/** Inclusive contiguous range of layer ids between two ids (Shift-click). */
export function rangeLayerSelection(orderedIds: readonly string[], anchorId: string, targetId: string): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(lo, hi + 1);
}

/** Union bounding box of the selected layer rects, or null if none. */
export function getGroupBounds(rects: readonly GroupLayerRect[], selectedIds: readonly string[]): GroupBounds | null {
  const selected = rects.filter((rect) => selectedIds.includes(rect.id));
  if (selected.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of selected) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Translates the selected layers by (dx, dy); other layers are returned unchanged. */
export function translateSelectedLayers(layers: ImageLayer[], selectedIds: readonly string[], dx: number, dy: number): ImageLayer[] {
  if ((dx === 0 && dy === 0) || selectedIds.length === 0) return layers;
  const set = new Set(selectedIds);
  return layers.map((layer) => (set.has(layer.id) ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer));
}

/**
 * Rotates the selected layers as a rigid group about `pivot` by `angleDeg`: each layer's
 * position orbits the pivot and `angleDeg` is added to its own rotation. Non-selected
 * layers are returned unchanged.
 */
export function rotateSelectedLayersAroundPivot(
  layers: ImageLayer[],
  selectedIds: readonly string[],
  pivot: { x: number; y: number },
  angleDeg: number,
  sizeOf: (layer: ImageLayer) => { width: number; height: number },
): ImageLayer[] {
  if (angleDeg === 0 || selectedIds.length === 0) return layers;
  const set = new Set(selectedIds);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return layers.map((layer) => {
    if (!set.has(layer.id)) return layer;
    const size = sizeOf(layer);
    // Orbit the layer centre about the pivot, then back out the top-left.
    const cx = layer.x + size.width / 2;
    const cy = layer.y + size.height / 2;
    const ox = cx - pivot.x;
    const oy = cy - pivot.y;
    const rx = ox * cos - oy * sin;
    const ry = ox * sin + oy * cos;
    const nextCx = pivot.x + rx;
    const nextCy = pivot.y + ry;
    return {
      ...layer,
      x: nextCx - size.width / 2,
      y: nextCy - size.height / 2,
      rotationDeg: ((layer.rotationDeg ?? 0) + angleDeg),
    };
  });
}
