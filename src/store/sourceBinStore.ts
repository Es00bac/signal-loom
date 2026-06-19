import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  deleteImportedAsset,
  loadImportedAsset,
  loadImportedAssetAsDataUrl,
  loadImportedAssetBlob,
  saveDataUrlAsset,
  saveImportedAsset,
  type StoredAssetPayload,
} from '../lib/assetStore';
import {
  loadScratchAssetBlob,
  storeScratchAssetBlob,
} from '../lib/fileSystemWorkspace';
import {
  isAndroidSourceAssetPermissionError,
  materializeAndroidSourceAsset,
} from '../lib/androidSourceAssetStorage';
import { buildMediaAssetSignaturePart } from '../lib/mediaAssetSignature';
import { parseSignalLoomAssetId } from '../lib/signalLoomAssetUrl';
import { getSignalLoomNativeBridge } from '../lib/nativeApp';
import {
  applySourceLibraryNativeChange,
  buildSourceLibraryNativeSyncStatus,
  sourceLibraryNativeAckNeedsRepair,
  type SourceLibraryNativeAckResult,
  type SourceLibraryNativeChange,
  type SourceLibraryNativeSyncStatus,
} from '../lib/sourceLibraryNativeSync';
import { localizeAssetForProject } from '../lib/sourceBinPersistence';
import type { EditorSourceKind } from '../types/flow';
import type { SourceBinItem } from '../lib/sourceBin';
import {
  takePendingSourceBinIngestItems,
  buildConnectedItemSourceKey,
} from '../lib/sourceBinIngest';
import {
  getDefaultMimeTypeForKind,
  inferDownloadExtension,
  inferMimeTypeFromFile,
  inferSourceKindFromFile,
} from '../lib/mediaFormatRegistry';
import { createSourceAssetHandlePool } from '../lib/sourceAssetHandlePool';
import { postWorkspaceWindowCommand } from '../lib/workspaceWindowCommands';
import {
  createSourceBin,
  getAllSourceBinItems,
  removeSourceBin,
  renameSourceBin,
  setSourceBinCollapsed,
} from './sourceBin/slices/libraryActions';
import {
  removeSourceBinItem,
  renameSourceBinItem,
  setSourceBinEnvelopeCollapsed,
  setAllSourceBinItemsCollapsed,
  setSourceBinItemCollapsed,
  toggleSourceBinItemStarred,
} from './sourceBin/slices/itemActions';
import { showAlertDialog } from './alertDialogStore';

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
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt: number;
  sourceKey?: string;
  originNodeId?: string;
  starred?: boolean;
  collapsed?: boolean;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
  isGenerated?: boolean;
}

export interface SourceBin {
  id: string;
  name: string;
  items: SourceBinLibraryItem[];
  collapsed: boolean;
  createdAt: number;
}

export interface SourceBinProjectSnapshot {
  bins?: Array<SourceBin & { items: Array<SourceBinLibraryItem & { assetUrl?: string }> }>;
  items?: Array<SourceBinLibraryItem & { assetUrl?: string }>;
  dismissedSourceKeys: string[];
}

export type PersistedSourceBinState = {
  bins?: SourceBin[];
  items?: SourceBinLibraryItem[];
  dismissedSourceKeys?: string[];
  sidebarOpen?: boolean;
  nativeScratchDirectoryPath?: string;
};

export interface SourceBinState {
  bins: SourceBin[];
  dismissedSourceKeys: string[];
  sidebarOpen: boolean;
  nativeSyncStatus: SourceLibraryNativeSyncStatus;
  scratchDirectoryHandle?: FileSystemDirectoryHandle;
  nativeScratchDirectoryPath?: string;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setNativeSyncStatus: (status: SourceLibraryNativeSyncStatus) => void;
  retryNativeSourceLibrarySync: () => void;
  setScratchDirectoryHandle: (scratchDirectoryHandle: FileSystemDirectoryHandle | undefined) => void;
  setNativeScratchDirectoryPath: (nativeScratchDirectoryPath: string | undefined) => void;
  migrateAssetsToScratch: (scratchDirectoryHandle: FileSystemDirectoryHandle) => Promise<number>;
  hydrateAssets: () => Promise<void>;
  reconcileWithNativeSourceLibrarySnapshot: () => Promise<void>;
  exportProjectSnapshot: (options?: { includeAssetData?: boolean }) => Promise<SourceBinProjectSnapshot>;
  restoreProjectSnapshot: (snapshot?: SourceBinProjectSnapshot, options?: { publishNative?: boolean }) => Promise<void>;
  getAllItems: () => SourceBinLibraryItem[];
  createBin: (name?: string) => string;
  renameBin: (id: string, name: string) => void;
  removeBin: (id: string) => void;
  setBinCollapsed: (id: string, collapsed: boolean) => void;
  addAssetItem: (item: {
    id?: string;
    label: string;
    kind: Exclude<EditorSourceKind, 'text'>;
    mimeType: string;
    dataUrl: string;
    blob?: Blob;
    pixelWidth?: number;
    pixelHeight?: number;
    isGenerated?: boolean;
    sourceKey?: string;
    originNodeId?: string;
    envelopeId?: string;
    envelopeLabel?: string;
    envelopeIndex?: number;
    envelopeCollapsed?: boolean;
  }, targetBinId?: string) => Promise<SourceBinLibraryItem>;
  ingestConnectedItems: (items: SourceBinItem[], targetBinId?: string) => Promise<void>;
  importFiles: (files: File[] | FileList, targetBinId?: string) => Promise<SourceBinLibraryItem[]>;
  importNativeFiles: (items: Array<SourceBinLibraryItem & { nativeFilePath?: string }>, targetBinId?: string) => Promise<void>;
  toggleItemStarred: (id: string) => void;
  renameItem: (id: string, label: string) => void;
  setItemCollapsed: (id: string, collapsed: boolean) => void;
  setEnvelopeCollapsed: (envelopeId: string, collapsed: boolean) => void;
  setAllItemsCollapsed: (collapsed: boolean) => void;
  removeItem: (id: string) => SourceBinLibraryItem | undefined;
  updateAssetItemData: (id: string, item: {
    label?: string;
    mimeType: string;
    dataUrl: string;
    pixelWidth?: number;
    pixelHeight?: number;
  }) => Promise<SourceBinLibraryItem>;
}

const STORAGE_KEY = 'flow-global-source-bin';
const pendingConnectedSourceKeys = new Set<string>();
const VALID_SOURCE_KINDS: readonly EditorSourceKind[] = ['text', 'image', 'video', 'audio', 'composition', 'document', 'subtitle', 'package'];
const TRANSIENT_RECOVERED_SCRATCH_BIN_ID = 'recovered-scratch-assets';
const TRANSIENT_RECOVERED_SCRATCH_SOURCE_KEY_PREFIX = 'recovered-scratch:';
const PROJECT_IMPORT_ENVELOPE_ID = 'project-imports';
const PROJECT_IMPORT_ENVELOPE_LABEL = 'Project imports';
let androidSourceAssetPermissionAlertOpen = false;
const revocableSourceAssetHandles = createSourceAssetHandlePool((url) => {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    // Object URL revocation is best-effort cleanup.
  }
});

function createDefaultBin(name = 'Source Library'): SourceBin {
  return {
    id: 'default',
    name,
    items: [],
    collapsed: false,
    createdAt: Date.now(),
  };
}

function buildSourceBinHydrationSignature(bins: SourceBin[]): string {
  return JSON.stringify(bins.map((bin) => ({
    id: bin.id,
    name: bin.name,
    collapsed: bin.collapsed,
    createdAt: bin.createdAt,
    items: bin.items.map((item) => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      mimeType: item.mimeType,
      assetId: item.assetId,
      assetUrl: item.assetUrl,
      scratchFileName: item.scratchFileName,
      nativeFilePath: item.nativeFilePath,
      text: item.text,
      createdAt: item.createdAt,
      sourceKey: item.sourceKey,
      originNodeId: item.originNodeId,
      isGenerated: item.isGenerated,
      starred: item.starred,
      collapsed: item.collapsed,
      envelopeId: item.envelopeId,
      envelopeLabel: item.envelopeLabel,
      envelopeIndex: item.envelopeIndex,
      envelopeCollapsed: item.envelopeCollapsed,
    })),
  })));
}

function collectRevocableObjectUrlItems(bins: SourceBin[]): Map<string, string> {
  return new Map(
    bins
      .flatMap((bin) => bin.items)
      .flatMap((item) => (
        isRevocableObjectUrl(item.assetUrl)
          ? [[item.id, item.assetUrl] as const]
          : []
      )),
  );
}

