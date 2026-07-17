import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import type { PaperDocument, PaperFrame, PaperManagedFontFace, PaperManagedFontStyle, PaperTextRun, PaperTypography } from '../types/paper';
import { normalizeFamilyName } from './paperFontLibrary';
import { canonicalPaperFontObliqueAngle, canUseManagedFontForProduction, normalizePaperFontFamilyId, normalizePaperFontStretch, normalizePaperFontVariationSettings, selectManagedFontFace } from './paperManagedFonts';

/** Failure here is deliberately terminal for browser/raster/print output: fallback paint lies. */
export class PaperExactManagedFontError extends Error {}

export function paperFontStyleFromCss(value: string | undefined): PaperManagedFontStyle {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^oblique(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)deg)?$/.test(normalized)
    ? 'oblique' : normalized === 'italic' ? 'italic' : 'normal';
}

export function paperFontObliqueAngleFromCss(value: string | undefined): number | undefined {
  const match = value?.trim().toLowerCase().match(/^oblique(?:\s+(-?(?:\d+(?:\.\d+)?|\.\d+))deg)?$/);
  return match ? canonicalPaperFontObliqueAngle('oblique', match[1] === undefined ? 14 : Number(match[1])) : undefined;
}

export function paperFontStyleDescriptor(style: PaperManagedFontStyle, angle?: number): string {
  return style === 'oblique' ? `oblique ${canonicalPaperFontObliqueAngle(style, angle)}deg` : style;
}

export function paperFontWeightFromCss(value: string | undefined, inherited = 400): number {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'bolder') return inherited < 400 ? 400 : inherited < 700 ? 700 : 900;
  if (normalized === 'lighter') return inherited <= 400 ? 100 : inherited <= 700 ? 400 : 700;
  if (normalized === 'bold') return 700;
  if (normalized === 'normal' || !normalized) return 400;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.min(1000, Math.max(1, Math.round(parsed))) : 400;
}

export function paperFontStretchFromCss(value: string | undefined): number {
  const keyword: Record<string, number> = { 'ultra-condensed': 50, 'extra-condensed': 62.5, condensed: 75, 'semi-condensed': 87.5, normal: 100, 'semi-expanded': 112.5, expanded: 125, 'extra-expanded': 150, 'ultra-expanded': 200 };
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized in keyword ? keyword[normalized] : normalizePaperFontStretch(/^(-?(?:\d+(?:\.\d+)?|\.\d+))%$/.test(normalized) ? Number(normalized.slice(0, -1)) : undefined);
}

export function effectivePaperFrameTypography(frame: PaperFrame, run?: PaperTextRun): PaperTypography {
  const inheritedWeight = paperFontWeightFromCss(frame.typography.fontWeight);
  return {
    ...frame.typography,
    ...(run?.fontFamily !== undefined ? { fontFamily: run.fontFamily } : {}),
    ...(run?.fontWeight !== undefined ? { fontWeight: String(paperFontWeightFromCss(run.fontWeight, inheritedWeight)) } : {}),
    ...(run?.fontStyle !== undefined ? { fontStyle: run.fontStyle } : {}),
    ...(run?.fontStretch !== undefined ? { fontStretch: run.fontStretch } : {}),
    ...(run?.fontVariationSettings !== undefined ? { fontVariationSettings: run.fontVariationSettings } : {}),
  };
}

export function paperFrameTextStyles(frame: PaperFrame): Array<{ text: string; typography: PaperTypography }> {
  if (!['text', 'caption', 'speechBubble', 'thoughtBubble'].includes(frame.kind)) return [];
  if (frame.richText?.length) return frame.richText.flatMap((paragraph) => paragraph.runs.map((run) => ({ text: run.text, typography: effectivePaperFrameTypography(frame, run) }))).filter(({ text }) => text.trim().length > 0);
  return frame.text?.trim() ? [{ text: frame.text, typography: frame.typography }] : [];
}

