import { describe, expect, it } from 'vitest';
import type { EditorAsset, EditorStageObject } from '../types/flow';
import {
  createEditorAsset,
  getEditorAssets,
  getProjectEditorAssets,
  migrateStageObjectsToEditorAssets,
} from './editorAssets';

describe('createEditorAsset', () => {
  it('creates reusable text and shape editor assets with stable defaults', () => {
    const text = createEditorAsset('text', { label: 'Lower third' });
    const shape = createEditorAsset('shape', { label: 'Box' });

    expect(text.kind).toBe('text');
    expect(text.label).toBe('Lower third');
    expect(text.textDefaults?.text).toBe('Text');
    expect(shape.kind).toBe('shape');
    expect(shape.shapeDefaults?.shape).toBe('rectangle');
  });
});

describe('getEditorAssets', () => {
  it('normalizes unknown data and preserves valid assets', () => {
    const assets = getEditorAssets({
      editorAssets: [
        { id: 'bad' } as EditorAsset,
        createEditorAsset('text', { id: 'title-1', label: 'Title' }),
      ],
    });

    expect(assets).toHaveLength(1);
    expect(assets[0]?.id).toBe('title-1');
  });
});

describe('getProjectEditorAssets', () => {
  it('surfaces saved source-bin images as editor assets', () => {
    const textAsset = createEditorAsset('text', { id: 'title-1', label: 'Title' });
    const assets = getProjectEditorAssets([textAsset], [
      {
        id: 'source-image-1',
        label: 'Generated frame',
        kind: 'image',
        mimeType: 'image/png',
        assetUrl: 'blob:generated-frame',
        createdAt: 10,
      },
      {
        id: 'source-video-1',
        label: 'Generated clip',
        kind: 'video',
        mimeType: 'video/mp4',
        assetUrl: 'blob:generated-clip',
        createdAt: 20,
      },
    ]);

    expect(assets).toEqual([
      textAsset,
      {
        id: 'asset-source-source-image-1',
        kind: 'image',
        label: 'Generated frame',
        createdAt: 10,
        updatedAt: 10,
        imageSourceId: 'source-image-1',
      },
    ]);
  });

  it('does not duplicate source-bin images already represented by explicit editor assets', () => {
    const imageAsset = createEditorAsset('image', {
      id: 'asset-image-1',
      label: 'Imported image',
      imageSourceId: 'source-image-1',
      createdAt: 30,
    });
    const assets = getProjectEditorAssets([imageAsset], [
      {
        id: 'source-image-1',
        label: 'Imported image',
        kind: 'image',
        mimeType: 'image/png',
        assetUrl: 'blob:imported-image',
        createdAt: 10,
      },
    ]);

    expect(assets).toEqual([imageAsset]);
  });

  it('surfaces saved source-bin text as editor assets', () => {
    const assets = getProjectEditorAssets([], [
      {
        id: 'source-text-1',
        label: 'Generated caption',
        kind: 'text',
        text: 'Generated caption text',
        createdAt: 40,
      },
    ]);

    expect(assets).toEqual([
      expect.objectContaining({
        id: 'asset-source-source-text-1',
        kind: 'text',
        label: 'Generated caption',
        createdAt: 40,
        updatedAt: 40,
        textDefaults: expect.objectContaining({
          text: 'Generated caption text',
        }),
      }),
    ]);
  });
});

describe('migrateStageObjectsToEditorAssets', () => {
  it('turns old stage text and rectangles into editor assets and timeline clips', () => {
    const oldObjects: EditorStageObject[] = [
      {
        id: 'stage-text',
        kind: 'text',
        x: 100,
        y: 80,
        width: 420,
        height: 120,
        rotationDeg: 5,
        opacityPercent: 75,
        blendMode: 'normal',
        text: 'Hello',
        fontFamily: 'Inter',
        fontSizePx: 64,
        color: '#ffffff',
      },
      {
        id: 'stage-rect',
        kind: 'rectangle',
        x: 20,
        y: 30,
        width: 320,
        height: 180,
        rotationDeg: 0,
        opacityPercent: 60,
        blendMode: 'screen',
        fillColor: '#0ea5e9',
        borderColor: '#ffffff',
        borderWidth: 2,
        cornerRadius: 12,
      },
    ];

    const migrated = migrateStageObjectsToEditorAssets(oldObjects, {
      durationSeconds: 4,
      trackIndex: 0,
    });

    expect(migrated.assets.map((asset) => asset.kind)).toEqual(['text', 'shape']);
    expect(migrated.clips).toHaveLength(2);
    expect(migrated.clips[0]).toMatchObject({
      sourceNodeId: 'asset-stage-text',
      sourceKind: 'text',
      positionX: 100,
      positionY: 80,
      opacityPercent: 75,
    });
    expect(migrated.clips[1]).toMatchObject({
      sourceNodeId: 'asset-stage-rect',
      sourceKind: 'shape',
      opacityPercent: 60,
    });
  });

  it('returns an empty migration for already migrated projects', () => {
    const migrated = migrateStageObjectsToEditorAssets([], { durationSeconds: 4, trackIndex: 0 });

    expect(migrated.assets).toEqual([]);
    expect(migrated.clips).toEqual([]);
  });
});
