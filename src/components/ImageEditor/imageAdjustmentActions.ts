import { useImageEditorStore } from '../../store/imageEditorStore';
import { createAdjustmentLayer } from './ImageAdjustmentLayer';
import type {
  AdjustmentLayerKind,
  ImageAdjustmentSettings,
  ImageLayer,
} from '../../types/imageEditor';

/**
 * Undoable adjustment-layer actions shared by the Layers panel and the
 * menu-driven Adjustments dialog, so both go through the exact same
 * create/commit + undo bookkeeping.
 */

/**
 * Add a non-destructive adjustment layer of `kind` to the active document and
 * make it active, recording one undoable layer operation. Returns the new
 * layer, or `null` when there is no active document.
 */
export function addAdjustmentLayerUndoable(kind: AdjustmentLayerKind): ImageLayer | null {
  const store = useImageEditorStore.getState();
  const doc = store.getActiveDocument();
  if (!doc) return null;
  const before = doc.layers;
  const layer = createAdjustmentLayer(doc, kind);
  store.addLayer(doc.id, layer); // addLayer also sets the new layer active
  const after = useImageEditorStore.getState().documents.find((d) => d.id === doc.id)?.layers;
  if (after) store.pushOperation({ kind: 'layerOp', docId: doc.id, before, after });
  return layer;
}

/**
 * Commit edited adjustment settings onto an existing adjustment layer in the
 * active document, recording one undoable layer operation. No-op when the
 * document or layer is gone.
 */
export function commitAdjustmentSettingsUndoable(
  layerId: string,
  adjustment: ImageAdjustmentSettings,
): void {
  const store = useImageEditorStore.getState();
  const doc = store.getActiveDocument();
  if (!doc) return;
  const target = doc.layers.find((layer) => layer.id === layerId);
  if (!target) return;
  const before = doc.layers;
  const next: ImageLayer = { ...target, adjustment };
  const after = doc.layers.map((layer) => (layer.id === layerId ? next : layer));
  store.pushOperation({ kind: 'layerOp', docId: doc.id, before, after });
  store.updateLayer(doc.id, layerId, next);
}
