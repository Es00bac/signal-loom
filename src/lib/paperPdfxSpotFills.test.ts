import { describe, expect, it } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup, updatePaperFrame } from './paperDocument';
import type { PaperDocument, PaperFrame } from '../types/paper';
import type { PaperSwatch } from './paperSwatches';
import { collectSpotFills } from './paperPdfxSpotFills';

const PT_PER_MM = 72 / 25.4;
const spotSwatch: PaperSwatch = {
  id: 'sw-spot', name: 'Brand Red', type: 'spot', model: 'cmyk', spotName: 'PANTONE 185 C',
  rgb: { r: 227, g: 6, b: 19 }, cmyk: { c: 0, m: 90, y: 85, k: 0 },
};
const processSwatch: PaperSwatch = {
  id: 'sw-proc', name: 'Teal', type: 'process', model: 'cmyk', rgb: { r: 40, g: 160, b: 170 }, cmyk: { c: 80, m: 0, y: 40, k: 0 },
};

function docWithSpotFrame(patch: Partial<PaperFrame> = {}, swatchId = 'sw-spot'): { doc: PaperDocument; frameId: string } {
  let doc = createDefaultPaperDocument({ title: 'spot', preset: 'us-letter' });
  doc = updatePaperDocumentSetup(doc, { bleedMm: 0 });
  doc = { ...doc, swatches: [spotSwatch, processSwatch] };
  const pageId = doc.pages[0].id;
  const added = addFrameToPaperPage(doc, pageId, { kind: 'caption', xMm: 20, yMm: 30, widthMm: 60, heightMm: 40, strokeWidthMm: 0, strokeColor: 'transparent', cornerRadiusMm: 0, ...patch });
  doc = updatePaperFrame(added.document, pageId, added.frameId, { fillColor: '#e30613', fillSwatchId: swatchId });
  return { doc, frameId: added.frameId };
}

describe('collectSpotFills', () => {
  it('turns a plain solid spot-swatch fill into a /Separation spec + knockout', () => {
    const { doc, frameId } = docWithSpotFrame();
    const plan = collectSpotFills(doc.pages[0], doc);
    expect(plan.spotFills).toHaveLength(1);
    const fill = plan.spotFills[0];
    expect(fill.name).toBe('PANTONE 185 C');
    expect(fill.cmyk).toEqual({ c: 0, m: 0.9, y: 0.85, k: 0 });
    expect(fill.tint).toBe(1);
    expect(fill.xPt).toBeCloseTo(20 * PT_PER_MM, 4);
    expect(fill.yTopPt).toBeCloseTo(30 * PT_PER_MM, 4);
    expect(fill.widthPt).toBeCloseTo(60 * PT_PER_MM, 4);
    expect(fill.heightPt).toBeCloseTo(40 * PT_PER_MM, 4);
    expect(plan.knockoutFrameIds).toEqual([frameId]);
    expect(plan.preservedSpotNames).toEqual(['PANTONE 185 C']);
  });

  it('offsets the spot rect by the page bleed', () => {
    let doc = createDefaultPaperDocument({ title: 'spot', preset: 'us-letter' });
    doc = updatePaperDocumentSetup(doc, { bleedMm: 3 });
    doc = { ...doc, swatches: [spotSwatch] };
    const pageId = doc.pages[0].id;
    const added = addFrameToPaperPage(doc, pageId, { kind: 'caption', xMm: 10, yMm: 10, widthMm: 30, heightMm: 20, strokeWidthMm: 0, strokeColor: 'transparent', cornerRadiusMm: 0 });
    doc = updatePaperFrame(added.document, pageId, added.frameId, { fillColor: '#e30613', fillSwatchId: 'sw-spot' });
    const [fill] = collectSpotFills(doc.pages[0], doc).spotFills;
    expect(fill.xPt).toBeCloseTo((3 + 10) * PT_PER_MM, 4);
    expect(fill.yTopPt).toBeCloseTo((3 + 10) * PT_PER_MM, 4);
  });

  it('leaves a process-swatch fill as process (no spot plate)', () => {
    const { doc } = docWithSpotFrame({}, 'sw-proc');
    expect(collectSpotFills(doc.pages[0], doc).spotFills).toHaveLength(0);
  });

  it.each([
    ['a visible stroke', { strokeWidthMm: 0.5, strokeColor: '#000000', strokeOpacity: 1 }],
    ['a fully transparent fill', { fillOpacity: 0 }],
    ['a gradient fill', { fillGradient: { type: 'linear', fromColor: '#000000', toColor: '#ffffff', angleDeg: 0 } as PaperFrame['fillGradient'] }],
  ])('leaves a spot fill with %s as process (not faithfully a plateable rectangle)', (_label, patch) => {
    const { doc } = docWithSpotFrame(patch);
    expect(collectSpotFills(doc.pages[0], doc).spotFills).toHaveLength(0);
  });

  it('plates a ROUNDED-corner spot rect, carrying the corner radius', () => {
    const { doc } = docWithSpotFrame({ cornerRadiusMm: 3 });
    const plan = collectSpotFills(doc.pages[0], doc);
    expect(plan.spotFills).toHaveLength(1);
    expect(plan.spotFills[0].cornerRadiusPt).toBeCloseTo(3 * PT_PER_MM, 4);
  });

  it('plates a ROTATED spot rect, carrying the angle + frame-centre pivot', () => {
    const { doc, frameId } = docWithSpotFrame({ rotationDeg: 15 });
    const frame = doc.pages[0].frames.find((f) => f.id === frameId)!;
    const plan = collectSpotFills(doc.pages[0], doc);
    expect(plan.spotFills).toHaveLength(1);
    const fill = plan.spotFills[0];
    expect(fill.rotationDeg).toBe(15);
    const bleedMm = doc.page.bleedMm;
    expect(fill.centerXPt).toBeCloseTo((bleedMm + frame.xMm + frame.widthMm / 2) * PT_PER_MM, 4);
    expect(fill.centerYTopPt).toBeCloseTo((bleedMm + frame.yMm + frame.heightMm / 2) * PT_PER_MM, 4);
  });

  it('keeps a partial-opacity spot fill as a TINTED plate (fill opacity → spot screen density)', () => {
    const { doc } = docWithSpotFrame({ fillOpacity: 0.4 });
    const plan = collectSpotFills(doc.pages[0], doc);
    expect(plan.spotFills).toHaveLength(1);
    expect(plan.spotFills[0].tint).toBeCloseTo(0.4, 6);
    expect(plan.knockoutFrameIds).toHaveLength(1); // still knocked out of the process raster
  });

  it('returns nothing when the document has no spot swatches', () => {
    let doc = createDefaultPaperDocument({ title: 'nospot', preset: 'us-letter' });
    const pageId = doc.pages[0].id;
    doc = addFrameToPaperPage(doc, pageId, { kind: 'caption', xMm: 10, yMm: 10, widthMm: 30, heightMm: 20 }).document;
    expect(collectSpotFills(doc.pages[0], doc)).toEqual({ spotFills: [], knockoutFrameIds: [], preservedSpotNames: [] });
  });
});
