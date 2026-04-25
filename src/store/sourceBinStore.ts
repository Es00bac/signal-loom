import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  deleteImportedAsset,
  loadImportedAsset,
  loadImportedAssetAsDataUrl,
  loadImportedAssetBlob,
  saveDataUrlAsset,
  saveImportedAsset,
} from '../lib/assetStore';
import {
  loadScratchAssetBlob,
  storeScratchAssetBlob,
} from '../lib/fileSystemWorkspace';
import { localizeAssetForProject } from '../lib/sourceBinPersistence';
import type { EditorSourceKind } from '../types/flow';
import type { SourceBinItem } from '../lib/sourceBin';
import { takePendingSourceBinIngestItems } from '../lib/sourceBinIngest';

export interface SourceBinLibraryItem {
  id: string;
  label: string;
  kind: EditorSourceKind;
  mimeType?: string;
  assetId?: string;
  assetUrl?: string;
  scratchFileName?: string;
  nativeFilePath?: string;
  text?: string;
  createdAt: number;
  sourceKey?: string;
  originNodeId?: string;
  starred?: boolean;
  collapsed?: boolean;
}

export interface SourceBinProjectSnapshot {
  items: Array<SourceBinLibraryItem & { assetUrl?: string }>;
  dismissedSourceKeys: string[];
}

interface SourceBinState {
  items: SourceBinLibraryItem[];
  dismissedSourceKeys: string[];
  sidebarOpen: boolean;
  scratchDirectoryHandle?: FileSystemDirectoryHandle;
  nativeScratchDirectoryPath?: string;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setScratchDirectoryHandle: (scratchDirectoryHandle: FileSystemDirectoryHandle | undefined) => void;
  setNativeScratchDirectoryPath: (nativeScratchDirectoryPath: string | undefined) => void;
  migrateAssetsToScratch: (scratchDirectoryHandle: FileSystemDirectoryHandle) => Promise<number>;
  hydrateAssets: () => Promise<void>;
  exportProjectSnapshot: (options?: { includeAssetData?: boolean }) => Promise<SourceBinProjectSnapshot>;
  restoreProjectSnapshot: (snapshot?: SourceBinProjectSnapshot) => Promise<void>;
  addAssetItem: (item: {
    id?: string;
    label: string;
    kind: Exclude<EditorSourceKind, 'text'>;
    mimeType: string;
    dataUrl: string;
    sourceKey?: string;
    originNodeId?: string;
  }) => Promise<SourceBinLibraryItem>;
  ingestConnectedItems: (items: SourceBinItem[]) => Promise<void>;
  importFiles: (files: File[] | FileList) => Promise<void>;
  importNativeFiles: (items: Array<SourceBinLibraryItem & { nativeFilePath?: string }>) => Promise<void>;
  toggleItemStarred: (id: string) => void;
  setItemCollapsed: (id: string, collapsed: boolean) => void;
  setAllItemsCollapsed: (collapsed: boolean) => void;
  removeItem: (id: string) => SourceBinLibraryItem | undefined;
}

const STORAGE_KEY = 'flow-global-source-bin';
const pendingConnectedSourceKeys = new Set<string>();