function syncRevocableObjectUrls(previousBins: SourceBin[], nextBins: SourceBin[]): void {
  const previousItems = collectRevocableObjectUrlItems(previousBins);
  const nextItems = collectRevocableObjectUrlItems(nextBins);

  for (const [itemId, url] of nextItems.entries()) {
    const previousUrl = previousItems.get(itemId);
    if (previousUrl && previousUrl !== url && !revocableSourceAssetHandles.has(itemId)) {
      revokeObjectUrl(previousUrl);
    }
    revocableSourceAssetHandles.replace(itemId, url);
  }

  for (const [itemId, url] of previousItems.entries()) {
    if (!nextItems.has(itemId)) {
      if (revocableSourceAssetHandles.has(itemId)) {
        revocableSourceAssetHandles.release(itemId);
      } else {
        revokeObjectUrl(url);
      }
    }
  }
}

function revokeSourceBinItemObjectUrl(item: SourceBinLibraryItem | undefined): void {
  if (isRevocableObjectUrl(item?.assetUrl)) {
    if (revocableSourceAssetHandles.has(item.id)) {
      revocableSourceAssetHandles.release(item.id);
      return;
    }
    revokeObjectUrl(item.assetUrl);
  }
}

function isRevocableObjectUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('blob:');
}

function revokeObjectUrl(url: string): void {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    // Object URL revocation is best-effort cleanup.
  }
}

function getNextEnvelopeIndex(items: readonly SourceBinLibraryItem[], envelopeId: string): number {
  return items.reduce((nextIndex, item) => {
    if (item.envelopeId !== envelopeId || item.envelopeIndex === undefined) {
      return nextIndex;
    }

    return Math.max(nextIndex, item.envelopeIndex + 1);
  }, 0);
}

function assignProjectImportEnvelopeMetadata(
  items: readonly SourceBinLibraryItem[],
  existingItems: readonly SourceBinLibraryItem[],
): SourceBinLibraryItem[] {
  let nextEnvelopeIndex = getNextEnvelopeIndex(existingItems, PROJECT_IMPORT_ENVELOPE_ID);

  return items.map((item) => {
    if (item.envelopeId) {
      return item;
    }

    const nextItem = {
      ...item,
      envelopeId: PROJECT_IMPORT_ENVELOPE_ID,
      envelopeLabel: PROJECT_IMPORT_ENVELOPE_LABEL,
      envelopeIndex: nextEnvelopeIndex,
    };
    nextEnvelopeIndex += 1;
    return nextItem;
  });
}

function broadcastSourceBinItemsAdded(items: SourceBinLibraryItem[], targetBinId?: string): void {
  if (items.length === 0) {
    return;
  }

  const change = {
    type: 'source-bin-items-added',
    items,
    ...(targetBinId ? { targetBinId } : {}),
  } satisfies SourceLibraryNativeChange;

  postWorkspaceWindowCommand(change);
  publishNativeSourceLibraryChange(change);
}

function broadcastSourceBinItemRenamed(itemId: string, label: string): void {
  const normalizedLabel = label.trim();
  if (!itemId.trim() || !normalizedLabel) {
    return;
  }

  const change = {
    type: 'source-bin-item-renamed',
    itemId,
    label: normalizedLabel,
  } satisfies SourceLibraryNativeChange;

  postWorkspaceWindowCommand(change);
  publishNativeSourceLibraryChange(change);
}

function broadcastSourceBinItemRemoved(item: SourceBinLibraryItem): void {
  const change = {
    type: 'source-bin-item-removed',
    itemId: item.id,
    ...(item.sourceKey ? { sourceKey: item.sourceKey } : {}),
  } satisfies SourceLibraryNativeChange;

  postWorkspaceWindowCommand(change);
  publishNativeSourceLibraryChange(change);
}

function syncNativeSourceLibrarySnapshot(snapshot: SourceBinProjectSnapshot): void {
  const bridge = getSignalLoomNativeBridge();
  if (!bridge?.syncSourceLibrarySnapshot) {
    return;
  }

  setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('syncing', {
    message: 'Syncing Source Library snapshot with native windows.',
  }));

  void bridge.syncSourceLibrarySnapshot(snapshot)
    .then((result) => {
      if (sourceLibraryNativeAckNeedsRepair(result)) {
        setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
          message: describeNativeSourceLibraryAckFailure(result, 'Native Source Library snapshot sync was rejected.'),
          repairDirection: 'push-renderer-snapshot',
        }));
        return;
      }

      setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('synced', {
        lastAckVersion: result.version,
        message: 'Source Library snapshot synced with native windows.',
      }));
    })
    .catch((error) => {
      setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', { error }));
    });
}

function publishNativeSourceLibraryChange(change: SourceLibraryNativeChange): void {
  const bridge = getSignalLoomNativeBridge();
  if (!bridge?.applySourceLibraryChange) {
    return;
  }

  setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('syncing', {
    message: 'Sending Source Library change to native windows.',
  }));

  void bridge.applySourceLibraryChange(change)
    .then((result) => {
      if (sourceLibraryNativeAckNeedsRepair(result)) {
        return repairNativeSourceLibrarySnapshot(describeNativeSourceLibraryAckFailure(
          result,
          'Native Source Library change was not acknowledged.',
        ));
      }

      setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('synced', {
        lastAckVersion: result.version,
        message: 'Source Library change acknowledged by native windows.',
      }));
      return undefined;
    })
    .catch((error) => repairNativeSourceLibrarySnapshot(error));
}

function describeNativeSourceLibraryAckFailure(
  result: SourceLibraryNativeAckResult | undefined,
  fallback: string,
): string {
  return typeof result?.error === 'string' && result.error.trim() ? result.error : fallback;
}

function setNativeSourceLibrarySyncStatus(status: SourceLibraryNativeSyncStatus): void {
  useSourceBinStore.setState({ nativeSyncStatus: status });
}

async function repairNativeSourceLibrarySnapshot(reason: unknown): Promise<void> {
  const bridge = getSignalLoomNativeBridge();
  if (!bridge?.syncSourceLibrarySnapshot) {
    setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
      error: reason,
      message: 'Native Source Library bridge is unavailable.',
    }));
    return;
  }

  setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('repairing', {
    error: reason,
    message: 'Repairing native Source Library sync from the current project snapshot.',
    repairDirection: 'push-renderer-snapshot',
  }));

  try {
    const snapshot = await useSourceBinStore.getState().exportProjectSnapshot();
    const result = await bridge.syncSourceLibrarySnapshot(snapshot);
    if (sourceLibraryNativeAckNeedsRepair(result)) {
      setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
        message: describeNativeSourceLibraryAckFailure(result, 'Native Source Library snapshot repair was rejected.'),
        repairDirection: 'push-renderer-snapshot',
      }));
      return;
    }

    setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('synced', {
      lastAckVersion: result.version,
      message: 'Source Library sync repaired from the current project snapshot.',
    }));
  } catch (error) {
    setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', { error }));
  }
}

