import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type {
  PaperDocument,
  PaperFrame,
  PaperFrameKind,
  PaperFramePatch,
  PaperGuide,
  PaperPage,
  PaperPagePreset,
  PaperPageSpec,
  PaperBackgroundSpec,
  PaperCharacterStyle,
  PaperPrintProductionSpec,
  PaperTypography,
  PaperObjectStyle,
  PaperParagraphStyle,
  PaperParentPage,
  PaperStyleCatalogs,
  PaperTextWrap,
} from '../types/paper';
import {
  buildPaperImageRenderStyle,
  paperTextVerticalAlignToJustifyContent,
  resolvePaperTextBox,
} from './paperLayoutTools';
import { buildPaperBubblePath, resolveBubbleTailCurveHandle } from './paperBubblePaths';
import { buildPaperBubbleConnectorSegments } from './paperBubbleChains';
import {
  appendPaperTextEffectTransform,
  buildPaperTextPaintEffectCssText,
} from './paperTextEffects';
import {
  buildPaperPrintProductionMetadata,
  DEFAULT_PAPER_PRINT_PRODUCTION,
  normalizePaperPrintProductionSpec,
  type PaperPrintProductionMetadata,
} from './paperPrintProduction';

const DEFAULT_DPI = 300;

export const PAPER_PAGE_PRESETS: Record<PaperPagePreset, PaperPageSpec> = {
  custom: { preset: 'custom', widthMm: 215.9, heightMm: 279.4, bleedMm: 3, dpi: DEFAULT_DPI },
  'us-letter': { preset: 'us-letter', widthMm: 215.9, heightMm: 279.4, bleedMm: 3, dpi: DEFAULT_DPI },
  'us-legal': { preset: 'us-legal', widthMm: 215.9, heightMm: 355.6, bleedMm: 3, dpi: DEFAULT_DPI },
  tabloid: { preset: 'tabloid', widthMm: 279.4, heightMm: 431.8, bleedMm: 3, dpi: DEFAULT_DPI },
  a4: { preset: 'a4', widthMm: 210, heightMm: 297, bleedMm: 3, dpi: DEFAULT_DPI },
  a5: { preset: 'a5', widthMm: 148, heightMm: 210, bleedMm: 3, dpi: DEFAULT_DPI },
  'square-8': { preset: 'square-8', widthMm: 203.2, heightMm: 203.2, bleedMm: 3, dpi: DEFAULT_DPI },
  'comic-book': { preset: 'comic-book', widthMm: 170, heightMm: 260, bleedMm: 3.175, dpi: DEFAULT_DPI },
  'manga-digest': { preset: 'manga-digest', widthMm: 127, heightMm: 190.5, bleedMm: 3, dpi: DEFAULT_DPI },
  'webtoon-panel': { preset: 'webtoon-panel', widthMm: 100, heightMm: 178, bleedMm: 0, dpi: DEFAULT_DPI },
};

export const DEFAULT_PAPER_TYPOGRAPHY: PaperTypography = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSizePt: 10,
  leadingPt: 13,
  tracking: 0,
  align: 'left',
  hyphenate: true,
  color: '#111827',
  fontWeight: '400',
  fontStyle: 'normal',
  firstLineIndentMm: 0,
  alignLast: 'auto',
  smallCaps: false,
  numericStyle: 'normal',
  dropCapLines: 0,
  spaceBeforeMm: 0,
  spaceAfterMm: 0,
  lineBreak: 'auto',
};

export const DEFAULT_PAPER_BACKGROUND: PaperBackgroundSpec = {
  type: 'solid',
  color: '#ffffff',
  fromColor: '#ffffff',
  toColor: '#ffffff',
  angleDeg: 90,
  radialShape: 'ellipse',
};

