// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_CROP_TOOL_SETTINGS,
  DEFAULT_GRADIENT_TOOL_SETTINGS,
  DEFAULT_SHAPE_TOOL_SETTINGS,
  DEFAULT_SELECTION_TOOL_SETTINGS,
  type ImageDocument,
  type ImageLayer,
  type LayerBitmap,
} from '../../types/imageEditor';
import { ImageCropActionOverlay, ImageEditorCanvas, ImageLayerTransformOverlay, ImageTransformActionOverlay, ImageVectorPathAnchorOverlay } from './ImageEditorCanvas';
import { normalizeImageTextStyle } from './ImageTextLayer';
import { clearCropPreview, cropTool } from './tools/cropTool';
import type { ToolEnv } from './tools/types';
import { createMask } from './SelectionMask';
import { setSelection } from './selectionRegistry';
import { beginTransformPreviewSession, clearTransformPreviewSession, setTransformPreviewMode } from './ImageTransformPreview';
import { beginSelectionTransformSession, clearSelectionTransformSession, setSelectionTransformMode } from './ImageSelectionTransform';
import { buildVectorPathLayer, getVectorPathDocumentPoints } from './ImageVectorShape';
import { describeImageToolDispatcherSupport, shouldIgnoreImageCanvasToolEvent } from './tools/dispatcher';

function bitmap(width: number, height: number): LayerBitmap {
  return { width, height } as LayerBitmap;
}

function imageLayer(patch: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 24,
    y: 32,
    bitmap: bitmap(180, 120),
    bitmapVersion: 0,
    mask: null,
    ...patch,
  };
}

function imageDoc(layer: ImageLayer): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Canvas tools',
    width: 640,
    height: 480,
    layers: [layer],
    activeLayerId: layer.id,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    snapshots: [],
  };
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  init: { clientX: number; clientY: number; pointerId?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: 0,
  });
  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: init.pointerId ?? 1,
  });
  target.dispatchEvent(event);
}

class FakeOffscreenCanvasContext {
  drawImage = vi.fn();
  beginPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  closePath() {}
  clip() {}
  fill() {}
  stroke() {}
  clearRect() {}
  rect() {}
  ellipse() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  transform() {}
  getImageData() {
    return {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
    } as ImageData;
  }
  createImageData(width: number, height: number) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }
  putImageData() {}
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenCanvasContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }
}

