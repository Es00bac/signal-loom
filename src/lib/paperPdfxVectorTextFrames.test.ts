import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument } from './paperDocument';
import { updatePaperDocumentSetup } from './paperDocument';
import type { PaperDocument, PaperFrame } from '../types/paper';
import type { IccCmykTransform } from './paperColorManagement';
import { buildVectorTextFrameSpecs, pageTextIsVectorizable } from './paperPdfxVectorTextFrames';

const PT_PER_MM = 72 / 25.4;

// Fake transform: reports pure black K for any colour (enough to assert the 0..1 CMYK plumbing).
const blackTransform: IccCmykTransform = {
  kind: 'icc',
  profileName: 'test',
  rgbToCmyk: () => ({ c: 0, m: 0, y: 0, k: 100 }),
};

// Fake transform: reports a RICH black (heavy CMY under the K) for any colour — exercises black policy.
const richBlackTransform: IccCmykTransform = {
  kind: 'icc',
  profileName: 'test',
  rgbToCmyk: () => ({ c: 60, m: 40, y: 40, k: 100 }),
};

function docWithFrames(frames: Partial<PaperFrame>[], bleedMm = 0): PaperDocument {
  let doc = createDefaultPaperDocument({ title: 'vec', preset: 'us-letter' });
  doc = updatePaperDocumentSetup(doc, { bleedMm });
  const template = doc.pages[0].frames[0];
  const built = frames.map((patch, i) => ({
    ...(template ?? ({} as PaperFrame)),
    id: `f${i}`,
    kind: 'text',
    label: `f${i}`,
    xMm: 10, yMm: 20, widthMm: 50, heightMm: 30, rotationDeg: 0, locked: false,
    fit: 'contain', imageScale: 1, imageOffsetXPercent: 0, imageOffsetYPercent: 0, imageRotationDeg: 0,
    columns: 1, fillColor: 'transparent', fillOpacity: 1, strokeColor: 'transparent', strokeOpacity: 1,
    strokeWidthMm: 0, strokeStyle: 'solid', cornerRadiusMm: 0, opacity: 1,
    typography: { ...(template?.typography ?? ({} as PaperFrame['typography'])) },
    ...patch,
  } as PaperFrame));
  return { ...doc, pages: doc.pages.map((p, i) => (i === 0 ? { ...p, frames: built } : p)) };
}

