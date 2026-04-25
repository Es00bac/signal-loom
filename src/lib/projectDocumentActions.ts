import { DEFAULT_PROJECT_NAME } from './brand';
import type { FlowProjectDocument } from './projectLibrary';
import { useEditorStore } from '../store/editorStore';
import { useFlowStore } from '../store/flowStore';
import { useSourceBinStore } from '../store/sourceBinStore';

export async function buildCurrentProjectDocument(options: {
  id?: string;
  name?: string;
  includeAssetData?: boolean;
} = {}): Promise<FlowProjectDocument> {
  const name = options.name?.trim() || `${DEFAULT_PROJECT_NAME} ${new Date().toLocaleString()}`;

  return {
    id: options.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name,
    savedAt: Date.now(),
    flow: useFlowStore.getState().exportProjectFlowSnapshot(),
    editor: useEditorStore.getState().exportWorkspaceSnapshot(),
    sourceBin: await useSourceBinStore.getState().exportProjectSnapshot({
      includeAssetData: options.includeAssetData,
    }),
  };
}

export async function restoreProjectDocument(document: FlowProjectDocument): Promise<void> {
  const flowStore = useFlowStore.getState();
  const editorStore = useEditorStore.getState();
  const sourceBinStore = useSourceBinStore.getState();

  flowStore.replaceFlowSnapshot(document.flow);
  await flowStore.restoreImportedAssets();
  editorStore.restoreWorkspaceSnapshot(document.editor);
  await sourceBinStore.restoreProjectSnapshot(document.sourceBin);
}

export async function resetProjectDocument(): Promise<void> {
  useFlowStore.getState().replaceFlowSnapshot({
    nodes: [],
    edges: [],
  });
  useEditorStore.getState().restoreWorkspaceSnapshot(undefined);
  await useSourceBinStore.getState().restoreProjectSnapshot(undefined);
}
