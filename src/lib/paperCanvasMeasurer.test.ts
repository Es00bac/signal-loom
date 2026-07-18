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

  it('detects missing native kerning before assignment so an extensible context cannot fake support', () => {
    const context = {
      font: '',
      fontStretch: '',
      fontVariationSettings: '',
      measureText: vi.fn(() => ({ width: 999 })),
    };
    const probe = {
      style: {} as Record<string, string>,
      textContent: '',
      getBoundingClientRect: vi.fn(() => ({ width: 44 })),
      remove: vi.fn(),
    };
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: vi.fn((tag: string) => tag === 'canvas' ? { getContext: () => context } : probe),
    });

    const width = createPaperCanvasMeasurer(4)('AV', {
      fontFamily: 'Kerning Test', fontSizePt: 12, leadingPt: 14, tracking: 0, align: 'left',
      fontStretch: '90%', fontVariationSettings: { wdth: 90 }, fontKerning: 'none',
    });

    expect(width).toBe(11);
    expect(context).not.toHaveProperty('fontKerning');
    expect(context.measureText).not.toHaveBeenCalled();
    expect(probe.style.fontKerning).toBe('none');
    expect(probe.remove).toHaveBeenCalledOnce();
  });

  it('bounds and keys the CSS fallback cache while removing every temporary DOM probe', () => {
    const context = {
      font: '',
      fontStretch: '',
      fontVariationSettings: '',
      measureText: vi.fn(() => ({ width: 999 })),
    };
    const attached = new Set<object>();
    let layoutCount = 0;
    const appendChild = vi.fn((probe: object) => attached.add(probe));
    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') return { getContext: () => context };
        const probe = {
          style: {} as Record<string, string>,
          textContent: '',
          getBoundingClientRect: vi.fn(() => ({ width: ++layoutCount })),
          remove: vi.fn(() => attached.delete(probe)),
        };
        return probe;
      }),
    });
    const measureCss = createPaperCanvasMeasurer(1);
    const base = {
      fontFamily: 'Cache Sans', fontSizePt: 12, leadingPt: 14, tracking: 0, align: 'left' as const,
      fontStretch: '90%', fontVariationSettings: { wdth: 90 }, fontKerning: 'none' as const,
    };

    const first = measureCss('same', base);
    expect(measureCss('same', base)).toBe(first);
    expect(layoutCount).toBe(1);
    for (const variant of [
      { ...base, fontFamily: 'Other Sans' },
      { ...base, fontSizePt: 13 },
      { ...base, fontWeight: '700' },
      { ...base, fontStyle: 'italic' },
      { ...base, fontStretch: '80%' },
      { ...base, fontVariationSettings: { wdth: 80 } },
      { ...base, fontKerning: 'normal' as const },
      { ...base, tracking: 25 },
    ]) measureCss('same', variant);
    expect(layoutCount).toBe(9);

    for (let index = 0; index < 128; index += 1) measureCss(`unique-${index}`, base);
    const beforeRecentHit = layoutCount;
    measureCss('unique-127', base);
    expect(layoutCount).toBe(beforeRecentHit);
    measureCss('same', base);
    expect(layoutCount).toBe(beforeRecentHit + 1);
    expect(attached.size).toBe(0);
    expect(appendChild).toHaveBeenCalledTimes(layoutCount);
    expect(context.measureText).not.toHaveBeenCalled();
  });

  it('invalidates cached CSS widths when the owning document font state changes', () => {
    const context = {
      font: '',
      fontStretch: '',
      fontVariationSettings: '',
      measureText: vi.fn(() => ({ width: 999 })),
    };
    let liveWidth = 10;
    const fonts = {
      status: 'loading',
      size: 1,
      ready: Promise.resolve(undefined),
      check: vi.fn(() => true),
    };
    const layouts = vi.fn(() => ({ width: liveWidth }));
    vi.stubGlobal('document', {
      fonts,
      body: { appendChild: vi.fn() },
      createElement: vi.fn((tag: string) => tag === 'canvas'
        ? { getContext: () => context }
        : { style: {}, textContent: '', getBoundingClientRect: layouts, remove: vi.fn() }),
    });
    const measureCss = createPaperCanvasMeasurer(1);
    const spec = {
      fontFamily: 'Loading Sans', fontSizePt: 12, leadingPt: 14, tracking: 0, align: 'left' as const,
      fontStretch: '90%', fontVariationSettings: { wdth: 90 }, fontKerning: 'none' as const,
    };

    expect(measureCss('same', spec)).toBe(10);
    expect(measureCss('same', spec)).toBe(10);
    expect(layouts).toHaveBeenCalledOnce();
    liveWidth = 20;
    fonts.status = 'loaded';
    fonts.ready = Promise.resolve(undefined);
    expect(measureCss('same', spec)).toBe(20);
    expect(layouts).toHaveBeenCalledTimes(2);
  });
});
