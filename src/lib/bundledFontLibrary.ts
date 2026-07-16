import type { PaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import { createBinaryAssetRecord } from '../shared/assets/contentAddressedAsset';
import type { PaperManagedFontFace, PaperManagedFontStyle } from '../types/paper';
import type { ManagedBundledFontFaceReference } from '../types/managedFont';
import { buildImportedFont } from './paperFontLibrary';
import { normalizePaperFontFamilyId } from './paperManagedFonts';
import { vetFontBytes } from './paperFontVetting';

export type BundledFontCollection = 'base' | 'optional-chinese' | 'optional-korean';
export type BundledFontRole = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting' | 'japanese' | 'cjk';

export interface BundledFontAxis {
  min: number;
  default: number;
  max: number;
}

export interface BundledFontFace {
  id: string;
  file: string;
  collectionIndex: number;
  sha256: string;
  byteLength: number;
  family: string;
  subfamily: string;
  fullName: string;
  postscriptName: string;
  version: string;
  weight: number;
  style: PaperManagedFontStyle;
  stretchPercent: number;
  /** Runtime/catalog proof that stretchPercent came from the face, rather than the legacy 100% fallback. */
  stretchVerified?: boolean;
  glyphCount: number;
  variable: boolean;
  axes: Record<string, BundledFontAxis>;
  canSubset: boolean;
  hasVerticalSubstitution: boolean;
}

export interface BundledFontFamily {
  id: string;
  family: string;
  slug: string;
  collection: BundledFontCollection;
  role: BundledFontRole;
  sourceUrl: string;
  sourceVersion: string;
  licenseId: string;
  licenseFile: string;
  licenseSha256: string;
  licenseByteLength: number;
  faces: BundledFontFace[];
  warnings: string[];
}

export interface BundledFontCatalog {
  schemaVersion: number;
  familyCount: number;
  faceCount: number;
  families: BundledFontFamily[];
}

interface JsonRecord { [key: string]: unknown }

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function safeResourcePath(value: unknown, label: string): string {
  const path = text(value, label).replace(/\\/g, '/');
  if (path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} contains an unsafe path.`);
  }
  return path;
}

function collection(value: unknown): BundledFontCollection {
  if (value === 'base' || value === 'optional-chinese' || value === 'optional-korean') return value;
  throw new Error('Bundled font collection is invalid.');
}

function styleFor(face: JsonRecord): PaperManagedFontStyle {
  const value = [face.subfamily, face.fullName, face.postscriptName].filter((entry) => typeof entry === 'string').join(' ');
  if (/\boblique\b/i.test(value)) return 'oblique';
  return /\bitalic\b/i.test(value) ? 'italic' : 'normal';
}

function stretchFor(face: JsonRecord, axes: Record<string, BundledFontAxis>): { percent: number; verified: boolean } {
  const explicit = face.stretchPercent;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return { percent: Math.max(50, Math.min(200, explicit)), verified: true };
  }
  const widthAxis = axes.wdth;
  return widthAxis
    ? { percent: Math.max(50, Math.min(200, widthAxis.default)), verified: true }
    : { percent: 100, verified: false };
}

const MONO_SLUGS = new Set(['sourcecodepro', 'ibmplexmono', 'notosansmono', 'liberationmono', 'jetbrainsmono', 'firacode', 'inconsolata', 'spacemono', 'robotomono', 'cousine', 'anonymouspro']);
const SERIF_HINT = /(serif|garamond|baskerville|spectral|lora|merriweather|alegreya|literata|newsreader|vollkorn|cardo|gentium|charis|andada|fraunces|bodoni|playfair|mincho|myeongjo)/i;
const DISPLAY_SLUGS = new Set(['bebasneue', 'anton', 'cinzel', 'abrilfatface', 'dmserifdisplay', 'unbounded', 'syne', 'alfaslabone', 'blackopsone', 'limelight', 'staatliches', 'lilitaone', 'bangers', 'luckiestguy', 'boogaloo', 'chewy']);
const HAND_SLUGS = new Set(['patrickhand', 'permanentmarker', 'kalam', 'shantellsans', 'caveat', 'dancingscript', 'pacifico', 'sacramento', 'greatvibes', 'architectsdaughter', 'indieflower', 'yomogi', 'yujisyuku']);
const JAPANESE_SLUGS = new Set(['notosansjp', 'notoserifjp', 'bizudpgothic', 'bizudpmincho', 'mplus1', 'mplus2', 'mplusrounded1c', 'ibmplexsansjp', 'zenkakugothicnew', 'zenoldmincho', 'zenmarugothic', 'shipporimincho', 'kosugimaru', 'kleeone', 'delagothicone', 'dotgothic16', 'reggaeone', 'rocknrollone', 'yomogi', 'yujisyuku']);

function roleFor(family: string, slug: string, group: BundledFontCollection): BundledFontRole {
  if (group !== 'base') return 'cjk';
  if (JAPANESE_SLUGS.has(slug)) return 'japanese';
  if (MONO_SLUGS.has(slug)) return 'mono';
  if (HAND_SLUGS.has(slug)) return 'handwriting';
  if (DISPLAY_SLUGS.has(slug)) return 'display';
  return SERIF_HINT.test(family) ? 'serif' : 'sans';
}

function parseAxes(value: unknown): Record<string, BundledFontAxis> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.map((raw) => {
    const axis = record(raw, 'Bundled font axis');
    const tag = text(axis.tag, 'Bundled font axis tag');
    if (!/^[ -~]{4}$/.test(tag)) throw new Error('Bundled font axis tag is invalid.');
    return [tag, {
      min: number(axis.minimum, `${tag} minimum`),
      default: number(axis.default, `${tag} default`),
      max: number(axis.maximum, `${tag} maximum`),
    }];
  }));
}

export function parseBundledFontInventory(input: unknown): BundledFontCatalog {
  const inventory = record(input, 'Bundled font inventory');
  if (number(inventory.criticalErrorCount, 'Bundled font critical error count') !== 0) {
    throw new Error('Bundled font inventory contains critical audit errors.');
  }
  if (!Array.isArray(inventory.families)) throw new Error('Bundled font inventory has no families.');
  const families = inventory.families.map((rawFamily): BundledFontFamily => {
    const family = record(rawFamily, 'Bundled font family');
    const group = collection(family.collection);
    const familyName = text(family.family, 'Bundled font family name');
    const slug = text(family.slug, 'Bundled font family slug');
    const source = record(family.source, `${familyName} source`);
    if (!Array.isArray(family.licenses) || family.licenses.length === 0) throw new Error(`${familyName} has no license.`);
    const license = record(family.licenses[0], `${familyName} license`);
    if (!Array.isArray(family.faces) || family.faces.length === 0) throw new Error(`${familyName} has no faces.`);
    const faces = family.faces.map((rawFace): BundledFontFace => {
      const face = record(rawFace, `${familyName} face`);
      const file = safeResourcePath(face.file, `${familyName} font path`);
      const postscriptName = text(face.postscriptName, `${familyName} PostScript name`);
      const sha256 = text(face.sha256, `${postscriptName} SHA-256`).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${postscriptName} SHA-256 is invalid.`);
      const axes = parseAxes(face.axes);
      const stretch = stretchFor(face, axes);
      return {
        id: `${slug}:${postscriptName}:${sha256.slice(0, 12)}`,
        file,
        collectionIndex: Math.max(0, Math.round(number(face.collectionIndex, `${postscriptName} collection index`))),
        sha256,
        byteLength: Math.max(1, Math.round(number(face.byteLength, `${postscriptName} byte length`))),
        family: text(face.family, `${postscriptName} family`),
        subfamily: text(face.subfamily, `${postscriptName} subfamily`),
        fullName: text(face.fullName, `${postscriptName} full name`),
        postscriptName,
        version: text(face.version, `${postscriptName} version`),
        weight: Math.max(1, Math.min(1000, Math.round(number(face.weight, `${postscriptName} weight`)))),
        style: styleFor(face),
        glyphCount: Math.max(0, Math.round(number(face.glyphCount, `${postscriptName} glyph count`))),
        variable: face.variable === true,
        axes,
        stretchPercent: stretch.percent,
        stretchVerified: stretch.verified,
        canSubset: face.noSubsetting !== true,
        hasVerticalSubstitution: face.hasVerticalSubstitution === true,
      };
    }).sort((left, right) => left.weight - right.weight || left.style.localeCompare(right.style));
    const sourceVersion = typeof source.commit === 'string' && source.commit.trim()
      ? source.commit.trim()
      : faces[0].version;
    return {
      id: `${group}:${slug}`,
      family: familyName,
      slug,
      collection: group,
      role: roleFor(familyName, slug, group),
      sourceUrl: text(source.url, `${familyName} source URL`),
      sourceVersion,
      licenseId: text(license.spdx, `${familyName} license id`),
      licenseFile: safeResourcePath(license.file, `${familyName} license path`),
      licenseSha256: text(license.sha256, `${familyName} license SHA-256`).toLowerCase(),
      licenseByteLength: Math.max(1, Math.round(number(license.byteLength, `${familyName} license byte length`))),
      faces,
      warnings: Array.isArray(family.warnings) ? family.warnings.filter((entry): entry is string => typeof entry === 'string') : [],
    };
  }).sort((left, right) => left.family.localeCompare(right.family));
  const faceCount = families.reduce((total, family) => total + family.faces.length, 0);
  const expectedFamilies = number(inventory.catalogFamilyCount, 'Bundled font family count');
  const expectedFaces = number(inventory.faceCount, 'Bundled font face count');
  if (families.length !== expectedFamilies || faceCount !== expectedFaces) {
    throw new Error('Bundled font inventory counts do not match its contents.');
  }
  return {
    schemaVersion: number(inventory.schemaVersion, 'Bundled font schema version'),
    familyCount: families.length,
    faceCount,
    families,
  };
}

