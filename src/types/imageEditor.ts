import type { PaperComicSfxDesign } from '../lib/paperComicSfx';

export type EditorTool =
  | 'hand'
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'magicWand'
  | 'brush'
  | 'eraser'
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
export type LassoShape = 'freehand' | 'polygonal';

export type LayerType = 'image' | 'mask' | 'text' | 'adjustment' | 'vector';

export type LayerEffectKind = 'stroke' | 'dropShadow' | 'outerGlow' | 'colorOverlay';
export type LayerFilterKind = 'blur' | 'sharpen' | 'grayscale' | 'sepia' | 'invert' | 'noise' | 'pixelate';

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

export interface OuterGlowLayerEffect extends BaseLayerEffect {
  kind: 'outerGlow';
  color: string;
  opacity: number;
  size: number;
}

export interface ColorOverlayLayerEffect extends BaseLayerEffect {
  kind: 'colorOverlay';
  color: string;
  opacity: number;
}

export type ImageLayerEffect =
  | StrokeLayerEffect
  | DropShadowLayerEffect
  | OuterGlowLayerEffect
  | ColorOverlayLayerEffect;

export interface ImageLayerFilter {
  id: string;
  kind: LayerFilterKind;
  enabled: boolean;
  amount: number;
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
  comicSfxDesign?: PaperComicSfxDesign;
  smartLinkedSourceId?: string;
  sourceLabel?: string;
  sourceLink?: ImageSourceLinkMetadata;
  sourceFormat?: string;
  sourceMimeType?: string;
  sourceWarnings?: string[];
  originalSvgSource?: string;
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
  tipShape: 'round' | 'square';
}

export interface SelectionToolSettings {
  mode: SelectionMode;
  feather: number;
  antiAlias: boolean;
  marqueeShape: MarqueeShape;
  lassoShape: LassoShape;
  magicWandTolerance: number;
}

export interface TextLayerStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  letterSpacing: number;
  boxWidth: number | null;
  boxHeight: number | null;
  wrap: boolean;
  color: string;
  lineHeight: number;
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  warp: 'none' | 'arc' | 'flag';
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
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  rotationDeg?: number;
  bitmap: LayerBitmap | null;
  bitmapVersion: number;
  mask: LayerBitmap | null;
  text?: TextLayerStyle;
  adjustment?: ImageAdjustmentSettings;
  effects?: ImageLayerEffect[];
  filters?: ImageLayerFilter[];
  metadata?: ImageLayerMetadata;
  vectorRecipe?: string;
}

export interface DocumentViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface ImageDocument {
  id: string;
  title: string;
  width: number;
  height: number;
  layers: ImageLayer[];
  activeLayerId: string | null;
  hasSelection: boolean;
  selectionVersion: number;
  viewport: DocumentViewport;
  dirty: boolean;
  sourceBinItemId?: string;
  metadata?: {
    sourceFormat?: string;
    sourceMimeType?: string;
    warnings?: string[];
  };
  snapshots?: ImageDocumentSnapshot[];
}

export interface ImageDocumentSnapshot {
  id: string;
  name: string;
  createdAt: number;
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

export type EditorOperation =
  | {
      kind: 'paint';
      docId: string;
      layerId: string;
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
      before: { x: number; y: number; rotationDeg?: number };
      after: { x: number; y: number; rotationDeg?: number };
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
      before: { width: number; height: number; layers: ImageLayer[] };
      after: { width: number; height: number; layers: ImageLayer[] };
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
  tipShape: 'round',
};

export const DEFAULT_SELECTION_TOOL_SETTINGS: SelectionToolSettings = {
  mode: 'replace',
  feather: 0,
  antiAlias: true,
  marqueeShape: 'rectangle',
  lassoShape: 'freehand',
  magicWandTolerance: 32,
};

export const DEFAULT_TEXT_TOOL_SETTINGS: TextLayerStyle = {
  content: 'Text',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 48,
  fontWeight: '400',
  fontStyle: 'normal',
  letterSpacing: 0,
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
