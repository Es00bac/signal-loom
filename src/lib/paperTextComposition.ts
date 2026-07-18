// Deterministic Paper text composition. This module owns managed-font selection, shaping, line breaking, and
// positioned glyph coordinates; the browser is intentionally not consulted for production layout decisions.

import type {
  PaperDocument,
  PaperFrame,
  PaperManagedFontFace,
  PaperManagedFontStyle,
  PaperParagraphBorders,
  PaperTextAlign,
  PaperTextAlignLast,
  PaperTextRun,
  PaperTypography,
} from '../types/paper';
import { resolvePaperFrameTextContentBoxMm } from './paperDocument';
import { normalizeFamilyName } from './paperFontLibrary';
import { paperFontObliqueAngleFromCss, paperFontStretchFromCss, paperFontStyleFromCss, paperFontWeightFromCss } from './paperExactManagedFonts';
import {
  canUseManagedFontForProduction,
  normalizePaperFontFamilyId,
  normalizePaperFontVariationSettings,
  selectManagedFontFace,
} from './paperManagedFonts';
import {
  canBreakPaperJapaneseAfter,
  canBreakPaperJapaneseBefore,
  tokenizePaperInlineTextWithOffsets,
} from './paperJapaneseText';
import { resolvePaperColumnGutterMm } from './paperColumns';
import { paperRichTextFromPlainText } from './paperRichText';
import { breakPaperTextUnits } from './paperTextLayout';
import type { PaperShapedGlyph, PaperTextShaper } from './paperTextShaper';

const PT_PER_MM = 72 / 25.4;
const DEFAULT_UNITS_PER_EM = 1000;

/** A source paint held before Task 12 resolves it to a typed CMYK/spot paint. */
export interface PaperPrintPaintSource {
  kind: 'css-color';
  color: string;
  swatchId?: string;
}

export interface PaperPositionedGlyphRun {
  /** Exact source text for this shaped run. The PDF writer uses it to embed selectable managed type. */
  text: string;
  face: PaperManagedFontFace;
  fontSizePt: number;
  /** The font's native glyph-path scale, never assumed to be 1000. */
  unitsPerEm: number;
  color: PaperPrintPaintSource;
  /** Coordinates remain attached to the outline request; glyphPath must not reset to defaults. */
  variations?: Record<string, number>;
  glyphs: Array<PaperShapedGlyph & { xPt: number; yPt: number }>;
  sourceStart: number;
  sourceEnd: number;
  /** Position advances include tracking and are useful to the managed SVG/PDF renderers. */
  advanceXPt?: number;
  advanceYPt?: number;
  annotation?: 'ruby';
  decorations?: { underline?: boolean; strike?: boolean; highlight?: string };
}

export interface PaperComposedTextLine {
  text: string;
  originXPt: number;
  originYPt: number;
  widthPt: number;
  runs: PaperPositionedGlyphRun[];
  columnIndex?: number;
  paragraphIndex?: number;
  /** The line box used for paragraph fills/borders and vertical alignment, in frame-local points. */
  layoutBounds?: PaperComposedTextBounds;
}

export interface PaperComposedCaret {
  sourceOffset: number;
  xPt: number;
  yPt: number;
  heightPt: number;
}

export interface PaperComposedTextBounds {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

export interface PaperComposedEmphasisMark {
  xPt: number;
  yPt: number;
  radiusPt: number;
  color: PaperPrintPaintSource;
}

/** Background and border geometry emitted before glyph paths for rich paragraph callouts. */
export interface PaperComposedParagraphBox {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  fill?: PaperPrintPaintSource;
  borders?: PaperParagraphBorders;
}

export interface PaperMissingManagedFace {
  familyId: string;
  weight: number;
  style: PaperManagedFontStyle;
  sourceStart: number;
  sourceEnd: number;
  reason: 'missing-family' | 'missing-face' | 'production-rights' | 'asset-unavailable';
}

export interface PaperComposedTextFrame {
  frameId: string;
  writingMode: 'horizontal-tb' | 'vertical-rl';
  bounds: PaperComposedTextBounds;
  lines: PaperComposedTextLine[];
  caretMap: PaperComposedCaret[];
  overset: boolean;
  missingFaces: PaperMissingManagedFace[];
  missingGlyphs: Array<{ codePoint: number; faceId: string }>;
  emphasisMarks?: PaperComposedEmphasisMark[];
  paragraphBoxes?: PaperComposedParagraphBox[];
}

/** Resolves one exact managed face to the HarfBuzz adapter that owns its bytes. */
export type PaperManagedFontResolver = (face: PaperManagedFontFace) => Promise<PaperTextShaper | undefined>;

interface ResolvedStyle {
  key: string;
  face: PaperManagedFontFace;
  shaper: PaperTextShaper;
  fontSizePt: number;
  leadingPt: number;
  trackingPt: number;
  color: PaperPrintPaintSource;
  direction: 'ltr' | 'rtl' | 'ttb';
  script: string;
  language: string;
  features: Record<string, boolean | number>;
  variations?: Record<string, number>;
  decorations: { underline?: boolean; strike?: boolean; highlight?: string };
  superscriptShiftPt: number;
}

interface CompositionUnit {
  text: string;
  sourceStart: number;
  sourceEnd: number;
  style: ResolvedStyle;
  tcy: boolean;
  emphasis: boolean;
  dropCap?: boolean;
}

interface RubyAnnotation {
  baseSourceStart: number;
  baseSourceEnd: number;
  readingSourceStart: number;
  readingSourceEnd: number;
  reading: string;
  style: ResolvedStyle;
}

interface CompositionParagraph {
  units: CompositionUnit[];
  ruby: RubyAnnotation[];
  align: PaperTextAlign;
  firstLineIndentPt: number;
  leftIndentPt: number;
  rightIndentPt: number;
  hangingIndentPt: number;
  borderPaddingPt: number;
  /** The editor's list-marker hanging lane (4.5 mm), kept in the shared composition geometry. */
  listMarkerPadPt: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  sourceEnd: number;
  borders?: PaperParagraphBorders;
  shading?: string;
  dropCapLines: number;
  alignLast: PaperTextAlignLast;
  leadingPt: number;
  lineBreakStrict: boolean;
}

interface ShapedGroup {
  units: CompositionUnit[];
  style: ResolvedStyle;
  shaped: { glyphs: PaperShapedGlyph[]; advanceX: number; advanceY: number };
  advancePt: number;
}

interface LineDraft {
  units: CompositionUnit[];
  paragraph: CompositionParagraph;
  isParagraphEnd: boolean;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampNonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}


function splitGraphemes(text: string): Array<{ text: string; start: number; end: number }> {
  const maybeIntl = globalThis.Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity?: 'grapheme' }) => {
      segment(input: string): Iterable<{ segment: string; index: number }>;
    };
  };
  if (typeof maybeIntl.Segmenter === 'function') {
    const segmenter = new maybeIntl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((item) => ({
      text: item.segment,
      start: item.index,
      end: item.index + item.segment.length,
    }));
  }
  const segments: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;
  for (const character of Array.from(text)) {
    segments.push({ text: character, start: offset, end: offset + character.length });
    offset += character.length;
  }
  return segments;
}

