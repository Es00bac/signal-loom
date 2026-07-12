/**
 * Pure rich-text run/paragraph transforms for the Paper workspace's text-formatting actions (bold/italic/
 * underline toggles, bullet-list toggle, font-size stepping). Operates entirely on the `PaperRichParagraph[]`
 * data model plus a plain character-offset range — no DOM, no React — so every case (split at a boundary,
 * cross-paragraph ranges, toggle-off detection, run merging, idempotence) is directly unit-testable.
 *
 * Character-range convention: `start`/`end` are offsets into `flattenPaperRichText(paragraphs)` — the same
 * string the app already uses for search/threading/legacy export (runs concatenated per paragraph, prefixed
 * by `"listMarker\t"` when the paragraph is bulleted, paragraphs joined by `"\n"`). A caller with a live DOM
 * selection is responsible for mapping it into this offset space before calling any transform here — see the
 * commit that introduced this file for why that specific mapping is not wired up to a live editor in this pass.
 */
import { flattenPaperRichText, paperRichTextFromPlainText, paperRunsShareStyle } from '../../../lib/paperRichText';
import type { PaperRichParagraph, PaperTextRun } from '../../../types/paper';

export interface PaperTextRange {
  /** Inclusive start offset into the paragraphs' flattened text. */
  start: number;
  /** Exclusive end offset into the paragraphs' flattened text. */
  end: number;
}

/** The togglable subset of run styling this feature authors (bold/italic/underline). */
export type ToggleableRunStyle = Partial<Pick<PaperTextRun, 'fontWeight' | 'fontStyle' | 'underline'>>;

export interface RunStyleTogglePatch {
  /** Applied when some part of the range doesn't already carry this style. */
  on: ToggleableRunStyle;
  /** Applied when the WHOLE range already carries `on` — so the same button/shortcut turns it back off. */
  off: ToggleableRunStyle;
}

export const BOLD_TOGGLE_PATCH: RunStyleTogglePatch = { on: { fontWeight: '700' }, off: { fontWeight: '400' } };
export const ITALIC_TOGGLE_PATCH: RunStyleTogglePatch = { on: { fontStyle: 'italic' }, off: { fontStyle: 'normal' } };
export const UNDERLINE_TOGGLE_PATCH: RunStyleTogglePatch = { on: { underline: true }, off: { underline: undefined } };

export const MIN_RUN_FONT_SIZE_PT = 4;
export const MAX_RUN_FONT_SIZE_PT = 96;

const BULLET_MARKER = '•';
const BULLET_HANGING_INDENT_MM = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ParagraphSpan {
  /** Offset of this paragraph's first character (its list-marker prefix, if any, else its first run) in the
   *  flattened text. */
  start: number;
  /** Offset one past this paragraph's last character (before the joining "\n", if any). */
  end: number;
  /** Where this paragraph's actual run text starts, after any "marker\t" prefix — which belongs to no run and
   *  is never split/patched by a run-level transform. */
  textStart: number;
}

/** Compute each paragraph's span in flattenPaperRichText's offset space, without building the string itself. */
function paragraphSpans(paragraphs: PaperRichParagraph[]): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  let offset = 0;
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) offset += 1; // the "\n" joining this paragraph to the previous one
    const start = offset;
    const markerLength = paragraph.listMarker ? paragraph.listMarker.length + 1 : 0; // "marker" + "\t"
    const textStart = start + markerLength;
    const textLength = paragraph.runs.reduce((sum, run) => sum + run.text.length, 0);
    offset = textStart + textLength;
    spans.push({ start, end: offset, textStart });
  });
  return spans;
}

/** Merge consecutive runs that share styling — mirrors src/lib/paperRichText.ts's own (unexported) helper of
 *  the same purpose, reusing its exported `paperRunsShareStyle` comparator so "same style" means one thing. */
function mergeAdjacentRuns(runs: PaperTextRun[]): PaperTextRun[] {
  const merged: PaperTextRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && paperRunsShareStyle(last, run)) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text };
    } else {
      merged.push({ ...run });
    }
  }
  return merged.length ? merged : [{ text: '' }];
}

function normalizeRange(range: PaperTextRange): { start: number; end: number } {
  return { start: Math.max(0, Math.min(range.start, range.end)), end: Math.max(0, Math.max(range.start, range.end)) };
}

/**
 * Walk every run whose span intersects `range`, splitting a run at the range boundary when the overlap is
 * partial so only the intersecting slice is patched, then merging adjacent same-style runs back together.
 * `patchRun` receives the (possibly split-off) overlapping run slice and returns its replacement; runs and
 * paragraphs entirely outside the range are returned untouched (same object references, even). A zero-length
 * range (a caret with no selection) is a no-op — this library authors selections, not "format the next
 * keystroke" pending state.
 */
