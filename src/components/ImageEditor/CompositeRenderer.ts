import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { maskToCanvas, type SelectionMask } from './SelectionMask';
import { createQuickMaskOverlayMask } from './ImageQuickMask';
import { buildSelectAndMaskPreviewMask, createSelectAndMaskMatteMask } from './ImageSelectAndMask';
import { drawCropPreviewOverlay } from './ImageCropOverlay';
import { getCropPreview } from './tools/cropTool';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { createBitmap } from './LayerBitmap';
import { generateGridLines, type ImageViewSettings } from './ImageRulersGuides';
import { createLayerMaskOverlayMask } from './ImageLayerMask';
import {
  applyPerspectiveToPoint,
  applyWarpToPoint,
  buildTransformedCornersFromMetrics,
  DEFAULT_TRANSFORM_ORIGIN,
  clampImageLayerTransformOrigin,
  drawLayerBitmapTransformed,
  getImageLayerBitmapDrawMetrics,
  hasImageLayerWarp,
  interpolateCornerOffset,
  roundImageLayerTransformNumber,
  resolveImageLayerTransformOrigin,
  transformSourcePoint,
} from './ImageLayerTransform';
import { renderLayerWithEffects } from './ImageLayerEffects';
import { isWarpMeshDeformed, sampleWarpMeshDisplacement } from './ImageWarpMesh';
import { isImageLayerEffectivelyVisible } from './ImageLayerGroups';
import type { ImageLayerWithVectorMask } from './ImageVectorMasks';

