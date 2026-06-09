import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, NodeChange } from '@xyflow/react';
import { readFileSync } from 'node:fs';
import type { AppNode } from '../types/flow';
import {
  collectTextInputs as storeCollectTextInputs,
  collectImageMaskInput as storeCollectImageMaskInput,
  collectUpstreamImageInput as storeCollectUpstreamImageInput,
  collectUpstreamImageInputForHandles as storeCollectUpstreamImageInputForHandles,
  canRunNode as storeCanRunNode,
} from './flowStore';
import {
  collectTextInputs as costCollectTextInputs,
  collectUpstreamImageInput as costCollectUpstreamImageInput,
  collectUpstreamImageInputForHandles as costCollectUpstreamImageInputForHandles,
  canRunNode as costCanRunNode,
} from '../lib/costEstimation';
import { useConfirmationStore } from './confirmationStore';
import { useFlowStore } from './flowStore';
import { useSourceBinStore } from './sourceBinStore';

function createNode(id: string, type: AppNode['type'], data: Record<string, unknown> = {}): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as AppNode;
}

function buildNodeMap(nodes: AppNode[]): Map<string, AppNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function buildIncomingMap(edges: Edge[]): Map<string, string[]> {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = incoming.get(edge.target) ?? [];
    existing.push(edge.source);
    incoming.set(edge.target, existing);
  }
  return incoming;
}

