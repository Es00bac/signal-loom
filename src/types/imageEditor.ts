import type { PaperComicSfxDesign } from '../lib/paperComicSfx';

export type EditorTool =
  | 'hand'
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'magicWand'
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'backgroundEraser'
  | 'magicEraser'
  | 'cloneStamp'
  | 'spotHeal'
  | 'blurBrush'
  | 'sharpenBrush'
  | 'smudgeBrush'
  | 'dodgeBrush'
  | 'burnBrush'
  | 'spongeSaturateBrush'
  | 'spongeDesaturateBrush'
  | 'paintBucket'
  | 'gradientTool'
  | 'rectShape'
  | 'ellipseShape'
  | 'crop'
  | 'text'
  | 'eyedropper';

export type MarqueeShape = 'rectangle' | 'ellipse';
export type LassoShape = 'freehand' | 'polygonal' | 'magnetic';

export type LayerType = 'image' | 'mask' | 'text' | 'adjustment' | 'vector' | 'group';
export type ImageLayerColorLabel = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray';

export interface ImageLayerLocks {
  pixels?: boolean;
  position?: boolean;
}

export type LayerEffectKind =
  | 'stroke'
  | 'dropShadow'
  | 'innerShadow'
  | 'outerGlow'
  | 'innerGlow'
  | 'colorOverlay'
  | 'satin'
  | 'patternOverlay'
  | 'gradientOverlay';
export type LayerFilterKind = 'blur' | 'sharpen' | 'grayscale' | 'sepia' | 'invert' | 'noise' | 'pixelate';
export type PatternOverlayPattern = 'checker' | 'diagonal' | 'dots' | 'grid';

export interface BaseLayerEffect {
  id: string;
  kind: LayerEffectKind;
  enabled: boolean;
}

export interface StrokeLayerEffect extends BaseLayerEffect {
  kind: 'stroke';
  color: string;
  opacity: number;
  size: number;
  position: 'outside' | 'inside' | 'center';
}

export interface DropShadowLayerEffect extends BaseLayerEffect {
  kind: 'dropShadow';
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  size: number;
}

export interface InnerShadowLayerEffect extends BaseLayerEffect {
  kind: 'innerShadow';
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  size: number;
}

export interface OuterGlowLayerEffect extends BaseLayerEffect {
  kind: 'outerGlow';
  color: string;
  opacity: number;
  size: number;
}

export interface InnerGlowLayerEffect extends BaseLayerEffect {
  kind: 'innerGlow';
  color: string;
  opacity: number;
  size: number;
}

export interface ColorOverlayLayerEffect extends BaseLayerEffect {
  kind: 'colorOverlay';
  color: string;
  opacity: number;
}

export interface SatinLayerEffect extends BaseLayerEffect {
  kind: 'satin';
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  size: number;
  invert: boolean;
}

export interface PatternOverlayLayerEffect extends BaseLayerEffect {
  kind: 'patternOverlay';
  color: string;
  backgroundColor: string;
  opacity: number;
  pattern: PatternOverlayPattern;
  scale: number;
}

export interface GradientOverlayLayerEffect extends BaseLayerEffect {
  kind: 'gradientOverlay';
  color: string;
  secondaryColor: string;
  opacity: number;
  angle: number;
  scale: number;
  reverse: boolean;
}

export type ImageLayerEffect =
  | StrokeLayerEffect
  | DropShadowLayerEffect
  | InnerShadowLayerEffect
  | OuterGlowLayerEffect
  | InnerGlowLayerEffect
  | ColorOverlayLayerEffect
  | SatinLayerEffect
  | PatternOverlayLayerEffect
  | GradientOverlayLayerEffect;

export interface ImageLayerFilter {
  id: string;
  kind: LayerFilterKind;
  enabled: boolean;
  amount: number;
  opacity: number;
  blendMode: BlendMode;
}

export type AdjustmentLayerKind =
  | 'brightnessContrast'
  | 'hueSaturation'
  | 'blackWhite'
  | 'invert'
  | 'exposure'
  | 'temperatureTint'
  | 'levels'
  | 'curves';

