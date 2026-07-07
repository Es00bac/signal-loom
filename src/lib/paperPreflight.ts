import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument, PaperFrame, PaperImportedFont, PaperPage } from '../types/paper';
import {
  buildPaperPrintProductionMetadata,
  isPdfXProductionTarget,
} from './paperPrintProduction';
import { classifyFontFamily, isDisplayFontFamily } from './paperFontResolution';
import { normalizeFamilyName, resolveTextFace } from './paperFontLibrary';
import { findUncoveredCharacters } from './paperFontVetting';
import { collectSpotFills } from './paperPdfxSpotFills';
import { resolveTextSpot } from './paperPdfxVectorTextFrames';

const LIBERATION_SUBSTITUTE_NAME: Record<'serif' | 'sans' | 'mono', string> = {
  serif: 'Liberation Serif',
  sans: 'Liberation Sans',
  mono: 'Liberation Mono',
};

/** True when a referenced family matches an embeddable imported font (so it embeds as the real face). */
function familyHasImportedFace(family: string, importedFonts: readonly PaperImportedFont[] | undefined): boolean {
  const norm = normalizeFamilyName(family);
  if (!norm) return false;
  return (importedFonts ?? []).some((f) => f.embeddable && normalizeFamilyName(f.familyName) === norm);
}

/**
 * For every text/caption frame whose font resolves to an imported face, collect the distinct characters the
 * imported font can't render, keyed by the family that gets embedded. Those characters fall back to a
 * substitute font (rendered as raster pixels, not embedded as selectable vector in the user's font), so the
 * user should know before they hand the file off. Uses the SAME resolution + coverage the exporter uses, so
 * the disclosure matches what actually happens. Empty map = every imported font covers all of its text.
 */
function collectUncoveredImportedGlyphs(document: PaperDocument): Map<string, string[]> {
  const missingByFamily = new Map<string, string[]>();
  const seenByFamily = new Map<string, Set<string>>();
  for (const page of document.pages) {
    for (const frame of page.frames) {
      if (frame.kind !== 'text' && frame.kind !== 'caption') continue;
      const text = frame.text ?? '';
      if (!text.trim()) continue;
      const face = resolveTextFace(frame.typography, document.importedFonts);
      if (!face.embeddedReal || !face.bytes) continue; // only the user's own imported faces are at issue
      const uncovered = findUncoveredCharacters(face.bytes, text);
      if (uncovered.length === 0) continue;
      let seen = seenByFamily.get(face.familyName);
      if (!seen) {
        seen = new Set();
        seenByFamily.set(face.familyName, seen);
        missingByFamily.set(face.familyName, []);
      }
      const list = missingByFamily.get(face.familyName)!;
      for (const ch of uncovered) {
        if (seen.has(ch)) continue;
        seen.add(ch);
        list.push(ch);
      }
    }
  }
  return missingByFamily;
}

export type PaperPreflightSeverity = 'error' | 'warning' | 'info';
export type PaperPreflightProfileId = 'generic-pdf' | 'comic-print' | 'manga-print' | 'webtoon';
export type PaperPreflightCategory = 'document' | 'links' | 'fonts' | 'color' | 'production' | 'resolution' | 'text' | 'layout';

export interface PaperPreflightProfile {
  id: PaperPreflightProfileId;
  name: string;
  minBleedMm: number;
  minSafeMarginMm: number;
  minPrintPpi: number;
  warnRgbForPrint: boolean;
  requirePageMultipleOfFour: boolean;
}

export interface PaperPreflightIssue {
  id: string;
  severity: PaperPreflightSeverity;
  title: string;
  detail: string;
  pageNumber?: number;
  frameId?: string;
  category?: PaperPreflightCategory;
}

export type PaperLinkedAssetStatus = 'ok' | 'missing' | 'embedded' | 'unknown' | 'stale';

