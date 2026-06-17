// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import type { ImageLayer } from '../../types/imageEditor';
import { ImageEditorLayersPanel } from './ImageEditorLayersPanel';

class FakeOffscreenCanvasContext {
  readonly imageData: ImageData;
  fillStyle = '#000000';
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';

  constructor(width: number, height: number) {
    this.imageData = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  beginPath() {}
  closePath() {}
  rect() {}
  ellipse() {}
  lineTo() {}
  moveTo() {}
  fill() {}
  stroke() {}
  clearRect() {}
  fillRect() {}
  drawImage() {}
  save() {}
  restore() {}
  getImageData() {
    return {
      width: this.imageData.width,
      height: this.imageData.height,
      data: new Uint8ClampedArray(this.imageData.data),
    } as ImageData;
  }
  createImageData(width: number, height: number) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }
  putImageData(imageData: ImageData) {
    this.imageData.data.set(imageData.data);
  }
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context: FakeOffscreenCanvasContext;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = new FakeOffscreenCanvasContext(width, height);
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }
}

function layer(patch: Partial<ImageLayer>): ImageLayer {
  return {
    id: patch.id ?? 'layer',
    name: patch.name ?? 'Layer',
    type: patch.type ?? 'image',
    visible: patch.visible ?? true,
    locked: patch.locked ?? false,
    opacity: patch.opacity ?? 1,
    blendMode: patch.blendMode ?? 'normal',
    x: patch.x ?? 0,
    y: patch.y ?? 0,
    bitmap: patch.bitmap ?? null,
    bitmapVersion: patch.bitmapVersion ?? 0,
    mask: patch.mask ?? null,
    ...patch,
  };
}