export function bundledFontResourceUrl(path: string): string {
  const safe = safeResourcePath(path, 'Bundled font resource');
  return `signal-loom-font://library/${safe.split('/').map(encodeURIComponent).join('/')}`;
}

export function bundledFontFaceCssDescriptor(
  face: BundledFontFace,
): Pick<FontFaceDescriptors, 'style' | 'weight' | 'stretch'> {
  const weightAxis = face.axes.wght;
  return {
    style: face.style,
    stretch: `${face.stretchPercent}%`,
    weight: weightAxis
      ? `${Math.round(weightAxis.min)} ${Math.round(weightAxis.max)}`
      : String(face.weight),
  };
}

const browserFontPromises = new Map<string, Promise<FontFace>>();
const browserFontErrors = new Map<string, string>();
const registeredFaceStretch = new Map<string, number>();

export function bundledFontFaceRuntimeFamilyName(
  reference: Pick<ManagedBundledFontFaceReference, 'faceId'>,
): string {
  return `Sloom Managed Face ${reference.faceId}`;
}

export function createBundledFontFaceReference(
  family: BundledFontFamily,
  face: BundledFontFace,
): ManagedBundledFontFaceReference {
  if (!family.faces.some((candidate) => candidate.id === face.id)) {
    throw new Error('The selected face does not belong to the bundled family.');
  }
  if (face.stretchVerified !== true) {
    throw new Error(`${face.fullName} must be registered from its audited bytes before its exact managed identity can be authored.`);
  }
  return {
    kind: 'bundled',
    faceId: face.id,
    family: family.family,
    weight: face.weight,
    style: face.style,
    stretchPercent: face.stretchPercent,
  };
}

