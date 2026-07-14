import { describe, expect, it } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { composePaperTextFrame, type PaperManagedFontResolver } from './paperTextComposition';
import type { PaperManagedFontFace, PaperTextRun } from '../types/paper';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import type { PaperTextShaper } from './paperTextShaper';

function assetRef(seed: string): BinaryAssetRef {
  const sha256 = seed.repeat(64).slice(0, 64);
  return { id: `sha256:${sha256}`, sha256, mimeType: 'font/ttf', byteLength: 4 };
}

function face(weight: number, patch: Partial<PaperManagedFontFace> = {}): PaperManagedFontFace {
  return {
    id: `fixture-${weight}`,
    familyId: 'fixture sans',
    familyName: 'Fixture Sans',
    postscriptName: `FixtureSans-${weight}`,
    weight,
    style: 'normal',
    stretchPercent: 100,
    collectionIndex: 0,
    variableAxes: {},
    unicodeRanges: [{ start: 0x0, end: 0x10ffff }],
    format: 'truetype',
    fontAsset: assetRef(String((weight / 100) % 10)),
    embeddability: 'installable',
    canSubset: true,
    source: { kind: 'user-import' },
    license: {},
    ...patch,
  };
}

function fixtureShaper(): PaperTextShaper {
  return {
    shape(request) {
      let offset = 0;
      const glyphs = Array.from(request.text).map((character) => {
        const advance = request.fontSizePt / 2;
        const glyph = {
          glyphId: character.codePointAt(0) ?? 1,
          cluster: offset,
          xAdvance: request.direction === 'ttb' ? 0 : advance,
          yAdvance: request.direction === 'ttb' ? -advance : 0,
          xOffset: 0,
          yOffset: 0,
        };
        offset += character.length;
        return glyph;
      });
      return {
        direction: request.direction,
        glyphs,
        advanceX: glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
        advanceY: glyphs.reduce((total, glyph) => total + glyph.yAdvance, 0),
      };
    },
    glyphPath: () => 'M 0 0 L 500 0 L 500 500 Z',
    destroy: () => undefined,
  };
}

function composeFixture(runs: PaperTextRun[]) {
  let document = createDefaultPaperDocument({ title: 'Composition fixture' });
  const pageId = document.pages[0].id;
  const added = addFrameToPaperPage(document, pageId, {
    id: 'fixture-frame',
    kind: 'text',
    xMm: 0,
    yMm: 0,
    widthMm: 100,
    heightMm: 30,
  });
  const regular = face(400);
  const bold = face(700);
  document = {
    ...added.document,
    importedFonts: [regular, bold],
  };
  const frame = {
    ...document.pages[0].frames[0],
    text: runs.map((run) => run.text).join(''),
    richText: [{ runs }],
    typography: {
      ...document.pages[0].frames[0].typography,
      fontFamily: 'Fixture Sans',
      fontSizePt: 12,
      leadingPt: 14,
      fontWeight: '400',
    },
  };
  const resolver: PaperManagedFontResolver = async () => fixtureShaper();
  return composePaperTextFrame(frame, document, resolver);
}

