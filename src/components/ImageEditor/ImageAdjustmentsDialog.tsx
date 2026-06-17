import { useMemo } from 'react';
import { DockableDialog } from '../DockablePanel/DockableDialog';
import { AdjustmentLayerControls } from './ImageEditorAdjustmentControls';
import { adjustmentLayerLabel } from './ImageAdjustmentLayer';
import { buildAdjustmentLayerHistogram } from './ImageAdjustmentHistogram';
import { IMAGE_DOCKABLE_WORKSPACE_ID } from './ImageDockablePanels';
import { useImageEditorStore } from '../../store/imageEditorStore';
import {
  addAdjustmentLayerUndoable,
  commitAdjustmentSettingsUndoable,
} from './imageAdjustmentActions';
import type { AdjustmentLayerKind } from '../../types/imageEditor';

export const IMAGE_ADJUSTMENTS_DIALOG_ID = 'adjustments';

/** Quick-add buttons shown when no adjustment layer is selected. */
const QUICK_ADD_KINDS: AdjustmentLayerKind[] = [
  'brightnessContrast',
  'levels',
  'curves',
  'hueSaturation',
  'exposure',
  'temperatureTint',
  'blackWhite',
  'invert',
];

/**
 * The Photoshop-style Image > Adjustments dialog: an independent, non-modal
 * floating palette (full-screen sheet on phones) that edits the active
 * non-destructive adjustment layer. The menu commands create/select the layer
 * before opening; if none is selected it offers quick-add buttons. Closing the
 * dialog (its handle "x") leaves the adjustment layer in place, exactly like
 * Adobe's adjustment-layer workflow.
 */
export function ImageAdjustmentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeDocId = useImageEditorStore((state) => state.activeDocId);
  const doc = useImageEditorStore(
    (state) => state.documents.find((candidate) => candidate.id === state.activeDocId) ?? null,
  );
  const activeLayer = useMemo(
    () => (doc ? doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? null : null),
    [doc],
  );
  const adjustment =
    activeLayer && activeLayer.type === 'adjustment' ? activeLayer.adjustment ?? null : null;
  const histogram = useMemo(
    () => (doc && activeLayer && adjustment ? buildAdjustmentLayerHistogram(doc, activeLayer) : null),
    [doc, activeLayer, adjustment],
  );

  const title = adjustment ? `Adjustments — ${adjustmentLayerLabel(adjustment.kind)}` : 'Adjustments';

  return (
    <DockableDialog
      open={open}
      onClose={onClose}
      workspaceId={IMAGE_DOCKABLE_WORKSPACE_ID}
      dialogId={IMAGE_ADJUSTMENTS_DIALOG_ID}
      title={title}
      modal={false}
      defaultFloatingRect={{ x: 320, y: 140, width: 340, height: 460 }}
      minSize={{ width: 280, height: 220 }}
    >
      <div className="signal-loom-themed flex min-h-0 flex-1 flex-col gap-3 p-3 text-sm text-gray-100">
        {!activeDocId ? (
          <p className="text-cyan-100/60">Open an image to use adjustments.</p>
        ) : adjustment && activeLayer ? (
          <AdjustmentLayerControls
            adjustment={adjustment}
            disabled={activeLayer.locked}
            histogram={histogram}
            onChange={(next) => commitAdjustmentSettingsUndoable(activeLayer.id, next)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-cyan-100/60">
              Add a non-destructive adjustment layer, or select an existing one in the Layers panel.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ADD_KINDS.map((kind) => (
                <button
                  key={kind}
                  className="theme-surface theme-border rounded-md border px-2 py-1.5 text-left text-xs text-gray-100 transition-colors hover:bg-cyan-500/15"
                  onClick={() => addAdjustmentLayerUndoable(kind)}
                  type="button"
                >
                  {adjustmentLayerLabel(kind)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DockableDialog>
  );
}
