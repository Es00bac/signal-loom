import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH_SETTINGS } from '../../../types/imageEditor';
import { describeBrushAndEraserToolWorkflow } from './brushTool';

describe('brush and eraser workflow descriptors', () => {
  it('describes supported local brush and eraser routes with deterministic preview metadata', () => {
    const descriptor = describeBrushAndEraserToolWorkflow({
      ...DEFAULT_BRUSH_SETTINGS,
      size: 24,
      opacity: 0.5,
      flow: 0.25,
      hardness: 0.75,
      smoothing: 0.4,
      pressureSize: 0.2,
      pressureFlow: 0.6,
      pressureAngle: 0.7,
      colorJitter: 0.3,
      symmetryMode: 'vertical',
    }, {
      activeRoute: 'layer-mask',
      channel: 'red',
      quickMaskEnabled: false,
      previewFrom: { x: 2, y: 3 },
      previewTo: { x: 34, y: 3 },
      pressure: 0.5,
      seed: 11,
    });

    expect(descriptor).toMatchObject({
      descriptorId: 'image-brush-eraser-workflow:v1',
      deterministic: true,
      tools: {
        brush: {
          status: 'supported',
          operation: 'paint-color',
          routes: {
            pixelLayer: { supported: true, channel: 'rgb', compositing: 'source-over' },
            rgbChannel: { supported: true, channel: 'red', compositing: 'source-over' },
            layerMask: { supported: true, brushTarget: 'reveal-or-conceal-from-color' },
            quickMask: { supported: true, brushTarget: 'selection-coverage-from-color' },
          },
        },
        eraser: {
          status: 'supported',
          operation: 'remove-pixels-or-reveal-masks',
          routes: {
            pixelLayer: { supported: true, channel: 'rgb', compositing: 'destination-out' },
            rgbChannel: { supported: true, channel: 'red', compositing: 'source-over-channel-route' },
            layerMask: { supported: true, brushTarget: 'conceal-mask' },
            quickMask: { supported: true, brushTarget: 'reveal-selection-coverage' },
          },
        },
        backgroundEraser: {
          status: 'partial',
          operation: 'brush-bounded-background-alpha-clear',
          routes: {
            pixelLayer: { supported: true, channel: 'rgb', compositing: 'alpha-clear' },
            rgbChannel: { supported: false },
            layerMask: { supported: false },
            quickMask: { supported: false },
          },
          sampling: {
            mode: 'once',
            source: 'pointer-sample',
          },
          tolerance: {
            value: 32,
            metric: 'rgb-euclidean-distance',
          },
          output: {
            target: 'active-pixel-layer-alpha',
            alpha: 0,
            undoable: true,
          },
        },
        magicEraser: {
          status: 'supported',
          operation: 'remove-contiguous-color-by-tolerance',
          tolerance: {
            value: 32,
            metric: 'rgb-euclidean-distance',
          },
          output: {
            target: 'active-pixel-layer-alpha',
            alpha: 0,
            undoable: true,
          },
        },
      },
      behavior: {
        opacity: { value: 0.5, affects: ['dab-alpha'] },
        flow: { value: 0.25, affects: ['dab-build-up'] },
        hardness: { value: 0.75, affects: ['dab-edge-falloff'] },
        smoothing: { value: 0.4, followFactor: 0.66 },
      },
      preview: {
        deterministic: true,
        from: { x: 2, y: 3 },
        to: { x: 34, y: 3 },
        seed: 11,
        channel: 'red',
        activeRoute: 'layer-mask',
      },
    });
    expect(descriptor.preview.signature).toBe('24:0.12:0.5:0.4:11:2,3->23.12,3:9');
    expect(descriptor.warnings.map((warning) => warning.code)).toEqual([
      'background-eraser-heuristic-limits',
      'advanced-dynamics-unsupported',
      'advanced-dynamics-unsupported',
    ]);
    expect(descriptor.warnings.map((warning) => warning.field)).toEqual([
      undefined,
      'pressureAngle',
      'colorJitter',
    ]);
    expect(descriptor.signature).toBe(
      'image-brush-eraser-workflow:v1:{"toolStatus":{"brush":"supported","eraser":"supported","backgroundEraser":"partial","magicEraser":"supported"},"route":"layer-mask","channel":"red","quickMask":false,"settings":{"size":24,"opacity":0.5,"flow":0.25,"hardness":0.75,"smoothing":0.4,"symmetry":"vertical"},"preview":"24:0.12:0.5:0.4:11:2,3->23.12,3:9","warnings":["background-eraser-heuristic-limits","pressureAngle","colorJitter"]}',
    );
    expect(describeBrushAndEraserToolWorkflow({
      ...DEFAULT_BRUSH_SETTINGS,
      size: 24,
      opacity: 0.5,
      flow: 0.25,
      hardness: 0.75,
      smoothing: 0.4,
      pressureSize: 0.2,
      pressureFlow: 0.6,
      pressureAngle: 0.7,
      colorJitter: 0.3,
      symmetryMode: 'vertical',
    }, {
      activeRoute: 'layer-mask',
      channel: 'red',
      quickMaskEnabled: false,
      previewFrom: { x: 2, y: 3 },
      previewTo: { x: 34, y: 3 },
      pressure: 0.5,
      seed: 11,
    })).toEqual(descriptor);
  });

  it('describes bounded Background Eraser settings without claiming channel, mask, or QuickMask routes', () => {
    const descriptor = describeBrushAndEraserToolWorkflow(DEFAULT_BRUSH_SETTINGS, {
      activeRoute: 'pixel-layer',
      backgroundEraserTolerance: 18,
      backgroundEraserContiguous: false,
      backgroundEraserSampling: 'continuous',
      backgroundEraserUseBackgroundSwatch: true,
      backgroundEraserLimits: 'discontiguous',
      backgroundEraserProtectForeground: true,
      backgroundEraserForegroundColor: '#ff0000',
      backgroundEraserBackgroundColor: '#00ff00',
    });

    expect(descriptor.tools.backgroundEraser).toMatchObject({
      status: 'partial',
      operation: 'brush-bounded-background-alpha-clear',
      routes: {
        pixelLayer: {
          supported: true,
          active: true,
          channel: 'rgb',
          compositing: 'alpha-clear',
        },
        rgbChannel: { supported: false },
        layerMask: { supported: false },
        quickMask: { supported: false },
      },
      tolerance: {
        value: 18,
        metric: 'rgb-euclidean-distance',
      },
      matching: {
        scope: 'brush-bounded',
        contiguous: false,
        limits: 'discontiguous',
      },
      sampling: {
        mode: 'continuous',
        source: 'background-swatch',
      },
      protectForeground: {
        enabled: true,
        color: '#ff0000',
        semantics: 'heuristic-rgb-distance',
      },
      output: {
        target: 'active-pixel-layer-alpha',
        alpha: 0,
        undoable: true,
      },
    });
    expect(descriptor.warnings.map((warning) => warning.code)).toEqual([
      'background-eraser-heuristic-limits',
    ]);
    expect(descriptor.signature).toContain('"backgroundEraser":"partial"');
  });

  it('marks QuickMask as the active route when enabled while preserving channel route metadata', () => {
    const descriptor = describeBrushAndEraserToolWorkflow(DEFAULT_BRUSH_SETTINGS, {
      activeRoute: 'pixel-layer',
      channel: 'blue',
      quickMaskEnabled: true,
    });

    expect(descriptor.activeRoute).toBe('quick-mask');
    expect(descriptor.tools.brush.routes.quickMask.active).toBe(true);
    expect(descriptor.tools.eraser.routes.quickMask.active).toBe(true);
    expect(descriptor.tools.brush.routes.rgbChannel.channel).toBe('blue');
    expect(descriptor.signature).toContain('"route":"quick-mask"');
  });

  it('describes Magic Eraser tolerance and contiguous/global matching without claiming mask routes', () => {
    const contiguous = describeBrushAndEraserToolWorkflow(DEFAULT_BRUSH_SETTINGS, {
      activeRoute: 'pixel-layer',
      magicEraserTolerance: 18,
      magicEraserContiguous: true,
    });
    expect(contiguous.tools.magicEraser).toMatchObject({
      status: 'supported',
      operation: 'remove-contiguous-color-by-tolerance',
      routes: {
        pixelLayer: {
          supported: true,
          active: true,
          channel: 'rgb',
          compositing: 'alpha-clear',
        },
        rgbChannel: { supported: false },
        layerMask: { supported: false },
        quickMask: { supported: false },
      },
      tolerance: {
        value: 18,
        metric: 'rgb-euclidean-distance',
      },
      matching: {
        scope: 'contiguous',
        connectivity: 4,
      },
      output: {
        target: 'active-pixel-layer-alpha',
        alpha: 0,
        undoable: true,
      },
    });
    expect(contiguous.warnings.map((warning) => warning.code)).toEqual(['background-eraser-heuristic-limits']);
    expect(contiguous.signature).toContain('"magicEraser":"supported"');

    const global = describeBrushAndEraserToolWorkflow(DEFAULT_BRUSH_SETTINGS, {
      magicEraserTolerance: 6,
      magicEraserContiguous: false,
    });
    expect(global.tools.magicEraser.matching).toMatchObject({
      scope: 'global',
      connectivity: 'layer-wide',
    });
    expect(global.signature).toContain('"warnings":["background-eraser-heuristic-limits"]');
  });
});