export const DEFAULT_PAPER_STYLES: PaperStyleCatalogs = {
  paragraph: [
    { id: 'para-comic-dialogue', name: 'Comic Dialogue', typography: { fontFamily: 'Inter, system-ui, sans-serif', fontSizePt: 9.5, leadingPt: 11.5, align: 'center', fontWeight: '600', hyphenate: false } },
    { id: 'para-caption', name: 'Caption', typography: { fontFamily: 'Georgia, serif', fontSizePt: 9, leadingPt: 12, align: 'left', fontWeight: '700', hyphenate: true } },
    { id: 'para-sfx', name: 'SFX Display', typography: { fontFamily: 'Impact, Haettenschweiler, sans-serif', fontSizePt: 18, leadingPt: 18, align: 'center', fontWeight: '700', hyphenate: false } },
  ],
  character: [
    { id: 'char-emphasis', name: 'Emphasis', typography: { fontStyle: 'italic', fontWeight: '700' } },
    { id: 'char-whisper', name: 'Whisper', typography: { fontSizePt: 8, tracking: 80, fontStyle: 'italic' } },
  ],
  object: [
    { id: 'obj-panel-frame', name: 'Panel Frame', frame: { fillColor: 'transparent', strokeColor: '#111827', strokeWidthMm: 0.6, strokeStyle: 'solid', cornerRadiusMm: 0, opacity: 1 } },
    { id: 'obj-caption-box', name: 'Caption Box', frame: { fillColor: '#fff4bf', fillOpacity: 1, strokeColor: '#111827', strokeWidthMm: 0.3, cornerRadiusMm: 1.5, opacity: 1 } },
    { id: 'obj-dialogue-bubble', name: 'Dialogue Bubble', frame: { fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#111827', strokeWidthMm: 0.35, cornerRadiusMm: 100, textBoxXPercent: 12, textBoxYPercent: 18, textBoxWidthPercent: 76, textBoxHeightPercent: 50, textVerticalAlign: 'middle' } },
  ],
};

type PaperFrameDraft = Partial<Omit<PaperFrame, 'typography'>> & {
  typography?: Partial<PaperTypography>;
} & Pick<PaperFrame, 'kind' | 'xMm' | 'yMm' | 'widthMm' | 'heightMm'>;

export interface PaperPrintHtmlOptions {
  mediaBox?: 'bleed' | 'trim';
  includeScreenGuides?: boolean;
}

export function createDefaultPaperDocument({
  title = 'Untitled Paper Document',
  preset = 'us-letter',
  dpi = DEFAULT_DPI,
}: {
  title?: string;
  preset?: PaperPagePreset;
  dpi?: number;
} = {}): PaperDocument {
  const now = Date.now();
  const presetPage = PAPER_PAGE_PRESETS[preset] ?? PAPER_PAGE_PRESETS['us-letter'];
  const page = {
    ...presetPage,
    dpi: normalizeDpi(dpi),
  };
  const firstPage = createPaperPage(1, page);

  return {
    id: makeId('paper'),
    title,
    page,
    layout: {
      marginsMm: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
      columns: { count: 2, gutterMm: 5 },
      grid: { enabled: true, sizeMm: 5, subdivisions: 5 },
      baselineGrid: { startMm: 12.7, incrementMm: 4.6 },
    },
    background: DEFAULT_PAPER_BACKGROUND,
    printProduction: DEFAULT_PAPER_PRINT_PRODUCTION,
    view: {
      showRulers: true,
      showGrid: true,
      showBaselineGrid: false,
      showGuides: true,
      showBleed: true,
      showSpreads: false,
      startOnRight: true,
      snapToGuides: false,
      snapToGrid: false,
    },
    parentPages: [createPaperParentPage('A-Parent', page)],
    styles: DEFAULT_PAPER_STYLES,
    pages: [firstPage],
    createdAt: now,
    updatedAt: now,
  };
}

export function paperPixelsFromMm(mm: number, dpi: number): number {
  return Math.round((Math.max(0, mm) / 25.4) * normalizeDpi(dpi));
}

export function updatePaperDocumentSetup(
  doc: PaperDocument,
  patch: {
    preset?: PaperPagePreset;
    widthMm?: number;
    heightMm?: number;
    dpi?: number;
    bleedMm?: number;
    marginsMm?: Partial<PaperDocument['layout']['marginsMm']>;
    columns?: Partial<PaperDocument['layout']['columns']>;
    grid?: Partial<PaperDocument['layout']['grid']>;
    baselineGrid?: Partial<PaperDocument['layout']['baselineGrid']>;
    background?: Partial<PaperDocument['background']>;
    printProduction?: Partial<PaperPrintProductionSpec>;
  },
): PaperDocument {
  const preset = patch.preset ?? doc.page.preset;
  const presetPage = preset !== 'custom'
    ? PAPER_PAGE_PRESETS[preset] ?? PAPER_PAGE_PRESETS['us-letter']
    : undefined;
  const page: PaperPageSpec = {
    preset,
    widthMm: clampMm(patch.widthMm ?? presetPage?.widthMm ?? doc.page.widthMm, 25, 2500),
    heightMm: clampMm(patch.heightMm ?? presetPage?.heightMm ?? doc.page.heightMm, 25, 5000),
    bleedMm: clampMm(patch.bleedMm ?? presetPage?.bleedMm ?? doc.page.bleedMm, 0, 50),
    dpi: normalizeDpi(patch.dpi ?? presetPage?.dpi ?? doc.page.dpi),
  };
  const layout = {
    marginsMm: {
      ...doc.layout.marginsMm,
      ...patch.marginsMm,
    },
    columns: {
      ...doc.layout.columns,
      ...patch.columns,
    },
    grid: {
      ...doc.layout.grid,
      ...patch.grid,
    },
    baselineGrid: {
      ...(doc.layout.baselineGrid ?? { startMm: 12.7, incrementMm: 4.6 }),
      ...patch.baselineGrid,
    },
  };

  layout.marginsMm = {
    top: clampMm(layout.marginsMm.top, 0, page.heightMm / 2),
    right: clampMm(layout.marginsMm.right, 0, page.widthMm / 2),
    bottom: clampMm(layout.marginsMm.bottom, 0, page.heightMm / 2),
    left: clampMm(layout.marginsMm.left, 0, page.widthMm / 2),
  };
  layout.columns = {
    count: Math.max(1, Math.min(24, Math.round(layout.columns.count))),
    gutterMm: clampMm(layout.columns.gutterMm, 0, page.widthMm / 2),
  };
  layout.grid = {
    enabled: Boolean(layout.grid.enabled),
    sizeMm: clampMm(layout.grid.sizeMm, 0.5, 100),
    subdivisions: Math.max(1, Math.min(32, Math.round(layout.grid.subdivisions))),
  };
  layout.baselineGrid = {
    startMm: clampMm(layout.baselineGrid.startMm, 0, page.heightMm),
    incrementMm: clampMm(layout.baselineGrid.incrementMm, 0.5, 100),
  };
  const background = normalizePaperBackground({
    ...(doc.background ?? DEFAULT_PAPER_BACKGROUND),
    ...patch.background,
  });
  const printProduction = normalizePaperPrintProductionSpec({
    ...(doc.printProduction ?? DEFAULT_PAPER_PRINT_PRODUCTION),
    ...patch.printProduction,
  });

  return touch({
    ...doc,
    page,
    layout,
    background,
    printProduction,
    pages: doc.pages.map((paperPage) => ({
      ...paperPage,
      guides: updateDefaultGuidesForPage(paperPage.guides, page),
    })),
  });
}

export function createPaperPage(pageNumber: number, pageSpec: PaperPageSpec): PaperPage {
  return {
    id: makeId(`page-${pageNumber}`),
    pageNumber,
    frames: [],
    guides: defaultGuidesForPage(pageSpec),
  };
}

export function createPaperParentPage(name: string, pageSpec: PaperPageSpec): PaperParentPage {
  return {
    id: makeId('parent-page'),
    name: name.trim() || 'A-Parent',
    frames: [],
    guides: defaultGuidesForPage(pageSpec),
  };
}

export function addPaperParentPage(doc: PaperDocument, name = `Parent ${doc.parentPages.length + 1}`): PaperDocument {
  return touch({ ...doc, parentPages: [...doc.parentPages, createPaperParentPage(name, doc.page)] });
}

export function updatePaperParentPage(doc: PaperDocument, parentPageId: string, patch: Partial<Pick<PaperParentPage, 'name' | 'frames' | 'guides'>>): PaperDocument {
  return touch({
    ...doc,
    parentPages: doc.parentPages.map((parent) => parent.id === parentPageId ? { ...parent, ...patch } : parent),
  });
}

export function deletePaperParentPage(doc: PaperDocument, parentPageId: string): PaperDocument {
  const parentPages = doc.parentPages.filter((parent) => parent.id !== parentPageId);
  return touch({
    ...doc,
    parentPages,
    pages: doc.pages.map((page) => page.parentPageId === parentPageId ? { ...page, parentPageId: undefined } : page),
  });
}

export function assignPaperParentPage(doc: PaperDocument, pageId: string, parentPageId: string | undefined): PaperDocument {
  const resolvedParentId = parentPageId && doc.parentPages.some((parent) => parent.id === parentPageId) ? parentPageId : undefined;
  return touch({
    ...doc,
    pages: doc.pages.map((page) => page.id === pageId ? { ...page, parentPageId: resolvedParentId } : page),
  });
}

export function addFrameToPaperParentPage(
  doc: PaperDocument,
  parentPageId: string,
  frame: PaperFrameDraft,
): { document: PaperDocument; frameId: string } {
  const parent = doc.parentPages.find((candidate) => candidate.id === parentPageId);
  const frameId = frame.id ?? makeId('parent-frame');
  const nextFrame = createPaperFrame({
    ...frame,
    id: frameId,
    locked: true,
    zIndex: frame.zIndex ?? nextPaperFrameZIndex(parent?.frames ?? []),
  });
  return {
    document: updatePaperParentPage(doc, parentPageId, {
      frames: (parent?.frames ?? []).concat(nextFrame),
    }),
    frameId,
  };
}

export function resolvePaperPageInheritedFrames(doc: PaperDocument, page: PaperPage): PaperFrame[] {
  const parent = page.parentPageId ? doc.parentPages.find((candidate) => candidate.id === page.parentPageId) : undefined;
  if (!parent) return [];
  return parent.frames.map((frame) => ({
    ...frame,
    id: `inherited-${parent.id}-${frame.id}-${page.id}`,
    parentPageId: parent.id,
    parentFrameId: frame.id,
    inherited: true,
    locked: true,
    label: `${frame.label} (${parent.name})`,
    zIndex: frame.zIndex - 100000,
  }));
}

export function resolvePaperPageInheritedGuides(doc: PaperDocument, page: PaperPage): PaperGuide[] {
  const parent = page.parentPageId ? doc.parentPages.find((candidate) => candidate.id === page.parentPageId) : undefined;
  if (!parent) return [];
  return parent.guides.map((guide) => ({ ...guide, id: `inherited-${parent.id}-${guide.id}-${page.id}`, label: guide.label ? `${guide.label} (${parent.name})` : parent.name }));
}

export function detachInheritedPaperFrame(doc: PaperDocument, pageId: string, inheritedFrameId: string): { document: PaperDocument; frameId?: string } {
  const page = doc.pages.find((candidate) => candidate.id === pageId);
  if (!page) return { document: doc };
  const inherited = resolvePaperPageInheritedFrames(doc, page).find((frame) => frame.id === inheritedFrameId || frame.parentFrameId === inheritedFrameId);
  if (!inherited) return { document: doc };
  const localFrame = {
    ...inherited,
    id: makeId('frame-override'),
    inherited: false,
    locked: false,
    parentFrameId: inherited.parentFrameId,
    parentPageId: inherited.parentPageId,
    label: inherited.label.replace(/ \([^)]*\)$/, ' override'),
    zIndex: inherited.zIndex + 100000,
  };
  return addFrameToPaperPage(doc, pageId, localFrame);
}

export function resolvePaperPageFramesForOutput(doc: PaperDocument, page: PaperPage): PaperFrame[] {
  return [...resolvePaperPageInheritedFrames(doc, page), ...page.frames]
    .map((frame) => computeEffectivePaperFrame(doc, frame))
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function applyPaperParagraphStyle(doc: PaperDocument, pageId: string, frameId: string, styleId: string | undefined): PaperDocument {
  return updatePaperFrame(doc, pageId, frameId, { paragraphStyleId: styleId });
}

export function applyPaperCharacterStyle(doc: PaperDocument, pageId: string, frameId: string, styleId: string | undefined): PaperDocument {
  return updatePaperFrame(doc, pageId, frameId, { characterStyleId: styleId });
}

export function applyPaperObjectStyle(doc: PaperDocument, pageId: string, frameId: string, styleId: string | undefined): PaperDocument {
  return updatePaperFrame(doc, pageId, frameId, { objectStyleId: styleId });
}

export function redefinePaperStyleFromFrame(doc: PaperDocument, frame: PaperFrame, kind: 'paragraph' | 'character' | 'object'): PaperDocument {
  if (kind === 'paragraph' && frame.paragraphStyleId) {
    return touch({ ...doc, styles: { ...doc.styles, paragraph: doc.styles.paragraph.map((style) => style.id === frame.paragraphStyleId ? { ...style, typography: { ...frame.typography }, columns: frame.columns } : style) } });
  }
  if (kind === 'character' && frame.characterStyleId) {
    return touch({ ...doc, styles: { ...doc.styles, character: doc.styles.character.map((style) => style.id === frame.characterStyleId ? { ...style, typography: { ...frame.typography } } : style) } });
  }
  if (kind === 'object' && frame.objectStyleId) {
    const objectPatch = pickObjectStyleFrame(frame);
    return touch({ ...doc, styles: { ...doc.styles, object: doc.styles.object.map((style) => style.id === frame.objectStyleId ? { ...style, frame: objectPatch } : style) } });
  }
  return doc;
}

export function clearPaperFrameStyleLinks(doc: PaperDocument, pageId: string, frameId: string): PaperDocument {
  return updatePaperFrame(doc, pageId, frameId, { paragraphStyleId: undefined, characterStyleId: undefined, objectStyleId: undefined });
}

export function clearPaperFrameLocalOverrides(doc: PaperDocument, pageId: string, frameId: string): PaperDocument {
  const page = doc.pages.find((candidate) => candidate.id === pageId);
  const frame = page?.frames.find((candidate) => candidate.id === frameId);
  if (!frame) return doc;
  const effective = computeEffectivePaperFrame(doc, { ...createPaperFrame(frame), ...frame });
  return updatePaperFrame(doc, pageId, frameId, {
    typography: effective.typography,
    columns: effective.columns,
    ...pickObjectStyleFrame(effective),
  });
}

export function computeEffectivePaperFrame(doc: Pick<PaperDocument, 'styles'>, frame: PaperFrame): PaperFrame {
  const paragraph = resolveParagraphStyle(doc.styles, frame.paragraphStyleId);
  const character = resolveCharacterStyle(doc.styles, frame.characterStyleId);
  const object = resolveObjectStyle(doc.styles, frame.objectStyleId);
  return {
    ...frame,
    ...object?.frame,
    typography: {
      ...frame.typography,
      ...paragraph?.typography,
      ...character?.typography,
    },
    columns: paragraph?.columns ?? frame.columns,
  };
}

export function addPaperPage(doc: PaperDocument): PaperDocument {
  const pages = [
    ...doc.pages,
    createPaperPage(doc.pages.length + 1, doc.page),
  ];

  return touch({ ...doc, pages });
}

export function duplicatePaperPage(doc: PaperDocument, pageId: string): PaperDocument {
  const source = doc.pages.find((page) => page.id === pageId);
  if (!source) return doc;

  const clone: PaperPage = {
    ...source,
    id: makeId('page-copy'),
    pageNumber: doc.pages.length + 1,
    frames: source.frames.map((frame, index) => ({
      ...frame,
      id: makeId(`frame-copy-${index}`),
      label: `${frame.label} copy`,
    })),
    guides: source.guides.map((guide) => ({ ...guide, id: makeId('guide-copy') })),
  };

  return touch({ ...doc, pages: [...doc.pages, clone] });
}

export function removePaperPage(doc: PaperDocument, pageId: string): PaperDocument {
  if (doc.pages.length <= 1) return doc;
  const pages = renumberPages(doc.pages.filter((page) => page.id !== pageId));
  return touch({ ...doc, pages });
}

export function addFrameToPaperPage(
  doc: PaperDocument,
  pageId: string,
  frame: PaperFrameDraft,
): { document: PaperDocument; frameId: string } {
  const targetPage = doc.pages.find((page) => page.id === pageId);
  const frameId = frame.id ?? makeId('frame');
  const nextFrame = createPaperFrame({
    ...frame,
    id: frameId,
    zIndex: frame.zIndex ?? nextPaperFrameZIndex(targetPage?.frames ?? []),
  });
  const pages = doc.pages.map((page) =>
    page.id === pageId
      ? { ...page, frames: [...page.frames, nextFrame] }
      : page,
  );

  return { document: touch({ ...doc, pages }), frameId };
}

export function nextPaperFrameZIndex(frames: PaperFrame[]): number {
  if (frames.length === 0) return 0;
  return Math.max(...frames.map((frame) => Number.isFinite(frame.zIndex) ? frame.zIndex : 0)) + 1;
}

export function updatePaperFrame(
  doc: PaperDocument,
  pageId: string,
  frameId: string,
  patch: PaperFramePatch,
): PaperDocument {
  let changed = false;
  const pages = doc.pages.map((page) => {
    if (page.id !== pageId) return page;

    let pageChanged = false;
    const frames = page.frames.map((frame) => {
      if (frame.id !== frameId) return frame;
      const nextFrame = patchPaperFrame(frame, patch);
      if (nextFrame === frame) return frame;
      pageChanged = true;
      changed = true;
      return nextFrame;
    });

    if (!pageChanged) return page;
    return {
      ...page,
      frames,
    };
  });

  return changed ? touch({ ...doc, pages }) : doc;
}

function patchPaperFrame(frame: PaperFrame, patch: PaperFramePatch): PaperFrame {
  const { typography, ...framePatch } = patch;
  const frameChanged = hasShallowPatchChange(frame, framePatch);
  const typographyChanged = typography ? hasShallowPatchChange(frame.typography, typography) : false;

  if (!frameChanged && !typographyChanged) return frame;

  return {
    ...frame,
    ...framePatch,
    typography: typographyChanged
      ? { ...frame.typography, ...typography }
      : frame.typography,
  };
}

function hasShallowPatchChange<T extends object>(current: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(([key, value]) => !Object.is(current[key as keyof T], value));
}

export function placeSourceAssetInPaperFrame(
  doc: PaperDocument,
  {
    pageId,
    frameId,
    item,
  }: {
    pageId: string;
    frameId: string;
    item: SourceBinLibraryItem;
  },
): PaperDocument {
  const pages = doc.pages.map((page) => {
    if (page.id !== pageId) return page;

    return {
      ...page,
      frames: page.frames.map((frame) =>
        frame.id === frameId
          ? placeAssetInFrame(frame, item)
          : frame,
      ),
    };
  });

  return touch({ ...doc, pages });
}

export function exportPaperDocumentToPrintHtml(
  doc: PaperDocument,
  options: PaperPrintHtmlOptions = {},
): string {
  const page = normalizePageSpec(doc.page);
  const backgroundCss = paperDocumentBackgroundCss(doc.background);
  const mediaBox = options.mediaBox ?? 'bleed';
  const useBleedMediaBox = mediaBox === 'bleed';
  const sheetWidthMm = useBleedMediaBox ? page.widthMm + page.bleedMm * 2 : page.widthMm;
  const sheetHeightMm = useBleedMediaBox ? page.heightMm + page.bleedMm * 2 : page.heightMm;
  const pageOffsetMm = useBleedMediaBox ? page.bleedMm : 0;
  const pages = doc.pages.map((paperPage) => renderPrintPage(doc, paperPage, page)).join('\n');
  const productionMeta = buildPaperPrintProductionMetadata(doc);
  const screenGuideCss = options.includeScreenGuides ? `
@media screen {
  .paper-page::after {
    content: "";
    position: absolute;
    inset: ${formatMm(doc.layout.marginsMm.top)} ${formatMm(doc.layout.marginsMm.right)} ${formatMm(doc.layout.marginsMm.bottom)} ${formatMm(doc.layout.marginsMm.left)};
    border: 0.2mm dashed rgba(6, 182, 212, 0.5);
    pointer-events: none;
  }
}` : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="signal-loom-paper-dpi" content="${page.dpi}" />
${renderPrintProductionMetaTags(productionMeta)}
<title>${escapeHtml(doc.title)}</title>
<style>
@page {
  size: ${formatMm(sheetWidthMm)} ${formatMm(sheetHeightMm)};
  margin: 0;
  bleed: ${formatMm(page.bleedMm)};
  marks: crop;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #d1d5db; color: #111827; }
html, body { width: ${formatMm(sheetWidthMm)}; min-height: ${formatMm(sheetHeightMm)}; }
body { font-family: Inter, system-ui, sans-serif; }
.paper-sheet {
  position: relative;
  width: ${formatMm(sheetWidthMm)};
  height: ${formatMm(sheetHeightMm)};
  margin: 0;
  overflow: hidden;
  background: ${backgroundCss};
  page-break-after: always;
}
.paper-page {
  position: absolute;
  left: ${formatMm(pageOffsetMm)};
  top: ${formatMm(pageOffsetMm)};
  width: ${formatMm(page.widthMm)};
  height: ${formatMm(page.heightMm)};
  overflow: visible;
  background: ${backgroundCss};
}
.frame { position: absolute; margin: 0; overflow: visible; }
.frame-content { position: absolute; inset: 0; overflow: hidden; }
.frame img { width: 100%; height: 100%; display: block; object-position: center; transform-origin: center; }
.frame-text-content, .frame-speechBubble, .frame-thoughtBubble {
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.frame-speechBubble, .frame-thoughtBubble {
  background: white;
  border: 0.45mm solid #111827;
  border-radius: 50%;
  padding: 4mm;
}
.frame-thoughtBubble {
  border-style: dashed;
}
.bubble-tail {
  position: absolute;
  pointer-events: none;
}
.bubble-tail-speech {
  width: 7mm;
  height: 7mm;
  transform: translate(-50%, -50%) rotate(45deg);
  border-right: 0.45mm solid #111827;
  border-bottom: 0.45mm solid #111827;
  background: white;
}
.bubble-tail-thought, .bubble-tail-thought-small {
  transform: translate(-50%, -50%);
  border: 0.45mm solid #111827;
  border-radius: 50%;
  background: white;
}
.bubble-tail-thought { width: 4mm; height: 4mm; }
.bubble-tail-thought-small { width: 2.5mm; height: 2.5mm; }
.frame-caption {
  background: #fff7cc;
  border: 0.3mm solid #111827;
  padding: 2.5mm;
}
.frame-panel {
  border: 0.6mm solid #111827;
  background: transparent;
}
${screenGuideCss}
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

function renderPrintProductionMetaTags(metadata: PaperPrintProductionMetadata): string {
  const entries: Array<[string, string | number | boolean | undefined]> = [
    ['signal-loom-paper-pdf-standard', metadata.pdfStandard],
    ['signal-loom-paper-output-intent-profile', metadata.outputIntentProfileId],
    ['signal-loom-paper-output-intent-label', metadata.outputIntentLabel],
    ['signal-loom-paper-output-intent-color-space', metadata.outputIntentColorSpace],
    ['signal-loom-paper-output-condition', metadata.outputCondition],
    ['signal-loom-paper-output-intent-registry', metadata.outputIntentRegistryName],
    ['signal-loom-paper-total-ink-limit', metadata.totalInkLimitPercent],
    ['signal-loom-paper-black-policy', metadata.blackPolicy],
    ['signal-loom-paper-spot-color-policy', metadata.spotColorPolicy],
    ['signal-loom-paper-overprint-preview', metadata.overprintPreview],
    ['signal-loom-paper-browser-pdf-press-certified', metadata.browserPdfIsPressCertified],
  ];

  return entries
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([name, value]) => `<meta name="${name}" content="${escapeHtml(String(value))}" />`)
    .join('\n');
}

export function serializePaperDocument(doc: PaperDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parsePaperDocument(json: string): PaperDocument {
  const parsed = JSON.parse(json) as PaperDocument;
  if (!parsed || !Array.isArray(parsed.pages) || !parsed.page) {
    throw new Error('The selected file is not a Signal Loom Paper document.');
  }
  const pageSpec = normalizePageSpec(parsed.page);
  return {
    ...parsed,
    page: pageSpec,
    layout: {
      ...parsed.layout,
      baselineGrid: parsed.layout?.baselineGrid ?? { startMm: 12.7, incrementMm: 4.6 },
    },
    view: {
      showRulers: parsed.view?.showRulers ?? true,
      showGrid: parsed.view?.showGrid ?? true,
      showBaselineGrid: parsed.view?.showBaselineGrid ?? false,
      showGuides: parsed.view?.showGuides ?? true,
      showBleed: parsed.view?.showBleed ?? true,
      showSpreads: parsed.view?.showSpreads ?? false,
      startOnRight: parsed.view?.startOnRight ?? true,
      snapToGuides: parsed.view?.snapToGuides ?? false,
      snapToGrid: parsed.view?.snapToGrid ?? false,
    },
    printProduction: normalizePaperPrintProductionSpec(parsed.printProduction),
    parentPages: Array.isArray(parsed.parentPages) ? parsed.parentPages : [createPaperParentPage('A-Parent', pageSpec)],
    styles: normalizePaperStyles(parsed.styles),
    pages: parsed.pages.map((page) => ({
      ...page,
      parentPageId: page.parentPageId,
      frames: page.frames.map((frame) => createPaperFrame({ ...frame, kind: frame.kind, xMm: frame.xMm, yMm: frame.yMm, widthMm: frame.widthMm, heightMm: frame.heightMm })),
      guides: Array.isArray(page.guides) ? page.guides : defaultGuidesForPage(pageSpec),
    })),
  };
}

export function paperDocumentBackgroundCss(background: Partial<PaperBackgroundSpec> | undefined): string {
  const normalized = normalizePaperBackground(background);
  if (normalized.type === 'linear-gradient') {
    return `linear-gradient(${normalized.angleDeg}deg, ${normalized.fromColor}, ${normalized.toColor})`;
  }
  if (normalized.type === 'radial-gradient') {
    return `radial-gradient(${normalized.radialShape}, ${normalized.fromColor}, ${normalized.toColor})`;
  }
  return normalized.color;
}

function normalizePaperBackground(background: Partial<PaperBackgroundSpec> | undefined): PaperBackgroundSpec {
  const merged = {
    ...DEFAULT_PAPER_BACKGROUND,
    ...background,
  };
  const type = isPaperBackgroundType(merged.type) ? merged.type : DEFAULT_PAPER_BACKGROUND.type;

  return {
    type,
    color: normalizeCssColor(merged.color, DEFAULT_PAPER_BACKGROUND.color),
    fromColor: normalizeCssColor(merged.fromColor, DEFAULT_PAPER_BACKGROUND.fromColor),
    toColor: normalizeCssColor(merged.toColor, DEFAULT_PAPER_BACKGROUND.toColor),
    angleDeg: normalizeBackgroundAngle(merged.angleDeg),
    radialShape: merged.radialShape === 'circle' ? 'circle' : 'ellipse',
  };
}

function normalizePaperStyles(styles: PaperStyleCatalogs | undefined): PaperStyleCatalogs {
  return {
    paragraph: mergeStyles(DEFAULT_PAPER_STYLES.paragraph, styles?.paragraph),
    character: mergeStyles(DEFAULT_PAPER_STYLES.character, styles?.character),
    object: mergeStyles(DEFAULT_PAPER_STYLES.object, styles?.object),
  };
}

function mergeStyles<T extends { id: string }>(defaults: T[], styles: T[] | undefined): T[] {
  const byId = new Map(defaults.map((style) => [style.id, style]));
  for (const style of styles ?? []) byId.set(style.id, { ...byId.get(style.id), ...style });
  return [...byId.values()];
}

function resolveParagraphStyle(styles: PaperStyleCatalogs, styleId: string | undefined): PaperParagraphStyle | undefined {
  return resolveStyle(styles.paragraph, styleId);
}

function resolveCharacterStyle(styles: PaperStyleCatalogs, styleId: string | undefined): PaperCharacterStyle | undefined {
  return resolveStyle(styles.character, styleId);
}

function resolveObjectStyle(styles: PaperStyleCatalogs, styleId: string | undefined): PaperObjectStyle | undefined {
  return resolveStyle(styles.object, styleId);
}

function resolveStyle<T extends { id: string; basedOnId?: string }>(styles: T[], styleId: string | undefined, seen = new Set<string>()): T | undefined {
  if (!styleId || seen.has(styleId)) return undefined;
  const style = styles.find((candidate) => candidate.id === styleId);
  if (!style) return undefined;
  if (!style.basedOnId) return style;
  seen.add(styleId);
  const base = resolveStyle(styles, style.basedOnId, seen);
  if (!base) return style;
  if ('typography' in style) {
    const baseTypography = (base as unknown as PaperParagraphStyle | PaperCharacterStyle).typography;
    const styleTypography = (style as unknown as PaperParagraphStyle | PaperCharacterStyle).typography;
    return { ...base, ...style, typography: { ...baseTypography, ...styleTypography } } as T;
  }
  if ('frame' in style) {
    const baseFrame = (base as unknown as PaperObjectStyle).frame;
    const styleFrame = (style as unknown as PaperObjectStyle).frame;
    return { ...base, ...style, frame: { ...baseFrame, ...styleFrame } } as T;
  }
  return { ...base, ...style };
}

function pickObjectStyleFrame(frame: PaperFrame): PaperObjectStyle['frame'] {
  return {
    fillColor: frame.fillColor,
    fillOpacity: frame.fillOpacity,
    fillGradient: frame.fillGradient,
    strokeColor: frame.strokeColor,
    strokeOpacity: frame.strokeOpacity,
    strokeWidthMm: frame.strokeWidthMm,
    strokeStyle: frame.strokeStyle,
    cornerRadiusMm: frame.cornerRadiusMm,
    opacity: frame.opacity,
    textBoxXPercent: frame.textBoxXPercent,
    textBoxYPercent: frame.textBoxYPercent,
    textBoxWidthPercent: frame.textBoxWidthPercent,
    textBoxHeightPercent: frame.textBoxHeightPercent,
    textVerticalAlign: frame.textVerticalAlign,
  };
}

function createPaperFrame(frame: PaperFrameDraft): PaperFrame {
  const kind = normalizePaperFrameKind(frame.kind);
  const label = frame.label ?? defaultFrameLabel(kind);
  const textBox = resolvePaperTextBox({
    kind,
    textBoxXPercent: frame.textBoxXPercent,
    textBoxYPercent: frame.textBoxYPercent,
    textBoxWidthPercent: frame.textBoxWidthPercent,
    textBoxHeightPercent: frame.textBoxHeightPercent,
    textRotationDeg: frame.textRotationDeg,
    textVerticalAlign: frame.textVerticalAlign,
  });

  return {
    id: frame.id ?? makeId('frame'),
    kind,
    label,
    xMm: frame.xMm,
    yMm: frame.yMm,
    widthMm: frame.widthMm,
    heightMm: frame.heightMm,
    rotationDeg: frame.rotationDeg ?? 0,
    locked: frame.locked ?? false,
    text: frame.text ?? defaultTextForKind(kind),
    asset: frame.asset,
    fit: frame.fit ?? 'contain',
    imageScale: frame.imageScale ?? 1,
    imageOffsetXPercent: frame.imageOffsetXPercent ?? 0,
    imageOffsetYPercent: frame.imageOffsetYPercent ?? 0,
    imageRotationDeg: frame.imageRotationDeg ?? 0,
    imageFlipX: frame.imageFlipX ?? false,
    imageFlipY: frame.imageFlipY ?? false,
    columns: frame.columns ?? (kind === 'text' ? 2 : 1),
    columnGutterMm: frame.columnGutterMm,
    columnRule: frame.columnRule,
    columnBalance: frame.columnBalance,
    threadId: frame.threadId,
    threadOrder: frame.threadOrder,
    typography: { ...DEFAULT_PAPER_TYPOGRAPHY, ...frame.typography },
    fillColor: frame.fillColor ?? defaultFillForKind(kind),
    fillOpacity: frame.fillOpacity ?? 1,
    fillGradient: frame.fillGradient,
    strokeColor: frame.strokeColor ?? '#111827',
    strokeOpacity: frame.strokeOpacity ?? 1,
    strokeWidthMm: frame.strokeWidthMm ?? (kind === 'image' ? 0.2 : 0.35),
    strokeStyle: frame.strokeStyle ?? 'solid',
    cornerRadiusMm: frame.cornerRadiusMm ?? defaultCornerRadiusForKind(kind),
    opacity: frame.opacity ?? 1,
    textBoxXPercent: textBox.xPercent,
    textBoxYPercent: textBox.yPercent,
    textBoxWidthPercent: textBox.widthPercent,
    textBoxHeightPercent: textBox.heightPercent,
    textRotationDeg: textBox.rotationDeg,
    textVerticalAlign: textBox.verticalAlign,
    textStrokeColor: frame.textStrokeColor,
    textStrokeWidthMm: frame.textStrokeWidthMm,
    textShadowColor: frame.textShadowColor,
    textShadowOffsetXMm: frame.textShadowOffsetXMm,
    textShadowOffsetYMm: frame.textShadowOffsetYMm,
    textShadowBlurMm: frame.textShadowBlurMm,
    textSkewXDeg: frame.textSkewXDeg,
    textSkewYDeg: frame.textSkewYDeg,
    textScaleX: frame.textScaleX,
    textScaleY: frame.textScaleY,
    bubbleShape: frame.bubbleShape ?? (kind === 'speechBubble' ? 'organic' : kind === 'thoughtBubble' ? 'cloud' : undefined),
    bubbleWarp: frame.bubbleWarp ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 0.18 : undefined),
    bubblePinchXPercent: frame.bubblePinchXPercent ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 58 : undefined),
    bubblePinchYPercent: frame.bubblePinchYPercent ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 75 : undefined),
    bubbleTailWidthPercent: frame.bubbleTailWidthPercent ?? (kind === 'speechBubble' ? 18 : kind === 'thoughtBubble' ? 12 : undefined),
    bubbleTailCurvePercent: frame.bubbleTailCurvePercent ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 55 : undefined),
    bubbleChainId: frame.bubbleChainId,
    bubbleChainOrder: frame.bubbleChainOrder,
    bubbleConnectorStyle: frame.bubbleConnectorStyle,
    bubbleConnectorAnchor: frame.bubbleConnectorAnchor,
    comicSfxDesign: frame.comicSfxDesign,
    shapeKind: frame.shapeKind ?? (kind === 'shape' ? 'triangle' : undefined),
    vertices: frame.vertices ?? defaultVerticesForKind(kind, frame.shapeKind),
    textWrap: sanitizePaperTextWrap(frame.textWrap),
    tailXPercent: frame.tailXPercent ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 72 : undefined),
    tailYPercent: frame.tailYPercent ?? (kind === 'speechBubble' || kind === 'thoughtBubble' ? 92 : undefined),
    zIndex: frame.zIndex ?? 0,
    paragraphStyleId: frame.paragraphStyleId,
    characterStyleId: frame.characterStyleId,
    objectStyleId: frame.objectStyleId,
    parentPageId: frame.parentPageId,
    parentFrameId: frame.parentFrameId,
    inherited: frame.inherited ?? false,
  };
}

