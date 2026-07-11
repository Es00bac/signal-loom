import type { PaperFrame, PaperTypography } from '../types/paper';
import { resolvePaperTextColumns } from './paperColumns';
import { flowPaperText, type PaperTextFlowTypeSpec, type PaperTextMeasurer } from './paperTextFlow';
import { getPaperTextThreadFrames, isPaperTextThreadFrame } from './paperTextThreads';
import { resolveExclusionsForTextFrame } from './paperTextWrap';

export interface PaperThreadSlice {
  sourceText: string;
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

    const flow = flowPaperText(
      members[0].text ?? '',
      paperTypographyToTextFlowSpec(members[0].typography),
      members.map((frame) => ({
        id: frame.id,
        columns: resolvePaperTextColumns(frame, paddingMm),
        exclusions: resolveExclusionsForTextFrame(frame, frames),
      })),
      measure,
    );

    flow.frames.forEach((frameResult, index) => {
      result.set(frameResult.frameId, {
        sourceText: frameResult.sourceText,
        isOverset: index === flow.frames.length - 1 && !flow.fits,
        isHead: index === 0,
      });
    });
  }

  return result;
}
