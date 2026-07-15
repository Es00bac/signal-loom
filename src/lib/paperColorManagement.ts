// Print color management for the Paper workspace — the shared color core that the real KDP / PDF/X
// exporters and the IDML CMYK-swatch writer all resolve every fill/stroke/text color through.
//
// Design (docs/notes/835):
// - Colors AUTHORED as CMYK or spot swatches are already press values → emitted verbatim, `approximate:
//   false`. Only RGB/hex content is converted, and that conversion is EXPLICITLY flagged so nothing is
//   ever silently presented as press-accurate.
// - The RGB→CMYK conversion is a swappable seam (`IccCmykTransform`). The default is the naive device
//   formula from `paperSwatches` (honestly labeled `approximate`); the real path is a bundled lcms2/ICC
//   backend, injected later — this module never hard-codes a fake "ICC" result.
// - Pure + canvas-free so it is unit-testable and runs in the browser, Electron, and Node tests alike.

import type { PaperBlackPolicy, PaperDocument, PaperFrame } from '../types/paper';
import {
  cmykToRgb,
  parseHexColor,
  rgbToCmyk,
  totalInkPercent,
  type PaperCmyk,
  type PaperRgb,
  type PaperSwatch,
} from './paperSwatches';

/**
 * Swappable RGB→CMYK conversion. The default (`APPROXIMATE_CMYK_TRANSFORM`) is a device formula and is
 * NOT press-accurate; a real transform is backed by an ICC profile via lcms2 (note 835). Any color that
 * passes through a non-`icc` transform is marked `approximate` downstream.
 */
export interface IccCmykTransform {
  readonly kind: 'approximate' | 'icc';
  /** Human label for provenance/preflight (e.g. the profile name). */
  readonly profileName: string;
  rgbToCmyk(rgb: PaperRgb): PaperCmyk;
  /**
   * Bulk convert an interleaved 8-bit RGB image buffer (3 bytes/pixel, `pixelCount` pixels) to
   * interleaved 8-bit CMYK (4 bytes/pixel, 0 = no ink … 255 = full ink — the raw DeviceCMYK sample
   * form used directly as PDF image data). Present so the raster PDF/X exporter converts a whole page
   * in one call; the ICC backend routes this straight through lcms2 (`cmsDoTransform` over the buffer).
   */
  transformRgbBuffer?(rgb: Uint8Array, pixelCount: number): Uint8Array;
}

export const APPROXIMATE_CMYK_TRANSFORM: IccCmykTransform = {
  kind: 'approximate',
  profileName: 'Naive device CMYK (not press-accurate)',
  rgbToCmyk: (rgb) => rgbToCmyk(rgb),
  transformRgbBuffer: (rgb, pixelCount) => {
    const out = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i += 1) {
      const s = i * 3;
      const cmyk = rgbToCmyk({ r: rgb[s], g: rgb[s + 1], b: rgb[s + 2] });
      const d = i * 4;
      out[d] = Math.round((clampPercent(cmyk.c) / 100) * 255);
      out[d + 1] = Math.round((clampPercent(cmyk.m) / 100) * 255);
      out[d + 2] = Math.round((clampPercent(cmyk.y) / 100) * 255);
      out[d + 3] = Math.round((clampPercent(cmyk.k) / 100) * 255);
    }
    return out;
  },
};

export type PrintColorSpace = 'cmyk' | 'separation' | 'gray';

/** A fully-resolved color ready to emit as a PDF/IDML color operator. */
export interface PrintColor {
  space: PrintColorSpace;
  /** Process CMYK channels (0–100). For `separation`, this is the alternate/tint-100 CMYK. */
  cmyk: PaperCmyk;
  /** Spot/separation ink name (set only when `space === 'separation'`). */
  spotName?: string;
  /** Separation tint, 0–100 (set only when `space === 'separation'`). */
  tintPercent?: number;
  /** True when the CMYK was derived from RGB by a non-ICC transform (i.e. not a press value). */
  approximate: boolean;
  /** Provenance of the conversion, for preflight/labeling. */
  profileName: string;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function roundCmyk(cmyk: PaperCmyk): PaperCmyk {
  return {
    c: Math.round(clampPercent(cmyk.c)),
    m: Math.round(clampPercent(cmyk.m)),
    y: Math.round(clampPercent(cmyk.y)),
    k: Math.round(clampPercent(cmyk.k)),
  };
}

/** Relative luminance (0 dark – 255 light) of a CMYK color's screen RGB — used to detect "black-ish". */
function cmykLuminance(cmyk: PaperCmyk): number {
  const { r, g, b } = cmykToRgb(cmyk);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Resolve a raw hex/CSS-hex color to a print CMYK color through the given transform. */
export function resolvePrintColorFromHex(
  hex: string,
  transform: IccCmykTransform = APPROXIMATE_CMYK_TRANSFORM,
): PrintColor {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    // Unparseable → treat as registration-safe black rather than guessing a wrong color.
    return { space: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 100 }, approximate: false, profileName: 'fallback-black' };
  }
  return {
    space: 'cmyk',
    cmyk: roundCmyk(transform.rgbToCmyk(rgb)),
    approximate: transform.kind !== 'icc',
    profileName: transform.profileName,
  };
}