function requestedFace(typography: PaperTypography, fonts: readonly PaperManagedFontFace[]): PaperManagedFontFace | undefined {
  const rawFamily = typography.fontFamily ?? '';
  const whole = normalizePaperFontFamilyId(rawFamily);
  const fallback = normalizePaperFontFamilyId(normalizeFamilyName(rawFamily));
  const candidates = fonts.filter((face) => normalizePaperFontFamilyId(face.familyName) === whole || normalizePaperFontFamilyId(face.familyName) === fallback);
  if (!candidates.length) return undefined;
  const familyIds = [...new Set(candidates.map((face) => normalizePaperFontFamilyId(face.familyId)))];
  if (familyIds.length !== 1) throw new PaperExactManagedFontError(`Managed family "${rawFamily}" has ambiguous document identities.`);
  const style = paperFontStyleFromCss(typography.fontStyle);
  const selection = selectManagedFontFace(candidates, {
    familyId: familyIds[0], weight: paperFontWeightFromCss(typography.fontWeight), style,
    obliqueAngleDeg: paperFontObliqueAngleFromCss(typography.fontStyle), stretchPercent: paperFontStretchFromCss(typography.fontStretch),
    variationSettings: typography.fontVariationSettings,
  });
  if (selection.status === 'ambiguous-face') throw new PaperExactManagedFontError(`Managed family "${rawFamily}" has conflicting byte identities for the requested descriptor (${selection.faceIds.join(', ')}).`);
  if (selection.status !== 'selected') throw new PaperExactManagedFontError(`Managed family "${rawFamily}" has no exact requested face; fallback paint is blocked.`);
  if (!canUseManagedFontForProduction(selection.face).allowed) throw new PaperExactManagedFontError(`Managed face "${rawFamily}" is not authorized for production output.`);
  return selection.face;
}

