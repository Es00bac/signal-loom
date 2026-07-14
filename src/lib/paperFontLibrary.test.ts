import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PaperImportedFont } from '../types/paper';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import { vetFontBytes } from './paperFontVetting';
import {
  buildImportedFont,
  normalizeFamilyName,
  resolveTextFace,
  selectImportedFace,
} from './paperFontLibrary';

function fontRef(byteLength = 4): BinaryAssetRef {
  const sha256 = '0'.repeat(64);
  return { id: `sha256:${sha256}`, sha256, mimeType: 'font/ttf', byteLength };
}

const face = (patch: Partial<PaperImportedFont>): PaperImportedFont => ({
  id: 'f',
  familyName: 'Brandon Grotesque',
  bold: false,
  italic: false,
  format: 'truetype',
  embeddable: true,
  canSubset: true,
  assetRef: fontRef(),
  ...patch,
});

describe('normalizeFamilyName', () => {
  it('takes the first token, unquoted + lowercased', () => {
    expect(normalizeFamilyName('"Brandon Grotesque", sans-serif')).toBe('brandon grotesque');
    expect(normalizeFamilyName("'Georgia', serif")).toBe('georgia');
    expect(normalizeFamilyName('Inter')).toBe('inter');
    expect(normalizeFamilyName('')).toBe('');
  });
});

describe('selectImportedFace', () => {
  const regular = face({ id: 'r', bold: false, italic: false });
  const bold = face({ id: 'b', bold: true, italic: false });
  const boldItalic = face({ id: 'bi', bold: true, italic: true });

  it('returns undefined when no family matches', () => {
    expect(selectImportedFace('helvetica', false, false, [regular, bold])).toBeUndefined();
  });
  it('prefers an exact weight+style match', () => {
    expect(selectImportedFace('brandon grotesque', true, true, [regular, bold, boldItalic])?.id).toBe('bi');
    expect(selectImportedFace('brandon grotesque', true, false, [regular, bold, boldItalic])?.id).toBe('b');
  });
  it('falls back to the closest available face rather than Liberation', () => {
    // Only Regular imported, but a bold run still gets the user's font.
    expect(selectImportedFace('brandon grotesque', true, false, [regular])?.id).toBe('r');
  });
  it('ignores faces whose licence forbids embedding', () => {
    const restricted = face({ id: 'x', embeddable: false });
    expect(selectImportedFace('brandon grotesque', false, false, [restricted])).toBeUndefined();
  });
});

describe('resolveTextFace', () => {
  it('embeds the user\'s real font when a family matches', () => {
    const imported = face({ id: 'r', assetRef: fontRef(3) });
    const resolved = resolveTextFace({ fontFamily: '"Brandon Grotesque", sans-serif' }, [imported]);
    expect(resolved.embeddedReal).toBe(true);
    expect(resolved.id).toBe('imported-r');
    expect(resolved.url).toBeUndefined();
    expect(resolved.assetRef).toEqual(imported.assetRef);
    expect(resolved.familyName).toBe('Brandon Grotesque');
  });

  it('falls back to the bundled Liberation face (unchanged behaviour) when nothing matches', () => {
    const resolved = resolveTextFace({ fontFamily: 'Georgia, serif' }, undefined);
    expect(resolved.embeddedReal).toBe(false);
    expect(resolved.id).toBe('LiberationSerif-Regular');
    expect(resolved.url).toBe('/fonts/liberation/LiberationSerif-Regular.ttf');
    expect(resolved.assetRef).toBeUndefined();
  });

  it('does not use a matching-but-restricted imported font', () => {
    const restricted = face({ id: 'x', embeddable: false });
    const resolved = resolveTextFace({ fontFamily: 'Brandon Grotesque' }, [restricted]);
    expect(resolved.embeddedReal).toBe(false);
    expect(resolved.url).toContain('/fonts/liberation/');
  });
});

describe('buildImportedFont', () => {
  const bytesOf = (rel: string) => new Uint8Array(readFileSync(resolve(process.cwd(), rel)));

  it('builds a persisted record from a real vetted font and managed asset ref', () => {
    const bytes = bytesOf('public/fonts/liberation/LiberationSans-Bold.ttf');
    const assetRef = fontRef(bytes.byteLength);
    const built = buildImportedFont(vetFontBytes(bytes), assetRef, 'font-1')!;
    expect(built).not.toBeNull();
    expect(built.familyName).toBe('Liberation Sans');
    expect(built.bold).toBe(true);
    expect(built.italic).toBe(false);
    expect(built.format).toBe('truetype');
    expect(built.embeddable).toBe(true);
    expect(built.assetRef).toEqual(assetRef);
  });

  it('refuses a font that failed vetting', () => {
    const garbage = new TextEncoder().encode('nope');
    expect(buildImportedFont(vetFontBytes(garbage), fontRef(garbage.byteLength), 'font-2')).toBeNull();
  });
});
