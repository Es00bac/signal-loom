import { describe, expect, it } from 'vitest';
import type { PaperFrame, PaperManagedFontFace } from '../types/paper';
import {
  aliasPaperDocumentManagedFontFamilies,
  assertNoConflictingPaperManagedFontDescriptors,
  buildExactPaperManagedFontCss,
  collectExactPaperManagedFaces,
  paperFontStyleDescriptor,
  readPaperManagedFontManifest,
  verifyExactPaperManagedFontReadiness,
} from './paperExactManagedFonts';
import { createDefaultPaperDocument } from './paperDocument';

const asset = { id: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64), mimeType: 'font/ttf', byteLength: 3 } as const;
function face(overrides: Partial<PaperManagedFontFace> = {}): PaperManagedFontFace {
  return { id: 'oblique-12', familyId: 'managed-serif', familyName: 'Managed Serif', postscriptName: 'ManagedSerif-Oblique', weight: 900, style: 'oblique', obliqueAngleDeg: 12, stretchPercent: 75, collectionIndex: 0, variableAxes: {}, unicodeRanges: [], format: 'truetype', fontAsset: asset, embeddability: 'installable', canSubset: true, source: { kind: 'user-import' }, license: {}, ...overrides };
}
function frame(): PaperFrame {
  return { id: 'frame', kind: 'text', label: 'Exact text', xMm: 0, yMm: 0, widthMm: 30, heightMm: 10, rotationDeg: 0, locked: false, fit: 'cover', imageScale: 1, imageOffsetXPercent: 0, imageOffsetYPercent: 0, imageRotationDeg: 0, columns: 1, typography: { fontFamily: 'Managed Serif', fontWeight: '700', fontStyle: 'oblique 12deg', fontStretch: 'condensed', fontSizePt: 10, leadingPt: 12, tracking: 0, align: 'left', hyphenate: false, color: '#000' }, fillColor: 'transparent', fillOpacity: 0, strokeColor: 'transparent', strokeOpacity: 0, strokeWidthMm: 0, strokeStyle: 'solid', cornerRadiusMm: 0, opacity: 1, textBoxXPercent: 0, textBoxYPercent: 0, textBoxWidthPercent: 100, textBoxHeightPercent: 100, textRotationDeg: 0, textVerticalAlign: 'top', zIndex: 0, richText: [{ id: 'p', runs: [{ id: 'r', text: 'Exact', fontWeight: 'bolder' }] }] };
}

describe('exact managed Paper font identities', () => {
  it('keeps an oblique angle, stretch, and inherited relative weight through collection and aliasing', () => {
    const exact = face();
    const stale = face({ id: 'wrong-angle', obliqueAngleDeg: 14 });
    expect(collectExactPaperManagedFaces([frame()], [exact, stale]).map((item) => item.id)).toEqual(['oblique-12']);
    const document = createDefaultPaperDocument();
    document.pages[0].frames = [frame()];
    document.importedFonts = [exact, stale];
    const aliased = aliasPaperDocumentManagedFontFamilies(document);
    expect(aliased.pages[0].frames[0].richText?.[0].runs[0].fontFamily).toContain('oblique-12');
    expect(paperFontStyleDescriptor('oblique', exact.obliqueAngleDeg)).toBe('oblique 12deg');
  });

  it('blocks a hostile unrelated returned face before paint', async () => {
    const fonts = {
      ready: Promise.resolve(),
      load: async () => new Set([{ family: 'not-the-requested-alias', status: 'loaded' }]),
      check: () => true,
    };
    await expect(verifyExactPaperManagedFontReadiness({ fonts } as unknown as Document, '/* signal-loom-managed-font-manifest:eyJ2ZXJzaW9uIjoxLCJmYWNlcyI6W3siaWRlbnRpdHkiOiJmIiwgImZhbWlseUFsaWFzIjoic2xvb20tbWFuYWdlZC1mIiwid2VpZ2h0Ijo0MDAsInN0eWxlIjoibm9ybWFsIiwic3RyZXRjaFBlcmNlbnQiOjEwMH1dfQ */ @font-face{}')).rejects.toThrow(/requested identity/i);
  });

  it('keeps a collection member and optical-size coordinate in the exact browser payload', async () => {
    const variableCollection = face({
      id: 'collection-opsz', format: 'collection', collectionIndex: 1,
      variableAxes: { opsz: { min: 8, default: 12, max: 72 } },
      variationSettings: { opsz: 18 },
    });
    const css = await buildExactPaperManagedFontCss([variableCollection], async () => Uint8Array.from([1, 2, 3]));
    expect(css).toContain('format("collection")');
    expect(readPaperManagedFontManifest(css)?.faces[0]).toMatchObject({ collectionIndex: 1, variationSettings: { opsz: 18 } });
  });

  it('rejects conflicting descriptor bytes before a registration order can choose one', () => {
    expect(() => assertNoConflictingPaperManagedFontDescriptors([
      face(), face({ id: 'same-descriptor-other-bytes', fontAsset: { ...asset, sha256: 'b'.repeat(64), id: `sha256:${'b'.repeat(64)}` } }),
    ])).toThrow(/descriptor collision/i);
  });
});
