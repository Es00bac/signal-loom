import {
  cloneMask,
  combineMasks,
  createMask,
  type SelectionMask,
} from '../SelectionMask';
import { getSelection, setSelection } from '../selectionRegistry';
import type { ToolEnv } from './types';
import type { SelectionMode } from '../../../types/imageEditor';

/**
 * Common helper used by every selection tool. Captures the committed mask at
 * stroke start, then on every update rasterizes the tool's transient shape
 * into a fresh mask, combines with the captured mask under the resolved mode,
 * and writes the result into the selection registry. On finish the same merge
 * is committed (the registry is already up to date) and the doc's
 * `hasSelection` flag is bumped.
 */
export class SelectionInteraction {
  private capturedBase: SelectionMask;
  private mode: SelectionMode;
  private docId: string;

  constructor(env: ToolEnv, mode: SelectionMode) {
    this.docId = env.doc.id;
    this.mode = mode;
    const existing = getSelection(this.docId);
    this.capturedBase = existing
      ? cloneMask(existing)
      : createMask(env.doc.width, env.doc.height);
  }

  /**
   * Apply the supplied "shape" mask under the current mode against the captured
   * base, and write the result into the registry. Bumps selection version so
   * the renderer re-paints. Does not yet flag the doc as having-selection.
   */
  preview(env: ToolEnv, shape: SelectionMask): void {
    const next = cloneMask(this.capturedBase);
    combineMasks(next, shape, this.mode);
    setSelection(this.docId, next);
    env.store.bumpSelectionVersion(this.docId);
    env.requestRender();
  }

  /**
   * Commit the latest preview into the document state. After this call,
   * `doc.hasSelection` reflects whether the resulting mask has any non-zero
   * pixels. The undo entry captures the before/after snapshots.
   */
  commit(env: ToolEnv): void {
    const finalMask = getSelection(this.docId);
    if (!finalMask) return;
    const isEmpty = !maskHasAlpha(finalMask);
    env.pushOperation({
      kind: 'selection',
      docId: this.docId,
      before: maskHasAlpha(this.capturedBase)
        ? { width: this.capturedBase.width, height: this.capturedBase.height, data: this.capturedBase.data.slice() }
        : null,
      after: isEmpty
        ? null
        : { width: finalMask.width, height: finalMask.height, data: finalMask.data.slice() },
    });
    env.store.setHasSelection(this.docId, !isEmpty);
  }

  /** Restore the original mask without committing. */
  cancel(env: ToolEnv): void {
    if (maskHasAlpha(this.capturedBase)) {
      setSelection(this.docId, cloneMask(this.capturedBase));
    } else {
      setSelection(this.docId, createMask(env.doc.width, env.doc.height));
    }
    env.store.bumpSelectionVersion(this.docId);
    env.requestRender();
  }
}

function maskHasAlpha(mask: SelectionMask): boolean {
  for (let i = 0; i < mask.data.length; i += 1) {
    if (mask.data[i] > 0) return true;
  }
  return false;
}