describe('ImageEditorCanvas tools', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => new FakeOffscreenCanvasContext()),
    });
    clearCropPreview();
    clearTransformPreviewSession();
    clearSelectionTransformSession();
    useImageEditorStore.setState({
      documents: [],
      activeDocId: null,
      undoStacks: {},
      redoStacks: {},
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('describes dispatcher support for every registered image tool without assuming every tool has full canvas handlers', () => {
    const support = describeImageToolDispatcherSupport();

    expect(support.descriptorId).toBe('image-tool-dispatcher-support:v1');
    expect(support.tools).toHaveLength(26);
    expect(support.signature).toContain('brush:pointerDown,pointerMove,pointerUp,cancel');
    expect(support.tools.find((tool) => tool.tool === 'hand')).toMatchObject({
      support: 'inactive',
      methods: [],
      caveat: 'Toolbar/shortcut selection exists, but no canvas ToolHandler callbacks are registered.',
    });
    expect(support.tools.find((tool) => tool.tool === 'brush')).toMatchObject({
      support: 'partial',
      methods: ['pointerDown', 'pointerMove', 'pointerUp', 'cancel'],
    });
    expect(support.unsupportedTools).toEqual(['hand']);
    expect(support.partialTools).toContain('brush');
  });

  it('renders direct transform and rotate handles for the active layer on the Move tool', () => {
    const layer = imageLayer();
    const doc = imageDoc(layer);

    const html = renderToStaticMarkup(
      <ImageLayerTransformOverlay
        doc={doc}
        layer={layer}
        requestRender={() => undefined}
        wrapperRef={{ current: null }}
      />,
    );

    expect(html).toContain('data-image-layer-transform-overlay="true"');
    expect(html).toContain('data-image-layer-transform-handle="nw"');
    expect(html).toContain('data-image-layer-transform-handle="n"');
    expect(html).toContain('data-image-layer-transform-handle="e"');
    expect(html).toContain('data-image-layer-transform-handle="s"');
    expect(html).toContain('data-image-layer-transform-handle="w"');
    expect(html).toContain('data-image-layer-transform-handle="se"');
    expect(html).toContain('data-image-layer-rotate-handle="true"');
    expect(html).toContain('data-image-layer-pivot-handle="true"');
    expect(html).toContain('aria-label="Rotate layer"');
  });

  it('renders direct draggable anchor handles for a selected retained path layer', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-path-anchor-overlay',
      title: 'Path Overlay',
      width: 300,
      height: 240,
    });
    const pathLayer = buildVectorPathLayer({
      doc,
      points: [
        { x: 40, y: 52 },
        { x: 120, y: 84 },
        { x: 180, y: 148 },
      ],
      closed: false,
      settings: DEFAULT_SHAPE_TOOL_SETTINGS,
    });
    doc.layers = [pathLayer];
    doc.activeLayerId = pathLayer.id;

    const html = renderToStaticMarkup(
      <ImageVectorPathAnchorOverlay
        doc={doc}
        layer={pathLayer}
        requestRender={() => undefined}
        wrapperRef={{ current: null }}
      />,
    );

    expect(html).toContain('data-image-vector-path-anchor-overlay="true"');
    expect(html).toContain('data-image-canvas-interaction-overlay="true"');
    expect(html).toContain('data-image-vector-path-anchor-handle="0"');
    expect(html).toContain('data-image-vector-path-anchor-handle="1"');
    expect(html).toContain('data-image-vector-path-anchor-handle="2"');
    expect(html).toContain('aria-label="Move path anchor 2"');
  });

  it('renders direct draggable Bezier handle controls for retained curved path anchors', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-path-bezier-overlay',
      title: 'Path Bezier Overlay',
      width: 300,
      height: 240,
    });
    const pathLayer = buildVectorPathLayer({
      doc,
      points: [
        { x: 40, y: 52, outHandle: { x: 74, y: 38 } },
        { x: 180, y: 148, inHandle: { x: 142, y: 168 } },
      ],
      closed: false,
      settings: DEFAULT_SHAPE_TOOL_SETTINGS,
    });
    doc.layers = [pathLayer];
    doc.activeLayerId = pathLayer.id;

    const html = renderToStaticMarkup(
      <ImageVectorPathAnchorOverlay
        doc={doc}
        layer={pathLayer}
        requestRender={() => undefined}
        wrapperRef={{ current: null }}
      />,
    );

    expect(html).toContain('data-image-vector-path-bezier-handle="0-outHandle"');
    expect(html).toContain('data-image-vector-path-bezier-handle="1-inHandle"');
    expect(html).toContain('aria-label="Move path anchor 1 out handle"');
    expect(html).toContain('C 74 38 142 168 180 148');
  });

  it('keeps committed path anchor and Bezier handles visible while the Pen tool is active', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-pen-active-overlay',
      title: 'Pen Active Overlay',
      width: 300,
      height: 240,
    });
    const pathLayer = buildVectorPathLayer({
      doc,
      points: [
        { x: 40, y: 52 },
        { x: 120, y: 84 },
      ],
      closed: false,
      settings: DEFAULT_SHAPE_TOOL_SETTINGS,
    });
    doc.layers = [pathLayer];
    doc.activeLayerId = pathLayer.id;
    useImageEditorStore.setState({
      documents: [doc],
      activeDocId: doc.id,
      tool: 'pen',
    });

    const html = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(html).toContain('data-image-vector-path-anchor-overlay="true"');
    expect(html).toContain('data-image-vector-path-anchor-handle="0"');
    expect(html).toContain('data-image-vector-path-anchor-handle="1"');
  });

  it('keeps direct path anchor pointer events out of the active canvas tool dispatcher', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-image-canvas-interaction-overlay', 'true');
    const handle = document.createElement('button');
    overlay.append(handle);
    document.body.append(overlay);

    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(event);

    expect(shouldIgnoreImageCanvasToolEvent(event)).toBe(true);
    overlay.remove();
  });

  it('drags a retained path anchor as one undoable layer operation', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-path-anchor-drag',
      title: 'Path Drag',
      width: 300,
      height: 240,
    });
    const pathLayer = buildVectorPathLayer({
      doc,
      points: [
        { x: 40, y: 52 },
        { x: 120, y: 84 },
        { x: 180, y: 148 },
      ],
      closed: false,
      settings: DEFAULT_SHAPE_TOOL_SETTINGS,
    });
    doc.layers = [pathLayer];
    doc.activeLayerId = pathLayer.id;
    useImageEditorStore.getState().openDocument(doc);
    const requestRender = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.getBoundingClientRect = () => ({
      x: 12,
      y: 18,
      left: 12,
      top: 18,
      right: 312,
      bottom: 258,
      width: 300,
      height: 240,
      toJSON: () => ({}),
    } as DOMRect);
    const container = document.createElement('div');
    document.body.append(container);
    let root: Root | null = createRoot(container);

    act(() => {
      root?.render(
        <ImageVectorPathAnchorOverlay
          doc={doc}
          layer={pathLayer}
          requestRender={requestRender}
          wrapperRef={{ current: wrapper }}
        />,
      );
    });

    const anchor2 = container.querySelector<HTMLButtonElement>('button[data-image-vector-path-anchor-handle="1"]');
    expect(anchor2).not.toBeNull();

    act(() => {
      dispatchPointerEvent(anchor2!, 'pointerdown', { clientX: 132, clientY: 102, pointerId: 4 });
      dispatchPointerEvent(anchor2!, 'pointermove', { clientX: 162, clientY: 134, pointerId: 4 });
      dispatchPointerEvent(anchor2!, 'pointerup', { clientX: 162, clientY: 134, pointerId: 4 });
    });

    const editedLayer = useImageEditorStore.getState().getActiveDocument()?.layers[0];
    expect(editedLayer ? getVectorPathDocumentPoints(editedLayer) : []).toEqual([
      { x: 40, y: 52 },
      { x: 150, y: 116 },
      { x: 180, y: 148 },
    ]);
    expect(useImageEditorStore.getState().undoStacks[doc.id]).toHaveLength(1);
    expect(useImageEditorStore.getState().undoStacks[doc.id]?.[0]).toMatchObject({
      kind: 'layerOp',
      docId: doc.id,
    });
    expect(requestRender).toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('drags a retained Bezier handle as one undoable layer operation', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-path-bezier-handle-drag',
      title: 'Path Bezier Drag',
      width: 300,
      height: 240,
    });
    const pathLayer = buildVectorPathLayer({
      doc,
      points: [
        { x: 40, y: 52, outHandle: { x: 74, y: 38 } },
        { x: 180, y: 148, inHandle: { x: 142, y: 168 } },
      ],
      closed: false,
      settings: DEFAULT_SHAPE_TOOL_SETTINGS,
    });
    doc.layers = [pathLayer];
    doc.activeLayerId = pathLayer.id;
    useImageEditorStore.getState().openDocument(doc);
    const requestRender = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.getBoundingClientRect = () => ({
      x: 12,
      y: 18,
      left: 12,
      top: 18,
      right: 312,
      bottom: 258,
      width: 300,
      height: 240,
      toJSON: () => ({}),
    } as DOMRect);
    const container = document.createElement('div');
    document.body.append(container);
    let root: Root | null = createRoot(container);

    act(() => {
      root?.render(
        <ImageVectorPathAnchorOverlay
          doc={doc}
          layer={pathLayer}
          requestRender={requestRender}
          wrapperRef={{ current: wrapper }}
        />,
      );
    });

    const outHandle = container.querySelector<HTMLButtonElement>('button[data-image-vector-path-bezier-handle="0-outHandle"]');
    expect(outHandle).not.toBeNull();

    act(() => {
      dispatchPointerEvent(outHandle!, 'pointerdown', { clientX: 86, clientY: 56, pointerId: 5 });
      dispatchPointerEvent(outHandle!, 'pointermove', { clientX: 102, clientY: 76, pointerId: 5 });
      dispatchPointerEvent(outHandle!, 'pointerup', { clientX: 102, clientY: 76, pointerId: 5 });
    });

    const editedLayer = useImageEditorStore.getState().getActiveDocument()?.layers[0];
    expect(editedLayer ? getVectorPathDocumentPoints(editedLayer) : []).toEqual([
      { x: 40, y: 52, outHandle: { x: 90, y: 58 } },
      { x: 180, y: 148, inHandle: { x: 142, y: 168 } },
    ]);
    expect(useImageEditorStore.getState().undoStacks[doc.id]).toHaveLength(1);
    expect(useImageEditorStore.getState().undoStacks[doc.id]?.[0]).toMatchObject({
      kind: 'layerOp',
      docId: doc.id,
    });
    expect(requestRender).toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('renders brush symmetry guides when a symmetry mode is active', () => {
    const layer = imageLayer();
    const doc = imageDoc(layer);
    useImageEditorStore.setState({
      documents: [doc],
      activeDocId: doc.id,
      tool: 'brush',
      brushSettings: { ...DEFAULT_BRUSH_SETTINGS, symmetryMode: 'both' },
    });

    const html = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(html).toContain('data-image-brush-symmetry-overlay="true"');
    expect(html).toContain('data-image-brush-symmetry-guide="vertical"');
    expect(html).toContain('data-image-brush-symmetry-guide="horizontal"');
  });

  it('renders direct skew and distort handles for the active layer transform mode', () => {
    const layer = imageLayer();
    const doc = imageDoc(layer);
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('move');
    beginTransformPreviewSession(doc, layer);
    setTransformPreviewMode(doc.id, 'skew');
    const skewHtml = renderToStaticMarkup(<ImageEditorCanvas />);
    setTransformPreviewMode(doc.id, 'distort');
    const distortHtml = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(skewHtml).toContain('data-image-layer-transform-skew-handle="n"');
    expect(skewHtml).toContain('data-image-layer-transform-skew-handle="e"');
    expect(skewHtml).toContain('data-image-layer-transform-skew-handle="s"');
    expect(skewHtml).toContain('data-image-layer-transform-skew-handle="w"');
    expect(distortHtml).toContain('data-image-layer-transform-distort-handle="nw"');
    expect(distortHtml).toContain('data-image-layer-transform-distort-handle="ne"');
    expect(distortHtml).toContain('data-image-layer-transform-distort-handle="se"');
    expect(distortHtml).toContain('data-image-layer-transform-distort-handle="sw"');
  });

  it('renders direct perspective handles for the active layer transform mode', () => {
    const layer = imageLayer();
    const doc = imageDoc(layer);
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('move');
    beginTransformPreviewSession(doc, layer);
    setTransformPreviewMode(doc.id, 'perspective');
    const perspectiveHtml = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(perspectiveHtml).toContain('data-image-layer-transform-perspective-handle="nw"');
    expect(perspectiveHtml).toContain('data-image-layer-transform-perspective-handle="ne"');
    expect(perspectiveHtml).toContain('data-image-layer-transform-perspective-handle="se"');
    expect(perspectiveHtml).toContain('data-image-layer-transform-perspective-handle="sw"');
  });

  it('renders the warp control-point mesh for the active layer transform mode', () => {
    const layer = imageLayer();
    const doc = imageDoc(layer);
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('move');
    beginTransformPreviewSession(doc, layer);
    setTransformPreviewMode(doc.id, 'warp');
    const warpHtml = renderToStaticMarkup(<ImageEditorCanvas />);

    // Warp mode shows the full NxN control-point mesh (cage grid + draggable nodes),
    // including the four corners and an interior control point.
    expect(warpHtml).toContain('data-image-layer-warp-mesh-grid="true"');
    expect(warpHtml).toContain('data-image-layer-warp-mesh-handle="0-0"');
    expect(warpHtml).toContain('data-image-layer-warp-mesh-handle="3-3"');
    expect(warpHtml).toContain('data-image-layer-warp-mesh-handle="1-1"');
  });

  it('renders visible apply and cancel controls for an active crop preview', () => {
    const doc = imageDoc(imageLayer());

    const html = renderToStaticMarkup(
      <ImageCropActionOverlay
        onApply={() => undefined}
        onCancel={() => undefined}
        preview={{ x: 40, y: 50, w: 140, h: 110 }}
        viewport={doc.viewport}
      />,
    );

    expect(html).toContain('data-image-crop-actions="true"');
    expect(html).toContain('title="Apply crop"');
    expect(html).toContain('title="Cancel crop"');
  });

  it('uses crop tool settings when the floating crop apply button commits the preview', async () => {
    const originalMask = bitmap(180, 120);
    const layer = imageLayer({
      x: 40,
      y: 55,
      bitmapVersion: 7,
      mask: originalMask,
    });
    const doc = imageDoc(layer);
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('crop');
    useImageEditorStore.getState().setCropToolSettings({
      ...DEFAULT_CROP_TOOL_SETTINGS,
      deleteCroppedPixels: true,
      rotationDeg: 15,
    });

    const state = useImageEditorStore.getState();
    const env = {
      doc,
      activeLayer: layer,
      brushSettings: DEFAULT_BRUSH_SETTINGS,
      cropToolSettings: state.cropToolSettings,
      gradientToolSettings: DEFAULT_GRADIENT_TOOL_SETTINGS,
      selectionToolSettings: DEFAULT_SELECTION_TOOL_SETTINGS,
      screenToDoc: (point) => point,
      docToScreen: (point) => point,
      pushOperation: state.pushOperation,
      store: state,
      requestRender: vi.fn(),
      resolveSelectionMode: () => 'replace',
    } satisfies ToolEnv;
    cropTool.onPointerDown?.(env, { x: 25, y: 30 }, { shift: false, alt: false, ctrl: false, meta: false }, new MouseEvent('pointerdown') as unknown as PointerEvent);
    cropTool.onPointerMove?.(env, { x: 105, y: 70 }, { shift: false, alt: false, ctrl: false, meta: false }, new MouseEvent('pointermove') as unknown as PointerEvent);

    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(<ImageEditorCanvas />);
    });

    const applyButton = container.querySelector('[title="Apply crop"]') as HTMLButtonElement | null;
    expect(applyButton).not.toBeNull();

    await act(async () => {
      applyButton?.click();
    });

    const committedLayer = useImageEditorStore.getState().getActiveDocument()?.layers[0];
    expect(committedLayer).toMatchObject({
      x: 0,
      y: 0,
      bitmapVersion: 8,
      mask: null,
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders visible apply and cancel controls for a pending transform preview', () => {
    const html = renderToStaticMarkup(
      <ImageTransformActionOverlay
        bounds={{ x: 40, y: 50, width: 140, height: 110, rotationDeg: 12 }}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('data-image-transform-actions="true"');
    expect(html).toContain('title="Apply transform"');
    expect(html).toContain('title="Cancel transform"');
  });

  it('renders selection transform preview bounds and action controls when a selection session is active', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-selection-overlay',
      title: 'Selection Overlay',
      width: 10,
      height: 10,
    });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('move');
    const selection = createMask(10, 10);
    selection.data[2 * selection.width + 2] = 255;
    selection.data[2 * selection.width + 3] = 255;
    selection.data[3 * selection.width + 2] = 255;
    setSelection(doc.id, selection);
    useImageEditorStore.getState().setHasSelection(doc.id, true);
    beginSelectionTransformSession(doc.id);

    const html = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(html).toContain('data-image-selection-transform-overlay="true"');
    expect(html).toContain('data-image-selection-transform-body="true"');
    expect(html).toContain('data-image-selection-transform-handle="nw"');
    expect(html).toContain('data-image-selection-transform-handle="n"');
    expect(html).toContain('data-image-selection-transform-handle="e"');
    expect(html).toContain('data-image-selection-transform-handle="s"');
    expect(html).toContain('data-image-selection-transform-handle="w"');
    expect(html).toContain('data-image-selection-transform-handle="se"');
    expect(html).toContain('data-image-selection-transform-rotate-handle="true"');
    expect(html).toContain('aria-label="Rotate selection"');
    expect(html).toContain('data-image-selection-transform-rotation-preview="true"');
    expect(html).toContain('data-image-selection-transform-actions="true"');
    expect(html).toContain('title="Apply selection transform"');
    expect(html).toContain('title="Cancel selection transform"');
  });

  it('renders direct skew and distort handles for the active selection transform mode', () => {
    const doc = createEmptyImageDocument({
      id: 'doc-selection-overlay-modes',
      title: 'Selection Overlay Modes',
      width: 10,
      height: 10,
    });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setTool('move');
    const selection = createMask(10, 10);
    selection.data[2 * selection.width + 2] = 255;
    selection.data[2 * selection.width + 3] = 255;
    selection.data[3 * selection.width + 2] = 255;
    setSelection(doc.id, selection);
    useImageEditorStore.getState().setHasSelection(doc.id, true);
    beginSelectionTransformSession(doc.id);
    setSelectionTransformMode(doc.id, 'skew');
    const skewHtml = renderToStaticMarkup(<ImageEditorCanvas />);
    setSelectionTransformMode(doc.id, 'distort');
    const distortHtml = renderToStaticMarkup(<ImageEditorCanvas />);

    expect(skewHtml).toContain('data-image-selection-transform-skew-handle="n"');
    expect(skewHtml).toContain('data-image-selection-transform-skew-handle="e"');
    expect(skewHtml).toContain('data-image-selection-transform-skew-handle="s"');
    expect(skewHtml).toContain('data-image-selection-transform-skew-handle="w"');
    expect(distortHtml).toContain('data-image-selection-transform-distort-handle="nw"');
    expect(distortHtml).toContain('data-image-selection-transform-distort-handle="ne"');
    expect(distortHtml).toContain('data-image-selection-transform-distort-handle="se"');
    expect(distortHtml).toContain('data-image-selection-transform-distort-handle="sw"');
  });

  it('opens the on-canvas text editor when the Type tool requests a pending edit', async () => {
    const textLayer = imageLayer({
      id: 'text-layer-1',
      type: 'text',
      bitmap: bitmap(80, 30),
      text: normalizeImageTextStyle({ content: 'Hello' }),
      metadata: { editableText: true },
    });
    useImageEditorStore.getState().openDocument(imageDoc(textLayer));
    useImageEditorStore.getState().setTool('text');
    // The Type tool sets this after dropping a new layer; the canvas should
    // consume it, open the editor, and clear it.
    useImageEditorStore.getState().setPendingTextEditLayerId('text-layer-1');

    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(<ImageEditorCanvas />);
    });

    expect(container.querySelector('[data-image-text-edit-overlay="true"]')).not.toBeNull();
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(useImageEditorStore.getState().pendingTextEditLayerId).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('discards a freshly-placed text layer when its editor is cancelled empty', async () => {
    const textLayer = imageLayer({
      id: 'text-layer-fresh',
      type: 'text',
      bitmap: bitmap(80, 30),
      text: normalizeImageTextStyle({ content: '' }),
      metadata: { editableText: true, freshlyPlaced: true },
    });
    useImageEditorStore.getState().openDocument(imageDoc(textLayer));
    useImageEditorStore.getState().setTool('text');
    useImageEditorStore.getState().setPendingTextEditLayerId('text-layer-fresh');

    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(<ImageEditorCanvas />);
    });

    const cancelButton = container.querySelector('[title="Cancel text edit"]') as HTMLButtonElement | null;
    expect(cancelButton).not.toBeNull();

    await act(async () => {
      cancelButton?.click();
    });

    // The empty, freshly-placed layer is removed rather than left behind.
    const doc = useImageEditorStore.getState().getActiveDocument();
    expect(doc?.layers.some((layer) => layer.id === 'text-layer-fresh')).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
