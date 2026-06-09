import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { maskToCanvas, type SelectionMask } from './SelectionMask';
import { drawCropPreviewOverlay } from './ImageCropOverlay';
import { getCropPreview } from './tools/cropTool';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { createBitmap } from './LayerBitmap';
import { renderLayerWithEffects } from './ImageLayerEffects';

import {
  renderImageDocumentLayersToBitmap,
  applyAdjustmentToImageData,
  applyAdjustmentToPixel,
  applyBlackWhite,
  applyBrightnessContrast,
  applyByChannel,
  applyCurvesChannel,
  applyExposure,
  applyHueSaturation,
  applyLevelsChannel,
  applyTemperatureTint,
  cloneImageData,
  evaluateCurvePoints,
  hslToRgb,
  hueToRgb,
  rgbToHsl,
  clamp,
  clamp01,
  clampByte,
  wrap01,
} from './ImageAdjustmentLayer';

const ANTS_DASH_LENGTH = 4;
const ANTS_PERIOD_MS = 600;

function getHighResWorkerBlobUrl(): string {
  const code = `
    ${applyAdjustmentToImageData.toString()}
    ${applyAdjustmentToPixel.toString()}
    ${applyBlackWhite.toString()}
    ${applyBrightnessContrast.toString()}
    ${applyByChannel.toString()}
    ${applyCurvesChannel.toString()}
    ${applyExposure.toString()}
    ${applyHueSaturation.toString()}
    ${applyLevelsChannel.toString()}
    ${applyTemperatureTint.toString()}
    ${cloneImageData.toString()}
    ${evaluateCurvePoints.toString()}
    ${hslToRgb.toString()}
    ${hueToRgb.toString()}
    ${rgbToHsl.toString()}
    ${clamp.toString()}
    ${clamp01.toString()}
    ${clampByte.toString()}
    ${wrap01.toString()}

    self.onmessage = async function(e) {
      const { docWidth, docHeight, layers } = e.data;
      const canvas = new OffscreenCanvas(docWidth, docHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      for (const layer of layers) {
        if (!layer.visible) continue;

        if (layer.type === 'adjustment' && layer.adjustment) {
          const source = ctx.getImageData(0, 0, docWidth, docHeight);
          let maskData = undefined;
          if (layer.maskBitmap) {
            const maskCanvas = new OffscreenCanvas(layer.maskBitmap.width, layer.maskBitmap.height);
            const mCtx = maskCanvas.getContext('2d');
            if (mCtx) {
              mCtx.drawImage(layer.maskBitmap, 0, 0);
              maskData = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            }
          }
          const adjusted = applyAdjustmentToImageData(source, layer.adjustment, {
            opacity: layer.opacity,
            mask: maskData,
          });
          ctx.putImageData(adjusted, 0, 0);
          continue;
        }

        if (layer.bitmap) {
          ctx.save();
          ctx.globalAlpha = clamp01(layer.opacity);
          const blend = layer.blendMode;
          ctx.globalCompositeOperation = blend === 'normal' ? 'source-over' : blend;

          const rotation = layer.rotationDeg || 0;
          const left = (layer.x || 0) + (layer.offsetX || 0);
          const top = (layer.y || 0) + (layer.offsetY || 0);
          const width = layer.bitmap.width;
          const height = layer.bitmap.height;

          if (rotation === 0) {
            ctx.drawImage(layer.bitmap, left, top);
          } else {
            ctx.translate(left + width / 2, top + height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(layer.bitmap, -width / 2, -height / 2);
          }
          ctx.restore();
        }
      }

      const outBitmap = canvas.transferToImageBitmap();
      self.postMessage({ result: outBitmap }, [outBitmap]);
    };
  `;
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

export class CompositeRenderer {
  private canvas: HTMLCanvasElement;
  private wrapper: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private antsRafId: number | null = null;
  private antsStart = 0;
  private currentDoc: ImageDocument | null = null;
  private currentSelection: SelectionMask | null = null;
  private deviceWidth = 0;
  private deviceHeight = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  private workerResultBitmap: ImageBitmap | HTMLCanvasElement | LayerBitmap | null = null;
  private workerDocSignature: string | null = null;
  private isWorkerRunning = false;
  private lowResDoc: ImageDocument | null = null;
  private lowResScale = 1;
  private workerObj: Worker | null = null;
  private workerBlobUrl: string | null = null;

  constructor(canvas: HTMLCanvasElement, wrapper: HTMLElement) {
    this.canvas = canvas;
    this.wrapper = wrapper;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D context for composite renderer');
    }
    this.ctx = ctx;
    this.attachResizeObserver();
    this.syncSize();
    window.addEventListener('sloom-svg-loaded', this.handleSvgLoaded);
  }

  private handleSvgLoaded = (): void => {
    this.requestRender();
  };

  destroy(): void {
    window.removeEventListener('sloom-svg-loaded', this.handleSvgLoaded);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.antsRafId !== null) cancelAnimationFrame(this.antsRafId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.rafId = null;
    this.antsRafId = null;
    this.currentDoc = null;
    this.currentSelection = null;
    this.cleanupWorker();
  }

  private cleanupWorker(): void {
    if (this.workerObj) {
      this.workerObj.terminate();
      this.workerObj = null;
    }
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
      this.workerBlobUrl = null;
    }
    this.isWorkerRunning = false;
    this.workerDocSignature = null;
    this.closeWorkerResultBitmap();
  }

  private closeWorkerResultBitmap(): void {
    if (this.workerResultBitmap && 'close' in this.workerResultBitmap) {
      (this.workerResultBitmap as ImageBitmap).close();
    }
    this.workerResultBitmap = null;
  }

  getCssSize(): { width: number; height: number } {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  setInputs(doc: ImageDocument | null, selection: SelectionMask | null): void {
    this.currentDoc = doc;
    this.currentSelection = selection;
    this.requestRender();
    if (selection) {
      this.startAntsLoop();
    } else {
      this.stopAntsLoop();
    }
  }

  requestRender(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.draw();
    });
  }

  private attachResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.syncSize()) this.requestRender();
    });
    this.resizeObserver.observe(this.wrapper);
  }

  private syncSize(): boolean {
    const rect = this.wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const deviceWidth = Math.floor(cssWidth * dpr);
    const deviceHeight = Math.floor(cssHeight * dpr);
    if (
      cssWidth === this.cssWidth &&
      cssHeight === this.cssHeight &&
      deviceWidth === this.deviceWidth &&
      deviceHeight === this.deviceHeight
    ) {
      return false;
    }
    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.deviceWidth = deviceWidth;
    this.deviceHeight = deviceHeight;
    this.canvas.width = deviceWidth;
    this.canvas.height = deviceHeight;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    return true;
  }

  private startAntsLoop(): void {
    if (this.antsRafId !== null) return;
    this.antsStart = performance.now();
    const tick = () => {
      this.antsRafId = requestAnimationFrame(tick);
      this.draw();
    };
    this.antsRafId = requestAnimationFrame(tick);
  }

  private stopAntsLoop(): void {
    if (this.antsRafId === null) return;
    cancelAnimationFrame(this.antsRafId);
    this.antsRafId = null;
  }

  private buildDocSignature(doc: ImageDocument): string {
    return JSON.stringify({
      width: doc.width,
      height: doc.height,
      layers: doc.layers.map(l => ({
        id: l.id,
        visible: l.visible,
        opacity: l.opacity,
        blendMode: l.blendMode,
        x: l.x,
        y: l.y,
        rotationDeg: l.rotationDeg,
        adjustment: l.adjustment,
        bitmapVersion: l.bitmapVersion,
        effects: l.effects,
        filters: l.filters,
      }))
    });
  }

  private prepareLowResDoc(doc: ImageDocument): void {
    const maxDim = Math.max(doc.width, doc.height);
    this.lowResScale = Math.min(1, 1024 / maxDim);

    if (this.lowResScale >= 1) {
      this.lowResDoc = doc;
      return;
    }

    const scaledWidth = Math.round(doc.width * this.lowResScale);
    const scaledHeight = Math.round(doc.height * this.lowResScale);

    // If it's already built for this doc structure (minus volatile adjustment values) we just update volatiles
    // A full re-downscale is only needed if bitmaps/structure changed.
    // For simplicity, we create a proxy doc on the fly.
    const layers = doc.layers.map(layer => {
      let scaledBitmap = null;
      if (layer.bitmap && layer.type !== 'adjustment') {
        scaledBitmap = createBitmap(Math.max(1, Math.round(layer.bitmap.width * this.lowResScale)), Math.max(1, Math.round(layer.bitmap.height * this.lowResScale)));
        const sCtx = scaledBitmap.getContext('2d');
        if (sCtx) {
          sCtx.drawImage(layer.bitmap, 0, 0, layer.bitmap.width, layer.bitmap.height, 0, 0, scaledBitmap.width, scaledBitmap.height);
        }
      }

      let scaledMask = null;
      if (layer.mask) {
        scaledMask = createBitmap(Math.max(1, Math.round(layer.mask.width * this.lowResScale)), Math.max(1, Math.round(layer.mask.height * this.lowResScale)));
        const sCtx = scaledMask.getContext('2d');
        if (sCtx) {
          sCtx.drawImage(layer.mask, 0, 0, layer.mask.width, layer.mask.height, 0, 0, scaledMask.width, scaledMask.height);
        }
      }

      return {
        ...layer,
        x: layer.x * this.lowResScale,
        y: layer.y * this.lowResScale,
        bitmap: scaledBitmap || layer.bitmap, // fallback to original if scaling failed or it's an adjustment
        mask: scaledMask || layer.mask,
      };
    });

    this.lowResDoc = {
      ...doc,
      width: scaledWidth,
      height: scaledHeight,
      layers,
    };
  }

  private async runHighResWorker(doc: ImageDocument): Promise<void> {
    const signature = this.buildDocSignature(doc);
    if (this.workerDocSignature === signature || this.isWorkerRunning) {
      return; // Already rendering or rendered this exact state
    }

    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      // Synchronous fallback
      this.closeWorkerResultBitmap();
      this.workerResultBitmap = renderImageDocumentLayersToBitmap(doc);
      this.workerDocSignature = signature;
      this.requestRender();
      return;
    }

    this.isWorkerRunning = true;
    this.workerDocSignature = signature;

    if (!this.workerObj) {
      if (!this.workerBlobUrl) {
        this.workerBlobUrl = getHighResWorkerBlobUrl();
      }
      this.workerObj = new Worker(this.workerBlobUrl);
    }

    // Prepare transferable data
    const transferables: Transferable[] = [];

    // We map the doc's layers, rendering effects to flat bitmaps before sending
    const mappedLayers = await Promise.all(doc.layers.map(async layer => {
      if (!layer.visible) return { visible: false };

      if (layer.type === 'adjustment') {
        let maskBitmap = null;
        if (layer.mask) {
          maskBitmap = await createImageBitmap(layer.mask);
          transferables.push(maskBitmap);
        }
        return {
          type: 'adjustment',
          visible: true,
          adjustment: layer.adjustment,
          opacity: layer.opacity,
          maskBitmap,
        };
      }

      // Normal layer
      const styled = layer.effects?.some((effect) => effect.enabled) || layer.filters?.some((filter) => filter.enabled)
        ? renderLayerWithEffects(layer)
        : null;

      const bitmapToTransfer = styled
        ? styled.bitmap
        : (layer.mask ? this.composeLayerWithMask(layer) : layer.bitmap);

      let imageBitmap = null;
      if (bitmapToTransfer) {
        imageBitmap = await createImageBitmap(bitmapToTransfer);
        transferables.push(imageBitmap);
      }

      return {
        type: layer.type,
        visible: true,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        x: layer.x,
        y: layer.y,
        rotationDeg: layer.rotationDeg,
        offsetX: styled?.offsetX || 0,
        offsetY: styled?.offsetY || 0,
        bitmap: imageBitmap,
      };
    }));

    return new Promise<void>((resolve, reject) => {
      if (!this.workerObj) {
        resolve();
        return;
      }
      this.workerObj.onmessage = (e) => {
        this.isWorkerRunning = false;
        this.closeWorkerResultBitmap();
        this.workerResultBitmap = e.data.result;
        this.requestRender();
        resolve();
      };
      this.workerObj.onerror = (e) => {
        this.isWorkerRunning = false;
        reject(e);
      };

      this.workerObj.postMessage({
        docWidth: doc.width,
        docHeight: doc.height,
        layers: mappedLayers,
      }, transferables);
    });
  }

  private composeLayerWithMask(layer: ImageLayer) {
    if (!layer.bitmap || !layer.mask) return layer.bitmap;
    const bitmap = createBitmap(layer.bitmap.width, layer.bitmap.height);
    const ctx = bitmap.getContext('2d');
    if (ctx) {
      ctx.drawImage(layer.bitmap, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(layer.mask, 0, 0);
    }
    return bitmap;
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.deviceWidth, this.deviceHeight);
    ctx.fillStyle = '#0f1018';
    ctx.fillRect(0, 0, this.deviceWidth, this.deviceHeight);
    ctx.restore();

    const doc = this.currentDoc;
    if (!doc) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(doc.viewport.panX, doc.viewport.panY);
    ctx.scale(doc.viewport.zoom, doc.viewport.zoom);

    drawTransparencyCheckerboard(ctx, doc.width, doc.height);

    const store = useImageEditorStore.getState();
    if (store.isDraggingSlider) {
      if (!this.lowResDoc) {
        this.prepareLowResDoc(doc);
      } else {
        // Sync volatile properties from doc to lowResDoc
        const updatedLayers = this.lowResDoc.layers.map((lowLayer, idx) => {
          const highLayer = doc.layers[idx];
          if (!highLayer) return lowLayer;
          return {
            ...lowLayer,
            visible: highLayer.visible,
            opacity: highLayer.opacity,
            adjustment: highLayer.adjustment,
          };
        });
        this.lowResDoc = { ...this.lowResDoc, layers: updatedLayers };
      }

      ctx.save();
      ctx.scale(1 / this.lowResScale, 1 / this.lowResScale);
      if (this.lowResDoc) {
        ctx.drawImage(renderImageDocumentLayersToBitmap(this.lowResDoc), 0, 0);
      }
      ctx.restore();
    } else {
      this.lowResDoc = null;
      const signature = this.buildDocSignature(doc);
      if (this.workerDocSignature === signature && this.workerResultBitmap) {
        ctx.drawImage(this.workerResultBitmap, 0, 0);
      } else {
        // Fallback to sync render while worker processes, or start worker
        ctx.drawImage(renderImageDocumentLayersToBitmap(doc), 0, 0);
        this.runHighResWorker(doc).catch(console.error);
      }
    }

    if (this.currentSelection) {
      this.drawSelectionAnts(this.currentSelection);
    }

    ctx.restore();

    const cropPreview = getCropPreview();
    if (cropPreview) {
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      drawCropPreviewOverlay(ctx, {
        preview: cropPreview,
        viewport: doc.viewport,
      });
      ctx.restore();
    }
  }

  private drawSelectionAnts(mask: SelectionMask): void {
    const elapsed = performance.now() - this.antsStart;
    const phase = (elapsed / ANTS_PERIOD_MS) * (ANTS_DASH_LENGTH * 2);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1 / Math.max(this.currentDoc?.viewport.zoom ?? 1, 0.01);

    ctx.globalAlpha = 0.4;
    ctx.drawImage(maskToCanvas(mask, 60, 220, 240), 0, 0);
    ctx.globalAlpha = 1;

    const outline = computeMaskOutline(mask);
    if (outline.length > 0) {
      ctx.lineWidth = 1 / Math.max(this.currentDoc?.viewport.zoom ?? 1, 0.01);
      ctx.setLineDash([ANTS_DASH_LENGTH, ANTS_DASH_LENGTH]);
      ctx.lineDashOffset = -phase;
      ctx.strokeStyle = '#000000';
      tracePaths(ctx, outline);
      ctx.lineDashOffset = -phase + ANTS_DASH_LENGTH;
      ctx.strokeStyle = '#ffffff';
      tracePaths(ctx, outline);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

function drawTransparencyCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const size = 16;
  ctx.fillStyle = '#1a1b23';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#222637';
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function computeMaskOutline(mask: SelectionMask): Edge[] {
  const out: Edge[] = [];
  const { width, height, data } = mask;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = data[y * width + x] > 127;
      if (!inside) continue;
      // top
      if (y === 0 || data[(y - 1) * width + x] <= 127) {
        out.push({ x0: x, y0: y, x1: x + 1, y1: y });
      }
      // bottom
      if (y === height - 1 || data[(y + 1) * width + x] <= 127) {
        out.push({ x0: x, y0: y + 1, x1: x + 1, y1: y + 1 });
      }
      // left
      if (x === 0 || data[y * width + (x - 1)] <= 127) {
        out.push({ x0: x, y0: y, x1: x, y1: y + 1 });
      }
      // right
      if (x === width - 1 || data[y * width + (x + 1)] <= 127) {
        out.push({ x0: x + 1, y0: y, x1: x + 1, y1: y + 1 });
      }
    }
  }
  return out;
}

function tracePaths(ctx: CanvasRenderingContext2D, edges: Edge[]): void {
  ctx.beginPath();
  for (const edge of edges) {
    ctx.moveTo(edge.x0, edge.y0);
    ctx.lineTo(edge.x1, edge.y1);
  }
  ctx.stroke();
}
