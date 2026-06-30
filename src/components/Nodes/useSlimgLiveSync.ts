import { useEffect } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { imageDocumentToDataUrl } from '../ImageEditor/ImageDocumentExport';
import {
  boundDocSignatureChanged,
  readBoundDocSignature,
  type BoundDocSignature,
} from './slimgLiveSyncSignature';

// Keeps every .slimg Flow node's output in sync with the Image document it's bound to. Mounted once at
// the app root so it runs regardless of which workspace is visible.
//
// Change detection: the editor mutates a layer's canvas bitmap IN PLACE while painting, so the
// `ImageDocument` object reference does NOT change on an edit — watching it misses every brush stroke.
// What DOES change on every committed edit is the per-document history: `pushOperation` (and undo/redo)
// replace `undoStacks[docId]` / `redoStacks[docId]` with brand-new arrays. So we treat a change in those
// array references (or the doc object itself, as a belt-and-suspenders) as "an edit was committed" and
// re-flatten the live document (debounced) into the node's `result`. The flatten reads the layers'
// current canvas pixels, so it captures the edit. If the bound document is closed/detached in Image we
// stop updating — the node keeps its last flattened output (the "snapshot fallback").
const REFLATTEN_DEBOUNCE_MS = 300;

export function useSlimgLiveSync(): void {
  useEffect(() => {
    const lastSignatureByNode = new Map<string, BoundDocSignature>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let disposed = false;

    const reflatten = (nodeId: string, boundDocId: string) => {
      // Re-fetch the live document at flatten time rather than capturing a (possibly replaced) reference.
      const doc = useImageEditorStore.getState().documents.find((candidate) => candidate.id === boundDocId);
      if (!doc) return; // closed before the debounce fired — keep the last output.
      void imageDocumentToDataUrl(doc)
        .then((url) => {
          if (disposed) return;
          // Only the bound node, and only if it's still bound to this same doc.
          const node = useFlowStore.getState().nodes.find((candidate) => candidate.id === nodeId);
          if (!node || node.data.slimgBoundDocId !== boundDocId) return;
          useFlowStore.getState().patchNodeData(nodeId, { result: url });
        })
        .catch(() => {
          /* a transient flatten failure shouldn't break the sync; the next edit retries. */
        });
    };

    const reconcile = () => {
      const nodes = useFlowStore.getState().nodes;
      const imageState = useImageEditorStore.getState();
      const activeNodeIds = new Set<string>();

      for (const node of nodes) {
        if (node.type !== 'slimgNode') continue;
        const boundDocId =
          typeof node.data.slimgBoundDocId === 'string' ? node.data.slimgBoundDocId : undefined;
        if (!boundDocId) continue;
        activeNodeIds.add(node.id);

        const doc = imageState.documents.find((candidate) => candidate.id === boundDocId);
        if (!doc) continue; // closed/detached in Image — keep the last flattened output (snapshot).

        const signature = readBoundDocSignature(doc, imageState, boundDocId);
        if (!boundDocSignatureChanged(lastSignatureByNode.get(node.id), signature)) {
          continue; // nothing committed since we last flattened.
        }
        lastSignatureByNode.set(node.id, signature);

        const pending = timers.get(node.id);
        if (pending) clearTimeout(pending);
        const nodeId = node.id;
        timers.set(
          nodeId,
          setTimeout(() => reflatten(nodeId, boundDocId), REFLATTEN_DEBOUNCE_MS),
        );
      }

      // Drop trackers/timers for nodes that were removed or unbound.
      for (const trackedId of Array.from(lastSignatureByNode.keys())) {
        if (activeNodeIds.has(trackedId)) continue;
        lastSignatureByNode.delete(trackedId);
        const pending = timers.get(trackedId);
        if (pending) {
          clearTimeout(pending);
          timers.delete(trackedId);
        }
      }
    };

    const unsubscribeImage = useImageEditorStore.subscribe(reconcile);
    const unsubscribeFlow = useFlowStore.subscribe(reconcile);
    reconcile();

    return () => {
      disposed = true;
      unsubscribeImage();
      unsubscribeFlow();
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);
}
