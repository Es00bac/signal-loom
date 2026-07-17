import { DEFAULT_PROJECT_NAME } from './brand';
import { buildDefaultFlowWorkspace } from './flowProjectWorkspaces';
import type { FlowProjectDocument } from './projectLibrary';
import { CURRENT_PROJECT_SCHEMA_VERSION } from './projectSchema';
import {
  normalizeProjectMediaReferencesForSave,
  resolveProjectMediaReferencesForRestore,
} from './projectMediaReferences';
import { sanitizeProjectDocument } from './projectValidation';
import { migrateLegacyPaperBinaryFields } from '../features/paper/assets/PaperDocumentAssets';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';
import {
  buildPaperPortableAssetsSection,
  collectMissingPaperAssetDiagnostics,
  importPaperPortableAssetsSection,
  type PaperPortableAssetsImportResult,
  type PaperPortableAssetsSection,
} from '../features/paper/assets/PaperPortableAssets';
import { mergePaperSnapshotRecovery } from './paperSnapshotRecovery';
import type { PaperDocument } from '../types/paper';
import { useEditorStore } from '../store/editorStore';
import { prepareFlowSnapshotImportedAssets, useFlowStore } from '../store/flowStore';
import { useFlowWorkspaceStore } from '../store/flowWorkspaceStore';
import {
  useImageEditorStore,
  type ImageEditorProjectSnapshotTransaction,
} from '../store/imageEditorStore';
import { getDirtyPaperWorkspaceDocumentTitles, usePaperStore } from '../store/paperStore';
import { useProjectUsageStore } from '../store/projectUsageStore';
import {
  leaseSourceBinProjectSnapshotObjectUrls,
  useSourceBinStore,
  type PreparedSourceBinProjectSnapshot,
} from '../store/sourceBinStore';
import { getEditorAssets } from './editorAssets';
import { getEditorVisualClips } from './manualEditorState';
import { getEditorStageObjects } from './editorStageObjects';
import { ensureBundledFontFaceReferencesRegistered } from './bundledFontLibrary';
import {
  collectImageBundledFontFaceReferences,
  collectVideoBundledFontFaceReferences,
  upgradeLegacyBundledFontIssuesInProject,
} from './managedBundledFonts';
import { getFloatingSelection, getSelection } from '../components/ImageEditor/selectionRegistry';

export interface ProjectDocumentReplacementOptions {
  /** Set only after the user explicitly chose Discard or the current project was saved successfully. */
  allowDirtyImageReplacement?: boolean;
  /** Set only after the user explicitly chose Discard or the current Paper document was saved. */
  allowDirtyPaperReplacement?: boolean;
}

function assertDirtyImageReplacementAllowed(options: ProjectDocumentReplacementOptions): void {
  if (options.allowDirtyImageReplacement) return;
  const dirtyDocument = useImageEditorStore.getState().documents.find((document) => document.dirty);
  if (!dirtyDocument) return;
  throw new Error(
    `Project replacement was blocked because dirty Image document "${dirtyDocument.title}" is still open. `
    + 'Save or discard it explicitly before replacing the project.',
  );
}

function assertDirtyPaperReplacementAllowed(options: ProjectDocumentReplacementOptions): void {
  if (options.allowDirtyPaperReplacement) return;
  const dirtyTitles = getDirtyPaperWorkspaceDocumentTitles();
  if (dirtyTitles.length === 0) return;
  throw new Error(
    `Project replacement was blocked because Paper document "${dirtyTitles[0]}" has unsaved edits. `
    + 'Save or discard it explicitly before replacing the project.',
  );
}

