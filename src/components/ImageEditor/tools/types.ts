import type {
  BrushSettings,
  EditorOperation,
  ImageDocument,
  ImageLayer,
  SelectionMode,
  SelectionToolSettings,
} from '../../../types/imageEditor';
import type { useImageEditorStore } from '../../../store/imageEditorStore';

export interface Point {
  x: number;
  y: number;
}

/**
 * Modifier-key snapshot taken from the originating PointerEvent or a synthetic
 * KeyboardEvent. Tools read these to pick selection-mode overrides, axis locks,
 * etc.
 */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface ToolEnv {
  doc: ImageDocument;
  activeLayer: ImageLayer | null;
  brushSettings: BrushSettings;
  selectionToolSettings: SelectionToolSettings;
  /** Convert a screen-local (canvas wrapper) point into document pixel space. */
  screenToDoc: (point: Point) => Point;
  /** Convert a document point back to screen-local coords. */
  docToScreen: (point: Point) => Point;
  /** Push an undo entry. */
  pushOperation: (op: EditorOperation) => void;
  /** Direct access to the zustand store for arbitrary state mutations. */
  store: ReturnType<typeof useImageEditorStore.getState>;
  /** Schedule a re-render of the canvas. */
  requestRender: () => void;
  /** Resolve the effective selection mode for this stroke (modifiers override settings). */
  resolveSelectionMode: (mods: Modifiers) => SelectionMode;
}

export interface ToolHandler {
  onPointerDown?(env: ToolEnv, point: Point, mods: Modifiers, event: PointerEvent): void;
  onPointerMove?(env: ToolEnv, point: Point, mods: Modifiers, event: PointerEvent): void;
  onPointerUp?(env: ToolEnv, point: Point, mods: Modifiers, event: PointerEvent): void;
  onKeyDown?(env: ToolEnv, key: string, mods: Modifiers, event: KeyboardEvent): void;
  /** Cleanup when switching to another tool mid-stroke. */
  onCancel?(env: ToolEnv): void;
}

export function modsFrom(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Modifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  };
}

export function resolveModeFromMods(
  base: SelectionMode,
  mods: Modifiers,
): SelectionMode {
  if (mods.shift && mods.alt) return 'intersect';
  if (mods.shift) return 'add';
  if (mods.alt) return 'subtract';
  return base;
}
