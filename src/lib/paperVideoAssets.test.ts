// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addFrameToPaperPage, addPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import {
  buildPaperStoryboardPageAssetLabel,
  buildPaperStoryboardPageDescriptors,
  buildPaperStoryboardSourceKey,
  publishPaperStoryboardPageSourcePayloads,
} from './paperVideoAssets';
import type { PaperManagedFontFace } from '../types/paper';
import {
  aliasPaperDocumentManagedFontFamilies,
  buildExactPaperManagedFontCss,
  PaperExactManagedFontError,
} from './paperExactManagedFonts';

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts');
});

function exactStoryboardFace(): PaperManagedFontFace {
  const sha256 = 'd'.repeat(64);
  return {
    id: 'storyboard-exact', familyId: 'storyboard-exact', familyName: 'Storyboard Exact', postscriptName: 'StoryboardExact-Regular',
    weight: 400, style: 'normal', stretchPercent: 100, collectionIndex: 0, variableAxes: {}, unicodeRanges: [],
    format: 'truetype', fontAsset: { id: `sha256:${sha256}`, sha256, mimeType: 'font/ttf', byteLength: 3 },
    embeddability: 'installable', canSubset: true, source: { kind: 'user-import' }, license: {},
  };
}

describe('paperVideoAssets', () => {
  it('describes every Paper page as a stable storyboard image asset', () => {
    let document = createDefaultPaperDocument({ title: 'Opening Boards', preset: 'custom', dpi: 144 });
    document = updatePaperDocumentSetup(document, {
      widthMm: 100,
      heightMm: 50,
      bleedMm: 5,
    });
    document = addPaperPage(document);

    const descriptors = buildPaperStoryboardPageDescriptors(document);

    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]).toMatchObject({
      pageId: document.pages[0].id,
      pageNumber: 1,
      label: 'Opening Boards - Storyboard Page 1',
      envelopeId: `paper-storyboard:${document.id}:567x283:trim`,
      envelopeLabel: 'Opening Boards storyboard pages',
      envelopeIndex: 0,
      sourceKey: `paper-page:${document.id}:${document.pages[0].id}:567x283:trim`,
    });
    expect(descriptors[1]).toMatchObject({
      pageId: document.pages[1].id,
      pageNumber: 2,
      label: 'Opening Boards - Storyboard Page 2',
      envelopeIndex: 1,
    });
  });

  it('uses trim-box source keys by default so video storyboards do not include print bleed', () => {
    const document = updatePaperDocumentSetup(createDefaultPaperDocument({
      title: '',
      preset: 'custom',
      dpi: 300,
    }), {
      widthMm: 25.4,
      heightMm: 50.8,
      bleedMm: 3,
    });

    expect(buildPaperStoryboardPageAssetLabel(document, document.pages[0])).toBe('Paper Layout - Storyboard Page 1');
    expect(buildPaperStoryboardSourceKey(document, document.pages[0].id)).toBe(
      `paper-page:${document.id}:${document.pages[0].id}:300x600:trim`,
    );
    expect(buildPaperStoryboardSourceKey(document, document.pages[0].id, { includeBleed: true })).toBe(
      `paper-page:${document.id}:${document.pages[0].id}:371x671:bleed`,
    );
  });

  it('prepares every Video storyboard raster before publishing and leaves zero assets when exact readiness rejects', async () => {
    const managed = exactStoryboardFace();
    let documentWithText = createDefaultPaperDocument({ title: 'Exact Video Boards' });
    documentWithText = addFrameToPaperPage(documentWithText, documentWithText.pages[0].id, {
      kind: 'text', xMm: 10, yMm: 10, widthMm: 80, heightMm: 20, text: 'Exact storyboard',
      typography: { fontFamily: managed.familyName, fontWeight: '400' },
    }).document;
    documentWithText = addPaperPage(documentWithText);
    documentWithText.importedFonts = [managed];
    const outputDocument = aliasPaperDocumentManagedFontFamilies(documentWithText);
    const css = await buildExactPaperManagedFontCss([managed], async () => Uint8Array.from([1, 2, 3]));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), load: async () => new Set(), check: () => false },
    });
    const publish = vi.fn(async () => ({ id: 'must-not-exist' }));

    await expect(publishPaperStoryboardPageSourcePayloads(
      outputDocument,
      { fontFaceCss: css },
      publish,
    )).rejects.toBeInstanceOf(PaperExactManagedFontError);
    expect(publish).not.toHaveBeenCalled();
  });
});
