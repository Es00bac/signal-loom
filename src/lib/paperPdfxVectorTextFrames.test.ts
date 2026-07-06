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
});
