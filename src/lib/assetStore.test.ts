import { describe, expect, it } from 'vitest';
import {
  materializeStoredAssetPayload,
  type StoredAssetRecord,
} from './assetStore';

describe('materializeStoredAssetPayload', () => {
  it('keeps legacy data-url records readable', () => {
    const record: StoredAssetRecord = {
      id: 'asset-1',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      dataUrl: 'data:video/mp4;base64,AAA',
      createdAt: 1,
    };

    expect(materializeStoredAssetPayload(record, () => 'blob:unused')).toEqual({
      id: 'asset-1',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      dataUrl: 'data:video/mp4;base64,AAA',
    });
  });

  it('uses object URLs for blob-backed records so large media is not held as base64 strings', () => {
    const record: StoredAssetRecord = {
      id: 'asset-1',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      blob: new Blob(['video-bytes'], { type: 'video/mp4' }),
      createdAt: 1,
    };

    expect(materializeStoredAssetPayload(record, () => 'blob:clip-object-url')).toEqual({
      id: 'asset-1',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      dataUrl: 'blob:clip-object-url',
    });
  });
});