export const useSourceBinStore = create<SourceBinState>()(
  persist(
    (set, get) => ({
      bins: [createDefaultBin()],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      nativeSyncStatus: { state: 'idle' },
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setNativeSyncStatus: (nativeSyncStatus) => set({ nativeSyncStatus }),
      retryNativeSourceLibrarySync: () => {
        const currentStatus = get().nativeSyncStatus;
        if (currentStatus.repairDirection === 'pull-native-snapshot') {
          const bridge = getSignalLoomNativeBridge();
          if (!bridge?.getSourceLibrarySnapshot) {
            setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
              expectedNativeVersion: currentStatus.expectedNativeVersion,
              message: 'Native Source Library snapshot retry is unavailable.',
              repairDirection: 'pull-native-snapshot',
            }));
            return;
          }

          void bridge.getSourceLibrarySnapshot()
            .then((result) => {
              if (
                !result?.snapshot
                || (typeof currentStatus.expectedNativeVersion === 'number' && result.version < currentStatus.expectedNativeVersion)
              ) {
                throw new Error('Native Source Library snapshot retry returned a stale or empty snapshot.');
              }

              let repaired = false;
              useSourceBinStore.setState((state) => {
                const nextState = applySourceLibraryNativeChange({
                  bins: state.bins,
                  dismissedSourceKeys: state.dismissedSourceKeys,
                }, {
                  type: 'source-library-snapshot',
                  snapshot: result.snapshot,
                });

                repaired = nextState.bins !== state.bins || nextState.dismissedSourceKeys !== state.dismissedSourceKeys;
                return {
                  ...(repaired ? nextState : {}),
                  nativeSyncStatus: buildSourceLibraryNativeSyncStatus('synced', {
                    lastAckVersion: result.version,
                    message: 'Source Library repaired from native snapshot retry.',
                    repairDirection: 'pull-native-snapshot',
                  }),
                };
              });
              if (repaired) {
                void get().hydrateAssets();
              }
            })
            .catch((error) => {
              setNativeSourceLibrarySyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
                error,
                expectedNativeVersion: currentStatus.expectedNativeVersion,
                repairDirection: 'pull-native-snapshot',
              }));
            });
          return;
        }

        void repairNativeSourceLibrarySnapshot('Manual Source Library sync retry requested.');
      },
      setScratchDirectoryHandle: (scratchDirectoryHandle) => set({ scratchDirectoryHandle }),
      setNativeScratchDirectoryPath: (nativeScratchDirectoryPath) => set({ nativeScratchDirectoryPath }),
      getAllItems: () => getAllSourceBinItems(get().bins),
      createBin: (name) => {
        const bin = createSourceBin(name);
        set((state) => ({ bins: [...state.bins, bin] }));
        return bin.id;
      },
      renameBin: (id, name) =>
        set((state) => ({ bins: renameSourceBin(state.bins, id, name) })),
      removeBin: (id) =>
        set((state) => {
          const bins = removeSourceBin(state.bins, id);
          return bins ? { bins } : state;
        }),
      setBinCollapsed: (id, collapsed) =>
        set((state) => ({ bins: setSourceBinCollapsed(state.bins, id, collapsed) })),
      migrateAssetsToScratch: async (scratchDirectoryHandle) => {
        let migratedCount = 0;

        set((state) => {
          const nextBins = state.bins.map((bin) => {
            const nextItems: SourceBinLibraryItem[] = [];

            for (const item of bin.items) {
              if (item.kind === 'text' || item.scratchFileName) {
                nextItems.push(item);
                continue;
              }

              nextItems.push(item);
            }

            return { ...bin, items: nextItems };
          });

          return { scratchDirectoryHandle, bins: nextBins };
        });

        const state = get();
        const nextBins: SourceBin[] = [];

        for (const bin of state.bins) {
          const nextItems: SourceBinLibraryItem[] = [];

          for (const item of bin.items) {
            if (item.kind === 'text' || item.scratchFileName) {
              nextItems.push(item);
              continue;
            }

            const blob = item.assetId
              ? (await loadImportedAssetBlob(item.assetId).catch(() => undefined))?.blob
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

          nextBins.push({ ...bin, items: nextItems });
        }

        const previousBins = get().bins;
        set({ bins: nextBins });
        syncRevocableObjectUrls(previousBins, nextBins);
        return migratedCount;
      },
      hydrateAssets: async () => {
        const scratchDirectoryHandle = get().scratchDirectoryHandle;
        const startingBins = get().bins;
        const startingSignature = buildSourceBinHydrationSignature(startingBins);

        const nextBins = await Promise.all(
          startingBins.map(async (bin) => {
            const hydratedItems = await Promise.all(
              bin.items.map(async (item) => {
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

                // Resolve by assetId, or by the id embedded in a
                // `signal-loom-asset://asset/<id>` URL (that scheme only loads
                // natively on Electron — Android/web need the local bytes).
                const lookupId = item.assetId ?? parseSignalLoomAssetId(item.assetUrl);
                if (!lookupId) {
                  return item;
                }

                const storedAsset = await loadImportedAsset(lookupId).catch(() => undefined);

                if (!storedAsset) {
                  return item;
                }

                return {
                  ...item,
                  assetId: item.assetId ?? lookupId,
                  assetUrl: storedAsset.dataUrl,
                  mimeType: storedAsset.mimeType ?? item.mimeType,
                  label: storedAsset.name ?? item.label,
                };
              }),
            );

            return { ...bin, items: hydratedItems };
          }),
        );

        if (buildSourceBinHydrationSignature(get().bins) !== startingSignature) {
          return;
        }

        const previousBins = get().bins;
        set({ bins: nextBins });
        syncRevocableObjectUrls(previousBins, nextBins);
      },
      exportProjectSnapshot: async (options) => {
        const includeAssetData = Boolean(options?.includeAssetData);
        const exportedBins = await Promise.all(
          get().bins.map(async (bin) => {
            const exportedItems = await Promise.all(
              bin.items.map(async (item) => {
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
                    pixelWidth: item.pixelWidth,
                    pixelHeight: item.pixelHeight,
                    createdAt: item.createdAt,
            sourceKey: item.sourceKey,
            originNodeId: item.originNodeId,
            isGenerated: item.isGenerated,
            starred: item.starred,
            collapsed: item.collapsed,
            envelopeId: item.envelopeId,
                    envelopeLabel: item.envelopeLabel,
                    envelopeIndex: item.envelopeIndex,
                    envelopeCollapsed: item.envelopeCollapsed,
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
                  pixelWidth: item.pixelWidth,
                  pixelHeight: item.pixelHeight,
                  createdAt: item.createdAt,
                  sourceKey: item.sourceKey,
                  originNodeId: item.originNodeId,
                  isGenerated: item.isGenerated,
                  starred: item.starred,
                  collapsed: item.collapsed,
                  envelopeId: item.envelopeId,
                  envelopeLabel: item.envelopeLabel,
                  envelopeIndex: item.envelopeIndex,
                  envelopeCollapsed: item.envelopeCollapsed,
                };
              }),
            );

            return {
              id: bin.id,
              name: bin.name,
              items: exportedItems,
              collapsed: bin.collapsed,
              createdAt: bin.createdAt,
            };
          }),
        );

        return {
          bins: exportedBins,
          dismissedSourceKeys: [...get().dismissedSourceKeys],
        };
      },
      restoreProjectSnapshot: async (snapshot, options = {}) => {
        const publishNative = options.publishNative ?? true;
        if (!snapshot) {
          const previousBins = get().bins;
          const emptySnapshot = { bins: [createDefaultBin()], dismissedSourceKeys: [] };
          set(emptySnapshot);
          syncRevocableObjectUrls(previousBins, emptySnapshot.bins);
          if (publishNative) {
            syncNativeSourceLibrarySnapshot(emptySnapshot);
          }
          return;
        }

        const safeSnapshot = sanitizePersistedSourceBinState(snapshot);
        const snapshotBins: Array<SourceBin & { items: Array<SourceBinLibraryItem & { assetUrl?: string }> }> =
          Array.isArray(safeSnapshot.bins) && safeSnapshot.bins.length > 0
            ? safeSnapshot.bins
            : Array.isArray(safeSnapshot.items)
              ? [{ ...createDefaultBin(), items: safeSnapshot.items }]
              : [createDefaultBin()];

        const scratchDirectoryHandle = get().scratchDirectoryHandle;

        const restoredBins = await Promise.all(
          snapshotBins.map(async (bin) => {
            const restoredItems = await Promise.all(
              (Array.isArray(bin.items) ? bin.items : []).map(async (item) => {
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
                    pixelWidth: item.pixelWidth,
                    pixelHeight: item.pixelHeight,
                    createdAt: item.createdAt,
                    sourceKey: item.sourceKey,
                    originNodeId: item.originNodeId,
                    isGenerated: item.isGenerated,
                    starred: Boolean(item.starred),
                    collapsed: Boolean(item.collapsed),
                    envelopeId: item.envelopeId,
                    envelopeLabel: item.envelopeLabel,
                    envelopeIndex: item.envelopeIndex,
                    envelopeCollapsed: item.envelopeCollapsed,
                  } satisfies SourceBinLibraryItem;
                }

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
                      isGenerated: item.isGenerated,
                      starred: Boolean(item.starred),
                      collapsed: Boolean(item.collapsed),
                      envelopeId: item.envelopeId,
                      envelopeLabel: item.envelopeLabel,
                      envelopeIndex: item.envelopeIndex,
                      envelopeCollapsed: item.envelopeCollapsed,
                    } satisfies SourceBinLibraryItem;
                  }
                }

                // Resolve by assetId, or by the id in a `signal-loom-asset://asset/<id>`
                // URL — that scheme only loads on Electron, so Android/web items must
                // be backed by local bytes here or they render MISSING.
                const lookupId = item.assetId ?? parseSignalLoomAssetId(item.assetUrl);
                if (lookupId) {
                  const storedAsset = await loadImportedAsset(lookupId).catch(() => undefined);

                  if (storedAsset) {
                    return {
                      id: item.id,
                      label: item.label,
                      kind: item.kind,
                      mimeType: storedAsset.mimeType,
                      assetId: item.assetId ?? lookupId,
                      scratchFileName: item.scratchFileName,
                      nativeFilePath: item.nativeFilePath,
                      assetUrl: storedAsset.dataUrl,
                      text: item.text,
                      pixelWidth: item.pixelWidth,
                      pixelHeight: item.pixelHeight,
                      createdAt: item.createdAt,
                      sourceKey: item.sourceKey,
                      originNodeId: item.originNodeId,
                      isGenerated: item.isGenerated,
                      starred: Boolean(item.starred),
                      collapsed: Boolean(item.collapsed),
                      envelopeId: item.envelopeId,
                      envelopeLabel: item.envelopeLabel,
                      envelopeIndex: item.envelopeIndex,
                      envelopeCollapsed: item.envelopeCollapsed,
                    } satisfies SourceBinLibraryItem;
                  }
                }

                if (item.nativeFilePath || item.scratchFileName) {
                  return {
                    id: item.id,
                    label: item.label,
                    kind: item.kind,
                    mimeType: item.mimeType ?? getDefaultMimeType(item.kind),
                    assetId: item.assetId,
                    scratchFileName: item.scratchFileName,
                    nativeFilePath: item.nativeFilePath,
                    assetUrl: item.assetUrl,
                    text: item.text,
                    pixelWidth: item.pixelWidth,
                    pixelHeight: item.pixelHeight,
                      createdAt: item.createdAt,
                      sourceKey: item.sourceKey,
                      originNodeId: item.originNodeId,
                      isGenerated: item.isGenerated,
                      starred: Boolean(item.starred),
                      collapsed: Boolean(item.collapsed),
                      envelopeId: item.envelopeId,
                    envelopeLabel: item.envelopeLabel,
                    envelopeIndex: item.envelopeIndex,
                    envelopeCollapsed: item.envelopeCollapsed,
                  } satisfies SourceBinLibraryItem;
                }

                if (!item.assetUrl) {
                  return undefined;
                }

                return persistLibraryAssetItemWithFallback({
                  id: item.id,
                  label: item.label,
                  kind: item.kind,
                  mimeType: item.mimeType ?? getDefaultMimeType(item.kind),
                  dataUrl: item.assetUrl,
                  sourceKey: item.sourceKey,
                  originNodeId: item.originNodeId,
                  isGenerated: item.isGenerated,
                  pixelWidth: item.pixelWidth,
                  pixelHeight: item.pixelHeight,
                  createdAt: item.createdAt,
                  starred: Boolean(item.starred),
                  collapsed: Boolean(item.collapsed),
                  envelopeId: item.envelopeId,
                  envelopeLabel: item.envelopeLabel,
                  envelopeIndex: item.envelopeIndex,
                  envelopeCollapsed: item.envelopeCollapsed,
                }, scratchDirectoryHandle);
              }),
            );

            return {
              id: bin.id ?? globalThis.crypto?.randomUUID?.() ?? `bin-${Date.now()}`,
              name: bin.name || 'Source Library',
              items: restoredItems.filter((item): item is SourceBinLibraryItem => Boolean(item)),
              collapsed: Boolean(bin.collapsed),
              createdAt: bin.createdAt ?? Date.now(),
            };
          }),
        );

        const restoredSnapshot = {
          bins: restoredBins,
          dismissedSourceKeys: safeSnapshot.dismissedSourceKeys ?? [],
        };

        const previousBins = get().bins;
        set(restoredSnapshot);
        syncRevocableObjectUrls(previousBins, restoredBins);
        if (publishNative) {
          syncNativeSourceLibrarySnapshot(restoredSnapshot);
        }
      },
      reconcileWithNativeSourceLibrarySnapshot: async () => {
        // In the desktop multi-window app each workspace opens in its own window/store, and the
        // Source Library is a *global* resource whose authoritative state lives in the native main
        // process (`sourceLibrarySnapshot` = the project's saved bin + anything generated/added in
        // other windows since the last save). A freshly-opened window's `restoreProjectSnapshot`
        // replaces the Source Library with the *static* saved-project bin, which clobbers those
        // live cross-window assets. Re-apply the authoritative native snapshot so they survive.
        // No-op without the native bridge (web / mobile single-window — nothing to reconcile).
        const bridge = getSignalLoomNativeBridge();
        if (!bridge?.getSourceLibrarySnapshot) {
          return;
        }

        const result = await bridge.getSourceLibrarySnapshot().catch(() => undefined);
        if (!result?.snapshot || !(result.version > 0)) {
          return;
        }

        let changed = false;
        set((state) => {
          const nextState = applySourceLibraryNativeChange(
            { bins: state.bins, dismissedSourceKeys: state.dismissedSourceKeys },
            { type: 'source-library-snapshot', snapshot: result.snapshot },
          );
          changed = nextState.bins !== state.bins || nextState.dismissedSourceKeys !== state.dismissedSourceKeys;
          return changed ? nextState : {};
        });

        if (changed) {
          await get().hydrateAssets().catch(() => undefined);
        }
      },
      addAssetItem: async (item, targetBinId) => {
        const existingSourceKeyItem = item.sourceKey
          ? get().bins.flatMap((bin) => bin.items).find((candidate) => candidate.sourceKey === item.sourceKey)
          : undefined;
        const nextItem = await persistLibraryAssetItemWithFallback({
          ...item,
          id: existingSourceKeyItem?.id ?? item.id,
          createdAt: existingSourceKeyItem?.createdAt ?? Date.now(),
          starred: existingSourceKeyItem?.starred,
          collapsed: existingSourceKeyItem?.collapsed,
        }, get().scratchDirectoryHandle);
        let resultItem = nextItem;

        set((state) => {
          const targetIndex = targetBinId
            ? state.bins.findIndex((bin) => bin.id === targetBinId)
            : 0;
          const binIndex = targetIndex >= 0 ? targetIndex : 0;

          if (nextItem.sourceKey) {
            let didReplace = false;
            const bins = state.bins.map((bin) => {
              const items: SourceBinLibraryItem[] = [];

              for (const existingItem of bin.items) {
                if (existingItem.sourceKey !== nextItem.sourceKey) {
                  items.push(existingItem);
                  continue;
                }

                if (didReplace) {
                  revokeSourceBinItemObjectUrl(existingItem);
                  continue;
                }

                if (existingItem.assetUrl !== nextItem.assetUrl && existingItem.assetUrl?.startsWith('blob:')) {
                  revokeObjectUrl(existingItem.assetUrl);
                }

                resultItem = {
                  ...existingItem,
                  label: nextItem.label,
                  kind: nextItem.kind,
                  mimeType: nextItem.mimeType,
                  assetId: nextItem.assetId,
                  assetUrl: nextItem.assetUrl,
                  scratchFileName: nextItem.scratchFileName,
                  nativeFilePath: nextItem.nativeFilePath,
                  text: nextItem.text,
                  pixelWidth: nextItem.pixelWidth,
                  pixelHeight: nextItem.pixelHeight,
                  sourceKey: nextItem.sourceKey,
                  originNodeId: nextItem.originNodeId,
                  isGenerated: nextItem.isGenerated,
                  envelopeId: nextItem.envelopeId,
                  envelopeLabel: nextItem.envelopeLabel,
                  envelopeIndex: nextItem.envelopeIndex,
                  envelopeCollapsed: nextItem.envelopeCollapsed ?? existingItem.envelopeCollapsed,
                  createdAt: existingItem.createdAt,
                  starred: existingItem.starred,
                  collapsed: existingItem.collapsed,
                };
                items.push(resultItem);
                didReplace = true;
              }

              return items === bin.items ? bin : { ...bin, items };
            });

            if (didReplace) {
              return { bins };
            }
          }

          return {
            bins: state.bins.map((bin, index) =>
              index === binIndex ? { ...bin, items: [nextItem, ...bin.items] } : bin,
            ),
          };
        });

        broadcastSourceBinItemsAdded([resultItem], targetBinId);
        return resultItem;
      },
      ingestConnectedItems: async (connectedItems, targetBinId) => {
        const initialState = get();
        const allExistingItems = initialState.bins.flatMap((bin) => bin.items);

        // Check for existing library items that need their envelope metadata updated:
        const updatedItemsById = new Map<string, Partial<SourceBinLibraryItem>>();
        for (const connectedItem of connectedItems) {
          if (connectedItem.sourceBinItemId) {
            const existing = allExistingItems.find((x) => x.id === connectedItem.sourceBinItemId);
            if (existing) {
              const needsUpdate =
                existing.envelopeId !== connectedItem.envelopeId ||
                existing.envelopeLabel !== connectedItem.envelopeLabel ||
                existing.envelopeIndex !== connectedItem.envelopeIndex;

              if (needsUpdate) {
                updatedItemsById.set(existing.id, {
                  envelopeId: connectedItem.envelopeId,
                  envelopeLabel: connectedItem.envelopeLabel,
                  envelopeIndex: connectedItem.envelopeIndex,
                });
              }
            }
          }
        }

        if (updatedItemsById.size > 0) {
          set((state) => ({
            bins: state.bins.map((bin) => ({
              ...bin,
              items: bin.items.map((item) => {
                const patch = updatedItemsById.get(item.id);
                return patch ? { ...item, ...patch } : item;
              }),
            })),
          }));
        }

        // Check for envelope items in the library that are no longer routed to any source bin:
        const connectedEnvelopeIds = new Set(
          connectedItems
            .map((item) => item.envelopeId)
            .filter((id): id is string => Boolean(id))
        );

        // Track active keys and active IDs for each connected envelope
        const activeConnectedKeysByEnvelope = new Map<string, Set<string>>();
        const activeConnectedIdsByEnvelope = new Map<string, Set<string>>();

        for (const connectedItem of connectedItems) {
          if (!connectedItem.envelopeId) continue;

          if (!activeConnectedKeysByEnvelope.has(connectedItem.envelopeId)) {
            activeConnectedKeysByEnvelope.set(connectedItem.envelopeId, new Set());
          }
          const key = buildConnectedItemSourceKey(connectedItem);
          if (key) {
            activeConnectedKeysByEnvelope.get(connectedItem.envelopeId)!.add(key);
          }

          if (connectedItem.sourceBinItemId) {
            if (!activeConnectedIdsByEnvelope.has(connectedItem.envelopeId)) {
              activeConnectedIdsByEnvelope.set(connectedItem.envelopeId, new Set());
            }
            activeConnectedIdsByEnvelope.get(connectedItem.envelopeId)!.add(connectedItem.sourceBinItemId);
          }
        }

        const itemsToRemove = allExistingItems.filter((item) => {
          // If the item doesn't have an envelopeId, it wasn't ingested from an envelope. Keep it.
          if (!item.envelopeId) {
            return false;
          }

          // If the envelope itself is completely disconnected from any source bin, remove the item:
          if (!connectedEnvelopeIds.has(item.envelopeId)) {
            return true;
          }

          // The envelope is still connected.
          // Is this specific item still in the connected envelope?
          const activeKeys = activeConnectedKeysByEnvelope.get(item.envelopeId);
          const activeIds = activeConnectedIdsByEnvelope.get(item.envelopeId);

          const keyMatches = activeKeys && item.sourceKey && activeKeys.has(item.sourceKey);
          const idMatches = activeIds && activeIds.has(item.id);

          if (keyMatches || idMatches) {
            return false;
          }

          // Not found in the active connected items for this envelope, so remove it!
          return true;
        });

        if (itemsToRemove.length > 0) {
          set((state) => ({
            bins: state.bins.map((bin) => ({
              ...bin,
              items: bin.items.filter((item) => !itemsToRemove.some((x) => x.id === item.id)),
            })),
          }));
        }

        const pendingItems = takePendingSourceBinIngestItems(connectedItems, {
          existingItemIds: new Set(allExistingItems.map((item) => item.id)),
          existingSourceKeys: new Set(
            allExistingItems
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
                if (item.text.trim().startsWith('{') || item.text.trim().startsWith('[')) {
                  try {
                    const { parseSloomScriptToItems } = await import('../lib/sourceBinIngestScripts');
                    const scriptItems = parseSloomScriptToItems(item.text, item.label || 'Script');
                    for (const scriptItem of scriptItems) {
                      scriptItem.originNodeId = item.nodeId;
                      scriptItem.sourceKey = `${sourceKey}:${scriptItem.envelopeIndex}`;
                      savedItems.push(scriptItem);
                    }
                    continue;
                  } catch {
                    // Fall through and save as plain text
                  }
                }

                savedItems.push({
                  id: globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`,
                  label: item.label,
                  kind: 'text',
                  text: item.text,
                  createdAt: Date.now(),
                  sourceKey,
                  originNodeId: item.nodeId,
                  isGenerated: item.isGenerated,
                  envelopeId: item.envelopeId,
                  envelopeLabel: item.envelopeLabel,
                  envelopeIndex: item.envelopeIndex,
                  envelopeCollapsed: item.envelopeCollapsed,
                });
                continue;
              }

              if (!item.assetUrl) {
                continue;
              }

              const mimeType = item.mimeType ?? getDefaultMimeType(item.kind);
              savedItems.push(await persistLibraryAssetItemWithFallback({
                label: item.label,
                kind: item.kind as Exclude<EditorSourceKind, 'text'>,
                mimeType,
                dataUrl: item.assetUrl,
                sourceKey,
                originNodeId: item.nodeId,
                isGenerated: item.isGenerated,
                envelopeId: item.envelopeId,
                envelopeLabel: item.envelopeLabel,
                envelopeIndex: item.envelopeIndex,
                envelopeCollapsed: item.envelopeCollapsed,
              }, get().scratchDirectoryHandle));
            } catch {
              continue;
            }
          }

          if (savedItems.length === 0) {
            return;
          }

          let broadcastItems: SourceBinLibraryItem[] = [];

          set((state) => {
            const targetIndex = targetBinId
              ? state.bins.findIndex((bin) => bin.id === targetBinId)
              : 0;
            const binIndex = targetIndex >= 0 ? targetIndex : 0;

            const currentSourceKeys = new Set(
              state.bins
                .flatMap((bin) => bin.items)
                .map((item) => item.sourceKey)
                .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
            );
            const uniqueSavedItems = savedItems.filter((item) => {
              if (!item.sourceKey || currentSourceKeys.has(item.sourceKey)) {
                return false;
              }

              currentSourceKeys.add(item.sourceKey);
              return true;
            });

            if (uniqueSavedItems.length === 0) {
              return state;
            }

            broadcastItems = [...uniqueSavedItems];
            return {
              bins: state.bins.map((bin, index) =>
                index === binIndex
                  ? { ...bin, items: [...uniqueSavedItems.reverse(), ...bin.items] }
                  : bin,
              ),
            };
          });
          broadcastSourceBinItemsAdded(broadcastItems, targetBinId);
        } finally {
          for (const pendingItem of pendingItems) {
            pendingConnectedSourceKeys.delete(pendingItem.sourceKey);
          }
        }
      },
      importFiles: async (files, targetBinId) => {
        const fileList = Array.from(files);
        const importedItems: SourceBinLibraryItem[] = [];
        const scratchDirectoryHandle = get().scratchDirectoryHandle;

        for (const file of fileList) {
          if (file.name.toLowerCase().endsWith('.sloom-script') || file.name.toLowerCase().endsWith('.sloom-script.json')) {
            const text = await file.text().catch(() => undefined);
            if (text) {
              try {
                const { parseSloomScriptToItems } = await import('../lib/sourceBinIngestScripts');
                const items = parseSloomScriptToItems(text, file.name);
                importedItems.unshift(...items.reverse());
                continue;
              } catch {
                // fall through
              }
            }
          }

          const kind = inferSourceKindFromFile(file.name, file.type);

          if (!kind) {
            continue;
          }

          const id = globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`;
          const mimeType = file.type || inferMimeTypeFromFile(file.name, kind) || getDefaultMimeType(kind);
          const text = kind === 'document' && isBrowserTextDocument(file.name, mimeType)
            ? await file.text().catch(() => undefined)
            : undefined;

          try {
            const storedAsset = scratchDirectoryHandle
              ? await storeScratchAssetBlob({
                  scratchDirectoryHandle,
                  item: {
                    id,
                    label: file.name,
                    kind,
                    mimeType,
                  },
                  blob: file,
                })
              : await saveImportedAsset(file);
            importedItems.unshift({
              id,
              label: file.name,
              kind,
              mimeType,
              assetId: scratchDirectoryHandle ? undefined : 'id' in storedAsset ? storedAsset.id : undefined,
              scratchFileName: scratchDirectoryHandle && 'fileName' in storedAsset ? storedAsset.fileName : undefined,
              assetUrl: 'assetUrl' in storedAsset ? storedAsset.assetUrl : storedAsset.dataUrl,
              text,
              createdAt: Date.now(),
            });
          } catch {
            importedItems.unshift(createFallbackLibraryAssetItem({
              id,
              label: file.name,
              kind,
              mimeType,
              dataUrl: createObjectAssetUrl(file),
              text,
            }));
          }
        }

        let broadcastItems: SourceBinLibraryItem[] = [];
        set((state) => {
          const targetIndex = targetBinId
            ? state.bins.findIndex((bin) => bin.id === targetBinId)
            : 0;
          const binIndex = targetIndex >= 0 ? targetIndex : 0;
          const nextItems = assignProjectImportEnvelopeMetadata(
            importedItems,
            state.bins.flatMap((bin) => bin.items),
          );

          if (nextItems.length === 0) {
            return state;
          }

          broadcastItems = [...nextItems];

          return {
            bins: state.bins.map((bin, index) =>
              index === binIndex ? { ...bin, collapsed: false, items: [...nextItems, ...bin.items] } : bin,
            ),
          };
        });
        broadcastSourceBinItemsAdded(broadcastItems, targetBinId);
        return broadcastItems;
      },
      importNativeFiles: async (items, targetBinId) => {
        let broadcastItems: SourceBinLibraryItem[] = [];

        set((state) => {
          const targetIndex = targetBinId
            ? state.bins.findIndex((bin) => bin.id === targetBinId)
            : 0;
          const binIndex = targetIndex >= 0 ? targetIndex : 0;

          const allExistingItems = state.bins.flatMap((bin) => bin.items);
          const existingIds = new Set(allExistingItems.map((item) => item.id));
          const existingNativePaths = new Set(
            allExistingItems.map((item) => item.nativeFilePath).filter((value): value is string => Boolean(value)),
          );
          const rawNextItems = items.flatMap<SourceBinLibraryItem>((item) => {
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
              pixelWidth: item.pixelWidth,
              pixelHeight: item.pixelHeight,
              createdAt: item.createdAt ?? Date.now(),
              sourceKey: item.sourceKey,
              originNodeId: item.originNodeId,
              isGenerated: item.isGenerated,
              starred: item.starred,
              collapsed: item.collapsed,
                envelopeId: item.envelopeId,
                envelopeLabel: item.envelopeLabel,
                envelopeIndex: item.envelopeIndex,
                envelopeCollapsed: item.envelopeCollapsed,
              }];
          });
          const nextItems = assignProjectImportEnvelopeMetadata(rawNextItems, allExistingItems);

          if (nextItems.length === 0) {
            return state;
          }

          broadcastItems = [...nextItems];
          return {
            bins: state.bins.map((bin, index) =>
              index === binIndex ? { ...bin, items: [...nextItems, ...bin.items] } : bin,
            ),
          };
        });
        broadcastSourceBinItemsAdded(broadcastItems, targetBinId);
      },
      toggleItemStarred: (id) =>
        set((state) => {
          const bins = toggleSourceBinItemStarred(state.bins, id);
          return bins ? { bins } : state;
        }),
      renameItem: (id, label) => {
        let didRename = false;
        set((state) => {
          const bins = renameSourceBinItem(state.bins, id, label);
          didRename = Boolean(bins);
          return bins ? { bins } : state;
        });
        if (didRename) {
          broadcastSourceBinItemRenamed(id, label);
        }
      },
      setItemCollapsed: (id, collapsed) =>
        set((state) => {
          const bins = setSourceBinItemCollapsed(state.bins, id, collapsed);
          return bins ? { bins } : state;
        }),
      setEnvelopeCollapsed: (envelopeId, collapsed) =>
        set((state) => {
          const bins = setSourceBinEnvelopeCollapsed(state.bins, envelopeId, collapsed);
          return bins ? { bins } : state;
        }),
      setAllItemsCollapsed: (collapsed) =>
        set((state) => ({ bins: setAllSourceBinItemsCollapsed(state.bins, collapsed) })),
      removeItem: (id) => {
        const result = removeSourceBinItem(get().bins, id);

        if (!result) {
          return undefined;
        }

        set({ bins: result.bins });
        revokeSourceBinItemObjectUrl(result.removedItem);
        broadcastSourceBinItemRemoved(result.removedItem);

        // Notify flowStore to remove references to the deleted item:
        import('./flowStore').then(({ useFlowStore }) => {
          useFlowStore.getState().onSourceBinItemRemoved(id, result.removedItem);
        }).catch(() => {});

        return result.removedItem;
      },
      updateAssetItemData: async (id, itemUpdate) => {
        const persisted = await persistLibraryAssetItemWithFallback({
          label: itemUpdate.label ?? 'updated-asset',
          kind: 'image',
          mimeType: itemUpdate.mimeType,
          dataUrl: itemUpdate.dataUrl,
          pixelWidth: itemUpdate.pixelWidth,
          pixelHeight: itemUpdate.pixelHeight,
        }, get().scratchDirectoryHandle);

        let updatedItem: SourceBinLibraryItem | undefined = undefined;

        set((state) => {
          const bins = state.bins.map((bin) => {
            const index = bin.items.findIndex((it) => it.id === id);
            if (index < 0) return bin;

            const existingItem = bin.items[index];
            if (existingItem.assetUrl !== persisted.assetUrl && existingItem.assetUrl?.startsWith('blob:')) {
              revokeObjectUrl(existingItem.assetUrl);
            }

            const nextItem = {
              ...existingItem,
              label: itemUpdate.label ?? existingItem.label,
              mimeType: persisted.mimeType,
              assetUrl: persisted.assetUrl,
              scratchFileName: persisted.scratchFileName,
              nativeFilePath: persisted.nativeFilePath,
              pixelWidth: persisted.pixelWidth,
              pixelHeight: persisted.pixelHeight,
              createdAt: Date.now(),
            } satisfies SourceBinLibraryItem;
            updatedItem = nextItem;

            const items = [...bin.items];
            items[index] = nextItem;
            return { ...bin, items };
          });

          return { bins };
        });

        const resultItem = updatedItem || persisted;
        if (updatedItem) {
          broadcastSourceBinItemsAdded([updatedItem]);
        }
        return resultItem;
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      migrate: (persistedState, version) => {
        const persisted = sanitizePersistedSourceBinState(persistedState);
        if (version === 0 || !Array.isArray(persisted.bins)) {
          const oldItems = Array.isArray(persisted.items) ? persisted.items : [];
          return {
            ...persisted,
            sidebarOpen: persisted.sidebarOpen ?? true,
            dismissedSourceKeys: persisted.dismissedSourceKeys ?? [],
            nativeScratchDirectoryPath: persisted.nativeScratchDirectoryPath,
            bins: [{
              id: 'default',
              name: 'Source Library',
              items: oldItems,
              collapsed: false,
              createdAt: Date.now(),
            }],
          } as never;
        }
        return {
          ...persisted,
          sidebarOpen: persisted.sidebarOpen ?? true,
          dismissedSourceKeys: persisted.dismissedSourceKeys ?? [],
          nativeScratchDirectoryPath: persisted.nativeScratchDirectoryPath,
          bins: persisted.bins,
        } as never;
      },
      merge: (persisted, current) => {
        const safe = sanitizePersistedSourceBinState(persisted);
        return {
          ...current,
          sidebarOpen: safe.sidebarOpen ?? current.sidebarOpen,
          dismissedSourceKeys: safe.dismissedSourceKeys ?? current.dismissedSourceKeys,
          nativeScratchDirectoryPath: safe.nativeScratchDirectoryPath,
          bins: safe.bins ?? (safe.items ? [{ ...createDefaultBin(), items: safe.items }] : current.bins),
        };
      },
      partialize: (state): PersistedSourceBinState => ({
        sidebarOpen: state.sidebarOpen,
        dismissedSourceKeys: state.dismissedSourceKeys,
        nativeScratchDirectoryPath: state.nativeScratchDirectoryPath,
        bins: state.bins.map((bin) => ({
          id: bin.id,
          name: bin.name,
          collapsed: bin.collapsed,
          createdAt: bin.createdAt,
          items: bin.items.map((item) => ({
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
                  isGenerated: item.isGenerated,
                  starred: item.starred,
                  collapsed: item.collapsed,
                  envelopeId: item.envelopeId,
            envelopeLabel: item.envelopeLabel,
            envelopeIndex: item.envelopeIndex,
            envelopeCollapsed: item.envelopeCollapsed,
          })),
        })),
      }),
    },
  ),
);