function normalizePaperFrameKind(kind: unknown): PaperFrameKind {
  switch (kind) {
    case 'speech':
      return 'speechBubble';
    case 'thought':
      return 'thoughtBubble';
    case 'text':
    case 'image':
    case 'document':
    case 'speechBubble':
    case 'thoughtBubble':
    case 'caption':
    case 'panel':
    case 'shape':
      return kind;
    default:
      return 'text';
  }
}

function placeAssetInFrame(frame: PaperFrame, item: SourceBinLibraryItem): PaperFrame {
  if ((item.kind === 'text' || item.kind === 'document') && ['text', 'caption', 'speechBubble', 'thoughtBubble'].includes(frame.kind) && item.text) {
    return {
      ...frame,
      text: item.text ?? item.label,
      asset: {
        sourceBinItemId: item.id,
        label: item.label,
        kind: item.kind,
        text: item.text,
      },
    };
  }

  if (item.kind === 'image') {
    const imageMetadata = item as SourceBinLibraryItem & Partial<{
      pixelWidth: number;
      pixelHeight: number;
      widthPx: number;
      heightPx: number;
      width: number;
      height: number;
    }>;
    return {
      ...frame,
      kind: frame.kind === 'panel' ? 'image' : frame.kind,
      label: frame.label || item.label,
      asset: {
        sourceBinItemId: item.id,
        label: item.label,
        kind: item.kind,
        src: item.assetUrl,
        mimeType: item.mimeType,
        pixelWidth: firstPositiveNumber(imageMetadata.pixelWidth, imageMetadata.widthPx, imageMetadata.width),
        pixelHeight: firstPositiveNumber(imageMetadata.pixelHeight, imageMetadata.heightPx, imageMetadata.height),
      },
    };
  }

  if (item.kind === 'document') {
    return {
      ...frame,
      kind: frame.kind === 'image' || frame.kind === 'panel' ? 'document' : frame.kind,
      label: frame.label || item.label,
      text: item.text ?? frame.text,
      asset: {
        sourceBinItemId: item.id,
        label: item.label,
        kind: item.kind,
        src: item.assetUrl,
        mimeType: item.mimeType,
        text: item.text,
        format: item.mimeType === 'application/pdf' || item.label.toLowerCase().endsWith('.pdf') ? 'pdf' : undefined,
      },
    };
  }

  return frame;
}

function firstPositiveNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function renderPrintPage(doc: PaperDocument, page: PaperPage, pageSpec: PaperPageSpec): string {
  const outputFrames = resolvePaperPageFramesForOutput(doc, page).sort((a, b) => a.zIndex - b.zIndex);
  const connectors = renderPrintBubbleConnectors(outputFrames, pageSpec);
  const frames = outputFrames
    .map((frame) => renderPrintFrame(doc, frame))
    .join('\n');

  return `<section class="paper-sheet" data-page="${page.pageNumber}" data-trim-width="${formatMm(pageSpec.widthMm)}" data-trim-height="${formatMm(pageSpec.heightMm)}" data-bleed="${formatMm(pageSpec.bleedMm)}">
<div class="paper-page">
${connectors}
${frames}
</div>
</section>`;
}

export function renderPrintBubbleConnectors(frames: PaperFrame[], pageSpec: PaperPageSpec): string {
  const segments = buildPaperBubbleConnectorSegments(frames);
  if (!segments.length) return '';
  const body = segments.map((segment) => {
    const stroke = escapeHtml(frames.find((frame) => frame.id === segment.fromFrameId)?.strokeColor ?? '#111827');
    const strokeWidth = Math.max(0.25, frames.find((frame) => frame.id === segment.fromFrameId)?.strokeWidthMm ?? 0.35);
    if (segment.style === 'thought-dots') {
      return segment.dots.map((dot, index) => (
        `<circle cx="${formatSvgNumber(dot.xMm)}" cy="${formatSvgNumber(dot.yMm)}" r="${formatSvgNumber(Math.max(0.8, strokeWidth * (2.6 - index * 0.18)))}" fill="${stroke}" opacity="0.88" />`
      )).join('\n');
    }
    if (segment.style === 'tail') {
      return `<path d="M ${formatSvgNumber(segment.from.xMm)} ${formatSvgNumber(segment.from.yMm)} Q ${formatSvgNumber(segment.control.xMm)} ${formatSvgNumber(segment.control.yMm)} ${formatSvgNumber(segment.to.xMm)} ${formatSvgNumber(segment.to.yMm)}" fill="none" stroke="${stroke}" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    return `<line x1="${formatSvgNumber(segment.from.xMm)}" y1="${formatSvgNumber(segment.from.yMm)}" x2="${formatSvgNumber(segment.to.xMm)}" y2="${formatSvgNumber(segment.to.yMm)}" stroke="${stroke}" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" />`;
  }).join('\n');

  return `<svg class="paper-bubble-connectors" viewBox="0 0 ${formatSvgNumber(pageSpec.widthMm)} ${formatSvgNumber(pageSpec.heightMm)}" preserveAspectRatio="none" style="position:absolute; inset:0; overflow:visible; z-index:95; pointer-events:none;">
${body}
</svg>`;
}

export function renderPrintFrame(doc: PaperDocument, frame: PaperFrame): string {
  frame = computeEffectivePaperFrame(doc, frame);
  const outerStyle = printFrameOuterStyle(frame);
  const contentStyle = printFrameContentStyle(frame);

  if (frame.kind === 'shape') {
    return renderPrintShapeFrame(outerStyle, frame);
  }

  if (frame.kind === 'speechBubble' || frame.kind === 'thoughtBubble') {
    return `<div class="frame frame-${frame.kind}" style="${outerStyle}; background: transparent; border: 0; padding: 0;">${renderPrintBubbleSvg(frame)}${renderPrintTextBox(frame, escapeHtml(frame.text ?? frame.asset?.text ?? ''))}</div>`;
  }

  if (isShapedContentFrame(frame)) {
    return renderPrintShapedContentFrame(doc, outerStyle, frame);
  }

  if (frame.kind === 'document') {
    return `<figure class="frame frame-document" style="${outerStyle}">
  <div class="frame-content" style="${contentStyle}">${renderPrintDocumentFrameContent(frame)}</div>
</figure>`;
  }

  if (frame.kind === 'image' && frame.asset?.src) {
    return `<figure class="frame frame-image" style="${outerStyle}">
  <div class="frame-content" style="${contentStyle}">${renderPrintImageFrameContent(frame)}</div>
</figure>`;
  }

  const text = escapeHtml(frame.text ?? frame.asset?.text ?? '');
  const columns = frame.kind === 'text' ? Math.max(1, frame.columns || doc.layout.columns.count) : 1;
  const columnStyle =
    columns > 1
      ? `column-count: ${columns}; column-gap: ${formatMm(doc.layout.columns.gutterMm)};`
      : '';

  return `<div class="frame frame-${frame.kind}" style="${outerStyle}">
  <div class="frame-content" style="${contentStyle}; ${columnStyle}"><div class="frame-text-content" style="${printTextEffectInlineStyle(frame)}">${text}</div></div>
</div>`;
}

function printFrameOuterStyle(frame: PaperFrame): string {
  return [
    `left: ${formatMm(frame.xMm)}`,
    `top: ${formatMm(frame.yMm)}`,
    `width: ${formatMm(frame.widthMm)}`,
    `height: ${formatMm(frame.heightMm)}`,
    `z-index: ${frame.zIndex}`,
    `transform: rotate(${frame.rotationDeg}deg)`,
    `opacity: ${clampUnit(frame.opacity)}`,
  ].join('; ');
}

function printFrameContentStyle(frame: PaperFrame): string {
  const style = [
    `position: absolute`,
    `inset: 0`,
    `overflow: hidden`,
    `background: ${frameFillCss(frame)}`,
    `border: ${formatMm(frame.strokeWidthMm)} ${frame.strokeStyle} ${colorWithOpacity(frame.strokeColor, frame.strokeOpacity)}`,
    `border-radius: ${formatMm(frame.cornerRadiusMm)}`,
    `padding: ${formatMm(printFrameContentPaddingMm(frame))}`,
    textStyle(frame),
  ];

  if (frame.kind === 'caption') {
    style.push(
      'display: flex',
      'flex-direction: column',
      `justify-content: ${paperTextVerticalAlignToJustifyContent(frame.textVerticalAlign)}`,
    );
  }

  return style.join('; ');
}

function renderPrintShapedContentFrame(doc: PaperDocument, style: string, frame: PaperFrame): string {
  const clipPath = printClipPathForFrame(frame);
  const columns = frame.kind === 'text' ? Math.max(1, frame.columns || doc.layout.columns.count) : 1;
  const columnStyle =
    columns > 1
      ? `column-count: ${columns}; column-gap: ${formatMm(doc.layout.columns.gutterMm)}`
      : '';
  const innerStyle = [
    'position: absolute',
    'inset: 0',
    'overflow: hidden',
    `clip-path: ${clipPath}`,
    `background: ${frameFillCss(frame)}`,
    `padding: ${formatMm(printFrameContentPaddingMm(frame))}`,
    frame.kind === 'image' || frame.kind === 'panel' ? '' : textStyle(frame),
    columnStyle,
  ].filter(Boolean).join('; ');

  const content = frame.kind === 'image' && frame.asset?.src
    ? renderPrintImageFrameContent(frame)
    : frame.kind === 'panel'
      ? ''
      : escapeHtml(frame.text ?? frame.asset?.text ?? '');

  return `<div class="frame frame-${frame.kind}" style="${style}; background: transparent; border: 0; overflow: visible;">
  <div class="frame-content" style="${innerStyle}">${content}</div>
  ${renderPrintFrameShapeStrokeSvg(frame)}
</div>`;
}

function renderPrintShapeFrame(style: string, frame: PaperFrame): string {
  const fill = frame.shapeKind === 'line' ? 'none' : escapeHtml(svgFillForFrame(frame));
  const stroke = escapeHtml(frame.strokeColor);
  const strokeWidth = formatMm(frame.strokeWidthMm);
  const strokeDasharray = svgDashArray(frame);
  const common = `fill="${fill}" fill-opacity="${svgFillOpacity(frame)}" stroke="${stroke}" stroke-opacity="${clampUnit(frame.strokeOpacity)}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" vector-effect="non-scaling-stroke"`;
  let svgShape = '';

  if (frame.shapeKind === 'ellipse') {
    svgShape = `<ellipse cx="50" cy="50" rx="48" ry="48" ${common} />`;
  } else if (frame.shapeKind === 'line') {
    svgShape = `<line x1="0" y1="50" x2="100" y2="50" ${common} stroke-linecap="round" />`;
  } else {
    const shapeVertices = frame.vertices?.length
      ? frame.vertices
      : (defaultVerticesForKind('shape', frame.shapeKind) ?? []);
    const points = formatSvgPoints(shapeVertices);
    svgShape = `<polygon points="${points}" ${common} stroke-linejoin="round" />`;
  }

  return `<figure class="frame frame-shape" style="${style}; background: transparent; border: 0;">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
    ${renderSvgGradientDef(frame)}
    ${svgShape}
  </svg>
</figure>`;
}

function renderPrintImageFrameContent(frame: PaperFrame): string {
  if (!frame.asset?.src) return '';
  const imageStyle = buildPaperImageRenderStyle(frame);
  return `<img alt="${escapeHtml(frame.asset.label)}" src="${escapeHtml(frame.asset.src)}" style="position: ${imageStyle.position}; width: ${imageStyle.width}; height: ${imageStyle.height}; max-width: ${imageStyle.maxWidth}; max-height: ${imageStyle.maxHeight}; left: ${imageStyle.left}; top: ${imageStyle.top}; object-fit: ${imageStyle.objectFit}; object-position: ${imageStyle.objectPosition}; transform: ${imageStyle.transform}; transform-origin: ${imageStyle.transformOrigin};" />`;
}

function renderPrintDocumentFrameContent(frame: PaperFrame): string {
  const label = escapeHtml(frame.asset?.label ?? frame.label);
  if (frame.asset?.src && frame.asset.mimeType === 'application/pdf') {
    return `<object data="${escapeHtml(frame.asset.src)}" type="application/pdf" width="100%" height="100%"><div class="paper-document-placeholder">Linked PDF: ${label}</div></object>`;
  }
  return `<div class="paper-document-placeholder" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:0.35mm dashed #64748b;background:#f8fafc;color:#334155;text-align:center;padding:3mm;">Linked document: ${label}</div>`;
}

function renderPrintFrameShapeStrokeSvg(frame: PaperFrame): string {
  const stroke = escapeHtml(frame.strokeColor);
  const strokeWidth = formatMm(frame.strokeWidthMm);
  const common = `fill="none" stroke="${stroke}" stroke-opacity="${clampUnit(frame.strokeOpacity)}" stroke-width="${strokeWidth}" stroke-dasharray="${svgDashArray(frame)}" vector-effect="non-scaling-stroke"`;
  let svgShape = '';

  if (isFrameShapeKindEnabled(frame) && frame.shapeKind === 'ellipse') {
    svgShape = `<ellipse cx="50" cy="50" rx="48" ry="48" ${common} />`;
  } else if (isFrameShapeKindEnabled(frame) && frame.shapeKind === 'line') {
    svgShape = `<line x1="0" y1="50" x2="100" y2="50" ${common} stroke-linecap="round" />`;
  } else {
    const points = formatSvgPoints(printEditableVerticesForFrame(frame) ?? defaultPrintShapeVerticesForFrame(frame) ?? []);
    svgShape = `<polygon points="${points}" ${common} stroke-linejoin="round" />`;
  }

  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="position: absolute; inset: 0; pointer-events: none; overflow: visible;">
    ${svgShape}
  </svg>`;
}

function renderPrintBubbleSvg(frame: PaperFrame): string {
  const fill = svgFillForFrame(frame);
  const stroke = escapeHtml(frame.strokeColor);
  const strokeWidth = formatMm(frame.strokeWidthMm);
  const path = buildPaperBubblePath(frame);
  const bounds = printBubbleShapeBounds(frame);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatSvgNumber(bounds.minX)} ${formatSvgNumber(bounds.minY)} ${formatSvgNumber(bounds.width)} ${formatSvgNumber(bounds.height)}" preserveAspectRatio="none" overflow="visible">
  ${renderSvgGradientDef(frame)}
  <path d="${path}" fill="${escapeHtml(fill)}" fill-opacity="${svgFillOpacity(frame)}" stroke="${stroke}" stroke-opacity="${clampUnit(frame.strokeOpacity)}" stroke-width="${strokeWidth}" stroke-dasharray="${svgDashArray(frame)}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
</svg>`;
  const style = [
    'position: absolute',
    `left: ${formatPercent(bounds.minX)}`,
    `top: ${formatPercent(bounds.minY)}`,
    `width: ${formatPercent(bounds.width)}`,
    `height: ${formatPercent(bounds.height)}`,
    'max-width: none',
    'max-height: none',
    'pointer-events: none',
  ].join('; ');

  return `<img class="paper-bubble-shape" alt="" src="${escapeHtml(svgToDataUrl(svg))}" style="${style}" />`;
}

function printBubbleShapeBounds(frame: PaperFrame): { minX: number; minY: number; width: number; height: number } {
  const tailX = finiteOr(frame.tailXPercent, 72);
  const tailY = finiteOr(frame.tailYPercent, 92);
  const pinchX = finiteOr(frame.bubblePinchXPercent, 58);
  const pinchY = finiteOr(frame.bubblePinchYPercent, 75);
  const curveHandle = resolveBubbleTailCurveHandle(frame);
  const strokePadding = Math.max(4, finiteOr(frame.strokeWidthMm, 0.35) * 8);
  const bodyOvershoot = frame.kind === 'thoughtBubble' ? 7 : 5;
  const minX = Math.min(-bodyOvershoot, tailX, pinchX, curveHandle.x) - strokePadding;
  const maxX = Math.max(100 + bodyOvershoot, tailX, pinchX, curveHandle.x) + strokePadding;
  const minY = Math.min(-bodyOvershoot, tailY, pinchY, curveHandle.y) - strokePadding;
  const maxY = Math.max(100 + bodyOvershoot, tailY, pinchY, curveHandle.y) + strokePadding;

  return {
    minX: roundPercent(minX),
    minY: roundPercent(minY),
    width: roundPercent(maxX - minX),
    height: roundPercent(maxY - minY),
  };
}

function printFrameContentPaddingMm(frame: PaperFrame): number {
  if (frame.kind === 'speechBubble' || frame.kind === 'thoughtBubble' || frame.kind === 'shape') return 0;
  return 2;
}

function renderPrintTextBox(frame: PaperFrame, content: string, extraStyle = ''): string {
  const textBox = resolvePaperTextBox(frame);
  const style = [
    `position: absolute`,
    `left: ${formatPercent(textBox.xPercent)}`,
    `top: ${formatPercent(textBox.yPercent)}`,
    `width: ${formatPercent(textBox.widthPercent)}`,
    `height: ${formatPercent(textBox.heightPercent)}`,
    `z-index: 1`,
    `overflow: hidden`,
    `transform: ${appendPaperTextEffectTransform(`rotate(${formatDeg(textBox.rotationDeg)})`, frame)}`,
    `transform-origin: center`,
    `display: flex`,
    `flex-direction: column`,
    `justify-content: ${paperTextVerticalAlignToJustifyContent(textBox.verticalAlign)}`,
    textStyle(frame),
    extraStyle,
  ].filter(Boolean).join('; ');

  return `<div class="paper-text-box" style="${style}">${content}</div>`;
}

function textStyle(frame: PaperFrame): string {
  return [
    `font-family: ${frame.typography.fontFamily}`,
    `font-size: ${frame.typography.fontSizePt}pt`,
    `line-height: ${frame.typography.leadingPt}pt`,
    `letter-spacing: ${frame.typography.tracking / 1000}em`,
    `text-align: ${frame.typography.align}`,
    `hyphens: ${frame.typography.hyphenate ? 'auto' : 'manual'}`,
    `color: ${frame.typography.color}`,
    `font-weight: ${frame.typography.fontWeight}`,
    `font-style: ${frame.typography.fontStyle}`,
    buildPaperTextPaintEffectCssText(frame),
  ].filter(Boolean).join('; ');
}

function printTextEffectInlineStyle(frame: PaperFrame): string {
  const transform = appendPaperTextEffectTransform(undefined, frame);
  if (!transform) return '';
  return `display: block; transform: ${transform}; transform-origin: center`;
}

function defaultGuidesForPage(page: PaperPageSpec): PaperGuide[] {
  return [
    { id: makeId('guide'), orientation: 'vertical', positionMm: page.widthMm / 2, label: 'Center vertical' },
    { id: makeId('guide'), orientation: 'horizontal', positionMm: page.heightMm / 2, label: 'Center horizontal' },
  ];
}

function updateDefaultGuidesForPage(guides: PaperGuide[], page: PaperPageSpec): PaperGuide[] {
  const customGuides = guides.filter((guide) => !guide.label?.startsWith('Center '));
  return [...defaultGuidesForPage(page), ...customGuides];
}

function normalizePageSpec(page: PaperPageSpec): PaperPageSpec {
  return {
    ...page,
    dpi: normalizeDpi(page.dpi),
  };
}

function renumberPages(pages: PaperPage[]): PaperPage[] {
  return pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

function touch(doc: PaperDocument): PaperDocument {
  return { ...doc, updatedAt: Date.now() };
}

function normalizeDpi(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DPI;
  return Math.max(72, Math.min(2400, Math.round(value)));
}

function normalizeBackgroundAngle(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PAPER_BACKGROUND.angleDeg;
  const normalized = value % 360;
  return Number(normalized.toFixed(3));
}

function isPaperBackgroundType(value: unknown): value is PaperBackgroundSpec['type'] {
  return value === 'solid' || value === 'linear-gradient' || value === 'radial-gradient';
}

function normalizeCssColor(value: string | undefined, fallback: string): string {
  const color = value?.trim();
  if (!color) return fallback;
  if (color === 'transparent') return color;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(color)) return color;
  if (/^(rgba?|hsla?)\([0-9\s.,%+-]+\)$/i.test(color)) return color;
  return fallback;
}

function clampMm(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.max(min, Math.min(max, value)) * 1000) / 1000;
}

