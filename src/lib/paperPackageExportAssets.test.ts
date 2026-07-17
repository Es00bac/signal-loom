import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { buildPaperPackageExport } from './paperPackageExport';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';
import {
  createBinaryAssetRecord,
  type BinaryAssetRef,
} from '../shared/assets/contentAddressedAsset';
import type {
  PaperDocument,
  PaperManagedFontFace,
  PaperManagedIccProfile,
} from '../types/paper';

/**
 * AUD-004 print-package gate: "Package for print" must contain the actual linked art, exact font
 * files, their license texts, and ICC profiles — with a deterministic digest manifest — and must
 * fail closed on fonts whose rights forbid packaging.
 */

const fogra39 = new Uint8Array(readFileSync('public/icc/FOGRA39L_coated.icc'));
const imageBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 21, 22, 23, 24, 25, 26]);
const fontBytesFixture = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 61, 62, 63, 64, 65]);
const licenseBytes = new TextEncoder().encode('SIL OPEN FONT LICENSE Version 1.1 — package fixture');

interface PackagedAssetManifestEntry {
  path: string;
  role: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
}

type PackageManifestWithAssets = Awaited<ReturnType<typeof buildPaperPackageExport>>['manifest'] & {
  packagedAssets?: PackagedAssetManifestEntry[];
};

async function seedRecord(bytes: Uint8Array, mimeType: string, fileName?: string): Promise<BinaryAssetRef> {
  const record = await createBinaryAssetRecord(bytes, { mimeType, ...(fileName ? { fileName } : {}) });
  return paperAssetRepository.put(record);
}

async function wipePaperAssetRepository(): Promise<void> {
  for (const ref of await paperAssetRepository.listRefs()) {
    await paperAssetRepository.delete(ref.id);
  }
}

function managedFace(fontAsset: BinaryAssetRef, overrides: Partial<PaperManagedFontFace> = {}): PaperManagedFontFace {
  return {
    id: `face-${fontAsset.sha256.slice(0, 8)}`,
    familyId: 'package test family',
    familyName: 'Package Test Family',
    postscriptName: 'PackageTestFamily-Regular',
    weight: 400,
    style: 'normal',
    stretchPercent: 100,
    collectionIndex: 0,
    variableAxes: {},
    unicodeRanges: [{ start: 0x41, end: 0x5a }],
    format: 'truetype',
    fontAsset,
    embeddability: 'installable',
    canSubset: true,
    source: { kind: 'user-import' },
    license: {},
    ...overrides,
  };
}

function managedIccProfile(asset: BinaryAssetRef): PaperManagedIccProfile {
  return {
    id: asset.id,
    asset,
    description: 'Coated FOGRA39 (ISO 12647-2:2004)',
    deviceClass: 'prtr',
    colorSpace: 'CMYK',
    pcs: 'Lab ',
    outputConditionId: 'FOGRA39',
    source: { kind: 'user-import' },
  };
}

async function buildManagedDocument(overrides: {
  fonts?: PaperManagedFontFace[];
} = {}): Promise<{
  document: PaperDocument;
  refs: { image: BinaryAssetRef; font: BinaryAssetRef; license: BinaryAssetRef; icc: BinaryAssetRef };
}> {
  const image = await seedRecord(imageBytes, 'image/png', 'cover.png');
  const font = await seedRecord(fontBytesFixture, 'font/ttf', 'package-test.ttf');
  const license = await seedRecord(licenseBytes, 'text/plain', 'OFL.txt');
  const icc = await seedRecord(fogra39, 'application/vnd.iccprofile', 'FOGRA39L_coated.icc');

  const base = createDefaultPaperDocument({ title: 'Print Package', preset: 'comic-book' });
  const withFrame = addFrameToPaperPage(base, base.pages[0].id, {
    kind: 'image',
    xMm: 10,
    yMm: 10,
    widthMm: 80,
    heightMm: 100,
    asset: {
      label: 'Cover Art',
      kind: 'image',
      mimeType: 'image/png',
      locator: { kind: 'managed', ref: image },
    },
  } as never).document;

  return {
    document: {
      ...withFrame,
      importedFonts: overrides.fonts ?? [managedFace(font, { license: { id: 'user-license', textAsset: license } })],
      managedIccProfiles: [managedIccProfile(icc)],
    },
    refs: { image, font, license, icc },
  };
}

afterEach(async () => {
  await wipePaperAssetRepository();
});

