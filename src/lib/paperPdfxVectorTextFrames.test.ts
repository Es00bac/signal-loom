import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument } from './paperDocument';
import { updatePaperDocumentSetup } from './paperDocument';
import type { PaperDocument, PaperFrame, PaperImportedFont } from '../types/paper';
import type { IccCmykTransform } from './paperColorManagement';
import { buildVectorTextFrameSpecs, pageTextIsVectorizable } from './paperPdfxVectorTextFrames';
import { bytesToBase64 } from './paperFontLibrary';

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
    // Geometry matches the print/flatten render: frame inset by border(0) + 2mm content padding.
    expect(spec.xPt).toBeCloseTo((5 + 10 + 2) * PT_PER_MM, 4);
    expect(spec.yTopPt).toBeCloseTo((5 + 20 + 2) * PT_PER_MM, 4);
    expect(spec.widthPt).toBeCloseTo((50 - 4) * PT_PER_MM, 4);
    expect(spec.heightPt).toBeCloseTo((30 - 4) * PT_PER_MM, 4);
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

  it('vectorizes caption frames with their vertical alignment; plain text frames stay top-aligned', () => {
    // A caption is single-column text with a visible box; its text is vectorized and the raster keeps the
    // box (blanked text). The caption gets a flex vertical-align in the raster, so the vector carries it.
    const caption = docWithFrames([
      { kind: 'caption', text: 'Narration', xMm: 10, yMm: 10, widthMm: 60, heightMm: 40, textVerticalAlign: 'middle',
        typography: { fontFamily: 'Georgia, serif', fontSizePt: 10, leadingPt: 13, tracking: 0, hyphenate: false, align: 'left', color: '#000', fontWeight: 'normal', fontStyle: 'normal' } },
    ], 0);
    const [capSpec] = buildVectorTextFrameSpecs(caption.pages[0], caption, blackTransform);
    expect(capSpec.text).toBe('Narration');
    expect(capSpec.verticalAlign).toBe('middle');
    // padding-inset geometry (border 0 + 2mm): x = 10+2, w = 60-4.
    expect(capSpec.xPt).toBeCloseTo((10 + 2) * PT_PER_MM, 4);
    expect(capSpec.widthPt).toBeCloseTo((60 - 4) * PT_PER_MM, 4);

    // A plain text frame's vertical-align is NOT applied by the raster (block flow) → spec omits it.
    const text = docWithFrames([
      { kind: 'text', text: 'Body', textVerticalAlign: 'middle', columns: 1,
        typography: { fontFamily: 'Arial', fontSizePt: 12, leadingPt: 14, tracking: 0, hyphenate: false, align: 'left', color: '#000', fontWeight: 'normal', fontStyle: 'normal' } },
    ], 0);
    const [textSpec] = buildVectorTextFrameSpecs(text.pages[0], text, blackTransform);
    expect(textSpec.verticalAlign).toBeUndefined();
  });
});

describe('imported fonts in the vector-text builder', () => {
  const typo = (fontFamily: string) => ({ fontFamily, fontSizePt: 14, leadingPt: 18, tracking: 0, hyphenate: false, align: 'left' as const, color: '#000', fontWeight: 'normal', fontStyle: 'normal' as const });
  const importedFace = (patch: Partial<PaperImportedFont>): PaperImportedFont => ({
    id: 'brandon', familyName: 'Brandon Grotesque', bold: false, italic: false, format: 'truetype',
    embeddable: true, canSubset: true, dataBase64: bytesToBase64(new Uint8Array([1, 2, 3, 4])), ...patch,
  });
  const withImports = (doc: PaperDocument, fonts: PaperImportedFont[]): PaperDocument => ({ ...doc, importedFonts: fonts });

  it('embeds the imported font inline (bytes, no URL) when a frame matches it', () => {
    const doc = withImports(
      docWithFrames([{ text: 'Hi', typography: typo('"Brandon Grotesque", sans-serif') }]),
      [importedFace({})],
    );
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.fontId).toBe('imported-brandon');
    expect(spec.fontBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(spec.fontBytes!)).toEqual([1, 2, 3, 4]);
    expect(spec.fontUrl).toBeUndefined();
  });

  it('lets an imported display font vectorize (real glyphs) instead of rasterizing', () => {
    const doc = withImports(
      docWithFrames([{ text: 'BOOM', typography: typo('Bangers, cursive') }]),
      [importedFace({ id: 'bangers', familyName: 'Bangers' })],
    );
    // Without the import the display font rasterizes; with it, we embed the user's real face.
    expect(pageTextIsVectorizable(doc.pages[0])).toBe(false);
    expect(pageTextIsVectorizable(doc.pages[0], doc.importedFonts)).toBe(true);
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.text).toBe('BOOM');
    expect(spec.fontId).toBe('imported-bangers');
  });

  it('marks the spec whole-font (subset false) when the imported font disallows subsetting', () => {
    const doc = withImports(
      docWithFrames([{ text: 'x', typography: typo('Brandon Grotesque') }]),
      [importedFace({ canSubset: false })],
    );
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.subset).toBe(false);
  });

  it('ignores an imported font whose licence forbids embedding (falls back to Liberation)', () => {
    const doc = withImports(
      docWithFrames([{ text: 'x', typography: typo('Brandon Grotesque') }]),
      [importedFace({ embeddable: false })],
    );
    const [spec] = buildVectorTextFrameSpecs(doc.pages[0], doc, blackTransform);
    expect(spec.fontId).toBe('LiberationSans-Regular');
    expect(spec.fontUrl).toBe('/fonts/liberation/LiberationSans-Regular.ttf');
    expect(spec.fontBytes).toBeUndefined();
  });
});