describe('composePaperTextFrame', () => {
  it('keeps mixed rich runs on one deterministic baseline with exact faces', async () => {
    const composed = await composeFixture([{ text: 'Plain ' }, { text: 'bold', fontWeight: '700' }]);

    expect(composed.missingFaces).toEqual([]);
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].runs.map((run) => run.face.weight)).toEqual([400, 700]);
    expect(composed.caretMap[6].xPt).toBeLessThan(composed.caretMap[7].xPt);
  });

  it('orders mixed RTL run groups visually and maps RTL carets right-to-left', async () => {
    const composed = await composeFixture([
      { text: 'אב', color: '#dc2626' },
      { text: 'CD', color: '#2563eb' },
    ]);

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].runs.map((run) => run.color.color)).toEqual(['#2563eb', '#dc2626']);
    expect(composed.caretMap[0].xPt).toBeGreaterThan(composed.caretMap[1].xPt);
  });

  it('preserves run tracking, baseline shifts, and decoration data in glyph output', async () => {
    const composed = await composeFixture([
      { text: 'AB', tracking: 100 },
      { text: '2', vertAlign: 'super', underline: true, strike: true, highlight: '#fde047' },
    ]);
    const [tracked, raised] = composed.lines[0].runs;

    expect(tracked.advanceXPt).toBeCloseTo(13.2);
    expect(raised.fontSizePt).toBeCloseTo(8.4);
    expect(raised.glyphs[0].yPt).toBeLessThan(composed.lines[0].originYPt);
    expect(raised.decorations).toEqual({ underline: true, strike: true, highlight: '#fde047' });
  });

  it('composes vertical Japanese with right-to-left columns and kinsoku', async () => {
    let document = createDefaultPaperDocument({ title: 'Vertical composition fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'vertical-frame',
      kind: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 30,
      heightMm: 8,
    });
    const managedFace = face(400);
    document = { ...added.document, importedFonts: [managedFace] };
    const frame = {
      ...document.pages[0].frames[0],
      text: '「花」、記憶。',
      typography: {
        ...document.pages[0].frames[0].typography,
        fontFamily: 'Fixture Sans',
        fontSizePt: 10,
        leadingPt: 11,
        writingMode: 'vertical-rl' as const,
        lineBreakStrict: true,
      },
    };
    const composed = await composePaperTextFrame(frame, document, async () => fixtureShaper());

    expect(composed.writingMode).toBe('vertical-rl');
    expect(composed.missingFaces).toEqual([]);
    expect(composed.lines.length).toBeGreaterThanOrEqual(2);
    expect(composed.lines[1].originXPt).toBeLessThan(composed.lines[0].originXPt);
    expect(composed.lines.every((line) => !/^[、。」]/.test(line.text))).toBe(true);
  });

  it('records a missing exact face instead of substituting a browser font', async () => {
    let document = createDefaultPaperDocument({ title: 'Missing face fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'missing-face-frame',
      kind: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 60,
      heightMm: 20,
    });
    document = { ...added.document, importedFonts: [face(400)] };
    const frame = {
      ...document.pages[0].frames[0],
      text: 'Needs bold',
      richText: [{ runs: [{ text: 'Needs bold', fontWeight: '700' }] }],
      typography: { ...document.pages[0].frames[0].typography, fontFamily: 'Fixture Sans' },
    };
    const composed = await composePaperTextFrame(frame, document, async () => fixtureShaper());

    expect(composed.missingFaces).toEqual([expect.objectContaining({ familyId: 'fixture sans', weight: 700 })]);
    expect(composed.lines).toEqual([]);
  });

  it('keeps ruby and emphasis as positioned managed annotations instead of raw notation glyphs', async () => {
    let document = createDefaultPaperDocument({ title: 'Annotation fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'annotation-frame',
      kind: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 80,
      heightMm: 30,
    });
    document = { ...added.document, importedFonts: [face(400)] };
    const frame = {
      ...document.pages[0].frames[0],
      text: '漢字《かんじ》《《強調》》',
      typography: { ...document.pages[0].frames[0].typography, fontFamily: 'Fixture Sans' },
    };
    const composed = await composePaperTextFrame(frame, document, async () => fixtureShaper());

    expect(composed.lines[0].text).toBe('漢字強調');
    expect(composed.lines[0].runs.some((run) => run.annotation === 'ruby')).toBe(true);
    expect(composed.emphasisMarks).toHaveLength(2);
  });

  it('keeps rich paragraph boxes and hanging list markers on deterministic column geometry', async () => {
    let document = createDefaultPaperDocument({ title: 'Paragraph geometry fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'paragraph-geometry-frame',
      kind: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 28,
      heightMm: 60,
    });
    document = { ...added.document, importedFonts: [face(400)] };
    const text = 'A managed list item must continue on multiple deterministic lines.';
    const frame = {
      ...document.pages[0].frames[0],
      text: `•\t${text}`,
      richText: [{
        listMarker: '•',
        leftIndentMm: 2,
        shading: '#e5e7eb',
        borders: { top: { color: '#111827', widthPt: 1 }, paddingPt: 3 },
        runs: [{ text }],
      }],
      typography: { ...document.pages[0].frames[0].typography, fontFamily: 'Fixture Sans', fontSizePt: 12, leadingPt: 14 },
    };

    const composed = await composePaperTextFrame(frame, document, async () => fixtureShaper());

    expect(composed.lines.length).toBeGreaterThan(1);
    expect(composed.lines[1].originXPt).toBeGreaterThan(composed.lines[0].originXPt);
    expect(composed.paragraphBoxes).toEqual([expect.objectContaining({
      xPt: composed.bounds.xPt,
      widthPt: composed.bounds.widthPt,
    })]);
  });

  it('reserves the drop-cap lane through the configured number of lines', async () => {
    let document = createDefaultPaperDocument({ title: 'Drop cap fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'drop-cap-frame',
      kind: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 35,
      heightMm: 70,
    });
    document = { ...added.document, importedFonts: [face(400)] };
    const text = 'Drop caps reserve a deterministic lane while the following lines wrap beside them.';
    const frame = {
      ...document.pages[0].frames[0],
      text,
      richText: [{ runs: [{ text }], dropCapLines: 3 }],
      typography: { ...document.pages[0].frames[0].typography, fontFamily: 'Fixture Sans', fontSizePt: 12, leadingPt: 14 },
    };

    const composed = await composePaperTextFrame(frame, document, async () => fixtureShaper());

    expect(composed.lines.length).toBeGreaterThanOrEqual(3);
    expect(composed.lines[1].originXPt).toBeGreaterThan(composed.lines[0].originXPt);
  });

  it('applies bubble vertical alignment to managed glyph coordinates', async () => {
    let document = createDefaultPaperDocument({ title: 'Bubble alignment fixture' });
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, {
      id: 'bubble-alignment-frame',
      kind: 'speechBubble',
      xMm: 0,
      yMm: 0,
      widthMm: 60,
      heightMm: 45,
    });
    document = { ...added.document, importedFonts: [face(400)] };
    const base = {
      ...document.pages[0].frames[0],
      text: 'Centered in the bubble',
      typography: { ...document.pages[0].frames[0].typography, fontFamily: 'Fixture Sans', fontSizePt: 12, leadingPt: 14 },
    };

    const top = await composePaperTextFrame({ ...base, textVerticalAlign: 'top' }, document, async () => fixtureShaper());
    const bottom = await composePaperTextFrame({ ...base, textVerticalAlign: 'bottom' }, document, async () => fixtureShaper());

    expect(bottom.bounds).toEqual(top.bounds);
    expect(bottom.lines[0].originYPt).toBeGreaterThan(top.lines[0].originYPt);
  });
});
