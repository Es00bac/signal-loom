import type { EditorOperation } from '../../types/imageEditor';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { fromSnapshot } from './SelectionMask';
import { clearSelection, setSelection } from './selectionRegistry';

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
      const targetBitmap = direction === 'undo' ? op.before : op.after;
      state.updateLayer(docId, op.layerId, { bitmap: targetBitmap });
      break;
    }
    case 'transform': {
      const target = direction === 'undo' ? op.before : op.after;
      state.updateLayer(docId, op.layerId, {
        x: target.x,
        y: target.y,
        rotationDeg: target.rotationDeg ?? 0,
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
      const target = direction === 'undo' ? op.before : op.after;
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
      for (const layer of current.layers) {
        state.removeLayer(docId, layer.id);
      }
      for (const layer of target.layers) {
        state.addLayer(docId, layer);
      }
      state.setDocumentDimensions(docId, target.width, target.height);
      break;
    }
    case 'documentState': {
      const target = direction === 'undo' ? op.before : op.after;
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