export function normalizeBundledFontFaceReference(value: unknown): ManagedBundledFontFaceReference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'bundled'
    || typeof candidate.faceId !== 'string'
    || !candidate.faceId.trim()
    || typeof candidate.family !== 'string'
    || !candidate.family.trim()
    || typeof candidate.weight !== 'number'
    || !Number.isFinite(candidate.weight)
    || (candidate.style !== 'normal' && candidate.style !== 'italic' && candidate.style !== 'oblique')
    || typeof candidate.stretchPercent !== 'number'
    || !Number.isFinite(candidate.stretchPercent)
  ) return undefined;
  return {
    kind: 'bundled',
    faceId: candidate.faceId.trim(),
    family: candidate.family.trim(),
    weight: Math.max(1, Math.min(1000, Math.round(candidate.weight))),
    style: candidate.style,
    stretchPercent: Math.max(50, Math.min(200, candidate.stretchPercent)),
  };
}

export function bundledFontFaceReferenceMatchesTypography(
  reference: ManagedBundledFontFaceReference,
  typography: { family: string; weight: number | string | undefined; style: string | undefined },
): boolean {
  const weight = typeof typography.weight === 'number'
    ? typography.weight
    : Number.parseInt(typography.weight ?? '', 10);
  return typography.family.trim() === reference.family
    && Number.isFinite(weight)
    && Math.round(weight) === reference.weight
    && typography.style === reference.style;
}