export type ImageAdjustmentSettings =
  | {
      kind: 'brightnessContrast';
      brightness: number;
      contrast: number;
    }
  | {
      kind: 'hueSaturation';
      hue: number;
      saturation: number;
      lightness: number;
    }
  | {
      kind: 'blackWhite';
    }
  | {
      kind: 'invert';
    }
  | {
      kind: 'exposure';
      exposure: number;
      offset: number;
      gamma: number;
    }
  | {
      kind: 'temperatureTint';
      temperature: number;
      tint: number;
    }
  | {
      kind: 'levels';
      channel: 'rgb' | 'red' | 'green' | 'blue';
      inputBlack: number;
      inputWhite: number;
      gamma: number;
      outputBlack: number;
      outputWhite: number;
    }
  | {
      kind: 'curves';
      channel: 'rgb' | 'red' | 'green' | 'blue';
      points: Array<{ input: number; output: number }>;
      shadows: number;
      midtones: number;
      highlights: number;
    };

export interface ImageSourceLinkMetadata {
  id: string;
  label?: string;
  width?: number;
  height?: number;
  status: 'linked' | 'missing' | 'relinked';
  relinkHistory: Array<{ sourceId: string; label?: string; at: number }>;
}

export interface ImageLayerMetadata {
  editableText?: boolean;
  /** A text layer just dropped by the Type tool, not yet committed with content. */
  freshlyPlaced?: boolean;
  comicSfxDesign?: PaperComicSfxDesign;
  retouchOutput?: {
    sourceLayerId: string;
    tool: 'dodge' | 'burn' | 'spongeSaturate' | 'spongeDesaturate';
    outputMode: 'newLayer';
  };
  smartLinkedSourceId?: string;
  sourceLabel?: string;
  sourceLink?: ImageSourceLinkMetadata;
  sourceFormat?: string;
  sourceMimeType?: string;
  sourceWarnings?: string[];
  originalSvgSource?: string;
  vectorShape?: ImageVectorShape;
  vectorBooleanSource?: {
    operation: 'union' | 'intersect' | 'subtract' | 'xor';
    sourceLayerIds: string[];
    supportedSubset: 'axis-aligned-rectangles' | 'identical-simple-polygons' | 'non-overlapping-simple-polygons' | 'none';
    previewSignature: string;
  };
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export type QuickMaskViewMode = 'maskedAreas' | 'selectedAreas';
export type SelectAndMaskPreviewMode = 'maskedAreas' | 'selectedAreas' | 'onBlack' | 'onWhite' | 'blackWhite';
export type SelectAndMaskOutputMode = 'selection' | 'quickMask' | 'layerMask' | 'newAlphaChannel';
export type ImageLayerEditTarget = 'layer' | 'mask';
export type ImageColorChannel = 'rgb' | 'red' | 'green' | 'blue';
export type ImageColorChannelComponent = Exclude<ImageColorChannel, 'rgb'>;

export interface ImageChannelEditTarget {
  kind: 'colorChannel';
  channel: ImageColorChannel;
  components: ImageColorChannelComponent[];
}

export type ImageLayerTransformCorner = 'nw' | 'ne' | 'se' | 'sw';

export interface ImageTransformPoint {
  x: number;
  y: number;
}

export interface ImageLayerTransformCornerOffsets {
  nw: ImageTransformPoint;
  ne: ImageTransformPoint;
  se: ImageTransformPoint;
  sw: ImageTransformPoint;
}

export interface ImageLayerWarpOffsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One control-point displacement in a warp mesh, normalized to layer width/height. */
export interface WarpMeshPoint {
  x: number;
  y: number;
}

/** A Photoshop-style warp control mesh: an (columns+1)×(rows+1) grid of displacements. */
export interface WarpMesh {
  columns: number;
  rows: number;
  /** (rows+1)×(columns+1) node displacements, row-major. */
  points: WarpMeshPoint[];
}

export type BrushSymmetryMode = 'none' | 'vertical' | 'horizontal' | 'both';

/** A single control point of a brush response curve (input/output both 0..1). */
export interface BrushCurvePoint {
  x: number;
  y: number;
}

/** Named response-curve shapes (resolved to control points by the brush engine). */
export type BrushResponseCurvePreset = 'linear' | 'soft' | 'hard' | 'sshape';

/** A pressure/sensor response curve: a named preset or explicit control points. */
export type BrushResponseCurve = BrushResponseCurvePreset | BrushCurvePoint[];

export interface BrushSettings {
  presetId?: string;
  size: number;
  opacity: number;
  hardness: number;
  flow: number;
  color: string;
  spacing: number;
  angleDeg: number;
  roundness: number;
  scatter: number;
  smoothing: number;
  pressureSize: number;
  pressureOpacity: number;
  pressureFlow: number;
  /**
   * Pressure response curve. Remaps pen pressure through a transfer function
   * before it drives size/opacity/flow (Krita pressure curve / Photoshop
   * transfer). Defaults to 'linear' (identity) — no change unless configured.
   */
  pressureCurve?: BrushResponseCurve;
  /** Pressure → tip roundness (0..1): light pressure flattens the tip, full pressure restores it. */
  pressureRoundness?: number;
  /** Pressure → edge hardness (0..1): light pressure softens the edge, full pressure restores it. */
  pressureHardness?: number;
  /** Stylus tilt → brush angle steering (0..1). */
  tiltAngle?: number;
  /** Stylus tilt → tip flattening / elongation (0..1). */
  tiltRoundness?: number;
  /** Stylus tilt → footprint growth (0..1). */
  tiltSize?: number;
  /** Stylus tilt → opacity reduction (0..1): more tilt lays down lighter (pencil/charcoal shading). */
  tiltOpacity?: number;
  /** Stylus tilt → flow reduction (0..1): more tilt deposits less paint per dab. */
  tiltFlow?: number;
  /** Barrel rotation (twist) rotates the tip. */
  rotationFollowsTwist?: boolean;
  /** Pressure → blend the dab colour from the foreground toward the background (0..1). */
  pressureColor?: number;
  /** Tilt → blend the dab colour from the foreground toward the background (0..1). */
  tiltColor?: number;
  /** Color-smudge / mixer mode: brush also samples + mixes the canvas it passes over. */
  mixerEnabled?: boolean;
  /** Mixer: how much the picked-up colour persists/drags (0..1). */
  smudgeLength?: number;
  /** Mixer: radius (px) of the canvas-sampling disc. */
  smudgeRadius?: number;
  /** Mixer: how much foreground colour is added per dab (0..1). 0 = pure smudge. */
  colorRate?: number;
  /** Mixer colour blending: 'rgb' (default) or 'spectral' (realistic pigment). */
  mixMode?: 'rgb' | 'spectral';
  /** Mixer sampling: 'dulling' (average disc) or 'smearing' (streaky drag). */
  smudgeMode?: 'dulling' | 'smearing';
  tipShape: 'round' | 'square';
  symmetryMode?: BrushSymmetryMode;
  velocitySize?: number;
  velocityOpacity?: number;
  velocityFlow?: number;
  velocitySpacing?: number;
  /**
   * Shape/Transfer "jitter": per-dab deterministic randomization (seeded from the
   * stroke seed). Each value 0..1 is the maximum fraction by which that property is
   * randomly reduced per dab. 0 = off. Same seed → identical dabs (reproducible).
   */
  sizeJitter?: number;
  opacityJitter?: number;
  flowJitter?: number;
  roundnessJitter?: number;
  /** Angle jitter: per-dab random tip rotation, 0..1 scaled to ±180°. 0 = off. */
  angleJitter?: number;
  /** Dry-brush / taper: fade dab opacity in over the first N dabs of a stroke (0 = off). */
  fadeLength?: number;
  /** Dry-brush paint load 0..1 (how much "paint" the brush starts with). Default 1 = full. */
  paintLoad?: number;
  /** Dry-brush load depletion rate per pixel of stroke distance (0 = never runs out). */
  loadFalloff?: number;
  texture?: string;
  textureScale?: number;
  textureDepth?: number;
  dualBrush?: boolean;
  wetEdges?: boolean;
  wetMedia?: boolean;
  wetMix?: number;
  wetLoad?: number;
  wetPull?: number;
  gpuBrushEngine?: boolean;
  gpuAcceleration?: boolean;
  androidBrushControls?: boolean;
  androidStylusControls?: boolean;
  gamepadBrushControls?: boolean;
  gamepadPressure?: boolean;
  abrSourceHash?: string;
  abrPresetId?: string;
  abrVersion?: number;
}

export interface SelectionToolSettings {
  mode: SelectionMode;
  feather: number;
  antiAlias: boolean;
  marqueeShape: MarqueeShape;
  lassoShape: LassoShape;
  magicWandTolerance: number;
  sampleAllLayers: boolean;
  contiguous: boolean;
  paintBucketBlendMode: BlendMode;
  paintBucketPreserveTransparency: boolean;
  backgroundEraserTolerance?: number;
  backgroundEraserContiguous?: boolean;
  backgroundEraserSampling?: 'once' | 'continuous';
  backgroundEraserUseBackgroundSwatch?: boolean;
  backgroundEraserLimits?: 'contiguous' | 'discontiguous';
  backgroundEraserProtectForeground?: boolean;
}

export type RetouchSampleMode = 'currentLayer' | 'currentAndBelow' | 'allLayers';
export type RetouchToneRange = 'all' | 'shadows' | 'midtones' | 'highlights';

export interface RetouchToolSettings {
  sampleMode: RetouchSampleMode;
  aligned: boolean;
  outputMode: 'activeLayer' | 'newLayer';
  toneRange: RetouchToneRange;
  protectTones: boolean;
  spongeVibrance: number;
  spongePreserveLuminosity: boolean;
  airbrush: boolean;
  rate: number;
}

export interface QuickMaskSettings {
  enabled: boolean;
  viewMode: QuickMaskViewMode;
  overlayOpacity: number;
}

export interface SelectAndMaskSettings {
  enabled: boolean;
  previewMode: SelectAndMaskPreviewMode;
  smooth: number;
  feather: number;
  contrast: number;
  shiftEdge: number;
  refineRadius: number;
  decontaminateColors: boolean;
  decontaminateAmount: number;
  outputMode: SelectAndMaskOutputMode;
}

export type GradientToolMode = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
export type GradientToolColorMode = 'foregroundToTransparent' | 'foregroundToBackground' | 'multiStop';
export type VectorShapeKind = 'rect' | 'ellipse' | 'path';

export interface GradientToolColorStop {
  offset: number;
  color: string;
  opacity?: number;
}

export interface GradientToolPreset {
  id: string;
  label: string;
  colorStops: GradientToolColorStop[];
}

export interface GradientToolSettings {
  mode: GradientToolMode;
  colorMode: GradientToolColorMode;
  reverse: boolean;
  dither: boolean;
  presetId?: string;
  colorStops?: GradientToolColorStop[];
}

export type CustomVectorShapePresetKind = 'line' | 'triangle' | 'diamond' | 'polygon' | 'star';
export type ShapeToolPresetKind = 'rect' | CustomVectorShapePresetKind;

export interface CustomVectorShapePreset {
  kind: CustomVectorShapePresetKind;
  polygonSides?: number;
  starInnerRadius?: number;
}

export interface VectorShapeStyle {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
}

export interface ShapeToolSettings extends VectorShapeStyle {
  presetKind: ShapeToolPresetKind;
  polygonSides: number;
  starInnerRadius: number;
}

export interface ImageVectorPathPoint {
  x: number;
  y: number;
  inHandle?: {
    x: number;
    y: number;
  };
  outHandle?: {
    x: number;
    y: number;
  };
}

export interface TextLayerPathReferenceMetadata {
  kind: 'vector-layer' | 'svg-path' | 'external-path';
  layerId?: string;
  pathId?: string;
  revision?: number;
  sourceId?: string;
}

export interface TextLayerBezierSegment {
  from: ImageVectorPathPoint;
  control1: ImageVectorPathPoint;
  control2: ImageVectorPathPoint;
  to: ImageVectorPathPoint;
}

export interface TextLayerPathLayout {
  sourceLayerId?: string;
  geometry?: 'straight-segment-path' | 'bezier-sampled-path';
  points: ImageVectorPathPoint[];
  bezierSegments?: TextLayerBezierSegment[];
  closed: boolean;
  startOffset: number;
  reverse: boolean;
  pathLength: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  previewSignature: string;
}

export interface ImageVectorShapeBase extends VectorShapeStyle {
  width: number;
  height: number;
}

export interface ImageRectVectorShape extends ImageVectorShapeBase {
  kind: 'rect';
}

export interface ImageEllipseVectorShape extends ImageVectorShapeBase {
  kind: 'ellipse';
}

export interface ImagePathVectorShape extends ImageVectorShapeBase {
  kind: 'path';
  points: ImageVectorPathPoint[];
  closed: boolean;
  preset?: CustomVectorShapePreset;
}

export type ImageVectorShape =
  | ImageRectVectorShape
  | ImageEllipseVectorShape
  | ImagePathVectorShape;

export type CropAspectPreset =
  | 'free'
  | 'original'
  | '1:1'
  | '4:3'
  | '3:2'
  | '4:5'
  | '16:9'
  // User-saved custom aspect ratios, encoded as `custom:<width/height>`.
  | `custom:${number}`;
export type CropGuideMode = 'none' | 'thirds' | 'grid';

export interface CropToolSettings {
  aspectPreset: CropAspectPreset;
  guideMode: CropGuideMode;
  deleteCroppedPixels: boolean;
  rotationDeg: number;
}

export interface TextLayerOpenTypeFeatures {
  enabled: string[];
  disabled: string[];
  unsupported?: string[];
}

export interface TextLayerStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  fontKerning: 'auto' | 'normal' | 'none';
  fontVariantCaps: 'normal' | 'small-caps' | 'all-small-caps';
  letterSpacing: number;
  baselineShift: number;
  boxWidth: number | null;
  boxHeight: number | null;
  wrap: boolean;
  color: string;
  lineHeight: number;
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  orientation?: 'horizontal' | 'vertical-rl' | 'vertical-lr';
  warp: 'none' | 'arc' | 'flag';
  openTypeFeatures?: TextLayerOpenTypeFeatures;
  pathReference?: TextLayerPathReferenceMetadata | null;
  pathLayout?: TextLayerPathLayout | null;
}

