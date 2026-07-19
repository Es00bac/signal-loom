import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { BinaryAssetId, BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
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
  /** Exact managed ICC asset selected for a strict PDF/X or print-ready export. */
  outputIntentProfileAssetId?: BinaryAssetId;
  customOutputIntentName: string;
  totalInkLimitPercent: number;
  blackPolicy: PaperBlackPolicy;
  spotColorPolicy: PaperSpotColorPolicy;
  overprintPreview: boolean;
}

export interface PaperManagedIccProfile {
  /** Content-addressed profile identity. This must equal `asset.id`. */
  id: BinaryAssetId;
  asset: BinaryAssetRef;
  description: string;
  deviceClass: string;
  colorSpace: 'CMYK';
  pcs: 'Lab ' | 'XYZ ';
  outputConditionId: string;
  registryName?: string;
  source: {
    kind: 'bundled' | 'downloaded' | 'user-import';
    url?: string;
    licenseId?: string;
  };
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
  /** OpenType pair kerning. `none` disables the `kern` feature in live composition and print output. */
  fontKerning?: 'auto' | 'normal' | 'none';
  align: PaperTextAlign;
  hyphenate: boolean;
  color: string;
  /** Durable reference to the swatch the text `color` came from. When it resolves to a SPOT swatch (and the
   * spot policy preserves named spots), the text is drawn as a real /Separation plate instead of process.
   * Auto-cleared whenever `color` changes by any other path (see patchPaperFrame), so it can't go stale. */
  colorSwatchId?: string;
  fontWeight: string;
  /** CSS style is durable because oblique is an authored face descriptor, not an italic fallback. */
  fontStyle: 'normal' | 'italic' | `oblique${string}`;
  /** CSS width descriptor. This is part of managed-face selection and may be inherited by runs. */
  fontStretch?: string;
  /** Exact variable-font coordinates used for composition (for example `opsz: 12`). */
  fontVariationSettings?: Record<string, number>;
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
  /** Writing direction. `vertical-rl` is Japanese 縦書き (tategaki): glyphs run top→bottom, lines/columns
   * right→left — the default for manga lettering and Japanese book/文芸 typesetting. Absent = horizontal. */
  writingMode?: PaperWritingMode;
  /** How upright vs. rotated each character sits in vertical text (CSS text-orientation). `mixed` keeps CJK
   * upright and rotates Latin (normal 縦組); `upright` forces every glyph upright (used for short Latin runs). */
  textOrientation?: PaperTextOrientation;
  /** Apply strict Japanese line-breaking (禁則処理 / CSS `line-break: strict`): kinsoku characters like 、。」
   * never start a line and 「（ never end one. On by default for vertical text. */
  lineBreakStrict?: boolean;
  /** 圏点 / bouten emphasis marks drawn beside every glyph (CSS text-emphasis) — the Japanese counterpart of
   * italic/bold for stressing a word. Frame-level (whole frame), which suits short emphasis captions, manga SFX,
   * and headings; per-run emphasis on specific words is Phase 2. Absent/`none` = no marks. */
  emphasis?: PaperEmphasisMark;
}

/** Writing direction of a text frame. */
export type PaperWritingMode = 'horizontal-tb' | 'vertical-rl';
/** Character orientation within vertical text. */
export type PaperTextOrientation = 'mixed' | 'upright';
/** 圏点 emphasis-mark shape (maps to CSS text-emphasis-style). `sesame` is the traditional teardrop ゴマ点. */
export type PaperEmphasisMark = 'none' | 'dot' | 'open-dot' | 'sesame' | 'circle';

/** Baseline shift for a run — normal text, superscript, or subscript. */
export type PaperTextVertAlign = 'baseline' | 'super' | 'sub';

/**
 * One inline run of text with optional per-run style overrides. Any field left unset inherits the frame's
 * paragraph typography, so a run only carries what it actually changes (a bold word, a colour, a font swap).
 * This is what lets a single paragraph mix styles — the thing a uniform `text` + one `typography` can't do.
 */
