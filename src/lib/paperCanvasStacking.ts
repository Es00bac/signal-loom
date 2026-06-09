import type { PaperFrame } from '../types/paper';

export const PAPER_CANVAS_FRAME_Z_START = 100;
export const PAPER_CANVAS_GUIDE_Z = 10_000;
export const PAPER_CANVAS_BLEED_Z = 10_010;
export const PAPER_CANVAS_CUT_Z = 10_020;

export interface PaperCanvasFrameLayer {
  frame: PaperFrame;
  stackIndex: number;
  canvasZIndex: number;
}

export function buildPaperCanvasFrameLayers(frames: PaperFrame[]): PaperCanvasFrameLayer[] {
  return frames
    .map((frame, inputIndex) => ({ frame, inputIndex }))
    .sort((a, b) => a.frame.zIndex - b.frame.zIndex || a.inputIndex - b.inputIndex)
    .map(({ frame }, stackIndex) => ({
      frame,
      stackIndex,
      canvasZIndex: PAPER_CANVAS_FRAME_Z_START + stackIndex,
    }));
}
