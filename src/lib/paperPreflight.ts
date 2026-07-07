import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument, PaperFrame, PaperPage } from '../types/paper';
import {
  buildPaperPrintProductionMetadata,
  isPdfXProductionTarget,
} from './paperPrintProduction';
import { classifyFontFamily, isDisplayFontFamily } from './paperFontResolution';

const LIBERATION_SUBSTITUTE_NAME: Record<'serif' | 'sans' | 'mono', string> = {
  serif: 'Liberation Serif',
  sans: 'Liberation Sans',
  mono: 'Liberation Mono',
};

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
  // Honest disclosure: PDF/X exports embed real vector text using metric-compatible Liberation faces
  // (we can't legally embed arbitrary system fonts). Tell the user which of their fonts get substituted.
  // Display/decorative faces have no faithful Liberation stand-in, so their text is RASTERIZED (real
  // glyphs) instead of substituted — disclosed separately so the two behaviours aren't conflated.
  if (isPdfXProductionTarget(document.printProduction)) {
    const substitutions = new Map<string, string>();
    const rasterized = new Set<string>();
    for (const font of fontInventory) {
      if (isDisplayFontFamily(font.family)) {
        rasterized.add(font.family);
        continue;
      }
      const target = LIBERATION_SUBSTITUTE_NAME[classifyFontFamily(font.family)];
      if (font.family.trim().toLowerCase() === target.toLowerCase()) continue; // already the substitute
      substitutions.set(font.family, target);
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
    issues.push(issue('warning', 'Browser PDF export is not PDF/X-certified', `${production.pdfStandard.toUpperCase()} intent is recorded for handoff metadata, but the built-in browser PDF path does not embed ICC output profiles or validate conformance. Use a press-aware PDF/X converter for final delivery.`, { category: 'production' }));
  }

  if (production.outputIntentColorSpace === 'cmyk' && hasRgbColors) {
    issues.push(issue('warning', 'RGB colors need CMYK proofing', `${production.outputIntentLabel} is a CMYK press target, but editable Paper colors are CSS/RGB values. Check separations, rich black, and total ink coverage in a print-production tool before press handoff.`, { category: 'color' }));
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
