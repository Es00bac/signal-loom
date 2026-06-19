import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperComicSfxDesign } from '../lib/paperComicSfx';
import type { PaperSwatch } from '../lib/paperSwatches';

export type PaperPagePreset =
  | 'custom'
  | 'us-letter'
  | 'us-legal'
  | 'tabloid'
  | 'a4'
  | 'a5'
  | 'square-8'
  | 'comic-book'
  | 'manga-digest'
  | 'webtoon-panel';
export type PaperTool =
  | 'select'
  | 'hand'
  | 'text'
  | 'image'
  | 'speech'
  | 'thought'
  | 'caption'
  | 'panel'
  | 'shape'
  | 'line'
  | 'ellipse'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'eyedropper'
  | 'gutterKnife';
export type PaperFrameKind = 'text' | 'image' | 'document' | 'speechBubble' | 'thoughtBubble' | 'caption' | 'panel' | 'shape';
export type PaperShapeKind = 'polygon' | 'line' | 'ellipse' | 'triangle' | 'pentagon' | 'hexagon';
export type PaperTextAlign = 'left' | 'center' | 'right' | 'justify';
export type PaperAssetFit = 'contain' | 'cover' | 'stretch';
export type PaperStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge';
export type PaperBubbleShape = 'oval' | 'organic' | 'squircle' | 'cloud';
export type PaperBubbleConnectorStyle = 'line' | 'tail' | 'thought-dots' | 'bridge';
export type PaperBubbleConnectorAnchor = 'auto' | 'left' | 'right' | 'top' | 'bottom';
export type PaperTextVerticalAlign = 'top' | 'middle' | 'bottom';
export type PaperBackgroundType = 'solid' | 'linear-gradient' | 'radial-gradient';
export type PaperStyleKind = 'paragraph' | 'character' | 'object';
export type PaperPdfStandard = 'browser-pdf' | 'pdf-x-4' | 'pdf-x-1a';
export type PaperOutputIntentProfileId =
  | 'srgb'
  | 'gracol-2013-coated'
  | 'swop-coated-v2'
  | 'pso-coated-v3-fogra51'
  | 'pso-uncoated-v3-fogra52'
  | 'custom';
export type PaperBlackPolicy = 'warn-rich-black' | 'force-100k-text' | 'allow-rich-black';
export type PaperSpotColorPolicy = 'warn' | 'convert-process' | 'preserve-named';

export interface PaperPageSpec {
  preset: PaperPagePreset;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  dpi: number;
}

export interface PaperMarginSpec {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PaperColumnSpec {
  count: number;
  gutterMm: number;
}

export interface PaperGridSpec {
  enabled: boolean;
  sizeMm: number;
  subdivisions: number;
}

export interface PaperBackgroundSpec {
  type: PaperBackgroundType;
  color: string;
  fromColor: string;
  toColor: string;
  angleDeg: number;
  radialShape: 'circle' | 'ellipse';
}

export interface PaperPrintProductionSpec {
  pdfStandard: PaperPdfStandard;
  outputIntentProfileId: PaperOutputIntentProfileId;
  customOutputIntentName: string;
  totalInkLimitPercent: number;
  blackPolicy: PaperBlackPolicy;
  spotColorPolicy: PaperSpotColorPolicy;
  overprintPreview: boolean;
}

export interface PaperGuide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  positionMm: number;
  label?: string;
}

export type PaperTextAlignLast = 'auto' | 'left' | 'center' | 'right' | 'justify';
export type PaperNumericStyle = 'normal' | 'oldstyle' | 'lining' | 'tabular';

export interface PaperTypography {
  fontFamily: string;
  fontSizePt: number;
  leadingPt: number;
  tracking: number;
  align: PaperTextAlign;
  hyphenate: boolean;
  color: string;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  /** First-line indent (mm) applied to each paragraph (CSS text-indent each-line). */
  firstLineIndentMm?: number;
  /** Alignment of the last line of justified paragraphs (CSS text-align-last). */
  alignLast?: PaperTextAlignLast;
  /** OpenType small caps (CSS font-variant-caps: small-caps). */
  smallCaps?: boolean;
  /** OpenType figure style (CSS font-variant-numeric). */
  numericStyle?: PaperNumericStyle;
}

export interface PaperFrameAsset {
  sourceBinItemId?: string;
  label: string;
  kind: SourceBinLibraryItem['kind'];
  src?: string;
  mimeType?: string;
  text?: string;
  format?: string;
  pageCount?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  embeddedAt?: number;
}

export interface PaperFrameGradient {
  type: 'linear';
  fromColor: string;
  toColor: string;
  angleDeg: number;
}

export interface PaperFrameVertex {
  xPercent: number;
  yPercent: number;
}

/** How surrounding text flows around this frame (the obstacle). */
export type PaperTextWrapMode = 'none' | 'boundingBox' | 'jumpObject' | 'contour';

export interface PaperTextWrap {
  mode: PaperTextWrapMode;
  /** Gap (mm) kept clear between the wrapped text and this frame on every side. */
  standoffMm: number;
  /** For contour wrap: trace the frame's own shape (vertices/ellipse) or just its vertices. */
  contourSource?: 'frameShape' | 'vertices';
}