function getDefaultMimeType(kind: EditorSourceKind): string {
  return getDefaultMimeTypeForKind(kind);
}

export function sanitizePersistedSourceBinState(value: unknown): PersistedSourceBinState {
  const input = isRecord(value) ? value : {};
  const bins = Array.isArray(input.bins)
    ? input.bins.map((bin, index) => normalizeSourceBin(bin, index)).filter((bin): bin is SourceBin => Boolean(bin))
    : undefined;
  const items = Array.isArray(input.items)
    ? repairDuplicateSourceBinEnvelopeIndexes(
        input.items.map(normalizeSourceBinLibraryItem).filter((item): item is SourceBinLibraryItem => Boolean(item)),
      )
    : undefined;
  return {
    bins: bins && bins.length > 0 ? bins : undefined,
    items,
    dismissedSourceKeys: Array.isArray(input.dismissedSourceKeys)
      ? input.dismissedSourceKeys.filter((key): key is string => typeof key === 'string')
      : [],
    sidebarOpen: typeof input.sidebarOpen === 'boolean' ? input.sidebarOpen : true,
    nativeScratchDirectoryPath: typeof input.nativeScratchDirectoryPath === 'string' ? input.nativeScratchDirectoryPath : undefined,
  };
}

function normalizeSourceBin(value: unknown, index: number): SourceBin | undefined {
  const input = isRecord(value) ? value : undefined;
  if (!input) return undefined;
  if (input.id === TRANSIENT_RECOVERED_SCRATCH_BIN_ID) return undefined;
  const items = Array.isArray(input.items)
    ? input.items.map(normalizeSourceBinLibraryItem).filter((item): item is SourceBinLibraryItem => Boolean(item))
    : [];
  return {
    id: stringOr(input.id, index === 0 ? 'default' : `bin-${index}`),
    name: stringOr(input.name, index === 0 ? 'Source Library' : 'Recovered Bin'),
    items: repairDuplicateSourceBinEnvelopeIndexes(items),
    collapsed: Boolean(input.collapsed),
    createdAt: finiteOr(input.createdAt, Date.now()),
  };
}

