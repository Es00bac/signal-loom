import type { DocumentViewport } from '../../types/imageEditor';
import { docRectToScreen } from './viewport';

export interface CropPreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawCropPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  {
    preview,
    viewport,
  }: {
    preview: CropPreviewRect;
    viewport: DocumentViewport;
  },
): void {
  const rect = docRectToScreen({
    x: preview.x,
    y: preview.y,
    width: preview.w,
    height: preview.h,
  }, viewport);

  ctx.save();
  ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#020617';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));

  ctx.strokeStyle = '#67e8f9';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  ctx.setLineDash([]);
  ctx.restore();
}
