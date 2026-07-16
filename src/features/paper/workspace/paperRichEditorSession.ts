import type { PaperRichParagraph, PaperTypography } from '../../../types/paper';
import { changedRichTypographyPatch, type RichTypographyKey, type RichTypographyPatch } from './richTextTransforms';

const PT_TO_PX = 1.333;
const MM_TO_PX = 3.7795;

export interface PaperRichEditorApplyResult {
  richText: PaperRichParagraph[];
  text: string;
}

export interface PaperRichEditorSession {
  applyTypography: (previous: PaperTypography, next: PaperTypography) => PaperRichEditorApplyResult | null;
}

const sessions = new Map<string, PaperRichEditorSession>();

export function registerPaperRichEditorSession(frameId: string, session: PaperRichEditorSession): () => void {
  sessions.set(frameId, session);
  return () => {
    if (sessions.get(frameId) === session) sessions.delete(frameId);
  };
}

export function applyTypographyToActiveRichEditor(
  frameId: string,
  previous: PaperTypography,
  next: PaperTypography,
): PaperRichEditorApplyResult | null {
  return sessions.get(frameId)?.applyTypography(previous, next) ?? null;
}

const CHARACTER_KEYS = new Set<RichTypographyKey>([
  'fontFamily', 'fontSizePt', 'fontWeight', 'fontStyle', 'fontKerning', 'color', 'tracking', 'smallCaps',
  'numericStyle', 'textOrientation', 'emphasis',
]);

const PARAGRAPH_KEYS = new Set<RichTypographyKey>([
  'align', 'alignLast', 'leadingPt', 'hyphenate', 'lineBreak', 'lineBreakStrict', 'firstLineIndentMm',
  'spaceBeforeMm', 'spaceAfterMm', 'dropCapLines',
]);

function emphasisCss(value: PaperTypography['emphasis']): string {
  if (value === 'dot') return 'filled dot';
  if (value === 'open-dot') return 'open dot';
  if (value === 'sesame') return 'filled sesame';
  if (value === 'circle') return 'filled circle';
  return 'none';
}

function numericCss(value: PaperTypography['numericStyle']): string {
  if (value === 'oldstyle') return 'oldstyle-nums';
  if (value === 'lining') return 'lining-nums';
  if (value === 'tabular') return 'tabular-nums';
  return 'normal';
}

function boundaryOffset(root: HTMLElement, container: Node, offset: number): number {
  const probe = document.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(container, offset);
  return probe.toString().length;
}

/** Wrap each selected text-node slice independently. Unlike Range.surroundContents this remains valid when a
 * selection crosses paragraphs, links, or existing style spans. The returned range covers exactly the same
 * visible text after the DOM is split. */
function wrapSelectedText(root: HTMLElement, range: Range, styleSpan: (span: HTMLSpanElement) => void): Range | null {
  const start = boundaryOffset(root, range.startContainer, range.startOffset);
  const end = boundaryOffset(root, range.endContainer, range.endOffset);
  if (end <= start) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    const nodeStart = cursor;
    const nodeEnd = cursor + length;
    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(length, end - nodeStart);
    if (localEnd > localStart && !node.parentElement?.closest('[data-paper-marker]')) {
      targets.push({ node, start: localStart, end: localEnd });
    }
    cursor = nodeEnd;
    node = walker.nextNode() as Text | null;
  }
  if (!targets.length) return null;

  let first: HTMLSpanElement | null = null;
  let last: HTMLSpanElement | null = null;
  for (const target of targets) {
    let selected = target.node;
    if (target.start > 0) selected = selected.splitText(target.start);
    const selectedLength = target.end - target.start;
    if (selectedLength < selected.data.length) selected.splitText(selectedLength);
    const span = document.createElement('span');
    styleSpan(span);
    selected.parentNode?.insertBefore(span, selected);
    span.appendChild(selected);
    first ??= span;
    last = span;
  }

  if (!first || !last) return null;
  const next = document.createRange();
  next.setStartBefore(first);
  next.setEndAfter(last);
  return next;
}

function applyCharacterPatch(
  editor: HTMLElement,
  range: Range,
  patch: Partial<PaperTypography>,
  zoom: number,
): Range | null {
  return wrapSelectedText(editor, range, (span) => {
    if ('fontFamily' in patch) span.style.fontFamily = patch.fontFamily ?? '';
    if ('fontSizePt' in patch) span.style.fontSize = `${((patch.fontSizePt ?? 0) * PT_TO_PX * zoom).toFixed(2)}px`;
    if ('fontWeight' in patch) span.style.fontWeight = patch.fontWeight ?? '400';
    if ('fontStyle' in patch) span.style.fontStyle = patch.fontStyle ?? 'normal';
    if ('fontKerning' in patch) span.style.fontKerning = patch.fontKerning ?? 'auto';
    if ('color' in patch) span.style.color = patch.color ?? '';
    if ('tracking' in patch) span.style.letterSpacing = `${(patch.tracking ?? 0) / 1000}em`;
    if ('smallCaps' in patch) span.style.fontVariantCaps = patch.smallCaps ? 'small-caps' : 'normal';
    if ('numericStyle' in patch) span.style.fontVariantNumeric = numericCss(patch.numericStyle);
    if ('textOrientation' in patch) span.style.textOrientation = patch.textOrientation ?? 'mixed';
    if ('emphasis' in patch) span.style.setProperty('text-emphasis', emphasisCss(patch.emphasis));
  });
}

