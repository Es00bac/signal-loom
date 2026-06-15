import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import { describeImageClippingMaskReadiness } from './ImageClippingMask';

class FakeContext {
  drawImageCalls: Array<{
    image: unknown;
    dx: number;
    dy: number;
    alpha: number;
    composite: string;
  }> = [];
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  private stack: Array<{ alpha: number; composite: string }> = [];

  save() {
    this.stack.push({
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  restore() {
    const next = this.stack.pop();
    if (!next) return;
    this.globalAlpha = next.alpha;
    this.globalCompositeOperation = next.composite;
  }

  drawImage(image: unknown, dx = 0, dy = 0) {
    this.drawImageCalls.push({
      image,
      dx,
      dy,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  getImageData(_x = 0, _y = 0, width = 1, height = 1) {
    void _x;
    void _y;
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData() {}
  clearRect() {}
  fillRect() {}
  translate() {}
  rotate() {}
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context = new FakeContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeDoc(layers: ImageLayer[]): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Clipping Mask',
    width: 12,
    height: 8,
    layers,
    activeLayerId: layers[layers.length - 1]?.id ?? null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
  };
}

function makeLayer(overrides: Partial<ImageLayer>): ImageLayer {
  return {
    id: overrides.id ?? 'layer-1',
    name: overrides.name ?? 'Layer 1',
    type: overrides.type ?? 'image',
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    opacity: overrides.opacity ?? 1,
    blendMode: overrides.blendMode ?? 'normal',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    bitmap: overrides.bitmap ?? new OffscreenCanvas(4, 4) as LayerBitmap,
    bitmapVersion: overrides.bitmapVersion ?? 0,
    mask: overrides.mask ?? null,
    ...overrides,
  };
}

describe('Image clipping masks', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('clips a pixel layer to the transparency of the nearest base layer below before compositing', () => {
    const base = makeLayer({ id: 'base', name: 'Base shape', x: 2, y: 1 });
    const clipped = makeLayer({
      id: 'shading',
      name: 'Shading',
      x: 0,
      y: 0,
      ...({ clippingMask: true } as Partial<ImageLayer>),
    });

    const bitmap = renderImageDocumentLayersToBitmap(makeDoc([base, clipped]));
    const calls = (bitmap as unknown as FakeOffscreenCanvas).context.drawImageCalls;

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ image: base.bitmap, dx: 2, dy: 1 });
    expect(calls[1].image).not.toBe(clipped.bitmap);
    expect(calls[1]).toMatchObject({ dx: 0, dy: 0, composite: 'source-over' });

    const clippedComposite = calls[1].image as FakeOffscreenCanvas;
    expect(clippedComposite.width).toBe(12);
    expect(clippedComposite.height).toBe(8);
    expect(clippedComposite.context.drawImageCalls[0]).toMatchObject({
      image: clipped.bitmap,
      dx: 0,
      dy: 0,
      composite: 'source-over',
    });
    expect(clippedComposite.context.drawImageCalls.at(-1)).toMatchObject({
      composite: 'destination-in',
    });
  });

  it('clips a pixel layer above a group row to the combined transparency of the group descendants', () => {
    const groupChildA = makeLayer({
      id: 'group-child-a',
      name: 'Group child A',
      groupId: 'group-base',
      x: 1,
      y: 1,
    });
    const groupChildB = makeLayer({
      id: 'group-child-b',
      name: 'Group child B',
      groupId: 'group-base',
      x: 6,
      y: 2,
    });
    const group = makeLayer({
      id: 'group-base',
      name: 'Group base',
      type: 'group',
      bitmap: null,
    });
    const clipped = makeLayer({
      id: 'texture',
      name: 'Texture clipped to group',
      ...({ clippingMask: true } as Partial<ImageLayer>),
    });

    const bitmap = renderImageDocumentLayersToBitmap(makeDoc([groupChildA, groupChildB, group, clipped]));
    const calls = (bitmap as unknown as FakeOffscreenCanvas).context.drawImageCalls;

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ image: groupChildA.bitmap, dx: 1, dy: 1 });
    expect(calls[1]).toMatchObject({ image: groupChildB.bitmap, dx: 6, dy: 2 });
    expect(calls[2].image).not.toBe(clipped.bitmap);

    const clippedComposite = calls[2].image as FakeOffscreenCanvas;
    expect(clippedComposite.context.drawImageCalls[0]).toMatchObject({
      image: clipped.bitmap,
      composite: 'source-over',
    });

    const clippingMask = clippedComposite.context.drawImageCalls.at(-1)?.image as FakeOffscreenCanvas;
    expect(clippedComposite.context.drawImageCalls.at(-1)).toMatchObject({
      composite: 'destination-in',
    });
    expect(clippingMask.context.drawImageCalls.map((call) => call.image)).toEqual([
      groupChildA.bitmap,
      groupChildB.bitmap,
    ]);
  });

  it('describes clipping bases through visible group descendants with stable signatures', () => {
    const sourceLayers = [
      makeLayer({ id: 'orphan', name: 'Orphan clipped layer', clippingMask: true }),
      makeLayer({ id: 'visible-child', name: 'Visible group child', groupId: 'group-base', x: 2, y: 3, bitmap: new OffscreenCanvas(8, 4) as LayerBitmap }),
      makeLayer({ id: 'hidden-child', name: 'Hidden group child', groupId: 'group-base', visible: false, x: 20, y: 1, bitmap: new OffscreenCanvas(5, 5) as LayerBitmap }),
      makeLayer({ id: 'group-base', name: 'Visible group base', type: 'group', bitmap: null }),
      makeLayer({ id: 'texture', name: 'Texture clipped to visible group', clippingMask: true }),
      makeLayer({ id: 'hidden-base-child', name: 'Hidden base child', groupId: 'hidden-group', x: 4, y: 4, bitmap: new OffscreenCanvas(6, 6) as LayerBitmap }),
      makeLayer({ id: 'hidden-group', name: 'Hidden group base', type: 'group', bitmap: null, visible: false }),
      makeLayer({ id: 'shade', name: 'Shade clipped to hidden group', clippingMask: true }),
    ];

    expect(describeImageClippingMaskReadiness(sourceLayers)).toEqual({
      descriptorId: 'image-clipping-mask-readiness:v1',
      ready: false,
      clippedLayerIds: ['orphan', 'texture', 'shade'],
      baseLayerIds: ['group-base', 'hidden-group'],
      invalidLayerIds: ['orphan', 'shade'],
      hiddenBaseLayerIds: ['hidden-group'],
      groupBaseLayerIds: ['group-base', 'hidden-group'],
      chains: [
        {
          baseLayerId: null,
          baseKind: 'missing',
          clippedLayerIds: ['orphan'],
          valid: false,
          baseVisible: false,
          visibleBaseDescendantLayerIds: [],
          hiddenBaseDescendantLayerIds: [],
          baseBounds: null,
          blockers: ['missing-base'],
          caveats: [],
        },
        {
          baseLayerId: 'group-base',
          baseKind: 'group',
          clippedLayerIds: ['texture'],
          valid: true,
          baseVisible: true,
          visibleBaseDescendantLayerIds: ['visible-child'],
          hiddenBaseDescendantLayerIds: ['hidden-child'],
          baseBounds: { x: 2, y: 3, width: 8, height: 4 },
          blockers: [],
          caveats: ['group-base-descendant-alpha'],
        },
        {
          baseLayerId: 'hidden-group',
          baseKind: 'group',
          clippedLayerIds: ['shade'],
          valid: false,
          baseVisible: false,
          visibleBaseDescendantLayerIds: [],
          hiddenBaseDescendantLayerIds: ['hidden-base-child'],
          baseBounds: null,
          blockers: ['hidden-base'],
          caveats: ['group-base-descendant-alpha', 'group-base-hidden'],
        },
      ],
      chainValidation: {
        maxClippedLayerCount: 1,
        groupedChainBaseLayerIds: [],
        groupBaseChainLayerIds: ['texture', 'shade'],
        unsupportedStateCodes: [
          'group-base-descendant-alpha-preview',
          'native-psd-clipping-group-roundtrip',
        ],
      },
      sourceSafety: {
        sourceLinkedLayerIds: [],
        sourceLinkedClippedLayerIds: [],
        sourceLinkedBaseLayerIds: [],
        destructiveBatchSafe: true,
        blockers: [],
      },
      previewSignature: 'image-clipping-mask-readiness:v1|chains=orphan->none:missing:hidden:bounds=none:visible=none:hidden=none:blockers=missing-base;texture->group-base:group:visible:bounds=2,3,8,4:visible=visible-child:hidden=hidden-child:blockers=none;shade->hidden-group:group:hidden:bounds=none:visible=none:hidden=hidden-base-child:blockers=hidden-base|invalid=orphan,shade|hiddenBases=hidden-group|groups=group-base,hidden-group|validation=max=1,grouped=none,group-base=texture,shade,unsupported=group-base-descendant-alpha-preview,native-psd-clipping-group-roundtrip|source=linked=none,clipped=none,bases=none,blockers=none',
    });
  });

  it('validates grouped clipping chains and source-linked destructive safety with stable signatures', () => {
    const sourceLayers = [
      makeLayer({
        id: 'source-base',
        name: 'Source base',
        metadata: {
          sourceLink: {
            id: 'src-base',
            status: 'linked',
            relinkHistory: [],
          },
        },
      }),
      makeLayer({ id: 'tone', name: 'Tone', clippingMask: true }),
      makeLayer({
        id: 'source-texture',
        name: 'Source texture',
        clippingMask: true,
        metadata: { smartLinkedSourceId: 'src-texture' },
      }),
      makeLayer({ id: 'group-child', name: 'Group child', groupId: 'group-base', x: 4, y: 5 }),
      makeLayer({ id: 'group-base', name: 'Group base', type: 'group', bitmap: null }),
      makeLayer({ id: 'group-clip', name: 'Group clip', clippingMask: true }),
    ];

    const readiness = describeImageClippingMaskReadiness(sourceLayers);

    expect(readiness.chainValidation).toEqual({
      maxClippedLayerCount: 2,
      groupedChainBaseLayerIds: ['source-base'],
      groupBaseChainLayerIds: ['group-clip'],
      unsupportedStateCodes: [
        'nested-clipping-mask-chain-editing',
        'group-base-descendant-alpha-preview',
        'source-linked-destructive-clipping-edit',
        'native-psd-clipping-group-roundtrip',
      ],
    });
    expect(readiness.sourceSafety).toEqual({
      sourceLinkedLayerIds: ['source-base', 'source-texture'],
      sourceLinkedClippedLayerIds: ['source-texture'],
      sourceLinkedBaseLayerIds: ['source-base'],
      destructiveBatchSafe: false,
      blockers: [
        'source-linked-base-layer',
        'source-linked-clipped-layer',
      ],
    });
    expect(readiness.previewSignature).toBe(
      'image-clipping-mask-readiness:v1|chains=tone+source-texture->source-base:layer:visible:bounds=0,0,4,4:visible=none:hidden=none:blockers=none;group-clip->group-base:group:visible:bounds=4,5,4,4:visible=group-child:hidden=none:blockers=none|invalid=none|hiddenBases=none|groups=group-base|validation=max=2,grouped=source-base,group-base=group-clip,unsupported=nested-clipping-mask-chain-editing,group-base-descendant-alpha-preview,source-linked-destructive-clipping-edit,native-psd-clipping-group-roundtrip|source=linked=source-base,source-texture,clipped=source-texture,bases=source-base,blockers=source-linked-base-layer,source-linked-clipped-layer',
    );
  });
});
