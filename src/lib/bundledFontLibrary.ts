import type { PaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import { createBinaryAssetRecord } from '../shared/assets/contentAddressedAsset';
import type { PaperManagedFontFace, PaperManagedFontStyle } from '../types/paper';
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
        axes: parseAxes(face.axes),
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
): Pick<FontFaceDescriptors, 'style' | 'weight'> {
  const weightAxis = face.axes.wght;
  return {
    style: face.style,
    weight: weightAxis
      ? `${Math.round(weightAxis.min)} ${Math.round(weightAxis.max)}`
      : String(face.weight),
  };
}

const browserFontPromises = new Map<string, Promise<FontFace>>();

/** Registers a bundled face for live Image/Video/Paper preview without copying it into a project. */
export function ensureBundledFontFaceRegistered(
  family: BundledFontFamily,
  face: BundledFontFace,
): Promise<FontFace> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Live font preview is unavailable in this environment.'));
  }
  if (!family.faces.some((candidate) => candidate.id === face.id)) {
    return Promise.reject(new Error('The selected face does not belong to the bundled family.'));
  }
  const existing = browserFontPromises.get(face.id);
  if (existing) return existing;
  const pending = new FontFace(
    family.family,
    `url("${bundledFontResourceUrl(face.file)}")`,
    bundledFontFaceCssDescriptor(face),
  ).load().then((loaded) => {
    document.fonts.add(loaded);
    return loaded;
  }).catch((error) => {
    browserFontPromises.delete(face.id);
    throw error;
  });
  browserFontPromises.set(face.id, pending);
  return pending;
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
