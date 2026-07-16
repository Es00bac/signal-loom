import { useDockablePanelStore } from '../store/dockablePanelStore';
import { useImageEditorStore } from '../store/imageEditorStore';
import { usePaperStore } from '../store/paperStore';
import { useWorkspaceLayoutStore } from '../store/workspaceLayoutStore';
import { resetProjectDocument } from './projectDocumentActions';

export const NON_SECRET_RECOVERY_STORAGE_KEYS = [
  'flow-canvas-storage',
  'flow-editor-workspace',
  'flow-global-source-bin',
  'signal-loom-paper-workspace',
  'signal-loom-workspace-layouts',
  'signal-loom-dockable-panels',
  'signal-loom-activity-trail',
] as const;

export const SECRET_PERSISTED_STORAGE_KEYS = [
  'flow-settings-storage',
  'image-editor-generic-auth-template',
] as const;

export type AppRecoveryStorage = Pick<Storage, 'removeItem'>;

export interface RecoveryRemovalResult {
  key: string;
  removed: boolean;
  error?: string;
}

export function safeRemoveLocalStorageKeys(
  keys: readonly string[],
  storage: AppRecoveryStorage | null | undefined = getBrowserLocalStorage(),
): RecoveryRemovalResult[] {
  return keys.map((key) => {
    if (!storage) {
      return { key, removed: false, error: 'localStorage unavailable' };
    }

    try {
      storage.removeItem(key);
      return { key, removed: true };
    } catch (error) {
      return { key, removed: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

export async function resetProjectToBlank(): Promise<void> {
  await resetProjectDocument({ allowDirtyImageReplacement: true });
  resetVolatileWorkspaceState();
}

export function resetDockableAndWorkspaceLayout(): void {
  useDockablePanelStore.getState().resetAllPanelLayouts();
  useWorkspaceLayoutStore.getState().resetWorkspaceLayout();
}

export function clearNonSecretPersistedRecoveryState(
  storage: AppRecoveryStorage | undefined = getBrowserLocalStorage(),
): RecoveryRemovalResult[] {
  const results = safeRemoveLocalStorageKeys(NON_SECRET_RECOVERY_STORAGE_KEYS, storage);
  resetDockableAndWorkspaceLayout();
  resetVolatileWorkspaceState();
  return results;
}

export async function resetProjectAndClearNonSecretState(
  storage: AppRecoveryStorage | undefined = getBrowserLocalStorage(),
): Promise<RecoveryRemovalResult[]> {
  const results = clearNonSecretPersistedRecoveryState(storage);
  await resetProjectToBlank();
  return results;
}

function resetVolatileWorkspaceState(): void {
  useImageEditorStore.setState({
    documents: [],
    activeDocId: null,
    tool: 'move',
    undoStacks: {},
    redoStacks: {},
  });
  usePaperStore.getState().restoreSnapshot(undefined);
}

function getBrowserLocalStorage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}
