import { describe, expect, it } from 'vitest';
import {
  clampZoom,
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
