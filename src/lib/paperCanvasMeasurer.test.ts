import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPaperCanvasMeasurer } from './paperCanvasMeasurer';

describe('createPaperCanvasMeasurer rich width metrics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('propagates exact stretch, variation, and kerning properties to the shipping canvas seam', () => {
    const context = {
      font: '',
      fontStretch: '',
      fontVariationSettings: '',
      fontKerning: '',
      measureText: vi.fn(() => ({ width: 24 })),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ getContext: () => context })),
    });

    const width = createPaperCanvasMeasurer(4)('AV', {
      fontFamily: 'M PLUS 1, Inter, sans-serif',
      fontSizePt: 12,
      leadingPt: 14,
      tracking: 0,
      align: 'left',
      fontWeight: '620',
      fontStyle: 'oblique 12deg',
      fontStretch: '87.5%',
      fontVariationSettings: { wght: 620, wdth: 87.5 },
      fontKerning: 'none',
    });

    expect(width).toBe(6);
    expect(context.font).toContain('oblique 12deg 620 87.5% 16px "M PLUS 1", Inter, sans-serif');
    expect(context.fontStretch).toBe('87.5%');
    expect(context.fontVariationSettings).toBe('"wdth" 87.5, "wght" 620');
    expect(context.fontKerning).toBe('none');
  });

  it('uses an exact temporary CSS measurement seam when canvas lacks a requested font property', () => {
    const context = {
      font: '',
      fontKerning: '',
      measureText: vi.fn(() => ({ width: 999 })),
    };
    const probe = {
      style: {} as Record<string, string>,
      textContent: '',
      getBoundingClientRect: vi.fn(() => ({ width: 40 })),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn((tag: string) => tag === 'canvas' ? { getContext: () => context } : probe),
    });

    const width = createPaperCanvasMeasurer(4)('variable', {
      fontFamily: 'Variable Sans',
      fontSizePt: 12,
      leadingPt: 14,
      tracking: 25,
      align: 'left',
      fontStretch: '75%',
      fontVariationSettings: { opsz: 18, wdth: 75 },
      fontKerning: 'normal',
    });

    expect(width).toBe(10);
    expect(probe.style).toMatchObject({
      fontFamily: '"Variable Sans"',
      fontStretch: '75%',
      fontVariationSettings: '"opsz" 18, "wdth" 75',
      fontKerning: 'normal',
      letterSpacing: '0.025em',
    });
    expect(appendChild).toHaveBeenCalledWith(probe);
    expect(probe.remove).toHaveBeenCalledOnce();
    expect(context.measureText).not.toHaveBeenCalled();
  });
});
