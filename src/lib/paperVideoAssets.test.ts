import { describe, expect, it } from 'vitest';
import { addPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import {
  buildPaperStoryboardPageAssetLabel,
  buildPaperStoryboardPageDescriptors,
  buildPaperStoryboardSourceKey,
} from './paperVideoAssets';

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
});
