import { describe, expect, it } from 'vitest';
import {
  applyPinch,
  clampZoom,
  computeVisibleDocumentBlit,
  docRectToScreen,
  docToScreen,
  fitToContainer,
  panBy,
  screenToDoc,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAround,
  zoomViewportStepAroundCenter,
  zoomStepIn,
  zoomStepOut,
} from './viewport';

describe('viewport — clampZoom', () => {
  it('clamps to ZOOM_MIN/ZOOM_MAX', () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-1)).toBe(ZOOM_MIN);
    expect(clampZoom(NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Infinity)).toBe(ZOOM_MAX);
    expect(clampZoom(0.5)).toBe(0.5);
  });
});

describe('viewport — fitToContainer', () => {
  it('fits a wide doc by width', () => {
    const v = fitToContainer({ width: 200, height: 100 }, { width: 100, height: 100 });
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.panX).toBe(0);
    expect(v.panY).toBe(25);
  });

  it('fits a tall doc by height', () => {
    const v = fitToContainer({ width: 100, height: 200 }, { width: 100, height: 100 });
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.panX).toBe(25);
    expect(v.panY).toBe(0);
  });

  it('returns identity for zero-size inputs', () => {
    const v = fitToContainer({ width: 0, height: 0 }, { width: 100, height: 100 });
    expect(v.zoom).toBe(1);
    expect(v.panX).toBe(0);
    expect(v.panY).toBe(0);
  });
});

describe('viewport — screenToDoc / docToScreen are inverses', () => {
  it('round-trips a point', () => {
    const v = { zoom: 1.5, panX: 30, panY: 40 };
    const doc = { x: 100, y: 200 };
    const screen = docToScreen(doc, v);
    const back = screenToDoc(screen, v);
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(200);
  });
});