function firstCodePoint(text: string): number {
  return text.codePointAt(0) ?? 0;
}

function isStrongScriptCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x590 && codePoint <= 0x8ff)
    || (codePoint >= 0xfb1d && codePoint <= 0xfdff)
    || (codePoint >= 0x3040 && codePoint <= 0x30ff)
    || (codePoint >= 0x3400 && codePoint <= 0x9fff)
    || (codePoint >= 0xac00 && codePoint <= 0xd7af)
    || (codePoint >= 0x400 && codePoint <= 0x52f)
    || (codePoint >= 0x41 && codePoint <= 0x5a)
    || (codePoint >= 0x61 && codePoint <= 0x7a)
    || (codePoint >= 0x30 && codePoint <= 0x39);
}

function scriptFor(text: string, vertical: boolean): { direction: 'ltr' | 'rtl' | 'ttb'; script: string; language: string } {
  if (vertical) return { direction: 'ttb', script: 'Hani', language: 'ja' };
  const strong = Array.from(text).find((character) => isStrongScriptCodePoint(firstCodePoint(character)));
  const codePoint = firstCodePoint(strong ?? text);
  if ((codePoint >= 0x590 && codePoint <= 0x5ff) || (codePoint >= 0xfb1d && codePoint <= 0xfb4f)) {
    return { direction: 'rtl', script: 'Hebr', language: 'he' };
  }
  if ((codePoint >= 0x600 && codePoint <= 0x8ff) || (codePoint >= 0xfb50 && codePoint <= 0xfdff)) {
    return { direction: 'rtl', script: 'Arab', language: 'ar' };
  }
  if ((codePoint >= 0x3040 && codePoint <= 0x30ff) || (codePoint >= 0x4e00 && codePoint <= 0x9fff) || (codePoint >= 0x3400 && codePoint <= 0x4dbf)) {
    return { direction: 'ltr', script: 'Hani', language: 'ja' };
  }
  if (codePoint >= 0xac00 && codePoint <= 0xd7af) return { direction: 'ltr', script: 'Hang', language: 'ko' };
  if ((codePoint >= 0x400 && codePoint <= 0x52f) || (codePoint >= 0x2de0 && codePoint <= 0x2dff)) {
    return { direction: 'ltr', script: 'Cyrl', language: 'und' };
  }
  return { direction: 'ltr', script: 'Latn', language: 'en' };
}

function hasStrongScript(text: string): boolean {
  return isStrongScriptCodePoint(firstCodePoint(text));
}

function paperFeatures(typography: PaperTypography, run: PaperTextRun, vertical: boolean): Record<string, boolean | number> {
  const features: Record<string, boolean | number> = { kern: (run.fontKerning ?? typography.fontKerning) !== 'none', liga: true };
  const numericStyle = run.numericStyle ?? typography.numericStyle;
  if (typography.smallCaps || run.smallCaps) features.smcp = true;
  if (numericStyle === 'oldstyle') features.onum = true;
  if (numericStyle === 'lining') features.lnum = true;
  if (numericStyle === 'tabular') features.tnum = true;
  if (vertical) {
    features.vert = true;
    features.vrt2 = true;
  }
  return features;
}

