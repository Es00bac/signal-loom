import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import type {
  PaperDocument,
  PaperFontEmbeddability,
  PaperManagedFontFace,
  PaperManagedFontStyle,
} from '../types/paper';

export interface PaperFontEmbeddingFlags {
  noEmbedding?: boolean;
  viewOnly?: boolean;
  editable?: boolean;
  noSubsetting?: boolean;
  bitmapOnly?: boolean;
}

export type PaperFontRightsReason =
  | 'restricted'
  | 'bitmap-only'
  | 'rights-unknown'
  | 'attestation-required'
  | 'attestation-mismatch';

export interface PaperFontRights {
  embeddability: PaperFontEmbeddability;
  embeddable: boolean;
  canSubset: boolean;
  reason?: PaperFontRightsReason;
}

/** Maps OS/2 fsType flags to the stricter production-facing rights contract. */
export function classifyFontEmbeddingRights(flags: PaperFontEmbeddingFlags | undefined): PaperFontRights {
  if (!flags) {
    return {
      embeddability: 'unknown',
      // Import is allowed so the user can inspect/attest, but strict export checks attestation separately.
      embeddable: true,
      canSubset: true,
      reason: 'rights-unknown',
    };
  }
  if (flags.bitmapOnly) {
    return { embeddability: 'bitmap-only', embeddable: false, canSubset: false, reason: 'bitmap-only' };
  }
  if (flags.noEmbedding) {
    return { embeddability: 'restricted', embeddable: false, canSubset: false, reason: 'restricted' };
  }
  return {
    embeddability: flags.editable ? 'editable' : flags.viewOnly ? 'print-preview' : 'installable',
    embeddable: true,
    canSubset: !flags.noSubsetting,
  };
}

export function canUseManagedFontForProduction(face: PaperManagedFontFace):
  | { allowed: true }
  | { allowed: false; reason: PaperFontRightsReason } {
  if (face.embeddability === 'bitmap-only') return { allowed: false, reason: 'bitmap-only' };
  if (face.embeddability === 'restricted') return { allowed: false, reason: 'restricted' };
  if (face.embeddability !== 'unknown') return { allowed: true };

  if (!face.attestation) return { allowed: false, reason: 'attestation-required' };
  if (face.attestation.assetSha256 !== face.fontAsset.sha256) {
    return { allowed: false, reason: 'attestation-mismatch' };
  }
  if (!face.attestation.mayEmbedOutput) return { allowed: false, reason: 'attestation-required' };
  return { allowed: true };
}

export interface PaperManagedFontFaceRequest {
  familyId: string;
  weight: number;
  style: PaperManagedFontStyle;
  stretchPercent?: number;
}

export type PaperManagedFontFaceSelection =
  | { status: 'selected'; face: PaperManagedFontFace }
  | { status: 'missing-family'; familyId: string }
  | {
    status: 'missing-face';
    familyId: string;
    requestedWeight: number;
    requestedStyle: PaperManagedFontStyle;
    requestedStretchPercent: number;
  };

/**
 * Finds only an exact family/weight/style/stretch face. Production never synthesizes bold, italic, or a
 * nearby weight from a different file because those substitutions change metrics and glyph outlines.
 */
export function selectManagedFontFace(
  faces: readonly PaperManagedFontFace[],
  request: PaperManagedFontFaceRequest,
): PaperManagedFontFaceSelection {
  const familyId = normalizePaperFontFamilyId(request.familyId);
  const requestedWeight = normalizePaperFontWeight(request.weight);
  const requestedStyle = request.style;
  const requestedStretchPercent = normalizePaperFontStretch(request.stretchPercent);
  const familyFaces = faces.filter((face) => normalizePaperFontFamilyId(face.familyId) === familyId);
  if (familyFaces.length === 0) return { status: 'missing-family', familyId };

  const face = familyFaces.find((candidate) =>
    candidate.weight === requestedWeight
    && candidate.style === requestedStyle
    && candidate.stretchPercent === requestedStretchPercent,
  );
  if (!face) {
    return { status: 'missing-face', familyId, requestedWeight, requestedStyle, requestedStretchPercent };
  }
  return { status: 'selected', face };
}

/** Stable document-facing family identifier derived from a foundry family name. */
export function normalizePaperFontFamilyId(value: string): string {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  return normalized || 'unnamed-font';
}

export function normalizePaperFontWeight(value: number): number {
  if (!Number.isFinite(value)) return 400;
  return Math.min(1000, Math.max(1, Math.round(value)));
}

export function normalizePaperFontStretch(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 100;
  return Math.min(200, Math.max(50, Math.round(value * 100) / 100));
}

/** Returns every binary record needed to preserve the supplied managed faces and their license evidence. */
export function collectManagedFontDependencies(
  input: readonly PaperManagedFontFace[] | Pick<PaperDocument, 'importedFonts'>,
): BinaryAssetRef[] {
  const faces: readonly PaperManagedFontFace[] = Array.isArray(input)
    ? input as readonly PaperManagedFontFace[]
    : (input as Pick<PaperDocument, 'importedFonts'>).importedFonts ?? [];
  const dependencies = new Map<string, BinaryAssetRef>();
  for (const face of faces) {
    dependencies.set(face.fontAsset.id, face.fontAsset);
    if (face.license.textAsset) dependencies.set(face.license.textAsset.id, face.license.textAsset);
  }
  return [...dependencies.values()].sort((left, right) => left.id.localeCompare(right.id));
}