export interface PaperLinkedAssetInfo {
  id: string;
  status: PaperLinkedAssetStatus;
  sourceLabel: string;
  sourceId?: string;
  pageNumber: number;
  frameId: string;
  frameLabel: string;
  effectivePpi?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  detail: string;
}

export interface PaperPreflightReport {
  issues: PaperPreflightIssue[];
  counts: Record<PaperPreflightSeverity, number>;
  profile: PaperPreflightProfile;
  groups: Array<{ category: PaperPreflightCategory; issues: PaperPreflightIssue[] }>;
  fontInventory: PaperFontInventoryItem[];
  colorInventory: PaperColorInventoryItem[];
}

export type PaperPreflightStatusTone = 'ready' | 'info' | 'warning' | 'error';

export interface PaperPreflightStatusSummary {
  tone: PaperPreflightStatusTone;
  label: string;
  countsLabel: string;
  detail: string;
}

export interface PaperFontInventoryItem {
  family: string;
  usages: number;
  available?: boolean;
}

export interface PaperColorInventoryItem {
  value: string;
  usage: 'fill' | 'stroke' | 'text' | 'background';
  rgbLike: boolean;
  usages: number;
}

export const PAPER_PREFLIGHT_PROFILES: Record<PaperPreflightProfileId, PaperPreflightProfile> = {
  'generic-pdf': { id: 'generic-pdf', name: 'Generic PDF', minBleedMm: 3, minSafeMarginMm: 3, minPrintPpi: 150, warnRgbForPrint: false, requirePageMultipleOfFour: false },
  'comic-print': { id: 'comic-print', name: 'Comic Print', minBleedMm: 3, minSafeMarginMm: 5, minPrintPpi: 300, warnRgbForPrint: true, requirePageMultipleOfFour: true },
  'manga-print': { id: 'manga-print', name: 'Manga Print', minBleedMm: 3, minSafeMarginMm: 5, minPrintPpi: 300, warnRgbForPrint: true, requirePageMultipleOfFour: true },
  webtoon: { id: 'webtoon', name: 'Webtoon', minBleedMm: 0, minSafeMarginMm: 0, minPrintPpi: 96, warnRgbForPrint: false, requirePageMultipleOfFour: false },
};

