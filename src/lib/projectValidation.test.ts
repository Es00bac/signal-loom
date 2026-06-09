import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, FLOW_NODE_TYPES } from './projectSchema';
import { sanitizeProjectDocument } from './projectValidation';

function projectWith(overrides: Record<string, unknown>) {
  return sanitizeProjectDocument({
    id: 'p1',
    name: 'Malformed Restore',
    savedAt: 1,
    flow: { version: 3, nodes: [], edges: [] },
    ...overrides,
  });
}

describe('sanitizeProjectDocument', () => {
  it('migrates legacy documents without a top-level schema version to the current schema version', () => {
    const project = projectWith({});

    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it('migrates a legacy single-flow project into a main Flow workspace', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'legacy-node', type: 'textNode', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
    });

    expect(project.flow.nodes.map((node) => node.id)).toEqual(['legacy-node']);
    expect(project).toMatchObject({
      activeFlowWorkspaceId: 'main',
      flowWorkspaces: [
        expect.objectContaining({
          id: 'main',
          name: 'Main Flow',
          flow: {
            version: 3,
            nodes: [expect.objectContaining({ id: 'legacy-node' })],
            edges: [],
          },
        }),
      ],
    });
  });

  it('hydrates the declared active Flow workspace instead of a stale top-level flow snapshot', () => {
    const project = sanitizeProjectDocument({
      id: 'p1',
      name: 'Multi Flow',
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
    });

    expect(project.flow.nodes.map((node) => node.id)).toEqual(['alt-node']);
    expect(project).toMatchObject({
      activeFlowWorkspaceId: 'alt',
      flowWorkspaces: [
        expect.objectContaining({ id: 'main', name: 'Main Flow' }),
        expect.objectContaining({ id: 'alt', name: 'Alt Flow' }),
      ],
    });
  });

  it('preserves every current Flow node type during project restore sanitization', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: FLOW_NODE_TYPES.map((type, index) => ({
          id: `${type}-${index}`,
          type,
          position: { x: index, y: index + 1 },
          data: {},
        })),
        edges: [],
      },
    });

    expect(project.flow.nodes.map((node) => node.type)).toEqual(FLOW_NODE_TYPES);
  });

  it('normalizes object-shaped resultHistory so usage rollups cannot crash', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'image-1', type: 'imageGen', position: { x: 1, y: 2 }, data: { resultHistory: { bad: true } } }],
        edges: [],
      },
    });

    expect(project.flow.nodes[0].data.resultHistory).toEqual([]);
  });

  it('repairs null node position and null node data', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'text-1', type: 'textNode', position: null, data: null }],
        edges: [],
      },
    });

    expect(project.flow.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(project.flow.nodes[0].data).toEqual({
      error: undefined,
      isRunning: undefined,
      statusMessage: undefined,
    });
  });

  it('drops unknown node types and edges attached to invalid nodes', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [
          { id: 'good', type: 'textNode', position: { x: 0, y: 0 }, data: {} },
          { id: 'unknown', type: 'mysteryNode', position: { x: 10, y: 10 }, data: {} },
        ],
        edges: [
          { id: 'valid', source: 'good', target: 'good' },
          { id: 'bad-source', source: 'unknown', target: 'good' },
          { id: 'bad-target', source: 'good', target: 'missing' },
        ],
      },
    });

    expect(project.flow.nodes.map((node) => node.id)).toEqual(['good']);
    expect(project.flow.edges.map((edge) => edge.id)).toEqual(['valid']);
  });

  it('preserves reusable function and group nodes during project restore', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [
          { id: 'group-1', type: 'groupNode', position: { x: 0, y: 0 }, data: {} },
          { id: 'function-1', type: 'functionNode', position: { x: 10, y: 10 }, data: {} },
        ],
        edges: [{ id: 'edge-1', source: 'function-1', target: 'group-1' }],
      },
    });

    expect(project.flow.nodes.map((node) => node.type)).toEqual(['groupNode', 'functionNode']);
    expect(project.flow.edges.map((edge) => edge.id)).toEqual(['edge-1']);
  });

  it('sanitizes malformed source-bin bins and items', () => {
    const project = projectWith({
      sourceBin: {
        dismissedSourceKeys: ['seen', null],
        bins: [
          null,
          {
            id: 'bin-1',
            name: 'Media',
            items: [
              null,
              { id: 'bad-kind', kind: 'weird', label: 'Bad', assetUrl: 'data:image/png;base64,AAA' },
              { id: 'missing-asset', kind: 'image', label: 'Missing' },
              { id: 'text-1', kind: 'text', label: 'Notes', text: 'hello' },
              { id: 'image-1', kind: 'image', label: 'Image', assetUrl: 'data:image/png;base64,AAA' },
            ],
          },
        ],
      },
    });

    expect(project.sourceBin?.dismissedSourceKeys).toEqual(['seen']);
    expect(project.sourceBin?.bins).toHaveLength(1);
    expect(project.sourceBin?.bins?.[0].items.map((item) => item.id)).toEqual(['text-1', 'image-1']);
  });

  it('restores the active node result from the selected saved history attempt', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{
          id: 'image-1',
          type: 'imageGen',
          position: { x: 1, y: 2 },
          data: {
            selectedResultId: 'attempt-1',
            resultHistory: [
              { id: 'attempt-1', result: 'data:image/png;base64,ONE', resultType: 'image', statusMessage: 'First', createdAt: '2026-01-01T00:00:00.000Z' },
              { id: 'attempt-2', result: 'data:image/png;base64,TWO', resultType: 'image', statusMessage: 'Second', createdAt: '2026-01-02T00:00:00.000Z' },
            ],
          },
        }],
        edges: [],
      },
    });

    expect(project.flow.nodes[0].data).toMatchObject({
      selectedResultId: 'attempt-1',
      result: 'data:image/png;base64,ONE',
      resultType: 'image',
    });
  });

  it('repairs duplicate envelope indexes during project restore sanitization', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{
          id: 'envelope-1',
          type: 'envelope',
          position: { x: 1, y: 2 },
          data: {
            envelopeItems: [
              { id: 'a', index: 0, kind: 'image', label: 'A', value: 'signal-loom-asset://file/a' },
              { id: 'b', index: 0, kind: 'image', label: 'B', value: 'signal-loom-asset://file/b' },
              { id: 'c', index: 0, kind: 'image', label: 'C', value: 'signal-loom-asset://file/c' },
            ],
          },
        }],
        edges: [],
      },
    });

    expect(project.flow.nodes[0].data.envelopeItems?.map((item) => item.index)).toEqual([0, 1, 2]);
  });

  it('hydrates missing node result history from source-bin media saved with the originating node', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'image-1', type: 'imageGen', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
      sourceBin: {
        bins: [{
          id: 'bin-1',
          name: 'Generated',
          items: [
            { id: 'run-1', kind: 'image', label: 'Run 1', assetUrl: 'data:image/png;base64,ONE', originNodeId: 'image-1', createdAt: 10 },
            { id: 'run-2', kind: 'image', label: 'Run 2', assetUrl: 'data:image/png;base64,TWO', originNodeId: 'image-1', createdAt: 20 },
          ],
        }],
      },
    });

    expect(project.flow.nodes[0].data.resultHistory).toEqual([
      expect.objectContaining({ id: 'source-run-1', result: 'data:image/png;base64,ONE', resultType: 'image' }),
      expect.objectContaining({ id: 'source-run-2', result: 'data:image/png;base64,TWO', resultType: 'image' }),
    ]);
    expect(project.flow.nodes[0].data).toMatchObject({
      selectedResultId: 'source-run-2',
      result: 'data:image/png;base64,TWO',
      resultType: 'image',
    });
  });

  it('reconstructs envelope items from source-bin batch entries on .sloom open', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'batch-1', type: 'imageGen', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
      sourceBin: {
        items: [
          {
            id: 'batch-a',
            kind: 'image',
            label: 'Batch A',
            assetUrl: 'data:image/png;base64,A',
            originNodeId: 'batch-1',
            envelopeId: 'env-1',
            envelopeLabel: 'Batch images',
            envelopeIndex: 0,
            createdAt: 10,
          },
          {
            id: 'batch-b',
            kind: 'image',
            label: 'Batch B',
            assetUrl: 'data:image/png;base64,B',
            originNodeId: 'batch-1',
            envelopeId: 'env-1',
            envelopeLabel: 'Batch images',
            envelopeIndex: 1,
            createdAt: 20,
          },
        ],
      },
    });

    expect(project.flow.nodes[0].data.envelopeItems).toEqual([
      expect.objectContaining({ id: 'batch-a', index: 0, kind: 'image', label: 'Batch A', value: 'data:image/png;base64,A', sourceNodeId: 'batch-1' }),
      expect.objectContaining({ id: 'batch-b', index: 1, kind: 'image', label: 'Batch B', value: 'data:image/png;base64,B', sourceNodeId: 'batch-1' }),
    ]);
  });

  it('reconstructs batch entries whose source-bin origin ids include envelope item indexes', () => {
    const project = projectWith({
      flow: {
        version: 3,
        nodes: [{ id: 'batch-1', type: 'imageGen', position: { x: 1, y: 2 }, data: {} }],
        edges: [],
      },
      sourceBin: {
        items: [
          {
            id: 'batch-a',
            kind: 'image',
            label: 'Batch A',
            assetUrl: 'data:image/png;base64,A',
            originNodeId: 'batch-1:0',
            envelopeId: 'batch-1',
            envelopeLabel: 'Batch images',
            envelopeIndex: 0,
            createdAt: 10,
          },
          {
            id: 'batch-b',
            kind: 'image',
            label: 'Batch B',
            assetUrl: 'data:image/png;base64,B',
            originNodeId: 'batch-1:1',
            envelopeId: 'batch-1',
            envelopeLabel: 'Batch images',
            envelopeIndex: 1,
            createdAt: 20,
          },
        ],
      },
    });

    expect(project.flow.nodes[0].data.resultHistory).toEqual([
      expect.objectContaining({ id: 'source-batch-a', result: 'data:image/png;base64,A', resultType: 'image' }),
      expect.objectContaining({ id: 'source-batch-b', result: 'data:image/png;base64,B', resultType: 'image' }),
    ]);
    expect(project.flow.nodes[0].data.envelopeItems).toEqual([
      expect.objectContaining({ id: 'batch-a', index: 0, kind: 'image', label: 'Batch A', value: 'data:image/png;base64,A', sourceNodeId: 'batch-1:0' }),
      expect.objectContaining({ id: 'batch-b', index: 1, kind: 'image', label: 'Batch B', value: 'data:image/png;base64,B', sourceNodeId: 'batch-1:1' }),
    ]);
  });

  it('preserves Image editor vector/source metadata and snapshots while dropping runtime pixels', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-image',
        documents: [{
          id: 'doc-image',
          title: 'Storyboard plate',
          width: 800,
          height: 600,
          sourceBinItemId: 'source-panel',
          metadata: { sourceFormat: 'SVG' },
          layers: [{
            id: 'vector-layer',
            name: 'Editable SFX',
            type: 'vector',
            visible: true,
            locked: false,
            opacity: 0.75,
            blendMode: 'screen',
            x: 12,
            y: 34,
            bitmap: { unsafe: 'runtime canvas should not survive JSON restore' },
            mask: { unsafe: 'runtime mask should not survive JSON restore' },
            bitmapVersion: 9,
            metadata: {
              originalSvgSource: '<svg><text>Bang</text></svg>',
              smartLinkedSourceId: 'source-panel',
              sourceLink: {
                id: 'source-panel',
                label: 'Panel.svg',
                width: 800,
                height: 600,
                status: 'linked',
                relinkHistory: [{ sourceId: 'old-panel', label: 'Old.svg', at: 5 }],
              },
            },
            vectorRecipe: '<svg><text>Bang</text></svg>',
          }],
          activeLayerId: 'vector-layer',
          hasSelection: true,
          selectionVersion: 3,
          viewport: { zoom: 2, panX: 10, panY: 20 },
          dirty: true,
          snapshots: [{
            id: 'snap-1',
            name: 'Before lettering',
            createdAt: 10,
            width: -20,
            height: 0,
            layers: [{
              id: 'vector-layer',
              name: 'Editable SFX',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 0.75,
              blendMode: 'screen',
              x: 12,
              y: 34,
              bitmap: { unsafe: true },
              mask: { unsafe: true },
              bitmapVersion: 9,
              metadata: { originalSvgSource: '<svg><text>Bang</text></svg>' },
              vectorRecipe: '<svg><text>Bang</text></svg>',
            }],
            activeLayerId: 'vector-layer',
            hasSelection: false,
            selectionVersion: 2,
          }],
        }],
      },
    });

    const doc = project.imageEditor?.documents[0];
    expect(doc?.sourceBinItemId).toBe('source-panel');
    expect(doc?.metadata?.sourceFormat).toBe('SVG');
    expect(doc?.layers[0]).toMatchObject({
      id: 'vector-layer',
      type: 'vector',
      bitmap: null,
      mask: null,
      bitmapVersion: 9,
      metadata: {
        smartLinkedSourceId: 'source-panel',
        sourceLink: {
          id: 'source-panel',
          label: 'Panel.svg',
          status: 'linked',
          relinkHistory: [{ sourceId: 'old-panel', label: 'Old.svg', at: 5 }],
        },
      },
      vectorRecipe: '<svg><text>Bang</text></svg>',
    });
    expect(doc?.snapshots).toHaveLength(1);
    expect(doc?.snapshots?.[0]).toMatchObject({
      id: 'snap-1',
      name: 'Before lettering',
      width: 800,
      height: 600,
      activeLayerId: 'vector-layer',
      layers: [{
        id: 'vector-layer',
        type: 'vector',
        bitmap: null,
        mask: null,
        vectorRecipe: '<svg><text>Bang</text></svg>',
      }],
    });
  });

  it('rejects documents without array-shaped flow snapshots', () => {
    expect(() => projectWith({ flow: { nodes: {}, edges: [] } })).toThrow('flow nodes and edges must be arrays');
  });
});
