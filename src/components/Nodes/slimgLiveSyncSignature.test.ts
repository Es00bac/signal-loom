import { describe, expect, it } from 'vitest';
import { boundDocSignatureChanged, readBoundDocSignature } from './slimgLiveSyncSignature';

// Regression coverage for the bug where the .slimg node's Output never updated as you painted in Image:
// the detector keyed off the ImageDocument reference, which the editor mutates IN PLACE, so it never
// changed. The fix keys off the per-document undo/redo stack references, which `pushOperation` replaces
// on every committed edit.
describe('slimg live-sync change detection', () => {
  const DOC_ID = 'slimg-flow-1';

  it('is always a change on first observation', () => {
    const sig = readBoundDocSignature({ id: DOC_ID }, { undoStacks: {}, redoStacks: {} }, DOC_ID);
    expect(boundDocSignatureChanged(undefined, sig)).toBe(true);
  });

  it('detects a committed brush stroke (a new undoStacks[docId] array) — the painting case', () => {
    const doc = { id: DOC_ID }; // SAME doc object both times (mutated in place, ref unchanged)
    const before = readBoundDocSignature(doc, { undoStacks: {}, redoStacks: {} }, DOC_ID);
    const after = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: [{ kind: 'paint' }] }, redoStacks: {} }, DOC_ID);
    expect(boundDocSignatureChanged(before, after)).toBe(true);
  });

  it('does NOT re-flatten when nothing was committed (identical references)', () => {
    const doc = { id: DOC_ID };
    const undo = [{ kind: 'paint' }];
    const a = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: undo }, redoStacks: {} }, DOC_ID);
    const b = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: undo }, redoStacks: {} }, DOC_ID);
    expect(boundDocSignatureChanged(a, b)).toBe(false);
  });

  it('detects undo/redo via the redo stack reference', () => {
    const doc = { id: DOC_ID };
    const undo = [{ kind: 'paint' }];
    const before = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: undo }, redoStacks: {} }, DOC_ID);
    const after = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: undo }, redoStacks: { [DOC_ID]: [{ kind: 'paint' }] } }, DOC_ID);
    expect(boundDocSignatureChanged(before, after)).toBe(true);
  });

  it('detects a replaced document object (fallback for paths that swap the doc)', () => {
    const history = { undoStacks: { [DOC_ID]: [{ kind: 'paint' }] }, redoStacks: {} };
    const before = readBoundDocSignature({ id: DOC_ID }, history, DOC_ID);
    const after = readBoundDocSignature({ id: DOC_ID }, history, DOC_ID); // different object, same content
    expect(boundDocSignatureChanged(before, after)).toBe(true);
  });

  it('ignores edits to OTHER documents (only the bound doc id matters)', () => {
    const doc = { id: DOC_ID };
    const undo = [{ kind: 'paint' }];
    const before = readBoundDocSignature(doc, { undoStacks: { [DOC_ID]: undo }, redoStacks: {} }, DOC_ID);
    const after = readBoundDocSignature(
      doc,
      { undoStacks: { [DOC_ID]: undo, 'other-doc': [{ kind: 'paint' }] }, redoStacks: {} },
      DOC_ID,
    );
    expect(boundDocSignatureChanged(before, after)).toBe(false);
  });
});
