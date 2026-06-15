import type {
  ImageLayer,
  ImageLayerEffect,
  LayerBitmap,
  LayerEffectKind,
} from '../../types/imageEditor';
import { createBitmap, getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import { applyLayerFiltersToImageData } from './ImageLayerFilters';
import { applyLayerMaskToImageData } from './ImageLayerMask';

export interface RenderedLayerWithEffects {
  bitmap: LayerBitmap;
  offsetX: number;
  offsetY: number;
}

export type PhotoshopLayerEffectKind =
  | LayerEffectKind
  | 'bevelEmboss';

export interface LayerEffectCapability {
  kind: PhotoshopLayerEffectKind;
  label: string;
  supported: boolean;
  presetEligible: boolean;
  renderer: 'canvas' | 'content' | 'unsupported';
  warning?: string;
}

export interface LayerEffectCapabilityGroup {
  id: 'canvas-effects' | 'content-effects' | 'unsupported-photoshop-effects';
  label: string;
  effectKinds: PhotoshopLayerEffectKind[];
  supported: boolean;
}

export interface LayerEffectPresetDescription {
  effectKinds: LayerEffectKind[];
  labels: string[];
  usesGlobalLight: boolean;
  expandsBounds: boolean;
  contentEffectKinds: LayerEffectKind[];
  canvasEffectKinds: LayerEffectKind[];
}

export interface LayerEffectStackInteropOptions {
  unsupportedEffectKinds?: readonly PhotoshopLayerEffectKind[];
  blendIf?: 'absent' | 'present';
  globalLightAngle?: number;
  exportTarget?: 'editable' | 'flattened';
}

export interface LayerEffectGlobalLightDescriptor {
  required: boolean;
  angle: number | null;
  dependentEffectIds: string[];
  participants: LayerEffectGlobalLightParticipant[];
}

export interface LayerEffectGlobalLightParticipant {
  effectId: string;
  kind: Extract<LayerEffectKind, 'dropShadow' | 'innerShadow'>;
  participates: true;
}

export interface LayerEffectUnsupportedStatus {
  kind: PhotoshopLayerEffectKind;
  label: string;
  status: 'unsupported';
  preservation: 'metadata-only';
  warning: string;
}

export interface LayerEffectAdvancedBlendingDescriptor {
  blendIf: 'absent' | 'present';
  supported: boolean;
  warning?: string;
}

export interface LayerEffectUnsupportedBlendIfDescriptor {
  id: 'blend-if';
  label: 'Blend If';
  supported: false;
  preservation: 'metadata-only';
  requiresFlatteningForParity: boolean;
  warning: string;
  signature: string;
}

export interface LayerEffectGlobalLightPortabilityDescriptor {
  id: 'layer-effect-global-light-portability:v1';
  portableWithinSignalLoom: boolean;
  portableAcrossDocuments: boolean;
  portableAsEditablePhotoshopLayerStyle: false;
  usesGlobalLight: boolean;
  angle: number | null;
  participantEffectIds: string[];
  warnings: string[];
  signature: string;
}

export interface LayerEffectPresetPortabilityDescriptor {
  id: 'layer-effect-preset-portability:v1';
  portableWithinSignalLoom: boolean;
  portableAcrossDocuments: boolean;
  portableAsEditablePhotoshopLayerStyle: false;
  usesGlobalLight: boolean;
  unsupportedFeatures: Array<'blend-if' | 'bevelEmboss'>;
  warnings: string[];
  signature: string;
}

export interface LayerEffectFlattenedExportDescriptor {
  target: 'editable' | 'flattened';
  rasterizesEffects: boolean;
  preservesEditableLayerStyles: boolean;
  warning?: string;
}

export interface LayerEffectAlphaOpacityCaveat {
  id: 'effect-opacity' | 'flattened-export-alpha';
  label: string;
  affectedEffectIds: string[];
  caveat: string;
}

export type LayerEffectPerEffectExportCaveatCode =
  | 'effect-flattened-for-export'
  | 'canvas-effect-bounds-expansion'
  | 'content-effect-raster-approximation'
  | 'global-light-metadata-only'
  | 'native-photoshop-layer-style-roundtrip-unavailable';

export interface LayerEffectPerEffectExportCaveat {
  effectId: string;
  kind: LayerEffectKind;
  label: string;
  renderer: LayerEffectCapability['renderer'];
  presetEligible: boolean;
  usesGlobalLight: boolean;
  expandsBounds: boolean;
  flattenedForExport: boolean;
  preservesEditableSignalLoomMetadata: true;
  nativePhotoshopLayerStyleRoundtrip: false;
  caveatCodes: LayerEffectPerEffectExportCaveatCode[];
  caveats: string[];
  signature: string;
}

export interface LayerEffectStackInteropDescriptor {
  previewId: 'image-layer-effects-stack:v2';
  effectKinds: LayerEffectKind[];
  labels: string[];
  globalLight: LayerEffectGlobalLightDescriptor;
  globalLightPortability: LayerEffectGlobalLightPortabilityDescriptor;
  capabilityGroups: LayerEffectCapabilityGroup[];
  unsupportedEffects: LayerEffectUnsupportedStatus[];
  advancedBlending: LayerEffectAdvancedBlendingDescriptor;
  unsupportedBlendIf: LayerEffectUnsupportedBlendIfDescriptor;
  flattenedExport: LayerEffectFlattenedExportDescriptor;
  presetPortability: LayerEffectPresetPortabilityDescriptor;
  alphaOpacityCaveats: LayerEffectAlphaOpacityCaveat[];
  perEffectExportCaveats: LayerEffectPerEffectExportCaveat[];
  knownMathLimitations: string[];
  blendOrderSignature: string;
  previewSignature: string;
  exportSignature: string;
  warnings: string[];
  stackPortability: LayerEffectStackPortabilityDescriptor;
}

export interface LayerEffectStackPortabilityDescriptor {
  portableWithinSignalLoom: boolean;
  portableAcrossSignalLoomDocuments: boolean;
  portableAsEditablePhotoshopLayerStyle: false;
  requiresFlattenedPixelsForExport: boolean;
  warnings: string[];
  signature: string;
}

export interface LayerEffectReadinessSupportedEffect {
  kind: LayerEffectKind;
  label: string;
  renderer: Exclude<LayerEffectCapability['renderer'], 'unsupported'>;
  presetEligible: boolean;
}

export interface LayerEffectUnsupportedReadinessItem {
  supported: false;
  preservation: 'metadata-only';
  flatteningRequiredForPixels: boolean;
  warning: string;
}

export interface LayerEffectBlendIfReadinessItem {
  supported: boolean;
  preservation: 'metadata-only' | 'not-needed';
  flatteningRequiredForPixels: boolean;
  warning?: string;
}

export interface LayerEffectReadinessGlobalLight {
  participates: boolean;
  angle: number | null;
  effectIds: string[];
}

export interface LayerEffectReadinessPortability {
  exportTarget: 'editable' | 'flattened';
  portableAsSignalLoomPreset: boolean;
  flattensForPixelExport: boolean;
  preservesEditablePhotoshopLayerStyles: boolean;
  warnings: string[];
}

export type LayerEffectReadinessBlockerCode =
  | 'layer-effect-bevel-emboss-unsupported'
  | 'layer-effect-blend-if-unsupported'
  | 'native-psd-live-effect-fidelity-unsupported'
  | 'smart-object-effect-preservation-unsupported';

export interface LayerEffectReadinessBlocker {
  code: LayerEffectReadinessBlockerCode;
  severity: 'blocker';
  message: string;
}

export type LayerEffectReadinessWarningCode =
  | 'layer-effect-flattened-export-rasterizes-effects'
  | 'layer-effect-opacity-baked-into-render'
  | 'layer-effect-flattened-alpha-controls-not-editable'
  | 'layer-effect-preset-portability-limited';

export interface LayerEffectReadinessWarning {
  code: LayerEffectReadinessWarningCode;
  severity: 'warning';
  message: string;
}

export interface LayerEffectPresetCompatibilityReadiness {
  presetEligibleEffectKinds: LayerEffectKind[];
  unsupportedEffectKinds: PhotoshopLayerEffectKind[];
  compatibleWithSignalLoomPresets: boolean;
  compatibleWithNativePhotoshopLayerStyles: false;
  signature: string;
}

export interface LayerEffectReadinessSignatures {
  stack: string;
  preview: string;
  export: string;
  capabilityCatalog: string;
}

export type LayerEffectUnsupportedStateCapability =
  | 'unsupported-effect'
  | 'blend-if'
  | 'native-psd-live-effect-fidelity'
  | 'smart-object-effect-preservation';

export interface LayerEffectUnsupportedStateDescriptor {
  id: `effect-kind:${PhotoshopLayerEffectKind}` | 'blend-if' | 'native-psd-live-effect-fidelity' | 'smart-object-effect-preservation';
  label: string;
  capability: LayerEffectUnsupportedStateCapability;
  supported: false;
  preservation: 'metadata-only' | 'flattened-pixels-and-signal-loom-metadata';
  requiresFlattenedPixelsForParity: boolean;
  reasonCode: LayerEffectReadinessBlockerCode;
  warning: string;
  signature: string;
}

export interface LayerEffectUnsupportedStateDescriptorOptions {
  unsupportedEffectKinds?: readonly PhotoshopLayerEffectKind[];
  blendIf?: 'absent' | 'present';
  nativePsdLiveEffects?: 'not-required' | 'required';
  smartObjectEffectPreservation?: 'not-required' | 'required';
}

export interface LayerEffectReadinessSummary {
  id: 'image-layer-effects-readiness:v1';
  effectKinds: LayerEffectKind[];
  supportedEffectCatalog: LayerEffectReadinessSupportedEffect[];
  supportedEffects: LayerEffectReadinessSupportedEffect[];
  unsupportedReadiness: {
    bevelEmboss: LayerEffectUnsupportedReadinessItem;
    blendIf: LayerEffectBlendIfReadinessItem;
  };
  globalLight: LayerEffectReadinessGlobalLight;
  globalLightPortability: LayerEffectGlobalLightPortabilityDescriptor;
  blendIfPortability: LayerEffectUnsupportedBlendIfDescriptor;
  portability: LayerEffectReadinessPortability;
  blockers: LayerEffectReadinessBlocker[];
  warnings: LayerEffectReadinessWarning[];
  unsupportedStates: string[];
  unsupportedStateDescriptors: LayerEffectUnsupportedStateDescriptor[];
  mathCaveats: string[];
  perEffectExportCaveats: LayerEffectPerEffectExportCaveat[];
  presetCompatibility: LayerEffectPresetCompatibilityReadiness;
  presetPortability: LayerEffectPresetPortabilityDescriptor;
  signatures: LayerEffectReadinessSignatures;
}

const SUPPORTED_LAYER_EFFECT_CAPABILITIES: readonly LayerEffectCapability[] = [
  { kind: 'stroke', label: 'Stroke', supported: true, presetEligible: true, renderer: 'canvas' },
  { kind: 'dropShadow', label: 'Drop Shadow', supported: true, presetEligible: true, renderer: 'canvas' },
  { kind: 'innerShadow', label: 'Inner Shadow', supported: true, presetEligible: true, renderer: 'content' },
  { kind: 'outerGlow', label: 'Outer Glow', supported: true, presetEligible: true, renderer: 'canvas' },
  { kind: 'innerGlow', label: 'Inner Glow', supported: true, presetEligible: true, renderer: 'content' },
  { kind: 'colorOverlay', label: 'Color Overlay', supported: true, presetEligible: true, renderer: 'content' },
  { kind: 'satin', label: 'Satin', supported: true, presetEligible: true, renderer: 'content' },
  { kind: 'patternOverlay', label: 'Pattern Overlay', supported: true, presetEligible: true, renderer: 'content' },
  { kind: 'gradientOverlay', label: 'Gradient Overlay', supported: true, presetEligible: true, renderer: 'content' },
];

const UNSUPPORTED_LAYER_EFFECT_CAPABILITIES: readonly LayerEffectCapability[] = [
  {
    kind: 'bevelEmboss',
    label: 'Bevel & Emboss',
    supported: false,
    presetEligible: false,
    renderer: 'unsupported',
    warning: 'Bevel & Emboss is not supported yet; preserve it as metadata-only or flatten it before import/export.',
  },
];

const LAYER_EFFECT_CAPABILITY_CATALOG: readonly LayerEffectCapability[] = [
  ...SUPPORTED_LAYER_EFFECT_CAPABILITIES,
  ...UNSUPPORTED_LAYER_EFFECT_CAPABILITIES,
];

const LAYER_EFFECT_STACK_PREVIEW_ID = 'image-layer-effects-stack:v2' as const;
const LAYER_EFFECT_CAPABILITY_GROUPS: readonly LayerEffectCapabilityGroup[] = [
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
];

const GLOBAL_LIGHT_EFFECT_KINDS = new Set<LayerEffectKind>(['dropShadow', 'innerShadow']);
const CONTENT_EFFECT_KINDS = new Set<LayerEffectKind>(['innerShadow', 'innerGlow', 'colorOverlay', 'satin', 'patternOverlay', 'gradientOverlay']);
const CANVAS_EFFECT_KINDS = new Set<LayerEffectKind>(['stroke', 'dropShadow', 'outerGlow']);
const LAYER_EFFECT_OPACITY_CAVEAT =
  'Layer effect opacity is baked into rendered pixels before the parent layer blend mode is applied; Photoshop fill opacity and advanced blending masks are not modeled.';
const LAYER_EFFECT_FLATTENED_ALPHA_CAVEAT =
  'Flattened exports preserve rendered alpha but do not preserve editable Photoshop layer-style opacity controls.';
const LAYER_EFFECT_MATH_LIMITATIONS = [
  'Stroke, glow, and shadow spread use deterministic raster expansion instead of Photoshop bevel/contour/noise kernels.',
  'Inner Shadow, Inner Glow, Satin, Pattern Overlay, Gradient Overlay, and Color Overlay are content-rendered approximations that are flattened before blend-mode compositing.',
  'Blend If / advanced blending ranges are metadata caveats only and do not alter preview or export pixels.',
] as const;

export function createDefaultLayerEffect(kind: LayerEffectKind): ImageLayerEffect {
  const id = `effect-${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  switch (kind) {
    case 'stroke':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      };
    case 'dropShadow':
      return {
        id,
        kind,
        enabled: true,
        color: '#000000',
        opacity: 0.65,
        angle: 45,
        distance: 12,
        size: 12,
      };
    case 'innerShadow':
      return {
        id,
        kind,
        enabled: true,
        color: '#000000',
        opacity: 0.55,
        angle: 45,
        distance: 8,
        size: 10,
      };
    case 'outerGlow':
      return {
        id,
        kind,
        enabled: true,
        color: '#60a5fa',
        opacity: 0.7,
        size: 12,
      };
    case 'innerGlow':
      return {
        id,
        kind,
        enabled: true,
        color: '#60a5fa',
        opacity: 0.65,
        size: 10,
      };
    case 'colorOverlay':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        opacity: 1,
      };
    case 'satin':
      return {
        id,
        kind,
        enabled: true,
        color: '#000000',
        opacity: 0.45,
        angle: 19,
        distance: 10,
        size: 12,
        invert: false,
      };
    case 'patternOverlay':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        backgroundColor: '#000000',
        opacity: 0.35,
        pattern: 'checker',
        scale: 8,
      };
    case 'gradientOverlay':
      return {
        id,
        kind,
        enabled: true,
        color: '#ffffff',
        secondaryColor: '#000000',
        opacity: 1,
        angle: 0,
        scale: 1,
        reverse: false,
      };
  }
}

export function getLayerEffectCapabilityCatalog(): LayerEffectCapability[] {
  return LAYER_EFFECT_CAPABILITY_CATALOG.map((entry) => ({ ...entry }));
}

export function getUnsupportedLayerEffectWarnings(
  kinds: readonly PhotoshopLayerEffectKind[],
): string[] {
  const warnings: string[] = [];
  const seen = new Set<PhotoshopLayerEffectKind>();
  for (const kind of kinds) {
    if (seen.has(kind)) continue;
    seen.add(kind);
    const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === kind);
    if (!capability?.warning) continue;
    warnings.push(capability.warning);
  }
  return warnings;
}

export function describeLayerEffectPreset(
  effects: readonly ImageLayerEffect[],
): LayerEffectPresetDescription {
  const enabledEffects = effects.filter((effect) => effect.enabled);
  const effectKinds = enabledEffects.map((effect) => effect.kind);
  return {
    effectKinds,
    labels: effectKinds.map(layerEffectLabel),
    usesGlobalLight: enabledEffects.some((effect) => GLOBAL_LIGHT_EFFECT_KINDS.has(effect.kind)),
    expandsBounds: enabledEffects.some((effect) => isCanvasEffectKind(effect.kind)),
    contentEffectKinds: effectKinds.filter((kind) => CONTENT_EFFECT_KINDS.has(kind)),
    canvasEffectKinds: effectKinds.filter((kind) => CANVAS_EFFECT_KINDS.has(kind)),
  };
}

export function describeLayerEffectStackInterop(
  effects: readonly ImageLayerEffect[],
  options: LayerEffectStackInteropOptions = {},
): LayerEffectStackInteropDescriptor {
  const enabledEffects = effects.filter((effect) => effect.enabled);
  const preset = describeLayerEffectPreset(effects);
  const unsupportedEffectKinds = uniqueEffectKinds(options.unsupportedEffectKinds ?? [])
    .filter(isUnsupportedLayerEffectKind);
  const globalLight = describeLayerEffectGlobalLight(enabledEffects, options.globalLightAngle);
  const blendIf = options.blendIf ?? 'absent';
  const exportTarget = options.exportTarget ?? 'editable';
  const capabilityGroups = getLayerEffectCapabilityGroups();
  const unsupportedEffects = describeUnsupportedLayerEffects(unsupportedEffectKinds);
  const advancedBlending = describeLayerEffectAdvancedBlending(blendIf);
  const unsupportedBlendIf = describeLayerEffectUnsupportedBlendIf(advancedBlending);
  const flattenedExport = describeLayerEffectFlattenedExport(exportTarget);
  const alphaOpacityCaveats = describeLayerEffectAlphaOpacityCaveats(enabledEffects, exportTarget);
  const perEffectExportCaveats = describeLayerEffectPerEffectExportCaveats(enabledEffects, exportTarget, globalLight);
  const knownMathLimitations = [...LAYER_EFFECT_MATH_LIMITATIONS];
  const globalLightPortability = describeLayerEffectGlobalLightPortability(globalLight);
  const presetPortability = describeLayerEffectPresetPortability({
    globalLight,
    unsupportedEffects,
    unsupportedBlendIf,
    flattenedExport,
  });
  const stackPortability = describeLayerEffectStackPortability(flattenedExport, unsupportedEffects, advancedBlending);
  const orderItems = enabledEffects.map((effect, order) => ({
    order,
    kind: effect.kind,
    enabled: effect.enabled,
    renderer: layerEffectRenderer(effect.kind),
  }));
  const previewItems = enabledEffects.map((effect, order) => {
    const item: Record<string, unknown> = {
      order,
      id: effect.id,
      kind: effect.kind,
      enabled: effect.enabled,
      renderer: layerEffectRenderer(effect.kind),
    };
    if (GLOBAL_LIGHT_EFFECT_KINDS.has(effect.kind)) {
      item.globalLight = globalLight.angle;
    }
    return item;
  });
  const exportItems = previewItems.map(({ id: _id, ...item }) => item);

  return {
    previewId: LAYER_EFFECT_STACK_PREVIEW_ID,
    effectKinds: preset.effectKinds,
    labels: preset.labels,
    globalLight,
    globalLightPortability,
    capabilityGroups,
    unsupportedEffects,
    advancedBlending,
    unsupportedBlendIf,
    flattenedExport,
    presetPortability,
    blendOrderSignature: `layer-effect-order:v1:${JSON.stringify(orderItems)}`,
    previewSignature: `layer-effect-preview:v1:${JSON.stringify({
      previewId: LAYER_EFFECT_STACK_PREVIEW_ID,
      effects: previewItems,
      blendIf,
      advancedBlending,
      alphaOpacityCaveats: alphaOpacityCaveats.map((caveat) => caveat.id),
      perEffectExportCaveats: perEffectExportCaveats.map((caveat) => caveat.effectId),
      knownMathLimitations,
    })}`,
    exportSignature: `layer-effect-export:v1:${JSON.stringify({
      previewId: LAYER_EFFECT_STACK_PREVIEW_ID,
      target: exportTarget,
      effects: exportItems,
      unsupported: unsupportedEffectKinds,
      unsupportedEffects,
      blendIf,
      flattenedExport,
      capabilityGroups: capabilityGroups.map((group) => group.id),
      alphaOpacityCaveats,
      perEffectExportCaveats,
      knownMathLimitations,
    })}`,
    alphaOpacityCaveats,
    perEffectExportCaveats,
    knownMathLimitations,
    warnings: [
      ...getLayerEffectRasterizationWarnings(flattenedExport),
      ...unsupportedEffects.map((effect) => effect.warning),
      ...getLayerEffectBlendIfWarnings(advancedBlending),
    ],
    stackPortability,
  };
}

export function buildLayerEffectReadinessSummary(
  effects: readonly ImageLayerEffect[],
  options: LayerEffectStackInteropOptions = {},
): LayerEffectReadinessSummary {
  const enabledEffects = effects.filter((effect) => effect.enabled);
  const interop = describeLayerEffectStackInterop(effects, options);
  const unsupportedEffectKinds = uniqueEffectKinds(options.unsupportedEffectKinds ?? [])
    .filter(isUnsupportedLayerEffectKind);
  const hasBevelEmbossMetadata = unsupportedEffectKinds.includes('bevelEmboss');
  const blendIfPresent = interop.advancedBlending.blendIf === 'present';
  const supportedEffectCatalog = buildLayerEffectSupportedEffectCatalog();
  const supportedEffects = enabledEffects.map((effect) => {
    const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === effect.kind);
    const renderer = layerEffectRenderer(effect.kind);
    return {
      kind: effect.kind,
      label: capability?.label ?? layerEffectLabel(effect.kind),
      renderer: renderer === 'unsupported' ? 'content' : renderer,
      presetEligible: capability?.presetEligible ?? false,
    };
  });
  const portableWarnings = [...interop.warnings];
  const presetEligibleEffectKinds = supportedEffects
    .filter((effect) => effect.presetEligible)
    .map((effect) => effect.kind);
  const blockers = buildLayerEffectReadinessBlockers({
    hasBevelEmbossMetadata,
    blendIfPresent,
  });
  const warnings = buildLayerEffectReadinessWarnings(interop);

  return {
    id: 'image-layer-effects-readiness:v1',
    effectKinds: interop.effectKinds,
    supportedEffectCatalog,
    supportedEffects,
    unsupportedReadiness: {
      bevelEmboss: {
        supported: false,
        preservation: 'metadata-only',
        flatteningRequiredForPixels: hasBevelEmbossMetadata,
        warning: UNSUPPORTED_LAYER_EFFECT_CAPABILITIES[0].warning ?? '',
      },
      blendIf: {
        supported: !blendIfPresent,
        preservation: blendIfPresent ? 'metadata-only' : 'not-needed',
        flatteningRequiredForPixels: blendIfPresent,
        ...(interop.advancedBlending.warning ? { warning: interop.advancedBlending.warning } : {}),
      },
    },
    globalLight: {
      participates: interop.globalLight.required,
      angle: interop.globalLight.angle,
      effectIds: [...interop.globalLight.dependentEffectIds],
    },
    globalLightPortability: interop.globalLightPortability,
    blendIfPortability: interop.unsupportedBlendIf,
    portability: {
      exportTarget: interop.flattenedExport.target,
      portableAsSignalLoomPreset: portableWarnings.length === 0 && unsupportedEffectKinds.length === 0,
      flattensForPixelExport: interop.flattenedExport.rasterizesEffects,
      preservesEditablePhotoshopLayerStyles: interop.flattenedExport.preservesEditableLayerStyles,
      warnings: portableWarnings,
    },
    blockers,
    warnings,
    unsupportedStates: buildLayerEffectUnsupportedStates({
      hasBevelEmbossMetadata,
      blendIfPresent,
    }),
    unsupportedStateDescriptors: describeLayerEffectUnsupportedStateDescriptors({
      unsupportedEffectKinds,
      blendIf: interop.advancedBlending.blendIf,
    }),
    mathCaveats: [...interop.knownMathLimitations],
    perEffectExportCaveats: interop.perEffectExportCaveats,
    presetCompatibility: {
      presetEligibleEffectKinds,
      unsupportedEffectKinds,
      compatibleWithSignalLoomPresets: portableWarnings.length === 0 && unsupportedEffectKinds.length === 0,
      compatibleWithNativePhotoshopLayerStyles: false,
      signature: buildLayerEffectPresetCompatibilitySignature(
        presetEligibleEffectKinds,
        interop.globalLight.angle,
        unsupportedEffectKinds,
        interop.advancedBlending.blendIf,
      ),
    },
    presetPortability: interop.presetPortability,
    signatures: {
      stack: `layer-effect-readiness-stack:v1:${JSON.stringify({
        effects: enabledEffects.map((effect, order) => ({
          order,
          id: effect.id,
          kind: effect.kind,
          renderer: layerEffectRenderer(effect.kind),
        })),
        globalLight: interop.globalLight,
        unsupportedEffectKinds,
        blendIf: interop.advancedBlending.blendIf,
        exportTarget: interop.flattenedExport.target,
      })}`,
      preview: interop.previewSignature,
      export: interop.exportSignature,
      capabilityCatalog: `layer-effect-capability-catalog:v1:${JSON.stringify(LAYER_EFFECT_CAPABILITY_CATALOG)}`,
    },
  };
}

export function describeLayerEffectUnsupportedStateDescriptors(
  options: LayerEffectUnsupportedStateDescriptorOptions = {},
): LayerEffectUnsupportedStateDescriptor[] {
  const states: LayerEffectUnsupportedStateDescriptor[] = [];
  for (const kind of uniqueEffectKinds(options.unsupportedEffectKinds ?? []).filter(isUnsupportedLayerEffectKind)) {
    const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === kind);
    states.push(buildLayerEffectUnsupportedStateDescriptor({
      id: `effect-kind:${kind}`,
      label: capability?.label ?? kind,
      capability: 'unsupported-effect',
      preservation: 'metadata-only',
      reasonCode: 'layer-effect-bevel-emboss-unsupported',
      warning: capability?.warning ?? 'This Photoshop layer effect is not implemented in Signal Loom yet.',
    }));
  }
  if (options.blendIf === 'present') {
    states.push(buildLayerEffectUnsupportedStateDescriptor({
      id: 'blend-if',
      label: 'Blend If',
      capability: 'blend-if',
      preservation: 'metadata-only',
      reasonCode: 'layer-effect-blend-if-unsupported',
      warning: 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
    }));
  }
  if (options.nativePsdLiveEffects === 'required') {
    states.push(buildLayerEffectUnsupportedStateDescriptor({
      id: 'native-psd-live-effect-fidelity',
      label: 'Native PSD live effect fidelity',
      capability: 'native-psd-live-effect-fidelity',
      preservation: 'flattened-pixels-and-signal-loom-metadata',
      reasonCode: 'native-psd-live-effect-fidelity-unsupported',
      warning: 'Native PSD live layer-effect fidelity is not supported; Signal Loom preserves deterministic metadata and flattened pixels for export.',
    }));
  }
  if (options.smartObjectEffectPreservation === 'required') {
    states.push(buildLayerEffectUnsupportedStateDescriptor({
      id: 'smart-object-effect-preservation',
      label: 'Smart Object effect preservation',
      capability: 'smart-object-effect-preservation',
      preservation: 'metadata-only',
      reasonCode: 'smart-object-effect-preservation-unsupported',
      warning: 'Smart Object layer effect preservation is not supported; effects must be represented as Signal Loom metadata or flattened pixels.',
    }));
  }
  return states;
}

function buildLayerEffectUnsupportedStateDescriptor(input: {
  id: LayerEffectUnsupportedStateDescriptor['id'];
  label: string;
  capability: LayerEffectUnsupportedStateCapability;
  preservation: LayerEffectUnsupportedStateDescriptor['preservation'];
  reasonCode: LayerEffectReadinessBlockerCode;
  warning: string;
}): LayerEffectUnsupportedStateDescriptor {
  return {
    id: input.id,
    label: input.label,
    capability: input.capability,
    supported: false,
    preservation: input.preservation,
    requiresFlattenedPixelsForParity: true,
    reasonCode: input.reasonCode,
    warning: input.warning,
    signature: `layer-effect-unsupported-state:v1:${input.id}:${input.reasonCode}:${input.preservation}`,
  };
}

function buildLayerEffectSupportedEffectCatalog(): LayerEffectReadinessSupportedEffect[] {
  return LAYER_EFFECT_CAPABILITY_CATALOG.flatMap((capability) => {
    if (!capability.supported || capability.renderer === 'unsupported') return [];
    return [{
      kind: capability.kind as LayerEffectKind,
      label: capability.label,
      renderer: capability.renderer,
      presetEligible: capability.presetEligible,
    }];
  });
}

function buildLayerEffectReadinessBlockers(input: {
  hasBevelEmbossMetadata: boolean;
  blendIfPresent: boolean;
}): LayerEffectReadinessBlocker[] {
  const blockers: LayerEffectReadinessBlocker[] = [];
  if (input.hasBevelEmbossMetadata) {
    blockers.push({
      code: 'layer-effect-bevel-emboss-unsupported',
      severity: 'blocker',
      message: 'Bevel & Emboss layer styles are metadata-only in Signal Loom; flatten before requiring pixel parity.',
    });
  }
  if (input.blendIfPresent) {
    blockers.push({
      code: 'layer-effect-blend-if-unsupported',
      severity: 'blocker',
      message: 'Photoshop Blend If / advanced blending ranges are metadata-only; flatten before requiring preview or export pixel parity.',
    });
  }
  return blockers;
}

function buildLayerEffectReadinessWarnings(
  interop: LayerEffectStackInteropDescriptor,
): LayerEffectReadinessWarning[] {
  const warnings: LayerEffectReadinessWarning[] = [];
  if (interop.flattenedExport.warning) {
    warnings.push({
      code: 'layer-effect-flattened-export-rasterizes-effects',
      severity: 'warning',
      message: interop.flattenedExport.warning,
    });
  }
  for (const caveat of interop.alphaOpacityCaveats) {
    if (caveat.id === 'effect-opacity') {
      warnings.push({
        code: 'layer-effect-opacity-baked-into-render',
        severity: 'warning',
        message: caveat.caveat,
      });
    }
    if (caveat.id === 'flattened-export-alpha') {
      warnings.push({
        code: 'layer-effect-flattened-alpha-controls-not-editable',
        severity: 'warning',
        message: caveat.caveat,
      });
    }
  }
  if (
    interop.unsupportedEffects.length > 0
    || !interop.advancedBlending.supported
    || interop.flattenedExport.rasterizesEffects
  ) {
    warnings.push({
      code: 'layer-effect-preset-portability-limited',
      severity: 'warning',
      message: 'Layer style presets remain portable inside Signal Loom only for supported effects; native Photoshop-only controls require metadata or flattened pixels.',
    });
  }
  return warnings;
}

function buildLayerEffectUnsupportedStates(input: {
  hasBevelEmbossMetadata: boolean;
  blendIfPresent: boolean;
}): string[] {
  const states: string[] = [];
  if (input.hasBevelEmbossMetadata) states.push('bevelEmboss:metadata-only');
  if (input.blendIfPresent) states.push('blendIf:metadata-only');
  return states;
}

export function layerEffectLabel(kind: LayerEffectKind): string {
  switch (kind) {
    case 'stroke':
      return 'Stroke';
    case 'dropShadow':
      return 'Drop Shadow';
    case 'innerShadow':
      return 'Inner Shadow';
    case 'outerGlow':
      return 'Outer Glow';
    case 'innerGlow':
      return 'Inner Glow';
    case 'colorOverlay':
      return 'Color Overlay';
    case 'satin':
      return 'Satin';
    case 'patternOverlay':
      return 'Pattern Overlay';
    case 'gradientOverlay':
      return 'Gradient Overlay';
  }
}

export function synchronizeLayerEffectsGlobalLight(
  effects: readonly ImageLayerEffect[],
  angle: number,
): ImageLayerEffect[] {
  return effects.map((effect) => {
    if (effect.kind !== 'dropShadow' && effect.kind !== 'innerShadow') return effect;
    if (effect.angle === angle) return effect;
    return { ...effect, angle };
  });
}

function describeLayerEffectGlobalLight(
  effects: readonly ImageLayerEffect[],
  requestedAngle: number | undefined,
): LayerEffectGlobalLightDescriptor {
  const dependentEffects = effects.filter(
    (effect): effect is Extract<ImageLayerEffect, { kind: 'dropShadow' | 'innerShadow' }> =>
      effect.kind === 'dropShadow' || effect.kind === 'innerShadow',
  );
  const fallbackAngle = dependentEffects.find(
    (effect): effect is Extract<ImageLayerEffect, { kind: 'dropShadow' | 'innerShadow' }> =>
      effect.kind === 'dropShadow' || effect.kind === 'innerShadow',
  )?.angle;
  const angle = normalizeOptionalAngle(requestedAngle ?? fallbackAngle);
  return {
    required: dependentEffects.length > 0,
    angle,
    dependentEffectIds: dependentEffects.map((effect) => effect.id),
    participants: dependentEffects.map((effect) => ({
      effectId: effect.id,
      kind: effect.kind,
      participates: true,
    })),
  };
}

function normalizeOptionalAngle(angle: number | undefined): number | null {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null;
  return Math.round(angle * 1000) / 1000;
}

function uniqueEffectKinds(kinds: readonly PhotoshopLayerEffectKind[]): PhotoshopLayerEffectKind[] {
  const seen = new Set<PhotoshopLayerEffectKind>();
  const unique: PhotoshopLayerEffectKind[] = [];
  for (const kind of kinds) {
    if (seen.has(kind)) continue;
    seen.add(kind);
    unique.push(kind);
  }
  return unique;
}

function getLayerEffectCapabilityGroups(): LayerEffectCapabilityGroup[] {
  return LAYER_EFFECT_CAPABILITY_GROUPS.map((group) => ({
    ...group,
    effectKinds: [...group.effectKinds],
  }));
}

function describeUnsupportedLayerEffects(
  kinds: readonly PhotoshopLayerEffectKind[],
): LayerEffectUnsupportedStatus[] {
  return kinds.flatMap((kind) => {
    const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === kind);
    if (!capability?.warning) return [];
    return [{
      kind,
      label: capability.label,
      status: 'unsupported' as const,
      preservation: 'metadata-only' as const,
      warning: capability.warning,
    }];
  });
}

function isUnsupportedLayerEffectKind(kind: PhotoshopLayerEffectKind): boolean {
  const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === kind);
  return Boolean(capability?.warning);
}

function describeLayerEffectFlattenedExport(
  target: 'editable' | 'flattened',
): LayerEffectFlattenedExportDescriptor {
  const warning = target === 'flattened'
    ? 'Layer effects are rasterized into flattened exports; editable Photoshop layer-style roundtrip is not preserved.'
    : undefined;
  return {
    target,
    rasterizesEffects: target === 'flattened',
    preservesEditableLayerStyles: target !== 'flattened',
    ...(warning ? { warning } : {}),
  };
}

function describeLayerEffectAdvancedBlending(
  blendIf: 'absent' | 'present',
): LayerEffectAdvancedBlendingDescriptor {
  const warning = blendIf === 'present'
    ? 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.'
    : undefined;
  return {
    blendIf,
    supported: blendIf === 'absent',
    ...(warning ? { warning } : {}),
  };
}

function describeLayerEffectUnsupportedBlendIf(
  advancedBlending: LayerEffectAdvancedBlendingDescriptor,
): LayerEffectUnsupportedBlendIfDescriptor {
  return {
    id: 'blend-if',
    label: 'Blend If',
    supported: false,
    preservation: 'metadata-only',
    requiresFlatteningForParity: advancedBlending.blendIf === 'present',
    warning: advancedBlending.warning ?? 'Photoshop Blend If / advanced blending options are not supported yet; flatten or rasterize them before relying on Image preview/export parity.',
    signature: `layer-effect-blend-if:v1:${advancedBlending.blendIf}:metadata-only`,
  };
}

function describeLayerEffectGlobalLightPortability(
  globalLight: LayerEffectGlobalLightDescriptor,
): LayerEffectGlobalLightPortabilityDescriptor {
  return {
    id: 'layer-effect-global-light-portability:v1',
    portableWithinSignalLoom: true,
    portableAcrossDocuments: true,
    portableAsEditablePhotoshopLayerStyle: false,
    usesGlobalLight: globalLight.required,
    angle: globalLight.angle,
    participantEffectIds: [...globalLight.dependentEffectIds],
    warnings: [],
    signature: `layer-effect-global-light:v1:${globalLight.angle ?? 'none'}:${globalLight.dependentEffectIds.join('|') || 'none'}`,
  };
}

function describeLayerEffectPresetPortability(input: {
  globalLight: LayerEffectGlobalLightDescriptor;
  unsupportedEffects: readonly LayerEffectUnsupportedStatus[];
  unsupportedBlendIf: LayerEffectUnsupportedBlendIfDescriptor;
  flattenedExport: LayerEffectFlattenedExportDescriptor;
}): LayerEffectPresetPortabilityDescriptor {
  const unsupportedFeatures: Array<'blend-if' | 'bevelEmboss'> = [];
  if (input.unsupportedBlendIf.requiresFlatteningForParity) {
    unsupportedFeatures.push('blend-if');
  }
  if (input.unsupportedEffects.some((effect) => effect.kind === 'bevelEmboss')) {
    unsupportedFeatures.push('bevelEmboss');
  }
  const warnings = [
    ...(input.flattenedExport.warning ? [input.flattenedExport.warning] : []),
    ...input.unsupportedEffects.map((effect) => effect.warning),
    ...(input.unsupportedBlendIf.requiresFlatteningForParity ? [input.unsupportedBlendIf.warning] : []),
  ];
  const portableWithinSignalLoom = warnings.length === 0;
  return {
    id: 'layer-effect-preset-portability:v1',
    portableWithinSignalLoom,
    portableAcrossDocuments: portableWithinSignalLoom,
    portableAsEditablePhotoshopLayerStyle: false,
    usesGlobalLight: input.globalLight.required,
    unsupportedFeatures,
    warnings,
    signature: `layer-effect-preset-portability:v1:${unsupportedFeatures.join('|') || 'none'}:global-light:${input.globalLight.angle ?? 'none'}:${input.globalLight.dependentEffectIds.join('|') || 'none'}`,
  };
}

function describeLayerEffectAlphaOpacityCaveats(
  effects: readonly ImageLayerEffect[],
  exportTarget: 'editable' | 'flattened',
): LayerEffectAlphaOpacityCaveat[] {
  if (effects.length === 0) return [];
  const affectedEffectIds = effects.map((effect) => effect.id);
  const caveats: LayerEffectAlphaOpacityCaveat[] = [{
    id: 'effect-opacity',
    label: 'Layer effect opacity',
    affectedEffectIds,
    caveat: LAYER_EFFECT_OPACITY_CAVEAT,
  }];
  if (exportTarget === 'flattened') {
    caveats.push({
      id: 'flattened-export-alpha',
      label: 'Flattened export alpha',
      affectedEffectIds,
      caveat: LAYER_EFFECT_FLATTENED_ALPHA_CAVEAT,
    });
  }
  return caveats;
}

function describeLayerEffectPerEffectExportCaveats(
  effects: readonly ImageLayerEffect[],
  exportTarget: 'editable' | 'flattened',
  globalLight: LayerEffectGlobalLightDescriptor,
): LayerEffectPerEffectExportCaveat[] {
  return effects.map((effect) => {
    const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === effect.kind);
    const label = capability?.label ?? layerEffectLabel(effect.kind);
    const renderer = layerEffectRenderer(effect.kind);
    const usesGlobalLight = GLOBAL_LIGHT_EFFECT_KINDS.has(effect.kind);
    const expandsBounds = isCanvasEffectKind(effect.kind);
    const flattenedForExport = exportTarget === 'flattened';
    const caveatCodes = describeLayerEffectExportCaveatCodes({
      renderer,
      usesGlobalLight,
      expandsBounds,
      flattenedForExport,
    });

    return {
      effectId: effect.id,
      kind: effect.kind,
      label,
      renderer,
      presetEligible: capability?.presetEligible ?? false,
      usesGlobalLight,
      expandsBounds,
      flattenedForExport,
      preservesEditableSignalLoomMetadata: true,
      nativePhotoshopLayerStyleRoundtrip: false,
      caveatCodes,
      caveats: caveatCodes.map((code) => describeLayerEffectExportCaveatMessage({
        code,
        label,
        globalLightAngle: globalLight.angle,
      })),
      signature: `layer-effect-export-caveat:v1:${JSON.stringify({
        effectId: effect.id,
        kind: effect.kind,
        renderer,
        target: exportTarget,
        globalLight: globalLight.angle,
        caveatCodes,
      })}`,
    };
  });
}

function describeLayerEffectExportCaveatCodes(input: {
  renderer: LayerEffectCapability['renderer'];
  usesGlobalLight: boolean;
  expandsBounds: boolean;
  flattenedForExport: boolean;
}): LayerEffectPerEffectExportCaveatCode[] {
  const caveatCodes: LayerEffectPerEffectExportCaveatCode[] = [];
  if (input.flattenedForExport) caveatCodes.push('effect-flattened-for-export');
  if (input.expandsBounds) caveatCodes.push('canvas-effect-bounds-expansion');
  if (input.renderer === 'content') caveatCodes.push('content-effect-raster-approximation');
  if (input.usesGlobalLight) caveatCodes.push('global-light-metadata-only');
  caveatCodes.push('native-photoshop-layer-style-roundtrip-unavailable');
  return caveatCodes;
}

function describeLayerEffectExportCaveatMessage(input: {
  code: LayerEffectPerEffectExportCaveatCode;
  label: string;
  globalLightAngle: number | null;
}): string {
  switch (input.code) {
    case 'effect-flattened-for-export':
      return `Flattened export bakes ${input.label} into pixels while keeping editable Signal Loom effect metadata.`;
    case 'canvas-effect-bounds-expansion':
      return `${input.label} can expand raster bounds before export.`;
    case 'content-effect-raster-approximation':
      return `${input.label} is rendered into layer content before blend-mode compositing.`;
    case 'global-light-metadata-only':
      return input.globalLightAngle === null
        ? `${input.label} participates in shared global light metadata when an angle is available.`
        : `${input.label} participates in shared global light metadata at ${input.globalLightAngle} degrees.`;
    case 'native-photoshop-layer-style-roundtrip-unavailable':
      return 'Editable native Photoshop layer-style roundtrip is unavailable; export relies on flattened pixels plus Signal Loom metadata.';
  }
}

function getLayerEffectRasterizationWarnings(flattenedExport: LayerEffectFlattenedExportDescriptor): string[] {
  return flattenedExport.warning ? [flattenedExport.warning] : [];
}

function describeLayerEffectStackPortability(
  flattenedExport: LayerEffectFlattenedExportDescriptor,
  unsupportedEffects: readonly LayerEffectUnsupportedStatus[],
  advancedBlending: LayerEffectAdvancedBlendingDescriptor,
): LayerEffectStackPortabilityDescriptor {
  const warnings = [
    ...getLayerEffectRasterizationWarnings(flattenedExport),
    ...unsupportedEffects.map((effect) => effect.warning),
    ...getLayerEffectBlendIfWarnings(advancedBlending),
  ];
  const portableWithinSignalLoom = warnings.length === 0;
  const portableAcrossSignalLoomDocuments = warnings.length === 0;
  return {
    portableWithinSignalLoom,
    portableAcrossSignalLoomDocuments,
    portableAsEditablePhotoshopLayerStyle: false,
    requiresFlattenedPixelsForExport: flattenedExport.rasterizesEffects,
    warnings,
    signature: `layer-effect-stack-portability:v1:${JSON.stringify({
      portableWithinSignalLoom,
      portableAcrossSignalLoomDocuments,
      portableAsEditablePhotoshopLayerStyle: false,
      requiresFlattenedPixelsForExport: flattenedExport.rasterizesEffects,
      warnings,
    })}`,
  };
}

function getLayerEffectBlendIfWarnings(advancedBlending: LayerEffectAdvancedBlendingDescriptor): string[] {
  return advancedBlending.warning ? [advancedBlending.warning] : [];
}

function layerEffectRenderer(kind: LayerEffectKind): LayerEffectCapability['renderer'] {
  const capability = LAYER_EFFECT_CAPABILITY_CATALOG.find((entry) => entry.kind === kind);
  return capability?.renderer ?? 'unsupported';
}

function buildLayerEffectPresetCompatibilitySignature(
  effectKinds: readonly LayerEffectKind[],
  globalLightAngle: number | null,
  unsupportedEffectKinds: readonly PhotoshopLayerEffectKind[],
  blendIf: 'absent' | 'present',
): string {
  const globalLightPart = globalLightAngle === null ? 'no-global-light' : `global-light:${globalLightAngle}`;
  const unsupportedPart = unsupportedEffectKinds.length > 0
    ? `unsupported:${unsupportedEffectKinds.join(',')}`
    : 'unsupported:none';
  return [
    'layer-effect-preset:v1',
    effectKinds.join('|') || 'none',
    globalLightPart,
    unsupportedPart,
    `blend-if:${blendIf}`,
  ].join(':');
}

export function renderLayerWithEffects(layer: ImageLayer): RenderedLayerWithEffects | null {
  if (!layer.bitmap) return null;

  const enabledEffects = (layer.effects ?? []).filter((effect) => effect.enabled);
  const source = getLayerSourceImageData(layer);
  const padding = resolveEffectPadding(source, enabledEffects);
  const output = createBitmap(source.width + padding.left + padding.right, source.height + padding.top + padding.bottom);
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire layer effect render context');
  const imageData = ctx.createImageData(output.width, output.height);

  for (const effect of enabledEffects) {
    renderEffectInto(imageData, source, effect, padding.left, padding.top);
  }

  const content = applyContentEffects(source, enabledEffects);
  compositeImageData(imageData, content, padding.left, padding.top);
  putBitmapImageData(output, imageData);

  return {
    bitmap: output,
    offsetX: padding.left === 0 ? 0 : -padding.left,
    offsetY: padding.top === 0 ? 0 : -padding.top,
  };
}

function getLayerSourceImageData(layer: ImageLayer): ImageData {
  if (!layer.bitmap) {
    throw new Error('Cannot read image data from a layer without a bitmap.');
  }
  const source = getBitmapImageData(layer.bitmap);
  if (!layer.mask) return applyLayerFiltersToImageData(source, layer.filters);
  return applyLayerFiltersToImageData(applyLayerMaskToImageData(source, layer), layer.filters);
}

function renderEffectInto(
  target: ImageData,
  source: ImageData,
  effect: ImageLayerEffect,
  originX: number,
  originY: number,
): void {
  switch (effect.kind) {
    case 'stroke':
      renderStroke(target, source, effect, originX, originY);
      break;
    case 'dropShadow':
      renderSpreadAlphaEffect(target, source, {
        color: effect.color,
        opacity: effect.opacity,
        radius: effect.size,
        offsetX: Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance),
        offsetY: Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance),
        originX,
        originY,
        outsideOnly: false,
      });
      break;
    case 'innerShadow':
      break;
    case 'outerGlow':
      renderSpreadAlphaEffect(target, source, {
        color: effect.color,
        opacity: effect.opacity,
        radius: effect.size,
        offsetX: 0,
        offsetY: 0,
        originX,
        originY,
        outsideOnly: true,
      });
      break;
    case 'innerGlow':
      break;
    case 'colorOverlay':
      break;
    case 'satin':
      break;
    case 'patternOverlay':
      break;
    case 'gradientOverlay':
      break;
  }
}

function renderStroke(
  target: ImageData,
  source: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'stroke' }>,
  originX: number,
  originY: number,
): void {
  const color = parseCssColor(effect.color);
  const radius = Math.max(0, Math.round(effect.size));
  if (radius === 0 || effect.opacity <= 0) return;

  forEachOpaquePixel(source, (x, y, alpha) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius + 0.001) continue;
        const sx = x + dx;
        const sy = y + dy;
        const sourceAlphaAtTarget = sampleAlpha(source, sx, sy);
        const isInside = sourceAlphaAtTarget > 0;
        if (effect.position === 'outside' && isInside) continue;
        if (effect.position === 'inside' && !isInside) continue;
        const feather = radius <= 1 ? 1 : clamp01(1 - Math.max(0, distance - radius + 1));
        const effectAlpha = alpha * effect.opacity * feather;
        blendPixel(target, originX + sx, originY + sy, color, effectAlpha);
      }
    }
  });
}

function renderSpreadAlphaEffect(
  target: ImageData,
  source: ImageData,
  options: {
    color: string;
    opacity: number;
    radius: number;
    offsetX: number;
    offsetY: number;
    originX: number;
    originY: number;
    outsideOnly: boolean;
  },
): void {
  const color = parseCssColor(options.color);
  const radius = Math.max(0, Math.round(options.radius));

  forEachOpaquePixel(source, (x, y, alpha) => {
    const spread = Math.max(0, radius);
    for (let dy = -spread; dy <= spread; dy += 1) {
      for (let dx = -spread; dx <= spread; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > spread + 0.001) continue;
        const sx = x + options.offsetX + dx;
        const sy = y + options.offsetY + dy;
        if (options.outsideOnly && sampleAlpha(source, sx, sy) > 0) continue;
        const falloff = spread === 0 ? 1 : clamp01(1 - distance / (spread + 1));
        blendPixel(
          target,
          options.originX + sx,
          options.originY + sy,
          color,
          alpha * options.opacity * falloff,
        );
      }
    }
  });
}

function applyContentEffects(source: ImageData, effects: ImageLayerEffect[]): ImageData {
  const output = cloneImageData(source);
  for (const effect of effects) {
    if (!effect.enabled) continue;
    switch (effect.kind) {
      case 'innerShadow':
        applyInnerShadowToContent(output, source, effect);
        break;
      case 'innerGlow':
        applyInnerGlowToContent(output, source, effect);
        break;
      case 'satin':
        applySatinToContent(output, source, effect);
        break;
      case 'patternOverlay':
        applyPatternOverlayToContent(output, effect);
        break;
      case 'gradientOverlay':
        applyGradientOverlayToContent(output, effect);
        break;
      case 'colorOverlay':
        applyColorOverlayToContent(output, effect);
        break;
      case 'stroke':
      case 'dropShadow':
      case 'outerGlow':
        break;
    }
  }

  return output;
}

function applyColorOverlayToContent(
  output: ImageData,
  overlay: Extract<ImageLayerEffect, { kind: 'colorOverlay' }>,
): void {
  const color = parseCssColor(overlay.color);
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = output.data[offset + 3] / 255;
      if (alpha <= 0) continue;
      const opacity = clamp01(overlay.opacity);
      output.data[offset] = mixByte(output.data[offset], color[0], opacity);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], opacity);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], opacity);
    }
  }
}

function applyInnerShadowToContent(
  output: ImageData,
  sourceAlpha: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'innerShadow' }>,
): void {
  const color = parseCssColor(effect.color);
  const radius = Math.max(0, Math.round(effect.size));
  const offsetX = Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance);
  const offsetY = Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance);
  if (effect.opacity <= 0) return;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = sourceAlpha.data[offset + 3] / 255;
      if (alpha <= 0) continue;

      let strength = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > radius + 0.001) continue;
          const shadowAlpha = 1 - sampleAlpha(sourceAlpha, x - offsetX + dx, y - offsetY + dy);
          if (shadowAlpha <= 0) continue;
          const falloff = radius === 0 ? 1 : clamp01(1 - distance / (radius + 1));
          strength = Math.max(strength, shadowAlpha * falloff);
        }
      }

      const opacity = clamp01(effect.opacity * alpha * strength);
      if (opacity <= 0) continue;
      output.data[offset] = mixByte(output.data[offset], color[0], opacity);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], opacity);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], opacity);
    }
  }
}

function applyInnerGlowToContent(
  output: ImageData,
  sourceAlpha: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'innerGlow' }>,
): void {
  const color = parseCssColor(effect.color);
  const radius = Math.max(0, Math.round(effect.size));
  const opacity = clamp01(effect.opacity);
  if (opacity <= 0) return;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = sourceAlpha.data[offset + 3] / 255;
      if (alpha <= 0) continue;

      let strength = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > radius + 0.001) continue;
          const outsideAlpha = 1 - sampleAlpha(sourceAlpha, x + dx, y + dy);
          if (outsideAlpha <= 0) continue;
          const falloff = radius === 0 ? 1 : clamp01(1 - distance / (radius + 1));
          strength = Math.max(strength, outsideAlpha * falloff);
        }
      }

      const mix = clamp01(strength * opacity * alpha);
      if (mix <= 0) continue;
      output.data[offset] = mixByte(output.data[offset], color[0], mix);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], mix);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], mix);
    }
  }
}

function applySatinToContent(
  output: ImageData,
  sourceAlpha: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'satin' }>,
): void {
  const color = parseCssColor(effect.color);
  const radius = Math.max(1, Math.round(effect.size));
  const offsetX = Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance);
  const offsetY = Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance);
  const opacity = clamp01(effect.opacity);
  if (opacity <= 0) return;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = sourceAlpha.data[offset + 3] / 255;
      if (alpha <= 0) continue;

      const forward = sampleAlpha(sourceAlpha, x + offsetX, y + offsetY);
      const backward = sampleAlpha(sourceAlpha, x - offsetX, y - offsetY);
      const distanceFromCenterX = Math.abs(x - (sourceAlpha.width - 1) / 2) / Math.max(1, sourceAlpha.width / 2);
      const distanceFromCenterY = Math.abs(y - (sourceAlpha.height - 1) / 2) / Math.max(1, sourceAlpha.height / 2);
      const centerFalloff = clamp01(1 - Math.hypot(distanceFromCenterX, distanceFromCenterY) / Math.max(1, radius / 4));
      const directionalInfluence = 0.5 + Math.abs(forward - backward) * 0.5;
      const directionalContrast = clamp01(centerFalloff * directionalInfluence);
      const strength = effect.invert ? 1 - directionalContrast : directionalContrast;
      const mix = clamp01(strength * opacity * alpha);
      if (mix <= 0) continue;
      output.data[offset] = mixByte(output.data[offset], color[0], mix);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], mix);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], mix);
    }
  }
}

function applyGradientOverlayToContent(
  output: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'gradientOverlay' }>,
): void {
  const start = parseCssColor(effect.color);
  const end = parseCssColor(effect.secondaryColor);
  const opacity = clamp01(effect.opacity);
  if (opacity <= 0) return;

  const angle = (effect.angle * Math.PI) / 180;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const centerX = (output.width - 1) / 2;
  const centerY = (output.height - 1) / 2;
  const corners = [
    projectGradientPoint(0, 0, centerX, centerY, dirX, dirY),
    projectGradientPoint(output.width - 1, 0, centerX, centerY, dirX, dirY),
    projectGradientPoint(0, output.height - 1, centerX, centerY, dirX, dirY),
    projectGradientPoint(output.width - 1, output.height - 1, centerX, centerY, dirX, dirY),
  ];
  const minProjection = Math.min(...corners);
  const maxProjection = Math.max(...corners);
  const span = Math.max(1, (maxProjection - minProjection) * Math.max(0.01, effect.scale));

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = output.data[offset + 3] / 255;
      if (alpha <= 0) continue;
      const projection = projectGradientPoint(x, y, centerX, centerY, dirX, dirY);
      let t = clamp01((projection - minProjection) / span);
      if (effect.reverse) t = 1 - t;
      const color: [number, number, number] = [
        mixByte(start[0], end[0], t),
        mixByte(start[1], end[1], t),
        mixByte(start[2], end[2], t),
      ];
      const mix = opacity * alpha;
      output.data[offset] = mixByte(output.data[offset], color[0], mix);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], mix);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], mix);
    }
  }
}

function projectGradientPoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  dirX: number,
  dirY: number,
): number {
  return (x - centerX) * dirX + (y - centerY) * dirY;
}

function applyPatternOverlayToContent(
  output: ImageData,
  effect: Extract<ImageLayerEffect, { kind: 'patternOverlay' }>,
): void {
  const foreground = parseCssColor(effect.color);
  const background = parseCssColor(effect.backgroundColor);
  const opacity = clamp01(effect.opacity);
  const scale = Math.max(1, Math.round(effect.scale));
  if (opacity <= 0) return;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      const alpha = output.data[offset + 3] / 255;
      if (alpha <= 0) continue;
      const color = samplePatternOverlayColor(effect.pattern, x, y, scale, foreground, background);
      const mix = opacity * alpha;
      output.data[offset] = mixByte(output.data[offset], color[0], mix);
      output.data[offset + 1] = mixByte(output.data[offset + 1], color[1], mix);
      output.data[offset + 2] = mixByte(output.data[offset + 2], color[2], mix);
    }
  }
}

function samplePatternOverlayColor(
  pattern: Extract<ImageLayerEffect, { kind: 'patternOverlay' }>['pattern'],
  x: number,
  y: number,
  scale: number,
  foreground: [number, number, number],
  background: [number, number, number],
): [number, number, number] {
  const tileX = Math.floor(x / scale);
  const tileY = Math.floor(y / scale);
  switch (pattern) {
    case 'diagonal':
      return Math.floor((x + y) / scale) % 2 === 0 ? foreground : background;
    case 'dots': {
      const center = (scale - 1) / 2;
      const localX = x % scale;
      const localY = y % scale;
      return Math.hypot(localX - center, localY - center) <= Math.max(1, scale / 4)
        ? foreground
        : background;
    }
    case 'grid':
      return x % scale === 0 || y % scale === 0 ? foreground : background;
    case 'checker':
    default:
      return (tileX + tileY) % 2 === 0 ? foreground : background;
  }
}

function resolveEffectPadding(
  source: ImageData,
  effects: ImageLayerEffect[],
): { left: number; right: number; top: number; bottom: number } {
  const padding = { left: 0, right: 0, top: 0, bottom: 0 };

  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.kind === 'stroke') {
      const size = Math.max(0, Math.ceil(effect.size));
      if (effect.position !== 'inside') {
        padding.left = Math.max(padding.left, size);
        padding.right = Math.max(padding.right, size);
        padding.top = Math.max(padding.top, size);
        padding.bottom = Math.max(padding.bottom, size);
      }
    }

    if (effect.kind === 'outerGlow') {
      const size = Math.max(0, Math.ceil(effect.size));
      padding.left = Math.max(padding.left, size);
      padding.right = Math.max(padding.right, size);
      padding.top = Math.max(padding.top, size);
      padding.bottom = Math.max(padding.bottom, size);
    }

    if (effect.kind === 'dropShadow') {
      const size = Math.max(0, Math.ceil(effect.size));
      const dx = Math.round(Math.cos((effect.angle * Math.PI) / 180) * effect.distance);
      const dy = Math.round(Math.sin((effect.angle * Math.PI) / 180) * effect.distance);
      padding.left = Math.max(padding.left, size + Math.max(0, -dx));
      padding.right = Math.max(padding.right, size + Math.max(0, dx));
      padding.top = Math.max(padding.top, size + Math.max(0, -dy));
      padding.bottom = Math.max(padding.bottom, size + Math.max(0, dy));
    }
  }

  // Keep layer-effect buffers bounded by the source dimensions plus realistic
  // effect extents. This also prevents empty effects from creating zero-size
  // or unexpectedly huge buffers.
  return {
    left: Math.min(source.width * 2, padding.left),
    right: Math.min(source.width * 2, padding.right),
    top: Math.min(source.height * 2, padding.top),
    bottom: Math.min(source.height * 2, padding.bottom),
  };
}

function compositeImageData(target: ImageData, source: ImageData, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3] / 255;
      if (alpha <= 0) continue;
      blendPixel(target, dx + x, dy + y, [
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
      ], alpha);
    }
  }
}

function forEachOpaquePixel(
  imageData: ImageData,
  callback: (x: number, y: number, alpha: number) => void,
): void {
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const alpha = imageData.data[(y * imageData.width + x) * 4 + 3] / 255;
      if (alpha > 0) callback(x, y, alpha);
    }
  }
}

function sampleAlpha(imageData: ImageData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return 0;
  return imageData.data[(y * imageData.width + x) * 4 + 3] / 255;
}

function blendPixel(
  imageData: ImageData,
  x: number,
  y: number,
  color: [number, number, number],
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return;
  const offset = (y * imageData.width + x) * 4;
  const sourceAlpha = clamp01(alpha);
  const destAlpha = imageData.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;

  imageData.data[offset] = Math.round(
    (color[0] * sourceAlpha + imageData.data[offset] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 1] = Math.round(
    (color[1] * sourceAlpha + imageData.data[offset + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 2] = Math.round(
    (color[2] * sourceAlpha + imageData.data[offset + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  imageData.data[offset + 3] = Math.round(outAlpha * 255);
}

function parseCssColor(color: string): [number, number, number] {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return [
      parseInt(trimmed.slice(1, 3), 16),
      parseInt(trimmed.slice(3, 5), 16),
      parseInt(trimmed.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return [
      parseInt(trimmed[1] + trimmed[1], 16),
      parseInt(trimmed[2] + trimmed[2], 16),
      parseInt(trimmed[3] + trimmed[3], 16),
    ];
  }
  return [255, 255, 255];
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function mixByte(before: number, after: number, opacity: number): number {
  return Math.round(before + (after - before) * clamp01(opacity));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function isCanvasEffectKind(kind: LayerEffectKind): boolean {
  return kind === 'stroke' || kind === 'dropShadow' || kind === 'outerGlow';
}