describe('paperPackageExport managed asset payloads (AUD-004)', () => {
  it('packages the actual linked art, exact fonts, license texts, and ICC profiles as usable files', async () => {
    const { document, refs } = await buildManagedDocument();

    const exported = await buildPaperPackageExport(document, []);
    const manifest = exported.manifest as PackageManifestWithAssets;
    const packaged = manifest.packagedAssets ?? [];
    expect(packaged.length).toBeGreaterThanOrEqual(4);
    expect(packaged.map((entry) => entry.path)).toEqual([...packaged.map((entry) => entry.path)].sort());

    const bySha = new Map(packaged.map((entry) => [entry.sha256, entry]));
    const entries = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));

    const expectations: Array<{ ref: BinaryAssetRef; bytes: Uint8Array; prefix: RegExp; role: string }> = [
      { ref: refs.image, bytes: imageBytes, prefix: /^Links\//, role: 'image' },
      { ref: refs.font, bytes: fontBytesFixture, prefix: /^Fonts\//, role: 'font' },
      { ref: refs.license, bytes: licenseBytes, prefix: /^Fonts\/Licenses\//, role: 'font-license' },
      { ref: refs.icc, bytes: fogra39, prefix: /^Profiles\//, role: 'icc-profile' },
    ];
    for (const expectation of expectations) {
      const entry = bySha.get(expectation.ref.sha256);
      expect(entry, `packagedAssets must list ${expectation.role}`).toBeDefined();
      expect(entry!.path).toMatch(expectation.prefix);
      expect(entry!.path).toContain(expectation.ref.sha256.slice(0, 12));
      expect(entry!.byteLength).toBe(expectation.ref.byteLength);
      expect(entry!.role).toBe(expectation.role);
      expect(entries[entry!.path], `ZIP must contain ${entry!.path}`).toBeDefined();
      expect(new Uint8Array(entries[entry!.path])).toEqual(expectation.bytes);
      expect(exported.entries).toContain(entry!.path);
    }

    // The pre-existing inventory surface stays intact.
    expect(Object.keys(entries)).toEqual(expect.arrayContaining([
      'document.sloom-paper.json',
      'preflight-report.json',
      'manifest.json',
    ]));
    expect(manifest.files.map((file) => file.path)).toEqual(expect.arrayContaining(packaged.map((entry) => entry.path)));
  });

  it('produces deterministic package entry names across identical builds', async () => {
    const { document } = await buildManagedDocument();

    const first = await buildPaperPackageExport(document, []);
    const second = await buildPaperPackageExport(document, []);
    expect(first.entries).toEqual(second.entries);
    const firstAssets = (first.manifest as PackageManifestWithAssets).packagedAssets ?? [];
    const secondAssets = (second.manifest as PackageManifestWithAssets).packagedAssets ?? [];
    expect(firstAssets).toEqual(secondAssets);
  });

  it('packages a data-URL linked Source Library image as a real file while keeping metadata clean', async () => {
    const item: SourceBinLibraryItem = {
      id: 'source-data-image',
      label: 'Linked Panel',
      kind: 'image',
      mimeType: 'image/png',
      assetUrl: `data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`,
      createdAt: 1,
    } as SourceBinLibraryItem;
    const base = createDefaultPaperDocument({ title: 'Linked Package' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image',
      xMm: 5,
      yMm: 5,
      widthMm: 50,
      heightMm: 50,
      asset: { sourceBinItemId: item.id, label: item.label, kind: 'image' },
    } as never);

    const exported = await buildPaperPackageExport(document, [item]);
    const manifest = exported.manifest as PackageManifestWithAssets;
    const packaged = (manifest.packagedAssets ?? []).filter((entry) => entry.path.startsWith('Links/'));
    expect(packaged).toHaveLength(1);

    const entries = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(new Uint8Array(entries[packaged[0].path])).toEqual(imageBytes);
    // Metadata JSON entries must stay free of runtime data URLs.
    expect(new TextDecoder().decode(entries['Links/Linked-Panel.json'])).not.toMatch(/data:image/);
  });

  it('fails closed with an actionable diagnostic when a packaged font face forbids redistribution', async () => {
    const restrictedFont = await seedRecord(Uint8Array.from([0, 1, 0, 0, 77, 78, 79]), 'font/ttf', 'restricted.ttf');
    const { document } = await buildManagedDocument({
      fonts: [managedFace(restrictedFont, {
        id: 'face-restricted-package',
        familyId: 'restricted package family',
        familyName: 'Restricted Package Family',
        postscriptName: 'RestrictedPackage-Regular',
        embeddability: 'restricted',
      })],
    });

    await expect(
      Promise.resolve().then(() => buildPaperPackageExport(document, [])),
    ).rejects.toThrow(/Restricted Package Family/);
    await expect(
      Promise.resolve().then(() => buildPaperPackageExport(document, [])),
    ).rejects.toThrow(/restrict/i);
  });

  it('fails closed when a reachable managed record is missing instead of packaging inventories that lie', async () => {
    const { document, refs } = await buildManagedDocument();
    await paperAssetRepository.delete(refs.image.id);

    await expect(
      Promise.resolve().then(() => buildPaperPackageExport(document, [])),
    ).rejects.toThrow(new RegExp(refs.image.sha256.slice(0, 12)));
  });
});
