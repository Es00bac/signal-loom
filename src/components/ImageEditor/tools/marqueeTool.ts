import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { createMask, setEllipse, setRect, type SelectionMask } from '../SelectionMask';
import { SelectionInteraction } from './selectionInteraction';

interface State {
  start: Point;
  fromCenter: boolean;
  square: boolean;
  interaction: SelectionInteraction;
}

let state: State | null = null;

export const marqueeTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    const mode = env.resolveSelectionMode(mods);
    state = {
      start: point,
      fromCenter: mods.alt,
      square: mods.shift,
      interaction: new SelectionInteraction(env, mode),
    };
    update(env, point, mods);
  },

  onPointerMove(env, point, mods) {
    if (!state) return;
    update(env, point, mods);
  },

  onPointerUp(env) {
    if (!state) return;
    state.interaction.commit(env);
    state = null;
  },

  onCancel(env) {
    if (!state) return;
    state.interaction.cancel(env);
    state = null;
  },
};

function update(env: ToolEnv, point: Point, mods: Modifiers): void {
  if (!state) return;
  const start = state.start;
  let x0 = start.x;
  let y0 = start.y;
  let x1 = point.x;
  let y1 = point.y;

  if (mods.shift) {
    const w = x1 - x0;
    const h = y1 - y0;
    const size = Math.max(Math.abs(w), Math.abs(h));
    x1 = x0 + Math.sign(w || 1) * size;
    y1 = y0 + Math.sign(h || 1) * size;
  }
  if (mods.alt) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    x0 -= dx;
    y0 -= dy;
  }

  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  if (width <= 0 || height <= 0) return;

  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  if (env.selectionToolSettings.marqueeShape === 'ellipse') {
    setEllipse(
      shape,
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      255,
      env.selectionToolSettings.antiAlias,
    );
  } else {
    setRect(shape, x, y, width, height, 255, env.selectionToolSettings.antiAlias);
  }

  state.interaction.preview(env, shape);
}
