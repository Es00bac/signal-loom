import { describe, expect, it, vi } from 'vitest';
import type { AndroidAcceleratorUpscaleInput } from '../../lib/androidAccelerator';
import type { AndroidNativeImageUpscaleInput } from '../../lib/androidNativeImageUpscaler';
import type { LocalCpuUpscalerInput } from '../../lib/localCpuUpscaler';
import { createEmptyImageDocument } from '../../store/imageEditorStore';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  describeImageDocumentUniversalUpscaleReadiness,
  describeUniversalImageUpscaleProvider,
  upscaleImageDocumentUniversal,
} from './ImageUniversalUpscale';

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 2,
    y: 3,
    bitmap: null,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

describe('ImageUniversalUpscale', () => {
  it('uses the configured Android accelerator for Image/Photos 2x upscale', async () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-1', title: 'photo.png', width: 200, height: 150 }),
      layers: [makeLayer()],
      activeLayerId: 'layer-1',
    };
    const upscaledBitmap = { width: 400, height: 300 } as LayerBitmap;
    const androidUpscale = vi.fn(async (request: AndroidAcceleratorUpscaleInput) => ({
      dataUrl: 'data:image/png;base64,upscaled',
      mimeType: 'image/png' as const,
      modelUsed: 'upscaler_anime',
      accelerator: 'qnn-htp',
      width: request.targetWidthPx,
      height: request.targetHeightPx,
    }));

    const result = await upscaleImageDocumentUniversal({
      doc,
      scalePercent: 200,
      providerSettings: {
        androidAcceleratorBaseUrl: ' http://192.168.1.42:8788/ ',
        androidAcceleratorAuthToken: 'pair-token',
        androidAcceleratorDefaultUpscaler: 'upscaler_anime',
      },
      androidUpscale,
      documentToDataUrl: async () => 'data:image/png;base64,source',
      dataUrlToBitmap: async (dataUrl) => {
        expect(dataUrl).toBe('data:image/png;base64,upscaled');
        return upscaledBitmap;
      },
    });

    expect(androidUpscale).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://192.168.1.42:8788',
      authToken: 'pair-token',
      sourceDataUrl: 'data:image/png;base64,source',
      targetWidthPx: 400,
      targetHeightPx: 300,
      upscalerId: 'upscaler_anime',
      outputFormat: 'png',
    }));
    expect(result).toMatchObject({
      provider: 'android-accelerator',
      estimatedCostUsd: 0,
      statusMessage: 'Upscaled "photo.png" to 400 x 300px with Android accelerator.',
    });
    expect(result.document).toMatchObject({
      id: 'doc-1',
      width: 400,
      height: 300,
      dirty: true,
      activeLayerId: 'phone-upscale-doc-1',
      hasSelection: false,
    });
    expect(result.document.layers).toHaveLength(1);
    expect(result.document.layers[0]).toMatchObject({
      id: 'phone-upscale-doc-1',
      name: 'Phone AI upscale',
      x: 0,
      y: 0,
      bitmap: upscaledBitmap,
      bitmapVersion: 1,
    });
  });

  it('falls back to the local layer-preserving resize when no Android accelerator is configured', async () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-1', title: 'photo.png', width: 200, height: 150 }),
      layers: [makeLayer()],
      activeLayerId: 'layer-1',
    };
    const androidUpscale = vi.fn();

    const result = await upscaleImageDocumentUniversal({
      doc,
      scalePercent: 200,
      providerSettings: {
        androidAcceleratorBaseUrl: '   ',
        androidAcceleratorAuthToken: '',
        androidAcceleratorDefaultUpscaler: 'upscaler_realistic',
      },
      androidUpscale,
    });

    expect(androidUpscale).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: 'browser',
      statusMessage: 'Resized "photo.png" to 400 x 300px locally.',
    });
    expect(result.document.layers).toHaveLength(1);
    expect(result.document.layers[0]).toMatchObject({
      id: 'layer-1',
      x: 4,
      y: 6,
    });
  });

  it('uses the in-app Android native image upscaler before browser resize when running on Android', async () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-native', title: 'camera.png', width: 300, height: 200 }),
      layers: [makeLayer()],
      activeLayerId: 'layer-1',
    };
    const upscaledBitmap = { width: 600, height: 400 } as LayerBitmap;
    const androidNativeUpscale = vi.fn(async (request: AndroidNativeImageUpscaleInput) => ({
      dataUrl: 'data:image/png;base64,native-upscaled',
      mimeType: 'image/png' as const,
      width: request.targetWidthPx,
      height: request.targetHeightPx,
      accelerator: 'android-native-bitmap',
    }));

    const result = await upscaleImageDocumentUniversal({
      doc,
      scalePercent: 200,
      providerSettings: {
        androidAcceleratorBaseUrl: '',
        androidAcceleratorDefaultUpscaler: 'upscaler_realistic',
      },
      androidNativeUpscale,
      isAndroidNativeUpscalerAvailable: true,
      documentToDataUrl: async () => 'data:image/png;base64,source',
      dataUrlToBitmap: async (dataUrl) => {
        expect(dataUrl).toBe('data:image/png;base64,native-upscaled');
        return upscaledBitmap;
      },
    });

    expect(androidNativeUpscale).toHaveBeenCalledWith(expect.objectContaining({
      sourceDataUrl: 'data:image/png;base64,source',
      targetWidthPx: 600,
      targetHeightPx: 400,
      outputFormat: 'png',
    }));
    expect(result).toMatchObject({
      provider: 'android-native',
      estimatedCostUsd: 0,
      statusMessage: 'Upscaled "camera.png" to 600 x 400px with Android native image upscaler.',
    });
    expect(result.document).toMatchObject({
      width: 600,
      height: 400,
      activeLayerId: 'android-native-upscale-doc-native',
    });
    expect(result.document.layers[0]).toMatchObject({
      id: 'android-native-upscale-doc-native',
      name: 'Android native upscale',
      bitmap: upscaledBitmap,
    });
  });

  it('surfaces the native plugin runtime evidence in status text and result metadata', async () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-native-runtime', title: 'camera.png', width: 300, height: 200 }),
      layers: [makeLayer(), makeLayer({ id: 'layer-2', name: 'Layer 2' })],
      activeLayerId: 'layer-1',
    };
    const upscaledBitmap = { width: 600, height: 400 } as LayerBitmap;
    const androidNativeUpscale = vi.fn(async (request: AndroidNativeImageUpscaleInput) => ({
      dataUrl: 'data:image/png;base64,native-upscaled',
      mimeType: 'image/png' as const,
      width: request.targetWidthPx,
      height: request.targetHeightPx,
      accelerator: 'local-dream-qnn-htp',
      backend: 'signal-loom-bundled-local-dream',
      modelUsed: 'upscaler_realistic',
      warnings: ['Bundled Local Dream QNN upscaler output is 4x internally and was final-fit to the requested dimensions.'],
    }));

    const result = await upscaleImageDocumentUniversal({
      doc,
      scalePercent: 200,
      providerSettings: {
        androidAcceleratorBaseUrl: '',
        androidAcceleratorDefaultUpscaler: 'upscaler_realistic',
      },
      androidNativeUpscale,
      isAndroidNativeUpscalerAvailable: true,
      documentToDataUrl: async () => 'data:image/png;base64,source',
      dataUrlToBitmap: async () => upscaledBitmap,
    });

    expect(result).toMatchObject({
      provider: 'android-native',
      statusMessage: 'Upscaled "camera.png" to 600 x 400px with Android native image upscaler via QNN (signal-loom-bundled-local-dream).',
      runtime: {
        accelerator: 'local-dream-qnn-htp',
        backend: 'signal-loom-bundled-local-dream',
        modelUsed: 'upscaler_realistic',
        kind: 'accelerated',
      },
    });
    expect(result.document.layers[0].metadata).toMatchObject({
      sourceFormat: 'android-native-upscale',
      sourceWarnings: expect.arrayContaining([
        'The AI upscaler operates on the flattened visible image; undo restores the original layers.',
        'Android native runtime: QNN via signal-loom-bundled-local-dream.',
        'Android native model: upscaler_realistic.',
        'Bundled Local Dream QNN upscaler output is 4x internally and was final-fit to the requested dimensions.',
      ]),
    });
  });

  it('uses explicit labels for the visible method/status indicator', () => {
    expect(describeUniversalImageUpscaleProvider('android-accelerator')).toBe('Android accelerator: NPU/GPU upscaler');
    expect(describeUniversalImageUpscaleProvider('android-native')).toBe('Android native image upscaler');
    expect(describeUniversalImageUpscaleProvider('browser')).toBe('Local image resize');
    expect(describeUniversalImageUpscaleProvider('local-ai-cpu')).toBe('Local CPU AI upscaler');
  });

  it('uses local CPU upscaler when configured and callback provided', async () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-2', title: 'poster.png', width: 128, height: 100 }),
      layers: [makeLayer()],
      activeLayerId: 'layer-1',
    };
    const upscaledBitmap = { width: 256, height: 200 } as LayerBitmap;
    const localAiCpuUpscale = vi.fn(async (request: LocalCpuUpscalerInput) => {
      expect(request.targetWidthPx).toBe(256);
      expect(request.targetHeightPx).toBe(200);
      return {
        dataUrl: 'data:image/png;base64,local-upscaled',
        mimeType: 'image/png' as const,
        modelUsed: 'realesrgan-4x',
      };
    });

    const result = await upscaleImageDocumentUniversal({
      doc,
      scalePercent: 200,
      providerSettings: {
        localAiCpuEndpointUrl: 'http://127.0.0.1:8788',
        localAiCpuModel: 'realesrgan-4x',
      },
      localAiCpuUpscale,
      documentToDataUrl: async () => 'data:image/png;base64,source',
      dataUrlToBitmap: async () => upscaledBitmap,
    });

    expect(localAiCpuUpscale).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:8788',
      sourceDataUrl: 'data:image/png;base64,source',
      targetWidthPx: 256,
      targetHeightPx: 200,
      model: 'realesrgan-4x',
    }));
    expect(result.provider).toBe('local-ai-cpu');
    expect(result.document).toMatchObject({
      id: 'doc-2',
      width: 256,
      height: 200,
      activeLayerId: 'cpu-upscale-doc-2',
      hasSelection: false,
    });
    expect(result.document.layers[0]).toMatchObject({
      id: 'cpu-upscale-doc-2',
      name: 'Local CPU AI upscale',
    });
  });

  it('describes document-level universal upscale readiness without executing providers', () => {
    const doc = {
      ...createEmptyImageDocument({ id: 'doc-readiness', title: 'cover.png', width: 320, height: 240 }),
      layers: [makeLayer()],
      activeLayerId: 'layer-1',
    };

    const readiness = describeImageDocumentUniversalUpscaleReadiness({
      doc,
      scalePercent: 150,
      providerSettings: {
        androidAcceleratorBaseUrl: '',
        localAiCpuEndpointUrl: '',
      },
      isAndroidNativeUpscalerAvailable: true,
    });

    expect(readiness).toMatchObject({
      descriptorId: 'image-universal-upscale-readiness:v1',
      readiness: 'ready',
      target: {
        sourceWidthPx: 320,
        sourceHeightPx: 240,
        widthPx: 480,
        heightPx: 360,
        policy: 'scale-percent',
        scalePercent: 150,
      },
      routes: [
        expect.objectContaining({
          id: 'on-device-preferred',
          provider: 'android-native',
          readiness: 'ready',
          selected: true,
        }),
        expect.objectContaining({ id: 'cloud-fallback' }),
        expect.objectContaining({ id: 'bitmap-fallback' }),
      ],
    });
    expect(readiness.stableSignature).toContain('source=image:320x240');
    expect(readiness.stableSignature).toContain('target=scale-percent:480x360:scale=150:action=queue-upscale');
    expect((readiness as typeof readiness & {
      policy?: {
        sourceExclusion: { action: string };
        printResolution: { defaultTargetDpi: number; action: string };
        fallbackOrder: Array<{ rank: number; routeId: string; provider: string }>;
      };
    }).policy).toMatchObject({
      sourceExclusion: {
        action: 'allow-upscale',
      },
      printResolution: {
        defaultTargetDpi: 300,
        action: 'queue-upscale',
      },
      fallbackOrder: [
        { rank: 1, routeId: 'on-device-preferred', provider: 'android-native' },
        { rank: 2, routeId: 'cloud-fallback', provider: 'vertex-imagen' },
        { rank: 3, routeId: 'bitmap-fallback', provider: 'browser' },
      ],
    });
  });
});