export const useSourceBinStore = create<SourceBinState>()(
  persist(
    (set, get) => ({
      items: [],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setScratchDirectoryHandle: (scratchDirectoryHandle) => set({ scratchDirectoryHandle }),
      setNativeScratchDirectoryPath: (nativeScratchDirectoryPath) => set({ nativeScratchDirectoryPath }),
      migrateAssetsToScratch: async (scratchDirectoryHandle) => {
        const nextItems: SourceBinLibraryItem[] = [];
        let migratedCount = 0;

        for (const item of get().items) {
          if (item.kind === 'text' || item.scratchFileName) {
            nextItems.push(item);
            continue;
          }

          const blob = item.assetId
            ? (await loadImportedAssetBlob(item.assetId))?.blob
            : item.assetUrl
              ? await assetUrlToBlob(item.assetUrl, item.mimeType)
              : undefined;

          if (!blob) {
            nextItems.push(item);
            continue;
          }

          const stored = await storeScratchAssetBlob({
            scratchDirectoryHandle,
            item,
            blob,
          });

          if (item.assetId) {
            await deleteImportedAsset(item.assetId).catch(() => undefined);
          }

          migratedCount += 1;
          nextItems.push({
            ...item,
            assetId: undefined,
            assetUrl: stored.assetUrl,
            scratchFileName: stored.fileName,
          });
        }

        set({
          scratchDirectoryHandle,
          items: nextItems,
        });
        return migratedCount;
      },
      hydrateAssets: async () => {
        const hydratedItems = await Promise.all(
          get().items.map(async (item) => {
            const scratchDirectoryHandle = get().scratchDirectoryHandle;

            if (item.scratchFileName && scratchDirectoryHandle) {
              const file = await loadScratchAssetBlob(scratchDirectoryHandle, item.scratchFileName).catch(() => undefined);

              if (file) {
                return {
                  ...item,
                  assetUrl: URL.createObjectURL(file),
                  mimeType: file.type || item.mimeType,
                };
              }
            }

            if (!item.assetId) {
              return item;
            }

            const storedAsset = await loadImportedAsset(item.assetId);

            return {
              ...item,
              assetUrl: storedAsset?.dataUrl,
              mimeType: storedAsset?.mimeType ?? item.mimeType,
              label: storedAsset?.name ?? item.label,
            };
          }),
        );

        set({ items: hydratedItems });
      },
      exportProjectSnapshot: async (options) => {
        const includeAssetData = Boolean(options?.includeAssetData);
        const exportedItems = await Promise.all(
          get().items.map(async (item) => {
            if (item.kind === 'text') {
              return {
                id: item.id,
                label: item.label,
                kind: item.kind,
                mimeType: item.mimeType,
                assetId: item.assetId,
                scratchFileName: item.scratchFileName,
                nativeFilePath: item.nativeFilePath,
                assetUrl: undefined,
                text: item.text,
                createdAt: item.createdAt,
                sourceKey: item.sourceKey,
                originNodeId: item.originNodeId,
                starred: item.starred,
                collapsed: item.collapsed,
              };
            }

            const assetDataUrl = includeAssetData ? await loadItemAsDataUrl(item, get().scratchDirectoryHandle) : undefined;

            return {
              id: item.id,
              label: item.label,
              kind: item.kind,
              mimeType: item.mimeType,
              assetId: item.assetId,
              scratchFileName: item.scratchFileName,
              nativeFilePath: item.nativeFilePath,
              assetUrl: includeAssetData
                ? assetDataUrl ?? item.assetUrl
                : item.nativeFilePath
                  ? item.assetUrl
                  : item.assetId || item.scratchFileName
                    ? undefined
                    : item.assetUrl,
              text: item.text,
              createdAt: item.createdAt,
              sourceKey: item.sourceKey,
              originNodeId: item.originNodeId,
              starred: item.starred,
              collapsed: item.collapsed,
            };
          }),
        );

        return {
          items: exportedItems,
          dismissedSourceKeys: [...get().dismissedSourceKeys],
        };
      },
      restoreProjectSnapshot: async (snapshot) => {
        if (!snapshot) {
          set({ items: [], dismissedSourceKeys: [] });
          return;
        }

        const restoredItems = await Promise.all(
          (Array.isArray(snapshot.items) ? snapshot.items : []).map(async (item) => {
            if (item.kind === 'text') {
              return {
                id: item.id,
                label: item.label,
                kind: item.kind,
                mimeType: item.mimeType,
                scratchFileName: item.scratchFileName,
                nativeFilePath: item.nativeFilePath,
                assetUrl: undefined,
                text: item.text,
                createdAt: item.createdAt,
                sourceKey: item.sourceKey,
                originNodeId: item.originNodeId,
                starred: Boolean(item.starred),
                collapsed: Boolean(item.collapsed),
              } satisfies SourceBinLibraryItem;
            }

            const scratchDirectoryHandle = get().scratchDirectoryHandle;

            if (item.scratchFileName && scratchDirectoryHandle) {
              const file = await loadScratchAssetBlob(scratchDirectoryHandle, item.scratchFileName).catch(() => undefined);

              if (file) {
                return {
                  id: item.id,
                  label: item.label,
                  kind: item.kind,
                  mimeType: file.type || item.mimeType,
                  scratchFileName: item.scratchFileName,
                  nativeFilePath: item.nativeFilePath,
                  assetUrl: URL.createObjectURL(file),
                  text: item.text,
                  createdAt: item.createdAt,
                  sourceKey: item.sourceKey,
                  originNodeId: item.originNodeId,
                  starred: Boolean(item.starred),
                  collapsed: Boolean(item.collapsed),
                } satisfies SourceBinLibraryItem;
              }
            }

            if (item.assetId) {
              const storedAsset = await loadImportedAsset(item.assetId);

              if (storedAsset) {
                return {
                  id: item.id,
                  label: item.label,
                  kind: item.kind,
                  mimeType: storedAsset.mimeType,
                  assetId: item.assetId,
                  scratchFileName: item.scratchFileName,
                  nativeFilePath: item.nativeFilePath,
                  assetUrl: storedAsset.dataUrl,
                  text: item.text,
                  createdAt: item.createdAt,
                  sourceKey: item.sourceKey,
                  originNodeId: item.originNodeId,
                  starred: Boolean(item.starred),
                  collapsed: Boolean(item.collapsed),
                } satisfies SourceBinLibraryItem;
              }
            }

            if (!item.assetUrl) {
              return undefined;
            }

            if (item.nativeFilePath) {
              return {
                id: item.id,
                label: item.label,
                kind: item.kind,
                mimeType: item.mimeType ?? getDefaultMimeType(item.kind),
                scratchFileName: item.scratchFileName,
                nativeFilePath: item.nativeFilePath,
                assetUrl: item.assetUrl,
                text: item.text,
                createdAt: item.createdAt,
                sourceKey: item.sourceKey,
                originNodeId: item.originNodeId,
                starred: Boolean(item.starred),
                collapsed: Boolean(item.collapsed),
              } satisfies SourceBinLibraryItem;
            }

            return persistLibraryAssetItem({
              id: item.id,
              label: item.label,
              kind: item.kind,
              mimeType: item.mimeType ?? getDefaultMimeType(item.kind),
              dataUrl: item.assetUrl,
              sourceKey: item.sourceKey,
              originNodeId: item.originNodeId,
              createdAt: item.createdAt,
              starred: Boolean(item.starred),
              collapsed: Boolean(item.collapsed),
            }, get().scratchDirectoryHandle);
          }),
        );

        set({
          items: restoredItems.filter((item): item is SourceBinLibraryItem => Boolean(item)),
          dismissedSourceKeys: Array.isArray(snapshot.dismissedSourceKeys) ? [...snapshot.dismissedSourceKeys] : [],
        });
      },
      addAssetItem: async (item) => {
        const nextItem = await persistLibraryAssetItem(item, get().scratchDirectoryHandle);

        set((state) => ({ items: [nextItem, ...state.items] }));
        return nextItem;
      },
      ingestConnectedItems: async (connectedItems) => {
        const initialState = get();
        const pendingItems = takePendingSourceBinIngestItems(connectedItems, {
          dismissedSourceKeys: new Set(initialState.dismissedSourceKeys),
          existingSourceKeys: new Set(
            initialState.items
              .map((item) => item.sourceKey)
              .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
          ),
          pendingSourceKeys: pendingConnectedSourceKeys,
        });
        const savedItems: SourceBinLibraryItem[] = [];

        try {
          for (const { item, sourceKey } of pendingItems) {
            try {
              if (item.kind === 'text' && item.text) {
                savedItems.push({
                  id: globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`,
                  label: item.label,
                  kind: 'text',
                  text: item.text,
                  createdAt: Date.now(),
                  sourceKey,
                  originNodeId: item.nodeId,
                });
                continue;
              }

              if (!item.assetUrl) {
                continue;
              }

              const mimeType = item.mimeType ?? getDefaultMimeType(item.kind);
              savedItems.push(await persistLibraryAssetItem({
                label: item.label,
                kind: item.kind as Exclude<EditorSourceKind, 'text'>,
                mimeType,
                dataUrl: item.assetUrl,
                sourceKey,
                originNodeId: item.nodeId,
              }, get().scratchDirectoryHandle));
            } catch {
              // Failed media localization can retry on the next stable ingest pass.
              continue;
            }
          }

          if (savedItems.length === 0) {
            return;
          }

          set((state) => {
            const dismissedSourceKeys = new Set(state.dismissedSourceKeys);
            const currentSourceKeys = new Set(
              state.items
                .map((item) => item.sourceKey)
                .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
            );
            const uniqueSavedItems = savedItems.filter((item) => {
              if (!item.sourceKey || dismissedSourceKeys.has(item.sourceKey) || currentSourceKeys.has(item.sourceKey)) {
                return false;
              }

              currentSourceKeys.add(item.sourceKey);
              return true;
            });

            return uniqueSavedItems.length > 0
              ? { items: [...uniqueSavedItems.reverse(), ...state.items] }
              : state;
          });
        } finally {
          for (const pendingItem of pendingItems) {
            pendingConnectedSourceKeys.delete(pendingItem.sourceKey);
          }
        }
      },
      importFiles: async (files) => {
        const fileList = Array.from(files);
        const importedItems = [...get().items];

        for (const file of fileList) {
          const kind = inferSourceKindFromMimeType(file.type);

          if (!kind) {
            continue;
          }

          const id = globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`;
          const scratchDirectoryHandle = get().scratchDirectoryHandle;
          const storedAsset = scratchDirectoryHandle
            ? await storeScratchAssetBlob({
                scratchDirectoryHandle,
                item: {
                  id,
                  label: file.name,
                  kind,
                  mimeType: file.type || getDefaultMimeType(kind),
                },
                blob: file,
              })
            : await saveImportedAsset(file);
          importedItems.unshift({
            id,
            label: file.name,
            kind,
            mimeType: file.type || getDefaultMimeType(kind),
            assetId: scratchDirectoryHandle ? undefined : 'id' in storedAsset ? storedAsset.id : undefined,
            scratchFileName: scratchDirectoryHandle && 'fileName' in storedAsset ? storedAsset.fileName : undefined,
            assetUrl: 'assetUrl' in storedAsset ? storedAsset.assetUrl : storedAsset.dataUrl,
            createdAt: Date.now(),
          });
        }

        set({ items: importedItems });
      },
      importNativeFiles: async (items) => {
        set((state) => {
          const existingIds = new Set(state.items.map((item) => item.id));
          const existingNativePaths = new Set(
            state.items.map((item) => item.nativeFilePath).filter((value): value is string => Boolean(value)),
          );
          const nextItems = items.flatMap<SourceBinLibraryItem>((item) => {
            if (!item.assetUrl || existingIds.has(item.id) || (item.nativeFilePath && existingNativePaths.has(item.nativeFilePath))) {
              return [];
            }

            existingIds.add(item.id);

            if (item.nativeFilePath) {
              existingNativePaths.add(item.nativeFilePath);
            }

            return [{
              id: item.id,
              label: item.label,
              kind: item.kind,
              mimeType: item.mimeType ?? getDefaultMimeType(item.kind),
              assetUrl: item.assetUrl,
              scratchFileName: item.scratchFileName,
              nativeFilePath: item.nativeFilePath,
              text: item.text,
              createdAt: item.createdAt ?? Date.now(),
              sourceKey: item.sourceKey,
              originNodeId: item.originNodeId,
              starred: item.starred,
              collapsed: item.collapsed,
            }];
          });

          return nextItems.length > 0 ? { items: [...nextItems, ...state.items] } : state;
        });
      },
      toggleItemStarred: (id) =>
        set((state) => ({
          items: state.items.map((item) => (
            item.id === id ? { ...item, starred: !item.starred } : item
          )),
        })),
      setItemCollapsed: (id, collapsed) =>
        set((state) => ({
          items: state.items.map((item) => (
            item.id === id ? { ...item, collapsed } : item
          )),
        })),
      setAllItemsCollapsed: (collapsed) =>
        set((state) => ({
          items: state.items.map((item) => ({ ...item, collapsed })),
        })),
      removeItem: (id) => {
        const existingItem = get().items.find((item) => item.id === id);

        if (!existingItem) {
          return undefined;
        }

        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          dismissedSourceKeys:
            existingItem.sourceKey && !state.dismissedSourceKeys.includes(existingItem.sourceKey)
              ? [...state.dismissedSourceKeys, existingItem.sourceKey]
              : state.dismissedSourceKeys,
        }));

        return existingItem;
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        dismissedSourceKeys: state.dismissedSourceKeys,
        nativeScratchDirectoryPath: state.nativeScratchDirectoryPath,
        items: state.items.map((item) => ({
          id: item.id,
          label: item.label,
          kind: item.kind,
          mimeType: item.mimeType,
          assetId: item.assetId,
          scratchFileName: item.scratchFileName,
          nativeFilePath: item.nativeFilePath,
          assetUrl: item.nativeFilePath ? item.assetUrl : undefined,
          text: item.text,
          createdAt: item.createdAt,
          sourceKey: item.sourceKey,
          originNodeId: item.originNodeId,
          starred: item.starred,
          collapsed: item.collapsed,
        })),
      }),
    },
  ),
);

function inferSourceKindFromMimeType(mimeType: string): Extract<EditorSourceKind, 'image' | 'video' | 'audio'> | undefined {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  return undefined;
}

function getDefaultMimeType(kind: EditorSourceKind): string {
  switch (kind) {
    case 'image':
      return 'image/png';
    case 'video':
    case 'composition':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    case 'text':
      return 'text/plain';
  }
}

function normalizeAssetLabel(label: string, kind: EditorSourceKind, mimeType: string): string {
  if (label.includes('.')) {
    return label;
  }

  const extension = mimeType.split('/')[1]?.replace('mpeg', 'mp3') ?? getDefaultExtension(kind);
  return `${label}.${extension}`;
}

function getDefaultExtension(kind: EditorSourceKind): string {
  switch (kind) {
    case 'image':
      return 'png';
    case 'video':
    case 'composition':
      return 'mp4';
    case 'audio':
      return 'mp3';
    case 'text':
      return 'txt';
  }
}

async function persistLibraryAssetItem(item: {
  id?: string;
  label: string;
  kind: Exclude<EditorSourceKind, 'text'>;
  mimeType: string;
  dataUrl: string;
  sourceKey?: string;
  originNodeId?: string;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
}, scratchDirectoryHandle?: FileSystemDirectoryHandle): Promise<SourceBinLibraryItem> {
  if (scratchDirectoryHandle) {
    const id = item.id ?? globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`;
    const blob = await assetUrlToBlob(item.dataUrl, item.mimeType);
    const storedAsset = await storeScratchAssetBlob({
      scratchDirectoryHandle,
      item: {
        id,
        label: item.label,
        kind: item.kind,
        mimeType: item.mimeType,
      },
      blob,
    });

    return {
      id,
      label: item.label,
      kind: item.kind,
      mimeType: blob.type || item.mimeType,
      scratchFileName: storedAsset.fileName,
      assetUrl: storedAsset.assetUrl,
      createdAt: item.createdAt ?? Date.now(),
      sourceKey: item.sourceKey,
      originNodeId: item.originNodeId,
      starred: item.starred,
      collapsed: item.collapsed,
    };
  }

  const localizedAsset = await localizeAssetForProject(item.dataUrl, item.mimeType);
  const storedAsset = await saveDataUrlAsset({
    name: normalizeAssetLabel(item.label, item.kind, localizedAsset.mimeType),
    mimeType: localizedAsset.mimeType,
    dataUrl: localizedAsset.dataUrl,
  });

  return {
    id: item.id ?? globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`,
    label: item.label,
    kind: item.kind,
    mimeType: localizedAsset.mimeType,
    assetId: storedAsset.id,
    assetUrl: storedAsset.dataUrl,
    createdAt: item.createdAt ?? Date.now(),
    sourceKey: item.sourceKey,
    originNodeId: item.originNodeId,
    starred: item.starred,
    collapsed: item.collapsed,
  };
}

async function loadItemAsDataUrl(
  item: SourceBinLibraryItem,
  scratchDirectoryHandle?: FileSystemDirectoryHandle,
): Promise<string | undefined> {
  if (item.scratchFileName && scratchDirectoryHandle) {
    const file = await loadScratchAssetBlob(scratchDirectoryHandle, item.scratchFileName).catch(() => undefined);
    return file ? blobToDataUrl(file) : undefined;
  }

  if (item.assetId) {
    return (await loadImportedAssetAsDataUrl(item.assetId))?.dataUrl;
  }

  if (item.nativeFilePath && item.assetUrl) {
    const blob = await assetUrlToBlob(item.assetUrl, item.mimeType).catch(() => undefined);
    return blob ? blobToDataUrl(blob) : item.assetUrl;
  }

  return item.assetUrl;
}

async function assetUrlToBlob(url: string, fallbackMimeType?: string): Promise<Blob> {
  const response = await fetch(url);
  const blob = await response.blob();

  if (blob.type || !fallbackMimeType) {
    return blob;
  }

  return new Blob([blob], { type: fallbackMimeType });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Failed to convert the scratch asset into a data URL.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The scratch asset could not be converted into a data URL.'));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}
