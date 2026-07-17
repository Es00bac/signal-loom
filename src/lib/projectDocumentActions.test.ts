import { afterEach, describe, expect, it } from 'vitest';
import { useFlowStore } from '../store/flowStore';
import { useProjectUsageStore } from '../store/projectUsageStore';
import { useSourceBinStore } from '../store/sourceBinStore';
import { useFlowWorkspaceStore } from '../store/flowWorkspaceStore';
import { buildCurrentProjectDocument, resetProjectDocument, restoreProjectDocument } from './projectDocumentActions';
import { CURRENT_PROJECT_SCHEMA_VERSION } from './projectSchema';
import { useImageEditorStore } from '../store/imageEditorStore';
import type { ImageDocument } from '../types/imageEditor';
import { usePaperStore } from '../store/paperStore';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';
import { defaultImageLayerPixelCodec } from '../components/ImageEditor/ImageLayerProjectPixels';
import { createMask } from '../components/ImageEditor/SelectionMask';
import { getSelection, setSelection } from '../components/ImageEditor/selectionRegistry';

const originalRestoreSourceBinSnapshot = useSourceBinStore.getState().restoreProjectSnapshot;
const originalReplaceFlowSnapshot = useFlowStore.getState().replaceFlowSnapshot;
const originalRestoreImportedAssets = useFlowStore.getState().restoreImportedAssets;

afterEach(() => {
  useSourceBinStore.setState({ restoreProjectSnapshot: originalRestoreSourceBinSnapshot });
  useFlowStore.setState({
    replaceFlowSnapshot: originalReplaceFlowSnapshot,
    restoreImportedAssets: originalRestoreImportedAssets,
  });
  useFlowStore.getState().replaceFlowSnapshot({ nodes: [], edges: [] });
  useFlowWorkspaceStore.getState().reset();
  useProjectUsageStore.getState().restoreSnapshot(undefined);
  useImageEditorStore.getState().restoreProjectSnapshot(undefined);
  usePaperStore.getState().restoreSnapshot(undefined);
});

