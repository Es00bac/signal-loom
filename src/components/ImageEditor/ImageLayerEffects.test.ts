import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  buildLayerEffectReadinessSummary,
  describeLayerEffectUnsupportedStateDescriptors,
  describeLayerEffectPreset,
  describeLayerEffectStackInterop,
  createDefaultLayerEffect,
  getLayerEffectCapabilityCatalog,
  getUnsupportedLayerEffectWarnings,
  renderLayerWithEffects,
  synchronizeLayerEffectsGlobalLight,
} from './ImageLayerEffects';

class FakeContext {
  imageData: ImageData;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  private stack: Array<{ alpha: number; composite: string; fillStyle: string }> = [];

  constructor(width: number, height: number) {
    this.imageData = makeImageData(width, height);
  }

  createImageData(width: number, height: number) {
    return makeImageData(width, height);
  }

  getImageData() {
    return cloneImageData(this.imageData);
  }

  putImageData(imageData: ImageData) {
    this.imageData = cloneImageData(imageData);
  }

  drawImage(image: unknown, dx = 0, dy = 0) {
    const source = (image as { context?: FakeContext }).context?.imageData;
    if (!source) return;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const tx = Math.round(dx + x);
        const ty = Math.round(dy + y);
        if (tx < 0 || ty < 0 || tx >= this.imageData.width || ty >= this.imageData.height) {
          continue;
        }
        const sourceOffset = (y * source.width + x) * 4;
        const targetOffset = (ty * this.imageData.width + tx) * 4;
        this.imageData.data[targetOffset] = source.data[sourceOffset];
        this.imageData.data[targetOffset + 1] = source.data[sourceOffset + 1];
        this.imageData.data[targetOffset + 2] = source.data[sourceOffset + 2];
        this.imageData.data[targetOffset + 3] = source.data[sourceOffset + 3];
      }
    }
  }

  save() {
    this.stack.push({
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
    });
  }

  restore() {
    const next = this.stack.pop();
    if (!next) return;
    this.globalAlpha = next.alpha;
    this.globalCompositeOperation = next.composite;
    this.fillStyle = next.fillStyle;
  }

  clearRect() {
    this.imageData.data.fill(0);
  }

  fillRect() {}
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context: FakeContext;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = new FakeContext(width, height);
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }

  async convertToBlob() {
    return new Blob();
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function setPixel(imageData: ImageData, x: number, y: number, rgba: [number, number, number, number]) {
  const offset = (y * imageData.width + x) * 4;
  imageData.data[offset] = rgba[0];
  imageData.data[offset + 1] = rgba[1];
  imageData.data[offset + 2] = rgba[2];
  imageData.data[offset + 3] = rgba[3];
}

function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const offset = (y * imageData.width + x) * 4;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  const bitmap = new OffscreenCanvas(3, 3) as LayerBitmap;
  const imageData = makeImageData(3, 3);
  setPixel(imageData, 1, 1, [20, 40, 60, 255]);
  bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
  return {
    id: 'layer-1',
    name: 'Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

describe('ImageLayerEffects', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('creates enabled default layer effects with useful Photoshop-style settings', () => {
    expect(createDefaultLayerEffect('stroke')).toMatchObject({
      kind: 'stroke',
      enabled: true,
      size: 4,
      color: '#ffffff',
    });
    expect(createDefaultLayerEffect('dropShadow')).toMatchObject({
      kind: 'dropShadow',
      enabled: true,
      distance: 12,
      size: 12,
    });
    const innerShadow = createDefaultLayerEffect('innerShadow');
    expect(innerShadow).toMatchObject({
      kind: 'innerShadow',
      enabled: true,
      color: '#000000',
      opacity: 0.55,
      distance: 8,
      size: 10,
      angle: 45,
    });
    expect(JSON.parse(JSON.stringify(innerShadow))).toMatchObject({
      kind: 'innerShadow',
      color: '#000000',
      opacity: 0.55,
      distance: 8,
      size: 10,
      angle: 45,
    });
    expect(createDefaultLayerEffect('satin')).toMatchObject({
      kind: 'satin',
      enabled: true,
      color: '#000000',
      opacity: 0.45,
      distance: 10,
      size: 12,
      angle: 19,
      invert: false,
    });
    expect(createDefaultLayerEffect('patternOverlay')).toMatchObject({
      kind: 'patternOverlay',
      enabled: true,
      color: '#ffffff',
      backgroundColor: '#000000',
      opacity: 0.35,
      pattern: 'checker',
      scale: 8,
    });
    expect(createDefaultLayerEffect('innerGlow')).toMatchObject({
      kind: 'innerGlow',
      enabled: true,
      color: '#60a5fa',
      opacity: 0.65,
      size: 10,
    });
    expect(createDefaultLayerEffect('gradientOverlay')).toMatchObject({
      kind: 'gradientOverlay',
      enabled: true,
      color: '#ffffff',
      secondaryColor: '#000000',
      opacity: 1,
      angle: 0,
      scale: 1,
      reverse: false,
    });
  });

  it('applies color overlay to visible layer pixels', () => {
    const layer = makeLayer({
      effects: [{
        id: 'overlay',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff0000',
        opacity: 1,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([255, 0, 0, 255]);
  });

  it('draws outside stroke pixels around opaque layer content', () => {
    const layer = makeLayer({
      effects: [{
        id: 'stroke',
        kind: 'stroke',
        enabled: true,
        color: '#00ff00',
        opacity: 1,
        size: 1,
        position: 'outside',
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(-1);
    expect(rendered?.offsetY).toBe(-1);
    expect(imageData ? getPixel(imageData, 2, 1) : null).toEqual([0, 255, 0, 255]);
    expect(imageData ? getPixel(imageData, 2, 2) : null).toEqual([20, 40, 60, 255]);
  });

  it('places drop shadow pixels behind the source content', () => {
    const layer = makeLayer({
      effects: [{
        id: 'shadow',
        kind: 'dropShadow',
        enabled: true,
        color: '#0000ff',
        opacity: 1,
        angle: 0,
        distance: 1,
        size: 0,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(imageData ? getPixel(imageData, 2, 1) : null).toEqual([0, 0, 255, 255]);
    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([20, 40, 60, 255]);
  });

  it('renders inner shadow into opaque layer pixels without expanding layer bounds', () => {
    const bitmap = new OffscreenCanvas(3, 3) as LayerBitmap;
    const imageData = makeImageData(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        setPixel(imageData, x, y, [200, 200, 200, 255]);
      }
    }
    bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
    const layer = makeLayer({
      bitmap,
      effects: [{
        id: 'inner-shadow',
        kind: 'innerShadow',
        enabled: true,
        color: '#000000',
        opacity: 1,
        angle: 0,
        distance: 1,
        size: 0,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const renderedData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.bitmap.width).toBe(3);
    expect(rendered?.bitmap.height).toBe(3);
    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    const shadedEdge = renderedData ? getPixel(renderedData, 0, 1) : null;
    const unshadedEdge = renderedData ? getPixel(renderedData, 2, 1) : null;
    expect(shadedEdge?.[0]).toBeLessThan(unshadedEdge?.[0] ?? 0);
    expect(shadedEdge?.[3]).toBe(255);
    expect(unshadedEdge).toEqual([200, 200, 200, 255]);
  });

  it('renders satin shading into opaque layer pixels without expanding layer bounds', () => {
    const bitmap = new OffscreenCanvas(5, 5) as LayerBitmap;
    const imageData = makeImageData(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        setPixel(imageData, x, y, [180, 180, 180, 255]);
      }
    }
    bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
    const layer = makeLayer({
      bitmap,
      effects: [{
        id: 'satin',
        kind: 'satin',
        enabled: true,
        color: '#000000',
        opacity: 1,
        angle: 0,
        distance: 1,
        size: 2,
        invert: false,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const renderedData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.bitmap.width).toBe(5);
    expect(rendered?.bitmap.height).toBe(5);
    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    const center = renderedData ? getPixel(renderedData, 2, 2) : null;
    const edge = renderedData ? getPixel(renderedData, 0, 2) : null;
    expect(center?.[0]).toBeLessThan(edge?.[0] ?? 0);
    expect(center?.[3]).toBe(255);
  });

  it('tiles pattern overlay over visible layer pixels', () => {
    const bitmap = new OffscreenCanvas(4, 4) as LayerBitmap;
    const imageData = makeImageData(4, 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        setPixel(imageData, x, y, [10, 20, 30, 255]);
      }
    }
    bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
    const layer = makeLayer({
      bitmap,
      effects: [{
        id: 'pattern',
        kind: 'patternOverlay',
        enabled: true,
        color: '#ffffff',
        backgroundColor: '#000000',
        opacity: 1,
        pattern: 'checker',
        scale: 2,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const renderedData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(renderedData ? getPixel(renderedData, 0, 0) : null).toEqual([255, 255, 255, 255]);
    expect(renderedData ? getPixel(renderedData, 2, 0) : null).toEqual([0, 0, 0, 255]);
    expect(renderedData ? getPixel(renderedData, 0, 2) : null).toEqual([0, 0, 0, 255]);
  });

  it('renders inner glow into opaque layer edge pixels without expanding layer bounds', () => {
    const bitmap = new OffscreenCanvas(3, 3) as LayerBitmap;
    const imageData = makeImageData(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        setPixel(imageData, x, y, [20, 20, 20, 255]);
      }
    }
    bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
    const layer = makeLayer({
      bitmap,
      effects: [{
        id: 'inner-glow',
        kind: 'innerGlow',
        enabled: true,
        color: '#ffffff',
        opacity: 1,
        size: 1,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const renderedData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);
    const edge = renderedData ? getPixel(renderedData, 0, 1) : null;
    const center = renderedData ? getPixel(renderedData, 1, 1) : null;

    expect(rendered?.bitmap.width).toBe(3);
    expect(rendered?.bitmap.height).toBe(3);
    expect(edge?.[0]).toBeGreaterThan(center?.[0] ?? 255);
    expect(edge?.[3]).toBe(255);
    expect(center).toEqual([20, 20, 20, 255]);
  });

  it('renders gradient overlay across visible layer pixels', () => {
    const bitmap = new OffscreenCanvas(3, 1) as LayerBitmap;
    const imageData = makeImageData(3, 1);
    for (let x = 0; x < 3; x += 1) {
      setPixel(imageData, x, 0, [10, 20, 30, 255]);
    }
    bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
    const layer = makeLayer({
      bitmap,
      effects: [{
        id: 'gradient-overlay',
        kind: 'gradientOverlay',
        enabled: true,
        color: '#ff0000',
        secondaryColor: '#0000ff',
        opacity: 1,
        angle: 0,
        scale: 1,
        reverse: false,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const renderedData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(renderedData ? getPixel(renderedData, 0, 0) : null).toEqual([255, 0, 0, 255]);
    expect(renderedData ? getPixel(renderedData, 1, 0) : null).toEqual([128, 0, 128, 255]);
    expect(renderedData ? getPixel(renderedData, 2, 0) : null).toEqual([0, 0, 255, 255]);
  });

  it('ignores disabled effects', () => {
    const layer = makeLayer({
      effects: [{
        id: 'disabled-overlay',
        kind: 'colorOverlay',
        enabled: false,
        color: '#ff0000',
        opacity: 1,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([20, 40, 60, 255]);
  });

  it('synchronizes drop and inner shadow angles to a shared global light value', () => {
    const effects = [
      {
        id: 'drop',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 10,
        distance: 8,
        size: 4,
      },
      {
        id: 'inner',
        kind: 'innerShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: -20,
        distance: 4,
        size: 2,
      },
      {
        id: 'glow',
        kind: 'outerGlow',
        enabled: true,
        color: '#60a5fa',
        opacity: 0.7,
        size: 12,
      },
    ] as const;

    const synchronized = synchronizeLayerEffectsGlobalLight(effects, 135);

    expect(synchronized).toEqual([
      expect.objectContaining({ id: 'drop', angle: 135 }),
      expect.objectContaining({ id: 'inner', angle: 135 }),
      effects[2],
    ]);
    expect(synchronized[0]).not.toBe(effects[0]);
    expect(synchronized[1]).not.toBe(effects[1]);
    expect(synchronized[2]).toBe(effects[2]);
  });

  it('describes reusable layer effect preset metadata from supported effects', () => {
    const preset = describeLayerEffectPreset([
      {
        id: 'drop',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 90,
        distance: 12,
        size: 8,
      },
      {
        id: 'overlay',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff00ff',
        opacity: 0.8,
      },
      {
        id: 'disabled-stroke',
        kind: 'stroke',
        enabled: false,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      },
    ]);

    expect(preset).toEqual({
      effectKinds: ['dropShadow', 'colorOverlay'],
      labels: ['Drop Shadow', 'Color Overlay'],
      usesGlobalLight: true,
      expandsBounds: true,
      contentEffectKinds: ['colorOverlay'],
      canvasEffectKinds: ['dropShadow'],
    });
  });

  it('reports deterministic unsupported-effect warnings for missing Photoshop-style effects', () => {
    expect(getUnsupportedLayerEffectWarnings([
      'satin',
      'dropShadow',
      'bevelEmboss',
      'patternOverlay',
      'bevelEmboss',
    ])).toEqual([
      'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
    ]);
  });

  it('publishes typed unsupported layer-style states for Photoshop-only fidelity gaps', () => {
    const states = describeLayerEffectUnsupportedStateDescriptors({
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'present',
      nativePsdLiveEffects: 'required',
      smartObjectEffectPreservation: 'required',
    });

    expect(states).toEqual([
      expect.objectContaining({
        id: 'effect-kind:bevelEmboss',
        capability: 'unsupported-effect',
        supported: false,
        preservation: 'metadata-only',
        requiresFlattenedPixelsForParity: true,
        reasonCode: 'layer-effect-bevel-emboss-unsupported',
      }),
      expect.objectContaining({
        id: 'blend-if',
        capability: 'blend-if',
        supported: false,
        preservation: 'metadata-only',
        requiresFlattenedPixelsForParity: true,
        reasonCode: 'layer-effect-blend-if-unsupported',
      }),
      expect.objectContaining({
        id: 'native-psd-live-effect-fidelity',
        capability: 'native-psd-live-effect-fidelity',
        supported: false,
        preservation: 'flattened-pixels-and-signal-loom-metadata',
        requiresFlattenedPixelsForParity: true,
        reasonCode: 'native-psd-live-effect-fidelity-unsupported',
      }),
      expect.objectContaining({
        id: 'smart-object-effect-preservation',
        capability: 'smart-object-effect-preservation',
        supported: false,
        preservation: 'metadata-only',
        requiresFlattenedPixelsForParity: true,
        reasonCode: 'smart-object-effect-preservation-unsupported',
      }),
    ]);
    expect(states.map((state) => state.signature)).toEqual([
      'layer-effect-unsupported-state:v1:effect-kind:bevelEmboss:layer-effect-bevel-emboss-unsupported:metadata-only',
      'layer-effect-unsupported-state:v1:blend-if:layer-effect-blend-if-unsupported:metadata-only',
      'layer-effect-unsupported-state:v1:native-psd-live-effect-fidelity:native-psd-live-effect-fidelity-unsupported:flattened-pixels-and-signal-loom-metadata',
      'layer-effect-unsupported-state:v1:smart-object-effect-preservation:smart-object-effect-preservation-unsupported:metadata-only',
    ]);
  });

  it('publishes a stable layer effect capability catalog with supported and unsupported parity entries', () => {
    expect(getLayerEffectCapabilityCatalog()).toEqual([
      {
        kind: 'stroke',
        label: 'Stroke',
        supported: true,
        presetEligible: true,
        renderer: 'canvas',
      },
      {
        kind: 'dropShadow',
        label: 'Drop Shadow',
        supported: true,
        presetEligible: true,
        renderer: 'canvas',
      },
      {
        kind: 'innerShadow',
        label: 'Inner Shadow',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'outerGlow',
        label: 'Outer Glow',
        supported: true,
        presetEligible: true,
        renderer: 'canvas',
      },
      {
        kind: 'innerGlow',
        label: 'Inner Glow',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'colorOverlay',
        label: 'Color Overlay',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'satin',
        label: 'Satin',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'patternOverlay',
        label: 'Pattern Overlay',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'gradientOverlay',
        label: 'Gradient Overlay',
        supported: true,
        presetEligible: true,
        renderer: 'content',
      },
      {
        kind: 'bevelEmboss',
        label: 'Bevel & Emboss',
        supported: false,
        presetEligible: false,
        renderer: 'unsupported',
        warning: 'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
      },
    ]);
  });

  it('describes layer effect stack interoperability warnings and preview/export parity signatures', () => {
    const descriptor = describeLayerEffectStackInterop([
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 45,
        distance: 12,
        size: 8,
      },
      {
        id: 'overlay-runtime',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff00ff',
        opacity: 0.8,
      },
      {
        id: 'satin-runtime',
        kind: 'satin',
        enabled: true,
        color: '#000000',
        opacity: 0.45,
        angle: 19,
        distance: 10,
        size: 12,
        invert: false,
      },
      {
        id: 'pattern-runtime',
        kind: 'patternOverlay',
        enabled: true,
        color: '#ffffff',
        backgroundColor: '#000000',
        opacity: 0.35,
        pattern: 'checker',
        scale: 8,
      },
    ], {
      unsupportedEffectKinds: ['bevelEmboss', 'satin', 'bevelEmboss'],
      blendIf: 'present',
      globalLightAngle: 45,
      exportTarget: 'flattened',
    });

    expect(descriptor.globalLight).toEqual({
      required: true,
      angle: 45,
      dependentEffectIds: ['drop-runtime'],
      participants: [
        { effectId: 'drop-runtime', kind: 'dropShadow', participates: true },
      ],
    });
    expect(descriptor.blendOrderSignature).toBe(
      'layer-effect-order:v1:[{"order":0,"kind":"dropShadow","enabled":true,"renderer":"canvas"},{"order":1,"kind":"colorOverlay","enabled":true,"renderer":"content"},{"order":2,"kind":"satin","enabled":true,"renderer":"content"},{"order":3,"kind":"patternOverlay","enabled":true,"renderer":"content"}]',
    );
    expect(descriptor.previewSignature).toContain('"previewId":"image-layer-effects-stack:v2"');
    expect(descriptor.previewSignature).toContain('"effects":[{"order":0,"id":"drop-runtime","kind":"dropShadow","enabled":true,"renderer":"canvas","globalLight":45},{"order":1,"id":"overlay-runtime","kind":"colorOverlay","enabled":true,"renderer":"content"},{"order":2,"id":"satin-runtime","kind":"satin","enabled":true,"renderer":"content"},{"order":3,"id":"pattern-runtime","kind":"patternOverlay","enabled":true,"renderer":"content"}]');
    expect(descriptor.exportSignature).toContain('"target":"flattened"');
    expect(descriptor.exportSignature).toContain('"unsupported":["bevelEmboss"]');
    expect(descriptor.exportSignature).toContain('"capabilityGroups":["canvas-effects","content-effects","unsupported-photoshop-effects"]');
    expect(descriptor.warnings).toEqual([
      'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
      'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
      'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
    ]);
  });

  it('describes layer effect capability groups and typed parity limitations', () => {
    const descriptor = describeLayerEffectStackInterop([
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 33.3336,
        distance: 12,
        size: 8,
      },
      {
        id: 'inner-runtime',
        kind: 'innerShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 120,
        distance: 6,
        size: 4,
      },
      {
        id: 'disabled-stroke',
        kind: 'stroke',
        enabled: false,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      },
    ], {
      unsupportedEffectKinds: ['patternOverlay', 'bevelEmboss', 'satin'],
      blendIf: 'present',
      globalLightAngle: 33.3336,
      exportTarget: 'flattened',
    });

    expect(descriptor.previewId).toBe('image-layer-effects-stack:v2');
    expect(descriptor.globalLight).toEqual({
      required: true,
      angle: 33.334,
      dependentEffectIds: ['drop-runtime', 'inner-runtime'],
      participants: [
        { effectId: 'drop-runtime', kind: 'dropShadow', participates: true },
        { effectId: 'inner-runtime', kind: 'innerShadow', participates: true },
      ],
    });
    expect(descriptor.capabilityGroups).toEqual([
      {
        id: 'canvas-effects',
        label: 'Canvas-rendered effects',
        effectKinds: ['stroke', 'dropShadow', 'outerGlow'],
        supported: true,
      },
      {
        id: 'content-effects',
        label: 'Content-rendered effects',
        effectKinds: ['innerShadow', 'innerGlow', 'colorOverlay', 'satin', 'patternOverlay', 'gradientOverlay'],
        supported: true,
      },
      {
        id: 'unsupported-photoshop-effects',
        label: 'Unsupported Photoshop effects',
        effectKinds: ['bevelEmboss'],
        supported: false,
      },
    ]);
    expect(descriptor.unsupportedEffects).toEqual([
      {
        kind: 'bevelEmboss',
        label: 'Bevel & Emboss',
        status: 'unsupported',
        preservation: 'metadata-only',
        warning: 'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
      },
    ]);
    expect(descriptor.advancedBlending).toEqual({
      blendIf: 'present',
      supported: false,
      warning: 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
    });
    expect(descriptor.unsupportedBlendIf).toEqual({
      id: 'blend-if',
      label: 'Blend If',
      supported: false,
      preservation: 'metadata-only',
      requiresFlatteningForParity: true,
      warning: 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
      signature: 'layer-effect-blend-if:v1:present:metadata-only',
    });
    expect(descriptor.flattenedExport).toEqual({
      target: 'flattened',
      rasterizesEffects: true,
      preservesEditableLayerStyles: false,
      warning: 'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
    });
    expect(descriptor.globalLightPortability).toEqual({
      id: 'layer-effect-global-light-portability:v1',
      portableWithinSignalLoom: true,
      portableAcrossDocuments: true,
      portableAsEditablePhotoshopLayerStyle: false,
      usesGlobalLight: true,
      angle: 33.334,
      participantEffectIds: ['drop-runtime', 'inner-runtime'],
      warnings: [],
      signature: 'layer-effect-global-light:v1:33.334:drop-runtime|inner-runtime',
    });
    expect(descriptor.presetPortability).toEqual({
      id: 'layer-effect-preset-portability:v1',
      portableWithinSignalLoom: false,
      portableAcrossDocuments: false,
      portableAsEditablePhotoshopLayerStyle: false,
      usesGlobalLight: true,
      unsupportedFeatures: ['blend-if', 'bevelEmboss'],
      warnings: [
        'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
        'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
        'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
      ],
      signature: 'layer-effect-preset-portability:v1:blend-if|bevelEmboss:global-light:33.334:drop-runtime|inner-runtime',
    });
    expect(descriptor.stackPortability).toEqual({
      portableWithinSignalLoom: false,
      portableAcrossSignalLoomDocuments: false,
      portableAsEditablePhotoshopLayerStyle: false,
      requiresFlattenedPixelsForExport: true,
      warnings: [
        'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
        'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
        'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
      ],
      signature:
        'layer-effect-stack-portability:v1:{"portableWithinSignalLoom":false,"portableAcrossSignalLoomDocuments":false,"portableAsEditablePhotoshopLayerStyle":false,"requiresFlattenedPixelsForExport":true,"warnings":["Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.","Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.","Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity."]}',
    });
    expect(descriptor.previewSignature).toContain('"previewId":"image-layer-effects-stack:v2"');
    expect(descriptor.exportSignature).toContain('"capabilityGroups":["canvas-effects","content-effects","unsupported-photoshop-effects"]');
  });

  it('includes alpha opacity caveats and blend math limitations in layer effect parity descriptors', () => {
    const descriptor = describeLayerEffectStackInterop([
      {
        id: 'stroke-runtime',
        kind: 'stroke',
        enabled: true,
        color: '#ffffff',
        opacity: 0.75,
        size: 4,
        position: 'outside',
      },
      {
        id: 'overlay-runtime',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff00ff',
        opacity: 0.35,
      },
    ], {
      blendIf: 'present',
      exportTarget: 'flattened',
    });

    expect(descriptor.alphaOpacityCaveats).toEqual([
      {
        id: 'effect-opacity',
        label: 'Layer effect opacity',
        affectedEffectIds: ['stroke-runtime', 'overlay-runtime'],
        caveat: 'Layer effect opacity is baked into rendered pixels before the parent layer blend mode is applied; Photoshop fill opacity and advanced blending masks are not modeled.',
      },
      {
        id: 'flattened-export-alpha',
        label: 'Flattened export alpha',
        affectedEffectIds: ['stroke-runtime', 'overlay-runtime'],
        caveat: 'Flattened exports preserve rendered alpha but do not preserve editable Photoshop layer-style opacity controls.',
      },
    ]);
    expect(descriptor.knownMathLimitations).toEqual([
      'Stroke, glow, and shadow spread use deterministic raster expansion instead of Photoshop bevel/contour/noise kernels.',
      'Inner Shadow, Inner Glow, Satin, Pattern Overlay, Gradient Overlay, and Color Overlay are content-rendered approximations that are flattened before blend-mode compositing.',
      'Blend If / advanced blending ranges are metadata caveats only and do not alter preview or export pixels.',
    ]);
    expect(descriptor.previewSignature).toContain('"alphaOpacityCaveats":["effect-opacity","flattened-export-alpha"]');
    expect(descriptor.exportSignature).toContain('"knownMathLimitations"');
  });

  it('describes deterministic per-effect flatten/export caveats for style portability', () => {
    const descriptor = describeLayerEffectStackInterop([
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 45,
        distance: 12,
        size: 8,
      },
      {
        id: 'inner-glow-runtime',
        kind: 'innerGlow',
        enabled: true,
        color: '#60a5fa',
        opacity: 0.65,
        size: 10,
      },
      {
        id: 'disabled-stroke',
        kind: 'stroke',
        enabled: false,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      },
    ], {
      globalLightAngle: 77.5,
      exportTarget: 'flattened',
    });

    expect(descriptor.perEffectExportCaveats).toEqual([
      {
        effectId: 'drop-runtime',
        kind: 'dropShadow',
        label: 'Drop Shadow',
        renderer: 'canvas',
        presetEligible: true,
        usesGlobalLight: true,
        expandsBounds: true,
        flattenedForExport: true,
        preservesEditableSignalLoomMetadata: true,
        nativePhotoshopLayerStyleRoundtrip: false,
        caveatCodes: [
          'effect-flattened-for-export',
          'canvas-effect-bounds-expansion',
          'global-light-metadata-only',
          'native-photoshop-layer-style-roundtrip-unavailable',
        ],
        caveats: [
          'Flattened export bakes Drop Shadow into pixels while keeping editable Signal Loom effect metadata.',
          'Drop Shadow can expand raster bounds before export.',
          'Drop Shadow participates in shared global light metadata at 77.5 degrees.',
          'Editable native Photoshop layer-style roundtrip is unavailable; export relies on flattened pixels plus Signal Loom metadata.',
        ],
        signature: 'layer-effect-export-caveat:v1:{"effectId":"drop-runtime","kind":"dropShadow","renderer":"canvas","target":"flattened","globalLight":77.5,"caveatCodes":["effect-flattened-for-export","canvas-effect-bounds-expansion","global-light-metadata-only","native-photoshop-layer-style-roundtrip-unavailable"]}',
      },
      {
        effectId: 'inner-glow-runtime',
        kind: 'innerGlow',
        label: 'Inner Glow',
        renderer: 'content',
        presetEligible: true,
        usesGlobalLight: false,
        expandsBounds: false,
        flattenedForExport: true,
        preservesEditableSignalLoomMetadata: true,
        nativePhotoshopLayerStyleRoundtrip: false,
        caveatCodes: [
          'effect-flattened-for-export',
          'content-effect-raster-approximation',
          'native-photoshop-layer-style-roundtrip-unavailable',
        ],
        caveats: [
          'Flattened export bakes Inner Glow into pixels while keeping editable Signal Loom effect metadata.',
          'Inner Glow is rendered into layer content before blend-mode compositing.',
          'Editable native Photoshop layer-style roundtrip is unavailable; export relies on flattened pixels plus Signal Loom metadata.',
        ],
        signature: 'layer-effect-export-caveat:v1:{"effectId":"inner-glow-runtime","kind":"innerGlow","renderer":"content","target":"flattened","globalLight":77.5,"caveatCodes":["effect-flattened-for-export","content-effect-raster-approximation","native-photoshop-layer-style-roundtrip-unavailable"]}',
      },
    ]);
    expect(descriptor.previewSignature).toContain('"perEffectExportCaveats":["drop-runtime","inner-glow-runtime"]');
    expect(descriptor.exportSignature).toContain('"perEffectExportCaveats"');
  });

  it('builds a deterministic readiness summary for supported and missing Photoshop layer styles', () => {
    const readiness = buildLayerEffectReadinessSummary([
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 42.5,
        distance: 12,
        size: 8,
      },
      {
        id: 'inner-runtime',
        kind: 'innerShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 120,
        distance: 6,
        size: 4,
      },
      {
        id: 'gradient-runtime',
        kind: 'gradientOverlay',
        enabled: true,
        color: '#ffffff',
        secondaryColor: '#000000',
        opacity: 1,
        angle: 12,
        scale: 0.8,
        reverse: true,
      },
    ], {
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'present',
      globalLightAngle: 42.5,
      exportTarget: 'flattened',
    });

    expect(readiness).toMatchObject({
      id: 'image-layer-effects-readiness:v1',
      supportedEffects: [
        { kind: 'dropShadow', label: 'Drop Shadow', renderer: 'canvas', presetEligible: true },
        { kind: 'innerShadow', label: 'Inner Shadow', renderer: 'content', presetEligible: true },
        { kind: 'gradientOverlay', label: 'Gradient Overlay', renderer: 'content', presetEligible: true },
      ],
      unsupportedReadiness: {
        bevelEmboss: {
          supported: false,
          preservation: 'metadata-only',
          flatteningRequiredForPixels: true,
        },
        blendIf: {
          supported: false,
          preservation: 'metadata-only',
          flatteningRequiredForPixels: true,
        },
      },
      globalLight: {
        participates: true,
        angle: 42.5,
        effectIds: ['drop-runtime', 'inner-runtime'],
      },
      portability: {
        exportTarget: 'flattened',
        portableAsSignalLoomPreset: false,
        flattensForPixelExport: true,
        preservesEditablePhotoshopLayerStyles: false,
      },
    });
    expect(readiness.mathCaveats).toEqual([
      'Stroke, glow, and shadow spread use deterministic raster expansion instead of Photoshop bevel/contour/noise kernels.',
      'Inner Shadow, Inner Glow, Satin, Pattern Overlay, Gradient Overlay, and Color Overlay are content-rendered approximations that are flattened before blend-mode compositing.',
      'Blend If / advanced blending ranges are metadata caveats only and do not alter preview or export pixels.',
    ]);
    expect(readiness.presetCompatibility.signature).toBe(
      'layer-effect-preset:v1:dropShadow|innerShadow|gradientOverlay:global-light:42.5:unsupported:bevelEmboss:blend-if:present',
    );
    expect(readiness.globalLightPortability).toEqual({
      id: 'layer-effect-global-light-portability:v1',
      portableWithinSignalLoom: true,
      portableAcrossDocuments: true,
      portableAsEditablePhotoshopLayerStyle: false,
      usesGlobalLight: true,
      angle: 42.5,
      participantEffectIds: ['drop-runtime', 'inner-runtime'],
      warnings: [],
      signature: 'layer-effect-global-light:v1:42.5:drop-runtime|inner-runtime',
    });
    expect(readiness.blendIfPortability).toEqual({
      id: 'blend-if',
      label: 'Blend If',
      supported: false,
      preservation: 'metadata-only',
      requiresFlatteningForParity: true,
      warning: 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
      signature: 'layer-effect-blend-if:v1:present:metadata-only',
    });
    expect(readiness.presetPortability).toEqual({
      id: 'layer-effect-preset-portability:v1',
      portableWithinSignalLoom: false,
      portableAcrossDocuments: false,
      portableAsEditablePhotoshopLayerStyle: false,
      usesGlobalLight: true,
      unsupportedFeatures: ['blend-if', 'bevelEmboss'],
      warnings: [
        'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
        'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
        'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
      ],
      signature: 'layer-effect-preset-portability:v1:blend-if|bevelEmboss:global-light:42.5:drop-runtime|inner-runtime',
    });
    expect(readiness.signatures.stack).toContain('layer-effect-readiness-stack:v1:');
    expect(readiness.signatures.preview).toContain('layer-effect-preview:v1:');
    expect(readiness.signatures.export).toContain('layer-effect-export:v1:');
  });

  it('summarizes readiness blockers and warnings for layer style portability gaps', () => {
    const readiness = buildLayerEffectReadinessSummary([
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 45,
        distance: 12,
        size: 8,
      },
      {
        id: 'overlay-runtime',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff00ff',
        opacity: 0.35,
      },
    ], {
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'present',
      exportTarget: 'flattened',
    });

    expect(readiness.supportedEffectCatalog).toEqual([
      { kind: 'stroke', label: 'Stroke', renderer: 'canvas', presetEligible: true },
      { kind: 'dropShadow', label: 'Drop Shadow', renderer: 'canvas', presetEligible: true },
      { kind: 'innerShadow', label: 'Inner Shadow', renderer: 'content', presetEligible: true },
      { kind: 'outerGlow', label: 'Outer Glow', renderer: 'canvas', presetEligible: true },
      { kind: 'innerGlow', label: 'Inner Glow', renderer: 'content', presetEligible: true },
      { kind: 'colorOverlay', label: 'Color Overlay', renderer: 'content', presetEligible: true },
      { kind: 'satin', label: 'Satin', renderer: 'content', presetEligible: true },
      { kind: 'patternOverlay', label: 'Pattern Overlay', renderer: 'content', presetEligible: true },
      { kind: 'gradientOverlay', label: 'Gradient Overlay', renderer: 'content', presetEligible: true },
    ]);
    expect(readiness.unsupportedStates).toEqual([
      'bevelEmboss:metadata-only',
      'blendIf:metadata-only',
    ]);
    expect(readiness.blockers).toEqual([
      {
        code: 'layer-effect-bevel-emboss-unsupported',
        severity: 'blocker',
        message: 'Bevel & Emboss layer styles are metadata-only in Signal Loom; flatten before requiring pixel parity.',
      },
      {
        code: 'layer-effect-blend-if-unsupported',
        severity: 'blocker',
        message: 'Photoshop Blend If / advanced blending ranges are metadata-only; flatten before requiring preview or export pixel parity.',
      },
    ]);
    expect(readiness.warnings).toEqual([
      {
        code: 'layer-effect-flattened-export-rasterizes-effects',
        severity: 'warning',
        message: 'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.',
      },
      {
        code: 'layer-effect-opacity-baked-into-render',
        severity: 'warning',
        message: 'Layer effect opacity is baked into rendered pixels before the parent layer blend mode is applied; Photoshop fill opacity and advanced blending masks are not modeled.',
      },
      {
        code: 'layer-effect-flattened-alpha-controls-not-editable',
        severity: 'warning',
        message: 'Flattened exports preserve rendered alpha but do not preserve editable Photoshop layer-style opacity controls.',
      },
      {
        code: 'layer-effect-preset-portability-limited',
        severity: 'warning',
        message: 'Layer style presets remain portable inside Signal Loom only for supported effects; native Photoshop-only controls require metadata or flattened pixels.',
      },
    ]);
  });

  it('keeps readiness signatures stable for disabled effects and sensitive to stack/export policy', () => {
    const effects = [
      {
        id: 'drop-runtime',
        kind: 'dropShadow',
        enabled: true,
        color: '#000000',
        opacity: 0.5,
        angle: 45,
        distance: 12,
        size: 8,
      },
      {
        id: 'disabled-stroke',
        kind: 'stroke',
        enabled: false,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      },
    ] as const;

    const editable = buildLayerEffectReadinessSummary(effects, {
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'absent',
      exportTarget: 'editable',
    });
    const editableAgain = buildLayerEffectReadinessSummary(effects, {
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'absent',
      exportTarget: 'editable',
    });
    const flattened = buildLayerEffectReadinessSummary(effects, {
      unsupportedEffectKinds: ['bevelEmboss'],
      blendIf: 'absent',
      exportTarget: 'flattened',
    });

    expect(editable.signatures).toEqual(editableAgain.signatures);
    expect(editable.effectKinds).toEqual(['dropShadow']);
    expect(editable.signatures.stack).not.toContain('disabled-stroke');
    expect(editable.signatures.export).not.toBe(flattened.signatures.export);
    expect(editable.portability.portableAsSignalLoomPreset).toBe(false);
    expect(editable.portability.flattensForPixelExport).toBe(false);
    expect(flattened.portability.flattensForPixelExport).toBe(true);
  });
});