function defaultFrameLabel(kind: PaperFrameKind): string {
  switch (kind) {
    case 'text':
      return 'Text Frame';
    case 'image':
      return 'Image Frame';
    case 'document':
      return 'Document Frame';
    case 'speechBubble':
      return 'Speech Bubble';
    case 'thoughtBubble':
      return 'Thought Bubble';
    case 'caption':
      return 'Caption';
    case 'panel':
      return 'Comic Panel';
    case 'shape':
      return 'Polygon Shape';
  }
}

function defaultTextForKind(kind: PaperFrameKind): string | undefined {
  switch (kind) {
    case 'speechBubble':
      return 'Speech text';
    case 'thoughtBubble':
      return 'Thought text';
    case 'caption':
      return 'Narration caption';
    case 'text':
      return 'Body copy';
    default:
      return undefined;
  }
}

function defaultFillForKind(kind: PaperFrameKind): string {
  if (kind === 'caption') return '#fff4bf';
  if (kind === 'panel' || kind === 'image') return 'transparent';
  if (kind === 'document') return '#f8fafc';
  if (kind === 'shape') return '#e0f2fe';
  return '#ffffff';
}

function defaultCornerRadiusForKind(kind: PaperFrameKind): number {
  if (kind === 'speechBubble' || kind === 'thoughtBubble') return 100;
  if (kind === 'caption') return 1.5;
  return 0;
}