export function resolveBundledFontFaceReference(
  reference: ManagedBundledFontFaceReference,
  catalog: BundledFontCatalog,
): { family: BundledFontFamily; face: BundledFontFace } {
  const family = catalog.families.find((candidate) => candidate.faces.some((face) => face.id === reference.faceId));
  const face = family?.faces.find((candidate) => candidate.id === reference.faceId);
  if (!family || !face) {
    throw new Error(`${reference.family} face ${reference.faceId} is unavailable or unauthorized. Reinstall or enable the audited bundled font library, then reopen the project.`);
  }
  if (
    family.family !== reference.family
    || face.weight !== reference.weight
    || face.style !== reference.style
  ) {
    throw new Error(`${reference.family} face ${reference.faceId} no longer matches its saved family/weight/style/stretch identity. Reinstall the matching bundled font library before rendering.`);
  }
  return { family, face };
}

export interface EnsureBundledFontFacesOptions {
  catalog?: BundledFontCatalog;
  fetchImpl?: typeof fetch;
}

export interface BundledFontRegistrationReport {
  ready: true;
  registeredFaceIds: string[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function loadVerifiedBundledFontBytes(face: BundledFontFace, fetchImpl: typeof fetch): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await fetchResourceBytes(face.file, fetchImpl, face.fullName);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'byte transport failed';
    throw new Error(`${face.family} (${face.fullName}) is unavailable or unauthorized. Reinstall or enable the audited bundled font library, then retry. ${detail}`);
  }
  const hash = await sha256Hex(bytes);
  if (bytes.byteLength !== face.byteLength || hash !== face.sha256) {
    throw new Error(`${face.fullName} failed bundled-font integrity verification. Reinstall the audited font library before rendering.`);
  }
  return bytes;
}