export interface PaperTextRun {
  /** Historical/imported rich-text ids are retained when supplied. */
  id?: string;
  text: string;
  fontFamily?: string;
  fontSizePt?: number;
  /** Per-selection leading. Browsers resolve this into the line box touched by the run. */
  leadingPt?: number;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic' | `oblique${string}`;
  fontStretch?: string;
  fontVariationSettings?: Record<string, number>;
  fontKerning?: 'auto' | 'normal' | 'none';
  underline?: boolean;
  strike?: boolean;
  color?: string;
  /** Background / highlight colour behind the run (Word highlight or run shading — e.g. yellow highlight,
   * or black for "inverse video" white-on-black). */
  highlight?: string;
  /** Letter-spacing in per-mille em (matches PaperTypography.tracking units). */
  tracking?: number;
  smallCaps?: boolean;
  numericStyle?: PaperNumericStyle;
  textOrientation?: PaperTextOrientation;
  emphasis?: PaperEmphasisMark;
  vertAlign?: PaperTextVertAlign;
  /** External hyperlink for just this run. */
  link?: string;
}

/**
 * One paragraph of rich text: an ordered list of runs plus optional paragraph-level overrides. Unset
 * paragraph fields inherit the frame's typography, so a plain paragraph is just `{ runs: [{ text }] }`.
 */
/** One edge of a paragraph border (`<w:pBdr>`). */
export interface PaperParagraphBorderEdge {
  /** `#rrggbb`, or `'currentColor'` when the source used auto / the text colour. */
  color: string;
  /** Border weight in points. */
  widthPt: number;
}

/** Per-edge paragraph borders + the padding between text and the border edges (Word `w:pBdr` / `w:space`). */
export interface PaperParagraphBorders {
  top?: PaperParagraphBorderEdge;
  left?: PaperParagraphBorderEdge;
  bottom?: PaperParagraphBorderEdge;
  right?: PaperParagraphBorderEdge;
  /** Padding (pt) between the text and its border edges. */
  paddingPt?: number;
}

export interface PaperRichParagraph {
  /** Preserved import/editor identifier; paragraph identity is never used as a font fallback. */
  id?: string;
  runs: PaperTextRun[];
  align?: PaperTextAlign;
  alignLast?: PaperTextAlignLast;
  leadingPt?: number;
  hyphenate?: boolean;
  lineBreak?: PaperLineBreak;
  lineBreakStrict?: boolean;
  firstLineIndentMm?: number;
  spaceBeforeMm?: number;
  spaceAfterMm?: number;
  /** Drop-cap height in lines for this paragraph (0 / undefined = none). */
  dropCapLines?: number;
  /** A pre-resolved list marker ("•", "1.") rendered as a hanging bullet; undefined = not a list item. */
  listMarker?: string;
  /** Paragraph background fill (`#rrggbb`) from `<w:pPr><w:shd w:fill>`. */
  shading?: string;
  /** Per-edge paragraph borders from `<w:pBdr>`. */
  borders?: PaperParagraphBorders;
  /** Whole-paragraph left indent (mm) from `<w:ind w:left/start>`. */
  leftIndentMm?: number;
  /** Whole-paragraph right indent (mm) from `<w:ind w:right/end>` — insets the paragraph (and any shading/
   * border box) from the right margin, so callouts/pull quotes read as inset blocks, not full-width bands. */
  rightIndentMm?: number;
  /** Hanging indent (mm) — the first line out-dents by this from the left indent (`<w:ind w:hanging>`). */
  hangingIndentMm?: number;
}

export interface PaperFrameAsset {
  sourceBinItemId?: string;
  label: string;
  kind: SourceBinLibraryItem['kind'];
  /** Binary bytes live in project/Paper asset storage, never in Paper JSON. */
  locator?: PaperManagedAssetLocator;
  mimeType?: string;
  text?: string;
  format?: string;
  pageCount?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  /** Provider-reported output evidence for a managed Stability upscale. */
  printUpscale?: PaperStabilityPrintUpscaleEvidence;
  embeddedAt?: number;
}

export interface PaperStabilityPrintUpscaleEvidence {
  provider: 'stability';
  mode: 'fast' | 'conservative';
  providerWidthPx: number;
  providerHeightPx: number;
  effectivePpi: number;
  requiredPpi: number;
  printReady: boolean;
}

