import { describe, expect, it } from 'vitest';
import type { PaperFrame } from '../types/paper';
import { buildPaperBubbleConnectorSegments, getPaperBubbleChainFrames } from './paperBubbleChains';

function frame(overrides: Partial<PaperFrame>): PaperFrame {
  return {
    id: 'bubble',
    kind: 'speechBubble',
    label: 'Bubble',
    xMm: 10,
    yMm: 10,
    widthMm: 40,
    heightMm: 20,
    rotationDeg: 0,
    locked: false,
    fit: 'cover',
    imageScale: 1,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
    imageRotationDeg: 0,
    columns: 1,
    typography: {
      fontFamily: 'Inter',
      fontSizePt: 10,
      leadingPt: 13,
      tracking: 0,
      align: 'center',
      hyphenate: false,
      color: '#111827',
      fontWeight: '400',
      fontStyle: 'normal',
    },
    fillColor: '#ffffff',
    fillOpacity: 1,
    strokeColor: '#111827',
    strokeOpacity: 1,
    strokeWidthMm: 0.35,
    strokeStyle: 'solid',
    cornerRadiusMm: 0,
    opacity: 1,
    textBoxXPercent: 12,
    textBoxYPercent: 18,
    textBoxWidthPercent: 76,
    textBoxHeightPercent: 48,
    textRotationDeg: 0,
    textVerticalAlign: 'middle',
    zIndex: 0,
    ...overrides,
  };
}

describe('paper bubble chains', () => {
  it('orders chain frames by chain order before geometry fallback', () => {
    const frames = [
      frame({ id: 'third', xMm: 0, yMm: 0, bubbleChainId: 'line-a', bubbleChainOrder: 3 }),
      frame({ id: 'first', xMm: 120, yMm: 80, bubbleChainId: 'line-a', bubbleChainOrder: 1 }),
      frame({ id: 'second', xMm: 60, yMm: 20, bubbleChainId: 'line-a', bubbleChainOrder: 2 }),
      frame({ id: 'other-chain', bubbleChainId: 'line-b', bubbleChainOrder: 1 }),
    ];

    expect(getPaperBubbleChainFrames(frames, 'line-a').map((candidate) => candidate.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('builds connector segments between adjacent bubbles in each chain', () => {
    const segments = buildPaperBubbleConnectorSegments([
      frame({ id: 'a', xMm: 10, yMm: 20, widthMm: 30, heightMm: 18, bubbleChainId: 'line-a', bubbleChainOrder: 1 }),
      frame({ id: 'b', xMm: 62, yMm: 24, widthMm: 30, heightMm: 18, bubbleChainId: 'line-a', bubbleChainOrder: 2 }),
      frame({ id: 'c', xMm: 110, yMm: 50, widthMm: 30, heightMm: 18, bubbleChainId: 'line-a', bubbleChainOrder: 3, bubbleConnectorStyle: 'thought-dots' }),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      id: 'line-a:a:b',
      chainId: 'line-a',
      fromFrameId: 'a',
      toFrameId: 'b',
      style: 'line',
      from: { xMm: 40, yMm: 29 },
      to: { xMm: 62, yMm: 33 },
    });
    expect(segments[1]).toMatchObject({
      id: 'line-a:b:c',
      style: 'thought-dots',
      fromFrameId: 'b',
      toFrameId: 'c',
    });
    expect(segments[1].dots.length).toBeGreaterThanOrEqual(3);
  });
});
