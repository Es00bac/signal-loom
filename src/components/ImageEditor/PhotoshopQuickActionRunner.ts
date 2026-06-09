import { useImageEditorStore } from '../../store/imageEditorStore';
import { toSnapshot } from './SelectionMask';
import { applyOperation } from './undoRedoApply';
import { clearSelection, getSelection, setSelection } from './selectionRegistry';
import {
  createPhotoshopQuickActionResult,
  type PhotoshopQuickActionId,
} from './PhotoshopQuickActions';
import { rasterizeSvgToBitmapAtResolution } from './ImageFileFormats';

export function runPhotoshopQuickAction(
  actionId: PhotoshopQuickActionId,
  options: { createLayerId?: () => string } = {},
): boolean {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
  if (!doc) return false;

  const layer = doc.layers.find((candidate) => candidate.id === doc.activeLayerId) ?? null;
  const beforeSelection = getSelection(doc.id) ?? null;

  // Track vector layer sizes before the action runs
  const beforeVectorSizes = new Map<string, { width: number; height: number }>();
  doc.layers.forEach((l) => {
    if (l.type === 'vector' && l.bitmap) {
      beforeVectorSizes.set(l.id, { width: l.bitmap.width, height: l.bitmap.height });
    }
  });

  const result = createPhotoshopQuickActionResult({
    actionId,
    doc,
    layer,
    selection: beforeSelection,
    createLayerId: options.createLayerId,
  });

  if (!result) return false;

  switch (result.kind) {
    case 'selection': {
      state.pushOperation({
        kind: 'selection',
        docId: doc.id,
        before: beforeSelection ? toSnapshot(beforeSelection) : null,
        after: result.hasSelection ? toSnapshot(result.selection) : null,
      });

      if (result.hasSelection) {
        setSelection(doc.id, result.selection);
      } else {
        clearSelection(doc.id);
      }

      useImageEditorStore.getState().setHasSelection(doc.id, result.hasSelection);
      return true;
    }
    case 'paint':
    case 'transform':
    case 'docResize':
      state.pushOperation(result.operation);
      applyOperation(result.operation, 'redo');
      regenerateVectorLayersIfNeeded(doc.id, beforeVectorSizes);
      return true;
    case 'layerOp':
      state.pushOperation(result.operation);
      applyOperation(result.operation, 'redo');
      if (result.activeLayerId) {
        useImageEditorStore.getState().setActiveLayer(doc.id, result.activeLayerId);
      }
      regenerateVectorLayersIfNeeded(doc.id, beforeVectorSizes);
      return true;
  }
}

function regenerateVectorLayersIfNeeded(
  docId: string,
  beforeVectorSizes: Map<string, { width: number; height: number }>,
): void {
  const store = useImageEditorStore.getState();
  const currentDoc = store.documents.find((d) => d.id === docId);
  if (!currentDoc) return;

  currentDoc.layers.forEach((layer) => {
    const svgSource = layer.vectorRecipe || layer.metadata?.originalSvgSource;
    if (layer.type === 'vector' && svgSource && layer.bitmap) {
      const beforeSize = beforeVectorSizes.get(layer.id);
      const targetWidth = layer.bitmap.width;
      const targetHeight = layer.bitmap.height;

      // Regenerate if size changed, or if it's new
      if (!beforeSize || beforeSize.width !== targetWidth || beforeSize.height !== targetHeight) {
        rasterizeSvgToBitmapAtResolution(svgSource, targetWidth, targetHeight)
          .then((newBitmap) => {
            const freshStore = useImageEditorStore.getState();
            const freshDoc = freshStore.documents.find((d) => d.id === docId);
            if (freshDoc) {
              const updatedLayers = freshDoc.layers.map((l) =>
                l.id === layer.id
                  ? {
                      ...l,
                      bitmap: newBitmap,
                      bitmapVersion: l.bitmapVersion + 1,
                      vectorRecipe: l.vectorRecipe || svgSource,
                      metadata: {
                        ...l.metadata,
                        originalSvgSource: l.metadata?.originalSvgSource || svgSource,
                        sourceLink: l.metadata?.sourceLink
                          ? { ...l.metadata.sourceLink, width: targetWidth, height: targetHeight }
                          : { id: l.id, status: 'linked' as const, width: targetWidth, height: targetHeight, relinkHistory: [] },
                      },
                    }
                  : l
              );
              freshStore.setLayers(docId, updatedLayers, freshDoc.activeLayerId);
            }
          })
          .catch((err) => {
            console.error('Failed to regenerate vector layer bitmap in quick action:', err);
          });
      }
    }
  });
}