describe('restoreProjectDocument', () => {
  it('fails closed before project replacement when a dirty Image document is open', async () => {
    const liveDocument: ImageDocument = {
      id: 'dirty-live-image',
      title: 'Unsaved layers',
      width: 10,
      height: 10,
      layers: [],
      activeLayerId: null,
      hasSelection: true,
      selectionVersion: 3,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      dirty: true,
    };
    useImageEditorStore.setState({
      documents: [liveDocument],
      activeDocId: liveDocument.id,
      undoStacks: {
        [liveDocument.id]: [{ kind: 'selection', docId: liveDocument.id, before: null, after: null }],
      },
    });

    await expect(restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'incoming-project',
      name: 'Incoming',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
    })).rejects.toThrow('dirty Image document');

    expect(useImageEditorStore.getState().documents).toEqual([liveDocument]);
    expect(useImageEditorStore.getState().activeDocId).toBe(liveDocument.id);
    expect(useImageEditorStore.getState().undoStacks[liveDocument.id]).toHaveLength(1);
  });

  it('requires explicit discard authorization before resetting a dirty Image project', async () => {
    const liveDocument = {
      id: 'dirty-reset-image',
      title: 'Unsaved reset layers',
      width: 10,
      height: 10,
      layers: [],
      activeLayerId: null,
      hasSelection: false,
      selectionVersion: 0,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      dirty: true,
    } satisfies ImageDocument;
    useImageEditorStore.setState({ documents: [liveDocument], activeDocId: liveDocument.id });

    await expect(resetProjectDocument()).rejects.toThrow('dirty Image document');
    expect(useImageEditorStore.getState().documents).toEqual([liveDocument]);

    await resetProjectDocument({ allowDirtyImageReplacement: true });
    expect(useImageEditorStore.getState().documents).toEqual([]);
  });

  it('fails closed before project replacement when an unsaved Paper document is active', async () => {
    const paperStore = usePaperStore.getState();
    paperStore.addPage();
    expect(usePaperStore.getState().undoStack).not.toHaveLength(0);
    const before = usePaperStore.getState().document;

    await expect(restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'incoming-paper-project',
      name: 'Incoming Paper',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
    })).rejects.toThrow('active Paper document');

    expect(usePaperStore.getState().document).toEqual(before);
    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'incoming-paper-project',
      name: 'Incoming Paper',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
    }, { allowDirtyPaperReplacement: true });
  });

  it('serializes Image documents as a clean saved baseline without clearing live dirty state', async () => {
    const liveDocument = {
      id: 'dirty-project-save-image',
      title: 'Saved in project',
      width: 10,
      height: 10,
      layers: [],
      activeLayerId: null,
      hasSelection: false,
      selectionVersion: 0,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      dirty: true,
    } satisfies ImageDocument;
    useImageEditorStore.setState({ documents: [liveDocument], activeDocId: liveDocument.id });

    const saved = await buildCurrentProjectDocument({ id: 'saved-project', name: 'Saved Project' });

    expect(saved.imageEditor?.documents[0]?.dirty).toBe(false);
    expect(useImageEditorStore.getState().documents[0]?.dirty).toBe(true);
  });

  it('saves the current flow as the default main Flow workspace snapshot', async () => {
    useFlowStore.getState().replaceFlowSnapshot({
      nodes: [{ id: 'main-node', type: 'textNode', position: { x: 5, y: 6 }, data: { prompt: 'hello' } }],
      edges: [],
    });

    const saved = await buildCurrentProjectDocument({ id: 'project-1', name: 'Workspace Save' });

    expect(saved.flow.nodes.map((node) => node.id)).toEqual(['main-node']);
    expect(saved).toMatchObject({
      activeFlowWorkspaceId: 'main',
      flowWorkspaces: [
        expect.objectContaining({
          id: 'main',
          name: 'Main Flow',
          flow: {
            version: 3,
            nodes: [expect.objectContaining({ id: 'main-node' })],
            edges: [],
          },
        }),
      ],
    });
  });

  it('saves inactive Flow workspaces from the registry while using the active runtime snapshot for the selected workspace', async () => {
    useFlowWorkspaceStore.getState().hydrateProjectSnapshot({
      activeWorkspaceId: 'alt',
      workspaces: [
        {
          id: 'main',
          name: 'Main Flow',
          createdAt: 1,
          updatedAt: 2,
          flow: {
            version: 3,
            nodes: [{ id: 'main-node', type: 'textNode', position: { x: 1, y: 2 }, data: {} }],
            edges: [],
          },
        },
        {
          id: 'alt',
          name: 'Alt Flow',
          createdAt: 3,
          updatedAt: 4,
          flow: {
            version: 3,
            nodes: [{ id: 'stale-alt-node', type: 'textNode', position: { x: 3, y: 4 }, data: {} }],
            edges: [],
          },
        },
      ],
    });
    useFlowStore.getState().replaceFlowSnapshot({
      nodes: [{ id: 'runtime-alt-node', type: 'textNode', position: { x: 7, y: 8 }, data: { prompt: 'runtime' } }],
      edges: [],
    });

    const saved = await buildCurrentProjectDocument({ id: 'project-2', name: 'Registry Save' });

    expect(saved.activeFlowWorkspaceId).toBe('alt');
    expect(saved.flowWorkspaces?.map((workspace) => workspace.id)).toEqual(['main', 'alt']);
    expect(saved.flowWorkspaces?.find((workspace) => workspace.id === 'main')?.flow.nodes.map((node) => node.id)).toEqual(['main-node']);
    expect(saved.flowWorkspaces?.find((workspace) => workspace.id === 'alt')?.flow.nodes.map((node) => node.id)).toEqual(['runtime-alt-node']);
  });

  it('restores source-bin media before the flow snapshot so reopened nodes can hydrate saved assets', async () => {
    const calls: string[] = [];
    useSourceBinStore.setState({
      restoreProjectSnapshot: async () => {
        calls.push('sourceBin');
      },
    });
    useFlowStore.setState({
      replaceFlowSnapshot: (snapshot) => {
        calls.push('flow');
        originalReplaceFlowSnapshot(snapshot);
      },
      restoreImportedAssets: async () => {
        calls.push('flowAssets');
      },
    });

    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'p1',
      name: 'Restore Order',
      savedAt: 1,
      flow: {
        version: 3,
        nodes: [{ id: 'incoming', type: 'imageGen', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
      sourceBin: { dismissedSourceKeys: [] },
    });

    expect(calls).toEqual(['sourceBin', 'flow', 'flowAssets']);
  });

  it('migrates legacy inline Paper assets before restoring the Paper workspace', async () => {
    const base = createDefaultPaperDocument({ title: 'Legacy restore' });
    const legacyDocument = addFrameToPaperPage(base, base.pages[0].id, {
      id: 'legacy-panel',
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 40,
      heightMm: 30,
      asset: {
        label: 'Legacy panel',
        kind: 'image',
        src: 'data:image/png;base64,AQID',
      },
    } as never).document;

    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'paper-legacy-project',
      name: 'Legacy Paper Restore',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
      sourceBin: { dismissedSourceKeys: [] },
      paper: {
        document: legacyDocument,
        selectedPageId: legacyDocument.pages[0].id,
        tool: 'select',
        zoom: 0.8,
      },
    });

    const asset = usePaperStore.getState().document.pages[0].frames.find((frame) => frame.id === 'legacy-panel')?.asset;
    expect(asset?.locator).toMatchObject({ kind: 'managed' });
    expect(JSON.stringify(usePaperStore.getState().document)).not.toMatch(/data:image|base64/i);
    const ref = asset?.locator?.kind === 'managed' ? asset.locator.ref : undefined;
    expect(ref).toBeDefined();
    expect(await paperAssetRepository.get(ref!.id)).toMatchObject({ bytes: new Uint8Array([1, 2, 3]) });
    await paperAssetRepository.delete(ref!.id);
  });

  it('reopens a saved project without blanking Paper after normalization remaps a migrated managed image', async () => {
    const base = createDefaultPaperDocument({ title: 'Migrated Link' });
    const legacyDocument = addFrameToPaperPage(base, base.pages[0].id, {
      id: 'linked-panel',
      kind: 'image',
      xMm: 5,
      yMm: 5,
      widthMm: 40,
      heightMm: 30,
      asset: {
        sourceBinItemId: 'source-image-1',
        label: 'Linked panel',
        kind: 'image',
        src: 'data:image/png;base64,AQID',
      },
    } as never).document;
    let managedRefId: string | undefined;

    try {
      // A pre-normalization save: the linked Source Library item has no durable URL yet,
      // so the inline bytes migrate into the managed repository on restore.
      await restoreProjectDocument({
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        id: 'fbl-001-project',
        name: 'Managed Link Round Trip',
        savedAt: 1,
        flow: { version: 3, nodes: [], edges: [] },
        sourceBin: {
          bins: [{
            id: 'default',
            name: 'Source Library',
            collapsed: false,
            createdAt: 1,
            items: [{
              id: 'source-image-1',
              label: 'Linked panel',
              kind: 'image',
              mimeType: 'image/png',
              nativeFilePath: '/tmp/sloom-tests/panel-one.png',
              createdAt: 1,
            }],
          }],
          dismissedSourceKeys: [],
        },
        paper: {
          document: legacyDocument,
          selectedPageId: legacyDocument.pages[0].id,
          tool: 'select',
          zoom: 0.8,
        },
      });

      const migratedAsset = usePaperStore.getState().document.pages[0].frames
        .find((frame) => frame.id === 'linked-panel')?.asset;
      expect(migratedAsset?.locator?.kind).toBe('managed');
      expect(migratedAsset?.sourceBinItemId).toBe('source-image-1');
      managedRefId = migratedAsset?.locator?.kind === 'managed' ? migratedAsset.locator.ref.id : undefined;

      // The linked item later gains a durable external URL (ingest / native reconcile).
      useSourceBinStore.setState((state) => ({
        bins: state.bins.map((bin) => ({
          ...bin,
          items: bin.items.map((item) => item.id === 'source-image-1'
            ? { ...item, assetUrl: 'signal-loom-asset://file/panel-one' }
            : item),
        })),
      }));

      const saved = await buildCurrentProjectDocument({ id: 'fbl-001-project', name: 'Managed Link Round Trip' });
      await restoreProjectDocument(JSON.parse(JSON.stringify(saved)));

      const reopenedDocument = usePaperStore.getState().document;
      expect(reopenedDocument.title).toBe('Migrated Link');
      const reopenedAsset = reopenedDocument.pages[0]?.frames.find((frame) => frame.id === 'linked-panel')?.asset;
      expect(reopenedAsset?.sourceBinItemId).toBe('source-image-1');
      expect(reopenedAsset?.locator).toEqual({ kind: 'external', url: 'signal-loom-asset://file/panel-one' });

      // A second save/reopen after the remap must stay intact as well.
      const savedAgain = await buildCurrentProjectDocument({ id: 'fbl-001-project', name: 'Managed Link Round Trip' });
      await restoreProjectDocument(JSON.parse(JSON.stringify(savedAgain)));
      expect(usePaperStore.getState().document.title).toBe('Migrated Link');
      expect(usePaperStore.getState().document.pages[0]?.frames.some((frame) => frame.id === 'linked-panel')).toBe(true);
    } finally {
      if (managedRefId) await paperAssetRepository.delete(managedRefId as never).catch(() => undefined);
      usePaperStore.getState().restoreSnapshot(undefined);
      await useSourceBinStore.getState().restoreProjectSnapshot(undefined).catch(() => undefined);
    }
  });

  it('preserves valid Paper tabs plus recovery info across reopen and a second save when one tab is corrupt', async () => {
    const documentA = { ...createDefaultPaperDocument({ title: 'Tab A' }), id: 'paper-a' };
    const documentB = { ...createDefaultPaperDocument({ title: 'Tab B' }), id: 'paper-b' };

    try {
      await restoreProjectDocument({
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        id: 'fbl-002-project',
        name: 'Quarantine Round Trip',
        savedAt: 1,
        flow: { version: 3, nodes: [], edges: [] },
        sourceBin: { dismissedSourceKeys: [] },
        paper: {
          document: documentA,
          documents: [
            { id: 'tab-a', document: documentA, tool: 'select', zoom: 0.8 },
            { id: 'tab-broken', document: { id: 'paper-broken', title: 'Broken tab', pages: 'not-an-array' }, tool: 'select', zoom: 0.8 },
            { id: 'tab-b', document: documentB, tool: 'select', zoom: 0.8 },
          ],
          activeDocumentId: 'tab-a',
        },
      });

      const paperState = usePaperStore.getState();
      expect(paperState.documents.map((candidate) => candidate.id)).toEqual(['tab-a', 'tab-b']);
      expect(paperState.document.title).toBe('Tab A');
      expect(paperState.recovery?.quarantinedDocuments).toHaveLength(1);
      expect(paperState.recovery?.quarantinedDocuments[0]).toMatchObject({
        id: 'tab-broken',
        reason: 'malformed-document',
      });
      expect(paperState.recovery?.quarantinedDocuments[0]?.payloadJson).toContain('Broken tab');

      // A resave after recovery must keep the valid tabs and carry the quarantined
      // payload so the corrupt tab remains recoverable instead of silently destroyed.
      const savedAfterRecovery = await buildCurrentProjectDocument({ id: 'fbl-002-project', name: 'Quarantine Round Trip' });
      expect(savedAfterRecovery.paper?.documents?.map((candidate) => candidate.id)).toEqual(['tab-a', 'tab-b']);
      expect(savedAfterRecovery.paper?.recovery?.quarantinedDocuments).toHaveLength(1);

      await restoreProjectDocument(JSON.parse(JSON.stringify(savedAfterRecovery)));
      expect(usePaperStore.getState().documents.map((candidate) => candidate.id)).toEqual(['tab-a', 'tab-b']);
      expect(usePaperStore.getState().document.title).toBe('Tab A');
      expect(usePaperStore.getState().recovery?.quarantinedDocuments).toHaveLength(1);
    } finally {
      usePaperStore.getState().restoreSnapshot(undefined);
    }
  });

  it('does not republish a restored project snapshot back to the native Source Library bridge', async () => {
    const calls: unknown[][] = [];
    useSourceBinStore.setState({
      restoreProjectSnapshot: async (...args: unknown[]) => {
        calls.push(args);
      },
    });

    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'p1',
      name: 'Native Restore',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
      sourceBin: {
        bins: [{
          id: 'default',
          name: 'Source Library',
          collapsed: false,
          createdAt: 1,
          items: [],
        }],
        dismissedSourceKeys: [],
      },
    });

    expect(calls[0]?.[1]).toEqual({ publishNative: false });
  });

  it('rolls back flow mutations when a later store restore fails', async () => {
    useFlowStore.getState().replaceFlowSnapshot({
      nodes: [{ id: 'existing', type: 'textNode', position: { x: 5, y: 6 }, data: { prompt: 'keep' } }],
      edges: [],
    });
    useSourceBinStore.setState({
      restoreProjectSnapshot: async () => {
        throw new Error('source bin failed');
      },
    });

    await expect(restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'p1',
      name: 'Rollback',
      savedAt: 1,
      flow: {
        version: 3,
        nodes: [{ id: 'incoming', type: 'imageGen', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
      sourceBin: { dismissedSourceKeys: [] },
    })).rejects.toThrow('could not be restored safely');

    expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['existing']);
  });

  it('keeps live Image bitmaps when a restore fails after the image section (lossless rollback)', async () => {
    // A failed restore must put back the EXACT live document objects — a
    // pixel-stripped snapshot rollback would blank every open Image canvas.
    const liveBitmap = { __live: 'pixels' } as unknown as NonNullable<ImageDocument['layers'][number]['bitmap']>;
    const liveDocument = {
      id: 'doc-live',
      name: 'Live Art',
      width: 64,
      height: 64,
      activeLayerId: 'layer-live',
      layers: [{
        id: 'layer-live', name: 'Layer 1', type: 'image', visible: true, locked: false,
        opacity: 1, blendMode: 'normal', x: 0, y: 0, bitmap: liveBitmap, bitmapVersion: 3, mask: null,
      }],
      snapshots: [],
    } as unknown as ImageDocument;
    useImageEditorStore.setState({ documents: [liveDocument], activeDocId: 'doc-live' });
    const originalReconcile = useSourceBinStore.getState().reconcileWithNativeSourceLibrarySnapshot;
    useSourceBinStore.setState({
      reconcileWithNativeSourceLibrarySnapshot: async () => {
        throw new Error('reconcile failed');
      },
    });

    try {
      await expect(restoreProjectDocument({
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        id: 'p2',
        name: 'Image Rollback',
        savedAt: 1,
        flow: { version: 3, nodes: [], edges: [] },
        sourceBin: { dismissedSourceKeys: [] },
      })).rejects.toThrow('could not be restored safely');

      const documents = useImageEditorStore.getState().documents;
      expect(documents).toHaveLength(1);
      expect(documents[0].id).toBe('doc-live');
      expect(documents[0].layers[0].bitmap).toBe(liveBitmap);
      expect(useImageEditorStore.getState().activeDocId).toBe('doc-live');
    } finally {
      useSourceBinStore.setState({ reconcileWithNativeSourceLibrarySnapshot: originalReconcile });
      useImageEditorStore.getState().restoreProjectSnapshot(undefined);
    }
  });

  it('rejects corrupt live Image layer payloads before replacement and preserves pixels, history, and selection', async () => {
    const liveBitmap = { width: 9, height: 7, __live: 'editable' } as unknown as NonNullable<ImageDocument['layers'][number]['bitmap']>;
    const liveDocument = {
      id: 'project-corruption-live',
      title: 'Keep this edit',
      width: 9,
      height: 7,
      activeLayerId: 'live-layer',
      layers: [{
        id: 'live-layer', name: 'Live', type: 'image', visible: true, locked: false,
        opacity: 1, blendMode: 'normal', x: 0, y: 0, bitmap: liveBitmap, bitmapVersion: 1, mask: null,
      }],
      hasSelection: true,
      selectionVersion: 2,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      dirty: false,
      snapshots: [],
    } as ImageDocument;
    const selection = createMask(9, 7);
    selection.data.set([0, 255, 17, 99], 12);
    setSelection(liveDocument.id, selection);
    const historyEntry = { kind: 'selection', docId: liveDocument.id, before: null, after: null } as const;
    useImageEditorStore.setState({
      documents: [liveDocument],
      activeDocId: liveDocument.id,
      undoStacks: { [liveDocument.id]: [historyEntry] },
      redoStacks: {},
    });
    const originalDecode = defaultImageLayerPixelCodec.decode;
    defaultImageLayerPixelCodec.decode = async () => {
      throw new Error('corrupt incoming bitmap');
    };

    try {
      await expect(restoreProjectDocument({
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        id: 'corrupt-image-project',
        name: 'Corrupt Image',
        savedAt: 1,
        flow: { version: 3, nodes: [], edges: [] },
        sourceBin: { dismissedSourceKeys: [] },
        imageEditor: {
          activeDocId: 'incoming-image',
          documents: [{
            id: 'incoming-image', title: 'Incoming', width: 2, height: 2,
            layers: [{
              id: 'incoming-layer', name: 'Incoming', type: 'image', visible: true, locked: false,
              opacity: 1, blendMode: 'normal', x: 0, y: 0, bitmap: null, mask: null,
              bitmapData: 'data:image/png;base64,corrupt', bitmapVersion: 0,
            }],
            activeLayerId: 'incoming-layer', hasSelection: false, selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 }, dirty: false,
          }],
        },
      })).rejects.toThrow('corrupt incoming bitmap');

      const restoredState = useImageEditorStore.getState();
      expect(restoredState.documents).toEqual([liveDocument]);
      expect(restoredState.documents[0].layers[0].bitmap).toBe(liveBitmap);
      expect(restoredState.undoStacks[liveDocument.id]).toEqual([historyEntry]);
      expect(Array.from(getSelection(liveDocument.id)?.data ?? [])).toEqual(Array.from(selection.data));
    } finally {
      defaultImageLayerPixelCodec.decode = originalDecode;
    }
  });

  it('restores the declared active Flow workspace instead of a stale top-level flow snapshot', async () => {
    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'p1',
      name: 'Active Workspace Restore',
      savedAt: 1,
      flow: {
        version: 3,
        nodes: [{ id: 'stale-node', type: 'textNode', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      },
      activeFlowWorkspaceId: 'alt',
      flowWorkspaces: [
        {
          id: 'main',
          name: 'Main Flow',
          createdAt: 10,
          updatedAt: 11,
          flow: {
            version: 3,
            nodes: [{ id: 'main-node', type: 'textNode', position: { x: 10, y: 20 }, data: {} }],
            edges: [],
          },
        },
        {
          id: 'alt',
          name: 'Alt Flow',
          createdAt: 20,
          updatedAt: 21,
          flow: {
            version: 3,
            nodes: [{ id: 'alt-node', type: 'textNode', position: { x: 30, y: 40 }, data: {} }],
            edges: [],
          },
        },
      ],
      sourceBin: { dismissedSourceKeys: [] },
    });

    expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['alt-node']);
    expect(useFlowWorkspaceStore.getState().activeWorkspaceId).toBe('alt');
    expect(useFlowWorkspaceStore.getState().workspaces.map((workspace) => workspace.id)).toEqual(['main', 'alt']);
  });

  it('saves and restores the project-level usage ledger', async () => {
    useProjectUsageStore.getState().recordUsage({
      nodeId: 'image-1',
      nodeType: 'imageGen',
      nodeData: { imageOperation: 'mask-inpaint' },
      workspace: 'flow',
      usage: {
        source: 'actual',
        confidence: 'measured',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        costUsd: 0.05,
      },
      createdAt: 100,
    });

    const saved = await buildCurrentProjectDocument({ id: 'project-1', name: 'Spend Test' });
    expect(saved.usageLedger?.entries).toHaveLength(1);

    useProjectUsageStore.getState().restoreSnapshot(undefined);
    await restoreProjectDocument({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      id: 'project-1',
      name: 'Spend Test',
      savedAt: 1,
      flow: { version: 3, nodes: [], edges: [] },
      sourceBin: { dismissedSourceKeys: [] },
      usageLedger: saved.usageLedger,
    });

    expect(useProjectUsageStore.getState().summary.totalKnownCostUsd).toBe(0.05);
  });
});
