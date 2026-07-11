// Vets a user-supplied font file BEFORE it can be imported or embedded. A print deliverable is only as
// trustworthy as its fonts: a corrupt face, a missing outline table, or a font whose licence forbids
// embedding turns a "professional" PDF/X into a broken hand-off. This module is the gate — it parses the
// bytes with @pdf-lib/fontkit (the same engine that does the real subset-embed), confirms the essential
// tables are present, and reads the OS/2 fsType embedding permissions, so nothing broken or un-embeddable
// gets silently accepted. Framework-free + unit-testable; the raw bytes come from a file upload upstream.

import fontkit from '@pdf-lib/fontkit';

/** How the OS/2 fsType bits classify a face for print embedding. */
export type FontEmbeddability =
  | 'installable' // fsType 0 — no restrictions
  | 'print-preview' // Preview & Print embedding permitted (fine for a print PDF)
  | 'editable' // Editable embedding permitted
  | 'restricted' // Restricted-License bit set — the foundry forbids embedding
  | 'unknown'; // no OS/2 table — permission undeclared (treated as installable, flagged)

export type FontFormat = 'truetype' | 'opentype-cff' | 'collection' | 'woff' | 'woff2' | 'unknown';

export interface FontVetResult {
  /** True only when the font parsed, has renderable outlines + required tables, and can be embedded. */
  ok: boolean;
  format: FontFormat;
  familyName?: string;
  subfamilyName?: string;
  postscriptName?: string;
  numGlyphs?: number;
  unitsPerEm?: number;
  /** fsType permits embedding this face in a print PDF. */
  embeddable: boolean;
  /** fsType permits subsetting (we always subset; a false here means embed the full font). */
  canSubset: boolean;
  embeddability: FontEmbeddability;
  /** Required tables that are absent (a non-empty list means the font can't be trusted to render). */
  missingTables: string[];
  /** Hard failures that make the font unusable (unparseable, no outlines, missing critical tables). */
  errors: string[];
  /** Soft issues worth surfacing but not blocking (no OS/2, subsetting disallowed, bitmap-only, …). */
  warnings: string[];
}

// Tables every sfnt-based face needs to lay out and render text. Absent → the font can't be trusted.
const BASE_REQUIRED_TABLES = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'post'] as const;

/** Read the 4-byte sfnt signature so we can classify wrappers fontkit may refuse to parse (WOFF/WOFF2). */
function sfntSignature(bytes: Uint8Array): FontFormat {
  if (bytes.length < 4) return 'unknown';
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'ttcf') return 'collection';
  if (tag === 'OTTO') return 'opentype-cff';
  // 0x00010000 ("\0\1\0\0"), 'true', 'typ1' are all TrueType-flavoured sfnt.
  if (tag === 'true' || tag === 'typ1' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    return 'truetype';
  }
  return 'unknown';
}

interface FontkitFsType {
  noEmbedding?: boolean; // Restricted License embedding (bit 1) — must NOT embed
  viewOnly?: boolean; // Preview & Print embedding (bit 2)
  editable?: boolean; // Editable embedding (bit 3)
  noSubsetting?: boolean; // No subsetting (bit 8)
  bitmapOnly?: boolean; // Bitmap embedding only (bit 9)
}

interface FontkitFont {
  postscriptName?: string;
  familyName?: string;
  subfamilyName?: string;
  numGlyphs?: number;
  unitsPerEm?: number;
  directory?: { tables?: Record<string, unknown> };
  ['OS/2']?: { fsType?: FontkitFsType };
  fonts?: FontkitFont[]; // present on a TrueType/OpenType Collection
}

/** Map the decoded OS/2 fsType bitfield to a print-embedding verdict. */
function classifyEmbeddability(fsType: FontkitFsType | undefined): {
  embeddability: FontEmbeddability;
  embeddable: boolean;
  canSubset: boolean;
} {
  if (!fsType) return { embeddability: 'unknown', embeddable: true, canSubset: true };
  // Restricted-License embedding is exclusive of the others and forbids embedding outright.
  if (fsType.noEmbedding) return { embeddability: 'restricted', embeddable: false, canSubset: false };
  const embeddability: FontEmbeddability = fsType.editable
    ? 'editable'
    : fsType.viewOnly
      ? 'print-preview'
      : 'installable';
  return { embeddability, embeddable: true, canSubset: !fsType.noSubsetting };
}

/**
 * Vet raw font bytes for import + embedding. Never throws — a corrupt or unsupported file comes back as a
 * result with `ok: false` and a human-readable reason in `errors`, so the caller can reject it cleanly.
 */