function vectorRectLayer({
  id,
  name,
  x,
  y,
  width,
  height,
}: {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): ImageLayer {
  return layer({
    id,
    name,
    type: 'vector',
    x,
    y,
    bitmap: null,
    vectorRecipe: '<svg />',
    metadata: {
      originalSvgSource: '<svg />',
      vectorShape: {
        kind: 'rect',
        width,
        height,
        fillColor: '#22cc88',
        fillOpacity: 0.75,
        strokeColor: '#1144ff',
        strokeOpacity: 0.5,
        strokeWidth: 4,
      },
    } as unknown as ImageLayer['metadata'],
  });
}

function vectorEllipseLayer({
  id,
  name,
  x,
  y,
  width,
  height,
}: {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): ImageLayer {
  return layer({
    id,
    name,
    type: 'vector',
    x,
    y,
    bitmap: null,
    vectorRecipe: '<svg />',
    metadata: {
      originalSvgSource: '<svg />',
      vectorShape: {
        kind: 'ellipse',
        width,
        height,
        fillColor: '#22cc88',
        fillOpacity: 0.75,
        strokeColor: '#1144ff',
        strokeOpacity: 0.5,
        strokeWidth: 4,
      },
    } as unknown as ImageLayer['metadata'],
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ImageEditorLayersPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '#252630',
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    useImageEditorStore.setState({
      documents: [],
      activeDocId: null,
      undoStacks: {},
      redoStacks: {},
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders compact layer search, filters, and color labels for an open document', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-1',
        title: 'Layered edit',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'background', name: 'Background plate', colorLabel: 'blue' }),
        layer({ id: 'ink', name: 'Character ink', colorLabel: 'red' }),
        layer({ id: 'title', name: 'Title type', type: 'text', visible: false, colorLabel: 'violet' }),
      ],
      activeLayerId: 'ink',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });
    const html = container.innerHTML;

    expect(html).toContain('aria-label="Search layers"');
    expect(html).toContain('aria-label="Layer type filter"');
    expect(html).toContain('aria-label="Layer color label filter"');
    expect(html).toContain('aria-label="Layer color label"');
    expect(html).toContain('aria-label="Clip layer to layer below"');
    expect(html).toContain('Clip');
    expect(html).toContain('max-h-28');
    expect(html).toContain('min-h-0 flex-1');
    expect(html).toContain('overscroll-contain');
    expect(html).toContain('class="sr-only">Duplicate');
    expect(html).not.toContain('hidden xl:inline');
    expect(html).toContain('All Labels');
    expect(html).toContain('Character ink');
    expect(html).toContain('Red label');
  });

  it('ctrl-clicks a layer row to extend the multi-layer selection used by linked move', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-multi',
        title: 'Multi select',
        width: 256,
        height: 256,
      }),
      layers: [
        layer({ id: 'back', name: 'Back plate' }),
        layer({ id: 'mid', name: 'Mid plate' }),
        layer({ id: 'front', name: 'Front plate' }),
      ],
      activeLayerId: 'front',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const midRow = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Mid plate'),
    );
    expect(midRow).toBeTruthy();

    act(() => {
      midRow?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });

    const doc = useImageEditorStore.getState().documents.find((candidate) => candidate.id === 'doc-multi');
    expect(doc?.selectedLayerIds).toEqual(['front', 'mid']);
    expect(doc?.activeLayerId).toBe('mid');

    // A plain click then collapses the multi-selection back to a single layer.
    const backRow = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Back plate'),
    );
    act(() => {
      backRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const collapsed = useImageEditorStore.getState().documents.find((candidate) => candidate.id === 'doc-multi');
    expect(collapsed?.selectedLayerIds).toEqual(['back']);
    expect(collapsed?.activeLayerId).toBe('back');
  });

  it('toggles clipping masks through an undoable layer operation', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-clip',
        title: 'Clipping edit',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base shape', colorLabel: 'blue' }),
        layer({ id: 'shade', name: 'Clipped shade', colorLabel: 'red' }),
      ],
      activeLayerId: 'shade',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const checkbox = container.querySelector<HTMLInputElement>('input[aria-label="Clip layer to layer below"]');
    expect(checkbox).not.toBeNull();

    act(() => {
      checkbox?.click();
    });

    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === 'doc-clip');
    expect(doc?.layers.find((entry) => entry.id === 'shade')?.clippingMask).toBe(true);
    expect(state.undoStacks['doc-clip']?.at(-1)).toMatchObject({
      kind: 'layerOp',
      docId: 'doc-clip',
    });
  });

  it('batch creates and releases clipping masks for layers above a context-menu base layer', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-clip-batch',
        title: 'Batch clipping edit',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base shape' }),
        layer({ id: 'shade', name: 'Shade pass' }),
        layer({ id: 'texture', name: 'Texture pass' }),
      ],
      activeLayerId: 'texture',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const baseRow = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Base shape'),
    );
    expect(baseRow).not.toBeNull();

    act(() => {
      baseRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    const clipAbove = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Clip Layers Above to This Layer'),
    );
    expect(clipAbove).toBeDefined();

    act(() => {
      clipAbove?.click();
    });

    let state = useImageEditorStore.getState();
    let doc = state.documents.find((candidate) => candidate.id === 'doc-clip-batch');
    expect(doc?.layers.find((entry) => entry.id === 'base')?.clippingMask).toBeUndefined();
    expect(doc?.layers.find((entry) => entry.id === 'shade')?.clippingMask).toBe(true);
    expect(doc?.layers.find((entry) => entry.id === 'texture')?.clippingMask).toBe(true);
    expect(state.undoStacks['doc-clip-batch']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(1);

    act(() => {
      baseRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    const releaseAbove = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Release Clipping Masks Above'),
    );
    expect(releaseAbove).toBeDefined();

    act(() => {
      releaseAbove?.click();
    });

    state = useImageEditorStore.getState();
    doc = state.documents.find((candidate) => candidate.id === 'doc-clip-batch');
    expect(doc?.layers.find((entry) => entry.id === 'shade')?.clippingMask).toBeUndefined();
    expect(doc?.layers.find((entry) => entry.id === 'texture')?.clippingMask).toBeUndefined();
    expect(state.undoStacks['doc-clip-batch']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(2);
  });

  it('surfaces nested-group, inherited-lock, and clipping handoff caveats for the active layer', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-layer-caveats',
        title: 'Layer caveats',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({
          id: 'root-group',
          name: 'Root folder',
          type: 'group',
          bitmap: null,
          blendMode: 'multiply',
          locked: true,
          mask: document.createElement('canvas') as unknown as OffscreenCanvas,
        }),
        layer({
          id: 'nested-group',
          name: 'Nested folder',
          type: 'group',
          bitmap: null,
          groupId: 'root-group',
        }),
        layer({
          id: 'clip-base',
          name: 'Clip base',
          groupId: 'nested-group',
        }),
        layer({
          id: 'clip-fill',
          name: 'Clip fill',
          groupId: 'nested-group',
          clippingMask: true,
        } as Partial<ImageLayer>),
      ],
      activeLayerId: 'clip-fill',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const text = container.textContent ?? '';

    expect(text).toContain('Nested groups are normalized for preview only.');
    expect(text).toContain('Pass-through folders do not have full Photoshop compositing semantics.');
    expect(text).toContain('Group masks stay metadata-only and can flatten through visible descendants on PSD handoff.');
    expect(text).toContain('Inherited folder locks can still block child and batch actions.');
    expect(text).toContain('PSD handoff keeps clipping masks as Signal Loom metadata; native Photoshop clipping groups are not guaranteed.');
  });

  it('renders mask density and feather controls and commits them as undoable layer operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-mask-controls',
        title: 'Mask controls',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base plate' }),
        layer({
          id: 'masked',
          name: 'Masked layer',
          mask: document.createElement('canvas') as unknown as OffscreenCanvas,
          maskDensity: 0.4,
          maskFeather: 6,
        } as unknown as Partial<ImageLayer>),
      ],
      activeLayerId: 'masked',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const density = container.querySelector<HTMLInputElement>('input[aria-label="Mask density"]');
    const feather = container.querySelector<HTMLInputElement>('input[aria-label="Mask feather"]');
    expect(density).not.toBeNull();
    expect(feather).not.toBeNull();

    act(() => {
      setInputValue(density!, '0.75');
    });
    act(() => {
      setInputValue(feather!, '12');
    });

    const state = useImageEditorStore.getState();
    const maskedLayer = state.documents
      .find((candidate) => candidate.id === 'doc-mask-controls')
      ?.layers.find((entry) => entry.id === 'masked') as (ImageLayer & {
      maskDensity?: number;
      maskFeather?: number;
    }) | undefined;

    expect(maskedLayer?.maskDensity).toBe(0.75);
    expect(maskedLayer?.maskFeather).toBe(12);
    expect(state.undoStacks['doc-mask-controls']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(2);
  });

  it('switches the active edit target between the layer bitmap and its mask', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-mask-target',
        title: 'Mask target',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base plate' }),
        layer({
          id: 'masked',
          name: 'Masked layer',
          mask: document.createElement('canvas') as unknown as OffscreenCanvas,
        } as unknown as Partial<ImageLayer>),
      ],
      activeLayerId: 'masked',
      activeLayerEditTarget: 'layer',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const editMask = container.querySelector<HTMLButtonElement>('button[aria-label="Edit mask target"]');
    const editLayer = container.querySelector<HTMLButtonElement>('button[aria-label="Edit layer target"]');
    expect(editMask).not.toBeNull();
    expect(editLayer).not.toBeNull();

    act(() => {
      editMask?.click();
    });

    expect(
      useImageEditorStore.getState().documents.find((candidate) => candidate.id === 'doc-mask-target')?.activeLayerEditTarget,
    ).toBe('mask');

    act(() => {
      editLayer?.click();
    });

    expect(
      useImageEditorStore.getState().documents.find((candidate) => candidate.id === 'doc-mask-target')?.activeLayerEditTarget,
    ).toBe('layer');
  });

  it('renders editable vector shape controls and commits stroke-width changes as undoable layer operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-vector-controls',
        title: 'Vector controls',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({
          id: 'shape-layer',
          name: 'Badge shape',
          type: 'vector',
          bitmap: null,
          vectorRecipe: '<svg viewBox="0 0 160 80"></svg>',
          metadata: {
            originalSvgSource: '<svg viewBox="0 0 160 80"></svg>',
            vectorShape: {
              kind: 'rect',
              width: 160,
              height: 80,
              fillColor: '#ff00aa',
              fillOpacity: 1,
              strokeColor: '#112233',
              strokeOpacity: 1,
              strokeWidth: 4,
            },
          } as unknown as ImageLayer['metadata'],
        }),
      ],
      activeLayerId: 'shape-layer',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    expect(container.innerHTML).toContain('Vector Shape');
    const strokeWidth = container.querySelector<HTMLInputElement>('input[aria-label="Vector stroke width"]');
    expect(strokeWidth).not.toBeNull();

    act(() => {
      setInputValue(strokeWidth!, '12');
    });

    const state = useImageEditorStore.getState();
    const vectorLayer = state.documents
      .find((candidate) => candidate.id === 'doc-vector-controls')
      ?.layers.find((entry) => entry.id === 'shape-layer') as
        | (ImageLayer & { metadata?: { vectorShape?: { strokeWidth?: number } } })
        | undefined;

    expect(vectorLayer?.metadata?.vectorShape?.strokeWidth).toBe(12);
    expect(state.undoStacks['doc-vector-controls']?.at(-1)).toMatchObject({
      kind: 'layerOp',
      docId: 'doc-vector-controls',
    });
  });

  it('rasterizes editable vector shape layers into normal image layers without retaining live vector metadata', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-vector-rasterize',
        title: 'Vector rasterize',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({
          id: 'shape-layer',
          name: 'Sticker shape',
          type: 'vector',
          bitmap: null,
          vectorRecipe: '<svg viewBox="0 0 120 60"></svg>',
          metadata: {
            originalSvgSource: '<svg viewBox="0 0 120 60"></svg>',
            vectorShape: {
              kind: 'ellipse',
              width: 120,
              height: 60,
              fillColor: '#44ccff',
              fillOpacity: 0.9,
              strokeColor: '#0f172a',
              strokeOpacity: 1,
              strokeWidth: 6,
            },
          } as unknown as ImageLayer['metadata'],
        }),
      ],
      activeLayerId: 'shape-layer',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const row = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Sticker shape'),
    );
    expect(row).not.toBeNull();

    act(() => {
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    const rasterize = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Rasterize Layer'),
    );
    expect(rasterize).not.toBeNull();

    act(() => {
      rasterize?.click();
    });

    const rasterized = useImageEditorStore.getState().documents
      .find((candidate) => candidate.id === 'doc-vector-rasterize')
      ?.layers.find((entry) => entry.id === 'shape-layer') as
        | (ImageLayer & { metadata?: { vectorShape?: unknown } })
        | undefined;

    expect(rasterized?.type).toBe('image');
    expect(rasterized?.bitmap).not.toBeNull();
    expect(rasterized?.vectorRecipe).toBeUndefined();
    expect(rasterized?.metadata?.originalSvgSource).toBeUndefined();
    expect(rasterized?.metadata?.vectorShape).toBeUndefined();
  });

  it('converts retained vector shapes into editable path layers from the Layers context menu', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-vector-convert-to-path',
        title: 'Vector convert to path',
        width: 1024,
        height: 768,
      }),
      layers: [
        vectorEllipseLayer({
          id: 'shape-layer',
          name: 'Badge ellipse',
          x: 30,
          y: 40,
          width: 64,
          height: 32,
        }),
      ],
      activeLayerId: 'shape-layer',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const row = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Badge ellipse'),
    );
    expect(row).not.toBeNull();

    act(() => {
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    const convertToPath = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Convert Shape to Editable Path'),
    );
    expect(convertToPath).not.toBeNull();
    expect(convertToPath?.disabled).toBe(false);

    act(() => {
      convertToPath?.click();
    });

    const state = useImageEditorStore.getState();
    const converted = state.documents
      .find((candidate) => candidate.id === 'doc-vector-convert-to-path')
      ?.layers.find((entry) => entry.id === 'shape-layer') as
        | (ImageLayer & { metadata?: { vectorShape?: { kind?: string; points?: unknown[] } } })
        | undefined;

    expect(converted?.type).toBe('vector');
    expect(converted?.metadata?.vectorShape?.kind).toBe('path');
    expect(converted?.metadata?.vectorShape?.points).toHaveLength(32);
    expect(converted?.vectorRecipe).toContain('<path');
    expect(state.undoStacks['doc-vector-convert-to-path']?.at(-1)).toMatchObject({
      kind: 'layerOp',
      docId: 'doc-vector-convert-to-path',
    });
  });

  it('materializes exact vector boolean results from the Layers context menu as one undoable layer operation', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-vector-boolean-menu',
        title: 'Vector Boolean',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'background', name: 'Background plate' }),
        vectorRectLayer({ id: 'vector-a', name: 'Panel Shape A', x: 0, y: 0, width: 20, height: 20 }),
        vectorRectLayer({ id: 'vector-b', name: 'Panel Shape B', x: 8, y: 6, width: 20, height: 18 }),
      ],
      activeLayerId: 'vector-b',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const topShapeRow = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Panel Shape B'),
    );
    expect(topShapeRow).not.toBeNull();

    act(() => {
      topShapeRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    expect(document.body.innerHTML).toContain('Vector Boolean');
    const intersect = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Intersect with Panel Shape A'),
    );
    expect(intersect).toBeDefined();
    expect(intersect?.disabled).toBe(false);

    act(() => {
      intersect?.click();
    });

    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === 'doc-vector-boolean-menu');
    expect(doc?.layers.map((entry) => entry.id)).not.toContain('vector-a');
    expect(doc?.layers.map((entry) => entry.id)).not.toContain('vector-b');
    expect(doc?.layers).toHaveLength(2);
    expect(doc?.layers[0]?.id).toBe('background');

    const booleanLayer = doc?.layers.find((entry) => entry.metadata?.vectorBooleanSource);
    expect(booleanLayer).toMatchObject({
      type: 'vector',
      name: 'Panel Shape B Intersect Panel Shape A',
      x: 8,
      y: 6,
    });
    expect(booleanLayer?.metadata?.vectorShape).toMatchObject({
      kind: 'path',
      closed: true,
      width: 12,
      height: 14,
    });
    expect(booleanLayer?.metadata?.vectorBooleanSource).toMatchObject({
      operation: 'intersect',
      sourceLayerIds: ['vector-b', 'vector-a'],
      supportedSubset: 'axis-aligned-rectangles',
    });
    expect(doc?.activeLayerId).toBe(booleanLayer?.id);
    expect(state.undoStacks['doc-vector-boolean-menu']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(1);
  });

  it('keeps unsupported vector boolean context-menu operations non-mutating and visible', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-vector-boolean-unsupported',
        title: 'Vector Boolean Unsupported',
        width: 1024,
        height: 768,
      }),
      layers: [
        vectorRectLayer({ id: 'vector-a', name: 'Panel Shape A', x: 0, y: 0, width: 20, height: 20 }),
        vectorEllipseLayer({ id: 'ellipse-b', name: 'Glow Ellipse', x: 8, y: 6, width: 20, height: 18 }),
      ],
      activeLayerId: 'ellipse-b',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const ellipseRow = Array.from(container.querySelectorAll('[draggable="true"]')).find((element) =>
      element.textContent?.includes('Glow Ellipse'),
    );
    expect(ellipseRow).not.toBeNull();

    act(() => {
      ellipseRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 }));
    });

    const union = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((button) =>
      button.textContent?.includes('Union with Panel Shape A'),
    );
    expect(union).toBeDefined();
    expect(union?.disabled).toBe(false);

    act(() => {
      union?.click();
    });

    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === 'doc-vector-boolean-unsupported');
    expect(doc?.layers.map((entry) => entry.id)).toEqual(['vector-a', 'ellipse-b']);
    expect(state.undoStacks['doc-vector-boolean-unsupported']?.filter((entry) => entry.kind === 'layerOp') ?? []).toHaveLength(0);
    expect(container.innerHTML).toContain('Vector boolean unsupported');
    expect(container.innerHTML).toContain('Ellipse vector booleans are not materialized yet');
  });

  it('toggles pixel and position lock variants through undoable layer operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-locks',
        title: 'Layer locks',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base plate' }),
        layer({ id: 'paint', name: 'Paint layer' }),
      ],
      activeLayerId: 'paint',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const pixelLock = container.querySelector<HTMLInputElement>('input[aria-label="Lock layer pixels"]');
    const positionLock = container.querySelector<HTMLInputElement>('input[aria-label="Lock layer position"]');
    expect(pixelLock).not.toBeNull();
    expect(positionLock).not.toBeNull();

    act(() => {
      pixelLock?.click();
    });
    act(() => {
      positionLock?.click();
    });

    const state = useImageEditorStore.getState();
    const lockedLayer = state.documents
      .find((candidate) => candidate.id === 'doc-locks')
      ?.layers.find((entry) => entry.id === 'paint');

    expect(lockedLayer?.locks).toEqual({ pixels: true, position: true });
    expect(state.undoStacks['doc-locks']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(2);
  });

  it('creates layer groups and assigns the active layer through undoable controls', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-groups',
        title: 'Layer groups',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base plate' }),
        layer({ id: 'paint', name: 'Paint layer' }),
      ],
      activeLayerId: 'paint',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const addButton = container.querySelector<HTMLButtonElement>('button[title="Add layer"]');
    expect(addButton).not.toBeNull();
    act(() => {
      addButton?.click();
    });

    const groupButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Group');
    expect(groupButton).not.toBeNull();
    act(() => {
      groupButton?.click();
    });

    let state = useImageEditorStore.getState();
    let currentDoc = state.documents.find((candidate) => candidate.id === 'doc-groups');
    const groupLayer = currentDoc?.layers.find((entry) => entry.type === ('group' as ImageLayer['type']));
    expect(groupLayer).toMatchObject({
      name: 'Group 3',
      type: 'group',
      bitmap: null,
      groupExpanded: true,
    });
    expect(state.undoStacks['doc-groups']?.at(-1)).toMatchObject({ kind: 'layerOp' });

    const paintLayerRow = Array.from(container.querySelectorAll<HTMLElement>('span'))
      .find((entry) => entry.textContent === 'Paint layer');
    expect(paintLayerRow).not.toBeNull();
    act(() => {
      paintLayerRow?.click();
    });

    const groupSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Layer group"]');
    expect(groupSelect).not.toBeNull();
    act(() => {
      groupSelect!.value = groupLayer!.id;
      groupSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    state = useImageEditorStore.getState();
    currentDoc = state.documents.find((candidate) => candidate.id === 'doc-groups');
    expect(currentDoc?.layers.find((entry) => entry.id === 'paint')?.groupId).toBe(groupLayer?.id);
    expect(state.undoStacks['doc-groups']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(2);
  });

  it('links the active layer with the layer below and can unlink the movement group', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-links',
        title: 'Layer links',
        width: 1024,
        height: 768,
      }),
      layers: [
        layer({ id: 'base', name: 'Base plate' }),
        layer({ id: 'paint', name: 'Paint layer' }),
      ],
      activeLayerId: 'paint',
    });

    act(() => {
      root.render(<ImageEditorLayersPanel />);
    });

    const linkBelow = container.querySelector<HTMLButtonElement>('button[aria-label="Link layer with layer below"]');
    expect(linkBelow).not.toBeNull();

    act(() => {
      linkBelow?.click();
    });

    let state = useImageEditorStore.getState();
    let currentDoc = state.documents.find((candidate) => candidate.id === 'doc-links');
    const baseLink = currentDoc?.layers.find((entry) => entry.id === 'base')?.linkGroupId;
    const paintLink = currentDoc?.layers.find((entry) => entry.id === 'paint')?.linkGroupId;
    expect(baseLink).toBeTruthy();
    expect(paintLink).toBe(baseLink);
    expect(container.innerHTML).toContain('title="Linked movement group"');

    const unlink = container.querySelector<HTMLButtonElement>('button[aria-label="Unlink layer"]');
    expect(unlink).not.toBeNull();
    act(() => {
      unlink?.click();
    });

    state = useImageEditorStore.getState();
    currentDoc = state.documents.find((candidate) => candidate.id === 'doc-links');
    expect(currentDoc?.layers.map((entry) => [entry.id, entry.linkGroupId])).toEqual([
      ['base', undefined],
      ['paint', undefined],
    ]);
    expect(state.undoStacks['doc-links']?.filter((entry) => entry.kind === 'layerOp')).toHaveLength(2);
  });
});
