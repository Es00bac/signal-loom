import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { createMask, setPolygon, type SelectionMask } from '../SelectionMask';
import { SelectionInteraction } from './selectionInteraction';

interface FreehandState {
  kind: 'freehand';
  points: Point[];
  interaction: SelectionInteraction;
}

interface PolygonalState {
  kind: 'polygonal';
  points: Point[];
  interaction: SelectionInteraction;
  cursor: Point;
}

let state: FreehandState | PolygonalState | null = null;

export const lassoTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    if (env.selectionToolSettings.lassoShape === 'polygonal') {
      handlePolygonalDown(env, point, mods);
    } else {
      handleFreehandDown(env, point, mods);
    }
  },

  onPointerMove(env, point) {
    if (!state) return;
    if (state.kind === 'freehand') {
      state.points.push(point);
      previewFreehand(env);
    } else {
      state.cursor = point;
      previewPolygonal(env);
    }
  },

  onPointerUp(env, _point, mods) {
    if (!state) return;
    if (state.kind === 'freehand') {
      previewFreehand(env);
      state.interaction.commit(env);
      state = null;
    } else {
      // polygonal: do nothing on regular up; double-click or Enter closes.
      if (mods.alt) finalizePolygonal(env);
    }
  },

  onKeyDown(env, key) {
    if (!state) return;
    if (state.kind === 'polygonal') {
      if (key === 'Enter') finalizePolygonal(env);
      else if (key === 'Escape') {
        state.interaction.cancel(env);
        state = null;
      }
    }
    if (key === 'Escape') {
      if (state) {
        state.interaction.cancel(env);
        state = null;
      }
    }
  },

  onCancel(env) {
    if (!state) return;
    state.interaction.cancel(env);
    state = null;
  },
};

function handleFreehandDown(env: ToolEnv, point: Point, mods: Modifiers): void {
  const mode = env.resolveSelectionMode(mods);
  state = {
    kind: 'freehand',
    points: [point],
    interaction: new SelectionInteraction(env, mode),
  };
}

function handlePolygonalDown(env: ToolEnv, point: Point, mods: Modifiers): void {
  if (state && state.kind === 'polygonal') {
    state.points.push(point);
    state.cursor = point;
    previewPolygonal(env);
    return;
  }
  const mode = env.resolveSelectionMode(mods);
  state = {
    kind: 'polygonal',
    points: [point],
    cursor: point,
    interaction: new SelectionInteraction(env, mode),
  };
}

function previewFreehand(env: ToolEnv): void {
  if (!state || state.kind !== 'freehand') return;
  if (state.points.length < 3) return;
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, state.points);
  state.interaction.preview(env, shape);
}

function previewPolygonal(env: ToolEnv): void {
  if (!state || state.kind !== 'polygonal') return;
  if (state.points.length < 2) return;
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, [...state.points, state.cursor]);
  state.interaction.preview(env, shape);
}

function finalizePolygonal(env: ToolEnv): void {
  if (!state || state.kind !== 'polygonal') return;
  if (state.points.length < 3) {
    state.interaction.cancel(env);
    state = null;
    return;
  }
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setPolygon(shape, state.points);
  state.interaction.preview(env, shape);
  state.interaction.commit(env);
  state = null;
}

export function lassoIsPolygonalActive(): boolean {
  return state?.kind === 'polygonal';
}

export function lassoPolygonalDoubleClick(env: ToolEnv): void {
  if (state?.kind === 'polygonal') finalizePolygonal(env);
}