/**
 * Opaque pixel buffer for a layer. In the browser this is an OffscreenCanvas.
 * Helpers for cloning, blitting, etc. live in `src/components/ImageEditor/LayerBitmap.ts`.
 * Tests can use `null` where bitmap content isn't relevant.
 */
export type LayerBitmap = OffscreenCanvas;

export interface ImageLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  locks?: ImageLayerLocks;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  rotationDeg?: number;
  skewXDeg?: number;
  skewYDeg?: number;
  perspectiveX?: number;
  perspectiveY?: number;
  warp?: ImageLayerWarpOffsets;
  /** Photoshop-style interactive warp: a grid of normalized control-point displacements. */
  warpMesh?: WarpMesh | null;
  cornerOffsets?: ImageLayerTransformCornerOffsets;
  transformOriginX?: number;
  transformOriginY?: number;
  bitmap: LayerBitmap | null;
  bitmapVersion: number;
  mask: LayerBitmap | null;
  maskDensity?: number;
  maskFeather?: number;
  text?: TextLayerStyle;
  adjustment?: ImageAdjustmentSettings;
  effects?: ImageLayerEffect[];
  filters?: ImageLayerFilter[];
  colorLabel?: ImageLayerColorLabel;
  clippingMask?: boolean;
  groupId?: string;
  groupExpanded?: boolean;
  linkGroupId?: string;
  metadata?: ImageLayerMetadata;
  vectorRecipe?: string;
}