function repairDuplicateSourceBinEnvelopeIndexes(items: SourceBinLibraryItem[]): SourceBinLibraryItem[] {
  const manualItems = items.filter((item) => !item.envelopeId || item.envelopeIndex === undefined);
  const envelopeItems = items.filter((item) => item.envelopeId && item.envelopeIndex !== undefined);

  const itemsByEnvelope = new Map<string, SourceBinLibraryItem[]>();
  for (const item of envelopeItems) {
    const envId = item.envelopeId!;
    const list = itemsByEnvelope.get(envId) ?? [];
    list.push(item);
    itemsByEnvelope.set(envId, list);
  }

  const repairedEnvelopeItems: SourceBinLibraryItem[] = [];

  for (const [envelopeId, group] of itemsByEnvelope.entries()) {
    const seenIds = new Set<string>();
    const seenSignatures = new Set<string>();

    const uniqueGroup: SourceBinLibraryItem[] = [];

    for (const item of group) {
      const content = item.assetUrl || item.text;
      const signature = content ? `${item.kind}:${buildMediaAssetSignaturePart(content)}` : undefined;

      let originSlot = item.originNodeId;
      if (originSlot && originSlot.includes(':')) {
        const parts = originSlot.split(':');
        if (parts.length > 2) {
          originSlot = `${parts[0]}:${parts[1]}`;
        }
      }

      if (seenIds.has(item.id)) continue;
      if (signature && seenSignatures.has(signature)) continue;

      seenIds.add(item.id);
      if (signature) seenSignatures.add(signature);

      uniqueGroup.push({
        ...item,
        originNodeId: originSlot,
      });
    }

    const sorted = uniqueGroup.sort((left, right) => (left.envelopeIndex ?? 0) - (right.envelopeIndex ?? 0));

    const processedGroup = sorted.map((item, index) => {
      const originalIndex = item.envelopeIndex!;
      const nextIndex = index;

      return {
        ...item,
        envelopeIndex: nextIndex,
        originNodeId: rewriteEnvelopeIndexedValue(item.originNodeId, envelopeId, originalIndex, nextIndex),
        sourceKey: rewriteEnvelopeSourceKey(item.sourceKey, item.kind, envelopeId, originalIndex, nextIndex, item.originNodeId),
      };
    });

    repairedEnvelopeItems.push(...processedGroup);
  }

  return [...manualItems, ...repairedEnvelopeItems];
}

