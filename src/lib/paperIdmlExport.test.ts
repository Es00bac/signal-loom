import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createDefaultPaperDocument } from './paperDocument';
import { addPaperPage } from './paperDocument';
import type { PaperDocument, PaperFrame } from '../types/paper';
import { buildPaperIdmlPackage, buildPaperIdmlParts, IDML_DOM_VERSION } from './paperIdmlExport';

function withFrames(base: PaperDocument, frames: Partial<PaperFrame>[]): PaperDocument {
  const templateFrame = base.pages[0].frames[0];
  const built: PaperFrame[] = frames.map((patch, i) => ({
    ...(templateFrame ?? ({} as PaperFrame)),
    id: `frame-${i}`,
    kind: 'text',
    label: `Frame ${i}`,
    xMm: 10, yMm: 10, widthMm: 50, heightMm: 30, rotationDeg: 0, locked: false,
    fit: 'contain', imageScale: 1, imageOffsetXPercent: 0, imageOffsetYPercent: 0, imageRotationDeg: 0,
    columns: 1, fillColor: 'transparent', fillOpacity: 1, strokeColor: 'transparent', strokeOpacity: 1,
    strokeWidthMm: 0, strokeStyle: 'solid', cornerRadiusMm: 0, opacity: 1,
    typography: templateFrame?.typography ?? ({} as PaperFrame['typography']),
    ...patch,
  } as PaperFrame));
  return { ...base, pages: base.pages.map((p, idx) => (idx === 0 ? { ...p, frames: built } : p)) };
}

function sampleDoc(): PaperDocument {
  let doc = createDefaultPaperDocument({ title: 'IDML test', preset: 'us-letter' });
  doc = withFrames(doc, [
    { kind: 'text', text: 'Hello & <world>\nSecond line', xMm: 12, yMm: 20, widthMm: 80, heightMm: 40 },
    { kind: 'image', fillColor: '#ff8800', xMm: 100, yMm: 120, widthMm: 60, heightMm: 60 },
  ]);
  return doc;
}

describe('paperIdmlExport', () => {
  it('emits the required package parts, mimetype included', () => {
    const parts = buildPaperIdmlParts(sampleDoc());
    for (const required of [
      'mimetype',
      'META-INF/container.xml',
      'designmap.xml',
      'Resources/Graphic.xml',
      'Resources/Fonts.xml',
      'Resources/Styles.xml',
      'Resources/Preferences.xml',
      'XML/BackingStory.xml',
      'XML/Tags.xml',
      'XML/Mapping.xml',
    ]) {
      expect(parts[required], required).toBeDefined();
    }
    expect(parts.mimetype).toBe('application/vnd.adobe.indesign-idml-package');
    // One spread per page, one story per text frame.
    expect(Object.keys(parts).filter((p) => p.startsWith('Spreads/'))).toHaveLength(1);
    expect(Object.keys(parts).filter((p) => p.startsWith('Stories/'))).toHaveLength(1);
  });

  it('wraps every non-designmap part in idPkg and declares the DOMVersion', () => {
    const parts = buildPaperIdmlParts(sampleDoc());
    for (const [path, xml] of Object.entries(parts)) {
      if (path === 'mimetype' || path.startsWith('META-INF/')) continue;
      expect(xml.startsWith('<?xml'), path).toBe(true);
      if (path === 'designmap.xml') {
        expect(xml).toContain('<Document ');
        expect(xml).toContain('<?aid ');
      } else {
        expect(xml, path).toContain('xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"');
      }
      expect(xml, path).toContain(`DOMVersion="${IDML_DOM_VERSION}"`);
    }
  });

  it('links text frames to stories and lists them in StoryList', () => {
    const parts = buildPaperIdmlParts(sampleDoc());
    const designmap = parts['designmap.xml'];
    const storyPath = Object.keys(parts).find((p) => p.startsWith('Stories/'))!;
    const storySelf = storyPath.replace('Stories/Story_', '').replace('.xml', '');
    expect(designmap).toContain(`StoryList="${storySelf}"`);
    const spreadPath = Object.keys(parts).find((p) => p.startsWith('Spreads/'))!;
    expect(parts[spreadPath]).toContain(`ParentStory="${storySelf}"`);
    // Text content escaped, second paragraph split out.
    expect(parts[storyPath]).toContain('Hello &amp; &lt;world&gt;');
    expect(parts[storyPath]).toContain('Second line');
    // The image frame became a graphic Rectangle with the fill colour.
    expect(parts[spreadPath]).toContain('<Rectangle ');
    expect(parts[spreadPath]).toContain('ContentType="GraphicType"');
  });

  it('places a page with center-of-binding geometry (page top-left at y=-H/2)', () => {
    const parts = buildPaperIdmlParts(sampleDoc());
    const spreadPath = Object.keys(parts).find((p) => p.startsWith('Spreads/'))!;
    // US Letter = 279.4mm tall → 792pt; page ItemTransform ty = -396.
    expect(parts[spreadPath]).toContain('ItemTransform="1 0 0 1 0 -396"');
    expect(parts[spreadPath]).toContain('GeometricBounds="0 0 792 612"');
  });

  it('builds a valid ZIP with mimetype first and round-trips', () => {
    const bytes = buildPaperIdmlPackage(sampleDoc());
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped)[0]).toBe('mimetype');
    expect(strFromU8(unzipped.mimetype)).toBe('application/vnd.adobe.indesign-idml-package');
    expect(unzipped['designmap.xml']).toBeDefined();

    const out = process.env.SLOOM_IDML_OUT;
    if (out) writeFileSync(`${out}/sloom-sample.idml`, bytes);
  });

  it('handles a two-page document (two spreads)', () => {
    let doc = sampleDoc();
    doc = addPaperPage(doc);
    const parts = buildPaperIdmlParts(doc);
    expect(Object.keys(parts).filter((p) => p.startsWith('Spreads/'))).toHaveLength(2);
  });
});
