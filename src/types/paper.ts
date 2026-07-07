import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperComicSfxDesign } from '../lib/paperComicSfx';
import type { PaperSwatch } from '../lib/paperSwatches';
import type { PaperTableSpec } from '../lib/paperTables';

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

export interface PaperBaselineGridSpec {
  /** Offset (mm) of the first baseline line from the page top. */
  startMm: number;
  /** Distance (mm) between baseline lines — usually the body leading. */
  incrementMm: number;
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
export type PaperLineBreak = 'auto' | 'balance' | 'pretty';

export interface PaperTypography {
  fontFamily: string;
  fontSizePt: number;
  leadingPt: number;
  tracking: number;
  align: PaperTextAlign;
  hyphenate: boolean;
  color: string;
  /** Durable reference to the swatch the text `color` came from. When it resolves to a SPOT swatch (and the
   * spot policy preserves named spots), the text is drawn as a real /Separation plate instead of process.
   * Auto-cleared whenever `color` changes by any other path (see patchPaperFrame), so it can't go stale. */
  colorSwatchId?: string;
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
  /** Drop-cap height in lines (0 / undefined = no drop cap). */
  dropCapLines?: number;
  /** Space (mm) before each paragraph. */
  spaceBeforeMm?: number;
  /** Space (mm) after each paragraph. */
  spaceAfterMm?: number;
  /** Line-breaking style (CSS text-wrap-style): balanced ragging or orphan-aware "pretty". */
  lineBreak?: PaperLineBreak;
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
  /**
   * Id of the document swatch this fill came from, when it was applied from the swatch library. Kept so a
   * SPOT swatch fill survives to PDF/X export as a real /Separation plate (fillColor alone is just the RGB
   * preview and loses the spot identity). Auto-cleared the moment the fill is changed by any other path.
   */
  fillSwatchId?: string;
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
  /** Curve the text baseline along an arc (-100..100; 0 = straight). Renders via SVG textPath. */
  textArcPercent?: number;
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
  table?: PaperTableSpec;
  /** Optional hyperlink target (URL) — shown on canvas and exported as a link in HTML. */
  hyperlink?: string;
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
    baselineGrid: PaperBaselineGridSpec;
  };
  background: PaperBackgroundSpec;
  printProduction: PaperPrintProductionSpec;
  view: {
    showRulers: boolean;
    showGrid: boolean;
    showBaselineGrid: boolean;
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
  /** User-imported fonts embedded in the document (vetted unbroken + embeddable) so they travel with it. */
  importedFonts?: PaperImportedFont[];
  pages: PaperPage[];
  createdAt: number;
  updatedAt: number;
}

/**
 * A font the user imported into the document. Vetted (unbroken + embeddable) at import time; the raw bytes
 * are carried inline as base64 so the font travels with the .slppr file and can be embedded on export
 * instead of substituting a bundled Liberation face.
 */
export interface PaperImportedFont {
  /** Stable id (embed cache key). */
  id: string;
  /** Font family name as reported by the font (e.g. "Brandon Grotesque"). */
  familyName: string;
  subfamilyName?: string;
  postscriptName?: string;
  bold: boolean;
  italic: boolean;
  format: 'truetype' | 'opentype-cff' | 'collection';
  /** OS/2 fsType permits embedding this face in a print PDF. */
  embeddable: boolean;
  /** OS/2 fsType permits subsetting (false → embed the whole font). */
  canSubset: boolean;
  /** Raw font bytes as base64 (no data: prefix). */
  dataBase64: string;
}

export interface PaperDocumentSnapshot {
  document: PaperDocument;
  selectedPageId?: string;
  selectedFrameId?: string;
  selectedFrameIds?: string[];
  tool: PaperTool;
  zoom: number;
}