function rewriteEnvelopeIndexedValue(
  value: string | undefined,
  envelopeId: string,
  originalIndex: number,
  nextIndex: number,
): string | undefined {
  if (!value) return value;

  if (value === `${envelopeId}:${originalIndex}`) {
    return `${envelopeId}:${nextIndex}`;
  }

  // Support any node ID structure with a trailing index (e.g. imageGen-1:1 or subNodeId:index)
  const regex = /:(\d+)$/;
  if (regex.test(value)) {
    return value.replace(regex, `:${nextIndex}`);
  }

  return value;
}

function rewriteEnvelopeSourceKey(
  value: string | undefined,
  kind: EditorSourceKind,
  envelopeId: string,
  originalIndex: number,
  nextIndex: number,
  originNodeId?: string,
): string | undefined {
  if (!value) return value;

  const oldNodeId = originNodeId || `${envelopeId}:${originalIndex}`;
  const newNodeId = rewriteEnvelopeIndexedValue(oldNodeId, envelopeId, originalIndex, nextIndex) || `${envelopeId}:${nextIndex}`;

  const oldPrefix = `${kind}:${oldNodeId}:`;
  const newPrefix = `${kind}:${newNodeId}:`;

  if (value.startsWith(oldPrefix)) {
    return `${newPrefix}${value.slice(oldPrefix.length)}`;
  }

  // Fallback to direct envelope prefix
  const fallbackOldPrefix = `${kind}:${envelopeId}:${originalIndex}:`;
  const fallbackNewPrefix = `${kind}:${envelopeId}:${nextIndex}:`;
  if (value.startsWith(fallbackOldPrefix)) {
    return `${fallbackNewPrefix}${value.slice(fallbackOldPrefix.length)}`;
  }

  return value;
}

