// Pure text-wrap / runaround core for the Paper workspace. Turns an obstacle frame's `textWrap`
// setting into an outline polygon (in document mm) and then into frame-local exclusions that
// `paperTextFlow` uses to narrow line boxes around the obstacle. Framework-free and fully testable;
// the renderer reuses the same polygons for the on-canvas standoff and the CSS `shape-outside` path.

import type { PaperFrame } from '../types/paper';
import type { PaperTextFlowExclusion, PaperTextFlowPoint } from './paperTextFlow';

/** Segment count used to approximate an elliptical / round obstacle as a polygon. */
const ELLIPSE_SEGMENTS = 28;

type WrapFrame = Pick<
  PaperFrame,
  'id' | 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'shapeKind' | 'vertices' | 'textWrap'
>;

function boundingBox(frame: WrapFrame): PaperTextFlowPoint[] {
  const { xMm, yMm, widthMm, heightMm } = frame;
  return [
    { xMm, yMm },
    { xMm: xMm + widthMm, yMm },
    { xMm: xMm + widthMm, yMm: yMm + heightMm },
    { xMm, yMm: yMm + heightMm },
  ];
}

function ellipseOutline(frame: WrapFrame): PaperTextFlowPoint[] {
  const cx = frame.xMm + frame.widthMm / 2;
  const cy = frame.yMm + frame.heightMm / 2;
  const rx = frame.widthMm / 2;
  const ry = frame.heightMm / 2;
  return Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
    const theta = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    return { xMm: cx + Math.cos(theta) * rx, yMm: cy + Math.sin(theta) * ry };
  });
}

function verticesOutline(frame: WrapFrame): PaperTextFlowPoint[] | null {
  const verts = frame.vertices;
  if (!verts || verts.length < 3) return null;
  return verts.map((v) => ({
    xMm: frame.xMm + (v.xPercent / 100) * frame.widthMm,
    yMm: frame.yMm + (v.yPercent / 100) * frame.heightMm,
  }));
}

/**
 * The obstacle outline for `frame` in document mm, or null when the frame does not wrap text.
 * boundingBox / jumpObject use the frame rectangle; contour traces the frame's own shape —
 * free-form / SVG / polygon vertices, an elliptical outline for round shapes, else the rectangle.
 */
export function resolveFrameWrapPolygon(frame: WrapFrame): PaperTextFlowPoint[] | null {
  const wrap = frame.textWrap;
  if (!wrap || wrap.mode === 'none') return null;
  if (frame.widthMm <= 0 || frame.heightMm <= 0) return null;

  if (wrap.mode === 'boundingBox' || wrap.mode === 'jumpObject') {
    return boundingBox(frame);
  }

  // contour
  if (wrap.contourSource === 'vertices') {
    return verticesOutline(frame) ?? boundingBox(frame);
  }
  // frameShape: prefer real vertices, then an ellipse for round shapes, else the rectangle.
  const fromVertices = verticesOutline(frame);
  if (fromVertices) return fromVertices;
  if (frame.shapeKind === 'ellipse') return ellipseOutline(frame);
  return boundingBox(frame);
}

/** Translate a document-mm polygon into an exclusion in `textFrame`'s local mm space. */
export function toFrameLocalExclusion(
  polygon: PaperTextFlowPoint[],
  textFrame: Pick<PaperFrame, 'xMm' | 'yMm'>,
  standoffMm: number,
): PaperTextFlowExclusion {
  return {
    points: polygon.map((p) => ({ xMm: p.xMm - textFrame.xMm, yMm: p.yMm - textFrame.yMm })),
    standoffMm,
  };
}

/**
 * Every wrap exclusion that applies to `textFrame`, gathered from the other frames on the page.
 * The text-flow core ignores exclusions that fall outside the frame's columns, so a simple sweep
 * over all wrapping frames is correct (and cheap for typical page frame counts).
 */
export function resolveExclusionsForTextFrame(
  textFrame: Pick<PaperFrame, 'id' | 'xMm' | 'yMm'>,
  frames: WrapFrame[],
): PaperTextFlowExclusion[] {
  const exclusions: PaperTextFlowExclusion[] = [];
  for (const frame of frames) {
    if (frame.id === textFrame.id) continue;
    const polygon = resolveFrameWrapPolygon(frame);
    if (!polygon) continue;
    exclusions.push(toFrameLocalExclusion(polygon, textFrame, Math.max(0, frame.textWrap?.standoffMm ?? 0)));
  }
  return exclusions;
}