import {
  renderImageDocumentLayersToBitmap,
  composeLayerBitmapWithLiveMasks,
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

type ImageBlendMode = ImageLayer['blendMode'];

export interface ImageBlendModeRenderCapability {
  supported: true;
  compositeOperation: GlobalCompositeOperation;
}

export interface ImageBlendModeCapabilityDescriptor {
  mode: ImageBlendMode;
  label: string;
  canvasCompositeOperation: GlobalCompositeOperation;
  preview: ImageBlendModeRenderCapability;
  export: ImageBlendModeRenderCapability;
  warnings: readonly string[];
}

export interface ImageBlendModeWarningOptions {
  blendIf?: boolean;
  advancedBlending?: boolean;
}

export type ImageBlendModeSupportGroupId = 'basic' | 'contrast' | 'component';

export interface ImageBlendModeSupportGroup {
  id: ImageBlendModeSupportGroupId;
  label: string;
  modes: ImageBlendMode[];
  supported: boolean;
  caveats: string[];
}

export interface ImageBlendModeCanvasCompositeMapping {
  mode: ImageBlendMode;
  compositeOperation: GlobalCompositeOperation;
}

export type ImageBlendModeAdvancedStateId =
  | 'blend-if'
  | 'fill-opacity'
  | 'knockout'
  | 'channel-targeting';

export type ImageBlendModeChannelTarget = 'red' | 'green' | 'blue';
export type ImageBlendModeKnockoutMode = 'none' | 'shallow' | 'deep';
export type ImageBlendModeExportTarget = 'editable' | 'flattened' | 'source-bin';

export interface UnsupportedPhotoshopBlendFeature {
  id: 'blend-if' | 'advanced-blending';
  label: string;
  supported: false;
  caveat: string;
}

export interface ImageBlendModeAlphaOpacityCaveat {
  id: 'layer-opacity' | 'flattened-alpha';
  label: string;
  value: number;
  caveat: string;
}

export interface ImageBlendModeParityOptions extends ImageBlendModeWarningOptions {
  activeModes?: readonly ImageBlendMode[];
  opacity?: number;
  exportTarget?: 'editable' | 'flattened';
}

export interface ImageBlendModeParityDescriptor {
  previewId: 'image-blend-mode-parity:v1';
  activeModes: ImageBlendMode[];
  supportGroups: ImageBlendModeSupportGroup[];
  canvasCompositeMappings: ImageBlendModeCanvasCompositeMapping[];
  unsupportedPhotoshopFeatures: UnsupportedPhotoshopBlendFeature[];
  alphaOpacityCaveats: ImageBlendModeAlphaOpacityCaveat[];
  knownMathLimitations: string[];
  previewSignature: string;
  exportSignature: string;
  warnings: string[];
}

export interface ImageBlendModePortabilityReadinessOptions {
  activeModes?: readonly ImageBlendMode[];
  blendIf?: boolean;
  fillOpacity?: number;
  knockout?: Exclude<ImageBlendModeKnockoutMode, 'none'>;
  channelTargeting?: readonly ImageBlendModeChannelTarget[];
  exportTarget?: ImageBlendModeExportTarget;
  sourceBinLinked?: boolean;
  batchLayerCount?: number;
}

export interface ImageBlendModeCanvasCompositeSupport {
  supported: true;
  modes: ImageBlendMode[];
  mappings: ImageBlendModeCanvasCompositeMapping[];
}

export interface ImageBlendModeUnsupportedAdvancedState {
  id: ImageBlendModeAdvancedStateId;
  label: string;
  requested: boolean;
  supported: false;
  value?: number;
  mode?: ImageBlendModeKnockoutMode;
  channels?: ImageBlendModeChannelTarget[];
  caveat: string;
  reasonCode: ImageBlendModePortabilityReasonCode;
}

export type ImageBlendModeSourceBinParityCaveatCode =
  | 'source-bin-visible-export-flattens-blend-stack'
  | 'source-bin-overwrite-requires-linked-source';

export interface ImageBlendModeSourceBinParityCaveat {
  code: ImageBlendModeSourceBinParityCaveatCode;
  target: ImageBlendModeExportTarget;
  warning: string;
}

export type ImageBlendModePortabilityReasonCode =
  | 'advanced-blending-unsupported'
  | 'blend-if-unsupported'
  | 'fill-opacity-unsupported'
  | 'knockout-unsupported'
  | 'channel-targeting-unsupported'
  | 'source-bin-linked-visible-export'
  | 'source-bin-unlinked-visible-export';

export interface ImageBlendModeActionSuitability {
  recordable: boolean;
  replayable: boolean;
  reasonCodes: ImageBlendModePortabilityReasonCode[];
}

export interface ImageBlendModeBatchSuitability {
  status: 'ready' | 'warning' | 'blocked';
  layerCount: number;
  reasonCodes: ImageBlendModePortabilityReasonCode[];
}

export interface ImageBlendModePortabilityReadinessDescriptor {
  id: 'image-blend-mode-portability-readiness:v1';
  canvasCompositeSupport: ImageBlendModeCanvasCompositeSupport;
  unsupportedPhotoshopAdvancedStates: ImageBlendModeUnsupportedAdvancedState[];
  exportSourceBinParityCaveats: ImageBlendModeSourceBinParityCaveat[];
  actionSuitability: ImageBlendModeActionSuitability;
  batchSuitability: ImageBlendModeBatchSuitability;
  signature: string;
  warnings: string[];
}

export const SUPPORTED_IMAGE_BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const satisfies readonly ImageBlendMode[];

const IMAGE_BLEND_MODE_LABELS = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'Color Dodge',
  'color-burn': 'Color Burn',
  'hard-light': 'Hard Light',
  'soft-light': 'Soft Light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
} satisfies Record<ImageBlendMode, string>;

const BLEND_IF_UNSUPPORTED_WARNING =
  'Blend If source/underlying tonal range splitting is not supported yet; flatten or rasterize those advanced blending settings before relying on Image preview/export parity.';
const ADVANCED_BLENDING_UNSUPPORTED_WARNING =
  'Advanced blending options such as channel targeting, knockout, and fill opacity are not supported yet; only layer opacity and canvas-native blend modes are previewed and exported.';
const FILL_OPACITY_UNSUPPORTED_WARNING =
  'Photoshop Fill Opacity is not supported yet; Signal Loom uses layer opacity for canvas preview/export and treats fill opacity as metadata-only.';
const KNOCKOUT_UNSUPPORTED_WARNING =
  'Photoshop shallow/deep knockout is not supported yet; group and layer stacks render without knockout isolation.';
const CHANNEL_TARGETING_UNSUPPORTED_WARNING =
  'Photoshop advanced blending channel targeting is not supported yet; canvas blend modes apply to the full composited RGB result.';
const CANVAS_BLEND_MATH_LIMITATION =
  'Canvas blend math is browser-managed and may not exactly match Photoshop in non-sRGB, high-bit-depth, or color-managed documents.';
const COMPONENT_BLEND_MATH_LIMITATION =
  'Hue, Saturation, Color, and Luminosity rely on Canvas 2D component blending and are treated as flattened sRGB preview/export approximations.';
