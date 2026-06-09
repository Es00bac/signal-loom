import type { ToolHandler, Point } from './types';

interface MoveState {
  layerId: string;
  startPoint: Point;
  origin: { x: number; y: number; rotationDeg?: number };
}

let active: MoveState | null = null;

export const moveTool: ToolHandler = {
  onPointerDown(env, point) {
    if (!env.activeLayer || env.activeLayer.locked) {
      active = null;
      return;
    }
    active = {
      layerId: env.activeLayer.id,
      startPoint: point,
      origin: {
        x: env.activeLayer.x,
        y: env.activeLayer.y,
        rotationDeg: env.activeLayer.rotationDeg ?? 0,
      },
    };
  },

  onPointerMove(env, point, mods) {
    if (!active) return;
    let dx = point.x - active.startPoint.x;
    let dy = point.y - active.startPoint.y;
    if (mods.shift) {
      // Constrain to the dominant axis.
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    env.store.updateLayer(env.doc.id, active.layerId, {
      x: active.origin.x + dx,
      y: active.origin.y + dy,
    });
    env.requestRender();
  },

  onPointerUp(env) {
    if (!active) return;
    const layer = env.doc.layers.find((l) => l.id === active!.layerId);
    if (layer && (layer.x !== active.origin.x || layer.y !== active.origin.y)) {
      env.pushOperation({
        kind: 'transform',
        docId: env.doc.id,
        layerId: layer.id,
        before: active.origin,
        after: { x: layer.x, y: layer.y, rotationDeg: layer.rotationDeg ?? 0 },
      });
    }
    active = null;
  },

  onCancel() {
    active = null;
  },
};