async function registerResolvedBundledFontFace(
  family: BundledFontFamily,
  face: BundledFontFace,
  fetchImpl: typeof fetch,
  reference?: ManagedBundledFontFaceReference,
): Promise<FontFace> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    throw new Error('Live bundled-font registration is unavailable in this renderer.');
  }
  const existing = browserFontPromises.get(face.id);
  if (existing) {
    return existing.then((loaded) => {
      const exactStretch = registeredFaceStretch.get(face.id);
      if (exactStretch !== undefined) {
        face.stretchPercent = exactStretch;
        face.stretchVerified = true;
      }
      if (reference && exactStretch !== reference.stretchPercent) {
        throw new Error(`${reference.family} face ${reference.faceId} no longer matches its saved stretch identity (${reference.stretchPercent}%). Reinstall the matching bundled font library before rendering.`);
      }
      return loaded;
    });
  }
  const catalogStretchPercent = face.stretchPercent;
  const catalogStretchVerified = face.stretchVerified === true;
  const pending = loadVerifiedBundledFontBytes(face, fetchImpl).then(async (bytes) => {
    const vet = vetFontBytes(bytes);
    const vettedFace = vet.faces.find((candidate) => candidate.collectionIndex === face.collectionIndex);
    if (!vet.ok || !vettedFace?.ok) {
      throw new Error(`${face.fullName} failed bundled-font face validation. Reinstall the audited font library before rendering.`);
    }
    face.stretchPercent = vettedFace.stretchPercent;
    face.stretchVerified = true;
    registeredFaceStretch.set(face.id, vettedFace.stretchPercent);
    if (reference && vettedFace.stretchPercent !== reference.stretchPercent) {
      throw new Error(`${reference.family} face ${reference.faceId} no longer matches its saved stretch identity (${reference.stretchPercent}%). Reinstall the matching bundled font library before rendering.`);
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const descriptor = bundledFontFaceCssDescriptor(face);
    const [managed, familyPreview] = await Promise.all([
      new FontFace(bundledFontFaceRuntimeFamilyName({ faceId: face.id }), buffer, descriptor).load(),
      new FontFace(family.family, buffer, descriptor).load(),
    ]);
    document.fonts.add(managed);
    document.fonts.add(familyPreview);
    browserFontErrors.delete(face.id);
    return managed;
  }).catch((error) => {
    browserFontPromises.delete(face.id);
    registeredFaceStretch.delete(face.id);
    face.stretchPercent = catalogStretchPercent;
    face.stretchVerified = catalogStretchVerified;
    browserFontErrors.set(face.id, error instanceof Error ? error.message : 'Bundled face registration failed.');
    throw error;
  });
  browserFontPromises.set(face.id, pending);
  return pending;
}

