import { describe, expect, it } from 'vitest';
import { drawCropPreviewOverlay } from './ImageCropOverlay';
import type { DocumentViewport } from '../../types/imageEditor';

class FakeContext {
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 0;
  saved = 0;
  rects: Array<{ x: number; y: number; w: number; h: number; mode: 'fill' | 'stroke' }> = [];

  save() {
    this.saved += 1;
  }

  restore() {
    this.saved -= 1;
  }

  setLineDash() {}

  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, mode: 'fill' });
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, mode: 'stroke' });
  }
}

describe('ImageCropOverlay', () => {
  it('draws the current crop rectangle in screen space', () => {
    const ctx = new FakeContext();
    const viewport: DocumentViewport = { zoom: 2, panX: 10, panY: 20 };

    drawCropPreviewOverlay(ctx as unknown as CanvasRenderingContext2D, {
      preview: { x: 5, y: 6, w: 20, h: 10 },
      viewport,
    });

    expect(ctx.rects).toEqual([
      { x: 20, y: 32, w: 40, h: 20, mode: 'fill' },
      { x: 20.5, y: 32.5, w: 39, h: 19, mode: 'stroke' },
      { x: 20.5, y: 32.5, w: 39, h: 19, mode: 'stroke' },
    ]);
    expect(ctx.saved).toBe(0);
  });
});
