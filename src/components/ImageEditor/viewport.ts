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

/** A two-finger sample: distance between fingers and their midpoint (screen coords). */
export interface PinchSample {
  dist: number;
  midX: number;
  midY: number;
}

/**
 * Apply one incremental two-finger pinch step: zoom by the change in finger
 * distance anchored at the new midpoint, then pan by the midpoint translation.
 * Drives two-finger pinch-zoom + pan on the image canvas.
 */
export function applyPinch(
  viewport: DocumentViewport,
  prev: PinchSample,
  next: PinchSample,
): DocumentViewport {
  const factor = prev.dist > 0 ? next.dist / prev.dist : 1;
  const zoomed = zoomAround(viewport, { x: next.midX, y: next.midY }, factor);
  return panBy(zoomed, next.midX - prev.midX, next.midY - prev.midY);
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

export interface DocumentBlitRegion {
  /** Source sub-rectangle in document (composite) pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination sub-rectangle in device (canvas backing-store) pixels. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Given the document's full device-space placement rect `(x0, y0, rectW, rectH)` (already snapped +
 * DPR-scaled) and the device canvas size, return only the part of the document that actually lands
 * on the canvas — as a source rect in document pixels and a destination rect in device pixels.
 *
 * Why: at high zoom the full document maps to a destination far larger than the canvas
 * (rectW ≈ docWidth × zoom × DPR). Blitting the whole composite into that giant off-canvas rect is
 * wasteful and — on a real GPU compositor surface (Electron/native Wayland, worst at HiDPI) — the
 * oversized scaled drawImage can be dropped entirely, leaving only the checkerboard (a plain
 * fillRect, which the GPU clips fine). Clamping the blit to the visible region keeps the destination
 * within the canvas, so the image always draws. Returns null when the document is fully off-canvas.
 */
export function computeVisibleDocumentBlit(
  x0: number,
  y0: number,
  rectW: number,
  rectH: number,
  docWidth: number,
  docHeight: number,
  deviceWidth: number,
  deviceHeight: number,
): DocumentBlitRegion | null {
  if (!(rectW > 0) || !(rectH > 0) || !(docWidth > 0) || !(docHeight > 0)) return null;
  if (!(deviceWidth > 0) || !(deviceHeight > 0)) return null;

  const vx0 = Math.max(0, x0);
  const vy0 = Math.max(0, y0);
  const vx1 = Math.min(deviceWidth, x0 + rectW);
  const vy1 = Math.min(deviceHeight, y0 + rectH);
  if (vx1 <= vx0 || vy1 <= vy0) return null;

  const scaleX = rectW / docWidth;
  const scaleY = rectH / docHeight;
  const sx = Math.max(0, (vx0 - x0) / scaleX);
  const sy = Math.max(0, (vy0 - y0) / scaleY);
  return {
    sx,
    sy,
    sw: Math.min(docWidth - sx, (vx1 - vx0) / scaleX),
    sh: Math.min(docHeight - sy, (vy1 - vy0) / scaleY),
    dx: vx0,
    dy: vy0,
    dw: vx1 - vx0,
    dh: vy1 - vy0,
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
