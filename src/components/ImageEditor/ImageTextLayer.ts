import type { ImageLayer, LayerBitmap, TextLayerStyle } from '../../types/imageEditor';
import { createBitmap } from './LayerBitmap';

export type ImageTextAlign = 'left' | 'center' | 'right' | 'justify';

export interface ImageTextLayerStyle extends TextLayerStyle {
  lineHeight: number;
  align: ImageTextAlign;
}

export interface MeasuredImageTextLine {
  text: string;
  width: number;
  x: number;
  baseline: number;
}

export interface MeasuredImageTextBlock {
  lines: MeasuredImageTextLine[];
  width: number;
  height: number;
  lineHeightPx: number;
  align: ImageTextAlign;
  boxWidth: number | null;
  boxHeight: number | null;
}

export const DEFAULT_IMAGE_TEXT_STYLE: ImageTextLayerStyle = {
  content: '',
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

export function normalizeImageTextStyle(
  patch: Partial<ImageTextLayerStyle> = {},
): ImageTextLayerStyle {
  const fontSize = clampNumber(patch.fontSize, 4, 512, DEFAULT_IMAGE_TEXT_STYLE.fontSize);
  const lineHeight = clampNumber(patch.lineHeight, 0.75, 3, DEFAULT_IMAGE_TEXT_STYLE.lineHeight);
  const letterSpacing = clampNumber(patch.letterSpacing, -20, 100, DEFAULT_IMAGE_TEXT_STYLE.letterSpacing);
  const boxWidth = normalizeOptionalDimension(patch.boxWidth, 1, 4096);
  const boxHeight = normalizeOptionalDimension(patch.boxHeight, 1, 4096);

  return {
    content: (patch.content ?? DEFAULT_IMAGE_TEXT_STYLE.content).trim(),
    fontFamily: patch.fontFamily?.trim() || DEFAULT_IMAGE_TEXT_STYLE.fontFamily,
    fontSize,
    fontWeight: patch.fontWeight?.trim() || DEFAULT_IMAGE_TEXT_STYLE.fontWeight,
    fontStyle: patch.fontStyle === 'italic' ? 'italic' : 'normal',
    letterSpacing,
    boxWidth,
    boxHeight,
    wrap: patch.wrap ?? DEFAULT_IMAGE_TEXT_STYLE.wrap,
    color: patch.color?.trim() || DEFAULT_IMAGE_TEXT_STYLE.color,
    lineHeight,
    align: patch.align ?? DEFAULT_IMAGE_TEXT_STYLE.align,
    verticalAlign: patch.verticalAlign ?? DEFAULT_IMAGE_TEXT_STYLE.verticalAlign,
    warp: patch.warp ?? DEFAULT_IMAGE_TEXT_STYLE.warp,
  };
}

export function imageTextCanvasFont(style: Pick<ImageTextLayerStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle'>): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

export function measureImageTextBlock(
  style: ImageTextLayerStyle,
  measureLine: (line: string) => number,
): MeasuredImageTextBlock {
  const rawLines = splitTextLines(style.content);
  const lines = style.wrap && style.boxWidth ? wrapTextLines(rawLines, style.boxWidth, measureLine) : rawLines;
  const lineWidths = lines.map((line) => Math.max(1, Math.ceil(measureSpacedLine(line, style.letterSpacing, measureLine))));
  const contentWidth = Math.max(1, ...lineWidths);
  const width = Math.max(1, Math.ceil(style.boxWidth ?? contentWidth));
  const lineHeightPx = Math.max(1, Math.ceil(style.fontSize * style.lineHeight));
  const contentHeight = Math.max(lineHeightPx, lines.length * lineHeightPx);
  const height = Math.max(contentHeight, Math.ceil(style.boxHeight ?? contentHeight));
  const verticalOffset =
    style.verticalAlign === 'middle'
      ? (height - contentHeight) / 2
      : style.verticalAlign === 'bottom'
        ? height - contentHeight
        : 0;
  const measuredLines = lines.map((line, index) => {
    const lineWidth = lineWidths[index];
    const x =
      style.align === 'center'
        ? (width - lineWidth) / 2
        : style.align === 'right'
          ? width - lineWidth
          : 0;

    return {
      text: line,
      width: lineWidth,
      x,
      baseline: verticalOffset + index * lineHeightPx + style.fontSize,
    };
  });

  return {
    lines: measuredLines,
    width,
    height,
    lineHeightPx,
    align: style.align,
    boxWidth: style.boxWidth,
    boxHeight: style.boxHeight,
  };
}

export function buildTextLayerName(content: string): string {
  const firstLine = splitTextLines(content.trim())[0]?.trim() ?? '';
  if (!firstLine) return 'Text';
  return firstLine.length > 25 ? `${firstLine.slice(0, 25).trimEnd()}...` : firstLine;
}

export function rasterizeImageTextStyle(styleInput: Partial<ImageTextLayerStyle>): LayerBitmap {
  const style = normalizeImageTextStyle(styleInput);
  const measure = createBitmap(1, 1);
  const mctx = measure.getContext('2d');
  if (!mctx) throw new Error('Failed to acquire text measurement context.');
  mctx.font = imageTextCanvasFont(style);
  const layout = measureImageTextBlock(style, (line) => mctx.measureText(line || ' ').width);

  const bitmap = createBitmap(Math.max(1, Math.ceil(layout.width)), Math.max(1, Math.ceil(layout.height)));
  const ctx = bitmap.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire text rasterization context.');
  ctx.font = imageTextCanvasFont(style);
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'alphabetic';

  for (const line of layout.lines) {
    drawTextLine(ctx, line.text, line.x, line.baseline, style.letterSpacing, style.warp, layout.width, line.width);
  }

  return bitmap;
}

export function updateTextLayerFromStyle(
  layer: ImageLayer,
  patch: Partial<ImageTextLayerStyle>,
): ImageLayer {
  const style = normalizeImageTextStyle({ ...(layer.text ?? DEFAULT_IMAGE_TEXT_STYLE), ...patch });
  return {
    ...layer,
    name: buildTextLayerName(style.content),
    type: 'text',
    bitmap: rasterizeImageTextStyle(style),
    bitmapVersion: layer.bitmapVersion + 1,
    text: style,
    metadata: { ...layer.metadata, editableText: true },
  };
}

function splitTextLines(content: string): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.trimEnd());
  const meaningful = lines.filter((line) => line.trim().length > 0);
  return meaningful.length > 0 ? meaningful : [''];
}

