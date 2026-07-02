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
    imageEditor: await useImageEditorStore.getState().exportProjectSnapshotWithPixels(),
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
  };
  // Image rollback keeps the LIVE document objects (bitmaps included): a plain
  // exportProjectSnapshot() strips pixels, so rolling back with it after a
  // mid-restore failure would blank every open Image canvas — the exact data
  // loss the "previous workspace left unchanged" promise forbids.
  const previousImageEditorLive = {
    documents: imageEditorStore.documents,
    activeDocId: imageEditorStore.activeDocId,
    quickActionMacros: imageEditorStore.quickActionMacros,
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
    await imageEditorStore.restoreProjectSnapshotWithPixels(resolvedDocument.imageEditor);
    // Multi-window desktop: the source-bin restore above replaced the Source Library with the
    // saved project bin (resolved against flow media refs first). The native main process holds
    // the authoritative live snapshot — which also contains assets generated in *other* windows
    // since the last save — so reconcile to recover them instead of leaving them clobbered.
    // No-op without the native bridge (web / mobile single-window).
    await sourceBinStore.reconcileWithNativeSourceLibrarySnapshot();
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
    imageEditorStore.restoreLiveProjectRollback(previousImageEditorLive);
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
