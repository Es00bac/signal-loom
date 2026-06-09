import type {
  PaperBubbleConnectorAnchor,
  PaperBubbleConnectorStyle,
  PaperFrame,
} from '../types/paper';
import type { PaperPoint } from './paperLayoutTools';

export interface PaperBubbleConnectorSegment {
  id: string;
  chainId: string;
  fromFrameId: string;
  toFrameId: string;
  style: PaperBubbleConnectorStyle;
  from: PaperPoint;
  to: PaperPoint;
  control: PaperPoint;
  dots: PaperPoint[];
}

interface ChainCandidate {
  frame: PaperFrame;
  sourceIndex: number;
}

export function isPaperBubbleChainFrame(frame: PaperFrame): boolean {
  return (frame.kind === 'speechBubble' || frame.kind === 'thoughtBubble') && Boolean(frame.bubbleChainId);
}

export function getPaperBubbleChainFrames(frames: PaperFrame[], chainId: string): PaperFrame[] {
  return frames
    .map((frame, sourceIndex) => ({ frame, sourceIndex }))
    .filter((candidate) => candidate.frame.bubbleChainId === chainId && isPaperBubbleChainFrame(candidate.frame))
    .sort(compareBubbleChainCandidates)
    .map((candidate) => candidate.frame);
}

export function buildPaperBubbleConnectorSegments(frames: PaperFrame[]): PaperBubbleConnectorSegment[] {
  const groups = new Map<string, ChainCandidate[]>();

  frames.forEach((frame, sourceIndex) => {
    if (!isPaperBubbleChainFrame(frame) || !frame.bubbleChainId) return;
    groups.set(frame.bubbleChainId, [...(groups.get(frame.bubbleChainId) ?? []), { frame, sourceIndex }]);
  });

  return [...groups.entries()].flatMap(([chainId, candidates]) => {
    const chainFrames = candidates.sort(compareBubbleChainCandidates).map((candidate) => candidate.frame);
    if (chainFrames.length < 2) return [];

    return chainFrames.slice(0, -1).map((fromFrame, index): PaperBubbleConnectorSegment => {
      const toFrame = chainFrames[index + 1];
      const from = resolveBubbleAnchorPoint(fromFrame, toFrame, fromFrame.bubbleConnectorAnchor ?? 'auto');
      const to = resolveBubbleAnchorPoint(toFrame, fromFrame, oppositeAnchor(fromFrame.bubbleConnectorAnchor ?? 'auto'));
      const style = toFrame.bubbleConnectorStyle ?? fromFrame.bubbleConnectorStyle ?? 'line';

      return {
        id: `${chainId}:${fromFrame.id}:${toFrame.id}`,
        chainId,
        fromFrameId: fromFrame.id,
        toFrameId: toFrame.id,
        style,
        from,
        to,
        control: resolveConnectorControlPoint(from, to),
        dots: style === 'thought-dots' ? resolveThoughtConnectorDots(from, to) : [],
      };
    });
  });
}

function compareBubbleChainCandidates(a: ChainCandidate, b: ChainCandidate): number {
  return compareOrder(a.frame.bubbleChainOrder, b.frame.bubbleChainOrder)
    || a.frame.yMm - b.frame.yMm
    || a.frame.xMm - b.frame.xMm
    || a.sourceIndex - b.sourceIndex;
}

function compareOrder(a: number | undefined, b: number | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return 0;
}

function resolveBubbleAnchorPoint(
  frame: PaperFrame,
  otherFrame: PaperFrame,
  anchor: PaperBubbleConnectorAnchor,
): PaperPoint {
  const resolvedAnchor = anchor === 'auto' ? autoAnchor(frame, otherFrame) : anchor;
  const centerX = frame.xMm + frame.widthMm / 2;
  const centerY = frame.yMm + frame.heightMm / 2;

  switch (resolvedAnchor) {
    case 'left':
      return { xMm: frame.xMm, yMm: centerY };
    case 'right':
      return { xMm: frame.xMm + frame.widthMm, yMm: centerY };
    case 'top':
      return { xMm: centerX, yMm: frame.yMm };
    case 'bottom':
      return { xMm: centerX, yMm: frame.yMm + frame.heightMm };
  }
}

function autoAnchor(frame: PaperFrame, otherFrame: PaperFrame): Exclude<PaperBubbleConnectorAnchor, 'auto'> {
  const frameCenter = {
    x: frame.xMm + frame.widthMm / 2,
    y: frame.yMm + frame.heightMm / 2,
  };
  const otherCenter = {
    x: otherFrame.xMm + otherFrame.widthMm / 2,
    y: otherFrame.yMm + otherFrame.heightMm / 2,
  };
  const dx = otherCenter.x - frameCenter.x;
  const dy = otherCenter.y - frameCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function oppositeAnchor(anchor: PaperBubbleConnectorAnchor): PaperBubbleConnectorAnchor {
  switch (anchor) {
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'auto':
      return 'auto';
  }
}

function resolveConnectorControlPoint(from: PaperPoint, to: PaperPoint): PaperPoint {
  const midX = (from.xMm + to.xMm) / 2;
  const midY = (from.yMm + to.yMm) / 2;
  const dx = to.xMm - from.xMm;
  const dy = to.yMm - from.yMm;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return { xMm: roundMm(midX), yMm: roundMm(midY) };
  const bend = Math.min(10, distance * 0.18);
  return {
    xMm: roundMm(midX - (dy / distance) * bend),
    yMm: roundMm(midY + (dx / distance) * bend),
  };
}

function resolveThoughtConnectorDots(from: PaperPoint, to: PaperPoint): PaperPoint[] {
  const distance = Math.hypot(to.xMm - from.xMm, to.yMm - from.yMm);
  const count = Math.max(3, Math.min(7, Math.round(distance / 12)));
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / (count + 1);
    return {
      xMm: roundMm(from.xMm + (to.xMm - from.xMm) * t),
      yMm: roundMm(from.yMm + (to.yMm - from.yMm) * t),
    };
  });
}

function roundMm(value: number): number {
  return Number(value.toFixed(3));
}
