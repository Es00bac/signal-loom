import type { SelectionMask } from './SelectionMask';

/**
 * Module-level registry mapping document id → selection mask. Selection masks
 * carry typed arrays that are not appropriate to put inside zustand state
 * (large, mutated frequently, never serialized for persistence). The
 * imageEditorStore tracks `hasSelection` + `selectionVersion` so React
 * subscribers know when to re-render; the actual pixel buffer lives here.
 */
const registry = new Map<string, SelectionMask>();

export function getSelection(docId: string | null | undefined): SelectionMask | undefined {
  if (!docId) return undefined;
  return registry.get(docId);
}

export function setSelection(docId: string, mask: SelectionMask): void {
  registry.set(docId, mask);
}

export function clearSelection(docId: string): void {
  registry.delete(docId);
}

export function hasSelectionFor(docId: string | null | undefined): boolean {
  if (!docId) return false;
  return registry.has(docId);
}

export function clearAllSelections(): void {
  registry.clear();
}