function normalizeSourceBinLibraryItem(value: unknown): SourceBinLibraryItem | undefined {
  const input = isRecord(value) ? value : undefined;
  if (!input) return undefined;
  const kind = isEditorSourceKind(input.kind) ? input.kind : undefined;
  if (!kind) return undefined;
  const assetId = optionalString(input.assetId);
  const assetUrl = optionalString(input.assetUrl);
  const scratchFileName = optionalString(input.scratchFileName);
  const nativeFilePath = optionalString(input.nativeFilePath);
  const text = optionalString(input.text);
  const sourceKey = optionalString(input.sourceKey);
  if (sourceKey?.startsWith(TRANSIENT_RECOVERED_SCRATCH_SOURCE_KEY_PREFIX)) return undefined;
  if (kind === 'text' && !text && !assetUrl) return undefined;
  if (kind !== 'text' && !assetId && !assetUrl && !scratchFileName && !nativeFilePath) return undefined;
  const label = stringOr(input.label, 'Untitled Source');
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType : getDefaultMimeType(kind);
  return {
    id: stringOr(input.id, `source-bin-${Date.now()}`),
    label,
    kind,
    mimeType,
    assetId,
    assetUrl,
    scratchFileName,
    nativeFilePath,
    text,
    pixelWidth: optionalFinitePositive(input.pixelWidth),
    pixelHeight: optionalFinitePositive(input.pixelHeight),
    createdAt: finiteOr(input.createdAt, Date.now()),
    sourceKey,
    originNodeId: optionalString(input.originNodeId),
    isGenerated: typeof input.isGenerated === 'boolean' ? input.isGenerated : undefined,
    starred: Boolean(input.starred),
    collapsed: Boolean(input.collapsed),
    envelopeId: optionalString(input.envelopeId),
    envelopeLabel: optionalString(input.envelopeLabel),
    envelopeIndex: typeof input.envelopeIndex === 'number' && Number.isFinite(input.envelopeIndex) ? input.envelopeIndex : undefined,
    envelopeCollapsed: typeof input.envelopeCollapsed === 'boolean' ? input.envelopeCollapsed : undefined,
  };
}

