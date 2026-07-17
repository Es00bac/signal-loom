import { describe, expect, it } from 'vitest';
import type { ImageDocument, ImageDocumentSnapshot, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  IMAGE_SNAPSHOT_MAX_METADATA_BYTES,
  assertImageDocumentSnapshotDecodeBounds,
  buildImageDocumentSnapshotIntegrity,
  buildImageSnapshotReadinessDescriptor,
  disposeImageDocumentSnapshotResources,
  inspectImageDocumentSnapshotIntegrity,
  markImageDocumentSnapshotOwned,
  markImageDocumentSnapshotVerifiedOwned,
  restoreImageDocumentSnapshot,
  verifyImageDocumentSnapshotIntegrity,
} from './ImageSnapshots';

class CountingBitmap {
  static imageDataReads = 0;
  static codecCalls = 0;

  width: number;
  height: number;
  #bytes: Uint8ClampedArray;

  constructor(bytes: ArrayLike<number>) {
    this.width = 1;
    this.height = 1;
    this.#bytes = new Uint8ClampedArray(bytes);
  }

  getContext() {
    return {
      getImageData: () => {
        CountingBitmap.imageDataReads += 1;
        return { width: 1, height: 1, data: new Uint8ClampedArray(this.#bytes) };
      },
    };
  }

  async convertToBlob(): Promise<Blob> {
    CountingBitmap.codecCalls += 1;
    return new Blob();
  }
}

function bitmap(bytes: ArrayLike<number>): LayerBitmap {
  return new CountingBitmap(bytes) as unknown as LayerBitmap;
}

function layer(id: string, offset: number): ImageLayer {
  return {
    id,
    name: id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: bitmap([offset, offset + 1, offset + 2, 255]),
    mask: bitmap([offset + 3, offset + 4, offset + 5, 255]),
    bitmapVersion: 0,
  };
}

function snapshot(): ImageDocumentSnapshot {
  const layers = [layer('layer-a', 10), layer('layer-b', 30)];
  const selectionMask = { width: 1, height: 1, data: new Uint8ClampedArray([211]) };
  return {
    id: 'verified-state',
    name: 'Verified state',
    createdAt: 1,
    width: 1,
    height: 1,
    layers,
    activeLayerId: 'layer-a',
    hasSelection: true,
    selectionVersion: 1,
    selectionMask,
    pixelState: 'complete',
    integrity: buildImageDocumentSnapshotIntegrity(layers, selectionMask),
  };
}

function documentWith(snapshotValue: ImageDocumentSnapshot): ImageDocument {
  return {
    id: 'verified-doc',
    title: 'Verified doc',
    width: 1,
    height: 1,
    layers: [],
    activeLayerId: null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    snapshots: [snapshotValue],
  };
}

describe('Image snapshot verified-state lifecycle', () => {
  it.each(['bitmap', 'mask'] as const)(
    'rejects a cached %s resource expando without pixel readback or codec work',
    (role) => {
      const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
      const resource = value.layers[0][role]! as LayerBitmap & { evilMetadata?: string };
      resource.evilMetadata = 'x'.repeat(16 * 1024 * 1024);

      CountingBitmap.imageDataReads = 0;
      CountingBitmap.codecCalls = 0;
      expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
        complete: false,
        selectionComplete: false,
        reasons: ['snapshot-bounds-invalid'],
      });
      expect(buildImageSnapshotReadinessDescriptor({ doc: documentWith(value) })
        .namedSnapshots.snapshots[0].restorable).toBe(false);
      expect(verifyImageDocumentSnapshotIntegrity(value)).toEqual({
        complete: false,
        selectionComplete: false,
        reasons: ['snapshot-bounds-invalid'],
      });
      expect(CountingBitmap.imageDataReads).toBe(0);
      expect(CountingBitmap.codecCalls).toBe(0);
    },
  );

  it('rejects an uncached 20 MiB resource expando before explicit verification reads pixels', () => {
    const value = snapshot();
    const resource = value.layers[0].bitmap! as LayerBitmap & { evilMetadata?: string };
    resource.evilMetadata = 'x'.repeat(20 * 1024 * 1024);

    CountingBitmap.imageDataReads = 0;
    CountingBitmap.codecCalls = 0;
    expect(verifyImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['snapshot-bounds-invalid'],
    });
    expect(CountingBitmap.imageDataReads).toBe(0);
    expect(CountingBitmap.codecCalls).toBe(0);
  });