/** Resolve a document swatch (CMYK/spot = press-accurate; rgb = converted) to a print color. */
export function resolvePrintColorFromSwatch(
  swatch: PaperSwatch,
  tintPercent = 100,
  transform: IccCmykTransform = APPROXIMATE_CMYK_TRANSFORM,
): PrintColor {
  const tint = clampPercent(tintPercent);
  if (swatch.type === 'spot') {
    const base = swatch.cmyk ?? roundCmyk(transform.rgbToCmyk(swatch.rgb));
    return {
      space: 'separation',
      cmyk: roundCmyk(base),
      spotName: swatch.spotName ?? swatch.name,
      tintPercent: tint,
      approximate: !swatch.cmyk && transform.kind !== 'icc',
      profileName: swatch.cmyk ? 'authored-spot' : transform.profileName,
    };
  }
  if (swatch.model === 'cmyk' && swatch.cmyk) {
    return { space: 'cmyk', cmyk: scaleTint(swatch.cmyk, tint), approximate: false, profileName: 'authored-cmyk' };
  }
  if (swatch.model === 'gray' && swatch.grayPercent !== undefined) {
    return { space: 'gray', cmyk: { c: 0, m: 0, y: 0, k: Math.round(clampPercent(swatch.grayPercent) * (tint / 100)) }, approximate: false, profileName: 'authored-gray' };
  }
  return {
    space: 'cmyk',
    cmyk: scaleTint(roundCmyk(transform.rgbToCmyk(swatch.rgb)), tint),
    approximate: transform.kind !== 'icc',
    profileName: transform.profileName,
  };
}

/** A tint (0–100) of a CMYK color = each channel scaled toward paper. */
function scaleTint(cmyk: PaperCmyk, tintPercent: number): PaperCmyk {
  const t = clampPercent(tintPercent) / 100;
  return roundCmyk({ c: cmyk.c * t, m: cmyk.m * t, y: cmyk.y * t, k: cmyk.k * t });
}

export interface InkLimitResult {
  cmyk: PaperCmyk;
  /** True when the input exceeded the limit and was reduced. */
  reduced: boolean;
  originalTotal: number;
  finalTotal: number;
}

/**
 * Enforce a total-ink-coverage limit (e.g. 300% for coated, 240% for newsprint) by reducing C/M/Y
 * proportionally while preserving K (a simple UCR). Black beyond the limit is capped last.
 */
export function enforceInkLimit(cmyk: PaperCmyk, limitPercent: number): InkLimitResult {
  const limit = Math.max(0, limitPercent);
  const input = roundCmyk(cmyk);
  const originalTotal = totalInkPercent(input);
  if (originalTotal <= limit) {
    return { cmyk: input, reduced: false, originalTotal, finalTotal: originalTotal };
  }
  const excess = originalTotal - limit;
  const cmyTotal = input.c + input.m + input.y;
  let out: PaperCmyk;
  if (cmyTotal <= 0) {
    out = { c: 0, m: 0, y: 0, k: Math.min(input.k, limit) };
  } else {
    const scale = Math.max(0, (cmyTotal - excess) / cmyTotal);
    out = roundCmyk({ c: input.c * scale, m: input.m * scale, y: input.y * scale, k: input.k });
    if (totalInkPercent(out) > limit) out = { ...out, k: Math.max(0, limit - (out.c + out.m + out.y)) };
  }
  return { cmyk: out, reduced: true, originalTotal, finalTotal: totalInkPercent(out) };
}