function blocksTouchedByRange(editor: HTMLElement, range: Range): HTMLElement[] {
  const blocks = Array.from(editor.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && (child.nodeName === 'DIV' || child.nodeName === 'P' || child.nodeName === 'LI'));
  const touched = blocks.filter((block) => {
    try { return range.intersectsNode(block); } catch { return false; }
  });
  if (touched.length) return touched;
  let node: Node | null = range.startContainer;
  while (node && node.parentNode !== editor) node = node.parentNode;
  return node instanceof HTMLElement ? [node] : [];
}

function setData(el: HTMLElement, key: string, value: string | number | boolean | undefined): void {
  if (value === undefined) delete el.dataset[key];
  else el.dataset[key] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
}

function applyParagraphPatch(editor: HTMLElement, range: Range, patch: Partial<PaperTypography>, zoom: number): boolean {
  const blocks = blocksTouchedByRange(editor, range);
  for (const el of blocks) {
    if ('align' in patch) { setData(el, 'align', patch.align); el.style.textAlign = patch.align ?? 'left'; }
    if ('alignLast' in patch) { setData(el, 'al', patch.alignLast); el.style.textAlignLast = patch.alignLast ?? 'auto'; }
    if ('leadingPt' in patch) {
      setData(el, 'lead', patch.leadingPt);
      el.style.lineHeight = `${((patch.leadingPt ?? 0) * PT_TO_PX * zoom).toFixed(2)}px`;
    }
    if ('hyphenate' in patch) { setData(el, 'hyph', patch.hyphenate); el.style.hyphens = patch.hyphenate ? 'auto' : 'manual'; }
    if ('lineBreak' in patch) {
      setData(el, 'lb', patch.lineBreak);
      el.style.setProperty('text-wrap-style', patch.lineBreak && patch.lineBreak !== 'auto' ? patch.lineBreak : 'auto');
    }
    if ('lineBreakStrict' in patch) {
      setData(el, 'lbs', patch.lineBreakStrict);
      el.style.lineBreak = patch.lineBreakStrict ? 'strict' : 'auto';
    }
    if ('firstLineIndentMm' in patch) {
      setData(el, 'fi', patch.firstLineIndentMm);
      el.style.textIndent = `${((patch.firstLineIndentMm ?? 0) * MM_TO_PX * zoom).toFixed(2)}px`;
    }
    if ('spaceBeforeMm' in patch) {
      setData(el, 'sb', patch.spaceBeforeMm);
      el.style.marginTop = `${((patch.spaceBeforeMm ?? 0) * MM_TO_PX * zoom).toFixed(2)}px`;
    }
    if ('spaceAfterMm' in patch) {
      setData(el, 'sa', patch.spaceAfterMm);
      el.style.marginBottom = `${((patch.spaceAfterMm ?? 0) * MM_TO_PX * zoom).toFixed(2)}px`;
    }
    if ('dropCapLines' in patch) {
      const lines = Math.max(0, Math.round(patch.dropCapLines ?? 0));
      setData(el, 'dc', lines || undefined);
      el.classList.toggle('paper-dropcap', lines >= 2);
      if (lines >= 2) el.style.setProperty('--sl-dropcap-lines', String(lines));
      else el.style.removeProperty('--sl-dropcap-lines');
    }
  }
  return blocks.length > 0;
}

export interface ApplyTypographyToDomSelectionResult {
  range: Range;
  applied: boolean;
}

export function applyTypographyPatchToDomSelection(
  editor: HTMLElement,
  savedRange: Range | null,
  patch: Partial<RichTypographyPatch>,
  zoom: number,
): ApplyTypographyToDomSelectionResult | null {
  if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) return null;
  const changedKeys = Object.keys(patch) as RichTypographyKey[];
  if (!changedKeys.length) return null;

  const hasCharacters = changedKeys.some((key) => CHARACTER_KEYS.has(key));
  const hasParagraphs = changedKeys.some((key) => PARAGRAPH_KEYS.has(key));
  if (savedRange.collapsed && hasCharacters && !hasParagraphs) return null;

  let range = savedRange.cloneRange();
  let applied = false;
  if (hasCharacters && !range.collapsed) {
    const characterPatch = Object.fromEntries(changedKeys.filter((key) => CHARACTER_KEYS.has(key)).map((key) => [key, patch[key]]));
    const nextRange = applyCharacterPatch(editor, range, characterPatch, zoom);
    if (nextRange) { range = nextRange; applied = true; }
  }
  if (hasParagraphs) {
    const paragraphPatch = Object.fromEntries(changedKeys.filter((key) => PARAGRAPH_KEYS.has(key)).map((key) => [key, patch[key]]));
    applied = applyParagraphPatch(editor, range, paragraphPatch, zoom) || applied;
  }
  return applied ? { range, applied } : null;
}

/** Apply one Inspector/advanced-toolbar typography edit to the retained editor range. Character properties
 * require highlighted text; paragraph properties also work at a caret and target its current paragraph. */
export function applyTypographyToDomSelection(
  editor: HTMLElement,
  savedRange: Range | null,
  previous: PaperTypography,
  next: PaperTypography,
  zoom: number,
): ApplyTypographyToDomSelectionResult | null {
  const patch = changedRichTypographyPatch(previous, next);
  return applyTypographyPatchToDomSelection(editor, savedRange, patch, zoom);
}
