import type { DocumentViewport } from '../../types/imageEditor';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 64;

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom) || zoom <= 0) return ZOOM_MIN;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/**
 * Compute the zoom + pan that fits the entire document inside the container,
 * preserving aspect ratio. Centers the document.
 */
export function fitToContainer(doc: Size, container: Size): DocumentViewport {
  if (doc.width <= 0 || doc.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }
  const zoom = clampZoom(
    Math.min(container.width / doc.width, container.height / doc.height),
  );
  const panX = (container.width - doc.width * zoom) / 2;
  const panY = (container.height - doc.height * zoom) / 2;
  return { zoom, panX, panY };
}

/**
 * Convert a screen-space (container-local) point to document pixel coordinates.
 */
export function screenToDoc(point: Point, viewport: DocumentViewport): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

/**
 * Convert a document pixel-space point to screen (container-local) coordinates.
 */
export function docToScreen(point: Point, viewport: DocumentViewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Apply a zoom factor while keeping `anchor` (in screen coords) at the same
 * document point. Used by Ctrl+wheel and pinch zoom.
 */
export function zoomAround(
  viewport: DocumentViewport,
  anchor: Point,
  factor: number,
): DocumentViewport {
  const before = screenToDoc(anchor, viewport);
  const newZoom = clampZoom(viewport.zoom * factor);
  const ratio = newZoom / viewport.zoom;
  const newPanX = anchor.x - before.x * newZoom;
  const newPanY = anchor.y - before.y * newZoom;
  void ratio; // ratio not directly used; the algebraic form above handles re-centering.
  return { zoom: newZoom, panX: newPanX, panY: newPanY };
}

/**
 * Translate the view by a delta. Both inputs in screen pixels.
 */
export function panBy(viewport: DocumentViewport, dx: number, dy: number): DocumentViewport {
  return {
    zoom: viewport.zoom,
    panX: viewport.panX + dx,
    panY: viewport.panY + dy,
  };
}

/**
 * Compute a screen-space rectangle for a document-space rectangle. Useful for
 * selection bounding boxes and the floating generative-fill prompt anchor.
 */
export function docRectToScreen(
  rect: { x: number; y: number; width: number; height: number },
  viewport: DocumentViewport,
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x * viewport.zoom + viewport.panX,
    y: rect.y * viewport.zoom + viewport.panY,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

/**
 * Snap zoom to the nearest "preset" step (used by Ctrl+= / Ctrl+-).
 * Steps grow geometrically so each press feels like an even jump on screen.
 */
export const ZOOM_STEPS = [
  0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64,
];

export function zoomStepIn(zoom: number): number {
  for (const step of ZOOM_STEPS) {
    if (step > zoom + 0.0001) return clampZoom(step);
  }
  return clampZoom(zoom);
}

export function zoomStepOut(zoom: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] < zoom - 0.0001) return clampZoom(ZOOM_STEPS[i]);
  }
  return clampZoom(zoom);
}

export function zoomViewportStepAroundCenter(
  viewport: DocumentViewport,
  container: Size,
  direction: 'in' | 'out',
): DocumentViewport {
  const targetZoom = direction === 'in' ? zoomStepIn(viewport.zoom) : zoomStepOut(viewport.zoom);
  const safeWidth = Number.isFinite(container.width) && container.width > 0 ? container.width : 0;
  const safeHeight = Number.isFinite(container.height) && container.height > 0 ? container.height : 0;
  const anchor = { x: safeWidth / 2, y: safeHeight / 2 };

  if (targetZoom === viewport.zoom) {
    return { ...viewport, zoom: targetZoom };
  }

  return zoomAround(viewport, anchor, targetZoom / viewport.zoom);
}