export function vetFontBytes(bytes: Uint8Array): FontVetResult {
  const signature = sfntSignature(bytes);
  const base: FontVetResult = {
    ok: false,
    format: signature,
    embeddable: false,
    canSubset: false,
    embeddability: 'unknown',
    missingTables: [],
    errors: [],
    warnings: [],
  };

  if (bytes.length === 0) {
    return { ...base, errors: ['The font file is empty.'] };
  }

  // @pdf-lib/fontkit cannot decompress WOFF/WOFF2 — reject with a precise, actionable message rather than
  // a cryptic parse error, so the user knows to convert to .ttf/.otf first.
  if (signature === 'woff' || signature === 'woff2') {
    return {
      ...base,
      errors: [
        `${signature.toUpperCase()} web fonts can't be embedded directly — convert this font to .ttf or .otf and re-import it.`,
      ],
    };
  }

  let parsed: FontkitFont;
  try {
    parsed = fontkit.create(bytes as Buffer) as unknown as FontkitFont;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ...base, errors: [`This file isn't a valid font (${reason}). It may be corrupt or the wrong file type.`] };
  }

  // A collection (.ttc/.otc) parses to a wrapper; vet its first face and flag that only one was taken.
  const warnings: string[] = [];
  let font = parsed;
  if (Array.isArray(parsed.fonts) && parsed.fonts.length > 0) {
    font = parsed.fonts[0];
    warnings.push('This is a font collection; only the first face was imported.');
    base.format = 'collection';
  }

  const tables = font.directory?.tables ?? {};
  const has = (tag: string) => Object.prototype.hasOwnProperty.call(tables, tag);

  const missingTables = BASE_REQUIRED_TABLES.filter((t) => !has(t));
  const errors: string[] = [];

  // Outlines: TrueType needs glyf+loca; OpenType/CFF needs 'CFF ' (or 'CFF2'). Neither → nothing to render.
  const hasTrueType = has('glyf') && has('loca');
  const hasCff = has('CFF ') || has('CFF2');
  let format: FontFormat = base.format;
  if (base.format !== 'collection') format = hasCff && !hasTrueType ? 'opentype-cff' : hasTrueType ? 'truetype' : base.format;
  if (!hasTrueType && !hasCff) {
    errors.push('The font has no glyph outlines (missing glyf/loca or CFF table) — it cannot be embedded.');
  }
  if (missingTables.length > 0) {
    errors.push(`The font is missing required tables: ${missingTables.join(', ')}.`);
  }
  if (!has('OS/2')) {
    warnings.push('No OS/2 table — embedding permissions are undeclared; treating the font as freely embeddable.');
  }

  const { embeddability, embeddable, canSubset } = classifyEmbeddability(font['OS/2']?.fsType);
  if (!embeddable) {
    errors.push("This font's licence forbids embedding (OS/2 fsType is Restricted-License). It can't be used in a print export.");
  } else if (!canSubset) {
    warnings.push('This font disallows subsetting; the full font will be embedded, increasing file size.');
  }
  if (font['OS/2']?.fsType?.bitmapOnly) {
    warnings.push('This font permits bitmap embedding only; vector embedding may be rejected by some tools.');
  }

  // Metadata getters read lazily-parsed tables (name/maxp/head); on a malformed font they can throw, so
  // read each defensively — a missing value is already reflected by errors/missingTables above.
  const safe = <T>(read: () => T): T | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  const numGlyphs = safe(() => (typeof font.numGlyphs === 'number' ? font.numGlyphs : undefined));
  if (numGlyphs !== undefined && numGlyphs <= 0) {
    errors.push('The font reports zero glyphs — it is empty or corrupt.');
  }

  return {
    ok: errors.length === 0,
    format,
    familyName: safe(() => font.familyName),
    subfamilyName: safe(() => font.subfamilyName),
    postscriptName: safe(() => font.postscriptName),
    numGlyphs,
    unitsPerEm: safe(() => (typeof font.unitsPerEm === 'number' ? font.unitsPerEm : undefined)),
    embeddable,
    canSubset,
    embeddability,
    missingTables: [...missingTables],
    errors,
    warnings,
  };
}

/**
 * The distinct non-whitespace characters in `text` that this font has NO glyph for. An empty array means
 * full coverage. Single source of truth for glyph coverage: the exporter uses it to keep a font that can't
 * render the text out of the vector layer (so that frame rasters, where browser font-fallback draws the
 * missing glyphs), and preflight uses it to disclose *which* characters will rasterize instead of embedding
 * as selectable vector. De-duplicated and order-stable (first appearance wins).
 *
 * Fails OPEN: if the bytes can't be parsed here, returns [] (assume covered — the exporter decides), so a
 * quirk in this check can never wrongly demote a valid font to raster.
 */
export function findUncoveredCharacters(bytes: Uint8Array, text: string): string[] {
  let font: { hasGlyphForCodePoint?: (cp: number) => boolean };
  try {
    font = fontkit.create(bytes as Buffer) as unknown as { hasGlyphForCodePoint?: (cp: number) => boolean };
  } catch {
    return [];
  }
  if (typeof font.hasGlyphForCodePoint !== 'function') return [];
  const missing: string[] = [];
  const seen = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Skip whitespace — a font legitimately need not carry a glyph for space/tab/newline/CR.
    if (cp === undefined || cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
    if (seen.has(cp)) continue;
    seen.add(cp);
    try {
      if (!font.hasGlyphForCodePoint(cp)) missing.push(ch);
    } catch {
      // A single failed lookup shouldn't fail the whole check — treat it as covered.
    }
  }
  return missing;
}