export type PaperManagedAssetLocator =
  | { kind: 'managed'; ref: BinaryAssetRef }
  | { kind: 'external'; url: string };

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
  /**
   * Optional inline-rich content. When present it is the AUTHORITATIVE text (paragraphs of styled runs), and
   * `text` is kept as its flattened plaintext for search, threading, and any consumer that only understands
   * plain text. Absent → the frame is uniform single-style text exactly as before (comics, bubbles, captions
   * and every existing frame are unaffected). Only inline text frames (text/caption/bubbles) use it.
   */
  richText?: PaperRichParagraph[];
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
  /** Ink tint for a swatch-backed fill, in percent (0 = paper, 100 = full ink). Omitted means 100. */
  fillTintPercent?: number;
  fillOpacity: number;
  fillGradient?: PaperFrameGradient;
  strokeColor: string;
  /**
   * Id of the document swatch this stroke came from, when it was applied from the swatch library. Mirrors
   * {@link fillSwatchId} for the border: a SPOT stroke survives to PDF/X export as a real /Separation plate
   * (strokeColor alone is just the RGB preview). Auto-cleared the moment the stroke colour changes by any
   * other path.
   */
  strokeSwatchId?: string;
  /** Ink tint for a swatch-backed stroke, in percent (0 = paper, 100 = full ink). Omitted means 100. */
  strokeTintPercent?: number;
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
  /** Symmetric organic warp (legacy single control; still the fallback for any side left unset). */
  bubbleWarp?: number;
  /** Per-side organic warp. Each edge bulges (+) or pinches (-) on its own. When a side is unset it
   *  falls back to bubbleWarp, so bubbles authored before this existed render identically. Driven by
   *  the four side handles in PaperBubbleHandles / bubbleHandlePatch. */
  bubbleWarpLeft?: number;
  bubbleWarpRight?: number;
  bubbleWarpTop?: number;
  bubbleWarpBottom?: number;
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
    'fillColor' | 'fillTintPercent' | 'fillOpacity' | 'fillGradient' | 'strokeColor' | 'strokeTintPercent' | 'strokeOpacity' | 'strokeWidthMm' | 'strokeStyle' | 'cornerRadiusMm' | 'opacity' | 'textBoxXPercent' | 'textBoxYPercent' | 'textBoxWidthPercent' | 'textBoxHeightPercent' | 'textVerticalAlign'
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
    /** Non-printing line baselines for every text-bearing frame. Exact managed compositions expose their
     * composed baselines; browser/editing previews use the frame's own leading rhythm. */
    showTextBaselines: boolean;
    /** Light, non-printing frame outlines shown only in the editor (like guides/grid) so borderless frames
     * stay easy to see and grab. Never drawn in print/PDF/flatten export. */
    showFrameEdges: boolean;
    showBleed: boolean;
    showSpreads: boolean;
    startOnRight: boolean;
    /** Right-to-left binding (右綴じ) — the reading order of a Japanese/manga book: facing-page spreads put the
     * LOWER page number on the RIGHT and progress right→left, and CBZ/PDF/print exports carry the right-to-left
     * reading-direction metadata. **Undefined = auto**: right-to-left when the document has vertical (縦書き) text,
     * left-to-right otherwise. `true`/`false` pins it explicitly. Resolve via `effectiveRtlBinding(document)`. */
    rtlBinding?: boolean;
    snapToGuides: boolean;
    snapToGrid: boolean;
  };
  parentPages: PaperParentPage[];
  styles: PaperStyleCatalogs;
  /** Document swatch library (custom CMYK/spot/process colors) layered on the built-in defaults. */
  swatches?: PaperSwatch[];
  /** Managed faces referenced by this document. Exact bytes live in the Paper asset repository. */
  importedFonts?: PaperImportedFont[];
  /** Exact CMYK output profiles referenced by this document. Bytes live in the Paper asset repository. */
  managedIccProfiles?: PaperManagedIccProfile[];
  pages: PaperPage[];
  createdAt: number;
  updatedAt: number;
}

export type PaperFontEmbeddability =
  | 'installable'
  | 'print-preview'
  | 'editable'
  | 'restricted'
  | 'bitmap-only'
  | 'unknown';

export type PaperManagedFontStyle = 'normal' | 'italic' | 'oblique';
export type PaperManagedFontFormat = 'truetype' | 'opentype-cff' | 'collection';

export interface PaperFontAttestation {
  acceptedAt: number;
  assetSha256: string;
  mayEmbedOutput: boolean;
  mayPackageEditableProject: boolean;
  statementVersion: 1;
}

export interface PaperManagedFontAxisRange {
  min: number;
  default: number;
  max: number;
}

