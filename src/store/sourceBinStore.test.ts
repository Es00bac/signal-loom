import { beforeEach, describe, expect, it } from 'vitest';
import { useSourceBinStore } from './sourceBinStore';

describe('source bin native file integration', () => {
  beforeEach(() => {
    useSourceBinStore.setState({
      items: [],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
    });
  });

  it('imports native media descriptors without converting them into browser asset records', async () => {
    await useSourceBinStore.getState().importNativeFiles([
      {
        id: 'native-video-1',
        label: 'clip.mp4',
        kind: 'video',
        mimeType: 'video/mp4',
        assetUrl: 'signal-loom-asset://file/encoded-path',
        nativeFilePath: '/mnt/xtra/project/clip.mp4',
        createdAt: 1,
      },
    ]);

    expect(useSourceBinStore.getState().items).toEqual([
      expect.objectContaining({
        id: 'native-video-1',
        assetUrl: 'signal-loom-asset://file/encoded-path',
        nativeFilePath: '/mnt/xtra/project/clip.mp4',
      }),
    ]);
  });

  it('preserves native asset URLs in project snapshots so reopen can find local media', async () => {
    await useSourceBinStore.getState().importNativeFiles([
      {
        id: 'native-audio-1',
        label: 'sound.wav',
        kind: 'audio',
        mimeType: 'audio/wav',
        assetUrl: 'signal-loom-asset://file/audio-path',
        nativeFilePath: '/mnt/xtra/project/sound.wav',
        scratchFileName: 'sound.wav',
        createdAt: 2,
      },
    ]);

    const snapshot = await useSourceBinStore.getState().exportProjectSnapshot();

    expect(snapshot.items[0]).toMatchObject({
      id: 'native-audio-1',
      assetUrl: 'signal-loom-asset://file/audio-path',
      nativeFilePath: '/mnt/xtra/project/sound.wav',
      scratchFileName: 'sound.wav',
    });
  });

  it('persists starred and collapsed source-bin item state through project snapshots', async () => {
    useSourceBinStore.setState({
      items: [
        {
          id: 'clip-1',
          label: 'clip.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
          assetUrl: 'signal-loom-asset://file/clip',
          nativeFilePath: '/mnt/xtra/project/clip.mp4',
          createdAt: 3,
          starred: true,
          collapsed: true,
        },
      ],
    });

    const snapshot = await useSourceBinStore.getState().exportProjectSnapshot();
    await useSourceBinStore.getState().restoreProjectSnapshot(undefined);
    await useSourceBinStore.getState().restoreProjectSnapshot(snapshot);

    expect(useSourceBinStore.getState().items[0]).toMatchObject({
      id: 'clip-1',
      starred: true,
      collapsed: true,
    });
  });

  it('can star and collapse individual source-bin items plus collapse or expand all items', () => {
    useSourceBinStore.setState({
      items: [
        { id: 'a', label: 'A', kind: 'video', createdAt: 1 },
        { id: 'b', label: 'B', kind: 'audio', createdAt: 2 },
      ],
    });

    useSourceBinStore.getState().toggleItemStarred('b');
    useSourceBinStore.getState().setItemCollapsed('a', true);
    useSourceBinStore.getState().setAllItemsCollapsed(true);

    expect(useSourceBinStore.getState().items).toEqual([
      expect.objectContaining({ id: 'a', collapsed: true }),
      expect.objectContaining({ id: 'b', starred: true, collapsed: true }),
    ]);

    useSourceBinStore.getState().toggleItemStarred('b');
    useSourceBinStore.getState().setAllItemsCollapsed(false);

    expect(useSourceBinStore.getState().items).toEqual([
      expect.objectContaining({ id: 'a', collapsed: false }),
      expect.objectContaining({ id: 'b', starred: false, collapsed: false }),
    ]);
  });
});