describe('flow store package and envelope input gathering', () => {
  it('correctly resolves text and image payloads from an upstream packageNode connected to an imageGen', () => {
    const nodes = [
      createNode('text-1', 'textNode', {
        mode: 'prompt',
        prompt: 'A majestic blue butterfly on a rose',
      }),
      createNode('image-1', 'imageGen', {
        mediaMode: 'import',
        sourceAssetUrl: 'data:image/png;base64,STYLEIMAGE',
        modelId: 'image-model',
      }),
      createNode('pkg-1', 'packageNode', {
        customTitle: 'Butterfly Preset',
      }),
      createNode('target-gen', 'imageGen', {}),
    ];

    const edges: Edge[] = [
      { id: 'edge-text', source: 'text-1', target: 'pkg-1', targetHandle: 'text' },
      { id: 'edge-image', source: 'image-1', target: 'pkg-1', targetHandle: 'image' },
      { id: 'edge-pkg', source: 'pkg-1', target: 'target-gen', targetHandle: 'image-edit-source' },
    ];

    const nodesById = buildNodeMap(nodes);
    const incoming = buildIncomingMap(edges);

    // 1. Verify flowStore versions
    const storePrompt = storeCollectTextInputs('target-gen', nodesById, incoming, edges);
    const storeImg = storeCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(storePrompt).toBe('A majestic blue butterfly on a rose');
    expect(storeImg).toBe('data:image/png;base64,STYLEIMAGE');

    // 2. Verify costEstimation versions
    const costPrompt = costCollectTextInputs('target-gen', nodesById, incoming, edges);
    const costImg = costCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(costPrompt).toBe('A majestic blue butterfly on a rose');
    expect(costImg).toBe('data:image/png;base64,STYLEIMAGE');
  });

  it('correctly resolves text and image payloads from an upstream envelope with individual text and image items', () => {
    const nodes = [
      createNode('envelope-1', 'envelope', {
        envelopeItems: [
          {
            id: 'item-text',
            index: 0,
            kind: 'text',
            label: 'Prompt',
            value: 'Detailed cybernetic forest, neon lighting',
          },
          {
            id: 'item-img',
            index: 1,
            kind: 'image',
            label: 'Layout Guide',
            value: 'data:image/png;base64,LAYOUTIMAGE',
          },
        ],
      }),
      createNode('target-gen', 'imageGen', {}),
    ];

    const edges: Edge[] = [
      { id: 'edge-env', source: 'envelope-1', target: 'target-gen', targetHandle: 'image-edit-source' },
    ];

    const nodesById = buildNodeMap(nodes);
    const incoming = buildIncomingMap(edges);

    // 1. Verify flowStore versions
    const storePrompt = storeCollectTextInputs('target-gen', nodesById, incoming, edges);
    const storeImg = storeCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(storePrompt).toBe('Detailed cybernetic forest, neon lighting');
    expect(storeImg).toBe('data:image/png;base64,LAYOUTIMAGE');

    // 2. Verify costEstimation versions
    const costPrompt = costCollectTextInputs('target-gen', nodesById, incoming, edges);
    const costImg = costCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(costPrompt).toBe('Detailed cybernetic forest, neon lighting');
    expect(costImg).toBe('data:image/png;base64,LAYOUTIMAGE');
  });

  it('correctly resolves text and image payloads from an upstream envelope containing a package item', () => {
    const nodes = [
      createNode('envelope-1', 'envelope', {
        envelopeItems: [
          {
            id: 'item-package',
            index: 0,
            kind: 'package',
            label: 'Cyber Preset',
            value: 'data:image/png;base64,CYBERIMAGE',
            text: 'Cyberpunk street view, volumetric fog',
          },
        ],
      }),
      createNode('target-gen', 'imageGen', {}),
    ];

    const edges: Edge[] = [
      { id: 'edge-env', source: 'envelope-1', target: 'target-gen', targetHandle: 'image-edit-source' },
    ];

    const nodesById = buildNodeMap(nodes);
    const incoming = buildIncomingMap(edges);

    // 1. Verify flowStore versions
    const storePrompt = storeCollectTextInputs('target-gen', nodesById, incoming, edges);
    const storeImg = storeCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(storePrompt).toBe('Cyberpunk street view, volumetric fog');
    expect(storeImg).toBe('data:image/png;base64,CYBERIMAGE');

    // 2. Verify costEstimation versions
    const costPrompt = costCollectTextInputs('target-gen', nodesById, incoming, edges);
    const costImg = costCollectUpstreamImageInput('target-gen', nodesById, edges);

    expect(costPrompt).toBe('Cyberpunk street view, volumetric fog');
    expect(costImg).toBe('data:image/png;base64,CYBERIMAGE');
  });

  it('correctly asserts that packageNode and envelope are not executable nodes', () => {
    const pkgNode = createNode('pkg-1', 'packageNode');
    const envNode = createNode('env-1', 'envelope');
    const imgGenNode = createNode('img-1', 'imageGen', { mediaMode: 'generate' });

    expect(storeCanRunNode(pkgNode)).toBe(false);
    expect(storeCanRunNode(envNode)).toBe(false);
    expect(storeCanRunNode(imgGenNode)).toBe(true);

    expect(costCanRunNode(pkgNode)).toBe(false);
    expect(costCanRunNode(envNode)).toBe(false);
    expect(costCanRunNode(imgGenNode)).toBe(true);
  });

  it('treats color swatches as textual prompt context instead of image inputs', () => {
    const nodes = [
      createNode('swatch-1', 'colorSwatchNode' as AppNode['type'], {
        colorSwatchColors: ['#0f172a', '#38bdf8'],
        colorSwatchUsageMode: 'theme',
      }),
      createNode('target-gen', 'imageGen', {}),
    ];

    const edges: Edge[] = [
      { id: 'edge-swatch', source: 'swatch-1', target: 'target-gen', targetHandle: 'image-edit-source' },
    ];

    const nodesById = buildNodeMap(nodes);
    const incoming = buildIncomingMap(edges);

    const expectedPrompt =
      'Color swatch: #0F172A, #38BDF8. Follow this palette as the overall mood and theme while allowing supporting neutrals.';

    expect(storeCollectTextInputs('target-gen', nodesById, incoming, edges)).toBe(expectedPrompt);
    expect(costCollectTextInputs('target-gen', nodesById, incoming, edges)).toBe(expectedPrompt);
    expect(storeCollectUpstreamImageInput('target-gen', nodesById, edges)).toBeUndefined();
    expect(costCollectUpstreamImageInput('target-gen', nodesById, edges)).toBeUndefined();
    expect(storeCanRunNode(nodes[0])).toBe(false);
    expect(costCanRunNode(nodes[0])).toBe(false);
  });

  it('uses node-painted masks for mask-aware image nodes when no mask is connected', () => {
    const nodes = [
      createNode('target-gen', 'imageGen', {
        provider: 'stability',
        modelId: 'stable-image-edit-inpaint',
        imageOperation: 'mask-inpaint',
        imagePaintedMaskDataUrl: 'data:image/png;base64,UEFJTlRFRA==',
      }),
    ];

    expect(storeCollectImageMaskInput('target-gen', buildNodeMap(nodes), [])).toBe(
      'data:image/png;base64,UEFJTlRFRA==',
    );
  });

  it('keeps connected masks ahead of node-painted masks', () => {
    const nodes = [
      createNode('mask-source', 'imageGen', {
        mediaMode: 'import',
        sourceAssetUrl: 'data:image/png;base64,Q09OTkVDVEVE',
      }),
      createNode('target-gen', 'imageGen', {
        provider: 'openai',
        modelId: 'gpt-image-2',
        imagePaintedMaskDataUrl: 'data:image/png;base64,UEFJTlRFRA==',
      }),
    ];
    const edges: Edge[] = [
      { id: 'mask-edge', source: 'mask-source', target: 'target-gen', targetHandle: 'image-mask' },
    ];

    expect(storeCollectImageMaskInput('target-gen', buildNodeMap(nodes), edges)).toBe(
      'data:image/png;base64,Q09OTkVDVEVE',
    );
  });

  it('does not submit node-painted masks for outpaint-only image nodes', () => {
    const nodes = [
      createNode('target-gen', 'imageGen', {
        provider: 'stability',
        modelId: 'stable-image-edit-outpaint',
        imageOperation: 'outpaint',
        imagePaintedMaskDataUrl: 'data:image/png;base64,UEFJTlRFRA==',
      }),
    ];

    expect(storeCollectImageMaskInput('target-gen', buildNodeMap(nodes), [])).toBeUndefined();
  });

  it('treats crop image nodes as runnable image producers for downstream image inputs', () => {
    const nodes = [
      createNode('source-image', 'imageGen', {
        mediaMode: 'import',
        sourceAssetUrl: 'data:image/png;base64,U09VUkNF',
      }),
      createNode('crop-1', 'cropImageNode' as AppNode['type'], {
        result: 'data:image/png;base64,Q1JPUFBFRA==',
        resultType: 'image',
      }),
      createNode('target-gen', 'imageGen', {}),
    ];
    const edges: Edge[] = [
      { id: 'source-crop', source: 'source-image', target: 'crop-1', targetHandle: 'image' },
      { id: 'crop-target', source: 'crop-1', target: 'target-gen', targetHandle: 'image-edit-source' },
    ];

    expect(storeCanRunNode(nodes[1])).toBe(true);
    expect(costCanRunNode(nodes[1])).toBe(true);
    expect(storeCollectUpstreamImageInput('target-gen', buildNodeMap(nodes), edges)).toBe(
      'data:image/png;base64,Q1JPUFBFRA==',
    );
    expect(costCollectUpstreamImageInput('target-gen', buildNodeMap(nodes), edges)).toBe(
      'data:image/png;base64,Q1JPUFBFRA==',
    );
  });

  it('correctly resolves subject image and reference image inputs for visionVerifyNode', () => {
    const nodes = [
      createNode('subject-img', 'imageGen', {
        mediaMode: 'import',
        sourceAssetUrl: 'data:image/png;base64,SUBJECT_DATA',
      }),
      createNode('reference-img', 'imageGen', {
        mediaMode: 'import',
        sourceAssetUrl: 'data:image/png;base64,REFERENCE_DATA',
      }),
      createNode('verify-node', 'visionVerifyNode', {}),
    ];

    const edges: Edge[] = [
      { id: 'edge-sub', source: 'subject-img', target: 'verify-node', targetHandle: 'image' },
      { id: 'edge-ref', source: 'reference-img', target: 'verify-node', targetHandle: 'refImage' },
    ];

    const nodesById = buildNodeMap(nodes);

    // 1. Verify flowStore versions
    const storeSubject = storeCollectUpstreamImageInput('verify-node', nodesById, edges);
    const storeRef = storeCollectUpstreamImageInputForHandles('verify-node', ['refImage'], nodesById, edges);

    expect(storeSubject).toBe('data:image/png;base64,SUBJECT_DATA');
    expect(storeRef).toBe('data:image/png;base64,REFERENCE_DATA');

    // 2. Verify costEstimation versions
    const costSubject = costCollectUpstreamImageInput('verify-node', nodesById, edges);
    const costRef = costCollectUpstreamImageInputForHandles('verify-node', ['refImage'], nodesById, edges);

    expect(costSubject).toBe('data:image/png;base64,SUBJECT_DATA');
    expect(costRef).toBe('data:image/png;base64,REFERENCE_DATA');
  });
});

