import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, FLOW_NODE_TYPES } from './projectSchema';
import { sanitizePaperSnapshot, sanitizeProjectDocument } from './projectValidation';

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

  it('preserves Image layer color labels during project restore sanitization', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Layer labels',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'layer-1',
                name: 'Character ink',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                colorLabel: 'red',
              },
            ],
            activeLayerId: 'layer-1',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: true,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers[0].colorLabel).toBe('red');
  });

  it('preserves Image layer clipping-mask flags during project restore sanitization', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Clipping stack',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'base',
                name: 'Base shape',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
              },
              {
                id: 'shade',
                name: 'Clipped shading',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                clippingMask: true,
              },
            ],
            activeLayerId: 'shade',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers[1].clippingMask).toBe(true);
  });

  it('preserves and clamps Image layer mask density and feather during project restore sanitization', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Mask tuning',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'valid-mask',
                name: 'Valid mask layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                maskDensity: 0.35,
                maskFeather: 12,
              },
              {
                id: 'invalid-mask',
                name: 'Invalid mask layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                maskDensity: -3,
                maskFeather: 'oops',
              },
            ],
            activeLayerId: 'valid-mask',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers[0]).toMatchObject({
      maskDensity: 0.35,
      maskFeather: 12,
    });
    expect(project.imageEditor?.documents[0].layers[1]).toMatchObject({
      maskDensity: 0,
      maskFeather: 0,
    });
  });

  it('preserves and clamps Image layer skew, perspective, warp, and distort transform state during project restore sanitization', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Layer transform restore',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'valid-transform',
                name: 'Valid transform layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                skewXDeg: 18.25,
                skewYDeg: -12.5,
                perspectiveX: 0.25,
                perspectiveY: -0.125,
                warp: {
                  top: 0.25,
                  right: -0.5,
                  bottom: 0.1,
                  left: 0,
                },
                cornerOffsets: {
                  nw: { x: -4, y: -2 },
                  ne: { x: 8, y: -1 },
                  se: { x: 12, y: 5 },
                  sw: { x: -6, y: 4 },
                },
              },
              {
                id: 'invalid-transform',
                name: 'Invalid transform layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                skewXDeg: 500,
                skewYDeg: 'oops',
                perspectiveX: 2,
                perspectiveY: 'bad',
                warp: {
                  top: 4,
                  right: 'oops',
                  bottom: -3,
                  left: Infinity,
                },
                cornerOffsets: {
                  nw: { x: 'bad', y: undefined },
                  ne: { x: Infinity, y: 1 },
                  se: { x: 2, y: NaN },
                  sw: null,
                },
              },
            ],
            activeLayerId: 'valid-transform',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers[0]).toMatchObject({
      skewXDeg: 18.25,
      skewYDeg: -12.5,
      perspectiveX: 0.25,
      perspectiveY: -0.125,
      warp: {
        top: 0.25,
        right: -0.5,
        bottom: 0.1,
        left: 0,
      },
      cornerOffsets: {
        nw: { x: -4, y: -2 },
        ne: { x: 8, y: -1 },
        se: { x: 12, y: 5 },
        sw: { x: -6, y: 4 },
      },
    });
    expect(project.imageEditor?.documents[0].layers[1]).toMatchObject({
      skewXDeg: 75,
      skewYDeg: 0,
      perspectiveX: 0.95,
      perspectiveY: 0,
      warp: {
        top: 1,
        right: 0,
        bottom: -1,
        left: 0,
      },
      cornerOffsets: {
        nw: { x: 0, y: 0 },
        ne: { x: 0, y: 1 },
        se: { x: 2, y: 0 },
        sw: { x: 0, y: 0 },
      },
    });
  });

  it('sanitizes Image layer lock variants during project restore', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Layer lock variants',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'paint',
                name: 'Paint layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                locks: {
                  pixels: true,
                  position: 'yes',
                },
              },
              {
                id: 'move',
                name: 'Move layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                locks: {
                  pixels: false,
                  position: true,
                },
              },
            ],
            activeLayerId: 'paint',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers[0].locks).toEqual({ pixels: true });
    expect(project.imageEditor?.documents[0].layers[1].locks).toEqual({ position: true });
  });

  it('preserves valid Image layer groups and removes invalid group memberships during restore', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Layer groups',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'paint',
                name: 'Paint layer',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                groupId: 'group-1',
              },
              {
                id: 'bad-child',
                name: 'Bad child',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                groupId: 'missing-group',
              },
              {
                id: 'group-1',
                name: 'Paint folder',
                type: 'group',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 12,
                y: 18,
                bitmapVersion: 0,
                groupExpanded: false,
                bitmap: 'bad-runtime-data',
                mask: 'bad-mask',
              },
            ],
            activeLayerId: 'paint',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    const layers = project.imageEditor?.documents[0].layers;
    expect(layers?.map((layer) => [layer.id, layer.type, layer.groupId])).toEqual([
      ['paint', 'image', 'group-1'],
      ['bad-child', 'image', undefined],
      ['group-1', 'group', undefined],
    ]);
    expect(layers?.[2]).toMatchObject({
      groupExpanded: false,
      bitmap: null,
      mask: null,
      x: 0,
      y: 0,
    });
  });

  it('preserves Image linked-layer movement groups only when at least two layers share the group', () => {
    const project = projectWith({
      imageEditor: {
        activeDocId: 'doc-1',
        documents: [
          {
            id: 'doc-1',
            title: 'Layer links',
            width: 320,
            height: 240,
            layers: [
              {
                id: 'base',
                name: 'Base',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                linkGroupId: 'link-a',
              },
              {
                id: 'paint',
                name: 'Paint',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                linkGroupId: 'link-a',
              },
              {
                id: 'orphan',
                name: 'Orphan',
                type: 'image',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                x: 0,
                y: 0,
                bitmapVersion: 0,
                linkGroupId: 'link-orphan',
              },
            ],
            activeLayerId: 'paint',
            hasSelection: false,
            selectionVersion: 0,
            viewport: { zoom: 1, panX: 0, panY: 0 },
            dirty: false,
          },
        ],
      },
    });

    expect(project.imageEditor?.documents[0].layers.map((layer) => [layer.id, layer.linkGroupId])).toEqual([
      ['base', 'link-a'],
      ['paint', 'link-a'],
      ['orphan', undefined],
    ]);
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
          savedSelectionChannels: [
            {
              id: 'alpha-1',
              name: 'Saved outline',
              width: 800,
              height: 600,
              dataBase64: 'AQIDBA==',
              createdAt: 11,
            },
            {
              id: 'broken-alpha',
              name: '',
              width: 0,
              height: -1,
              dataBase64: 12,
              createdAt: 'bad',
            },
          ],
          spotChannels: [
            {
              id: 'spot-1',
              name: 'Varnish',
              width: 800,
              height: 600,
              color: { r: 20, g: 120, b: 220 },
              opacity: 0.75,
              solidity: 0.5,
              visible: false,
              dataBase64: 'AQIDBA==',
              createdAt: 12,
              updatedAt: 13,
            },
            {
              id: 'broken-spot',
              name: '',
              width: 0,
              height: -1,
              color: { r: 300, g: 'bad', b: -10 },
              opacity: 2,
              solidity: -1,
              dataBase64: 12,
              createdAt: 'bad',
            },
          ],
          viewport: { zoom: 2, panX: 10, panY: 20 },
          dirty: true,
          snapshots: [{
            id: 'snap-1',
            name: 'Before lettering',
            createdAt: 10,
            updatedAt: 15,
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
    expect((doc as unknown as {
      savedSelectionChannels?: Array<{ id: string; name: string; dataBase64: string }>;
    })?.savedSelectionChannels).toEqual([
      expect.objectContaining({
        id: 'alpha-1',
        name: 'Saved outline',
        dataBase64: 'AQIDBA==',
      }),
    ]);
    expect((doc as unknown as {
      spotChannels?: Array<{ id: string; name: string; dataBase64: string; opacity: number; solidity: number; visible: boolean }>;
    })?.spotChannels).toEqual([
      expect.objectContaining({
        id: 'spot-1',
        name: 'Varnish',
        dataBase64: 'AQIDBA==',
        opacity: 0.75,
        solidity: 0.5,
        visible: false,
      }),
    ]);
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
      updatedAt: 15,
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

describe('sanitizePaperSnapshot', () => {
  it('preserves multiple Paper tabs and validates their union of managed assets', () => {
    const firstAssetId = `sha256:${'1'.repeat(64)}`;
    const secondAssetId = `sha256:${'2'.repeat(64)}`;
    const makeDocument = (id: string, title: string, assetId: string) => ({
      id,
      title,
      pages: [{
        id: `${id}-page`,
        frames: [{
          id: `${id}-frame`,
          asset: {
            label: title,
            kind: 'image',
            locator: {
              kind: 'managed',
              ref: {
                id: assetId,
                sha256: assetId.slice('sha256:'.length),
                mimeType: 'image/png',
                byteLength: 3,
              },
            },
          },
        }],
      }],
    });
    const english = makeDocument('paper-en', 'English', firstAssetId);
    const japanese = makeDocument('paper-ja', '日本語', secondAssetId);

    const snapshot = sanitizePaperSnapshot({
      document: japanese,
      documents: [
        { id: 'tab-en', document: english, assetIds: [firstAssetId], tool: 'select', zoom: 0.8 },
        { id: 'tab-ja', document: japanese, assetIds: [secondAssetId], tool: 'text', zoom: 1.2 },
      ],
      activeDocumentId: 'tab-ja',
      assetIds: [firstAssetId, secondAssetId],
    });

    expect(snapshot?.documents?.map((candidate) => candidate.document.title)).toEqual(['English', '日本語']);
    expect(snapshot?.activeDocumentId).toBe('tab-ja');
    expect(snapshot?.document?.title).toBe('日本語');
    expect(snapshot?.assetIds).toEqual([firstAssetId, secondAssetId]);
  });

  it('rejects malformed Paper asset references on project restore', () => {
    expect(sanitizePaperSnapshot({
      document: {
        id: 'paper-1',
        title: 'Malformed asset reference',
        pages: [{
          id: 'page-1',
          frames: [{
            id: 'frame-1',
            asset: {
              label: 'Panel',
              kind: 'image',
              locator: {
                kind: 'managed',
                ref: {
                  id: 'sha256:not-a-hash',
                  sha256: 'not-a-hash',
                  mimeType: 'image/png',
                  byteLength: 3,
                },
              },
            },
          }],
        }],
      },
    })).toBeUndefined();
  });

  it('rejects an inline URL persisted in a Paper asset locator', () => {
    expect(sanitizePaperSnapshot({
      document: {
        id: 'paper-1',
        title: 'Inline asset reference',
        pages: [{
          id: 'page-1',
          frames: [{
            id: 'frame-1',
            asset: {
              label: 'Panel',
              kind: 'image',
              locator: { kind: 'external', url: 'data:image/png;base64,AQID' },
            },
          }],
        }],
      },
    })).toBeUndefined();
  });

  it('preserves legacy inline Paper fields only until the restore migration can convert them', () => {
    const snapshot = sanitizePaperSnapshot({
      document: {
        id: 'paper-legacy',
        title: 'Legacy inline asset',
        pages: [{
          id: 'page-1',
          frames: [{
            id: 'frame-1',
            asset: {
              label: 'Legacy panel',
              kind: 'image',
              src: 'data:image/png;base64,AQID',
            },
          }],
        }],
        importedFonts: [{
          id: 'legacy-face',
          familyName: 'Legacy Face',
          bold: false,
          italic: false,
          format: 'truetype',
          embeddable: true,
          canSubset: true,
          dataBase64: 'BAUG',
        }],
      },
      tool: 'select',
      zoom: 0.8,
    });

    expect(snapshot).toBeDefined();
    expect(snapshot?.assetIds).toEqual([]);
    expect((snapshot?.document?.pages[0]?.frames[0]?.asset as { src?: string } | undefined)?.src)
      .toBe('data:image/png;base64,AQID');
  });

  it('includes managed parent-page assets in the restored snapshot reachability list', () => {
    const assetId = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const snapshot = sanitizePaperSnapshot({
      document: {
        id: 'paper-1',
        title: 'Parent asset reference',
        pages: [],
        parentPages: [{
          id: 'parent-1',
          frames: [{
            id: 'frame-1',
            asset: {
              label: 'Parent panel',
              kind: 'image',
              locator: {
                kind: 'managed',
                ref: { id: assetId, sha256: assetId.slice('sha256:'.length), mimeType: 'image/png', byteLength: 3 },
              },
            },
          }],
        }],
      },
      assetIds: [assetId],
    });

    expect(snapshot?.assetIds).toEqual([assetId]);
  });

  it('includes an exact managed ICC profile asset in restored snapshot reachability', () => {
    const assetId = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const snapshot = sanitizePaperSnapshot({
      document: {
        id: 'paper-icc',
        title: 'Managed output profile',
        pages: [],
        managedIccProfiles: [{
          id: assetId,
          asset: { id: assetId, sha256: assetId.slice('sha256:'.length), mimeType: 'application/vnd.iccprofile', byteLength: 12 },
          description: 'Exact CMYK profile',
          deviceClass: 'prtr',
          colorSpace: 'CMYK',
          pcs: 'Lab ',
          outputConditionId: 'FOGRA51',
          source: { kind: 'user-import' },
        }],
      },
      assetIds: [assetId],
    });

    expect(snapshot?.assetIds).toEqual([assetId]);
  });
});