const SOFT_LIGHT_DODGE_BURN_LIMITATION =
  'Soft Light and Color Dodge/Burn formulas are delegated to the browser Canvas implementation; parity should be validated visually for critical PSD roundtrips.';
const LAYER_OPACITY_CAVEAT =
  'Layer opacity is applied through CanvasRenderingContext2D.globalAlpha before blend compositing; Photoshop fill opacity and per-channel opacity are not modeled.';
const FLATTENED_ALPHA_CAVEAT =
  'Flattened blend exports preserve canvas alpha compositing but do not retain editable Photoshop blend-mode stacks.';
const SOURCE_BIN_FLATTENED_BLEND_STACK_CAVEAT =
  'Source Bin visible exports flatten the canvas blend result and do not preserve editable blend-mode stacks for suite handoff.';
const SOURCE_BIN_LINK_REQUIRED_CAVEAT =
  'Source Bin overwrite parity requires a linked source item; unlinked layers can export a new flattened asset but cannot safely overwrite source content.';

const IMAGE_BLEND_MODE_SUPPORT_GROUPS: readonly ImageBlendModeSupportGroup[] = [
  {
    id: 'basic',
    label: 'Basic canvas blend modes',
    modes: ['normal', 'multiply', 'screen', 'overlay'],
    supported: true,
    caveats: [],
  },
  {
    id: 'contrast',
    label: 'Contrast and comparison blend modes',
    modes: ['darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'],
    supported: true,
    caveats: [CANVAS_BLEND_MATH_LIMITATION],
  },
  {
    id: 'component',
    label: 'Component blend modes',
    modes: ['hue', 'saturation', 'color', 'luminosity'],
    supported: true,
    caveats: [COMPONENT_BLEND_MATH_LIMITATION],
  },
];

export const IMAGE_BLEND_MODE_CAPABILITIES: readonly ImageBlendModeCapabilityDescriptor[] =
  SUPPORTED_IMAGE_BLEND_MODES.map((mode) => {
    const compositeOperation = imageBlendModeToCanvasCompositeOperation(mode);
    return {
      mode,
      label: IMAGE_BLEND_MODE_LABELS[mode],
      canvasCompositeOperation: compositeOperation,
      preview: {
        supported: true,
        compositeOperation,
      },
      export: {
        supported: true,
        compositeOperation,
      },
      warnings: [],
    };
  });

const IMAGE_BLEND_MODE_CAPABILITY_BY_MODE = new Map(
  IMAGE_BLEND_MODE_CAPABILITIES.map((descriptor) => [descriptor.mode, descriptor]),
);

export function imageBlendModeToCanvasCompositeOperation(blendMode: ImageBlendMode): GlobalCompositeOperation {
  return blendMode === 'normal' ? 'source-over' : blendMode;
}

export function getImageBlendModeCapability(mode: ImageBlendMode): ImageBlendModeCapabilityDescriptor {
  return IMAGE_BLEND_MODE_CAPABILITY_BY_MODE.get(mode) ?? IMAGE_BLEND_MODE_CAPABILITIES[0];
}

export function getUnsupportedImageBlendModeWarnings(
  options: ImageBlendModeWarningOptions = {},
): string[] {
  const warnings: string[] = [];
  if (options.blendIf) {
    warnings.push(BLEND_IF_UNSUPPORTED_WARNING);
  }
  if (options.advancedBlending) {
    warnings.push(ADVANCED_BLENDING_UNSUPPORTED_WARNING);
  }
  return warnings;
}

export function getImageBlendModeCapabilityGroups(): ImageBlendModeSupportGroup[] {
  return IMAGE_BLEND_MODE_SUPPORT_GROUPS.map((group) => ({
    ...group,
    modes: [...group.modes],
    caveats: [...group.caveats],
  }));
}