export interface DocumentViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export type ImageColorProofMode = 'rgb' | 'grayscale-soft-proof' | 'cmyk-soft-proof';
export type ImageColorProofIntent = 'screen-rgb' | 'grayscale-luminance' | 'relative-colorimetric' | 'perceptual';
export type ImageArtboardPagePreset = 'custom' | 'us-letter' | 'us-legal' | 'tabloid' | 'a4' | 'a5' | 'comic-book';

export interface ImageColorProofMetadata {
  mode: ImageColorProofMode;
  intent: ImageColorProofIntent;
  profileLabel?: string;
}

export interface ImageArtboardPageMetadata {
  preset: ImageArtboardPagePreset;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  dpi: number;
}

export interface ImageArtboardMetadata {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  proofLabel?: string;
  page: ImageArtboardPageMetadata;
}

export interface ImageArtboardsMetadata {
  activeArtboardId?: string;
  artboards: ImageArtboardMetadata[];
}

/** A single ruler guide line. `axis: 'x'` is a vertical guide at document x = position. */
export interface ImageGuide {
  id: string;
  axis: 'x' | 'y';
  position: number;
}

export interface ImageDocument {
  id: string;
  title: string;
  width: number;
  height: number;
  layers: ImageLayer[];
  activeLayerId: string | null;
  /** Multi-selection for linked transforms; always includes activeLayerId. Absent = just the active layer. */
  selectedLayerIds?: string[];
  activeLayerEditTarget?: ImageLayerEditTarget;
  activeColorChannel?: ImageColorChannel;
  hasSelection: boolean;
  selectionVersion: number;
  viewport: DocumentViewport;
  guides?: ImageGuide[];
  dirty: boolean;
  sourceBinItemId?: string;
  savedSelectionChannels?: ImageSavedSelectionChannel[];
  spotChannels?: ImageSpotChannel[];
  metadata?: {
    sourceFormat?: string;
    sourceMimeType?: string;
    sourceBitDepth?: 8 | 16 | 32;
    warnings?: string[];
    colorProof?: ImageColorProofMetadata;
    artboards?: ImageArtboardsMetadata;
  };
  snapshots?: ImageDocumentSnapshot[];
}