function sanitizePaperTextWrap(value: PaperFrame['textWrap']): PaperTextWrap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const modes: PaperTextWrap['mode'][] = ['none', 'boundingBox', 'jumpObject', 'contour'];
  const mode = modes.includes(value.mode) ? value.mode : 'none';
  if (mode === 'none') return undefined;
  const standoffMm = Number.isFinite(value.standoffMm) ? Math.max(0, value.standoffMm) : 0;
  const contourSource = value.contourSource === 'vertices' || value.contourSource === 'frameShape'
    ? value.contourSource
    : undefined;
  return { mode, standoffMm, contourSource };
}

function defaultVerticesForKind(kind: PaperFrameKind, shapeKind: PaperFrame['shapeKind']): PaperFrame['vertices'] {
  if (kind === 'panel') {
    return [
      { xPercent: 0, yPercent: 0 },
      { xPercent: 100, yPercent: 0 },
      { xPercent: 100, yPercent: 100 },
      { xPercent: 0, yPercent: 100 },
    ];
  }
  if (kind !== 'shape') return undefined;
  if (shapeKind === 'line') {
    return [
      { xPercent: 0, yPercent: 50 },
      { xPercent: 100, yPercent: 50 },
    ];
  }
  if (shapeKind === 'ellipse') return undefined;
  if (shapeKind === 'pentagon') {
    return [
      { xPercent: 50, yPercent: 0 },
      { xPercent: 98, yPercent: 36 },
      { xPercent: 80, yPercent: 100 },
      { xPercent: 20, yPercent: 100 },
      { xPercent: 2, yPercent: 36 },
    ];
  }
  if (shapeKind === 'hexagon') {
    return [
      { xPercent: 25, yPercent: 0 },
      { xPercent: 75, yPercent: 0 },
      { xPercent: 100, yPercent: 50 },
      { xPercent: 75, yPercent: 100 },
      { xPercent: 25, yPercent: 100 },
      { xPercent: 0, yPercent: 50 },
    ];
  }
  return [
    { xPercent: 50, yPercent: 0 },
    { xPercent: 100, yPercent: 100 },
    { xPercent: 0, yPercent: 100 },
  ];
}