export function collectExactPaperManagedFaces(frames: readonly PaperFrame[], fonts: readonly PaperManagedFontFace[] | undefined): PaperManagedFontFace[] {
  const all = fonts ?? [];
  const output = new Map<string, PaperManagedFontFace>();
  for (const frame of frames) for (const style of paperFrameTextStyles(frame)) {
    const face = requestedFace(style.typography, all);
    if (face) output.set(face.id, face);
  }
  return [...output.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** Reject a descriptor that would make browser/CSS member selection depend on insertion order. */
export function assertNoConflictingPaperManagedFontDescriptors(fonts: readonly PaperManagedFontFace[] | undefined): void {
  const owners = new Map<string, PaperManagedFontFace>();
  for (const face of fonts ?? []) {
    const variationSettings = normalizePaperFontVariationSettings(face.variationSettings, face.variableAxes);
    const key = `${normalizePaperFontFamilyId(face.familyId)}:${face.weight}:${paperFontStyleDescriptor(face.style, face.obliqueAngleDeg)}:${face.stretchPercent}:${JSON.stringify(variationSettings ?? {})}`;
    const existing = owners.get(key);
    if (existing && (existing.id !== face.id || existing.fontAsset.sha256 !== face.fontAsset.sha256 || existing.collectionIndex !== face.collectionIndex)) {
      throw new PaperExactManagedFontError(`Managed font descriptor collision for ${face.familyName}; exact registration is blocked.`);
    }
    owners.set(key, face);
  }
}

export function paperManagedFontFamilyAlias(face: PaperManagedFontFace): string {
  const safeId = face.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'face';
  return `sloom-managed-${safeId}-${face.fontAsset.sha256.slice(0, 16)}`;
}

function aliasFrame(frame: PaperFrame, fonts: readonly PaperManagedFontFace[]): PaperFrame {
  const alias = (typography: PaperTypography) => {
    const face = requestedFace(typography, fonts);
    return face ? { ...typography, fontFamily: paperManagedFontFamilyAlias(face) } : typography;
  };
  return {
    ...frame, typography: frame.richText?.length ? frame.typography : alias(frame.typography),
    ...(frame.richText ? { richText: frame.richText.map((paragraph) => ({ ...paragraph, runs: paragraph.runs.map((run) => {
      const effective = alias(effectivePaperFrameTypography(frame, run));
      return effective.fontFamily === (run.fontFamily ?? frame.typography.fontFamily) ? run : { ...run, fontFamily: effective.fontFamily };
    }) })) } : {}),
  };
}

export function aliasPaperDocumentManagedFontFamilies(document: PaperDocument): PaperDocument {
  const fonts = document.importedFonts ?? [];
  if (!fonts.length) return document;
  return { ...document, pages: document.pages.map((page) => ({ ...page, frames: page.frames.map((frame) => aliasFrame(frame, fonts)) })), parentPages: document.parentPages.map((page) => ({ ...page, frames: page.frames.map((frame) => aliasFrame(frame, fonts)) })) };
}

export interface PaperManagedFontManifestFace { identity: string; familyAlias: string; weight: number; style: PaperManagedFontStyle; obliqueAngleDeg?: number; stretchPercent: number; collectionIndex: number; variationSettings?: Record<string, number>; }
export interface PaperManagedFontManifest { version: 1; faces: PaperManagedFontManifestFace[]; }
const manifestPrefix = 'signal-loom-managed-font-manifest:';

function cssString(value: string): string { return `"${[...value].map((char) => `\\${char.codePointAt(0)!.toString(16)} `).join('')}"`; }
function base64(bytes: Uint8Array): string { let output = ''; for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(output); }

export async function buildExactPaperManagedFontCss(faces: readonly PaperManagedFontFace[], load: (ref: BinaryAssetRef) => Promise<Uint8Array>): Promise<string> {
  assertNoConflictingPaperManagedFontDescriptors(faces);
  const rules: string[] = [];
  for (const face of faces) {
    const bytes = await load(face.fontAsset);
    if (!bytes.byteLength) throw new PaperExactManagedFontError(`Managed face ${face.familyName} is unavailable.`);
    const source = `url(data:${face.fontAsset.mimeType};base64,${base64(bytes)})${face.format === 'collection' ? ' format("collection")' : ''}`;
    rules.push(`@font-face{font-family:${cssString(paperManagedFontFamilyAlias(face))};font-weight:${face.weight};font-style:${paperFontStyleDescriptor(face.style, face.obliqueAngleDeg)};font-stretch:${face.stretchPercent}%;src:${source};}`);
  }
  const manifest: PaperManagedFontManifest = { version: 1, faces: faces.map((face) => {
    const variationSettings = normalizePaperFontVariationSettings(face.variationSettings, face.variableAxes);
    return { identity: `${face.id}:${face.fontAsset.sha256}:${face.collectionIndex}:${JSON.stringify(variationSettings ?? {})}`, familyAlias: paperManagedFontFamilyAlias(face), weight: face.weight, style: face.style, ...(face.style === 'oblique' ? { obliqueAngleDeg: canonicalPaperFontObliqueAngle(face.style, face.obliqueAngleDeg) } : {}), stretchPercent: face.stretchPercent, collectionIndex: face.collectionIndex, ...(variationSettings ? { variationSettings } : {}) };
  }) };
  return `/* ${manifestPrefix}${btoa(JSON.stringify(manifest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')} */\n${rules.join('\n')}`;
}

export function readPaperManagedFontManifest(css: string | undefined): PaperManagedFontManifest | undefined {
  const encoded = css?.match(new RegExp(`/\\*\\s*${manifestPrefix}([A-Za-z0-9_-]+)\\s*\\*/`))?.[1];
  if (!encoded) return undefined;
  try { const parsed = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as PaperManagedFontManifest; return parsed.version === 1 && Array.isArray(parsed.faces) ? parsed : undefined; } catch { return undefined; }
}

export function paperManagedFontDescriptor(face: PaperManagedFontManifestFace): string { return `${paperFontStyleDescriptor(face.style, face.obliqueAngleDeg)} ${face.weight} ${face.stretchPercent}% 16px "${face.familyAlias}"`; }

/** Bounded requested-identity verification. A hostile unrelated FontFace return cannot satisfy this. */
export async function verifyExactPaperManagedFontReadiness(target: Document, css: string | undefined, timeoutMs = 2500): Promise<void> {
  if (!css?.includes('@font-face')) return;
  const manifest = readPaperManagedFontManifest(css);
  if (!manifest) throw new PaperExactManagedFontError('Managed font payload has no exact identity manifest.');
  const fonts = target.fonts;
  if (!fonts?.ready || typeof fonts.load !== 'function' || typeof fonts.check !== 'function') throw new PaperExactManagedFontError('Browser does not expose requested-face verification.');
  const bounded = <T,>(promise: Promise<T>, label: string) => new Promise<T>((resolve, reject) => { const timer = globalThis.setTimeout(() => reject(new PaperExactManagedFontError(`${label} timed out.`)), timeoutMs); promise.then((value) => { globalThis.clearTimeout(timer); resolve(value); }, reject); });
  await bounded(Promise.resolve(fonts.ready), 'Managed font readiness');
  for (const face of manifest.faces) {
    const descriptor = paperManagedFontDescriptor(face);
    const loaded = await bounded(Promise.resolve(fonts.load(descriptor, 'WMWMWMiiiii012345')), `Managed face ${face.identity}`);
    const exact = [...loaded].some((candidate) => candidate.family === face.familyAlias && candidate.status === 'loaded');
    if (!exact || !fonts.check(descriptor, 'WMWMWMiiiii012345')) throw new PaperExactManagedFontError(`Managed face did not load with its requested identity: ${face.identity}.`);
  }
}
