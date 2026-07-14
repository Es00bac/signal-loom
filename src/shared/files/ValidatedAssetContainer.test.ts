import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import {
  createBinaryAssetRecord,
  type BinaryAssetRecord,
  type BinaryAssetRef,
} from '../assets/contentAddressedAsset';
import {
  DEFAULT_ASSET_CONTAINER_LIMITS,
  packValidatedAssetContainer,
  unpackValidatedAssetContainer,
  type AssetContainerLimits,
} from './ValidatedAssetContainer';

const manifest = (assets: BinaryAssetRef[] = []) => ({
  format: 'paper-test',
  formatVersion: 2,
  kind: 'paper',
  document: { title: 'Bounded test' },
  assets,
  futureField: { retained: true },
});

function zipWithManifest(value: unknown, entries: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(value)),
    ...entries,
  });
}

function assetPath(ref: BinaryAssetRef, extension = 'png'): string {
  return `assets/${ref.sha256}.${extension}`;
}

function withLimits(overrides: Partial<AssetContainerLimits>): AssetContainerLimits {
  return { ...DEFAULT_ASSET_CONTAINER_LIMITS, ...overrides };
}

function replaceAllAscii(bytes: Uint8Array, from: string, to: string): Uint8Array {
  expect(to).toHaveLength(from.length);
  const output = new Uint8Array(bytes);
  const source = strToU8(from);
  const replacement = strToU8(to);
  let replacements = 0;

  for (let offset = 0; offset <= output.length - source.length; offset += 1) {
    if (source.every((value, index) => output[offset + index] === value)) {
      output.set(replacement, offset);
      replacements += 1;
      offset += source.length - 1;
    }
  }

  expect(replacements).toBe(2);
  return output;
}

function setCentralUncompressedSize(bytes: Uint8Array, size: number): Uint8Array {
  const output = new Uint8Array(bytes);
  let centralHeader = -1;
  output.forEach((value, index) => {
    if (
      value === 0x50
      && output[index + 1] === 0x4b
      && output[index + 2] === 0x01
      && output[index + 3] === 0x02
    ) {
      centralHeader = index;
    }
  });
  expect(centralHeader).toBeGreaterThan(-1);
  new DataView(output.buffer, output.byteOffset, output.byteLength)
    .setUint32(centralHeader + 24, size, true);
  return output;
}