describe('buildVectorTextFrameSpecs', () => {
  it('maps geometry mm→pt with bleed and converts colour to 0..1 CMYK', () => {
    const doc = docWithFrames([
      { text: 'Hello', xMm: 10, yMm: 20, widthMm: 50, heightMm: 30,
        typography: { fontFamily: 'Georgia', fontSizePt: 12, leadingPt: 16, tracking: 0, hyphenate: false, align: 'left', color: '#000000', fontWeight: 'normal', fontStyle: 'normal' } },
    ], 5);
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.text).toBe('Hello');
    expect(spec.fontId).toBe('LiberationSerif-Regular');
    expect(spec.fontUrl).toBe('/fonts/liberation/LiberationSerif-Regular.ttf');
    expect(spec.xPt).toBeCloseTo((5 + 10) * PT_PER_MM, 4);
    expect(spec.yTopPt).toBeCloseTo((5 + 20) * PT_PER_MM, 4);
    expect(spec.widthPt).toBeCloseTo(50 * PT_PER_MM, 4);
    expect(spec.heightPt).toBeCloseTo(30 * PT_PER_MM, 4);
    expect(spec.cmyk).toEqual({ c: 0, m: 0, y: 0, k: 1 });
    expect(spec.align).toBe('left');
  });

  it('skips empty and rotated text frames', () => {
    const doc = docWithFrames([
      { text: '   ', typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#111', fontWeight: 'normal', fontStyle: 'normal' } },
      { text: 'rotated', rotationDeg: 15, typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#111', fontWeight: 'normal', fontStyle: 'normal' } },
      { text: 'keep', rotationDeg: 0, typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#111', fontWeight: 'normal', fontStyle: 'normal' } },
    ]);
    const specs = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(specs.map((s) => s.text)).toEqual(['keep']);
  });

  it('reports a page unvectorizable when any text frame is rotated', () => {
    const rotated = docWithFrames([{ text: 'x', rotationDeg: 90, typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#000', fontWeight: 'normal', fontStyle: 'normal' } }]);
    const upright = docWithFrames([{ text: 'x', rotationDeg: 0, typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#000', fontWeight: 'normal', fontStyle: 'normal' } }]);
    expect(pageTextIsVectorizable(rotated.pages[0])).toBe(false);
    expect(pageTextIsVectorizable(upright.pages[0])).toBe(true);
  });

  it('gates features the linear engine cannot reproduce (raster fallback), but allows hyphenation', () => {
    const baseTypo = { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: true, align: 'left' as const, color: '#000', fontWeight: 'normal', fontStyle: 'normal' as const };
    // hyphenation alone stays vectorizable (raster doesn't actually hyphenate)
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: baseTypo }]).pages[0])).toBe(true);
    // each unsupported feature forces a raster fallback
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', columns: 2, typography: baseTypo }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', textArcPercent: 40, typography: baseTypo }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', bubbleShape: 'oval', typography: baseTypo }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', textStrokeWidthMm: 0.3, typography: baseTypo }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: { ...baseTypo, tracking: 40 } }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: { ...baseTypo, dropCapLines: 3 } }]).pages[0])).toBe(false);
  });

  it('rasterizes display/decorative fonts (no faithful Liberation substitute) but vectorizes text faces', () => {
    const typo = (fontFamily: string) => ({ fontFamily, fontSizePt: 18, leadingPt: 20, tracking: 0, hyphenate: false, align: 'center' as const, color: '#000', fontWeight: '700', fontStyle: 'normal' as const });
    // Text faces Liberation stands in for → vectorized.
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: typo('Inter, system-ui, sans-serif') }]).pages[0])).toBe(true);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: typo('Georgia, serif') }]).pages[0])).toBe(true);
    // Display/decorative faces → rasterized (real glyphs), not vector-substituted.
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: typo('Impact, Haettenschweiler, sans-serif') }]).pages[0])).toBe(false);
    expect(pageTextIsVectorizable(docWithFrames([{ text: 'x', typography: typo('Bangers, cursive') }]).pages[0])).toBe(false);
    // A display frame is skipped by the spec builder even though it has non-empty text.
    const mixed = docWithFrames([
      { text: 'body', typography: typo('Georgia, serif') },
      { text: 'BOOM', typography: typo('Impact, sans-serif') },
    ]);
    const specs = buildVectorTextFrameSpecs(mixed.pages[0], mixed, blackTransform);
    expect(specs.map((s) => s.text)).toEqual(['body']);
    expect(specs[0].frameId).toBe('f0'); // spec carries the source frame id for raster exclusion
  });

  it('applies the force-100k-text black policy to vector text (avoids rich-black fringing)', () => {
    const serif = { fontFamily: 'Georgia', fontSizePt: 10, leadingPt: 13, tracking: 0, hyphenate: false, align: 'left' as const, color: '#111111', fontWeight: 'normal', fontStyle: 'normal' as const };
    const doc = docWithFrames([{ text: 'body', typography: serif }], 0);

    const forced = { ...doc, printProduction: { ...doc.printProduction, blackPolicy: 'force-100k-text' as const } };
    const [forcedSpec] = buildVectorTextFrameSpecs(forced.pages[0], forced, richBlackTransform);
    expect(forcedSpec.cmyk).toEqual({ c: 0, m: 0, y: 0, k: 1 }); // rewritten to pure K

    const allowed = { ...doc, printProduction: { ...doc.printProduction, blackPolicy: 'allow-rich-black' as const } };
    const [allowedSpec] = buildVectorTextFrameSpecs(allowed.pages[0], allowed, richBlackTransform);
    expect(allowedSpec.cmyk).toEqual({ c: 0.6, m: 0.4, y: 0.4, k: 1 }); // rich black preserved
  });

  it('supports vertical alignment and a custom text sub-box in the geometry', () => {
    const doc = docWithFrames([
      { text: 'Mid', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100, textVerticalAlign: 'middle',
        textBoxXPercent: 10, textBoxYPercent: 20, textBoxWidthPercent: 50, textBoxHeightPercent: 40,
        typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#000', fontWeight: 'normal', fontStyle: 'normal' } },
    ], 0);
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.verticalAlign).toBe('middle');
    // sub-box: x = 0 + 100*0.10 = 10mm; w = 100*0.50 = 50mm; h = 100*0.40 = 40mm
    expect(spec.xPt).toBeCloseTo(10 * PT_PER_MM, 4);
    expect(spec.yTopPt).toBeCloseTo(20 * PT_PER_MM, 4);
    expect(spec.widthPt).toBeCloseTo(50 * PT_PER_MM, 4);
    expect(spec.heightPt).toBeCloseTo(40 * PT_PER_MM, 4);
  });
});
