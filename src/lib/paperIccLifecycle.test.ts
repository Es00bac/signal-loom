import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPaperDocument } from './paperDocument';
import { exportPaperDocumentToPdfx } from './paperPdfxPipeline';
import type { PaperOutputProfileResolution } from './paperManagedIccProfiles';
import type { BinaryAssetId } from '../shared/assets/contentAddressedAsset';

type FailurePoint = 'create-srgb' | 'open-cmyk' | 'wrong-space' | 'create-transform' | 'create-proofing-transform';

interface LifecycleStats {
  createdProfiles: number;
  closedProfiles: number;
  createdTransforms: number;
  deletedTransforms: number;
  outstandingProfiles(): number;
  outstandingTransforms(): number;
}

function createTrackedLcms(input: { failure?: FailurePoint; throwDuringCleanup?: boolean } = {}): { module: Record<string, unknown>; stats: LifecycleStats } {
  const { failure, throwDuringCleanup = false } = input;
  let nextProfile = 1;
  let nextTransform = 100;
  const profiles = new Set<number>();
  const transforms = new Set<number>();
  const stats: LifecycleStats = {
    createdProfiles: 0,
    closedProfiles: 0,
    createdTransforms: 0,
    deletedTransforms: 0,
    outstandingProfiles: () => profiles.size,
    outstandingTransforms: () => transforms.size,
  };
  const createProfile = () => {
    const handle = nextProfile++;
    profiles.add(handle);
    stats.createdProfiles += 1;
    return handle;
  };
  const createTransform = () => {
    const handle = nextTransform++;
    transforms.add(handle);
    stats.createdTransforms += 1;
    return handle;
  };
  return {
    stats,
    module: {
      cmsCreate_sRGBProfile: () => failure === 'create-srgb' ? 0 : createProfile(),
      cmsOpenProfileFromMem: () => failure === 'open-cmyk' ? 0 : createProfile(),
      cmsGetColorSpaceASCII: () => failure === 'wrong-space' ? 'RGB' : 'CMYK',
      cmsCreateTransform: () => failure === 'create-transform' ? 0 : createTransform(),
      cmsCreateProofingTransform: () => failure === 'create-proofing-transform' ? 0 : createTransform(),
      cmsGetProfileInfoASCII: () => 'Tracked CMYK',
      cmsDoTransform: (_handle: number, bytes: Uint8Array) => new Uint8Array(bytes),
      cmsDeleteTransform: (handle: number) => {
        if (transforms.delete(handle)) stats.deletedTransforms += 1;
        if (throwDuringCleanup) throw new Error('delete transform failed');
      },
      cmsCloseProfile: (handle: number) => {
        if (profiles.delete(handle)) stats.closedProfiles += 1;
        if (throwDuringCleanup) throw new Error('close profile failed');
      },
    },
  };
}

const mockedLcms = vi.hoisted(() => ({ module: undefined as Record<string, unknown> | undefined }));

vi.mock('lcms-wasm', () => ({
  TYPE_CMYK_8: 0,
  TYPE_RGB_8: 0,
  cmsInfoDescription: 0,
  instantiate: async () => mockedLcms.module,
}));

async function loadEngine(module: Record<string, unknown>) {
  mockedLcms.module = module;
  vi.resetModules();
  return import('./paperIccEngine');
}

afterEach(() => {
  mockedLcms.module = undefined;
  vi.resetModules();
});