export function describeImageBlendModeParity(
  options: ImageBlendModeParityOptions = {},
): ImageBlendModeParityDescriptor {
  const supportGroups = getImageBlendModeCapabilityGroups();
  const canvasCompositeMappings = IMAGE_BLEND_MODE_CAPABILITIES.map((descriptor) => ({
    mode: descriptor.mode,
    compositeOperation: descriptor.canvasCompositeOperation,
  }));
  const activeModes = uniqueBlendModes(options.activeModes ?? SUPPORTED_IMAGE_BLEND_MODES);
  const unsupportedPhotoshopFeatures = describeUnsupportedPhotoshopBlendFeatures(options);
  const alphaOpacityCaveats = describeBlendModeAlphaOpacityCaveats(options);
  const knownMathLimitations = [
    CANVAS_BLEND_MATH_LIMITATION,
    COMPONENT_BLEND_MATH_LIMITATION,
    SOFT_LIGHT_DODGE_BURN_LIMITATION,
  ];
  const warnings = [
    ...getUnsupportedImageBlendModeWarnings(options),
    ...alphaOpacityCaveats.map((caveat) => caveat.caveat),
    ...knownMathLimitations,
  ];

  return {
    previewId: 'image-blend-mode-parity:v1',
    activeModes,
    supportGroups,
    canvasCompositeMappings,
    unsupportedPhotoshopFeatures,
    alphaOpacityCaveats,
    knownMathLimitations,
    previewSignature: `image-blend-preview:v1:${JSON.stringify({
      previewId: 'image-blend-mode-parity:v1',
      activeModes,
      mappings: canvasCompositeMappings.filter((mapping) => activeModes.includes(mapping.mode)),
      supportGroups: supportGroups.map((group) => group.id),
      unsupported: unsupportedPhotoshopFeatures.map((feature) => feature.id),
      alphaOpacityCaveats: alphaOpacityCaveats.map((caveat) => caveat.id),
      knownMathLimitations,
    })}`,
    exportSignature: `image-blend-export:v1:${JSON.stringify({
      previewId: 'image-blend-mode-parity:v1',
      target: options.exportTarget ?? 'editable',
      activeModes,
      mappings: canvasCompositeMappings,
      unsupported: unsupportedPhotoshopFeatures,
      alphaOpacityCaveats,
      knownMathLimitations,
    })}`,
    warnings,
  };
}

export function describeImageBlendModePortabilityReadiness(
  options: ImageBlendModePortabilityReadinessOptions = {},
): ImageBlendModePortabilityReadinessDescriptor {
  const activeModes = uniqueBlendModes(options.activeModes ?? SUPPORTED_IMAGE_BLEND_MODES);
  const mappings = IMAGE_BLEND_MODE_CAPABILITIES
    .filter((descriptor) => activeModes.includes(descriptor.mode))
    .map((descriptor) => ({
      mode: descriptor.mode,
      compositeOperation: descriptor.canvasCompositeOperation,
    }));
  const unsupportedPhotoshopAdvancedStates = describeUnsupportedBlendAdvancedStates(options);
  const activeUnsupportedStates = unsupportedPhotoshopAdvancedStates.filter((state) => state.requested);
  const exportSourceBinParityCaveats = describeBlendSourceBinParityCaveats(options);
  const hasAdvancedUnsupported = activeUnsupportedStates.length > 0;
  const actionReasonCodes: ImageBlendModePortabilityReasonCode[] = hasAdvancedUnsupported
    ? ['advanced-blending-unsupported']
    : [];
  const batchReasonCodes: ImageBlendModePortabilityReasonCode[] = [...actionReasonCodes];
  if (options.exportTarget === 'source-bin') {
    batchReasonCodes.push(options.sourceBinLinked ? 'source-bin-linked-visible-export' : 'source-bin-unlinked-visible-export');
  }
  const batchLayerCount = Math.max(1, Math.trunc(options.batchLayerCount ?? 1));
  const batchStatus: ImageBlendModeBatchSuitability['status'] = hasAdvancedUnsupported
    ? 'blocked'
    : batchReasonCodes.length > 0
      ? 'warning'
      : 'ready';
  const warnings = [
    ...activeUnsupportedStates.map((state) => state.caveat),
    ...exportSourceBinParityCaveats.map((caveat) => caveat.warning),
  ];

  return {
    id: 'image-blend-mode-portability-readiness:v1',
    canvasCompositeSupport: {
      supported: true,
      modes: activeModes,
      mappings,
    },
    unsupportedPhotoshopAdvancedStates,
    exportSourceBinParityCaveats,
    actionSuitability: {
      recordable: !hasAdvancedUnsupported,
      replayable: !hasAdvancedUnsupported,
      reasonCodes: actionReasonCodes,
    },
    batchSuitability: {
      status: batchStatus,
      layerCount: batchLayerCount,
      reasonCodes: batchReasonCodes,
    },
    signature: `image-blend-mode-portability-readiness:v1:${JSON.stringify({
      activeModes,
      unsupported: activeUnsupportedStates.map((state) => state.id),
      exportTarget: options.exportTarget ?? 'editable',
      sourceBinLinked: options.sourceBinLinked ?? false,
      batchLayerCount,
    })}`,
    warnings,
  };
}