export async function ensureBundledFontFaceReferencesRegistered(
  references: readonly ManagedBundledFontFaceReference[],
  options: EnsureBundledFontFacesOptions = {},
): Promise<BundledFontRegistrationReport> {
  const normalized = references.flatMap((reference) => normalizeBundledFontFaceReference(reference) ?? []);
  const unique = [...new Map(normalized.map((reference) => [reference.faceId, reference])).values()];
  if (unique.length === 0) return { ready: true, registeredFaceIds: [] };
  const fetchImpl = options.fetchImpl ?? fetch;
  let catalog: BundledFontCatalog;
  try {
    catalog = options.catalog ?? await loadBundledFontCatalog(fetchImpl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'catalog lookup failed';
    throw new Error(`Referenced bundled font faces are unavailable or unauthorized. Reinstall or enable the audited bundled font library, then retry. ${detail}`);
  }
  const resolved = unique.map((reference) => ({ reference, ...resolveBundledFontFaceReference(reference, catalog) }));
  await Promise.all(resolved.map(({ family, face, reference }) => registerResolvedBundledFontFace(family, face, fetchImpl, reference)));
  return { ready: true, registeredFaceIds: unique.map((reference) => reference.faceId) };
}

export function getBundledFontFaceRegistrationError(reference: ManagedBundledFontFaceReference): string | undefined {
  return browserFontErrors.get(reference.faceId);
}

/** Registers a bundled face for live Image/Video/Paper preview without copying it into a project. */
export function ensureBundledFontFaceRegistered(
  family: BundledFontFamily,
  face: BundledFontFace,
): Promise<FontFace> {
  if (!family.faces.some((candidate) => candidate.id === face.id)) {
    return Promise.reject(new Error('The selected face does not belong to the bundled family.'));
  }
  return registerResolvedBundledFontFace(family, face, fetch);
}

let catalogPromise: Promise<BundledFontCatalog> | undefined;

export function loadBundledFontCatalog(fetchImpl: typeof fetch = fetch): Promise<BundledFontCatalog> {
  catalogPromise ??= fetchImpl(bundledFontResourceUrl('inventory/font-inventory.json'), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Bundled font library is unavailable (${response.status}).`);
    return parseBundledFontInventory(await response.json());
  }).catch((error) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

export function selectBundledFontFace(
  family: BundledFontFamily,
  requestedWeight: number,
  requestedStyle: PaperManagedFontStyle,
): BundledFontFace {
  const weight = Number.isFinite(requestedWeight) ? requestedWeight : 400;
  return [...family.faces].sort((left, right) => {
    const leftStyle = left.style === requestedStyle ? 0 : 10_000;
    const rightStyle = right.style === requestedStyle ? 0 : 10_000;
    return leftStyle - rightStyle
      || Math.abs(left.weight - weight) - Math.abs(right.weight - weight)
      || Number(left.variable) - Number(right.variable)
      || left.postscriptName.localeCompare(right.postscriptName);
  })[0];
}

async function fetchResourceBytes(path: string, fetchImpl: typeof fetch, label: string): Promise<Uint8Array> {
  const response = await fetchImpl(bundledFontResourceUrl(path), { method: 'GET', credentials: 'omit' });
  if (!response.ok) throw new Error(`${label} is unavailable (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error(`${label} is empty.`);
  return bytes;
}

export interface InstallBundledPaperFontFaceInput {
  family: BundledFontFamily;
  face: BundledFontFace;
  repository: PaperAssetRepository;
  fetchImpl?: typeof fetch;
}

export async function installBundledPaperFontFace(input: InstallBundledPaperFontFaceInput): Promise<PaperManagedFontFace> {
  if (!input.family.faces.some((candidate) => candidate.id === input.face.id)) {
    throw new Error('The selected face does not belong to the bundled family.');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const [fontBytes, licenseBytes] = await Promise.all([
    fetchResourceBytes(input.face.file, fetchImpl, input.face.fullName),
    fetchResourceBytes(input.family.licenseFile, fetchImpl, `${input.family.family} license`),
  ]);
  const [fontRecord, licenseRecord] = await Promise.all([
    createBinaryAssetRecord(fontBytes, {
      mimeType: input.face.file.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf',
      fileName: input.face.file.split('/').at(-1),
    }),
    createBinaryAssetRecord(licenseBytes, {
      mimeType: 'text/plain',
      fileName: input.family.licenseFile.split('/').at(-1),
    }),
  ]);
  if (fontRecord.ref.sha256 !== input.face.sha256 || fontRecord.ref.byteLength !== input.face.byteLength) {
    throw new Error(`${input.face.fullName} does not match the audited bundled font hash.`);
  }
  if (licenseRecord.ref.sha256 !== input.family.licenseSha256 || licenseRecord.ref.byteLength !== input.family.licenseByteLength) {
    throw new Error(`${input.family.family} license does not match the audited bundled license hash.`);
  }
  const vet = vetFontBytes(fontBytes);
  if (!vet.ok) throw new Error(vet.errors[0] ?? `${input.face.fullName} failed production font vetting.`);
  const [fontAsset, licenseAsset] = await Promise.all([
    input.repository.put(fontRecord),
    input.repository.put(licenseRecord),
  ]);
  const built = buildImportedFont(vet, fontAsset, `bundled-${input.face.id}`, {
    collectionIndex: input.face.collectionIndex,
    source: {
      kind: 'bundled',
      url: bundledFontResourceUrl(input.face.file),
      version: input.family.sourceVersion,
    },
    license: {
      id: input.family.licenseId,
      textAsset: licenseAsset,
      attribution: input.family.sourceUrl,
    },
  });
  if (!built) throw new Error(`${input.face.fullName} cannot be embedded in production output.`);
  return {
    ...built,
    familyId: normalizePaperFontFamilyId(input.family.family),
    familyName: input.family.family,
    postscriptName: input.face.postscriptName,
    weight: input.face.weight,
    style: input.face.style,
    variableAxes: input.face.axes,
    canSubset: input.face.canSubset,
  };
}
