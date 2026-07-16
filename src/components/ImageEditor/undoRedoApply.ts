import type { EditorOperation } from '../../types/imageEditor';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { fromSnapshot } from './SelectionMask';
import { clearSelection, setSelection } from './selectionRegistry';
import {
  applyImageDocumentSelectionState,
  disposeImageDocumentSnapshotsRemoved,
} from './ImageSnapshots';
import {
  materializeHistoryBitmap,
  materializeHistoryDocument,
  materializeHistoryLayers,
} from './ImageHistoryResources';

type Direction = 'undo' | 'redo';

/**
 * Apply an EditorOperation in either direction. Used by Ctrl+Z / Ctrl+Y
 * handlers and by tools that share the same op log.
 */
export function applyOperation(op: EditorOperation, direction: Direction): void {
  const state = useImageEditorStore.getState();
  const docId = op.docId;

  switch (op.kind) {
    case 'paint': {
      const targetBitmap = materializeHistoryBitmap(direction === 'undo' ? op.before : op.after);
      if (op.paintTarget === 'mask') {
        state.updateLayer(docId, op.layerId, { mask: targetBitmap });
      } else {
        state.updateLayer(docId, op.layerId, { bitmap: targetBitmap });
      }
      break;
    }
    case 'transform': {
      const target = direction === 'undo' ? op.before : op.after;
      state.updateLayer(docId, op.layerId, {
        x: target.x,
        y: target.y,
        rotationDeg: target.rotationDeg ?? 0,
        ...('skewXDeg' in target ? { skewXDeg: target.skewXDeg ?? 0 } : {}),
        ...('skewYDeg' in target ? { skewYDeg: target.skewYDeg ?? 0 } : {}),
        ...('perspectiveX' in target ? { perspectiveX: target.perspectiveX ?? 0 } : {}),
        ...('perspectiveY' in target ? { perspectiveY: target.perspectiveY ?? 0 } : {}),
        ...('warp' in target ? { warp: target.warp } : {}),
        ...('cornerOffsets' in target ? { cornerOffsets: target.cornerOffsets } : {}),
        ...('transformOriginX' in target ? { transformOriginX: target.transformOriginX } : {}),
        ...('transformOriginY' in target ? { transformOriginY: target.transformOriginY } : {}),
      });
      break;
    }
    case 'selection': {
      const target = direction === 'undo' ? op.before : op.after;
      if (target) {
        setSelection(docId, fromSnapshot(target));
        state.setHasSelection(docId, true);
      } else {
        clearSelection(docId);
        state.setHasSelection(docId, false);
      }
      break;
    }
    case 'layerOp': {
      const target = materializeHistoryLayers(direction === 'undo' ? op.before : op.after);
      // Replace doc.layers wholesale by removing all and re-adding.
      const current = useImageEditorStore.getState().documents.find((d) => d.id === docId);
      if (!current) return;
      for (const layer of current.layers) {
        state.removeLayer(docId, layer.id);
      }
      for (const layer of target) {
        state.addLayer(docId, layer);
      }
      break;
    }
    case 'docResize': {
      const target = direction === 'undo' ? op.before : op.after;
      const current = useImageEditorStore.getState().documents.find((d) => d.id === docId);
      if (!current) return;
      state.setLayers(docId, materializeHistoryLayers(target.layers), target.activeLayerId);
      state.setDocumentDimensions(docId, target.width, target.height);
      break;
    }
    case 'documentState': {
      const target = applyImageDocumentSelectionState(
        materializeHistoryDocument(direction === 'undo' ? op.before : op.after),
      );
      const currentDocument = useImageEditorStore.getState().documents.find((doc) => doc.id === docId);
      if (currentDocument) disposeImageDocumentSnapshotsRemoved(currentDocument, target);
      useImageEditorStore.setState((currentState) => ({
        documents: currentState.documents.map((doc) => (doc.id === docId ? target : doc)),
      }));
      break;
    }
  }
}

export function undo(docId: string): boolean {
  const state = useImageEditorStore.getState();
  const op = state.popUndo(docId);
  if (!op) return false;
  applyOperation(op, 'undo');
  return true;
}

export function redo(docId: string): boolean {
  const state = useImageEditorStore.getState();
  const op = state.popRedo(docId);
  if (!op) return false;
  applyOperation(op, 'redo');
  return true;
}

export function jumpToHistoryUndoCount(docId: string, targetUndoCount: number): boolean {
  const state = useImageEditorStore.getState();
  const currentUndoCount = state.undoStacks[docId]?.length ?? 0;
  const currentRedoCount = state.redoStacks[docId]?.length ?? 0;
  const maxUndoCount = currentUndoCount + currentRedoCount;

  if (targetUndoCount < 0 || targetUndoCount > maxUndoCount) return false;
  if (targetUndoCount === currentUndoCount) return true;

  let changed = false;
  while ((useImageEditorStore.getState().undoStacks[docId]?.length ?? 0) > targetUndoCount) {
    if (!undo(docId)) return changed;
    changed = true;
  }
  while ((useImageEditorStore.getState().undoStacks[docId]?.length ?? 0) < targetUndoCount) {
    if (!redo(docId)) return changed;
    changed = true;
  }
  return changed;
}