function styleKey(input: Omit<ResolvedStyle, 'key'>): string {
  return [
    input.face.id,
    input.fontSizePt,
    input.leadingPt,
    input.trackingPt,
    input.color.color,
    input.color.swatchId ?? '',
    input.direction,
    input.script,
    input.language,
    Object.entries(input.features).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}:${value}`).join(','),
    JSON.stringify(input.variations ?? {}),
    input.superscriptShiftPt,
    input.decorations.underline ? 'u' : '',
    input.decorations.strike ? 's' : '',
    input.decorations.highlight ?? '',
  ].join('|');
}

function styleForText(style: ResolvedStyle, text: string, vertical: boolean): ResolvedStyle {
  // Spaces and common punctuation inherit the surrounding run's bidi/script context. Splitting them into an
  // invented Latin run would break Arabic/Hebrew shaping and make punctuation reorder independently.
  if (!vertical && !hasStrongScript(text)) return style;
  const script = scriptFor(text, vertical);
  if (style.direction === script.direction && style.script === script.script && style.language === script.language) return style;
  const { key: _key, ...base } = style;
  const resolved: Omit<ResolvedStyle, 'key'> = {
    ...base,
    direction: script.direction,
    script: script.script,
    language: script.language,
  };
  return { ...resolved, key: styleKey(resolved) };
}

function scaleStyle(style: ResolvedStyle, factor: number): ResolvedStyle {
  const safeFactor = Math.max(1, factor);
  const { key: _key, ...base } = style;
  const resolved: Omit<ResolvedStyle, 'key'> = {
    ...base,
    fontSizePt: base.fontSizePt * safeFactor,
    trackingPt: base.trackingPt * safeFactor,
  };
  return { ...resolved, key: styleKey(resolved) };
}

function sourcePaint(typography: PaperTypography, run: PaperTextRun): PaperPrintPaintSource {
  return {
    kind: 'css-color',
    color: run.color ?? typography.color,
    ...(run.color === undefined && typography.colorSwatchId ? { swatchId: typography.colorSwatchId } : {}),
  };
}

function lineHeightFor(units: readonly CompositionUnit[], fallback: number): number {
  const largest = units.reduce((largestSize, unit) => (
    Math.max(largestSize, unit.dropCap ? 0 : unit.style.fontSizePt, unit.dropCap ? 0 : unit.style.leadingPt)
  ), 0);
  return Math.max(fallback, largest || fallback);
}

function isWhitespace(unit: CompositionUnit): boolean {
  return /^\s+$/u.test(unit.text);
}

function isCjk(unit: CompositionUnit): boolean {
  const codePoint = firstCodePoint(unit.text);
  return (codePoint >= 0x3040 && codePoint <= 0x30ff) || (codePoint >= 0x3400 && codePoint <= 0x9fff);
}

function canBreakBefore(next: CompositionUnit, previous: CompositionUnit | undefined, strict: boolean, vertical: boolean): boolean {
  if (!previous) return true;
  if ((vertical || isCjk(next) || isCjk(previous)) && !canBreakPaperJapaneseBefore(next.text, strict)) return false;
  if ((vertical || isCjk(next) || isCjk(previous)) && !canBreakPaperJapaneseAfter(previous.text, strict)) return false;
  if (vertical || isCjk(next) || isCjk(previous)) return true;
  return isWhitespace(previous) || previous.text === '-';
}

function trimLineWhitespace(units: CompositionUnit[]): CompositionUnit[] {
  let start = 0;
  let end = units.length;
  while (start < end && isWhitespace(units[start])) start += 1;
  while (end > start && isWhitespace(units[end - 1])) end -= 1;
  return units.slice(start, end);
}

function wrapUnits(
  units: readonly CompositionUnit[],
  maxAdvancePt: number,
  measure: (unit: CompositionUnit) => number,
  strict: boolean,
  vertical: boolean,
): CompositionUnit[][] {
  if (units.length === 0) return [[]];
  return breakPaperTextUnits(units, maxAdvancePt, measure, {
    canBreakBefore: (unit, _index, previous) => canBreakBefore(unit, previous, strict, vertical),
  })
    .map(trimLineWhitespace)
    .filter((line, index) => line.length > 0 || index === 0);
}

/**
 * Horizontal paragraphs can have a different legal width on the first line (indent/list marker) and on
 * the first few lines beside a drop cap. Keep that width decision here rather than allowing browser layout
 * to decide it after HarfBuzz has already committed glyph positions.
 */
function wrapHorizontalParagraphUnits(
  units: readonly CompositionUnit[],
  widthForLine: (lineIndex: number) => number,
  measure: (unit: CompositionUnit) => number,
  strict: boolean,
): CompositionUnit[][] {
  if (units.length === 0) return [[]];
  const lines: CompositionUnit[][] = [];
  let current: CompositionUnit[] = [];
  let currentWidth = 0;

  for (const unit of units) {
    const measured = Math.max(0, measure(unit));
    const previous = current[current.length - 1];
    const maxWidth = Math.max(0, widthForLine(lines.length));
    if (current.length > 0 && currentWidth + measured > maxWidth && canBreakBefore(unit, previous, strict, false)) {
      lines.push(trimLineWhitespace(current));
      current = [unit];
      currentWidth = measured;
      continue;
    }
    current.push(unit);
    currentWidth += measured;
  }

  if (current.length > 0) lines.push(trimLineWhitespace(current));
  return lines.filter((line, index) => line.length > 0 || index === 0);
}

function unitMeasure(unit: CompositionUnit): number {
  if (unit.tcy) return unit.style.fontSizePt;
  const shaped = unit.style.shaper.shape({
    text: unit.text,
    direction: unit.style.direction,
    script: unit.style.script,
    language: unit.style.language,
    fontSizePt: unit.style.fontSizePt,
    features: unit.style.features,
    variations: unit.style.variations,
  });
  const advance = unit.style.direction === 'ttb' ? Math.abs(shaped.advanceY) : Math.abs(shaped.advanceX);
  return Math.max(unit.style.fontSizePt * 0.05, advance || unit.style.fontSizePt) + unit.style.trackingPt;
}

function sameGroup(left: CompositionUnit, right: CompositionUnit, splitWhitespace: boolean): boolean {
  return left.style.key === right.style.key
    && left.tcy === right.tcy
    && left.sourceEnd === right.sourceStart
    && !(splitWhitespace && (isWhitespace(left) || isWhitespace(right)));
}

function groupUnits(units: readonly CompositionUnit[], splitWhitespace: boolean): CompositionUnit[][] {
  const groups: CompositionUnit[][] = [];
  for (const unit of units) {
    const current = groups[groups.length - 1];
    if (current && sameGroup(current[current.length - 1], unit, splitWhitespace)) current.push(unit);
    else groups.push([unit]);
  }
  return groups;
}

function sourceOffsetForCluster(units: readonly CompositionUnit[], cluster: number): number {
  let localOffset = 0;
  for (const unit of units) {
    const nextOffset = localOffset + unit.text.length;
    if (cluster < nextOffset) return unit.sourceStart + Math.max(0, cluster - localOffset);
    localOffset = nextOffset;
  }
  return units[units.length - 1]?.sourceEnd ?? 0;
}

function shapeGroup(units: CompositionUnit[]): ShapedGroup {
  const style = units[0].style;
  const text = units.map((unit) => unit.text).join('');
  const direction = units[0].tcy ? 'ltr' : style.direction;
  const shaped = style.shaper.shape({
    text,
    direction,
    script: units[0].tcy ? 'Latn' : style.script,
    language: style.language,
    fontSizePt: style.fontSizePt,
    features: style.features,
    variations: style.variations,
  });
  const glyphs = shaped.glyphs.map((glyph) => ({ ...glyph, cluster: sourceOffsetForCluster(units, glyph.cluster) }));
  const baseAdvance = direction === 'ttb' ? Math.abs(shaped.advanceY) : Math.abs(shaped.advanceX);
  const tracked = baseAdvance + Math.max(0, glyphs.length - 1) * style.trackingPt;
  return {
    units,
    style,
    shaped: { glyphs, advanceX: shaped.advanceX, advanceY: shaped.advanceY },
    advancePt: units[0].tcy ? style.fontSizePt : tracked,
  };
}

function alignmentStart(align: PaperTextAlign, xPt: number, availablePt: number, widthPt: number): number {
  if (align === 'right') return xPt + Math.max(0, availablePt - widthPt);
  if (align === 'center') return xPt + Math.max(0, (availablePt - widthPt) / 2);
  return xPt;
}

function addCaret(caretMap: PaperComposedCaret[], unit: CompositionUnit, xPt: number, yPt: number, heightPt: number, advancePt: number, vertical: boolean): void {
  const span = Math.max(1, unit.sourceEnd - unit.sourceStart);
  for (let index = 0; index < span; index += 1) {
    const ratio = index / span;
    const offset = unit.sourceStart + index;
    if (!caretMap[offset]) continue;
    caretMap[offset] = {
      sourceOffset: offset,
      xPt: vertical ? xPt : xPt + advancePt * ratio,
      yPt: vertical ? yPt + advancePt * ratio : yPt - heightPt * 0.8,
      heightPt,
    };
  }
  const endOffset = unit.sourceEnd;
  if (caretMap[endOffset]) {
    caretMap[endOffset] = {
      sourceOffset: endOffset,
      xPt: vertical ? xPt : xPt + advancePt,
      yPt: vertical ? yPt + advancePt : yPt - heightPt * 0.8,
      heightPt,
    };
  }
}

function positionHorizontalLine(
  draft: LineDraft,
  originXPt: number,
  baselineYPt: number,
  availablePt: number,
  caretMap: PaperComposedCaret[],
): PaperComposedTextLine {
  const align = draft.isParagraphEnd && draft.paragraph.align === 'justify' && draft.paragraph.alignLast !== 'auto'
    ? draft.paragraph.alignLast
    : draft.paragraph.align;
  const logicalGroups = groupUnits(draft.units, align === 'justify' && !draft.isParagraphEnd).map(shapeGroup);
  // HarfBuzz shapes each directional run, but it deliberately does not run the Unicode bidi algorithm across
  // our rich-run boundaries. A paragraph whose first strong run is RTL therefore paints its directional runs
  // from right to left while retaining authored source offsets for selection/caret mapping.
  const baseDirection = draft.units.find((unit) => !isWhitespace(unit))?.style.direction ?? 'ltr';
  const groups = baseDirection === 'rtl' ? [...logicalGroups].reverse() : logicalGroups;
  const baseWidth = groups.reduce((total, group) => total + group.advancePt, 0);
  const gaps = align === 'justify' && !draft.isParagraphEnd
    ? groups.filter((group) => group.units.every(isWhitespace)).length
    : 0;
  const gapExtra = gaps > 0 ? Math.max(0, availablePt - baseWidth) / gaps : 0;
  let penX = alignmentStart(align, originXPt, availablePt, gaps > 0 ? availablePt : baseWidth);
  const runs: PaperPositionedGlyphRun[] = [];

  for (const group of groups) {
    const runStart = penX;
    const glyphs: Array<PaperShapedGlyph & { xPt: number; yPt: number }> = [];
    for (let index = 0; index < group.shaped.glyphs.length; index += 1) {
      const glyph = group.shaped.glyphs[index];
      glyphs.push({ ...glyph, xPt: penX + glyph.xOffset, yPt: baselineYPt - glyph.yOffset - group.style.superscriptShiftPt });
      penX += glyph.xAdvance;
      if (index < group.shaped.glyphs.length - 1) penX += group.style.trackingPt;
    }
    if (group.shaped.glyphs.length === 0) penX += group.advancePt;
    const unitAdvances = group.units.map(unitMeasure);
    if (group.style.direction === 'rtl') {
      let caretX = runStart + unitAdvances.reduce((total, advance) => total + advance, 0);
      for (const [unitIndex, unit] of group.units.entries()) {
        const advance = unitAdvances[unitIndex];
        caretX -= advance;
        addCaret(caretMap, unit, caretX, baselineYPt, group.style.fontSizePt, advance, false);
      }
    } else {
      let caretX = runStart;
      for (const [unitIndex, unit] of group.units.entries()) {
        const advance = unitAdvances[unitIndex];
        addCaret(caretMap, unit, caretX, baselineYPt, group.style.fontSizePt, advance, false);
        caretX += advance;
      }
    }
    runs.push({
      text: group.units.map((unit) => unit.text).join(''),
      face: group.style.face,
      fontSizePt: group.style.fontSizePt,
      unitsPerEm: group.style.shaper.unitsPerEm ?? DEFAULT_UNITS_PER_EM,
      color: group.style.color,
      variations: group.style.variations,
      glyphs,
      sourceStart: group.units[0].sourceStart,
      sourceEnd: group.units[group.units.length - 1].sourceEnd,
      advanceXPt: penX - runStart,
      decorations: group.style.decorations,
    });
    if (gaps > 0 && group.units.every(isWhitespace)) penX += gapExtra;
  }

  return {
    text: draft.units.map((unit) => unit.text).join(''),
    originXPt: alignmentStart(align, originXPt, availablePt, gaps > 0 ? availablePt : baseWidth),
    originYPt: baselineYPt,
    widthPt: gaps > 0 ? availablePt : baseWidth,
    runs,
  };
}

function positionVerticalLine(
  draft: LineDraft,
  originXPt: number,
  originYPt: number,
  caretMap: PaperComposedCaret[],
): PaperComposedTextLine {
  const groups = groupUnits(draft.units, false).map(shapeGroup);
  let penY = originYPt;
  const runs: PaperPositionedGlyphRun[] = [];
  for (const group of groups) {
    const runStart = penY;
    const glyphs: Array<PaperShapedGlyph & { xPt: number; yPt: number }> = [];
    if (group.units[0].tcy) {
      const horizontalAdvance = Math.abs(group.shaped.advanceX) || group.style.fontSizePt;
      const tcyX = originXPt + (group.style.fontSizePt - horizontalAdvance) / 2;
      const tcyY = penY + group.style.fontSizePt * 0.72;
      let penX = tcyX;
      for (const glyph of group.shaped.glyphs) {
        glyphs.push({ ...glyph, xPt: penX + glyph.xOffset, yPt: tcyY - glyph.yOffset });
        penX += glyph.xAdvance;
      }
      penY += group.style.fontSizePt;
    } else {
      for (let index = 0; index < group.shaped.glyphs.length; index += 1) {
        const glyph = group.shaped.glyphs[index];
        glyphs.push({ ...glyph, xPt: originXPt + glyph.xOffset + group.style.superscriptShiftPt, yPt: penY - glyph.yOffset });
        const advance = Math.abs(glyph.yAdvance) || group.style.fontSizePt;
        penY += advance;
        if (index < group.shaped.glyphs.length - 1) penY += group.style.trackingPt;
      }
      if (group.shaped.glyphs.length === 0) penY += group.advancePt;
    }
    let caretY = runStart;
    for (const unit of group.units) {
      const advance = unitMeasure(unit);
      addCaret(caretMap, unit, originXPt, caretY, group.style.fontSizePt, advance, true);
      caretY += advance;
    }
    runs.push({
      text: group.units.map((unit) => unit.text).join(''),
      face: group.style.face,
      fontSizePt: group.style.fontSizePt,
      unitsPerEm: group.style.shaper.unitsPerEm ?? DEFAULT_UNITS_PER_EM,
      color: group.style.color,
      variations: group.style.variations,
      glyphs,
      sourceStart: group.units[0].sourceStart,
      sourceEnd: group.units[group.units.length - 1].sourceEnd,
      advanceYPt: penY - runStart,
      decorations: group.style.decorations,
    });
  }
  return {
    text: draft.units.map((unit) => unit.text).join(''),
    originXPt,
    originYPt,
    widthPt: penY - originYPt,
    runs,
  };
}

function sourceOffsetText(text: string, offset: number): number {
  return text.codePointAt(Math.max(0, Math.min(text.length, offset))) ?? 0;
}

function appendAnnotations(
  line: PaperComposedTextLine,
  ruby: readonly RubyAnnotation[],
  vertical: boolean,
  missingGlyphs: Array<{ codePoint: number; faceId: string }>,
  emphasisMarks: PaperComposedEmphasisMark[],
  units: readonly CompositionUnit[],
): void {
  for (const annotation of ruby) {
    const baseGlyphs = line.runs
      .flatMap((run) => run.glyphs)
      .filter((glyph) => glyph.cluster >= annotation.baseSourceStart && glyph.cluster < annotation.baseSourceEnd);
    if (baseGlyphs.length === 0) continue;
    const fontSizePt = Math.max(4, annotation.style.fontSizePt * 0.5);
    const shaped = annotation.style.shaper.shape({
      text: annotation.reading,
      direction: vertical ? 'ttb' : 'ltr',
      script: vertical ? 'Hani' : annotation.style.script,
      language: annotation.style.language,
      fontSizePt,
      features: annotation.style.features,
      variations: annotation.style.variations,
    });
    const advance = vertical ? Math.abs(shaped.advanceY) : Math.abs(shaped.advanceX);
    const first = baseGlyphs[0];
    const last = baseGlyphs[baseGlyphs.length - 1];
    const baseSpan = vertical ? Math.max(fontSizePt, last.yPt - first.yPt + annotation.style.fontSizePt) : Math.max(fontSizePt, last.xPt - first.xPt + annotation.style.fontSizePt);
    let penX = vertical ? first.xPt + annotation.style.fontSizePt * 0.55 : first.xPt + (baseSpan - advance) / 2;
    let penY = vertical ? first.yPt + (baseSpan - advance) / 2 : first.yPt - annotation.style.fontSizePt * 0.55;
    const glyphs: Array<PaperShapedGlyph & { xPt: number; yPt: number }> = [];
    for (const glyph of shaped.glyphs) {
      glyphs.push({ ...glyph, cluster: annotation.readingSourceStart + glyph.cluster, xPt: penX + glyph.xOffset, yPt: penY - glyph.yOffset });
      if (vertical) penY += Math.abs(glyph.yAdvance) || fontSizePt;
      else penX += glyph.xAdvance;
      if (glyph.glyphId === 0) {
        missingGlyphs.push({ codePoint: sourceOffsetText(annotation.reading, glyph.cluster), faceId: annotation.style.face.id });
      }
    }
    line.runs.push({
      text: annotation.reading,
      face: annotation.style.face,
      fontSizePt,
      unitsPerEm: annotation.style.shaper.unitsPerEm ?? DEFAULT_UNITS_PER_EM,
      color: annotation.style.color,
      glyphs,
      sourceStart: annotation.readingSourceStart,
      sourceEnd: annotation.readingSourceEnd,
      annotation: 'ruby',
    });
  }

  for (const unit of units) {
    if (!unit.emphasis) continue;
    const glyph = line.runs.flatMap((run) => run.glyphs).find((item) => item.cluster >= unit.sourceStart && item.cluster < unit.sourceEnd);
    if (!glyph) continue;
    emphasisMarks.push({
      xPt: vertical ? glyph.xPt + unit.style.fontSizePt * 0.75 : glyph.xPt + unit.style.fontSizePt * 0.3,
      yPt: vertical ? glyph.yPt + unit.style.fontSizePt * 0.35 : glyph.yPt - unit.style.fontSizePt * 0.85,
      radiusPt: Math.max(0.45, unit.style.fontSizePt * 0.075),
      color: unit.style.color,
    });
  }
}

function hasMissingGlyph(run: PaperPositionedGlyphRun, sourceText: string, output: Array<{ codePoint: number; faceId: string }>): void {
  for (const glyph of run.glyphs) {
    if (glyph.glyphId !== 0) continue;
    const candidate = { codePoint: sourceOffsetText(sourceText, glyph.cluster), faceId: run.face.id };
    if (!output.some((entry) => entry.codePoint === candidate.codePoint && entry.faceId === candidate.faceId)) output.push(candidate);
  }
}

function firstLineOffsetPt(paragraph: CompositionParagraph): number {
  // Match the editor's precedence: an explicit list marker owns the hanging lane, then a Word-style hanging
  // indent, and only otherwise does a positive first-line indent apply.
  if (paragraph.listMarkerPadPt > 0) return -paragraph.listMarkerPadPt;
  if (paragraph.hangingIndentPt > 0) return -paragraph.hangingIndentPt;
  return paragraph.firstLineIndentPt;
}

function dropCapReservePt(paragraph: CompositionParagraph): number {
  const dropCap = paragraph.units.find((unit) => unit.dropCap);
  if (!dropCap || paragraph.dropCapLines < 2) return 0;
  // Mirrors the editor's small right-side drop-cap breathing room (`padding-right: 0.08em`).
  return unitMeasure(dropCap) + dropCap.style.fontSizePt * 0.08;
}

function lineOffsetPt(paragraph: CompositionParagraph, lineIndex: number, dropCapReserve: number): number {
  if (lineIndex === 0) return firstLineOffsetPt(paragraph);
  return lineIndex < paragraph.dropCapLines ? dropCapReserve : 0;
}

function inferredLineBounds(line: PaperComposedTextLine): PaperComposedTextBounds | undefined {
  if (line.layoutBounds) return line.layoutBounds;
  const glyphs = line.runs.flatMap((run) => run.glyphs.map((glyph) => ({ glyph, run })));
  if (glyphs.length === 0) return undefined;
  const minX = Math.min(...glyphs.map(({ glyph, run }) => glyph.xPt - run.fontSizePt * 0.08));
  const minY = Math.min(...glyphs.map(({ glyph, run }) => glyph.yPt - run.fontSizePt * 0.82));
  const maxX = Math.max(...glyphs.map(({ glyph, run }) => glyph.xPt + run.fontSizePt * 0.88));
  const maxY = Math.max(...glyphs.map(({ glyph, run }) => glyph.yPt + run.fontSizePt * 0.24));
  return { xPt: minX, yPt: minY, widthPt: maxX - minX, heightPt: maxY - minY };
}

/** Shift every emitted coordinate together so a bubble's top/middle/bottom alignment stays WYSIWYG. */
function alignBubbleTextVertically(
  frame: PaperFrame,
  bounds: PaperComposedTextBounds,
  lines: PaperComposedTextLine[],
  caretMap: PaperComposedCaret[],
  emphasisMarks: PaperComposedEmphasisMark[],
  paragraphBoxes: PaperComposedParagraphBox[],
): void {
  if ((frame.kind !== 'speechBubble' && frame.kind !== 'thoughtBubble') || frame.textVerticalAlign === 'top') return;
  const lineBounds = lines.map(inferredLineBounds).filter((line): line is PaperComposedTextBounds => Boolean(line));
  if (lineBounds.length === 0) return;
  const minY = Math.min(...lineBounds.map((line) => line.yPt));
  const maxY = Math.max(...lineBounds.map((line) => line.yPt + line.heightPt));
  const freeHeight = Math.max(0, bounds.heightPt - (maxY - minY));
  const factor = frame.textVerticalAlign === 'bottom' ? 1 : 0.5;
  const offsetYPt = bounds.yPt + freeHeight * factor - minY;
  if (offsetYPt === 0) return;

  for (const line of lines) {
    line.originYPt += offsetYPt;
    if (line.layoutBounds) line.layoutBounds.yPt += offsetYPt;
    for (const run of line.runs) {
      for (const glyph of run.glyphs) glyph.yPt += offsetYPt;
    }
  }
  for (const caret of caretMap) caret.yPt += offsetYPt;
  for (const mark of emphasisMarks) mark.yPt += offsetYPt;
  for (const box of paragraphBoxes) box.yPt += offsetYPt;
}

function composeParagraphBoxes(
  lines: readonly PaperComposedTextLine[],
  paragraphs: readonly CompositionParagraph[],
): PaperComposedParagraphBox[] {
  const boxes: PaperComposedParagraphBox[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph.shading && !paragraph.borders) return;
    const fragments = new Map<string, PaperComposedTextLine[]>();
    for (const line of lines) {
      if (line.paragraphIndex !== paragraphIndex) continue;
      const key = String(line.columnIndex ?? 0);
      const current = fragments.get(key);
      if (current) current.push(line);
      else fragments.set(key, [line]);
    }
    for (const fragment of fragments.values()) {
      const layoutBounds = fragment
        .map((line) => line.layoutBounds)
        .filter((line): line is PaperComposedTextBounds => Boolean(line));
      if (layoutBounds.length > 0) {
        const minX = Math.min(...layoutBounds.map((line) => line.xPt));
        const minY = Math.min(...layoutBounds.map((line) => line.yPt));
        const maxX = Math.max(...layoutBounds.map((line) => line.xPt + line.widthPt));
        const maxY = Math.max(...layoutBounds.map((line) => line.yPt + line.heightPt));
        boxes.push({
          xPt: minX,
          yPt: minY - paragraph.borderPaddingPt,
          widthPt: Math.max(0, maxX - minX),
          heightPt: Math.max(0, maxY - minY + paragraph.borderPaddingPt * 2),
          ...(paragraph.shading ? { fill: { kind: 'css-color' as const, color: paragraph.shading } } : {}),
          ...(paragraph.borders ? { borders: paragraph.borders } : {}),
        });
        continue;
      }
      const paddingPt = paragraph.borderPaddingPt;
      const glyphEntries = fragment.flatMap((line) => line.runs.flatMap((run) => run.glyphs.map((glyph) => ({ glyph, run }))));
      if (glyphEntries.length === 0) continue;
      const minX = Math.min(...glyphEntries.map(({ glyph, run }) => glyph.xPt - run.fontSizePt * 0.08));
      const minY = Math.min(...glyphEntries.map(({ glyph, run }) => glyph.yPt - run.fontSizePt * 0.82));
      const maxX = Math.max(...glyphEntries.map(({ glyph, run }) => glyph.xPt + run.fontSizePt * 0.88));
      const maxY = Math.max(...glyphEntries.map(({ glyph, run }) => glyph.yPt + run.fontSizePt * 0.24));
      boxes.push({
        xPt: minX - paddingPt,
        yPt: minY - paddingPt,
        widthPt: Math.max(0, maxX - minX + paddingPt * 2),
        heightPt: Math.max(0, maxY - minY + paddingPt * 2),
        ...(paragraph.shading ? { fill: { kind: 'css-color' as const, color: paragraph.shading } } : {}),
        ...(paragraph.borders ? { borders: paragraph.borders } : {}),
      });
    }
  });
  return boxes;
}

function emptyResult(
  frame: PaperFrame,
  writingMode: 'horizontal-tb' | 'vertical-rl',
  bounds: PaperComposedTextBounds,
  sourceLength: number,
  missingFaces: PaperMissingManagedFace[],
): PaperComposedTextFrame {
  return {
    frameId: frame.id,
    writingMode,
    bounds,
    lines: [],
    caretMap: Array.from({ length: sourceLength + 1 }, (_, sourceOffset) => ({
      sourceOffset,
      xPt: bounds.xPt,
      yPt: bounds.yPt,
      heightPt: frame.typography.fontSizePt,
    })),
    overset: false,
    missingFaces,
    missingGlyphs: [],
  };
}

async function resolveStyle(
  typography: PaperTypography,
  run: PaperTextRun,
  paragraphLeadingPt: number,
  vertical: boolean,
  importedFonts: readonly PaperManagedFontFace[] | undefined,
  fontResolver: PaperManagedFontResolver,
  sourceStart: number,
  sourceEnd: number,
): Promise<{ style?: ResolvedStyle; missing?: PaperMissingManagedFace }> {
  const familyId = normalizePaperFontFamilyId(normalizeFamilyName(run.fontFamily ?? typography.fontFamily));
  const inheritedWeight = paperFontWeightFromCss(typography.fontWeight);
  const weight = paperFontWeightFromCss(run.fontWeight ?? typography.fontWeight, inheritedWeight);
  const styleValue = run.fontStyle ?? typography.fontStyle;
  const style = paperFontStyleFromCss(styleValue);
  const selection = selectManagedFontFace(importedFonts ?? [], {
    familyId, weight, style, obliqueAngleDeg: paperFontObliqueAngleFromCss(styleValue),
    stretchPercent: paperFontStretchFromCss(run.fontStretch ?? typography.fontStretch),
    variationSettings: run.fontVariationSettings ?? typography.fontVariationSettings,
  });
  if (selection.status !== 'selected') {
    return {
      missing: {
        familyId,
        weight,
        style,
        sourceStart,
        sourceEnd,
        reason: selection.status === 'missing-family' ? 'missing-family' : 'missing-face',
      },
    };
  }
  if (!canUseManagedFontForProduction(selection.face).allowed) {
    return { missing: { familyId, weight, style, sourceStart, sourceEnd, reason: 'production-rights' } };
  }
  const shaper = await fontResolver(selection.face);
  if (!shaper) {
    return { missing: { familyId, weight, style, sourceStart, sourceEnd, reason: 'asset-unavailable' } };
  }
  const baseSize = finitePositive(run.fontSizePt, finitePositive(typography.fontSizePt, 10));
  const isRaisedOrLowered = run.vertAlign === 'super' || run.vertAlign === 'sub';
  const fontSizePt = run.fontSizePt ? baseSize : isRaisedOrLowered ? baseSize * 0.7 : baseSize;
  const script = scriptFor(run.text, vertical);
  const resolved: Omit<ResolvedStyle, 'key'> = {
    face: selection.face,
    shaper,
    fontSizePt,
    leadingPt: finitePositive(run.leadingPt, paragraphLeadingPt),
    trackingPt: fontSizePt * (run.tracking ?? typography.tracking ?? 0) / 1000,
    color: sourcePaint(typography, run),
    direction: script.direction,
    script: script.script,
    language: script.language,
    features: paperFeatures(typography, run, vertical),
    variations: normalizePaperFontVariationSettings(run.fontVariationSettings ?? typography.fontVariationSettings ?? selection.face.variationSettings, selection.face.variableAxes),
    decorations: { underline: run.underline, strike: run.strike, highlight: run.highlight },
    superscriptShiftPt: run.vertAlign === 'super' ? fontSizePt * 0.35 : run.vertAlign === 'sub' ? -fontSizePt * 0.18 : 0,
  };
  return { style: { ...resolved, key: styleKey(resolved) } };
}

async function buildParagraphs(
  frame: PaperFrame,
  importedFonts: readonly PaperManagedFontFace[] | undefined,
  fontResolver: PaperManagedFontResolver,
  vertical: boolean,
): Promise<{ paragraphs: CompositionParagraph[]; missingFaces: PaperMissingManagedFace[]; sourceText: string }> {
  const paragraphs = frame.richText?.length ? frame.richText : paperRichTextFromPlainText(frame.text ?? '');
  const sourceText = frame.richText?.length
    ? paragraphs.map((paragraph) => `${paragraph.listMarker ? `${paragraph.listMarker}\t` : ''}${paragraph.runs.map((run) => run.text).join('')}`).join('\n')
    : frame.text ?? '';
  const output: CompositionParagraph[] = [];
  const missingFaces: PaperMissingManagedFace[] = [];
  let sourceOffset = 0;
  for (const paragraph of paragraphs) {
    const units: CompositionUnit[] = [];
    const ruby: RubyAnnotation[] = [];
    const effectiveRuns = paragraph.listMarker
      // The editable/print views use an em-space after the visible marker. The flattened source intentionally
      // stores a tab at the same UTF-16 width, so caret/source offsets remain stable while geometry matches.
      ? [{ text: `${paragraph.listMarker}\u2003` } as PaperTextRun, ...paragraph.runs]
      : paragraph.runs;
    const paragraphLeadingPt = finitePositive(
      paragraph.leadingPt,
      finitePositive(frame.typography.leadingPt, frame.typography.fontSizePt),
    );
    for (const run of effectiveRuns) {
      const runStart = sourceOffset;
      const runEnd = sourceOffset + run.text.length;
      if (!run.text) {
        sourceOffset = runEnd;
        continue;
      }
      const resolved = await resolveStyle(
        frame.typography,
        run,
        paragraphLeadingPt,
        vertical,
        importedFonts,
        fontResolver,
        runStart,
        runEnd,
      );
      if (!resolved.style) {
        if (resolved.missing) missingFaces.push(resolved.missing);
        sourceOffset = runEnd;
        continue;
      }
      const tokenText = run.text;
      for (const token of tokenizePaperInlineTextWithOffsets(tokenText, vertical)) {
        const baseStart = token.baseSourceStart ?? token.sourceStart;
        const baseEnd = token.baseSourceEnd ?? token.sourceEnd;
        const primaryText = token.type === 'ruby' ? token.base : token.type === 'tcy' ? token.digits : token.text;
        for (const grapheme of splitGraphemes(primaryText)) {
          const graphemeStyle = styleForText(resolved.style, grapheme.text, vertical);
          units.push({
            text: grapheme.text,
            sourceStart: runStart + baseStart + grapheme.start,
            sourceEnd: runStart + baseStart + grapheme.end,
            style: graphemeStyle,
            tcy: token.type === 'tcy',
            emphasis: token.type === 'emphasis',
          });
        }
        if (token.type === 'ruby') {
          const readingStart = runStart + baseEnd + 1; // opening angle bracket immediately follows the base.
          ruby.push({
            baseSourceStart: runStart + baseStart,
            baseSourceEnd: runStart + baseEnd,
            readingSourceStart: readingStart,
            readingSourceEnd: readingStart + token.reading.length,
            reading: token.reading,
            style: styleForText(resolved.style, token.reading, vertical),
          });
        }
      }
      sourceOffset = runEnd;
    }
    const dropCapLines = Math.min(8, Math.max(0, Math.round(paragraph.dropCapLines ?? frame.typography.dropCapLines ?? 0)));
    if (dropCapLines >= 2) {
      const dropCapIndex = units.findIndex((unit) => !isWhitespace(unit));
      const dropCap = units[dropCapIndex];
      if (dropCap) {
        dropCap.style = scaleStyle(dropCap.style, dropCapLines);
        dropCap.dropCap = true;
      }
    }
    const firstLineIndentPt = (paragraph.firstLineIndentMm ?? frame.typography.firstLineIndentMm ?? 0) * PT_PER_MM;
    const borderPaddingPt = paragraph.borders?.paddingPt ?? (paragraph.borders ? 1.5 : 0);
    const listMarkerPadPt = paragraph.listMarker ? 4.5 * PT_PER_MM : 0;
    output.push({
      units,
      ruby,
      align: paragraph.align ?? frame.typography.align,
      firstLineIndentPt,
      leftIndentPt: clampNonNegative(paragraph.leftIndentMm) * PT_PER_MM + borderPaddingPt + listMarkerPadPt,
      rightIndentPt: clampNonNegative(paragraph.rightIndentMm) * PT_PER_MM + borderPaddingPt,
      hangingIndentPt: clampNonNegative(paragraph.hangingIndentMm) * PT_PER_MM,
      borderPaddingPt,
      listMarkerPadPt,
      spaceBeforePt: clampNonNegative(paragraph.spaceBeforeMm ?? frame.typography.spaceBeforeMm) * PT_PER_MM,
      spaceAfterPt: clampNonNegative(paragraph.spaceAfterMm ?? frame.typography.spaceAfterMm) * PT_PER_MM,
      sourceEnd: sourceOffset,
      borders: paragraph.borders,
      shading: paragraph.shading,
      dropCapLines,
      alignLast: paragraph.alignLast ?? frame.typography.alignLast ?? 'auto',
      leadingPt: paragraphLeadingPt,
      lineBreakStrict: paragraph.lineBreakStrict ?? frame.typography.lineBreakStrict ?? vertical,
    });
    sourceOffset += 1;
  }
  return { paragraphs: output, missingFaces, sourceText };
}

/**
 * Compose a Paper frame using only exact managed faces. The result contains enough geometry for the canvas
 * layer and the future PDF render plan; unavailable faces/glyphs are explicit data and never become browser
 * substitution decisions.
 */
export async function composePaperTextFrame(
  frame: PaperFrame,
  document: Pick<PaperDocument, 'importedFonts'>,
  fontResolver: PaperManagedFontResolver,
): Promise<PaperComposedTextFrame> {
  const writingMode = frame.typography.writingMode === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb';
  const box = resolvePaperFrameTextContentBoxMm(frame);
  const bounds: PaperComposedTextBounds = {
    xPt: box.xMm * PT_PER_MM,
    yPt: box.yMm * PT_PER_MM,
    widthPt: box.widthMm * PT_PER_MM,
    heightPt: box.heightMm * PT_PER_MM,
  };
  const { paragraphs, missingFaces, sourceText } = await buildParagraphs(frame, document.importedFonts, fontResolver, writingMode === 'vertical-rl');
  if (missingFaces.length > 0) return emptyResult(frame, writingMode, bounds, sourceText.length, missingFaces);

  const caretMap: PaperComposedCaret[] = Array.from({ length: sourceText.length + 1 }, (_, sourceOffset) => ({
    sourceOffset,
    xPt: bounds.xPt,
    yPt: bounds.yPt,
    heightPt: frame.typography.fontSizePt,
  }));
  const lines: PaperComposedTextLine[] = [];
  const missingGlyphs: Array<{ codePoint: number; faceId: string }> = [];
  const emphasisMarks: PaperComposedEmphasisMark[] = [];
  let overset = false;

  if (writingMode === 'vertical-rl') {
    let originXPt = bounds.xPt + bounds.widthPt - finitePositive(frame.typography.fontSizePt, 10);
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      const draftLines = wrapUnits(paragraph.units, bounds.heightPt, unitMeasure, paragraph.lineBreakStrict, true);
      for (const [index, units] of draftLines.entries()) {
        const lineHeight = lineHeightFor(units, paragraph.leadingPt);
        if (originXPt < bounds.xPt - lineHeight) overset = true;
        const line = positionVerticalLine({ units, paragraph, isParagraphEnd: index === draftLines.length - 1 }, originXPt, bounds.yPt + paragraph.spaceBeforePt, caretMap);
        line.paragraphIndex = paragraphIndex;
        appendAnnotations(line, paragraph.ruby, true, missingGlyphs, emphasisMarks, units);
        line.runs.forEach((run) => hasMissingGlyph(run, sourceText, missingGlyphs));
        lines.push(line);
        originXPt -= lineHeight;
      }
      originXPt -= paragraph.spaceAfterPt;
    }
  } else {
    const columnCount = frame.kind === 'text' ? Math.max(1, Math.round(frame.columns || 1)) : 1;
    const gutterPt = resolvePaperColumnGutterMm(frame) * PT_PER_MM;
    const columnWidthPt = Math.max(0, (bounds.widthPt - gutterPt * (columnCount - 1)) / columnCount);
    let columnIndex = 0;
    let cursorYPt = bounds.yPt;
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      cursorYPt += paragraph.spaceBeforePt;
      cursorYPt += paragraph.borderPaddingPt;
      const baseWidth = Math.max(0, columnWidthPt - paragraph.leftIndentPt - paragraph.rightIndentPt);
      const dropCapReserve = dropCapReservePt(paragraph);
      const provisional = wrapHorizontalParagraphUnits(
        paragraph.units,
        (lineIndex) => Math.max(0, baseWidth - lineOffsetPt(paragraph, lineIndex, dropCapReserve)),
        unitMeasure,
        paragraph.lineBreakStrict,
      );
      for (const [index, units] of provisional.entries()) {
        const offsetPt = lineOffsetPt(paragraph, index, dropCapReserve);
        const insetPt = paragraph.leftIndentPt + offsetPt;
        const availablePt = Math.max(0, baseWidth - offsetPt);
        const lineHeight = lineHeightFor(units, paragraph.leadingPt);
        const isLastLine = index === provisional.length - 1;
        const bottomPadding = isLastLine ? paragraph.borderPaddingPt : 0;
        if (cursorYPt + lineHeight + bottomPadding > bounds.yPt + bounds.heightPt && lines.length > 0) {
          if (columnIndex + 1 >= columnCount) overset = true;
          else {
            columnIndex += 1;
            cursorYPt = bounds.yPt;
          }
        }
        const baselineYPt = cursorYPt + lineHeight * 0.8;
        const line = positionHorizontalLine(
          { units, paragraph, isParagraphEnd: isLastLine },
          bounds.xPt + columnIndex * (columnWidthPt + gutterPt) + insetPt,
          baselineYPt,
          availablePt,
          caretMap,
        );
        line.columnIndex = columnIndex;
        line.paragraphIndex = paragraphIndex;
        line.layoutBounds = {
          xPt: bounds.xPt + columnIndex * (columnWidthPt + gutterPt),
          yPt: cursorYPt,
          widthPt: columnWidthPt,
          heightPt: lineHeight,
        };
        appendAnnotations(line, paragraph.ruby, false, missingGlyphs, emphasisMarks, units);
        line.runs.forEach((run) => hasMissingGlyph(run, sourceText, missingGlyphs));
        lines.push(line);
        cursorYPt += lineHeight;
      }
      cursorYPt += paragraph.borderPaddingPt + paragraph.spaceAfterPt;
    }
  }

  const paragraphBoxes = composeParagraphBoxes(lines, paragraphs);
  alignBubbleTextVertically(frame, bounds, lines, caretMap, emphasisMarks, paragraphBoxes);

  return {
    frameId: frame.id,
    writingMode,
    bounds,
    lines,
    caretMap,
    overset,
    missingFaces,
    missingGlyphs,
    ...(emphasisMarks.length ? { emphasisMarks } : {}),
    ...(paragraphBoxes.length ? { paragraphBoxes } : {}),
  };
}
