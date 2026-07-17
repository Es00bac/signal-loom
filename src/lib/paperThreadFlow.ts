import type { PaperFrame, PaperRichParagraph, PaperTypography } from '../types/paper';
import { resolvePaperTextColumns } from './paperColumns';
import { flattenPaperRichText, slicePaperRichTextRange } from './paperRichText';
import { flowPaperText, type PaperTextFlowTypeSpec, type PaperTextMeasurer } from './paperTextFlow';
import { getPaperTextThreadFrames, isPaperTextThreadFrame } from './paperTextThreads';
import { resolveExclusionsForTextFrame } from './paperTextWrap';

export interface PaperThreadSlice {
  sourceText: string;
  /** Authoritative half-open [sourceStart, sourceEnd) window of this slice within the head story string. */
  sourceStart: number;
  sourceEnd: number;
  /**
   * The contiguous RICH slice of the head's richText that flows into this frame — present only when the thread's
   * head carries richText. Preserves paragraph/run styling, links, list markers and blank lines; derived by
   * slicing the head's authoritative richText at [sourceStart, sourceEnd). Undefined for plain-text threads.
   */
  richText?: PaperRichParagraph[];
  isOverset: boolean;
  isHead: boolean;
}

export function paperTypographyToTextFlowSpec(typography: PaperTypography): PaperTextFlowTypeSpec {
  return {
    fontFamily: typography.fontFamily,
    fontSizePt: typography.fontSizePt,
    leadingPt: typography.leadingPt,
    tracking: typography.tracking,
    align: typography.align,
    fontWeight: typography.fontWeight,
    fontStyle: typography.fontStyle,
    vertical: typography.writingMode === 'vertical-rl',
  };
}

/**
 * For every multi-frame text thread on the page, compute the contiguous slice of the thread's story
 * (stored on the head frame) that flows into each member frame, plus whether the final frame still
 * has overset text. Non-threaded and single-frame threads are omitted (they render their own text).
 */
export function computePaperThreadSlices(
  frames: PaperFrame[],
  measure: PaperTextMeasurer,
  paddingMm = 0,
): Map<string, PaperThreadSlice> {
  const result = new Map<string, PaperThreadSlice>();
  const threadIds = new Set(
    frames.filter(isPaperTextThreadFrame).map((frame) => frame.threadId as string),
  );

  for (const threadId of threadIds) {
    const members = getPaperTextThreadFrames(frames, threadId);
    if (members.length < 2) {
      continue;
    }

    const head = members[0];
    const headRichText = head.richText && head.richText.length > 0 ? head.richText : undefined;
    // When the head is rich, flow over the flatten of its authoritative richText so the offsets index the exact
    // string the rich slicer flattens — keeping displayText and the rich slice perfectly consistent. Otherwise
    // flow the head's plain text (unchanged plain-thread behavior).
    const story = headRichText ? flattenPaperRichText(headRichText) : (head.text ?? '');

    const flow = flowPaperText(
      story,
      paperTypographyToTextFlowSpec(head.typography),
      members.map((frame) => ({
        id: frame.id,
        columns: resolvePaperTextColumns(frame, paddingMm),
        exclusions: resolveExclusionsForTextFrame(frame, frames),
      })),
      measure,
    );

    flow.frames.forEach((frameResult, index) => {
      const slice: PaperThreadSlice = {
        sourceText: frameResult.sourceText,
        sourceStart: frameResult.sourceStart,
        sourceEnd: frameResult.sourceEnd,
        isOverset: index === flow.frames.length - 1 && !flow.fits,
        isHead: index === 0,
      };
      if (headRichText) {
        slice.richText = slicePaperRichTextRange(headRichText, frameResult.sourceStart, frameResult.sourceEnd);
      }
      result.set(frameResult.frameId, slice);
    });
  }

  return result;
}