  it('counts runtime resource metadata at the exact configured size boundary', () => {
    const maxMetadataBytes = 4_096;
    const value = snapshot();
    const resource = value.layers[0].bitmap! as LayerBitmap & { legitimateMetadata?: unknown };
    const accepts = (length: number) => {
      resource.legitimateMetadata = { nested: { padding: 'x'.repeat(length) } };
      try {
        assertImageDocumentSnapshotDecodeBounds([value], {
          transport: 'runtime',
          maxSnapshotMetadataBytes: maxMetadataBytes,
          maxAggregateMetadataBytes: maxMetadataBytes,
        });
        return true;
      } catch {
        return false;
      }
    };
    let lower = 0;
    let upper = maxMetadataBytes;
    while (lower < upper) {
      const midpoint = Math.ceil((lower + upper) / 2);
      if (accepts(midpoint)) lower = midpoint;
      else upper = midpoint - 1;
    }

    expect(accepts(lower - 1)).toBe(true);
    expect(accepts(lower)).toBe(true);
    expect(accepts(lower + 1)).toBe(false);
  });

  it('supports bounded pre-existing resource metadata and binds later changes', () => {
    const value = snapshot();
    const metadata: {
      label: string;
      nested: { value: number };
      self?: unknown;
    } = { label: 'camera profile', nested: { value: 7 } };
    metadata.self = metadata;
    const resource = value.layers[0].bitmap! as LayerBitmap & {
      legitimateMetadata?: typeof metadata;
    };
    resource.legitimateMetadata = metadata;
    markImageDocumentSnapshotVerifiedOwned(value);

    CountingBitmap.imageDataReads = 0;
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(CountingBitmap.imageDataReads).toBe(0);

    resource.legitimateMetadata.nested.value = 8;
    expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['verified-snapshot-binding-changed'],
    });
    expect(CountingBitmap.imageDataReads).toBe(0);
  });

  it('fails closed on resource getters, Proxies, and replacement while ignoring excluded key classes', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    const original = value.layers[0].bitmap!;
    const mutable = original as unknown as Record<PropertyKey, unknown>;
    const symbolKey = Symbol('resource-metadata');
    const originalPrototype = Object.getPrototypeOf(original);
    let getterCalls = 0;

    Object.defineProperty(original, 'hiddenMetadata', {
      configurable: true,
      value: 'x'.repeat(20 * 1024 * 1024),
    });
    mutable[symbolKey] = 'x'.repeat(20 * 1024 * 1024);
    Object.setPrototypeOf(original, { inheritedMetadata: 'x'.repeat(20 * 1024 * 1024) });
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);

    Object.defineProperty(original, 'hostileMetadata', {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('resource getter must not run');
      },
    });
    expect(() => inspectImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    expect(getterCalls).toBe(0);

    delete mutable.hostileMetadata;
    delete mutable.hiddenMetadata;
    delete mutable[symbolKey];
    Object.setPrototypeOf(original, originalPrototype);
    value.layers[0].bitmap = new Proxy(original, {
      ownKeys: () => {
        throw new Error('resource Proxy inspection failed');
      },
    });
    CountingBitmap.imageDataReads = 0;
    expect(() => inspectImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    expect(CountingBitmap.imageDataReads).toBe(0);
  });

  it('fails closed when a sealed Canvas-like resource cannot be hardened', () => {
    const explicit = markImageDocumentSnapshotOwned(snapshot());
    Object.preventExtensions(explicit.layers[0].bitmap!);

    expect(verifyImageDocumentSnapshotIntegrity(explicit)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['snapshot-resource-hardening-failed'],
    });

    const trustedBuilderPath = snapshot();
    Object.preventExtensions(trustedBuilderPath.layers[0].bitmap!);
    expect(() => markImageDocumentSnapshotVerifiedOwned(trustedBuilderPath)).toThrow(
      /could not enter immutable verified state/i,
    );
  });

  it('rejects oversized enumerable metadata added after the verified cache is populated', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    (value as ImageDocumentSnapshot & { untrustedMetadata?: string }).untrustedMetadata = 'x'.repeat(
      IMAGE_SNAPSHOT_MAX_METADATA_BYTES,
    );

    expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['snapshot-bounds-invalid'],
    });
    expect(verifyImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['snapshot-bounds-invalid'],
    });
    expect(buildImageSnapshotReadinessDescriptor({ doc: documentWith(value) })
      .namedSnapshots.snapshots[0].restorable).toBe(false);
  });

  it('rejects duplicate/empty layer ids and duplicate/missing/extra proofs before reading pixels, while accepting reordered proofs', () => {
    const assertIdentityFailureWithoutRead = (mutate: (value: ImageDocumentSnapshot) => void) => {
      const value = snapshot();
      mutate(value);
      CountingBitmap.imageDataReads = 0;
      expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
      expect(CountingBitmap.imageDataReads).toBe(0);
    };

    assertIdentityFailureWithoutRead((value) => {
      value.layers[1] = layer('layer-a', 10);
    });
    assertIdentityFailureWithoutRead((value) => {
      value.layers[0].id = '';
    });
    assertIdentityFailureWithoutRead((value) => {
      value.integrity!.layers[1] = { ...value.integrity!.layers[0] };
    });
    assertIdentityFailureWithoutRead((value) => {
      value.integrity!.layers.pop();
    });
    assertIdentityFailureWithoutRead((value) => {
      value.integrity!.layers.push({
        ...value.integrity!.layers[0],
        layerId: 'unused-proof',
      });
    });

    const reordered = snapshot();
    reordered.integrity!.layers.reverse();
    CountingBitmap.imageDataReads = 0;
    expect(inspectImageDocumentSnapshotIntegrity(reordered)).toMatchObject({
      complete: true,
      selectionComplete: true,
    });
    expect(CountingBitmap.imageDataReads).toBe(4);
  });

  it('serves cached rerender/readiness queries in O(structure) without pixel readback or rehashing', () => {
    const value = snapshot();
    let metadataReads = 0;
    Object.defineProperty(value.layers[0], 'metadataProbe', {
      configurable: true,
      enumerable: true,
      get: () => {
        metadataReads += 1;
        return { note: 'structural metadata' };
      },
    });
    markImageDocumentSnapshotVerifiedOwned(value);
    const doc = documentWith(value);
    CountingBitmap.imageDataReads = 0;
    metadataReads = 0;
    const startedAt = performance.now();
    for (let index = 0; index < 100; index += 1) {
      expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
      expect(buildImageSnapshotReadinessDescriptor({ doc }).namedSnapshots.snapshots[0].restorable).toBe(true);
    }
    const elapsedMs = performance.now() - startedAt;

    expect(CountingBitmap.imageDataReads).toBe(0);
    expect(metadataReads).toBe(200);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);

    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(CountingBitmap.imageDataReads).toBe(4);
    expect(metadataReads).toBe(201);
  });

  it('fails closed for oversized string, array, and object replacements before and after readiness', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    const mutable = value as ImageDocumentSnapshot & { untrustedMetadata?: unknown };
    const assertRejectedWithoutPixelRead = () => {
      CountingBitmap.imageDataReads = 0;
      expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
        complete: false,
        selectionComplete: false,
        reasons: ['snapshot-bounds-invalid'],
      });
      expect(buildImageSnapshotReadinessDescriptor({ doc: documentWith(value) })
        .namedSnapshots.snapshots[0].restorable).toBe(false);
      expect(verifyImageDocumentSnapshotIntegrity(value)).toEqual({
        complete: false,
        selectionComplete: false,
        reasons: ['snapshot-bounds-invalid'],
      });
      expect(CountingBitmap.imageDataReads).toBe(0);
    };
    const assertAccepted = () => {
      expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
      expect(buildImageSnapshotReadinessDescriptor({ doc: documentWith(value) })
        .namedSnapshots.snapshots[0].restorable).toBe(true);
      expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    };

    mutable.untrustedMetadata = 'x'.repeat(IMAGE_SNAPSHOT_MAX_METADATA_BYTES);
    assertRejectedWithoutPixelRead();
    delete mutable.untrustedMetadata;
    assertAccepted();

    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    mutable.untrustedMetadata = new Array(IMAGE_SNAPSHOT_MAX_METADATA_BYTES);
    assertRejectedWithoutPixelRead();
    delete mutable.untrustedMetadata;
    assertAccepted();

    mutable.untrustedMetadata = {
      nested: { payload: 'x'.repeat(IMAGE_SNAPSHOT_MAX_METADATA_BYTES) },
    };
    assertRejectedWithoutPixelRead();
    delete mutable.untrustedMetadata;
    assertAccepted();
  });

  it('accepts nested metadata just below and at the aggregate limit and rejects the next byte', () => {
    const maxMetadataBytes = 4_096;
    const value = snapshot() as ImageDocumentSnapshot & { nestedMetadata?: unknown };
    const setPadding = (length: number) => {
      value.nestedMetadata = { groups: [{ details: { padding: 'x'.repeat(length) } }] };
    };
    const accepts = (length: number) => {
      setPadding(length);
      try {
        assertImageDocumentSnapshotDecodeBounds([value], {
          transport: 'runtime',
          maxSnapshotMetadataBytes: maxMetadataBytes,
          maxAggregateMetadataBytes: maxMetadataBytes,
        });
        return true;
      } catch {
        return false;
      }
    };
    let lower = 0;
    let upper = maxMetadataBytes;
    while (lower < upper) {
      const midpoint = Math.ceil((lower + upper) / 2);
      if (accepts(midpoint)) lower = midpoint;
      else upper = midpoint - 1;
    }
    const exactPaddingLength = lower;

    expect(accepts(exactPaddingLength - 1)).toBe(true);
    expect(accepts(exactPaddingLength)).toBe(true);
    expect(accepts(exactPaddingLength + 1)).toBe(false);

    setPadding(exactPaddingLength);
    expect(() => assertImageDocumentSnapshotDecodeBounds([value, value], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: maxMetadataBytes,
      maxAggregateMetadataBytes: maxMetadataBytes * 2,
    })).not.toThrow();
    expect(() => assertImageDocumentSnapshotDecodeBounds([value, value], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: maxMetadataBytes,
      maxAggregateMetadataBytes: maxMetadataBytes * 2 - 1,
    })).toThrow(/aggregate metadata exceeds/i);
  });

  it('rechecks post-cache layer, proof, and selection metadata against structural bounds', () => {
    const oversized = 'x'.repeat(IMAGE_SNAPSHOT_MAX_METADATA_BYTES);
    const selectTargets: Array<(value: ImageDocumentSnapshot) => object> = [
      (value) => value.layers[0],
      (value) => value.integrity!.layers[0],
      (value) => value.integrity!.selection,
    ];

    for (const selectTarget of selectTargets) {
      const value = snapshot();
      const target = selectTarget(value);
      markImageDocumentSnapshotVerifiedOwned(value);
      (target as unknown as { optionalMetadata?: unknown }).optionalMetadata = { nested: oversized };

      CountingBitmap.imageDataReads = 0;
      expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
      expect(buildImageSnapshotReadinessDescriptor({ doc: documentWith(value) })
        .namedSnapshots.snapshots[0].restorable).toBe(false);
      expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(false);
      expect(CountingBitmap.imageDataReads).toBe(0);

      delete (target as unknown as { optionalMetadata?: unknown }).optionalMetadata;
      expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    }
  });

  it('invalidates an object replacement with identical pixels until explicit verification recaches it', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    value.layers[0] = { ...value.layers[0] };

    CountingBitmap.imageDataReads = 0;
    expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['verified-snapshot-binding-changed'],
    });
    expect(CountingBitmap.imageDataReads).toBe(0);

    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(CountingBitmap.imageDataReads).toBe(4);
    CountingBitmap.imageDataReads = 0;
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(CountingBitmap.imageDataReads).toBe(0);
  });

  it('uses only own enumerable string-keyed metadata and fails closed on hostile getters and proxies', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    const mutable = value as unknown as Record<PropertyKey, unknown>;
    const oversized = 'x'.repeat(IMAGE_SNAPSHOT_MAX_METADATA_BYTES);
    const symbolKey = Symbol('untrusted');
    const originalPrototype = Object.getPrototypeOf(value);

    Object.defineProperty(value, 'hiddenMetadata', { configurable: true, value: oversized });
    mutable[symbolKey] = oversized;
    Object.setPrototypeOf(value, { inheritedMetadata: oversized });
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);

    delete mutable.hiddenMetadata;
    delete mutable[symbolKey];
    Object.setPrototypeOf(value, originalPrototype);

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    mutable.runtimeMetadata = cycle;
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);

    let getterMode: 'small' | 'oversized' | 'throw' = 'small';
    Object.defineProperty(value, 'runtimeMetadata', {
      configurable: true,
      enumerable: true,
      get: () => {
        if (getterMode === 'throw') throw new Error('hostile getter');
        return getterMode === 'oversized' ? oversized : { note: 'small' };
      },
    });
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    getterMode = 'oversized';
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    getterMode = 'throw';
    expect(() => inspectImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    expect(() => verifyImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(false);

    delete mutable.runtimeMetadata;
    mutable.runtimeMetadata = new Proxy({}, {
      ownKeys: () => {
        throw new Error('hostile proxy');
      },
    });
    expect(() => inspectImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(inspectImageDocumentSnapshotIntegrity(value).complete).toBe(false);
    expect(() => verifyImageDocumentSnapshotIntegrity(value)).not.toThrow();
    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(false);
  });

  it('rejects hostile creation dimensions and aggregate pixels before source readback', () => {
    const oversizedDimension = layer('oversized', 1);
    oversizedDimension.bitmap!.width = 16_385;
    CountingBitmap.imageDataReads = 0;
    expect(() => buildImageDocumentSnapshotIntegrity([oversizedDimension])).toThrow(/16384/i);
    expect(CountingBitmap.imageDataReads).toBe(0);

    const aggregateLayers = [layer('large-a', 1), layer('large-b', 2)];
    for (const value of aggregateLayers) {
      value.bitmap!.width = 12_000;
      value.bitmap!.height = 12_000;
      value.mask = null;
    }
    expect(() => buildImageDocumentSnapshotIntegrity(aggregateLayers)).toThrow(/aggregate pixels exceed/i);
    expect(CountingBitmap.imageDataReads).toBe(0);
  });

  it('accounts unavailable structural resources and metadata at exact aggregate boundaries', () => {
    const structuralSnapshot = {
      id: 'structural-only',
      name: 'Structural only',
      createdAt: 1,
      width: 1,
      height: 1,
      layers: [{
        id: 'structural-layer',
        name: 'Structural layer',
        bitmap: { ignoredRuntimeBitmap: true },
        bitmapData: 'ignored-pixel-payload',
        mask: { ignoredRuntimeMask: true },
        maskData: 'ignored-mask-payload',
        metadata: { note: 'bounded metadata' },
      }],
      activeLayerId: null,
      hasSelection: false,
      selectionVersion: 0,
      selectionMask: { ignoredRuntimeSelection: true },
      selectionMaskData: 'ignored-selection-payload',
      pixelState: 'unavailable',
    };

    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot], {
      transport: 'runtime',
      maxAggregateResources: 6,
    })).not.toThrow();
    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot], {
      transport: 'runtime',
      maxAggregateResources: 5,
    })).toThrow(/aggregate structural resource count exceeds 5/i);

    let lower = 0;
    let upper = 4_096;
    while (lower < upper) {
      const midpoint = Math.floor((lower + upper) / 2);
      try {
        assertImageDocumentSnapshotDecodeBounds([structuralSnapshot], {
          transport: 'runtime',
          maxSnapshotMetadataBytes: midpoint,
          maxAggregateMetadataBytes: 4_096,
        });
        upper = midpoint;
      } catch {
        lower = midpoint + 1;
      }
    }
    const exactMetadataBytes = lower;
    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: exactMetadataBytes,
      maxAggregateMetadataBytes: exactMetadataBytes,
    })).not.toThrow();
    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: exactMetadataBytes - 1,
      maxAggregateMetadataBytes: 4_096,
    })).toThrow(/metadata exceeds/i);
    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot, structuralSnapshot], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: exactMetadataBytes,
      maxAggregateMetadataBytes: exactMetadataBytes * 2,
    })).not.toThrow();
    expect(() => assertImageDocumentSnapshotDecodeBounds([structuralSnapshot, structuralSnapshot], {
      transport: 'runtime',
      maxSnapshotMetadataBytes: exactMetadataBytes,
      maxAggregateMetadataBytes: exactMetadataBytes * 2 - 1,
    })).toThrow(/aggregate metadata exceeds/i);
  });

  it('blocks oversized unavailable snapshots in readiness and Restore without reading pixels', () => {
    const value = snapshot();
    value.pixelState = 'unavailable';
    value.layers = Array.from({ length: 2_049 }, (_, index) => ({
      ...value.layers[0],
      id: `unavailable-layer-${index}`,
      bitmap: null,
      mask: null,
    }));
    const doc = documentWith(value);
    CountingBitmap.imageDataReads = 0;

    expect(inspectImageDocumentSnapshotIntegrity(value)).toEqual({
      complete: false,
      selectionComplete: false,
      reasons: ['snapshot-bounds-invalid'],
    });
    expect(buildImageSnapshotReadinessDescriptor({ doc }).namedSnapshots.snapshots[0].restorable).toBe(false);
    expect(restoreImageDocumentSnapshot(doc, value.id)).toBe(doc);
    expect(CountingBitmap.imageDataReads).toBe(0);
  });

  it('makes owned payload mutation unavailable and invalidates cache on resource or manifest replacement', () => {
    const value = markImageDocumentSnapshotVerifiedOwned(snapshot());
    const originalSelection = value.selectionMask!.data;
    originalSelection[0] = 0;
    expect(value.selectionMask!.data[0]).toBe(211);
    expect(value.layers[0].bitmap!.getContext('2d')).toBeNull();
    expect(() => {
      value.layers[0].bitmap!.width = 2;
    }).toThrow(/immutable/i);

    CountingBitmap.imageDataReads = 0;
    value.layers[0].bitmap = bitmap([99, 11, 12, 255]);
    expect(inspectImageDocumentSnapshotIntegrity(value)).toMatchObject({
      complete: false,
      reasons: ['verified-snapshot-binding-changed'],
    });
    expect(CountingBitmap.imageDataReads).toBe(0);
    const changedPayloadDoc = documentWith(value);
    expect(restoreImageDocumentSnapshot(changedPayloadDoc, value.id)).toBe(changedPayloadDoc);

    const manifestReplacement = markImageDocumentSnapshotVerifiedOwned(snapshot());
    manifestReplacement.integrity = structuredClone(manifestReplacement.integrity);
    expect(inspectImageDocumentSnapshotIntegrity(manifestReplacement)).toMatchObject({
      complete: false,
      reasons: ['verified-snapshot-binding-changed'],
    });

    const disposed = markImageDocumentSnapshotVerifiedOwned(snapshot());
    expect(inspectImageDocumentSnapshotIntegrity(disposed).complete).toBe(true);
    disposeImageDocumentSnapshotResources(disposed);
    expect(disposed.layers[0].bitmap?.width).toBe(0);
    expect(disposed.selectionMask?.data.byteLength).toBe(0);
    expect(inspectImageDocumentSnapshotIntegrity(disposed).complete).toBe(false);
  });
});