describe('AUD-038 ICC ownership lifecycle (red baseline)', () => {
  it('balances all RGB-to-CMYK profile and transform handles across repeated conversions', async () => {
    const tracked = createTrackedLcms();
    const { createRgbToCmykTransform } = await loadEngine(tracked.module);

    for (let index = 0; index < 100; index += 1) {
      const transform = await createRgbToCmykTransform(new Uint8Array([1]));
      transform.rgbToCmyk({ r: index, g: 20, b: 30 });
      (transform as { dispose?: () => void }).dispose?.();
    }

    expect(tracked.stats.outstandingTransforms()).toBe(0);
    expect(tracked.stats.outstandingProfiles()).toBe(0);
  });

  it.each<FailurePoint>(['create-srgb', 'open-cmyk', 'wrong-space', 'create-transform'])(
    'releases all partially-created RGB-to-CMYK handles when %s fails',
    async (failure) => {
      const tracked = createTrackedLcms({ failure });
      const { createRgbToCmykTransform } = await loadEngine(tracked.module);

      await expect(createRgbToCmykTransform(new Uint8Array([1]))).rejects.toThrow();

      expect(tracked.stats.outstandingTransforms()).toBe(0);
      expect(tracked.stats.outstandingProfiles()).toBe(0);
    },
  );

  it.each<FailurePoint>(['create-srgb', 'open-cmyk', 'wrong-space', 'create-transform'])(
    'releases all validation handles when %s fails',
    async (failure) => {
      const tracked = createTrackedLcms({ failure });
      const { validateCmykOutputProfileTransform } = await loadEngine(tracked.module);

      await expect(validateCmykOutputProfileTransform(new Uint8Array([1]))).rejects.toThrow();

      expect(tracked.stats.outstandingTransforms()).toBe(0);
      expect(tracked.stats.outstandingProfiles()).toBe(0);
    },
  );

  it.each<FailurePoint>(['create-srgb', 'open-cmyk', 'wrong-space', 'create-proofing-transform'])(
    'releases all partially-created soft-proof handles when %s fails',
    async (failure) => {
      const tracked = createTrackedLcms({ failure });
      const { createSoftProofTransform } = await loadEngine(tracked.module);

      await expect(createSoftProofTransform(new Uint8Array([1]))).rejects.toThrow();

      expect(tracked.stats.outstandingTransforms()).toBe(0);
      expect(tracked.stats.outstandingProfiles()).toBe(0);
    },
  );

  it('balances all soft-proof profile and transform handles across repeated previews', async () => {
    const tracked = createTrackedLcms();
    const { createSoftProofTransform } = await loadEngine(tracked.module);

    for (let index = 0; index < 100; index += 1) {
      const proof = await createSoftProofTransform(new Uint8Array([1]));
      proof.proofRgb({ r: index, g: 20, b: 30 });
      proof.dispose();
    }

    expect(tracked.stats.outstandingTransforms()).toBe(0);
    expect(tracked.stats.outstandingProfiles()).toBe(0);
  });

  it('continues every cleanup after a delete failure and surfaces a cleanup-only error', async () => {
    const tracked = createTrackedLcms({ throwDuringCleanup: true });
    const { createRgbToCmykTransform } = await loadEngine(tracked.module);
    const transform = await createRgbToCmykTransform(new Uint8Array([1]));

    expect(() => transform.dispose?.()).toThrow(/Failed to release 3 Paper native\/WASM resources/);
    expect(tracked.stats.outstandingTransforms()).toBe(0);
    expect(tracked.stats.outstandingProfiles()).toBe(0);
  });

  it('preserves the primary creation error while retaining cleanup failure details', async () => {
    const tracked = createTrackedLcms({ failure: 'create-transform', throwDuringCleanup: true });
    const { createRgbToCmykTransform } = await loadEngine(tracked.module);

    let thrown: unknown;
    try {
      await createRgbToCmykTransform(new Uint8Array([1]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Could not create the ICC color transform.');
    const { getPaperResourceCleanupError } = await import('./paperColorManagement');
    expect(getPaperResourceCleanupError(thrown)?.failures).toHaveLength(2);
    expect(tracked.stats.outstandingTransforms()).toBe(0);
    expect(tracked.stats.outstandingProfiles()).toBe(0);
  });
});

const profileId = `sha256:${'1'.repeat(64)}` as BinaryAssetId;
const outputProfile: Extract<PaperOutputProfileResolution, { status: 'ready' }> = {
  status: 'ready',
  profile: {
    id: profileId,
    asset: { id: profileId, sha256: '1'.repeat(64), mimeType: 'application/vnd.iccprofile', byteLength: 1 },
    description: 'Tracked CMYK',
    deviceClass: 'prtr',
    colorSpace: 'CMYK',
    pcs: 'Lab ',
    outputConditionId: 'TRACKED',
    source: { kind: 'user-import' },
  },
  bytes: new Uint8Array([1]),
};

describe('AUD-038 PDF/X transform ownership (red baseline)', () => {
  it('releases every pipeline-owned transform after repeated flattened PDF/X exports', async () => {
    let outstanding = 0;
    const document = createDefaultPaperDocument({ title: 'Owned pipeline transform' });
    for (let index = 0; index < 50; index += 1) {
      await exportPaperDocumentToPdfx(document, {
        standard: 'pdf-x-1a', outputProfile, flattenAllPages: true, outputDpi: 72,
      }, {
        createTransform: async () => {
          outstanding += 1;
          return {
            kind: 'icc' as const,
            profileName: 'Tracked CMYK',
            rgbToCmyk: () => ({ c: 0, m: 0, y: 0, k: 0 }),
            transformRgbBuffer: (_rgb, pixelCount) => new Uint8Array(pixelCount * 4),
            dispose: () => { outstanding -= 1; },
          };
        },
        rasterizePage: async () => ({ rgba: new Uint8Array([255, 255, 255, 255]), widthPx: 1, heightPx: 1 }),
      });
      expect(outstanding).toBe(0);
    }
  });

  it('releases the owned transform when rasterization fails after transform creation', async () => {
    let outstanding = 0;
    const document = createDefaultPaperDocument({ title: 'Failed owned pipeline transform' });

    await expect(exportPaperDocumentToPdfx(document, {
      standard: 'pdf-x-1a', outputProfile, flattenAllPages: true,
    }, {
      createTransform: async () => {
        outstanding += 1;
        return {
          kind: 'icc' as const,
          profileName: 'Tracked CMYK',
          rgbToCmyk: () => ({ c: 0, m: 0, y: 0, k: 0 }),
          dispose: () => { outstanding -= 1; },
        };
      },
      rasterizePage: async () => { throw new Error('raster failed'); },
    })).rejects.toThrow('raster failed');

    expect(outstanding).toBe(0);
  });
});
