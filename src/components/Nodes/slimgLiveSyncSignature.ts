// Pure change-detection for the .slimg live-sync, extracted from the hook so it can be unit-tested
// without React or the live stores.
//
// The Image editor mutates a layer's canvas bitmap IN PLACE while painting, so the `ImageDocument`
// object reference does NOT change on a stroke — detecting edits by the doc reference (the original bug)
// misses every brush stroke. What DOES change on every committed edit is the per-document history:
// `pushOperation` / undo / redo replace `undoStacks[docId]` and `redoStacks[docId]` with brand-new
// arrays. So a committed edit shows up as a change in those array references. The doc reference is kept
// too, as a fallback for the rarer paths that replace the document object outright.

export interface BoundDocSignature {
  doc: unknown;
  undo: unknown;
  redo: unknown;
}

interface DocumentHistory {
  undoStacks: Record<string, unknown>;
  redoStacks: Record<string, unknown>;
}

export function readBoundDocSignature(
  doc: unknown,
  history: DocumentHistory,
  docId: string,
): BoundDocSignature {
  return { doc, undo: history.undoStacks[docId], redo: history.redoStacks[docId] };
}

export function boundDocSignatureChanged(
  previous: BoundDocSignature | undefined,
  next: BoundDocSignature,
): boolean {
  return (
    !previous ||
    previous.doc !== next.doc ||
    previous.undo !== next.undo ||
    previous.redo !== next.redo
  );
}