export async function buildCurrentProjectDocument(options: {
  id?: string;
  name?: string;
  includeAssetData?: boolean;
  /**
   * Explicit portable-export flows fail closed when a Paper font's rights forbid packaging or a
   * reachable managed record is missing. Plain Save never fails for policy reasons; it records
   * exclusions explicitly in the section instead.
   */
  strictPaperAssets?: boolean;
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

  const normalized = normalizeProjectMediaReferencesForSave(document).document;
  // Enumerate from the NORMALIZED Paper documents: reference normalization can remap a managed
  // locator to a durable external URL, and the section must carry exactly what reopen will need.
  const paperAssets = await buildProjectPaperPortableAssets(normalized.paper, {
    strict: options.strictPaperAssets,
  });
  return { ...normalized, ...(paperAssets ? { paperAssets } : {}) };
}

function collectProjectPaperDocuments(paper: FlowProjectDocument['paper']): PaperDocument[] {
  if (!paper?.document) return [];
  const documents = (paper.documents ?? [])
    .map((workspaceDocument) => workspaceDocument.document)
    .filter((document): document is PaperDocument => Boolean(document));
  return [paper.document, ...documents];
}

async function buildProjectPaperPortableAssets(
  paper: FlowProjectDocument['paper'],
  options: { strict?: boolean },
): Promise<PaperPortableAssetsSection | undefined> {
  const documents = collectProjectPaperDocuments(paper);
  if (documents.length === 0) return undefined;
  const built = await buildPaperPortableAssetsSection(documents, paperAssetRepository, {
    strict: options.strict,
  });
  return built.section;
}

export interface PreparedProjectDocumentTransaction {
  readonly document: FlowProjectDocument;
  assertCanCommit: () => void;
  commit: () => void;
  finalize: () => void;
  rollback: () => Promise<void>;
}

interface ProjectStoreIdentity {
  flowNodes: unknown;
  flowEdges: unknown;
  workspaces: unknown;
  activeWorkspaceId: string | null;
  editor: unknown;
  sourceBins: unknown;
  sourceDismissals: unknown;
  usageLedger: unknown;
  paperDocuments: unknown;
  paperDocument: unknown;
  imageDocuments: unknown;
  imageActiveDocId: string | null;
  imageUndoStacks: unknown;
  imageRedoStacks: unknown;
  imageQuickActionMacros: unknown;
  imageActiveQuickActionRecording: unknown;
  imageGenerativeFillDismissedByDocId: unknown;
  imageSelections: ReadonlyArray<readonly [string, unknown, unknown]>;
}

function captureProjectStoreIdentity(): ProjectStoreIdentity {
  const flow = useFlowStore.getState();
  const workspaces = useFlowWorkspaceStore.getState();
  const editor = useEditorStore.getState();
  const source = useSourceBinStore.getState();
  const usage = useProjectUsageStore.getState();
  const paper = usePaperStore.getState();
  const image = useImageEditorStore.getState();
  return {
    flowNodes: flow.nodes,
    flowEdges: flow.edges,
    workspaces: workspaces.workspaces,
    activeWorkspaceId: workspaces.activeWorkspaceId,
    editor: editor,
    sourceBins: source.bins,
    sourceDismissals: source.dismissedSourceKeys,
    usageLedger: usage.ledger,
    paperDocuments: paper.documents,
    paperDocument: paper.document,
    imageDocuments: image.documents,
    imageActiveDocId: image.activeDocId,
    imageUndoStacks: image.undoStacks,
    imageRedoStacks: image.redoStacks,
    imageQuickActionMacros: image.quickActionMacros,
    imageActiveQuickActionRecording: image.activeQuickActionRecording,
    imageGenerativeFillDismissedByDocId: image.generativeFillDismissedByDocId,
    imageSelections: image.documents.map((document) => [
      document.id,
      getSelection(document.id),
      getFloatingSelection(document.id),
    ] as const),
  };
}

function sameProjectStoreIdentityField(
  left: ProjectStoreIdentity,
  right: ProjectStoreIdentity,
  key: keyof ProjectStoreIdentity,
): boolean {
  if (key !== 'imageSelections') return left[key] === right[key];
  return left.imageSelections.length === right.imageSelections.length
    && left.imageSelections.every(([documentId, selection, floatingSelection], index) => (
      right.imageSelections[index]?.[0] === documentId
      && right.imageSelections[index]?.[1] === selection
      && right.imageSelections[index]?.[2] === floatingSelection
    ));
}

function sameProjectStoreIdentity(left: ProjectStoreIdentity, right: ProjectStoreIdentity): boolean {
  return (Object.keys(left) as Array<keyof ProjectStoreIdentity>)
    .every((key) => sameProjectStoreIdentityField(left, right, key));
}

type ProjectStoreIdentityKey = keyof ProjectStoreIdentity;

function sameProjectStoreIdentityFields(
  left: ProjectStoreIdentity,
  right: ProjectStoreIdentity,
  keys: readonly ProjectStoreIdentityKey[],
): boolean {
  return keys.every((key) => sameProjectStoreIdentityField(left, right, key));
}

function commitWithoutObserverFailure(commit: () => void): void {
  try {
    commit();
  } catch {
    // Zustand observers run synchronously after a state replacement and may throw. Every store
    // commit below is independently continued so one bad observer cannot expose a half-project.
  }
}

export async function prepareProjectDocumentTransaction(
  document: unknown,
  options: ProjectDocumentReplacementOptions = {},
): Promise<PreparedProjectDocumentTransaction> {
  assertDirtyImageReplacementAllowed(options);
  assertDirtyPaperReplacementAllowed(options);
  const baseIdentity = captureProjectStoreIdentity();
  const fallbackName = typeof (document as { name?: unknown } | undefined)?.name === 'string'
    ? (document as { name: string }).name
    : DEFAULT_PROJECT_NAME;
  let preparedDocument = sanitizeProjectDocument(document ?? {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name: DEFAULT_PROJECT_NAME,
    savedAt: Date.now(),
    flow: { version: 3, nodes: [], edges: [] },
  }, fallbackName);
  await upgradeLegacyBundledFontIssuesInProject(preparedDocument);
  let paperAssetsImport: PaperPortableAssetsImportResult | undefined;
  let paperAssetsFinalized = false;
  let paperAssetsRollbackPromise: Promise<void> | undefined;
  const rollbackPaperAssets = (): Promise<void> => {
    if (paperAssetsFinalized || !paperAssetsImport) return Promise.resolve();
    paperAssetsRollbackPromise ??= paperAssetsImport.rollback();
    return paperAssetsRollbackPromise;
  };

  const preparedStores = await (async () => {
    // Paper bytes are validated and staged before any renderer store can change. They remain
    // provisional until finalize(), so a canceled native handoff or any later preparation failure
    // can restore the repository exactly to its pre-open state.
    if (preparedDocument.paperAssets) {
      paperAssetsImport = await importPaperPortableAssetsSection(
        preparedDocument.paperAssets,
        paperAssetRepository,
      );
    }
    if (preparedDocument.paper?.document) {
      preparedDocument = await migrateProjectPaperDocuments(preparedDocument);
    }

    const imageFontReferences = collectImageBundledFontFaceReferences(preparedDocument.imageEditor?.documents ?? []);
    const flowSnapshots = [preparedDocument.flow, ...(preparedDocument.flowWorkspaces ?? []).map((workspace) => workspace.flow)];
    const videoFontReferences = flowSnapshots.flatMap((flow) => flow.nodes.flatMap((node) => (
      collectVideoBundledFontFaceReferences({
        assets: getEditorAssets(node.data),
        visualClips: getEditorVisualClips(node.data),
        stageObjects: getEditorStageObjects(node.data),
      })
    )));
    await ensureBundledFontFaceReferencesRegistered([...imageFontReferences, ...videoFontReferences]);
    preparedDocument = {
      ...preparedDocument,
      paper: await attachPaperMissingAssetDiagnostics(
        preparedDocument.paper,
        preparedDocument.paperAssets,
      ),
    };

    const preparedSource = await useSourceBinStore.getState().prepareProjectSnapshot(preparedDocument.sourceBin);
    const releasePreparedSourceUrls = leaseSourceBinProjectSnapshotObjectUrls(preparedSource);
    const sourceItems = preparedSource.bins.flatMap((bin) => bin.items);
    try {
      preparedDocument = resolveProjectMediaReferencesForRestore(preparedDocument, sourceItems);
      const preparedWorkspaces = await Promise.all(
        (preparedDocument.flowWorkspaces ?? [buildDefaultFlowWorkspace(preparedDocument.flow)])
          .map(async (workspace) => ({
            ...workspace,
            flow: await prepareFlowSnapshotImportedAssets(workspace.flow, sourceItems),
          })),
      );
      const activeWorkspace = preparedWorkspaces.find((workspace) => workspace.id === preparedDocument.activeFlowWorkspaceId)
        ?? preparedWorkspaces[0];
      const preparedFlow = activeWorkspace?.flow
        ?? await prepareFlowSnapshotImportedAssets(preparedDocument.flow, sourceItems);
      preparedDocument = {
        ...preparedDocument,
        flow: preparedFlow,
        flowWorkspaces: preparedWorkspaces,
        activeFlowWorkspaceId: activeWorkspace?.id,
      };
      const preparedImage = await useImageEditorStore.getState().prepareProjectSnapshotWithPixels(preparedDocument.imageEditor);
      return {
        preparedFlow,
        preparedImage,
        preparedSource,
        preparedWorkspaces,
        releasePreparedSourceUrls,
      };
    } catch (error) {
      releasePreparedSourceUrls();
      throw error;
    }
  })().catch(async (error) => {
    await rollbackPaperAssets();
    throw error;
  });
  const {
    preparedFlow,
    preparedImage,
    preparedSource,
    preparedWorkspaces,
    releasePreparedSourceUrls,
  } = preparedStores;

  const previous = {
    flow: useFlowStore.getState().exportProjectFlowSnapshot(),
    flowWorkspaces: useFlowWorkspaceStore.getState().exportProjectSnapshot(useFlowStore.getState().exportProjectFlowSnapshot()),
    activeFlowWorkspaceId: useFlowWorkspaceStore.getState().activeWorkspaceId,
    editor: useEditorStore.getState().exportWorkspaceSnapshot(),
    source: {
      bins: useSourceBinStore.getState().bins,
      dismissedSourceKeys: useSourceBinStore.getState().dismissedSourceKeys,
    } satisfies PreparedSourceBinProjectSnapshot,
    usage: useProjectUsageStore.getState().exportSnapshot(),
    paper: usePaperStore.getState().exportSnapshot(),
  };
  const releasePreviousSourceUrls = leaseSourceBinProjectSnapshotObjectUrls(previous.source, {
    adoptSnapshotOwnership: true,
  });
  const appliedStores: Array<{
    keys: readonly ProjectStoreIdentityKey[];
    postIdentity: ProjectStoreIdentity;
    restore: () => void;
    settleSkippedRollback?: () => void;
  }> = [];
  let imageTransaction: ImageEditorProjectSnapshotTransaction | undefined;
  let committed = false;
  let settled = false;

  const releaseSourceUrlLeases = () => {
    if (settled) return;
    settled = true;
    try {
      releasePreparedSourceUrls();
    } finally {
      releasePreviousSourceUrls();
    }
  };

  const rollbackAppliedStores = () => {
    for (const applied of [...appliedStores].reverse()) {
      if (sameProjectStoreIdentityFields(captureProjectStoreIdentity(), applied.postIdentity, applied.keys)) {
        commitWithoutObserverFailure(applied.restore);
      } else {
        applied.settleSkippedRollback?.();
      }
    }
    appliedStores.length = 0;
    committed = false;
  };

  const applyStore = (
    keys: readonly ProjectStoreIdentityKey[],
    apply: () => void,
    restore: () => void,
    settleSkippedRollback?: () => void,
  ) => {
    const before = captureProjectStoreIdentity();
    if (!sameProjectStoreIdentityFields(before, baseIdentity, keys)) {
      throw new Error('A project store changed while the replacement was committing. Retry the project switch.');
    }
    let observerError: unknown;
    try {
      apply();
    } catch (error) {
      observerError = error;
    }
    const postIdentity = captureProjectStoreIdentity();
    if (observerError && sameProjectStoreIdentityFields(before, postIdentity, keys)) {
      throw observerError;
    }
    appliedStores.push({ keys, postIdentity, restore, settleSkippedRollback });
  };

  const commit = () => {
    if (committed) return;
    if (settled) {
      throw new Error('This project replacement transaction has already been settled.');
    }
    if (!sameProjectStoreIdentity(baseIdentity, captureProjectStoreIdentity())) {
      throw new Error('The current project changed while the replacement was being prepared. Retry the project switch.');
    }
    try {
      applyStore(
        ['sourceBins', 'sourceDismissals'],
        () => useSourceBinStore.getState().commitPreparedProjectSnapshot(preparedSource, { publishNative: false }),
        () => useSourceBinStore.getState().commitPreparedProjectSnapshot(previous.source, { publishNative: false }),
      );
      applyStore(
        ['workspaces', 'activeWorkspaceId'],
        () => useFlowWorkspaceStore.getState().hydrateProjectSnapshot({
          workspaces: preparedWorkspaces,
          activeWorkspaceId: preparedDocument.activeFlowWorkspaceId,
        }),
        () => useFlowWorkspaceStore.getState().hydrateProjectSnapshot({
          workspaces: previous.flowWorkspaces,
          activeWorkspaceId: previous.activeFlowWorkspaceId,
        }),
      );
      applyStore(
        ['flowNodes', 'flowEdges'],
        () => useFlowStore.getState().replaceFlowSnapshot(preparedFlow),
        () => useFlowStore.getState().replaceFlowSnapshot(previous.flow),
      );
      applyStore(
        ['editor'],
        () => useEditorStore.getState().restoreWorkspaceSnapshot(preparedDocument.editor),
        () => useEditorStore.getState().restoreWorkspaceSnapshot(previous.editor),
      );
      applyStore(
        ['usageLedger'],
        () => useProjectUsageStore.getState().restoreSnapshot(preparedDocument.usageLedger),
        () => useProjectUsageStore.getState().restoreSnapshot(previous.usage),
      );
      applyStore(
        ['paperDocuments', 'paperDocument'],
        () => usePaperStore.getState().restoreSnapshot(preparedDocument.paper),
        () => usePaperStore.getState().restoreSnapshot(previous.paper),
      );
      applyStore(
        [
          'imageDocuments',
          'imageActiveDocId',
          'imageUndoStacks',
          'imageRedoStacks',
          'imageQuickActionMacros',
          'imageActiveQuickActionRecording',
          'imageGenerativeFillDismissedByDocId',
          'imageSelections',
        ],
        () => {
          imageTransaction = useImageEditorStore.getState()
            .commitPreparedProjectSnapshotWithPixels(preparedImage);
        },
        () => imageTransaction?.rollback(),
        () => imageTransaction?.finalize(),
      );
      committed = true;
    } catch (error) {
      rollbackAppliedStores();
      useImageEditorStore.getState().disposePreparedProjectSnapshotWithPixels(preparedImage);
      releaseSourceUrlLeases();
      void rollbackPaperAssets();
      throw error;
    }
  };

  return {
    document: preparedDocument,
    assertCanCommit: () => {
      if (!sameProjectStoreIdentity(baseIdentity, captureProjectStoreIdentity())) {
        throw new Error('The current project changed while the replacement was being prepared. Retry the project switch.');
      }
    },
    commit,
    finalize: () => {
      if (!committed) return;
      paperAssetsFinalized = true;
      try {
        imageTransaction?.finalize();
      } finally {
        releaseSourceUrlLeases();
      }
    },
    rollback: async () => {
      if (settled) {
        await rollbackPaperAssets();
        return;
      }
      try {
        if (committed) rollbackAppliedStores();
      } finally {
        try {
          useImageEditorStore.getState().disposePreparedProjectSnapshotWithPixels(preparedImage);
        } finally {
          releaseSourceUrlLeases();
        }
      }
      await rollbackPaperAssets();
    },
  };
}

export async function restoreProjectDocument(
  document: unknown,
  options: ProjectDocumentReplacementOptions = {},
): Promise<void> {
  const transaction = await prepareProjectDocumentTransaction(document, options);
  try {
    transaction.commit();
    transaction.finalize();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Explicit missing-asset diagnostics for open: whatever the repository still cannot supply after
 * staging (legacy `.sloom` without the section, or faces excluded by rights policy at save time)
 * is reported through the Paper recovery channel instead of pretending the project is complete.
 */
async function attachPaperMissingAssetDiagnostics(
  paper: FlowProjectDocument['paper'],
  section: PaperPortableAssetsSection | undefined,
): Promise<FlowProjectDocument['paper']> {
  const documents = collectProjectPaperDocuments(paper);
  if (!paper || documents.length === 0) return paper;
  const repairs = await collectMissingPaperAssetDiagnostics(documents, paperAssetRepository, section);
  if (repairs.length === 0) return paper;
  return {
    ...paper,
    recovery: mergePaperSnapshotRecovery(paper.recovery, { quarantinedDocuments: [], repairs }),
  };
}

async function migrateProjectPaperDocuments(
  document: FlowProjectDocument,
): Promise<FlowProjectDocument> {
  if (!document.paper?.document) return document;
  const documents = document.paper.documents
    ? await Promise.all(document.paper.documents.map(async (workspaceDocument) => ({
      ...workspaceDocument,
      document: await migrateLegacyPaperBinaryFields(workspaceDocument.document, paperAssetRepository),
    })))
    : undefined;
  const activeDocument = documents?.find((workspaceDocument) => workspaceDocument.id === document.paper?.activeDocumentId)
    ?? documents?.[0];
  return {
    ...document,
    paper: {
      ...document.paper,
      documents,
      document: activeDocument?.document
        ?? await migrateLegacyPaperBinaryFields(document.paper.document, paperAssetRepository),
    },
  };
}

export async function resetProjectDocument(
  options: ProjectDocumentReplacementOptions = {},
): Promise<void> {
  const transaction = await prepareProjectDocumentTransaction(undefined, options);
  try {
    transaction.commit();
    transaction.finalize();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