function describeUnsupportedPhotoshopBlendFeatures(
  options: ImageBlendModeWarningOptions,
): UnsupportedPhotoshopBlendFeature[] {
  const features: UnsupportedPhotoshopBlendFeature[] = [];
  if (options.blendIf) {
    features.push({
      id: 'blend-if',
      label: 'Blend If',
      supported: false,
      caveat: BLEND_IF_UNSUPPORTED_WARNING,
    });
  }
  if (options.advancedBlending) {
    features.push({
      id: 'advanced-blending',
      label: 'Advanced Blending',
      supported: false,
      caveat: ADVANCED_BLENDING_UNSUPPORTED_WARNING,
    });
  }
  return features;
}

function describeBlendModeAlphaOpacityCaveats(
  options: ImageBlendModeParityOptions,
): ImageBlendModeAlphaOpacityCaveat[] {
  const opacity = typeof options.opacity === 'number' && Number.isFinite(options.opacity)
    ? clamp01(options.opacity)
    : 1;
  const caveats: ImageBlendModeAlphaOpacityCaveat[] = [{
    id: 'layer-opacity',
    label: 'Layer opacity',
    value: opacity,
    caveat: LAYER_OPACITY_CAVEAT,
  }];
  if (options.exportTarget === 'flattened') {
    caveats.push({
      id: 'flattened-alpha',
      label: 'Flattened export alpha',
      value: 1,
      caveat: FLATTENED_ALPHA_CAVEAT,
    });
  }
  return caveats;
}

function describeUnsupportedBlendAdvancedStates(
  options: ImageBlendModePortabilityReadinessOptions,
): ImageBlendModeUnsupportedAdvancedState[] {
  const fillOpacity = typeof options.fillOpacity === 'number' && Number.isFinite(options.fillOpacity)
    ? clamp01(options.fillOpacity)
    : 1;
  const channels = uniqueChannels(options.channelTargeting ?? []);
  return [
    {
      id: 'blend-if',
      label: 'Blend If',
      requested: options.blendIf === true,
      supported: false,
      caveat: BLEND_IF_UNSUPPORTED_WARNING,
      reasonCode: 'blend-if-unsupported',
    },
    {
      id: 'fill-opacity',
      label: 'Fill Opacity',
      requested: options.fillOpacity !== undefined && fillOpacity < 1,
      supported: false,
      value: fillOpacity,
      caveat: FILL_OPACITY_UNSUPPORTED_WARNING,
      reasonCode: 'fill-opacity-unsupported',
    },
    {
      id: 'knockout',
      label: 'Knockout',
      requested: options.knockout !== undefined,
      supported: false,
      mode: options.knockout ?? 'none',
      caveat: KNOCKOUT_UNSUPPORTED_WARNING,
      reasonCode: 'knockout-unsupported',
    },
    {
      id: 'channel-targeting',
      label: 'Channel Targeting',
      requested: channels.length > 0,
      supported: false,
      channels,
      caveat: CHANNEL_TARGETING_UNSUPPORTED_WARNING,
      reasonCode: 'channel-targeting-unsupported',
    },
  ];
}

function describeBlendSourceBinParityCaveats(
  options: ImageBlendModePortabilityReadinessOptions,
): ImageBlendModeSourceBinParityCaveat[] {
  if (options.exportTarget !== 'source-bin') return [];
  const caveats: ImageBlendModeSourceBinParityCaveat[] = [{
    code: 'source-bin-visible-export-flattens-blend-stack',
    target: 'source-bin',
    warning: SOURCE_BIN_FLATTENED_BLEND_STACK_CAVEAT,
  }];
  caveats.push({
    code: 'source-bin-overwrite-requires-linked-source',
    target: 'source-bin',
    warning: SOURCE_BIN_LINK_REQUIRED_CAVEAT,
  });
  return caveats;
}

function uniqueChannels(channels: readonly ImageBlendModeChannelTarget[]): ImageBlendModeChannelTarget[] {
  const seen = new Set<ImageBlendModeChannelTarget>();
  const unique: ImageBlendModeChannelTarget[] = [];
  for (const channel of channels) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    unique.push(channel);
  }
  return unique;
}

