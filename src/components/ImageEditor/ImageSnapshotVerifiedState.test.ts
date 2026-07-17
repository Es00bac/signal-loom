import { describe, expect, it } from 'vitest';
import type { ImageDocument, ImageDocumentSnapshot, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  assertImageDocumentSnapshotDecodeBounds,
  buildImageDocumentSnapshotIntegrity,
  buildImageSnapshotReadinessDescriptor,
  disposeImageDocumentSnapshotResources,
  inspectImageDocumentSnapshotIntegrity,
  markImageDocumentSnapshotVerifiedOwned,
  restoreImageDocumentSnapshot,
  verifyImageDocumentSnapshotIntegrity,
} from './ImageSnapshots';

class CountingBitmap {
  static imageDataReads = 0;

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

  it('serves rerender/readiness queries from the exact verified binding without rehashing', () => {
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
    expect(metadataReads).toBe(0);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);

    expect(verifyImageDocumentSnapshotIntegrity(value).complete).toBe(true);
    expect(CountingBitmap.imageDataReads).toBe(4);
    expect(metadataReads).toBeGreaterThan(0);
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