/**
 * Apply the document's black policy. `force-100k-text` rewrites near-black TEXT to pure K (0/0/0/100)
 * to avoid rich-black registration fringing; other policies leave the color unchanged (warnings come
 * from preflight).
 */
export function applyBlackPolicy(color: PrintColor, policy: PaperBlackPolicy, isText: boolean): PrintColor {
  if (policy === 'force-100k-text' && isText && color.space !== 'separation' && cmykLuminance(color.cmyk) < 24) {
    return { ...color, space: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 100 }, approximate: false };
  }
  return color;
}

/** True when a color is a "rich black" (black-ish but with CMY under the K) — a registration risk for text. */
export function isRichBlack(cmyk: PaperCmyk): boolean {
  return cmykLuminance(cmyk) < 24 && cmyk.c + cmyk.m + cmyk.y > 0;
}

export interface PrintColorPreflight {
  warnings: string[];
  /** Frames whose color came from a non-ICC (approximate) conversion. */
  approximateColorFrameCount: number;
  /** Frames whose CMYK exceeds the ink limit. */
  overInkFrameCount: number;
  /** Text frames set in rich black (registration risk). */
  richBlackTextFrameCount: number;
}

function frameIsText(frame: PaperFrame): boolean {
  return frame.kind === 'text' || frame.kind === 'caption' || frame.kind === 'speechBubble' || frame.kind === 'thoughtBubble';
}

/**
 * Preflight the document's colors for print: reports RGB-derived (approximate) colors, ink-limit
 * overages, and rich-black text. Strict production output blocks TAC overages rather than silently
 * rewriting authored CMYK; the report tells the user exactly what needs correction.
 */
export function collectPrintColorPreflight(
  document: PaperDocument,
  options: { inkLimitPercent?: number; transform?: IccCmykTransform } = {},
): PrintColorPreflight {
  const transform = options.transform ?? APPROXIMATE_CMYK_TRANSFORM;
  const inkLimit = options.inkLimitPercent ?? document.printProduction.totalInkLimitPercent ?? 300;
  const swatchById = new Map((document.swatches ?? []).map((swatch) => [swatch.id, swatch]));
  const warnings: string[] = [];
  let approximateColorFrameCount = 0;
  let overInkFrameCount = 0;
  let richBlackTextFrameCount = 0;

  const consider = (raw: string | undefined, swatchId: string | undefined, frame: PaperFrame) => {
    if (!raw || raw === 'transparent') return;
    const swatch = swatchId ? swatchById.get(swatchId) : undefined;
    const color = swatch
      ? resolvePrintColorFromSwatch(swatch, 100, transform)
      : resolvePrintColorFromHex(raw, transform);
    if (color.approximate) approximateColorFrameCount += 1;
    if (totalInkPercent(color.cmyk) > inkLimit) overInkFrameCount += 1;
    if (frameIsText(frame) && isRichBlack(color.cmyk)) richBlackTextFrameCount += 1;
  };

  for (const page of document.pages) {
    for (const frame of page.frames) {
      consider(frame.fillColor, frame.fillSwatchId, frame);
      consider(frame.strokeColor, frame.strokeSwatchId, frame);
      if (frameIsText(frame)) consider(frame.typography.color, frame.typography.colorSwatchId, frame);
    }
  }

  if (approximateColorFrameCount > 0) {
    warnings.push(`${approximateColorFrameCount} color(s) were converted from RGB with an approximate (non-ICC) profile — not guaranteed press-accurate.`);
  }
  if (overInkFrameCount > 0) {
    warnings.push(`${overInkFrameCount} color(s) exceed the ${inkLimit}% total-ink limit and block strict production export until corrected.`);
  }
  if (richBlackTextFrameCount > 0) {
    warnings.push(`${richBlackTextFrameCount} text element(s) use a rich black — consider 100% K text to avoid registration fringing.`);
  }
  return { warnings, approximateColorFrameCount, overInkFrameCount, richBlackTextFrameCount };
}

/** CMYK channels as PDF operator values (0–1). */
export function cmykToPdfComponents(cmyk: PaperCmyk): [number, number, number, number] {
  return [clampPercent(cmyk.c) / 100, clampPercent(cmyk.m) / 100, clampPercent(cmyk.y) / 100, clampPercent(cmyk.k) / 100];
}
