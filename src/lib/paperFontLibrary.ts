// The imported-font library: how a document's user-imported fonts are stored, matched to a frame's
// typography, and resolved into a face to embed. Sits above the vetting gate (paperFontVetting) and the
// bundled-face fallback (paperFontResolution): when a frame's font-family matches an imported, embeddable
// face we embed the user's ACTUAL font; otherwise we fall back to the metric-compatible Liberation
// substitute (disclosed in preflight). Framework-free + unit-testable; imported bytes are addressed through
// a managed content-addressed record and never live in Paper JSON.

import type { PaperImportedFont } from '../types/paper';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import { resolveBundledFontFace, isBoldWeight } from './paperFontResolution';
import type { FontVetResult } from './paperFontVetting';

/** Normalize a CSS font-family (or stack) to its first family token, unquoted + lowercased, for matching. */
export function normalizeFamilyName(cssFamily: string): string {
  const first = (cssFamily || '').split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
}

/**
 * Pick the imported face that best matches a requested family + style. Only embeddable faces of the exact
 * family are eligible; among those, prefer an exact weight+style match, then weight, then any — so a user
 * who imported only Regular still gets their font (not Liberation) for a bold run.
 */
export function selectImportedFace(
  family: string,
  bold: boolean,
  italic: boolean,
  fonts: readonly PaperImportedFont[],
): PaperImportedFont | undefined {
  if (!family) return undefined;
  const candidates = fonts.filter((f) => f.embeddable && normalizeFamilyName(f.familyName) === family);
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestScore = -1;
  for (const f of candidates) {
    const score = (f.bold === bold ? 2 : 0) + (f.italic === italic ? 1 : 0);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

/** A face resolved for the vector-text exporter — either the user's imported font, or a bundled Liberation. */
export interface ResolvedTextFace {
  /** Embed cache key (unique per distinct face). */
  id: string;
  /** Managed binary record — present for imported fonts (load bytes through the asset repository). */
  assetRef?: BinaryAssetRef;
  /** public/-relative .ttf URL — present for bundled Liberation faces (adapter fetches it). */
  url?: string;
  /** Family that was actually used. */
  familyName: string;
  /** True when the user's actual font is embedded; false when a Liberation substitute stands in. */
  embeddedReal: boolean;
  /** True when the imported font disallows subsetting (embed the whole font). */
  noSubsetting?: boolean;
}

interface TypographyLike {
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
}

/**
 * Resolve a frame's typography to the face to embed: the user's imported font when one matches (and is
 * embeddable), otherwise the bundled Liberation substitute — behaviour-identical to the old path when the
 * document has no imported fonts.
 */
export function resolveTextFace(
  typography: TypographyLike,
  importedFonts: readonly PaperImportedFont[] | undefined,
): ResolvedTextFace {
  const family = normalizeFamilyName(typography.fontFamily ?? '');
  const bold = isBoldWeight(typography.fontWeight);
  const italic = (typography.fontStyle ?? '').toLowerCase() === 'italic';
  const imported = family ? selectImportedFace(family, bold, italic, importedFonts ?? []) : undefined;
  if (imported) {
    return {
      id: `imported-${imported.id}`,
      assetRef: imported.assetRef,
      familyName: imported.familyName,
      embeddedReal: true,
      noSubsetting: !imported.canSubset,
    };
  }
  const face = resolveBundledFontFace(typography);
  return { id: face.id, url: face.url, familyName: face.id, embeddedReal: false };
}

/**
 * Build a persisted imported-font record from a vetting result + managed binary reference. Returns null
 * when the font failed vetting or can't be embedded (the caller should reject it), so a bad font never
 * enters the library.
 */
export function buildImportedFont(vet: FontVetResult, assetRef: BinaryAssetRef, id: string): PaperImportedFont | null {
  if (!vet.ok || !vet.embeddable) return null;
  if (vet.format !== 'truetype' && vet.format !== 'opentype-cff' && vet.format !== 'collection') return null;
  const bold = /bold|black|heavy|semibold|demibold/i.test(vet.subfamilyName ?? '');
  const italic = /italic|oblique/i.test(vet.subfamilyName ?? '');
  return {
    id,
    familyName: vet.familyName ?? id,
    subfamilyName: vet.subfamilyName,
    postscriptName: vet.postscriptName,
    bold,
    italic,
    format: vet.format,
    embeddable: vet.embeddable,
    canSubset: vet.canSubset,
    assetRef,
  };
}
