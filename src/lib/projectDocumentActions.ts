import { DEFAULT_PROJECT_NAME } from './brand';
import { buildDefaultFlowWorkspace } from './flowProjectWorkspaces';
import type { FlowProjectDocument } from './projectLibrary';
import { CURRENT_PROJECT_SCHEMA_VERSION } from './projectSchema';
import {
  normalizeProjectMediaReferencesForSave,
  resolveProjectMediaReferencesForRestore,
} from './projectMediaReferences';
import { sanitizeProjectDocument } from './projectValidation';
import { useEditorStore } from '../store/editorStore';
import { useFlowStore } from '../store/flowStore';
import { useFlowWorkspaceStore } from '../store/flowWorkspaceStore';
import { useImageEditorStore } from '../store/imageEditorStore';
import { usePaperStore } from '../store/paperStore';
import { useProjectUsageStore } from '../store/projectUsageStore';
import { useSourceBinStore } from '../store/sourceBinStore';

export async function buildCurrentProjectDocument(options: {
  id?: string;
  name?: string;
  includeAssetData?: boolean;
} = {}): Promise<FlowProjectDocument> {
  const name = options.name?.trim() || `${DEFAULT_PROJECT_NAME} ${new Date().toLocaleString()}`;
  const savedAt = Date.now();
  const flow = useFlowStore.getState().exportProjectFlowSnapshot();
  const flowWorkspaceStore = useFlowWorkspaceStore.getState();
  const flowWorkspaces = flowWorkspaceStore.exportProjectSnapshot(flow);

  const document: FlowProjectDocument = {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: options.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name,
    savedAt,
    flow,
    flowWorkspaces,
    activeFlowWorkspaceId: flowWorkspaceStore.activeWorkspaceId ?? flowWorkspaces[0]?.id,
    editor: useEditorStore.getState().exportWorkspaceSnapshot(),
    sourceBin: await useSourceBinStore.getState().exportProjectSnapshot({
      includeAssetData: options.includeAssetData,
    }),
    usageLedger: useProjectUsageStore.getState().exportSnapshot(),
    paper: usePaperStore.getState().exportSnapshot(),
    imageEditor: useImageEditorStore.getState().exportProjectSnapshot(),
  };

  return normalizeProjectMediaReferencesForSave(document).document;
}

export async function restoreProjectDocument(document: unknown): Promise<void> {
  const fallbackName = typeof (document as { name?: unknown } | undefined)?.name === 'string'
    ? (document as { name: string }).name
    : DEFAULT_PROJECT_NAME;
  const sanitizedDocument = sanitizeProjectDocument(document, fallbackName);
  const flowStore = useFlowStore.getState();
  const editorStore = useEditorStore.getState();
  const sourceBinStore = useSourceBinStore.getState();
  const paperStore = usePaperStore.getState();
  const imageEditorStore = useImageEditorStore.getState();
  const projectUsageStore = useProjectUsageStore.getState();
  const flowWorkspaceStore = useFlowWorkspaceStore.getState();
  const previous = {
    flow: flowStore.exportProjectFlowSnapshot(),
    flowWorkspaces: flowWorkspaceStore.exportProjectSnapshot(flowStore.exportProjectFlowSnapshot()),
    activeFlowWorkspaceId: flowWorkspaceStore.activeWorkspaceId,
    editor: editorStore.exportWorkspaceSnapshot(),
    sourceBin: await sourceBinStore.exportProjectSnapshot({ includeAssetData: false }),
    usageLedger: projectUsageStore.exportSnapshot(),
    paper: paperStore.exportSnapshot(),
    imageEditor: imageEditorStore.exportProjectSnapshot(),
  };

  try {
    await sourceBinStore.restoreProjectSnapshot(sanitizedDocument.sourceBin, { publishNative: false });
    const resolvedDocument = resolveProjectMediaReferencesForRestore(
      sanitizedDocument,
      sourceBinStore.getAllItems(),
    );
    flowWorkspaceStore.hydrateProjectSnapshot({
      workspaces: resolvedDocument.flowWorkspaces ?? [buildDefaultFlowWorkspace(resolvedDocument.flow)],
      activeWorkspaceId: resolvedDocument.activeFlowWorkspaceId,
    });
    flowStore.replaceFlowSnapshot(resolvedDocument.flow);
    await flowStore.restoreImportedAssets();
    editorStore.restoreWorkspaceSnapshot(resolvedDocument.editor);
    projectUsageStore.restoreSnapshot(resolvedDocument.usageLedger);
    paperStore.restoreSnapshot(resolvedDocument.paper);
    imageEditorStore.restoreProjectSnapshot(resolvedDocument.imageEditor);
  } catch (error) {
    flowStore.replaceFlowSnapshot(previous.flow);
    flowWorkspaceStore.hydrateProjectSnapshot({
      workspaces: previous.flowWorkspaces,
      activeWorkspaceId: previous.activeFlowWorkspaceId,
    });
    editorStore.restoreWorkspaceSnapshot(previous.editor);
    await sourceBinStore.restoreProjectSnapshot(previous.sourceBin, { publishNative: false }).catch(() => undefined);
    projectUsageStore.restoreSnapshot(previous.usageLedger);
    paperStore.restoreSnapshot(previous.paper);
    imageEditorStore.restoreProjectSnapshot(previous.imageEditor);
    const message = error instanceof Error ? error.message : 'Unknown restore error';
    throw new Error(`The selected project could not be restored safely. Previous workspace was left unchanged. ${message}`);
  }
}

export async function resetProjectDocument(): Promise<void> {
  useFlowStore.getState().replaceFlowSnapshot({
    nodes: [],
    edges: [],
  });
  useFlowWorkspaceStore.getState().reset();
  useEditorStore.getState().restoreWorkspaceSnapshot(undefined);
  await useSourceBinStore.getState().restoreProjectSnapshot(undefined);
  useProjectUsageStore.getState().restoreSnapshot(undefined);
  usePaperStore.getState().restoreSnapshot(undefined);
  useImageEditorStore.getState().restoreProjectSnapshot(undefined);
}