export interface PaperFrame {
  id: string;
  kind: PaperFrameKind;
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  locked: boolean;
  text?: string;
  asset?: PaperFrameAsset;
  fit: PaperAssetFit;
  imageScale: number;
  imageOffsetXPercent: number;
  imageOffsetYPercent: number;
  imageRotationDeg: number;
  imageFlipX?: boolean;
  imageFlipY?: boolean;
  columns: number;
  columnGutterMm?: number;
  columnRule?: boolean;
  columnBalance?: boolean;
  threadId?: string;
  threadOrder?: number;
  typography: PaperTypography;
  fillColor: string;
  fillOpacity: number;
  fillGradient?: PaperFrameGradient;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidthMm: number;
  strokeStyle: PaperStrokeStyle;
  cornerRadiusMm: number;
  opacity: number;
  shapeKind?: PaperShapeKind;
  textBoxXPercent: number;
  textBoxYPercent: number;
  textBoxWidthPercent: number;
  textBoxHeightPercent: number;
  textRotationDeg: number;
  textVerticalAlign: PaperTextVerticalAlign;
  textStrokeColor?: string;
  textStrokeWidthMm?: number;
  textShadowColor?: string;
  textShadowOffsetXMm?: number;
  textShadowOffsetYMm?: number;
  textShadowBlurMm?: number;
  textSkewXDeg?: number;
  textSkewYDeg?: number;
  textScaleX?: number;
  textScaleY?: number;
  bubbleShape?: PaperBubbleShape;
  bubbleWarp?: number;
  bubblePinchXPercent?: number;
  bubblePinchYPercent?: number;
  bubbleTailWidthPercent?: number;
  bubbleTailCurvePercent?: number;
  bubbleChainId?: string;
  bubbleChainOrder?: number;
  bubbleConnectorStyle?: PaperBubbleConnectorStyle;
  bubbleConnectorAnchor?: PaperBubbleConnectorAnchor;
  comicSfxDesign?: PaperComicSfxDesign;
  vertices?: PaperFrameVertex[];
  textWrap?: PaperTextWrap;
  tailXPercent?: number;
  tailYPercent?: number;
  zIndex: number;
  paragraphStyleId?: string;
  characterStyleId?: string;
  objectStyleId?: string;
  parentPageId?: string;
  parentFrameId?: string;
  inherited?: boolean;
}

export type PaperFramePatch = Partial<Omit<PaperFrame, 'typography'>> & {
  typography?: Partial<PaperTypography>;
};

export interface PaperPage {
  id: string;
  pageNumber: number;
  frames: PaperFrame[];
  guides: PaperGuide[];
  parentPageId?: string;
}

export interface PaperParentPage {
  id: string;
  name: string;
  frames: PaperFrame[];
  guides: PaperGuide[];
}

export interface PaperParagraphStyle {
  id: string;
  name: string;
  basedOnId?: string;
  typography: Partial<PaperTypography>;
  columns?: number;
}

export interface PaperCharacterStyle {
  id: string;
  name: string;
  basedOnId?: string;
  typography: Partial<PaperTypography>;
}

export interface PaperObjectStyle {
  id: string;
  name: string;
  basedOnId?: string;
  frame: Partial<Pick<PaperFrame,
    'fillColor' | 'fillOpacity' | 'fillGradient' | 'strokeColor' | 'strokeOpacity' | 'strokeWidthMm' | 'strokeStyle' | 'cornerRadiusMm' | 'opacity' | 'textBoxXPercent' | 'textBoxYPercent' | 'textBoxWidthPercent' | 'textBoxHeightPercent' | 'textVerticalAlign'
  >>;
}

export interface PaperStyleCatalogs {
  paragraph: PaperParagraphStyle[];
  character: PaperCharacterStyle[];
  object: PaperObjectStyle[];
}

export interface PaperDocument {
  id: string;
  title: string;
  page: PaperPageSpec;
  layout: {
    marginsMm: PaperMarginSpec;
    columns: PaperColumnSpec;
    grid: PaperGridSpec;
  };
  background: PaperBackgroundSpec;
  printProduction: PaperPrintProductionSpec;
  view: {
    showRulers: boolean;
    showGrid: boolean;
    showGuides: boolean;
    showBleed: boolean;
    showSpreads: boolean;
    startOnRight: boolean;
    snapToGuides: boolean;
    snapToGrid: boolean;
  };
  parentPages: PaperParentPage[];
  styles: PaperStyleCatalogs;
  /** Document swatch library (custom CMYK/spot/process colors) layered on the built-in defaults. */
  swatches?: PaperSwatch[];
  pages: PaperPage[];
  createdAt: number;
  updatedAt: number;
}

export interface PaperDocumentSnapshot {
  document: PaperDocument;
  selectedPageId?: string;
  selectedFrameId?: string;
  selectedFrameIds?: string[];
  tool: PaperTool;
  zoom: number;
}