describe('viewport — zoomAround', () => {
  it('keeps the anchor point pinned to the same document pixel', () => {
    const v = { zoom: 1, panX: 0, panY: 0 };
    const anchor = { x: 50, y: 50 };
    const before = screenToDoc(anchor, v);
    const v2 = zoomAround(v, anchor, 2);
    const after = screenToDoc(anchor, v2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(v2.zoom).toBeCloseTo(2);
  });

  it('clamps zoom at boundaries', () => {
    const v = { zoom: ZOOM_MAX, panX: 0, panY: 0 };
    const anchor = { x: 0, y: 0 };
    const v2 = zoomAround(v, anchor, 10);
    expect(v2.zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });
});

describe('viewport — panBy and docRectToScreen', () => {
  it('panBy is additive', () => {
    const v = { zoom: 2, panX: 5, panY: 10 };
    const v2 = panBy(v, 3, 7);
    expect(v2).toEqual({ zoom: 2, panX: 8, panY: 17 });
  });

  it('docRectToScreen scales and offsets', () => {
    const v = { zoom: 2, panX: 10, panY: 20 };
    const r = docRectToScreen({ x: 5, y: 5, width: 10, height: 20 }, v);
    expect(r).toEqual({ x: 20, y: 30, width: 20, height: 40 });
  });
});

describe('viewport — zoom step in/out', () => {
  it('steps up to next preset', () => {
    expect(zoomStepIn(1)).toBeGreaterThan(1);
    expect(zoomStepIn(0.5)).toBeCloseTo(0.6667);
  });

  it('steps down to previous preset', () => {
    expect(zoomStepOut(1)).toBeLessThan(1);
    expect(zoomStepOut(2)).toBeCloseTo(1.5);
  });

  it('clamps at extremes', () => {
    expect(zoomStepIn(ZOOM_MAX)).toBeCloseTo(ZOOM_MAX);
    expect(zoomStepOut(ZOOM_MIN)).toBeCloseTo(ZOOM_MIN);
  });
});

describe('viewport — zoomViewportStepAroundCenter', () => {
  it('steps in around the container center', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    const center = { x: 100, y: 50 };
    const before = screenToDoc(center, viewport);

    const next = zoomViewportStepAroundCenter(viewport, { width: 200, height: 100 }, 'in');
    const after = screenToDoc(center, next);

    expect(next.zoom).toBeCloseTo(1.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('steps out around the container center', () => {
    const viewport = { zoom: 2, panX: -20, panY: 10 };
    const center = { x: 150, y: 75 };
    const before = screenToDoc(center, viewport);

    const next = zoomViewportStepAroundCenter(viewport, { width: 300, height: 150 }, 'out');
    const after = screenToDoc(center, next);

    expect(next.zoom).toBeCloseTo(1.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('viewport — applyPinch (two-finger pinch-zoom + pan)', () => {
  it('zooms in when the fingers spread apart', () => {
    const out = applyPinch({ zoom: 1, panX: 0, panY: 0 }, { dist: 100, midX: 50, midY: 50 }, { dist: 200, midX: 50, midY: 50 });
    expect(out.zoom).toBeGreaterThan(1);
  });

  it('zooms out when the fingers pinch together', () => {
    const out = applyPinch({ zoom: 2, panX: 0, panY: 0 }, { dist: 200, midX: 50, midY: 50 }, { dist: 100, midX: 50, midY: 50 });
    expect(out.zoom).toBeLessThan(2);
  });

  it('pans by the midpoint translation when the distance is unchanged', () => {
    const out = applyPinch({ zoom: 1, panX: 0, panY: 0 }, { dist: 100, midX: 50, midY: 50 }, { dist: 100, midX: 70, midY: 90 });
    expect(out.zoom).toBe(1);
    expect(out.panX).toBe(20);
    expect(out.panY).toBe(40);
  });
});

describe('viewport — computeVisibleDocumentBlit (bounded zoom blit)', () => {
  it('returns the whole document when it fits entirely on the canvas', () => {
    const r = computeVisibleDocumentBlit(100, 50, 400, 300, 800, 600, 1852, 928)!;
    expect(r).not.toBeNull();
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
    expect(r.sw).toBe(800);
    expect(r.sh).toBe(600);
    expect(r.dx).toBe(100);
    expect(r.dy).toBe(50);
    expect(r.dw).toBe(400);
    expect(r.dh).toBe(300);
  });

  it('clamps an extreme zoom-in blit to the canvas (the disappearing-image case)', () => {
    // A real zoom-in frame captured live: 800x600 doc, device 1852x928, doc rect far larger than
    // the canvas. The old code blit the full composite into this giant rect (dropped by the GPU).
    const r = computeVisibleDocumentBlit(-4863, -3878, 11578, 8684, 800, 600, 1852, 928)!;
    expect(r).not.toBeNull();
    // Destination is fully bounded by the canvas — never the unbounded off-screen rect.
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.dw).toBe(1852);
    expect(r.dh).toBe(928);
    expect(r.dx + r.dw).toBeLessThanOrEqual(1852);
    expect(r.dy + r.dh).toBeLessThanOrEqual(928);
    // Source stays inside the document bounds.
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(800 + 1e-6);
    expect(r.sy + r.sh).toBeLessThanOrEqual(600 + 1e-6);
  });

  it('preserves the source->destination mapping exactly (clamp draws identical pixels)', () => {
    const x0 = -200, y0 = -100, rectW = 1600, rectH = 1200, docW = 800, docH = 600, DW = 900, DH = 500;
    const r = computeVisibleDocumentBlit(x0, y0, rectW, rectH, docW, docH, DW, DH)!;
    const scaleX = rectW / docW;
    const scaleY = rectH / docH;
    // Each destination edge maps back to the same source edge as the original full-rect transform.
    expect(x0 + r.sx * scaleX).toBeCloseTo(r.dx, 5);
    expect(y0 + r.sy * scaleY).toBeCloseTo(r.dy, 5);
    expect(x0 + (r.sx + r.sw) * scaleX).toBeCloseTo(r.dx + r.dw, 5);
    expect(y0 + (r.sy + r.sh) * scaleY).toBeCloseTo(r.dy + r.dh, 5);
  });

  it('returns null when the document is entirely off-canvas', () => {
    expect(computeVisibleDocumentBlit(-5000, 0, 1000, 800, 800, 600, 1852, 928)).toBeNull();
    expect(computeVisibleDocumentBlit(2000, 0, 100, 100, 800, 600, 1852, 928)).toBeNull();
    expect(computeVisibleDocumentBlit(0, -5000, 1000, 800, 800, 600, 1852, 928)).toBeNull();
  });

  it('returns null for degenerate sizes', () => {
    expect(computeVisibleDocumentBlit(0, 0, 0, 300, 800, 600, 1852, 928)).toBeNull();
    expect(computeVisibleDocumentBlit(0, 0, 400, 300, 0, 600, 1852, 928)).toBeNull();
    expect(computeVisibleDocumentBlit(0, 0, 400, 300, 800, 600, 0, 928)).toBeNull();
  });
});