function uniqueBlendModes(modes: readonly ImageBlendMode[]): ImageBlendMode[] {
  const seen = new Set<ImageBlendMode>();
  const unique: ImageBlendMode[] = [];
  for (const mode of modes) {
    if (seen.has(mode)) continue;
    seen.add(mode);
    unique.push(mode);
  }
  return unique;
}

function getHighResWorkerBlobUrl(): string {
  const code = `
    const DEFAULT_TRANSFORM_ORIGIN = ${DEFAULT_TRANSFORM_ORIGIN};
    ${imageBlendModeToCanvasCompositeOperation.toString()}
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
    ${clampImageLayerTransformOrigin.toString()}
    ${resolveImageLayerTransformOrigin.toString()}
    ${roundImageLayerTransformNumber.toString()}
    ${applyWarpToPoint.toString()}
    ${applyPerspectiveToPoint.toString()}
    ${interpolateCornerOffset.toString()}
    ${hasImageLayerWarp.toString()}
    ${isWarpMeshDeformed.toString()}
    ${sampleWarpMeshDisplacement.toString()}
    ${transformSourcePoint.toString()}
    ${buildTransformedCornersFromMetrics.toString()}
    ${getImageLayerBitmapDrawMetrics.toString()}
    ${drawLayerBitmapTransformed.toString()}

    self.onmessage = async function(e) {
      const { docWidth, docHeight, layers } = e.data;
      const canvas = new OffscreenCanvas(docWidth, docHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      for (const layer of layers) {
        if (!layer.visible) continue;
        if (layer.type === 'group') continue;

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
          ctx.globalCompositeOperation = imageBlendModeToCanvasCompositeOperation(layer.blendMode);
          drawLayerBitmapTransformed(ctx, layer.bitmap, layer, layer.offsetX || 0, layer.offsetY || 0);
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

  requestRender(options: { invalidateBitmapCache?: boolean } = {}): void {
    if (options.invalidateBitmapCache) {
      this.workerDocSignature = null;
      this.closeWorkerResultBitmap();
      this.lowResDoc = null;
    }
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
        skewXDeg: l.skewXDeg,
        skewYDeg: l.skewYDeg,
        perspectiveX: l.perspectiveX,
        perspectiveY: l.perspectiveY,
        warp: l.warp,
        warpMesh: l.warpMesh,
        cornerOffsets: l.cornerOffsets,
        transformOriginX: l.transformOriginX,
        transformOriginY: l.transformOriginY,
        adjustment: l.adjustment,
        bitmapVersion: l.bitmapVersion,
        hasMask: Boolean(l.mask),
        maskDensity: l.maskDensity,
        maskFeather: l.maskFeather,
        effects: l.effects,
        filters: l.filters,
        groupId: l.groupId,
        groupExpanded: l.groupExpanded,
        vectorMask: getLayerVectorMaskMetadata(l),
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

      const vectorMask = getLayerVectorMaskMetadata(layer);
      const scaledMetadata = vectorMask
        ? {
            ...layer.metadata,
            vectorMask: {
              ...vectorMask,
              path: {
                ...vectorMask.path,
                bounds: vectorMask.path.bounds
                  ? {
                      x: vectorMask.path.bounds.x * this.lowResScale,
                      y: vectorMask.path.bounds.y * this.lowResScale,
                      width: vectorMask.path.bounds.width * this.lowResScale,
                      height: vectorMask.path.bounds.height * this.lowResScale,
                    }
                  : null,
                points: vectorMask.path.points.map((point) => ({
                  x: point.x * this.lowResScale,
                  y: point.y * this.lowResScale,
                })),
              },
            },
          }
        : layer.metadata;

      return {
        ...layer,
        metadata: scaledMetadata,
        x: layer.x * this.lowResScale,
        y: layer.y * this.lowResScale,
        ...(layer.cornerOffsets ? {
          cornerOffsets: {
            nw: {
              x: layer.cornerOffsets.nw.x * this.lowResScale,
              y: layer.cornerOffsets.nw.y * this.lowResScale,
            },
            ne: {
              x: layer.cornerOffsets.ne.x * this.lowResScale,
              y: layer.cornerOffsets.ne.y * this.lowResScale,
            },
            se: {
              x: layer.cornerOffsets.se.x * this.lowResScale,
              y: layer.cornerOffsets.se.y * this.lowResScale,
            },
            sw: {
              x: layer.cornerOffsets.sw.x * this.lowResScale,
              y: layer.cornerOffsets.sw.y * this.lowResScale,
            },
          },
        } : {}),
        ...(layer.maskFeather !== undefined ? { maskFeather: layer.maskFeather * this.lowResScale } : {}),
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
      if (!isImageLayerEffectivelyVisible(layer, doc.layers) || layer.type === 'group') return { visible: false };

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
        : composeLayerBitmapWithLiveMasks(layer);

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
          skewXDeg: layer.skewXDeg,
          skewYDeg: layer.skewYDeg,
          perspectiveX: layer.perspectiveX,
          perspectiveY: layer.perspectiveY,
          warp: layer.warp,
          warpMesh: layer.warpMesh,
          cornerOffsets: layer.cornerOffsets,
          transformOriginX: layer.transformOriginX,
          transformOriginY: layer.transformOriginY,
          offsetX: styled?.offsetX || 0,
          offsetY: styled?.offsetY || 0,
          baseWidth: layer.bitmap?.width || imageBitmap?.width || 0,
          baseHeight: layer.bitmap?.height || imageBitmap?.height || 0,
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

    // Snap the document to a whole-device-pixel rect before drawing the
    // checkerboard + composited pixels. At fractional zoom / DPR an unsnapped
    // document antialiases its top and bottom edges against the dark checker
    // backdrop, which reads as a thin transparency strip — the canvas looking
    // larger than the image. Drawing into an integer device rect keeps all four
    // edges crisp. Selection/mask overlays are drawn afterwards in document
    // space anchored to the same snapped origin.
    const dpr = this.dpr;
    const zoom = doc.viewport.zoom;
    const x0 = Math.round(doc.viewport.panX * dpr);
    const y0 = Math.round(doc.viewport.panY * dpr);
    const x1 = Math.round((doc.viewport.panX + doc.width * zoom) * dpr);
    const y1 = Math.round((doc.viewport.panY + doc.height * zoom) * dpr);
    const dw = Math.max(1, x1 - x0);
    const dh = Math.max(1, y1 - y0);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawTransparencyCheckerboard(ctx, x0, y0, dw, dh, 16 * zoom * dpr);

    const store = useImageEditorStore.getState();
    let composite: ImageBitmap | HTMLCanvasElement | LayerBitmap | null = null;
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
      composite = this.lowResDoc ? renderImageDocumentLayersToBitmap(this.lowResDoc) : null;
    } else {
      this.lowResDoc = null;
      const signature = this.buildDocSignature(doc);
      if (this.workerDocSignature === signature && this.workerResultBitmap) {
        composite = this.workerResultBitmap;
      } else {
        // Fallback to sync render while worker processes, or start worker
        composite = renderImageDocumentLayersToBitmap(doc);
        this.runHighResWorker(doc).catch(console.error);
      }
    }
    if (composite) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(composite, 0, 0, composite.width, composite.height, x0, y0, dw, dh);
    }
    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(x0 / dpr, y0 / dpr);
    ctx.scale(zoom, zoom);

    const { quickMaskSettings, selectAndMaskSettings, imageViewSettings } = useImageEditorStore.getState();
    this.drawDocumentGridAndGuides(doc, imageViewSettings, zoom);
    const activeLayer = doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? null;
    if (selectAndMaskSettings.enabled && this.currentSelection) {
      this.drawSelectAndMaskPreview(
        buildSelectAndMaskPreviewMask(this.currentSelection, selectAndMaskSettings),
        doc.width,
        doc.height,
        selectAndMaskSettings.previewMode,
      );
    } else if (!quickMaskSettings.enabled && doc.activeLayerEditTarget === 'mask' && activeLayer?.mask) {
      this.drawActiveLayerMaskOverlay(activeLayer, doc.width, doc.height);
    } else if (quickMaskSettings.enabled && doc) {
      this.drawQuickMaskOverlay(
        this.currentSelection,
        doc.width,
        doc.height,
        quickMaskSettings.viewMode,
        quickMaskSettings.overlayOpacity,
      );
    } else if (this.currentSelection) {
      this.drawSelectionAnts(this.currentSelection);
    }

    ctx.restore();

    const cropPreview = getCropPreview(doc);
    if (cropPreview) {
      const guideMode = useImageEditorStore.getState().cropToolSettings.guideMode;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      drawCropPreviewOverlay(ctx, {
        canvasSize: {
          width: this.canvas.width / this.dpr,
          height: this.canvas.height / this.dpr,
        },
        guideMode,
        preview: cropPreview,
        viewport: doc.viewport,
      });
      ctx.restore();
    }
  }

  private drawDocumentGridAndGuides(doc: ImageDocument, settings: ImageViewSettings, zoom: number): void {
    const ctx = this.ctx;
    const lineWidth = 1 / Math.max(zoom, 0.0001);
    if (settings.grid) {
      const { xs, ys } = generateGridLines(doc.width, doc.height, settings.gridSpacing);
      ctx.save();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = 'rgba(120,165,230,0.45)';
      ctx.beginPath();
      for (const x of xs) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, doc.height);
      }
      for (const y of ys) {
        ctx.moveTo(0, y);
        ctx.lineTo(doc.width, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (settings.guides && doc.guides && doc.guides.length > 0) {
      ctx.save();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = 'rgba(0,200,255,0.9)';
      ctx.beginPath();
      for (const guide of doc.guides) {
        if (guide.axis === 'x') {
          ctx.moveTo(guide.position, 0);
          ctx.lineTo(guide.position, doc.height);
        } else {
          ctx.moveTo(0, guide.position);
          ctx.lineTo(doc.width, guide.position);
        }
      }
      ctx.stroke();
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

  private drawQuickMaskOverlay(
    selection: SelectionMask | null,
    width: number,
    height: number,
    viewMode: 'maskedAreas' | 'selectedAreas',
    overlayOpacity: number,
  ): void {
    const ctx = this.ctx;
    const overlay = createQuickMaskOverlayMask(selection, width, height, viewMode);
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(0.9, overlayOpacity));
    ctx.drawImage(maskToCanvas(overlay, 255, 0, 0), 0, 0);
    ctx.restore();
  }

  private drawSelectAndMaskPreview(
    selection: SelectionMask,
    width: number,
    height: number,
    previewMode: 'maskedAreas' | 'selectedAreas' | 'onBlack' | 'onWhite' | 'blackWhite',
  ): void {
    const ctx = this.ctx;

    if (previewMode === 'blackWhite') {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(maskToCanvas(selection, 255, 255, 255), 0, 0);
      ctx.restore();
      return;
    }

    const matte = createSelectAndMaskMatteMask(selection, width, height, previewMode);
    ctx.save();
    if (previewMode === 'onBlack') {
      ctx.globalAlpha = 0.88;
      ctx.drawImage(maskToCanvas(matte, 0, 0, 0), 0, 0);
    } else if (previewMode === 'onWhite') {
      ctx.globalAlpha = 0.88;
      ctx.drawImage(maskToCanvas(matte, 255, 255, 255), 0, 0);
    } else {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(maskToCanvas(matte, 255, 0, 0), 0, 0);
    }
    ctx.restore();
  }

  private drawActiveLayerMaskOverlay(
    layer: Pick<ImageLayer, 'x' | 'y' | 'mask' | 'maskDensity' | 'maskFeather'>,
    width: number,
    height: number,
  ): void {
    const ctx = this.ctx;
    const overlay = createLayerMaskOverlayMask(layer, width, height);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(maskToCanvas(overlay, 255, 0, 0), 0, 0);
    ctx.restore();
  }
}

function getLayerVectorMaskMetadata(layer: ImageLayer) {
  return (layer as ImageLayerWithVectorMask).metadata?.vectorMask ?? null;
}

function drawTransparencyCheckerboard(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  width: number,
  height: number,
  tile: number,
): void {
  // Drawn in device space within the document's snapped integer rect
  // [originX, originY, width, height]. `tile` is the checker square size in
  // device pixels (16 document px scaled by zoom * dpr) so the pattern still
  // tracks the document like before, while the rect's edges stay pixel-crisp.
  ctx.fillStyle = '#1a1b23';
  ctx.fillRect(originX, originY, width, height);
  ctx.fillStyle = '#222637';
  const step = Math.max(1, tile);
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if ((i + j) % 2 !== 0) continue;
      const tx = originX + i * step;
      const ty = originY + j * step;
      // Clamp the final row/column so tiles never overshoot the rect.
      ctx.fillRect(tx, ty, Math.min(step, originX + width - tx), Math.min(step, originY + height - ty));
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