function isEditorSourceKind(value: unknown): value is EditorSourceKind {
  return typeof value === 'string' && VALID_SOURCE_KINDS.includes(value as EditorSourceKind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalFinitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeAssetLabel(label: string, kind: EditorSourceKind, mimeType: string): string {
  if (label.includes('.')) {
    return label;
  }

  const extension = inferDownloadExtension(mimeType, getDefaultExtension(kind));
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
    case 'document':
      return 'pdf';
    case 'subtitle':
      return 'vtt';
    case 'package':
      return 'zip';
  }
}

function isBrowserTextDocument(fileName: string, mimeType: string): boolean {
  const lowerName = fileName.toLowerCase();
  const normalizedMime = mimeType.split(';', 1)[0].toLowerCase();
  return normalizedMime.startsWith('text/')
    || normalizedMime === 'application/rtf'
    || lowerName.endsWith('.txt')
    || lowerName.endsWith('.md')
    || lowerName.endsWith('.markdown')
    || lowerName.endsWith('.rtf')
    || lowerName.endsWith('.html')
    || lowerName.endsWith('.htm');
}

async function persistLibraryAssetItem(item: {
  id?: string;
  label: string;
  kind: Exclude<EditorSourceKind, 'text'>;
  mimeType: string;
  dataUrl: string;
  blob?: Blob;
  sourceKey?: string;
  originNodeId?: string;
  isGenerated?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
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
      isGenerated: item.isGenerated,
      pixelWidth: item.pixelWidth,
      pixelHeight: item.pixelHeight,
      starred: item.starred,
      collapsed: item.collapsed,
      envelopeId: item.envelopeId,
      envelopeLabel: item.envelopeLabel,
      envelopeIndex: item.envelopeIndex,
      envelopeCollapsed: item.envelopeCollapsed,
    };
  }

  const nativeAsset = await materializeLibraryAssetItemWithNativeBridge(item);
  if (nativeAsset) {
    return nativeAsset;
  }

  try {
    const androidAsset = await materializeAndroidSourceAsset(item);
    if (androidAsset) {
      return androidAsset;
    }
  } catch (error) {
    if (isAndroidSourceAssetPermissionError(error)) {
      notifyAndroidSourceAssetPermissionRequired(item.label);
    }
    throw error;
  }

  // For blob URLs, fetch the blob directly and store it without the expensive
  // base64 round-trip through localizeAssetForProject. This avoids OOM failures
  // on large generated videos and ensures they get a reliable assetId.
  let storedAsset: StoredAssetPayload;
  if (item.blob || item.dataUrl.startsWith('blob:')) {
    const blob = item.blob ?? await assetUrlToBlob(item.dataUrl, item.mimeType);
    const fileName = normalizeAssetLabel(item.label, item.kind, blob.type || item.mimeType);
    storedAsset = await saveImportedAsset(new File([blob], fileName, { type: blob.type || item.mimeType }));
  } else {
    const localizedAsset = await localizeAssetForProject(item.dataUrl, item.mimeType);
    storedAsset = await saveDataUrlAsset({
      name: normalizeAssetLabel(item.label, item.kind, localizedAsset.mimeType),
      mimeType: localizedAsset.mimeType,
      dataUrl: localizedAsset.dataUrl,
    });
  }

  return {
    id: item.id ?? globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`,
    label: item.label,
    kind: item.kind,
    mimeType: storedAsset.mimeType,
    assetId: storedAsset.id,
    assetUrl: storedAsset.dataUrl,
    createdAt: item.createdAt ?? Date.now(),
      sourceKey: item.sourceKey,
      originNodeId: item.originNodeId,
      isGenerated: item.isGenerated,
      pixelWidth: item.pixelWidth,
    pixelHeight: item.pixelHeight,
    starred: item.starred,
    collapsed: item.collapsed,
    envelopeId: item.envelopeId,
    envelopeLabel: item.envelopeLabel,
    envelopeIndex: item.envelopeIndex,
    envelopeCollapsed: item.envelopeCollapsed,
  };
}

async function materializeLibraryAssetItemWithNativeBridge(item: {
  id?: string;
  label: string;
  kind: Exclude<EditorSourceKind, 'text'>;
  mimeType: string;
  dataUrl: string;
  blob?: Blob;
  sourceKey?: string;
  originNodeId?: string;
  isGenerated?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
}): Promise<SourceBinLibraryItem | undefined> {
  const bridge = getSignalLoomNativeBridge();
  if (!bridge?.materializeSourceAsset) {
    return undefined;
  }

  const materializeBlob = item.blob ?? (item.dataUrl.startsWith('blob:')
    ? await assetUrlToBlob(item.dataUrl, item.mimeType)
    : undefined);
  const binaryData = materializeBlob
    ? new Uint8Array(await materializeBlob.arrayBuffer())
    : undefined;

  const id = item.id ?? globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`;
  const result = await bridge.materializeSourceAsset({
    id,
    label: item.label,
    kind: item.kind,
    mimeType: item.mimeType,
    dataUrl: item.dataUrl,
    ...(binaryData ? { binaryData } : {}),
    sourceKey: item.sourceKey,
    originNodeId: item.originNodeId,
    isGenerated: item.isGenerated,
    pixelWidth: item.pixelWidth,
    pixelHeight: item.pixelHeight,
    createdAt: item.createdAt,
    envelopeId: item.envelopeId,
    envelopeLabel: item.envelopeLabel,
    envelopeIndex: item.envelopeIndex,
    envelopeCollapsed: item.envelopeCollapsed,
  });

  if (!result.item || result.error) {
    return undefined;
  }

  return {
    ...result.item,
    id: result.item.id ?? id,
    label: result.item.label ?? item.label,
    kind: result.item.kind ?? item.kind,
    mimeType: result.item.mimeType ?? item.mimeType,
    createdAt: result.item.createdAt ?? item.createdAt ?? Date.now(),
    sourceKey: result.item.sourceKey ?? item.sourceKey,
    originNodeId: result.item.originNodeId ?? item.originNodeId,
    isGenerated: result.item.isGenerated ?? item.isGenerated,
    pixelWidth: result.item.pixelWidth ?? item.pixelWidth,
    pixelHeight: result.item.pixelHeight ?? item.pixelHeight,
    starred: result.item.starred ?? item.starred,
    collapsed: result.item.collapsed ?? item.collapsed,
    envelopeId: result.item.envelopeId ?? item.envelopeId,
    envelopeLabel: result.item.envelopeLabel ?? item.envelopeLabel,
    envelopeIndex: result.item.envelopeIndex ?? item.envelopeIndex,
    envelopeCollapsed: result.item.envelopeCollapsed ?? item.envelopeCollapsed,
  };
}

async function persistLibraryAssetItemWithFallback(item: {
  id?: string;
  label: string;
  kind: Exclude<EditorSourceKind, 'text'>;
  mimeType: string;
  dataUrl: string;
  blob?: Blob;
  sourceKey?: string;
  originNodeId?: string;
  isGenerated?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
}, scratchDirectoryHandle?: FileSystemDirectoryHandle): Promise<SourceBinLibraryItem> {
  try {
    return await persistLibraryAssetItem(item, scratchDirectoryHandle);
  } catch {
    return createFallbackLibraryAssetItem(item);
  }
}

function notifyAndroidSourceAssetPermissionRequired(label: string): void {
  if (androidSourceAssetPermissionAlertOpen) {
    return;
  }

  androidSourceAssetPermissionAlertOpen = true;
  void showAlertDialog({
    title: 'Storage Permission Required',
    message: `Signal Loom needs Android file storage access to save generated asset "${label}" into the Source Library. Tap Allow when Android asks for file access, then regenerate or reimport the asset if it was saved only as a temporary preview.`,
    confirmLabel: 'OK',
    tone: 'warning',
  }).finally(() => {
    androidSourceAssetPermissionAlertOpen = false;
  });
}

function createFallbackLibraryAssetItem(item: {
  id?: string;
  label: string;
  kind: Exclude<EditorSourceKind, 'text'>;
  mimeType: string;
  dataUrl?: string;
  text?: string;
  sourceKey?: string;
  originNodeId?: string;
  isGenerated?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt?: number;
  starred?: boolean;
  collapsed?: boolean;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
}): SourceBinLibraryItem {
  return {
    id: item.id ?? globalThis.crypto?.randomUUID?.() ?? `source-bin-${Date.now()}`,
    label: item.label,
    kind: item.kind,
    mimeType: item.mimeType,
    assetUrl: item.dataUrl,
    text: item.text,
    createdAt: item.createdAt ?? Date.now(),
    sourceKey: item.sourceKey,
    originNodeId: item.originNodeId,
    isGenerated: item.isGenerated,
    pixelWidth: item.pixelWidth,
    pixelHeight: item.pixelHeight,
    starred: item.starred,
    collapsed: item.collapsed,
    envelopeId: item.envelopeId,
    envelopeLabel: item.envelopeLabel,
    envelopeIndex: item.envelopeIndex,
    envelopeCollapsed: item.envelopeCollapsed,
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
    return (await loadImportedAssetAsDataUrl(item.assetId).catch(() => undefined))?.dataUrl;
  }

  if (item.nativeFilePath && item.assetUrl) {
    const blob = await assetUrlToBlob(item.assetUrl, item.mimeType).catch(() => undefined);
    return blob ? blobToDataUrl(blob) : item.assetUrl;
  }

  if (item.assetUrl?.startsWith('data:')) {
    return item.assetUrl;
  }

  if (item.assetUrl) {
    const blob = await assetUrlToBlob(item.assetUrl, item.mimeType).catch(() => undefined);
    return blob ? await blobToDataUrl(blob) : undefined;
  }

  return undefined;
}

function createObjectAssetUrl(blob: Blob): string | undefined {
  try {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : undefined;
  } catch {
    return undefined;
  }
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
  if (typeof FileReader === 'undefined') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

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
