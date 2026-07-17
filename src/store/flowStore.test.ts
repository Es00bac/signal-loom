import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, NodeChange } from '@xyflow/react';
import { readFileSync } from 'node:fs';
import type { AppNode } from '../types/flow';
import {
  collectTextInputs as storeCollectTextInputs,
  collectImageMaskInput as storeCollectImageMaskInput,
  collectUpstreamImageInput as storeCollectUpstreamImageInput,
  collectUpstreamImageInputForHandles as storeCollectUpstreamImageInputForHandles,
  collectTextMediaInputs as storeCollectTextMediaInputs,
  canRunNode as storeCanRunNode,
  getExecutionDependencies as storeGetExecutionDependencies,
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
import * as flowExecution from '../lib/flowExecution';
import { createDefaultFunctionNodeConfig } from '../lib/functionNodes';
import { API_REQUESTER_PERSISTED_CREDENTIAL_MARKER } from '../lib/apiRequesterCredentials';

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
  it('classifies API Requester as runnable and recursively reaches it from Run Me exactly once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    useConfirmationStore.setState({ requestConfirmation: vi.fn().mockResolvedValue(true) });
    useFlowStore.setState({
      nodes: [
        createNode('request', 'apiFetchNode', {
          url: 'https://example.test/data',
          declaredOutputType: 'text',
        }),
        createNode('run-me', 'runMeNode'),
      ],
      edges: [{ id: 'request-run-me', source: 'request', target: 'run-me' }],
    });
    useFlowStore.getState().hydratePersistedState();

    const request = useFlowStore.getState().nodes.find((node) => node.id === 'request')!;
    expect(storeCanRunNode(request)).toBe(true);
    expect(storeGetExecutionDependencies(
      useFlowStore.getState().nodes.find((node) => node.id === 'run-me')!,
      useFlowStore.getState().edges,
      buildNodeMap(useFlowStore.getState().nodes),
    )).toEqual(['request']);

    await useFlowStore.getState().runNode('run-me');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'request')?.data).toMatchObject({
      result: '{"ok":true}',
      resultType: 'text',
      usage: { source: 'actual', confidence: 'unknown' },
    });
    expect(useSourceBinStore.getState().getAllItems().filter((item) => item.originNodeId === 'request')).toEqual([]);
  });

  it('redacts URL userinfo and credential fields from browser export and Electron project snapshots without overredacting creative fields', () => {
    useFlowStore.setState({
      nodes: [createNode('request', 'apiFetchNode', {
        url: 'https://alice:top-secret@example.test/data?client_secret=client-secret&refresh_token=refresh-secret&colorToken=teal&cameraToken=close-up',
        headers: 'Authorization: Bearer top-secret\nApi-Key: api-key-secret\nX-Client-Secret: client-secret\nX-Trace: safe',
        body: '{"prompt":"keep [redacted] editorial text safe","apiKey":"body-api-secret","nested":{"client_secret":"body-client-secret","refresh_token":"body-refresh-secret"},"colorToken":"teal","cameraToken":"close-up"}',
      })],
      edges: [],
    });

    const exported = useFlowStore.getState().exportFlow();
    const snapshot = useFlowStore.getState().exportProjectFlowSnapshot();
    expect(exported).not.toContain('top-secret');
    expect(exported).not.toContain('api-key-secret');
    expect(exported).not.toContain('client-secret');
    expect(exported).not.toContain('body-api-secret');
    expect(exported).not.toContain('body-client-secret');
    expect(exported).not.toContain('body-refresh-secret');
    expect(exported).not.toContain('refresh-secret');
    expect(snapshot.nodes[0]?.data).toMatchObject({
      headers: `Authorization: ${API_REQUESTER_PERSISTED_CREDENTIAL_MARKER}\nApi-Key: ${API_REQUESTER_PERSISTED_CREDENTIAL_MARKER}\nX-Client-Secret: ${API_REQUESTER_PERSISTED_CREDENTIAL_MARKER}\nX-Trace: safe`,
    });
    const persistedUrl = new URL(String(snapshot.nodes[0]?.data.url));
    expect(persistedUrl.username).toBe(API_REQUESTER_PERSISTED_CREDENTIAL_MARKER);
    expect(persistedUrl.password).toBe(API_REQUESTER_PERSISTED_CREDENTIAL_MARKER);
    expect(persistedUrl.searchParams.get('client_secret')).toBe(API_REQUESTER_PERSISTED_CREDENTIAL_MARKER);
    expect(persistedUrl.searchParams.get('refresh_token')).toBe(API_REQUESTER_PERSISTED_CREDENTIAL_MARKER);
    expect(persistedUrl.searchParams.get('colorToken')).toBe('teal');
    expect(persistedUrl.searchParams.get('cameraToken')).toBe('close-up');
    expect(snapshot.nodes[0]?.data.body).toContain('"prompt":"keep [redacted] editorial text safe"');
    expect(snapshot.nodes[0]?.data.body).toContain('"colorToken":"teal"');
    expect(snapshot.nodes[0]?.data.body).toContain('"cameraToken":"close-up"');
    expect(snapshot.nodes[0]?.data.body).toContain(API_REQUESTER_PERSISTED_CREDENTIAL_MARKER);
  });

  it('redacts credential-like form fields while keeping safe persisted request fields intact', () => {
    useFlowStore.setState({
      nodes: [createNode('request', 'apiFetchNode', {
        url: 'https://example.test/data',
        headers: 'X-Trace: safe',
        body: 'prompt=keep+this&api_key=form-secret&clientSecret=client-secret',
      })],
      edges: [],
    });

    const exported = useFlowStore.getState().exportFlow();
    const snapshot = useFlowStore.getState().exportProjectFlowSnapshot();
    expect(exported).not.toContain('form-secret');
    expect(exported).not.toContain('client-secret');
    expect(snapshot.nodes[0]?.data.body).toBe(`prompt=keep+this&api_key=${API_REQUESTER_PERSISTED_CREDENTIAL_MARKER}&clientSecret=${API_REQUESTER_PERSISTED_CREDENTIAL_MARKER}`);
  });

  it('reopens persisted requester credentials fail-closed without retaining executable secrets', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useConfirmationStore.setState({ requestConfirmation: vi.fn().mockResolvedValue(true) });
    useFlowStore.setState({
      nodes: [
        createNode('request', 'apiFetchNode', {
          url: 'https://example.test/data',
          headers: 'Api-Key: browser-and-electron-secret',
          declaredOutputType: 'text',
        }),
        createNode('run-me', 'runMeNode'),
      ],
      edges: [{ id: 'request-run', source: 'request', target: 'run-me' }],
    });

    // Browser export and the Electron project-save snapshot share the persistence projection.
    const browserExport = useFlowStore.getState().exportFlow();
    const electronSnapshot = useFlowStore.getState().exportProjectFlowSnapshot();
    expect(browserExport).not.toContain('browser-and-electron-secret');
    expect(JSON.stringify(electronSnapshot)).not.toContain('browser-and-electron-secret');

    useFlowStore.getState().replaceFlowSnapshot(electronSnapshot);
    await useFlowStore.getState().runNode('run-me');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'request')?.data.error)
      .toContain('Replace each redacted value');
  });

  it('resets stale running state only during hydration while restoring runtime callbacks', () => {
    useFlowStore.setState({
      nodes: [createNode('request', 'apiFetchNode', {
        url: 'https://example.test/data',
        isRunning: true,
      })],
      edges: [],
    });

    useFlowStore.getState().hydratePersistedState();
    const request = useFlowStore.getState().nodes[0]!;
    expect(request.data.isRunning).toBe(false);
    expect(request.data.onRun).toEqual(expect.any(Function));
  });

  it('keeps a live request visibly running, rejects a duplicate click, and exposes cancellation state', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    useConfirmationStore.setState({ requestConfirmation: vi.fn().mockResolvedValue(true) });
    useFlowStore.setState({ nodes: [createNode('request', 'apiFetchNode', {
      url: 'https://example.test/data', declaredOutputType: 'text', provider: 'api-running-test',
    }), createNode('run-me', 'runMeNode')], edges: [{ id: 'request-run', source: 'request', target: 'run-me' }] });
    useFlowStore.getState().hydratePersistedState();

    const first = useFlowStore.getState().runNode('run-me');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'request')?.data.isRunning).toBe(true);
    expect(useFlowStore.getState().nodes[0]?.data.onRun).toEqual(expect.any(Function));

    const second = useFlowStore.getState().runNode('run-me');
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    useFlowStore.getState().cancelNodeRun('request');
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'request')?.data.statusMessage).toBe('Cancelling run…');

    resolveFetch?.(new Response('cancelled too late', { status: 200 }));
    await Promise.all([first, second]);
  });

  it('executes a real Function-output diamond once per root run but never reuses the prior root run', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('shared', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    useConfirmationStore.setState({ requestConfirmation: vi.fn().mockResolvedValue(true) });
    const functionA = createDefaultFunctionNodeConfig('Function A');
    const functionB = createDefaultFunctionNodeConfig('Function B');
    functionA.contract.outputPorts[0]!.resultType = 'text';
    functionB.contract.outputPorts[0]!.resultType = 'text';
    useFlowStore.setState({
      nodes: [
        createNode('request', 'apiFetchNode', { url: 'https://example.test/data', declaredOutputType: 'text', provider: 'api-diamond-test' }),
        createNode('function-a', 'functionNode', { functionNode: functionA, result: 'retained Function A output' }),
        createNode('function-b', 'functionNode', { functionNode: functionB, result: 'retained Function B output' }),
        createNode('run-me', 'runMeNode'),
      ],
      edges: [
        { id: 'request-a', source: 'request', target: 'function-a', targetHandle: 'input-flow' },
        { id: 'request-b', source: 'request', target: 'function-b', targetHandle: 'input-flow' },
        { id: 'a-run', source: 'function-a', sourceHandle: 'output-result', target: 'run-me' },
        { id: 'b-run', source: 'function-b', sourceHandle: 'output-result', target: 'run-me' },
      ],
    });
    useFlowStore.getState().hydratePersistedState();

    await useFlowStore.getState().runNode('run-me');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await useFlowStore.getState().runNode('run-me');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

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

  it('extracts both parts of a Doodle package when connected to an Image reference port', () => {
    const nodes = [
      createNode('doodle', 'doodleNode', {
        doodleDescription: 'blue-pencil fox pose',
        doodleSketch: 'data:image/png;base64,DOODLE',
      }),
      createNode('target-gen', 'imageGen'),
    ];
    const edges: Edge[] = [
      { id: 'doodle-reference', source: 'doodle', target: 'target-gen', targetHandle: 'image-reference-1' },
    ];
    const nodesById = buildNodeMap(nodes);
    const incoming = buildIncomingMap(edges);

    expect(storeCollectTextInputs('target-gen', nodesById, incoming, edges)).toContain('blue-pencil fox pose');
    expect(storeCollectUpstreamImageInputForHandles('target-gen', ['image-reference-1'], nodesById, edges))
      .toBe('data:image/png;base64,DOODLE');
    expect(costCollectTextInputs('target-gen', nodesById, incoming, edges)).toContain('blue-pencil fox pose');
    expect(costCollectUpstreamImageInputForHandles('target-gen', ['image-reference-1'], nodesById, edges))
      .toBe('data:image/png;base64,DOODLE');
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

  it('resolves every declared direct image output for image and multimodal-text consumers', () => {
    const nodes = [
      createNode('slimg', 'slimgNode', { result: 'data:image/png;base64,SLIMG', resultMimeType: 'image/png' }),
      createNode('editor', 'advancedImageEditor', { result: 'data:image/png;base64,EDITOR' }),
      createNode('function', 'functionNode', { resultType: 'image', result: 'data:image/png;base64,FUNCTION', resultMimeType: 'image/png' }),
      createNode('image-target', 'imageGen'),
      createNode('text-target', 'textNode', { mode: 'generate', provider: 'gemini', modelId: 'gemini-3.5-flash' }),
    ];
    const edges: Edge[] = [
      { id: 'editor-image', source: 'editor', sourceHandle: 'editedImage', target: 'image-target', targetHandle: 'image-edit-source' },
      { id: 'slimg-text', source: 'slimg', target: 'text-target' },
      { id: 'function-text', source: 'function', target: 'text-target' },
    ];
    const nodesById = buildNodeMap(nodes);

    expect(storeCollectUpstreamImageInputForHandles('image-target', ['image-edit-source'], nodesById, edges))
      .toBe('data:image/png;base64,EDITOR');
    expect(storeCollectTextMediaInputs(nodes[4], nodesById, edges).map((input) => input.url)).toEqual([
      'data:image/png;base64,SLIMG',
      'data:image/png;base64,FUNCTION',
    ]);
  });

  it('discovers every runnable upstream dependency without node-type allowlist gaps', () => {
    const nodes = [
      createNode('description', 'textNode', { mode: 'generate' }),
      createNode('reference', 'imageGen', { mediaMode: 'generate' }),
      createNode('package', 'packageNode'),
      createNode('target', 'videoGen', { mediaMode: 'generate' }),
    ];
    const edges: Edge[] = [
      { id: 'description-package', source: 'description', target: 'package', targetHandle: 'text' },
      { id: 'reference-package', source: 'reference', target: 'package', targetHandle: 'image' },
      { id: 'package-target', source: 'package', target: 'target', targetHandle: 'video-reference-1' },
    ];

    expect(storeGetExecutionDependencies(nodes[3], edges, buildNodeMap(nodes)).sort())
      .toEqual(['description', 'reference']);
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

describe('flow store typed connections', () => {
  beforeEach(() => {
    useFlowStore.setState({ nodes: [], edges: [], bookmarkSidebarOpen: true });
  });

  it('rejects a newly drawn incompatible edge and explains the target error', () => {
    useFlowStore.setState({
      nodes: [createNode('number', 'numberNode'), createNode('target', 'regexReplaceNode')],
    });

    useFlowStore.getState().onConnect({
      source: 'number',
      sourceHandle: null,
      target: 'target',
      targetHandle: null,
    });

    expect(useFlowStore.getState().edges).toEqual([]);
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'target')?.data.error)
      .toContain('number cannot connect to text');
  });

  it('accepts and annotates a compatible edge', () => {
    useFlowStore.setState({
      nodes: [createNode('text', 'textNode'), createNode('target', 'regexReplaceNode')],
    });

    useFlowStore.getState().onConnect({
      source: 'text',
      sourceHandle: null,
      target: 'target',
      targetHandle: null,
    });

    expect(useFlowStore.getState().edges).toHaveLength(1);
    expect(useFlowStore.getState().edges[0].data).toMatchObject({
      flowContract: { valid: true, carriedType: { kind: 'text' } },
    });
    expect(useFlowStore.getState().nodes.find((node) => node.id === 'target')?.data.error).toBeUndefined();
  });

  it('preserves but marks an incompatible edge loaded from a legacy saved flow', () => {
    useFlowStore.setState({
      nodes: [createNode('text', 'textNode'), createNode('target', 'cropImageNode')],
      edges: [{ id: 'legacy', source: 'text', target: 'target', targetHandle: 'image' }],
    });

    useFlowStore.getState().hydratePersistedState();

    expect(useFlowStore.getState().edges).toHaveLength(1);
    expect(useFlowStore.getState().edges[0]).toMatchObject({
      id: 'legacy',
      data: {
        flowContract: {
          valid: false,
          reason: 'text cannot connect to image or package or envelope<image> or envelope<package> or envelope<mixed>',
        },
      },
    });
  });
});

describe('flow store Boolean loop persistence', () => {
  beforeEach(() => {
    useFlowStore.setState({ nodes: [], edges: [], bookmarkSidebarOpen: true });
    useSourceBinStore.setState({
      bins: [{ id: 'default', name: 'Source Library', items: [], collapsed: false, createdAt: 1 }],
      dismissedSourceKeys: [],
      sidebarOpen: true,
      nativeSyncStatus: { state: 'idle' },
      scratchDirectoryHandle: undefined,
      nativeScratchDirectoryPath: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([true, false])('serializes loop envelope %s but retains a Boolean node attempt', async (decision) => {
    vi.spyOn(flowExecution, 'executeNodeRequest').mockResolvedValue({
      result: decision,
      resultType: 'boolean',
      statusMessage: `Verified: ${decision ? 'TRUE' : 'FALSE'}`,
    });
    vi.spyOn(flowExecution, 'hashExecutionParameters').mockResolvedValue(`boolean-${decision}`);
    useFlowStore.setState({
      nodes: [
        createNode('decision', 'valueNode', { valueKind: 'boolean', value: decision }),
        createNode('decisions', 'list'),
        createNode('verify', 'functionNode', {
          functionNode: {
            title: 'Boolean loop sink',
            contract: {
              inputPorts: [{ id: 'decision-input', key: 'decision', label: 'Decision', resultType: 'any', required: true, order: 0 }],
              outputPorts: [{ id: 'decision-output', key: 'decision', label: 'Decision', resultType: 'boolean', required: true, order: 0 }],
            },
            graph: { nodes: [], edges: [] },
            inputBindings: [],
            outputBindings: [],
          },
        }),
      ],
      edges: [
        { id: 'decision-list', source: 'decision', target: 'decisions', targetHandle: 'list-item-0' },
        { id: 'list-verify', source: 'decisions', target: 'verify', targetHandle: 'decision-input' },
      ],
    });

    await useFlowStore.getState().runNode('verify');

    const verify = useFlowStore.getState().nodes.find((node) => node.id === 'verify')!;
    expect(verify.data).toMatchObject({ result: decision, resultType: 'boolean' });
    expect(verify.data.resultHistory?.[0]).toMatchObject({ result: decision, resultType: 'boolean' });
    expect(verify.data.envelopeItems?.[0]).toMatchObject({ value: String(decision), kind: 'boolean' });
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