function isShapedContentFrame(frame: PaperFrame): boolean {
  return frame.kind !== 'shape'
    && frame.kind !== 'speechBubble'
    && frame.kind !== 'thoughtBubble'
    && Boolean(printClipPathForFrame(frame));
}

function printClipPathForFrame(frame: PaperFrame): string | undefined {
  const vertices = printEditableVerticesForFrame(frame);
  if (vertices && vertices.length >= 3) {
    return `polygon(${vertices.map((vertex) => `${formatPercent(vertex.xPercent)} ${formatPercent(vertex.yPercent)}`).join(', ')})`;
  }
  if (!isFrameShapeKindEnabled(frame)) return undefined;
  if (frame.shapeKind === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
  if (frame.shapeKind === 'triangle') return 'polygon(50% 0%, 100% 100%, 0% 100%)';
  if (frame.shapeKind === 'pentagon') return 'polygon(50% 0%, 98% 36%, 80% 100%, 20% 100%, 2% 36%)';
  if (frame.shapeKind === 'hexagon') return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  return undefined;
}

function printEditableVerticesForFrame(frame: PaperFrame): PaperFrame['vertices'] {
  if (frame.kind === 'caption') {
    return frame.vertices && frame.vertices.length >= 3 && !isDefaultShapeTriangleVertices(frame.vertices)
      ? frame.vertices
      : undefined;
  }
  if (frame.kind === 'panel' || frame.kind === 'image') {
    return frame.vertices && frame.vertices.length >= 3 ? frame.vertices : undefined;
  }
  return undefined;
}

function defaultPrintShapeVerticesForFrame(frame: PaperFrame): PaperFrame['vertices'] {
  if (!isFrameShapeKindEnabled(frame)) return undefined;
  return defaultVerticesForKind('shape', frame.shapeKind);
}

function isFrameShapeKindEnabled(frame: PaperFrame): boolean {
  return frame.kind === 'panel' || frame.kind === 'image';
}

function isDefaultShapeTriangleVertices(vertices: NonNullable<PaperFrame['vertices']>): boolean {
  return vertices.length === 3
    && vertices[0].xPercent === 50
    && vertices[0].yPercent === 0
    && vertices[1].xPercent === 100
    && vertices[1].yPercent === 100
    && vertices[2].xPercent === 0
    && vertices[2].yPercent === 100;
}

export function formatMm(value: number): string {
  return `${Number(value.toFixed(3))}mm`;
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(3))}%`;
}

function formatSvgNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

function formatDeg(value: number): string {
  return `${Number(value.toFixed(3))}deg`;
}

function frameFillCss(frame: PaperFrame): string {
  if (frame.fillGradient) {
    return `linear-gradient(${frame.fillGradient.angleDeg}deg, ${frame.fillGradient.fromColor}, ${frame.fillGradient.toColor})`;
  }
  return colorWithOpacity(frame.fillColor, frame.fillOpacity);
}

function svgFillForFrame(frame: PaperFrame): string {
  if (frame.fillGradient) return `url(#${svgGradientId(frame.id)})`;
  return colorWithOpacity(frame.fillColor, frame.fillOpacity);
}

