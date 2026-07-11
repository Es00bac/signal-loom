import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PaperImportedFont } from '../types/paper';
import { vetFontBytes } from './paperFontVetting';
import {
  base64ToBytes,
  bytesToBase64,
  buildImportedFont,
  normalizeFamilyName,
  resolveTextFace,
  selectImportedFace,
} from './paperFontLibrary';

const face = (patch: Partial<PaperImportedFont>): PaperImportedFont => ({
  id: 'f',
  familyName: 'Brandon Grotesque',
  bold: false,
  italic: false,
  format: 'truetype',
  embeddable: true,
  canSubset: true,
  dataBase64: bytesToBase64(new Uint8Array([1, 2, 3, 4])),
  ...patch,
});

describe('base64 codec', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42, 13, 10]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
  it('round-trips a large buffer (past the chunk boundary)', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
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
    const imported = face({ id: 'r', dataBase64: bytesToBase64(new Uint8Array([9, 8, 7])) });
    const resolved = resolveTextFace({ fontFamily: '"Brandon Grotesque", sans-serif' }, [imported]);
    expect(resolved.embeddedReal).toBe(true);
    expect(resolved.id).toBe('imported-r');
    expect(resolved.url).toBeUndefined();
    expect(Array.from(resolved.bytes!)).toEqual([9, 8, 7]);
    expect(resolved.familyName).toBe('Brandon Grotesque');
  });

  it('falls back to the bundled Liberation face (unchanged behaviour) when nothing matches', () => {
    const resolved = resolveTextFace({ fontFamily: 'Georgia, serif' }, undefined);
    expect(resolved.embeddedReal).toBe(false);
    expect(resolved.id).toBe('LiberationSerif-Regular');
    expect(resolved.url).toBe('/fonts/liberation/LiberationSerif-Regular.ttf');
    expect(resolved.bytes).toBeUndefined();
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

  it('builds a persisted record from a real vetted font, bytes round-tripping', () => {
    const bytes = bytesOf('public/fonts/liberation/LiberationSans-Bold.ttf');
    const built = buildImportedFont(vetFontBytes(bytes), bytes, 'font-1')!;
    expect(built).not.toBeNull();
    expect(built.familyName).toBe('Liberation Sans');
    expect(built.bold).toBe(true);
    expect(built.italic).toBe(false);
    expect(built.format).toBe('truetype');
    expect(built.embeddable).toBe(true);
    expect(base64ToBytes(built.dataBase64)).toEqual(bytes);
  });

  it('refuses a font that failed vetting', () => {
    const garbage = new TextEncoder().encode('nope');
    expect(buildImportedFont(vetFontBytes(garbage), garbage, 'font-2')).toBeNull();
  });
});