function mapRunsInRange(
  paragraphs: PaperRichParagraph[],
  range: PaperTextRange,
  patchRun: (run: PaperTextRun) => PaperTextRun,
): PaperRichParagraph[] {
  const { start, end } = normalizeRange(range);
  if (end <= start) return paragraphs;

  const spans = paragraphSpans(paragraphs);
  return paragraphs.map((paragraph, index) => {
    const span = spans[index];
    if (end <= span.textStart || start >= span.end) return paragraph; // no overlap with this paragraph's text

    let cursor = span.textStart;
    const nextRuns: PaperTextRun[] = [];
    for (const run of paragraph.runs) {
      const runStart = cursor;
      const runEnd = cursor + run.text.length;
      cursor = runEnd;
      const overlapStart = Math.max(runStart, start);
      const overlapEnd = Math.min(runEnd, end);
      if (overlapEnd <= overlapStart) {
        nextRuns.push(run);
        continue;
      }
      const beforeText = run.text.slice(0, overlapStart - runStart);
      const overlapText = run.text.slice(overlapStart - runStart, overlapEnd - runStart);
      const afterText = run.text.slice(overlapEnd - runStart);
      if (beforeText) nextRuns.push({ ...run, text: beforeText });
      nextRuns.push(patchRun({ ...run, text: overlapText }));
      if (afterText) nextRuns.push({ ...run, text: afterText });
    }
    return { ...paragraph, runs: mergeAdjacentRuns(nextRuns) };
  });
}

/** True when every run intersecting `range` already carries every field/value in `style` (used to decide
 *  whether a toggle should turn a style ON across the whole range, or OFF because it's already fully applied). */
function isRangeFullyStyled(paragraphs: PaperRichParagraph[], range: PaperTextRange, style: ToggleableRunStyle): boolean {
  const { start, end } = normalizeRange(range);
  if (end <= start) return false;

  const spans = paragraphSpans(paragraphs);
  const keys = Object.keys(style) as Array<keyof ToggleableRunStyle>;
  let touchedAnyRun = false;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const span = spans[index];
    if (end <= span.textStart || start >= span.end) continue;

    let cursor = span.textStart;
    for (const run of paragraphs[index].runs) {
      const runStart = cursor;
      const runEnd = cursor + run.text.length;
      cursor = runEnd;
      const overlapStart = Math.max(runStart, start);
      const overlapEnd = Math.min(runEnd, end);
      if (overlapEnd <= overlapStart) continue;
      touchedAnyRun = true;
      if (!keys.every((key) => run[key] === style[key])) return false;
    }
  }
  return touchedAnyRun;
}

/**
 * Toggle a run style (bold/italic/underline) across a character range: if the WHOLE range already carries
 * `patch.on`, applies `patch.off` (turning it back off); otherwise applies `patch.on` to the whole range
 * (matching standard word-processor Bold/Italic/Underline button behaviour — mixed or unstyled selections
 * always resolve to "on"). Splits/merges runs as needed; never touches run text, so flattening the result is
 * always byte-identical to flattening the input.
 */
export function toggleRunStyle(
  paragraphs: PaperRichParagraph[],
  range: PaperTextRange,
  patch: RunStyleTogglePatch,
): PaperRichParagraph[] {
  const applied = isRangeFullyStyled(paragraphs, range, patch.on) ? patch.off : patch.on;
  return mapRunsInRange(paragraphs, range, (run) => ({ ...run, ...applied }));
}

/**
 * Step every run's font size across a character range by `deltaPt` (typically +1/-1), clamped to
 * [MIN_RUN_FONT_SIZE_PT, MAX_RUN_FONT_SIZE_PT]. A run with no explicit `fontSizePt` (inheriting the frame's
 * typography) is first materialized from `frameFontSizePt` before stepping, so "A+" on an unset run grows it
 * from what it's actually displaying, not from zero.
 */
export function stepFontSize(
  paragraphs: PaperRichParagraph[],
  range: PaperTextRange,
  deltaPt: number,
  frameFontSizePt: number,
): PaperRichParagraph[] {
  return mapRunsInRange(paragraphs, range, (run) => ({
    ...run,
    fontSizePt: clamp((run.fontSizePt ?? frameFontSizePt) + deltaPt, MIN_RUN_FONT_SIZE_PT, MAX_RUN_FONT_SIZE_PT),
  }));
}

/**
 * Toggle a "•" bullet + hanging indent on/off for the given paragraph indexes: if every targeted paragraph is
 * already bulleted, un-bullets all of them; otherwise bullets all of them (same all-or-nothing convention as
 * toggleRunStyle). Unlike the run-style toggles, this DOES change flattenPaperRichText's output — the bullet
 * marker is a real, meaningful content prefix (`"•\t"` per flattenPaperRichText), not styling.
 */
export function toggleParagraphBullet(paragraphs: PaperRichParagraph[], paragraphIndexes: number[]): PaperRichParagraph[] {
  const targets = new Set(paragraphIndexes.filter((index) => index >= 0 && index < paragraphs.length));
  if (targets.size === 0) return paragraphs;

  const allAlreadyBulleted = [...targets].every((index) => paragraphs[index].listMarker === BULLET_MARKER);

  return paragraphs.map((paragraph, index) => {
    if (!targets.has(index)) return paragraph;
    return allAlreadyBulleted
      ? { ...paragraph, listMarker: undefined, hangingIndentMm: undefined }
      : { ...paragraph, listMarker: BULLET_MARKER, hangingIndentMm: BULLET_HANGING_INDENT_MM };
  });
}

/**
 * Plain-text frames have no richText yet — lift them into single-run-per-line rich paragraphs (via
 * paperRichTextFromPlainText) before any transform runs, so formatting can be authored on ANY text/caption
 * frame, not only ones already promoted to rich text. A no-op when richText already has content.
 */
export function ensureRichTextForTransform(
  richText: PaperRichParagraph[] | undefined,
  plainText: string,
): PaperRichParagraph[] {
  return richText && richText.length ? richText : paperRichTextFromPlainText(plainText);
}

export { flattenPaperRichText };