export interface ImageDocumentSnapshot {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  width: number;
  height: number;
  layers: ImageLayer[];
  activeLayerId: string | null;
  hasSelection: boolean;
  selectionVersion: number;
}

export interface SelectionMaskSnapshot {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageSavedSelectionChannel {
  id: string;
  name: string;
  width: number;
  height: number;
  dataBase64: string;
  createdAt: number;
}

export interface ImageSpotChannelColor {
  r: number;
  g: number;
  b: number;
}

export interface ImageSpotChannel {
  id: string;
  name: string;
  width: number;
  height: number;
  color: ImageSpotChannelColor;
  opacity: number;
  solidity: number;
  visible: boolean;
  dataBase64: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ImageQuickActionMacroStep {
  actionId: string;
}

export interface ImageQuickActionMacro {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  steps: ImageQuickActionMacroStep[];
}

export interface ImageLayerTransformState {
  x: number;
  y: number;
  rotationDeg?: number;
  skewXDeg?: number;
  skewYDeg?: number;
  perspectiveX?: number;
  perspectiveY?: number;
  warp?: ImageLayerWarpOffsets;
  cornerOffsets?: ImageLayerTransformCornerOffsets;
  transformOriginX?: number;
  transformOriginY?: number;
}

export type EditorOperation =
  | {
      kind: 'paint';
      docId: string;
      layerId: string;
      paintTarget?: ImageLayerEditTarget;
      before: LayerBitmap | null;
      after: LayerBitmap | null;
    }
  | {
      kind: 'selection';
      docId: string;
      before: SelectionMaskSnapshot | null;
      after: SelectionMaskSnapshot | null;
    }
  | {
      kind: 'transform';
      docId: string;
      layerId: string;
      before: ImageLayerTransformState;
      after: ImageLayerTransformState;
    }
  | {
      kind: 'layerOp';
      docId: string;
      before: ImageLayer[];
      after: ImageLayer[];
    }
  | {
      kind: 'docResize';
      docId: string;
      before: { width: number; height: number; layers: ImageLayer[]; activeLayerId?: string | null };
      after: { width: number; height: number; layers: ImageLayer[]; activeLayerId?: string | null };
    }
  | {
      kind: 'documentState';
      docId: string;
      before: ImageDocument;
      after: ImageDocument;
    };

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  presetId: 'softRound',
  size: 12,
  opacity: 1,
  hardness: 0.8,
  flow: 1,
  color: '#ffffff',
  spacing: 0.12,
  angleDeg: 0,
  roundness: 1,
  scatter: 0,
  smoothing: 0.15,
  pressureSize: 0.65,
  pressureOpacity: 0,
  pressureFlow: 0.35,
  pressureCurve: 'linear',
  tiltAngle: 0.7,
  tiltRoundness: 0.6,
  tiltSize: 0.2,
  rotationFollowsTwist: true,
  pressureColor: 0,
  tiltColor: 0,
  tipShape: 'round',
  symmetryMode: 'none',
  velocitySize: 0,
  velocityOpacity: 0,
  velocityFlow: 0,
  velocitySpacing: 0,
  texture: undefined,
  textureScale: 1,
  textureDepth: 0,
  dualBrush: false,
  wetEdges: false,
  wetMedia: false,
  wetMix: 0,
  wetLoad: 1,
  wetPull: 0,
  gpuBrushEngine: true,
  gpuAcceleration: true,
  androidBrushControls: false,
  androidStylusControls: false,
  gamepadBrushControls: false,
  gamepadPressure: false,
  abrSourceHash: undefined,
  abrPresetId: undefined,
  abrVersion: undefined,
};

export const DEFAULT_SELECTION_TOOL_SETTINGS: SelectionToolSettings = {
  mode: 'replace',
  feather: 0,
  antiAlias: true,
  marqueeShape: 'rectangle',
  lassoShape: 'freehand',
  magicWandTolerance: 32,
  sampleAllLayers: true,
  contiguous: true,
  paintBucketBlendMode: 'normal',
  paintBucketPreserveTransparency: false,
  backgroundEraserTolerance: 32,
  backgroundEraserContiguous: true,
  backgroundEraserSampling: 'once',
  backgroundEraserUseBackgroundSwatch: false,
  backgroundEraserLimits: 'contiguous',
  backgroundEraserProtectForeground: false,
};

export const DEFAULT_RETOUCH_TOOL_SETTINGS: RetouchToolSettings = {
  sampleMode: 'currentLayer',
  aligned: true,
  outputMode: 'activeLayer',
  toneRange: 'midtones',
  protectTones: true,
  spongeVibrance: 0.65,
  spongePreserveLuminosity: true,
  airbrush: false,
  rate: 0.5,
};

export const DEFAULT_QUICK_MASK_SETTINGS: QuickMaskSettings = {
  enabled: false,
  viewMode: 'maskedAreas',
  overlayOpacity: 0.5,
};

export const DEFAULT_SELECT_AND_MASK_SETTINGS: SelectAndMaskSettings = {
  enabled: false,
  previewMode: 'maskedAreas',
  smooth: 0,
  feather: 0,
  contrast: 0,
  shiftEdge: 0,
  refineRadius: 0,
  decontaminateColors: false,
  decontaminateAmount: 0,
  outputMode: 'selection',
};

export const DEFAULT_GRADIENT_TOOL_SETTINGS: GradientToolSettings = {
  mode: 'linear',
  colorMode: 'foregroundToTransparent',
  reverse: false,
  dither: false,
};

export const STANDARD_GRADIENT_TOOL_PRESETS: GradientToolPreset[] = [
  {
    id: 'warm-sunset',
    label: 'Warm Sunset',
    colorStops: [
      { offset: 0, color: '#2d1b69', opacity: 1 },
      { offset: 0.35, color: '#f97316', opacity: 0.86 },
      { offset: 1, color: '#fde68a', opacity: 1 },
    ],
  },
  {
    id: 'cool-dawn',
    label: 'Cool Dawn',
    colorStops: [
      { offset: 0, color: '#0f172a', opacity: 1 },
      { offset: 0.52, color: '#38bdf8', opacity: 0.82 },
      { offset: 1, color: '#e0f2fe', opacity: 1 },
    ],
  },
  {
    id: 'neon-magenta-cyan',
    label: 'Neon Magenta / Cyan',
    colorStops: [
      { offset: 0, color: '#ff00aa', opacity: 1 },
      { offset: 0.5, color: '#7c3aed', opacity: 0.78 },
      { offset: 1, color: '#22d3ee', opacity: 1 },
    ],
  },
  {
    id: 'ink-wash',
    label: 'Ink Wash',
    colorStops: [
      { offset: 0, color: '#111827', opacity: 0.96 },
      { offset: 0.48, color: '#64748b', opacity: 0.58 },
      { offset: 1, color: '#f8fafc', opacity: 0.18 },
    ],
  },
];

export const DEFAULT_SHAPE_TOOL_SETTINGS: ShapeToolSettings = {
  fillColor: '#ffffff',
  fillOpacity: 1,
  strokeColor: '#000000',
  strokeOpacity: 1,
  strokeWidth: 0,
  presetKind: 'rect',
  polygonSides: 6,
  starInnerRadius: 0.5,
};

export const DEFAULT_CROP_TOOL_SETTINGS: CropToolSettings = {
  aspectPreset: 'free',
  guideMode: 'thirds',
  deleteCroppedPixels: false,
  rotationDeg: 0,
};

export const DEFAULT_TEXT_TOOL_SETTINGS: TextLayerStyle = {
  content: 'Text',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 48,
  fontWeight: '400',
  fontStyle: 'normal',
  fontKerning: 'auto',
  fontVariantCaps: 'normal',
  letterSpacing: 0,
  baselineShift: 0,
  boxWidth: null,
  boxHeight: null,
  wrap: true,
  color: '#ffffff',
  lineHeight: 1.15,
  align: 'left',
  verticalAlign: 'top',
  warp: 'none',
};

export const DEFAULT_VIEWPORT: DocumentViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
};