export interface PaperManagedFontFace {
  /** Stable face identifier used by document dependencies and font embedding. */
  id: string;
  /** Stable normalized family identity. A display name alone is never a production identity. */
  familyId: string;
  familyName: string;
  postscriptName: string;
  weight: number;
  style: PaperManagedFontStyle;
  /** Exact CSS oblique angle. Omitted only for historical documents; oblique defaults to 14deg. */
  obliqueAngleDeg?: number;
  stretchPercent: number;
  collectionIndex: number;
  variableAxes: Record<string, PaperManagedFontAxisRange>;
  /** Default coordinates authored with this face; per-run settings may override these axes. */
  variationSettings?: Record<string, number>;
  unicodeRanges: Array<{ start: number; end: number }>;
  format: PaperManagedFontFormat;
  /** Immutable content-addressed bytes for this exact face. */
  fontAsset: BinaryAssetRef;
  embeddability: PaperFontEmbeddability;
  canSubset: boolean;
  source: { kind: 'bundled' | 'open-catalog' | 'user-import'; url?: string; version?: string };
  license: { id?: string; textAsset?: BinaryAssetRef; attribution?: string };
  /** Required for production embedding when the font's own embedding rights are unknown. */
  attestation?: PaperFontAttestation;
}

/** Historical name retained for document compatibility. New code should use PaperManagedFontFace. */
export type PaperImportedFont = PaperManagedFontFace;

/** One open Paper document tab and its local editor/view state. */
export type PaperDocumentPersistenceKind = 'new' | 'project' | 'standalone';

export interface PaperDocumentPersistenceState {
  kind: PaperDocumentPersistenceKind;
  /** Canonical authored-content fingerprint at the last acknowledged editable save. */
  savedFingerprint?: string;
  /** Native standalone path obtained from an acknowledged Open/Save dialog. */
  path?: string;
}

export interface PaperWorkspaceDocumentSnapshot {
  id: string;
  document: PaperDocument;
  /** Reachable Paper-managed binary records; source-bin links remain identifiers only. */
  assetIds?: BinaryAssetId[];
  selectedPageId?: string;
  selectedFrameId?: string;
  selectedFrameIds?: string[];
  tool: PaperTool;
  zoom: number;
  /** Local-only save provenance. Project validation deliberately omits this from .sloom payloads. */
  persistence?: PaperDocumentPersistenceState;
}

export type PaperDocumentRecoveryReason =
  | 'discard'
  | 'document-replacement'
  | 'project-replacement'
  | 'crash-recovery'
  | 'startup-recovery'
  | 'shutdown'
  | 'baton-handoff';

/** Bounded local recovery copy created before a deliberate destructive Paper action. */
export interface PaperDiscardedDocumentRecovery {
  id: string;
  /** One destructive action may capture many tabs; history is bounded by action batches. */
  batchId?: string;
  reason: PaperDocumentRecoveryReason;
  capturedAt: number;
  originalIndex: number;
  wasActive: boolean;
  snapshot: PaperWorkspaceDocumentSnapshot;
  /**
   * The tab's own history is retained when available so a recovered tab can continue undoing.
   * Session-scoped: stripped from the persisted projection and ignored on rehydrate.
   */
  undoStack?: Array<{
    document: PaperDocument;
    selectedPageId: string;
    selectedFrameId: string | null;
    selectedFrameIds: string[];
    tool: PaperTool;
    zoom: number;
  }>;
  redoStack?: Array<{
    document: PaperDocument;
    selectedPageId: string;
    selectedFrameId: string | null;
    selectedFrameIds: string[];
    tool: PaperTool;
    zoom: number;
  }>;
}

/** A Paper tab that failed restore validation, retained verbatim so the owner can recover it. */
export interface PaperQuarantinedDocumentRecovery {
  /** Position of the tab in the saved `documents` list. */
  index: number;
  id?: string;
  title?: string;
  /** Machine-readable cause, e.g. 'malformed-document' or 'invalid-asset-reference'. */
  reason: string;
  detail?: string;
  /** The original tab entry as saved, serialized for later recovery. */
  payloadJson?: string;
}

/** Restore-time diagnostics: what was quarantined or repaired instead of silently discarded. */
export interface PaperSnapshotRecovery {
  quarantinedDocuments: PaperQuarantinedDocumentRecovery[];
  /** Human-readable notes for inconsistencies that were repaired in place. */
  repairs: string[];
}

export interface PaperDocumentSnapshot extends Omit<PaperWorkspaceDocumentSnapshot, 'id'> {
  /** All Paper documents open in this project. Omitted by historical single-document projects. */
  documents?: PaperWorkspaceDocumentSnapshot[];
  /** Active tab id within `documents`. */
  activeDocumentId?: string;
  /** Present when restore validation quarantined or repaired part of this snapshot. */
  recovery?: PaperSnapshotRecovery;
}