export function analyzePaperPreflight(
  document: PaperDocument,
  sourceItems: SourceBinLibraryItem[] = [],
  profileId: PaperPreflightProfileId = defaultPreflightProfileId(document),
): PaperPreflightReport {
  const profile = PAPER_PREFLIGHT_PROFILES[profileId] ?? PAPER_PREFLIGHT_PROFILES['generic-pdf'];
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const issues: PaperPreflightIssue[] = [];

  if (document.page.bleedMm < profile.minBleedMm) {
    issues.push(issue('warning', document.page.bleedMm <= 0 ? 'No bleed configured' : 'Bleed may be narrow', `${document.page.bleedMm} mm bleed is below the ${profile.minBleedMm} mm ${profile.name} target.`, { category: 'document' }));
  }

  const minMargin = Math.min(
    document.layout.marginsMm.top,
    document.layout.marginsMm.right,
    document.layout.marginsMm.bottom,
    document.layout.marginsMm.left,
  );
  if (minMargin < profile.minSafeMarginMm) {
    issues.push(issue('warning', 'Margins may be unsafe', `One or more margins are under ${profile.minSafeMarginMm} mm, which is risky for trim-safe lettering.`, { category: 'layout' }));
  }

  if (profile.requirePageMultipleOfFour && document.pages.length % 4 !== 0) {
    issues.push(issue('info', 'Comic page count is not printer-friendly', 'Saddle-stitched comic books are usually imposed in page counts divisible by 4.', { category: 'document' }));
  }

  const fontInventory = collectPaperFontInventory(document);
  const colorInventory = collectPaperColorInventory(document);
  issues.push(...analyzePrintProduction(document, colorInventory));
  for (const font of fontInventory) {
    if (font.available === false) {
      issues.push(issue('warning', 'Font may be unavailable', `${font.family} is referenced but not reported as available by the browser.`, { category: 'fonts' }));
    }
  }
  // Honest disclosure: PDF/X exports embed real vector text. A font the user IMPORTED is embedded as their
  // actual face (subset); everything else falls back to a metric-compatible Liberation face (we can't
  // legally embed arbitrary system fonts). Display/decorative faces have no faithful Liberation stand-in,
  // so — unless the real font was imported — their text is RASTERIZED (real glyphs) instead of substituted.
  // The three outcomes are disclosed separately so they're never conflated.
  if (isPdfXProductionTarget(document.printProduction)) {
    const substitutions = new Map<string, string>();
    const rasterized = new Set<string>();
    const embeddedReal = new Set<string>();
    for (const font of fontInventory) {
      if (familyHasImportedFace(font.family, document.importedFonts)) {
        embeddedReal.add(font.family);
        continue;
      }
      if (isDisplayFontFamily(font.family)) {
        rasterized.add(font.family);
        continue;
      }
      const target = LIBERATION_SUBSTITUTE_NAME[classifyFontFamily(font.family)];
      if (font.family.trim().toLowerCase() === target.toLowerCase()) continue; // already the substitute
      substitutions.set(font.family, target);
    }
    if (embeddedReal.size > 0) {
      const list = [...embeddedReal].join('; ');
      issues.push(issue(
        'info',
        'Fonts embedded as your imported font',
        `${list}: your uploaded font is embedded as real, selectable vector text (subset) — no substitution.`,
        { category: 'fonts' },
      ));
    }
    // Some of that imported-font text may use characters the font has no glyph for (e.g. an accented letter,
    // a symbol, a dash). Those fall back to a substitute font as raster pixels — NOT embedded as selectable
    // vector in the user's font — so disclose exactly which characters, per family, before hand-off.
    for (const [family, chars] of collectUncoveredImportedGlyphs(document)) {
      const shown = chars.slice(0, 12).map((c) => `“${c}”`).join(' ');
      const more = chars.length > 12 ? ` (+${chars.length - 12} more)` : '';
      issues.push(issue(
        'warning',
        'Imported font is missing some glyphs',
        `${family} has no glyph for ${shown}${more}. That text falls back to another font as raster pixels — it won't be selectable vector in your font. Use a font that includes these characters, or accept the fallback.`,
        { category: 'fonts' },
      ));
    }
    if (substitutions.size > 0) {
      const list = [...substitutions.entries()].map(([from, to]) => `${from} → ${to}`).join('; ');
      issues.push(issue(
        'info',
        'Fonts embedded as Liberation substitutes',
        `PDF/X embeds selectable vector text with metric-compatible open fonts: ${list}. Set text in Liberation Serif/Sans/Mono to match the print exactly.`,
        { category: 'fonts' },
      ));
    }
    if (rasterized.size > 0) {
      const list = [...rasterized].join('; ');
      issues.push(issue(
        'info',
        'Display fonts kept as raster',
        `${list}: display/decorative faces have no faithful open substitute, so their text is rendered as high-resolution pixels (its real look is preserved, but it isn't selectable). Other text stays selectable vector.`,
        { category: 'fonts' },
      ));
    }
  }
  if (profile.warnRgbForPrint) {
    for (const color of colorInventory.filter((entry) => entry.rgbLike)) {
      issues.push(issue('info', 'RGB color used for print', `${color.value} is used as ${color.usage}; confirm printer color conversion.`, { category: 'color' }));
    }
  }

  for (const page of document.pages) {
    for (const frame of page.frames) {
      issues.push(...analyzeFrame(page, frame, sourceById, profile));
    }
  }

  return {
    issues,
    counts: {
      error: issues.filter((candidate) => candidate.severity === 'error').length,
      warning: issues.filter((candidate) => candidate.severity === 'warning').length,
      info: issues.filter((candidate) => candidate.severity === 'info').length,
    },
    profile,
    groups: groupIssuesByCategory(issues),
    fontInventory,
    colorInventory,
  };
}