describe('ValidatedAssetContainer', () => {
  it('round-trips and verifies content-addressed entries', async () => {
    const asset = await createBinaryAssetRecord(
      new Uint8Array([1, 2, 3]),
      { mimeType: 'image/png', fileName: '../../Panel Final.PNG' },
    );
    const inputManifest = manifest([asset.ref]);

    const bytes = packValidatedAssetContainer(inputManifest, [asset]);
    const archivePaths = Object.keys(unzipSync(bytes));
    const opened = await unpackValidatedAssetContainer(bytes);

    expect(archivePaths).toEqual(['manifest.json', assetPath(asset.ref)]);
    expect(opened.manifest).toEqual(inputManifest);
    expect(opened.assets.get(asset.ref.id)).toEqual(asset);
    expect(opened.assets.get(asset.ref.id)?.bytes).not.toBe(asset.bytes);
  });

  it.each([
    '../escape.bin',
    'assets/../escape.bin',
    '/absolute.bin',
    'C:\\absolute.bin',
    '\\server\\share.bin',
  ])('rejects unsafe archive path %s', async (path) => {
    const malicious = zipWithManifest(manifest(), { [path]: new Uint8Array([1]) });
    await expect(unpackValidatedAssetContainer(malicious)).rejects.toThrow(/path/i);
  });

  it('rejects duplicate archive names', async () => {
    const archive = zipWithManifest(manifest(), {
      'first.bin': new Uint8Array([1]),
      'other.bin': new Uint8Array([2]),
    });
    const duplicate = replaceAllAscii(archive, 'other.bin', 'first.bin');

    await expect(unpackValidatedAssetContainer(duplicate)).rejects.toThrow(/duplicate/i);
  });

  it('rejects undeclared and non-normalized entries', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1]), { mimeType: 'image/png' });

    await expect(unpackValidatedAssetContainer(zipWithManifest(manifest(), {
      [assetPath(asset.ref)]: asset.bytes,
    }))).rejects.toThrow(/undeclared/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest(manifest([asset.ref]), {
      [assetPath(asset.ref, 'bin')]: asset.bytes,
    }))).rejects.toThrow(/undeclared|missing|normalized/i);
  });

  it('rejects missing manifest and declared asset entries', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1]), { mimeType: 'image/png' });

    await expect(unpackValidatedAssetContainer(zipSync({
      [assetPath(asset.ref)]: asset.bytes,
    }))).rejects.toThrow(/missing.*manifest/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest(manifest([asset.ref])))).rejects.toThrow(/missing.*asset/i);
  });

  it('rejects malformed references and foreign manifest types', async () => {
    const sha256 = 'a'.repeat(64);
    const invalidRef = {
      id: `sha256:${sha256}`,
      sha256,
      mimeType: 'image/png',
      byteLength: '1',
    };

    await expect(unpackValidatedAssetContainer(zipWithManifest({
      ...manifest(),
      assets: [invalidRef],
    }))).rejects.toThrow(/asset reference/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest({
      ...manifest(),
      assets: ['legacy.png'],
    }))).rejects.toThrow(/asset reference|manifest/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest({
      ...manifest(),
      formatVersion: '2',
    }))).rejects.toThrow(/manifest/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest([]))).rejects.toThrow(/manifest/i);
  });

  it('rejects invalid JSON and unsupported compression', async () => {
    const invalidJson = zipSync({ 'manifest.json': strToU8('{') });
    await expect(unpackValidatedAssetContainer(invalidJson)).rejects.toThrow(/manifest.*JSON/i);

    const archive = zipWithManifest(manifest());
    const unsupportedCompression = new Uint8Array(archive);
    unsupportedCompression[8] = 99;
    unsupportedCompression[9] = 0;
    const centralHeader = unsupportedCompression.findIndex((value, index) => (
      value === 0x50
      && unsupportedCompression[index + 1] === 0x4b
      && unsupportedCompression[index + 2] === 0x01
      && unsupportedCompression[index + 3] === 0x02
    ));
    expect(centralHeader).toBeGreaterThan(-1);
    unsupportedCompression[centralHeader + 10] = 99;
    unsupportedCompression[centralHeader + 11] = 0;
    await expect(unpackValidatedAssetContainer(unsupportedCompression)).rejects.toThrow(/compression|zip/i);
  });

  it('enforces entry, manifest, per-asset, and total uncompressed limits', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    const value = manifest([asset.ref]);
    const manifestBytes = strToU8(JSON.stringify(value)).byteLength;
    const archive = zipWithManifest(value, { [assetPath(asset.ref)]: asset.bytes });

    await expect(unpackValidatedAssetContainer(archive, withLimits({ maxEntries: 1 }))).rejects.toThrow(/entries.*limit/i);
    await expect(unpackValidatedAssetContainer(archive, withLimits({
      maxManifestBytes: manifestBytes - 1,
    }))).rejects.toThrow(/manifest.*limit/i);
    await expect(unpackValidatedAssetContainer(archive, withLimits({ maxAssetBytes: 2 }))).rejects.toThrow(/asset.*limit/i);
    await expect(unpackValidatedAssetContainer(archive, withLimits({
      maxTotalBytes: manifestBytes + asset.bytes.byteLength - 1,
    }))).rejects.toThrow(/total.*limit/i);
    expect(() => packValidatedAssetContainer(manifest(), [], withLimits({
      maxTotalBytes: strToU8(JSON.stringify(manifest())).byteLength - 1,
    }))).toThrow(/total.*limit/i);
  });

  it('rejects inconsistent stored-entry sizes before extraction', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const asset = await createBinaryAssetRecord(bytes, { mimeType: 'image/png' });
    const forgedRef = { ...asset.ref, byteLength: 1 };
    const archive = zipSync({
      'manifest.json': [strToU8(JSON.stringify(manifest([forgedRef]))), { level: 0 }],
      [assetPath(forgedRef)]: [bytes, { level: 0 }],
    });
    const forgedSizes = setCentralUncompressedSize(archive, 1);

    await expect(unpackValidatedAssetContainer(
      forgedSizes,
      withLimits({ maxAssetBytes: 1 }),
    )).rejects.toThrow(/stored.*size metadata|asset.*limit/i);
  });

  it('rejects declared byte-length and content-hash mismatches', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    const wrongLengthRef = { ...asset.ref, byteLength: 2 };
    const wrongContent = new Uint8Array([1, 2, 4]);

    await expect(unpackValidatedAssetContainer(zipWithManifest(manifest([wrongLengthRef]), {
      [assetPath(wrongLengthRef)]: asset.bytes,
    }))).rejects.toThrow(/byte length|size/i);
    await expect(unpackValidatedAssetContainer(zipWithManifest(manifest([asset.ref]), {
      [assetPath(asset.ref)]: wrongContent,
    }))).rejects.toThrow(/hash/i);
  });

  it('rejects inconsistent inputs while packing', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    const other = await createBinaryAssetRecord(new Uint8Array([4]), { mimeType: 'image/png' });
    const alteredRecord: BinaryAssetRecord = {
      ref: { ...asset.ref, mimeType: 'image/jpeg' },
      bytes: asset.bytes,
    };

    expect(() => packValidatedAssetContainer(manifest([asset.ref]), [])).toThrow(/missing/i);
    expect(() => packValidatedAssetContainer(manifest(), [asset])).toThrow(/undeclared/i);
    expect(() => packValidatedAssetContainer(manifest([asset.ref]), [asset, asset])).toThrow(/duplicate/i);
    expect(() => packValidatedAssetContainer(manifest([asset.ref]), [alteredRecord])).toThrow(/reference/i);
    expect(() => packValidatedAssetContainer(manifest([asset.ref]), [{
      ...asset,
      bytes: other.bytes,
    }])).toThrow(/byte length/i);
  });
});
