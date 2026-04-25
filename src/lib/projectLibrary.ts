import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import type { EditorWorkspaceSnapshot } from '../store/editorStore';
import type { SourceBinProjectSnapshot } from '../store/sourceBinStore';

const DB_NAME = 'flow-project-library';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export interface FlowProjectDocument {
  id: string;
  name: string;
  savedAt: number;
  flow: {
    version: number;
    nodes: AppNode[];
    edges: Edge[];
  };
  editor?: Partial<EditorWorkspaceSnapshot>;
  sourceBin?: SourceBinProjectSnapshot;
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
  return fileName.replace(/(?:\.sloom|\.signal-loom\.json|\.json)$/i, '');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open the local project library.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function saveProjectDocument(
  document: Omit<FlowProjectDocument, 'id' | 'savedAt'> & Partial<Pick<FlowProjectDocument, 'id' | 'savedAt'>>,
): Promise<FlowProjectDocument> {
  const database = await openDatabase();
  const record: FlowProjectDocument = {
    ...document,
    id: document.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    savedAt: document.savedAt ?? Date.now(),
  };

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

export async function loadProjectDocument(id: string): Promise<FlowProjectDocument | undefined> {
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
  return result;
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

export function downloadJsonFile(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function parseProjectDocument(file: File): Promise<FlowProjectDocument> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<FlowProjectDocument>;

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.flow ||
    !Array.isArray(parsed.flow.nodes) ||
    !Array.isArray(parsed.flow.edges)
  ) {
    throw new Error('The selected file is not a valid Flow project document.');
  }

  return {
    id: typeof parsed.id === 'string' ? parsed.id : globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name: typeof parsed.name === 'string' ? parsed.name : stripProjectFileExtension(file.name),
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    flow: {
      version: typeof parsed.flow.version === 'number' ? parsed.flow.version : 3,
      nodes: parsed.flow.nodes as AppNode[],
      edges: parsed.flow.edges as Edge[],
    },
    editor: parsed.editor,
    sourceBin: parsed.sourceBin,
    fileSystem: parsed.fileSystem,
  };
}
