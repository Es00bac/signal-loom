import type { ToolEnv, ToolHandler, Point } from './types';
import { blitInto, createBitmap } from '../LayerBitmap';
import type { ImageLayer } from '../../../types/imageEditor';

interface State {
  start: Point;
  current: Point;
  origLayers: ImageLayer[];
  origWidth: number;
  origHeight: number;
}

let state: State | null = null;

/**
 * PHASE1: Drag a rectangle, press Enter to commit. Esc cancels. The crop
 * resizes the document to the rectangle's dimensions and offsets every layer
 * so the rectangle's top-left maps to (0,0).
 *
 * The drag rectangle preview uses the renderer's overlay mechanism — for now
 * the in-progress rectangle is stored in module state and read by the
 * dispatcher; final commit replaces the layers + dimensions atomically.
 */
export const cropTool: ToolHandler = {
  onPointerDown(env, point) {
    state = {
      start: point,
      current: point,
      origLayers: env.doc.layers,
      origWidth: env.doc.width,
      origHeight: env.doc.height,
    };
    env.requestRender();
  },

  onPointerMove(env, point) {
    if (!state) return;
    state.current = point;
    env.requestRender();
  },

  onPointerUp(env) {
    if (!state) return;
    env.requestRender();
  },

  onKeyDown(env, key) {
    if (!state) return;
    if (key === 'Enter') {
      commit(env);
    } else if (key === 'Escape') {
      state = null;
      env.requestRender();
    }
  },

  onCancel() {
    state = null;
  },
};

export function getCropPreview(): { x: number; y: number; w: number; h: number } | null {
  if (!state) return null;
  const x = Math.min(state.start.x, state.current.x);
  const y = Math.min(state.start.y, state.current.y);
  const w = Math.abs(state.current.x - state.start.x);
  const h = Math.abs(state.current.y - state.start.y);
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function commit(env: ToolEnv): void {
  const preview = getCropPreview();
  if (!state || !preview) return;
  const { x, y, w, h } = preview;
  const newWidth = Math.max(1, Math.round(w));
  const newHeight = Math.max(1, Math.round(h));

  const newLayers: ImageLayer[] = state.origLayers.map((layer) => {
    if (!layer.bitmap) {
      return { ...layer, x: layer.x - x, y: layer.y - y };
    }
    const cropped = createBitmap(newWidth, newHeight);
    const ctx = cropped.getContext('2d');
    if (ctx) {
      ctx.drawImage(layer.bitmap, layer.x - x, layer.y - y);
    }
    return {
      ...layer,
      x: 0,
      y: 0,
      bitmap: cropped,
      bitmapVersion: layer.bitmapVersion + 1,
      mask: null,
    };
  });

  env.pushOperation({
    kind: 'docResize',
    docId: env.doc.id,
    before: {
      width: state.origWidth,
      height: state.origHeight,
      layers: state.origLayers,
    },
    after: {
      width: newWidth,
      height: newHeight,
      layers: newLayers,
    },
  });

  // Apply: replace layers + dimensions.
  for (const layer of state.origLayers) {
    env.store.removeLayer(env.doc.id, layer.id);
  }
  for (const layer of newLayers) {
    env.store.addLayer(env.doc.id, layer);
  }
  env.store.setDocumentDimensions(env.doc.id, newWidth, newHeight);
  state = null;
  void blitInto;
  env.requestRender();
}