function svgFillOpacity(frame: PaperFrame): number {
  return frame.fillGradient ? clampUnit(frame.fillOpacity) : 1;
}

function renderSvgGradientDef(frame: PaperFrame): string {
  if (!frame.fillGradient) return '';
  const vector = gradientVector(frame.fillGradient.angleDeg);
  const id = escapeHtml(svgGradientId(frame.id));
  return `<defs><linearGradient id="${id}" x1="${vector.x1}%" y1="${vector.y1}%" x2="${vector.x2}%" y2="${vector.y2}%"><stop offset="0%" stop-color="${escapeHtml(frame.fillGradient.fromColor)}" /><stop offset="100%" stop-color="${escapeHtml(frame.fillGradient.toColor)}" /></linearGradient></defs>`;
}

function svgGradientId(id: string): string {
  return `paper-gradient-${id.replace(/[^a-z0-9_-]/gi, '-')}`;
}

function gradientVector(angleDeg: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angleDeg * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  return {
    x1: Number((50 - x * 50).toFixed(3)),
    y1: Number((50 - y * 50).toFixed(3)),
    x2: Number((50 + x * 50).toFixed(3)),
    y2: Number((50 + y * 50).toFixed(3)),
  };
}

function colorWithOpacity(color: string, opacity: number): string {
  if (color === 'transparent') return color;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const alpha = clampUnit(opacity);
  if (alpha >= 1) return color;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatSvgPoints(vertices: NonNullable<PaperFrame['vertices']>): string {
  return vertices.map((vertex) => `${Number(vertex.xPercent.toFixed(3))},${Number(vertex.yPercent.toFixed(3))}`).join(' ');
}

function svgDashArray(frame: PaperFrame): string {
  if (frame.strokeStyle === 'dashed') return '5 4';
  if (frame.strokeStyle === 'dotted') return '1 3';
  return 'none';
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clampUnit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, Number(value)));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function roundPercent(value: number): number {
  return Number(value.toFixed(3));
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`}`;
}