describe('flow store async confirmations', () => {
  beforeEach(() => {
    useFlowStore.setState({
      nodes: [],
      edges: [],
      bookmarkSidebarOpen: true,
    });
    useSourceBinStore.setState({
      bins: [{ id: 'default', name: 'Source Library', items: [], collapsed: false, createdAt: 1 }],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      nativeSyncStatus: { state: 'idle' },
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
    });
    useConfirmationStore.setState({ activeRequest: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the themed confirmation store instead of native confirm when node deletion would orphan generated assets', async () => {
    const requestConfirmation = vi.fn().mockResolvedValue(false);
    useConfirmationStore.setState({ requestConfirmation });
    const nativeConfirm = vi.fn(() => {
      throw new Error('Flow deletion should not use window.confirm');
    });
    vi.stubGlobal('window', { confirm: nativeConfirm });

    useFlowStore.setState({
      nodes: [createNode('image-node', 'imageGen', { result: 'data:image/png;base64,AAAA' })],
    });
    useSourceBinStore.setState({
      bins: [{
        id: 'default',
        name: 'Source Library',
        collapsed: false,
        createdAt: 1,
        items: [{
          id: 'generated-asset',
          label: 'Generated image',
          kind: 'image',
          mimeType: 'image/png',
          assetUrl: 'data:image/png;base64,AAAA',
          originNodeId: 'image-node',
          createdAt: 2,
          isGenerated: true,
        }],
      }],
    });

    await useFlowStore.getState().onNodesChange([
      { type: 'remove', id: 'image-node' } as NodeChange<AppNode>,
    ]);

    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.stringContaining('orphan 1 generated asset'),
      'Generated Asset Cleanup',
    );
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(useFlowStore.getState().nodes).toHaveLength(0);
    expect(useSourceBinStore.getState().getAllItems()).toHaveLength(1);
  });

  it('uses the themed confirmation store when selected nodes are deleted by keyboard or menu commands', async () => {
    const requestConfirmation = vi.fn().mockResolvedValue(true);
    useConfirmationStore.setState({ requestConfirmation });

    useFlowStore.setState({
      nodes: [{
        ...createNode('image-node', 'imageGen', {
        result: 'data:image/png;base64,AAAA',
        }),
        selected: true,
      }],
    });
    useSourceBinStore.setState({
      bins: [{
        id: 'default',
        name: 'Source Library',
        collapsed: false,
        createdAt: 1,
        items: [{
          id: 'generated-asset',
          label: 'Generated image',
          kind: 'image',
          mimeType: 'image/png',
          assetUrl: 'data:image/png;base64,AAAA',
          originNodeId: 'image-node',
          createdAt: 2,
          isGenerated: true,
        }],
      }],
    });

    const deleted = await useFlowStore.getState().deleteSelection();

    expect(deleted).toBe(true);
    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.stringContaining('orphan 1 generated asset'),
      'Generated Asset Cleanup',
    );
    expect(useFlowStore.getState().nodes).toHaveLength(0);
    expect(useSourceBinStore.getState().getAllItems()).toHaveLength(0);
  });

  it('does not reintroduce native confirm in Flow store guardrails', () => {
    const source = readFileSync(new URL('./flowStore.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('window.confirm');
  });
});
