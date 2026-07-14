import { afterEach, describe, expect, it } from 'vitest';
import { useFlowStore } from '../store/flowStore';
import { useProjectUsageStore } from '../store/projectUsageStore';
import { useSourceBinStore } from '../store/sourceBinStore';
import { useFlowWorkspaceStore } from '../store/flowWorkspaceStore';
import { buildCurrentProjectDocument, restoreProjectDocument } from './projectDocumentActions';
import { CURRENT_PROJECT_SCHEMA_VERSION } from './projectSchema';
import { useImageEditorStore } from '../store/imageEditorStore';
import type { ImageDocument } from '../types/imageEditor';
import { usePaperStore } from '../store/paperStore';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';

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
});

describe('restoreProjectDocument', () => {
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