export function collectPaperLinkedAssets(
  document: PaperDocument,
  sourceItems: SourceBinLibraryItem[] = [],
): PaperLinkedAssetInfo[] {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const assets: PaperLinkedAssetInfo[] = [];

  for (const page of document.pages) {
    for (const frame of page.frames) {
      if (!['image', 'document'].includes(frame.kind) || !frame.asset) continue;
      assets.push(resolveLinkedAssetInfo(page, frame, sourceById));
    }
  }

  return assets;
}

export function summarizePreflightForExport(report: Pick<PaperPreflightReport, 'issues' | 'counts'>): string | undefined {
  const blockingCount = report.counts.error + report.counts.warning;
  if (blockingCount <= 0) return undefined;

  const parts = [
    report.counts.error ? `${report.counts.error} error${report.counts.error === 1 ? '' : 's'}` : '',
    report.counts.warning ? `${report.counts.warning} warning${report.counts.warning === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const notable = report.issues
    .filter((issue) => issue.severity !== 'info')
    .slice(0, 5)
    .map((issue) => `- ${issue.pageNumber ? `Page ${issue.pageNumber}: ` : ''}${issue.title}`)
    .join('\n');

  return `Preflight found ${parts.join(' and ')}.\n\n${notable}${report.issues.length > 5 ? '\n- More issues in the Paper inspector.' : ''}`;
}

export function summarizePaperPreflightStatus(report: Pick<PaperPreflightReport, 'issues' | 'counts'>): PaperPreflightStatusSummary {
  const countsLabel = [
    formatIssueCount(report.counts.error, 'error'),
    formatIssueCount(report.counts.warning, 'warning'),
    formatIssueCount(report.counts.info, 'info'),
  ].filter(Boolean).join(', ') || '0 issues';

  if (report.counts.error > 0) {
    return {
      tone: 'error',
      label: formatIssueCount(report.counts.error, 'error'),
      countsLabel,
      detail: buildPersistentPreflightDetail(report, 'error'),
    };
  }

  if (report.counts.warning > 0) {
    return {
      tone: 'warning',
      label: formatIssueCount(report.counts.warning, 'warning'),
      countsLabel,
      detail: buildPersistentPreflightDetail(report, 'warning'),
    };
  }

  if (report.counts.info > 0) {
    return {
      tone: 'info',
      label: 'Info only',
      countsLabel,
      detail: buildPersistentPreflightDetail(report, 'info'),
    };
  }

  return {
    tone: 'ready',
    label: 'Ready',
    countsLabel,
    detail: 'No Paper preflight issues detected.',
  };
}

function buildPersistentPreflightDetail(
  report: Pick<PaperPreflightReport, 'issues' | 'counts'>,
  severity: PaperPreflightSeverity,
): string {
  const firstIssue = report.issues.find((issue) => issue.severity === severity) ?? report.issues[0];
  const countSummary = [
    formatIssueCount(report.counts.error, 'error'),
    formatIssueCount(report.counts.warning, 'warning'),
    formatIssueCount(report.counts.info, 'info'),
  ].filter(Boolean).join(' and ');
  const prefix = `Preflight found ${countSummary}.`;
  if (!firstIssue) return prefix;
  return `${prefix} First: ${firstIssue.pageNumber ? `Page ${firstIssue.pageNumber}: ` : ''}${firstIssue.title}.`;
}

function formatIssueCount(count: number, noun: PaperPreflightSeverity): string {
  if (count <= 0) return '';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function analyzeFrame(page: PaperPage, frame: PaperFrame, sourceById: Map<string, SourceBinLibraryItem>, profile: PaperPreflightProfile): PaperPreflightIssue[] {
  const issues: PaperPreflightIssue[] = [];
  const base = { pageNumber: page.pageNumber, frameId: frame.id };

  if (frame.kind === 'document') {
    if (!frame.asset?.sourceBinItemId && !frame.asset?.src) {
      issues.push(issue('error', 'Empty document frame', `${frame.label} has no linked document.`, { ...base, category: 'links' }));
    } else {
      const linkedAsset = resolveLinkedAssetInfo(page, frame, sourceById);
      if (frame.asset.sourceBinItemId && !sourceById.has(frame.asset.sourceBinItemId)) {
        issues.push(issue('error', 'Missing linked document', `${frame.asset.label || frame.label} is not present in the Source bin.`, { ...base, category: 'links' }));
      }
      if (!frame.asset.src && !frame.asset.text) {
        issues.push(issue('warning', 'Linked document has no preview source', `${frame.asset.label || frame.label} can be tracked but may not preview or package outside the project.`, { ...base, category: 'links' }));
      }
      if (linkedAsset.status === 'unknown') {
        issues.push(issue('info', 'Document link tracked', `${frame.asset.label || frame.label} is linked for package/preflight tracking.`, { ...base, category: 'links' }));
      }
    }
  }

  if (frame.kind === 'image') {
    if (!frame.asset?.sourceBinItemId && !frame.asset?.src) {
      issues.push(issue('error', 'Empty image frame', `${frame.label} has no linked art.`, { ...base, category: 'links' }));
    } else {
      const linkedAsset = resolveLinkedAssetInfo(page, frame, sourceById);
      if (frame.asset.sourceBinItemId && !sourceById.has(frame.asset.sourceBinItemId)) {
        issues.push(issue('error', 'Missing linked asset', `${frame.asset.label || frame.label} is not present in the Source bin.`, { ...base, category: 'links' }));
      }
      if (!frame.asset.src) {
        issues.push(issue('warning', 'Linked image has no embedded source', `${frame.asset.label || frame.label} may not export outside the current project asset store.`, { ...base, category: 'links' }));
      }
      if (linkedAsset.effectivePpi === undefined) {
        issues.push(issue('info', 'Image resolution unknown', `${frame.asset.label || frame.label} has no pixel dimensions available for DPI validation.`, { ...base, category: 'resolution' }));
      } else if (linkedAsset.effectivePpi < profile.minPrintPpi) {
        issues.push(issue('warning', 'Image resolution is low', `${frame.asset.label || frame.label} is about ${linkedAsset.effectivePpi} effective PPI.`, { ...base, category: 'resolution' }));
      }
    }
  }

  if (['text', 'caption', 'speechBubble', 'thoughtBubble'].includes(frame.kind)) {
    const text = frame.text?.trim() ?? '';
    if (!text) {
      issues.push(issue('warning', 'Empty text frame', `${frame.label} has no lettering or caption text.`, { ...base, category: 'text' }));
    }
    if (looksOverset(frame, text)) {
      issues.push(issue('warning', 'Possible overset text', `${frame.label} may contain more text than its frame can comfortably hold.`, { ...base, category: 'text' }));
    }
  }

  if (frame.kind === 'panel' && !frame.asset && !frame.fillGradient && frame.fillColor === 'transparent') {
    issues.push(issue('info', 'Empty panel placeholder', `${frame.label} is a panel frame without art or fill.`, { ...base, category: 'layout' }));
  }

  return issues;
}

function resolveLinkedAssetInfo(
  page: PaperPage,
  frame: PaperFrame,
  sourceById: Map<string, SourceBinLibraryItem>,
): PaperLinkedAssetInfo {
  const asset = frame.asset;
  const sourceItem = asset?.sourceBinItemId ? sourceById.get(asset.sourceBinItemId) : undefined;
  const sourceWithMetadata = sourceItem as (SourceBinLibraryItem & Partial<PixelMetadata>) | undefined;
  const pixelWidth = firstPositiveNumber(asset?.pixelWidth, sourceWithMetadata?.pixelWidth, sourceWithMetadata?.widthPx, sourceWithMetadata?.width);
  const pixelHeight = firstPositiveNumber(asset?.pixelHeight, sourceWithMetadata?.pixelHeight, sourceWithMetadata?.heightPx, sourceWithMetadata?.height);
  const effectivePpi = pixelWidth && pixelHeight
    ? Math.round(Math.min(pixelWidth / Math.max(0.1, frame.widthMm / 25.4), pixelHeight / Math.max(0.1, frame.heightMm / 25.4)))
    : undefined;
  const sourceLabel = asset?.label || sourceItem?.label || frame.label;
  const status = resolveLinkedAssetStatus(frame, sourceItem, effectivePpi);

  return {
    id: `${page.id}-${frame.id}-${asset?.sourceBinItemId ?? 'embedded'}`,
    status,
    sourceLabel,
    sourceId: asset?.sourceBinItemId,
    pageNumber: page.pageNumber,
    frameId: frame.id,
    frameLabel: frame.label,
    effectivePpi,
    pixelWidth,
    pixelHeight,
    detail: linkedAssetDetail(status, effectivePpi, pixelWidth, pixelHeight),
  };
}

interface PixelMetadata {
  pixelWidth: number;
  pixelHeight: number;
  widthPx: number;
  heightPx: number;
  width: number;
  height: number;
}

function resolveLinkedAssetStatus(
  frame: PaperFrame,
  sourceItem: SourceBinLibraryItem | undefined,
  effectivePpi: number | undefined,
): PaperLinkedAssetStatus {
  if (frame.asset?.sourceBinItemId && !sourceItem) return frame.asset.src ? 'stale' : 'missing';
  if (!frame.asset?.sourceBinItemId && frame.asset?.src) return 'embedded';
  if (effectivePpi === undefined) return 'unknown';
  return 'ok';
}

function linkedAssetDetail(
  status: PaperLinkedAssetStatus,
  effectivePpi: number | undefined,
  pixelWidth: number | undefined,
  pixelHeight: number | undefined,
): string {
  if (status === 'missing') return 'Missing from Source Library.';
  if (status === 'stale') return 'Source Library item is missing, but embedded image data is present.';
  if (status === 'embedded') return 'Embedded image without a live Source Library link.';
  if (effectivePpi !== undefined) return `${pixelWidth} x ${pixelHeight}px, ${effectivePpi} effective PPI.`;
  return 'Linked, but pixel dimensions are unknown.';
}

function firstPositiveNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function looksOverset(frame: PaperFrame, text: string): boolean {
  if (!text) return false;
  const fontSizeMm = Math.max(1, frame.typography.fontSizePt * 0.352778);
  const lineHeightMm = Math.max(fontSizeMm, frame.typography.leadingPt * 0.352778);
  const columns = Math.max(1, Math.round(frame.columns || 1));
  const averageCharsPerLine = Math.max(8, Math.floor((frame.widthMm / columns) / (fontSizeMm * 0.48)));
  const estimatedLines = Math.ceil(text.length / averageCharsPerLine);
  const availableLines = Math.max(1, Math.floor(frame.heightMm / lineHeightMm) * columns);
  return estimatedLines > availableLines;
}

function issue(
  severity: PaperPreflightSeverity,
  title: string,
  detail: string,
  context: Partial<Pick<PaperPreflightIssue, 'pageNumber' | 'frameId' | 'category'>> = {},
): PaperPreflightIssue {
  return {
    id: `${severity}-${context.pageNumber ?? 'doc'}-${context.frameId ?? title}-${title}`,
    severity,
    title,
    detail,
    category: context.category ?? 'document',
    ...context,
  };
}

export function collectPaperFontInventory(document: PaperDocument): PaperFontInventoryItem[] {
  const fonts = new Map<string, PaperFontInventoryItem>();
  for (const page of document.pages) {
    for (const frame of page.frames) {
      const family = frame.typography.fontFamily.trim();
      if (!family) continue;
      const existing = fonts.get(family) ?? { family, usages: 0, available: browserCanCheckFont(family) };
      existing.usages += 1;
      fonts.set(family, existing);
    }
  }
  return [...fonts.values()].sort((a, b) => a.family.localeCompare(b.family));
}

export function collectPaperColorInventory(document: PaperDocument): PaperColorInventoryItem[] {
  const colors = new Map<string, PaperColorInventoryItem>();
  const add = (value: string | undefined, usage: PaperColorInventoryItem['usage']) => {
    if (!value || value === 'transparent') return;
    const key = `${usage}:${value}`;
    const existing = colors.get(key) ?? { value, usage, rgbLike: isRgbLike(value), usages: 0 };
    existing.usages += 1;
    colors.set(key, existing);
  };
  add(document.background.color, 'background');
  add(document.background.fromColor, 'background');
  add(document.background.toColor, 'background');
  for (const page of document.pages) {
    for (const frame of page.frames) {
      add(frame.fillColor, 'fill');
      add(frame.fillGradient?.fromColor, 'fill');
      add(frame.fillGradient?.toColor, 'fill');
      add(frame.strokeColor, 'stroke');
      add(frame.typography.color, 'text');
    }
  }
  return [...colors.values()].sort((a, b) => a.value.localeCompare(b.value));
}

function groupIssuesByCategory(issues: PaperPreflightIssue[]): PaperPreflightReport['groups'] {
  const categories: PaperPreflightCategory[] = ['document', 'links', 'fonts', 'color', 'production', 'resolution', 'text', 'layout'];
  return categories.map((category) => ({ category, issues: issues.filter((issue) => issue.category === category) })).filter((group) => group.issues.length > 0);
}

/** True when the document actually USES (not merely defines) a named spot swatch in a frame colour —
 * either as a fill (fillSwatchId) or as a text colour (typography.colorSwatchId). */
function documentUsesSpotColor(document: PaperDocument): boolean {
  const spotIds = new Set((document.swatches ?? []).filter((swatch) => swatch.type === 'spot').map((swatch) => swatch.id));
  if (spotIds.size === 0) return false;
  for (const page of document.pages) {
    for (const frame of page.frames) {
      // The durable link: a fill applied from a spot swatch records its id in fillSwatchId, and text colour
      // from a spot swatch records typography.colorSwatchId (the CSS colour is only an RGB preview and can't
      // identify the swatch).
      if (frame.fillSwatchId && spotIds.has(frame.fillSwatchId)) return true;
      if (frame.typography?.colorSwatchId && spotIds.has(frame.typography.colorSwatchId)) return true;
    }
  }
  return false;
}

/** Spot ink names carried by text that will actually plate: a non-empty text frame whose colour resolves
 * to a preserved spot (outlined glyphs draw on the named /Separation plate). Empty under any policy but
 * 'preserve-named' since resolveTextSpot gates on it. */
function collectSpotTextNames(document: PaperDocument): string[] {
  const names: string[] = [];
  for (const page of document.pages) {
    for (const frame of page.frames) {
      if (!(frame.text ?? '').trim()) continue;
      const spot = resolveTextSpot(frame, document);
      if (spot) names.push(spot.name);
    }
  }
  return [...new Set(names)];
}

function analyzePrintProduction(
  document: PaperDocument,
  colorInventory: PaperColorInventoryItem[],
): PaperPreflightIssue[] {
  const issues: PaperPreflightIssue[] = [];
  const production = buildPaperPrintProductionMetadata(document);
  const hasRgbColors = colorInventory.some((entry) => entry.rgbLike);

  if (!isPdfXProductionTarget(production) && production.outputIntentColorSpace === 'rgb') {
    return issues;
  }

  if (isPdfXProductionTarget(production) && production.outputIntentColorSpace !== 'cmyk') {
    issues.push(issue('error', 'PDF/X target needs a press output intent', `${production.pdfStandard.toUpperCase()} output should use a printer ICC/output-intent profile, not ${production.outputIntentLabel}.`, { category: 'production' }));
  }

  if (isPdfXProductionTarget(production) && production.outputIntentProfileId === 'custom' && !production.customOutputIntentName.trim()) {
    issues.push(issue('error', 'Custom output intent is unnamed', 'Name the custom press ICC/output-intent profile before exporting a printer handoff package.', { category: 'production' }));
  }

  if (isPdfXProductionTarget(production)) {
    issues.push(issue('info', 'PDF/X export embeds a real ICC output intent', `${production.pdfStandard.toUpperCase()} export converts each page to CMYK through the embedded ${production.outputIntentLabel} output intent, enforces the total-ink limit, and passes ISO 15930 structural validation. Do a final visual proof in Acrobat/Enfocus before press.`, { category: 'production' }));
  }

  if (production.outputIntentColorSpace === 'cmyk' && hasRgbColors) {
    issues.push(issue('warning', 'RGB colors need CMYK proofing', `${production.outputIntentLabel} is a CMYK press target, but editable Paper colors are CSS/RGB values. Check separations, rich black, and total ink coverage in a print-production tool before press handoff.`, { category: 'color' }));
  }

  if (documentUsesSpotColor(document)) {
    if (production.spotColorPolicy === 'preserve-named') {
      const fillNames = document.pages.flatMap((page) => collectSpotFills(page, document).preservedSpotNames);
      const textNames = collectSpotTextNames(document);
      const preserved = [...new Set([...fillNames, ...textNames])];
      if (preserved.length > 0) {
        issues.push(issue('info', 'Spot colors kept as separation plates', `${preserved.join('; ')} export as real /Separation plates (verify with a RIP/separations preview). Spot fills (solid, tinted, rotated, rounded, or polygon shapes) and spot-coloured text plate; a spot used on a stroke/border still converts to process CMYK.`, { category: 'color' }));
      } else {
        issues.push(issue('warning', 'Spot colors will convert to process', `Spot policy is "preserve named", but no spot fill is a plateable shape and no text uses a spot swatch, so every spot ink converts to process. To keep a real /Separation plate, apply the spot swatch to a fill (solid/tinted/rotated/rounded/polygon) or to text.`, { category: 'color' }));
      }
    } else if (production.spotColorPolicy === 'warn') {
      issues.push(issue('warning', 'Named spot colors will convert to process', `Spot inks convert to process CMYK — not kept as separate plates. Set the spot policy to "preserve named" to export solid spot fills as real /Separation plates.`, { category: 'color' }));
    }
    // 'convert-process': the user explicitly chose conversion — no warning.
  }

  if (production.totalInkLimitPercent > 340 && production.outputIntentColorSpace === 'cmyk') {
    issues.push(issue('warning', 'Total ink limit is high', `${production.totalInkLimitPercent}% total area coverage can exceed many coated/uncoated press targets. Confirm the limit with the print provider.`, { category: 'production' }));
  }

  return issues;
}

function defaultPreflightProfileId(document: PaperDocument): PaperPreflightProfileId {
  if (document.page.preset === 'webtoon-panel') return 'webtoon';
  if (document.page.preset === 'manga-digest') return 'manga-print';
  if (document.page.preset === 'comic-book') return 'comic-print';
  return 'generic-pdf';
}

function browserCanCheckFont(family: string): boolean | undefined {
  const fonts = globalThis.document?.fonts;
  if (!fonts?.check) return undefined;
  const firstFamily = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  try {
    return fonts.check(`12px "${firstFamily}"`);
  } catch {
    return undefined;
  }
}

function isRgbLike(value: string): boolean {
  return /^#|^rgba?\(/i.test(value.trim());
}