function wrapTextLines(
  lines: string[],
  maxWidth: number,
  measureLine: (line: string) => number,
): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push('');
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (measureLine(candidate) <= maxWidth || current.length === 0) {
        current = candidate;
      } else {
        wrapped.push(current);
        current = word;
      }
    }
    wrapped.push(current);
  }
  return wrapped;
}

function drawTextLine(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  letterSpacing: number,
  warp: ImageTextLayerStyle['warp'],
  blockWidth: number,
  lineWidth: number,
): void {
  if (!letterSpacing && warp === 'none') {
    ctx.fillText(text, x, baseline);
    return;
  }
  let cursor = x;
  for (const char of text) {
    const charY = baseline + warpOffset(cursor + lineWidth / 2, blockWidth, warp);
    ctx.fillText(char, cursor, charY);
    cursor += ctx.measureText(char).width + letterSpacing;
  }
}

function measureSpacedLine(
  line: string,
  letterSpacing: number,
  measureLine: (line: string) => number,
): number {
  if (!line) return measureLine(' ');
  return measureLine(line) + Math.max(0, line.length - 1) * letterSpacing;
}

function warpOffset(x: number, width: number, warp: ImageTextLayerStyle['warp']): number {
  if (warp === 'none' || width <= 0) return 0;
  const centered = x / width - 0.5;
  if (warp === 'arc') return -Math.cos(centered * Math.PI) * 8 + 8;
  return Math.sin(centered * Math.PI * 2) * 5;
}

function normalizeOptionalDimension(value: number | null | undefined, min: number, max: number): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
