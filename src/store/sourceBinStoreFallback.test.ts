import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteImportedAsset: vi.fn(),
  loadImportedAsset: vi.fn(),
  loadImportedAssetAsDataUrl: vi.fn(),
  loadImportedAssetBlob: vi.fn(),
  loadScratchAssetBlob: vi.fn(),
  localizeAssetForProject: vi.fn(),
  materializeAndroidSourceAsset: vi.fn(),
  isAndroidSourceAssetPermissionError: vi.fn(),
  saveDataUrlAsset: vi.fn(),
  saveImportedAsset: vi.fn(),
  showAlertDialog: vi.fn(),
  storeScratchAssetBlob: vi.fn(),
}));

vi.mock('../lib/assetStore', () => ({
  deleteImportedAsset: mocks.deleteImportedAsset,
  loadImportedAsset: mocks.loadImportedAsset,
  loadImportedAssetAsDataUrl: mocks.loadImportedAssetAsDataUrl,
  loadImportedAssetBlob: mocks.loadImportedAssetBlob,
  saveDataUrlAsset: mocks.saveDataUrlAsset,
  saveImportedAsset: mocks.saveImportedAsset,
}));

vi.mock('../lib/fileSystemWorkspace', () => ({
  loadScratchAssetBlob: mocks.loadScratchAssetBlob,
  storeScratchAssetBlob: mocks.storeScratchAssetBlob,
}));

vi.mock('../lib/sourceBinPersistence', () => ({
  localizeAssetForProject: mocks.localizeAssetForProject,
}));

vi.mock('../lib/androidSourceAssetStorage', () => ({
  materializeAndroidSourceAsset: mocks.materializeAndroidSourceAsset,
  isAndroidSourceAssetPermissionError: mocks.isAndroidSourceAssetPermissionError,
}));

vi.mock('./alertDialogStore', () => ({
  showAlertDialog: mocks.showAlertDialog,
}));

import { useSourceBinStore } from './sourceBinStore';

