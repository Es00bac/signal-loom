import type { EditorWorkspaceSnapshot } from '../store/editorStore';
import type { ImageEditorProjectSnapshot } from '../store/imageEditorStore';
import type { PaperPortableAssetsSection } from '../features/paper/assets/PaperPortableAssets';
import type { PaperDocumentSnapshot } from '../types/paper';
import type { SourceBinProjectSnapshot } from '../store/sourceBinStore';
import type {
  FlowProjectFlowSnapshot,
  FlowWorkspaceProjectSnapshot,
} from './flowProjectWorkspaces';
import type { ProjectUsageLedgerSnapshot } from './projectUsageLedger';
import { downloadJsonFile } from '../shared/files/downloads';
import { CURRENT_PROJECT_SCHEMA_VERSION } from './projectSchema';
import { sanitizeProjectDocument } from './projectValidation';
import { initializeLanServerProxy } from './androidLanServer';
import { isServedLanSession, remoteHostFetch } from './remoteHostClient';

const DB_NAME = 'flow-project-library';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export interface FlowProjectDocument {
  schemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  savedAt: number;
  flow: FlowProjectFlowSnapshot;
  flowWorkspaces?: FlowWorkspaceProjectSnapshot[];
  activeFlowWorkspaceId?: string;
  editor?: Partial<EditorWorkspaceSnapshot>;
  sourceBin?: SourceBinProjectSnapshot;
  usageLedger?: ProjectUsageLedgerSnapshot;
  paper?: Partial<PaperDocumentSnapshot>;
  /** Validated content-addressed Paper bytes (images, exact fonts, license texts, ICC profiles). */
  paperAssets?: PaperPortableAssetsSection;
  imageEditor?: ImageEditorProjectSnapshot;
  fileSystem?: {
    projectDirectoryName?: string;
    scratchDirectoryName?: string;
    lastSavedToFolderAt?: number;
    scratchAssetCount?: number;
  };
}

export interface FlowProjectSummary {
  id: string;
  name: string;
  savedAt: number;
  nodeCount: number;
}

function stripProjectFileExtension(fileName: string): string {
  return fileName.replace(/\.sloom$/i, '');
}

/**
 * True when this page is a desktop browser served from a phone's LAN host (the "phone as data
 * authority" mirror). Detection lives in `remoteHostClient` (a boot-time `/__loom/api/health` probe),
 * which is more robust than the old hardcoded port check and cannot mistake a normal web visitor
 * (e.g. sloom.studio) for a served session.
 */
export function isRemoteLanClient(): boolean {
  return isServedLanSession();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout opening local project library database.'));
    }, 3000);

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeoutId);
      reject(request.error ?? new Error('Failed to open the local project library.'));
    };

    request.onblocked = () => {
      clearTimeout(timeoutId);
      console.warn('IndexedDB database open is blocked.');
      reject(new Error('IndexedDB database open is blocked by another connection.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve(request.result);
    };
  });
}

// Ensure the Android host serves projects (read-only mirror; no save handler by design).
initializeLanServerProxy({
  getProjects: listProjectSummaries,
  getProject: loadProjectDocument,
});


export async function saveProjectDocument(
  document: Omit<FlowProjectDocument, 'id' | 'savedAt' | 'schemaVersion'>
    & Partial<Pick<FlowProjectDocument, 'id' | 'savedAt' | 'schemaVersion'>>,
): Promise<FlowProjectDocument> {
  const record: FlowProjectDocument = {
    ...document,
    schemaVersion: document.schemaVersion ?? CURRENT_PROJECT_SCHEMA_VERSION,
    id: document.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    savedAt: document.savedAt ?? Date.now(),
  };

  if (isRemoteLanClient()) {
    // Phase A is a read-only mirror: a served session must never write back to the phone's project
    // (that is Phase C). Return the in-memory record so callers/autosave don't error, but persist
    // nothing. The read-only state is surfaced to the user by the served-session banner.
    return record;
  }

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to save the project locally.'));

    store.put(record);
  });

  database.close();
  return record;
}

export async function listProjectSummaries(): Promise<FlowProjectSummary[]> {
  if (isRemoteLanClient()) {
    const res = await remoteHostFetch('/projects');
    if (!res || !res.ok) return [];
    return res.json();
  }

  const database = await openDatabase();
  const rows = await new Promise<FlowProjectDocument[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result as FlowProjectDocument[] | undefined) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to load project summaries.'));
  });

  database.close();

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      savedAt: row.savedAt,
      nodeCount: row.flow.nodes.length,
    }))
    .sort((left, right) => right.savedAt - left.savedAt);
}

export async function loadProjectDocument(id: string): Promise<FlowProjectDocument | null> {
  if (isRemoteLanClient()) {
    const res = await remoteHostFetch(`/projects/${encodeURIComponent(id)}`);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data ? sanitizeProjectDocument(data) : null;
  }

  const database = await openDatabase();
  const result = await new Promise<FlowProjectDocument | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as FlowProjectDocument | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to load the selected project.'));
  });

  database.close();
  return result ?? null;
}

export async function deleteProjectDocument(id: string): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to delete the selected project.'));

    store.delete(id);
  });

  database.close();
}

export { downloadJsonFile };

export async function parseProjectDocument(file: File): Promise<FlowProjectDocument> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  return sanitizeProjectDocument(parsed, stripProjectFileExtension(file.name));
}
