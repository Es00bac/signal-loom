import { describe, expect, it } from 'vitest';
import type { PaperFrame } from '../types/paper';
import {
  PAPER_CANVAS_FRAME_Z_START,
  PAPER_CANVAS_GUIDE_Z,
  buildPaperCanvasFrameLayers,
  resolvePaperCanvasFrameOpacity,
} from './paperCanvasStacking';

function frame(id: string, zIndex: number): PaperFrame {
  return {
    id,
    kind: 'caption',
    label: id,
    xMm: 0,
    yMm: 0,
    widthMm: 20,
    heightMm: 10,
    rotationDeg: 0,
    locked: false,
    text: id,
    typography: {
      fontFamily: 'Inter',
      fontSizePt: 10,
      leadingPt: 12,
      tracking: 0,
      align: 'left',
      hyphenate: true,
      color: '#111827',
      fontWeight: '400',
      fontStyle: 'normal',
    },
    columns: 1,
    fillColor: '#ffffff',
    fillOpacity: 1,
    strokeColor: '#111827',
    strokeOpacity: 1,
    strokeWidthMm: 0.25,
    strokeStyle: 'solid',
    cornerRadiusMm: 0,
    opacity: 1,
    fit: 'cover',
    imageScale: 1,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
    imageRotationDeg: 0,
    textBoxXPercent: 0,
    textBoxYPercent: 0,
    textBoxWidthPercent: 100,
    textBoxHeightPercent: 100,
    textRotationDeg: 0,
    textVerticalAlign: 'top',
    zIndex,
  };
}

describe('paperCanvasStacking', () => {
  it('maps document z-indexes into positive local canvas layers below Paper overlays', () => {
    const layers = buildPaperCanvasFrameLayers([
      frame('local-high', 400),
      frame('inherited-low', -100000),
      frame('caption-mid', 0),
    ]);

    expect(layers.map((layer) => [layer.frame.id, layer.canvasZIndex])).toEqual([
      ['inherited-low', PAPER_CANVAS_FRAME_Z_START],
      ['caption-mid', PAPER_CANVAS_FRAME_Z_START + 1],
      ['local-high', PAPER_CANVAS_FRAME_Z_START + 2],
    ]);
    expect(layers.every((layer) => layer.canvasZIndex > 0)).toBe(true);
    expect(layers.every((layer) => layer.canvasZIndex < PAPER_CANVAS_GUIDE_Z)).toBe(true);
  });

  it('shows inherited artwork at its authored opacity so the canvas matches export', () => {
    expect(resolvePaperCanvasFrameOpacity(frame('parent-rule', 0))).toBe(1);
    const translucentParent: PaperFrame = { ...frame('parent-overlay', 0), inherited: true, opacity: 0.42 };
    const solidParent: PaperFrame = { ...frame('parent-solid', 0), inherited: true, opacity: 1 };
    expect(resolvePaperCanvasFrameOpacity(translucentParent)).toBe(0.42);
    expect(resolvePaperCanvasFrameOpacity(solidParent)).toBe(1);
  });
});