describe('source bin persistence fallbacks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.deleteImportedAsset.mockReset();
    mocks.loadImportedAsset.mockReset();
    mocks.loadImportedAssetAsDataUrl.mockReset();
    mocks.loadImportedAssetBlob.mockReset();
    mocks.loadScratchAssetBlob.mockReset();
    mocks.localizeAssetForProject.mockReset();
    mocks.materializeAndroidSourceAsset.mockReset();
    mocks.isAndroidSourceAssetPermissionError.mockReset();
    mocks.saveDataUrlAsset.mockReset();
    mocks.saveImportedAsset.mockReset();
    mocks.showAlertDialog.mockReset();
    mocks.storeScratchAssetBlob.mockReset();
    mocks.localizeAssetForProject.mockImplementation(async (assetUrl: string, mimeType?: string) => ({
      dataUrl: assetUrl,
      mimeType: mimeType ?? 'application/octet-stream',
    }));
    mocks.materializeAndroidSourceAsset.mockResolvedValue(undefined);
    mocks.isAndroidSourceAssetPermissionError.mockImplementation((error: unknown) => (
      error instanceof Error && error.name === 'AndroidSourceAssetPermissionError'
    ));
    mocks.showAlertDialog.mockResolvedValue(undefined);
    useSourceBinStore.setState({
      bins: [{ id: 'default', name: 'Source Library', items: [], collapsed: false, createdAt: Date.now() }],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
    });
  });

  it('keeps connected generated media in the source bin if durable persistence fails', async () => {
    mocks.localizeAssetForProject.mockRejectedValueOnce(new Error('quota exceeded'));

    await useSourceBinStore.getState().ingestConnectedItems([
      {
        id: 'source-image-1',
        nodeId: 'image-1',
        label: 'Generated still',
        kind: 'image',
        assetUrl: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
      },
    ]);

    const allItems = useSourceBinStore.getState().bins.flatMap((bin) => bin.items);
    expect(allItems).toEqual([
      expect.objectContaining({
        label: 'Generated still',
        kind: 'image',
        mimeType: 'image/png',
        assetUrl: 'data:image/png;base64,AAAA',
        originNodeId: 'image-1',
        sourceKey: 'image:image-1:data:image/png;base64,AAAA',
      }),
    ]);
    expect(allItems[0].assetId).toBeUndefined();
    expect(allItems[0].scratchFileName).toBeUndefined();
  });

  it('persists generated media through Android native storage before IndexedDB fallback', async () => {
    mocks.materializeAndroidSourceAsset.mockResolvedValueOnce({
      id: 'source-image-1',
      label: 'Generated still',
      kind: 'image',
      mimeType: 'image/png',
      assetUrl: 'capacitor://file:///storage/emulated/0/Documents/Signal Loom/Source Library/source-image-1.png',
      nativeFilePath: 'file:///storage/emulated/0/Documents/Signal Loom/Source Library/source-image-1.png',
      originNodeId: 'image-1',
      sourceKey: 'image:image-1:data:image/png;base64,AAAA',
      isGenerated: true,
      createdAt: 10,
    });

    await useSourceBinStore.getState().ingestConnectedItems([
      {
        id: 'source-image-1',
        nodeId: 'image-1',
        label: 'Generated still',
        kind: 'image',
        assetUrl: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
        isGenerated: true,
      },
    ]);

    const allItems = useSourceBinStore.getState().bins.flatMap((bin) => bin.items);
    expect(allItems).toEqual([
      expect.objectContaining({
        label: 'Generated still',
        kind: 'image',
        mimeType: 'image/png',
        nativeFilePath: 'file:///storage/emulated/0/Documents/Signal Loom/Source Library/source-image-1.png',
        assetUrl: 'capacitor://file:///storage/emulated/0/Documents/Signal Loom/Source Library/source-image-1.png',
      }),
    ]);
    expect(mocks.saveDataUrlAsset).not.toHaveBeenCalled();
    expect(mocks.saveImportedAsset).not.toHaveBeenCalled();
  });

  it('alerts when Android denies storage permission before keeping a temporary generated preview', async () => {
    const denied = new Error('denied');
    denied.name = 'AndroidSourceAssetPermissionError';
    mocks.materializeAndroidSourceAsset.mockRejectedValueOnce(denied);

    await useSourceBinStore.getState().ingestConnectedItems([
      {
        id: 'source-image-1',
        nodeId: 'image-1',
        label: 'Generated still',
        kind: 'image',
        assetUrl: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
      },
    ]);

    expect(mocks.showAlertDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Storage Permission Required',
      tone: 'warning',
    }));
    const fallbackItem = useSourceBinStore.getState().bins.flatMap((bin) => bin.items)[0];
    expect(fallbackItem).toEqual(expect.objectContaining({
      label: 'Generated still',
      assetUrl: 'data:image/png;base64,AAAA',
    }));
    expect(fallbackItem.assetId).toBeUndefined();
    expect(fallbackItem.nativeFilePath).toBeUndefined();
  });

  it('keeps imported media in the source bin if durable import persistence fails', async () => {
    mocks.saveImportedAsset.mockRejectedValueOnce(new Error('indexeddb failed'));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:source-bin-fallback'),
    });

    await useSourceBinStore.getState().importFiles([
      new File(['image bytes'], 'frame.png', { type: 'image/png' }),
    ]);

    const allItems2 = useSourceBinStore.getState().bins.flatMap((bin) => bin.items);
    expect(allItems2).toEqual([
      expect.objectContaining({
        label: 'frame.png',
        kind: 'image',
        mimeType: 'image/png',
        assetUrl: 'blob:source-bin-fallback',
      }),
    ]);
    expect(allItems2[0].assetId).toBeUndefined();
    expect(allItems2[0].scratchFileName).toBeUndefined();
  });

  it('restores file-backed project assets when IndexedDB asset lookup fails during project open', async () => {
    mocks.loadImportedAsset.mockRejectedValueOnce(new Error('Internal error opening backing store for indexedDB.open'));

    await useSourceBinStore.getState().restoreProjectSnapshot({
      dismissedSourceKeys: [],
      bins: [
        {
          id: 'default',
          name: 'Source Library',
          collapsed: false,
          createdAt: 1,
          items: [
            {
              id: 'panel-1',
              label: 'Issue 01 Page 13 Panel 05',
              kind: 'image',
              mimeType: 'image/jpeg',
              assetId: 'browser-cache-panel-1',
              assetUrl: 'signal-loom-asset://file/panel-path',
              nativeFilePath: '/home/cabewse/Documents/Loom Workspace/Comic Book/Issue 1.signal-loom-scratch/panel.jpg',
              pixelWidth: 1344,
              pixelHeight: 768,
              createdAt: 2,
              sourceKey: 'comic-panel:issue-01:p13-panel-05',
            },
          ],
        },
      ],
    });

    expect(useSourceBinStore.getState().bins[0].items[0]).toEqual(expect.objectContaining({
      id: 'panel-1',
      assetId: 'browser-cache-panel-1',
      assetUrl: 'signal-loom-asset://file/panel-path',
      nativeFilePath: '/home/cabewse/Documents/Loom Workspace/Comic Book/Issue 1.signal-loom-scratch/panel.jpg',
      pixelWidth: 1344,
      pixelHeight: 768,
      sourceKey: 'comic-panel:issue-01:p13-panel-05',
    }));
  });
});
