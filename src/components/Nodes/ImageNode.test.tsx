import { ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFlowStore } from '../../store/flowStore';
import { ImageNode } from './ImageNode';
import type { AppNode } from '../../types/flow';

function createNode(id: string, type: AppNode['type'], data: Record<string, unknown> = {}): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as AppNode;
}

describe('ImageNode mask painter controls', () => {
  beforeEach(() => {
    useFlowStore.setState({
      nodes: [],
      edges: [],
    });
  });

  it('shows a large mask-painting launcher for mask-aware image edit nodes', () => {
    useFlowStore.setState({
      nodes: [
        createNode('source-image', 'imageGen', {
          mediaMode: 'import',
          sourceAssetUrl: 'data:image/png;base64,U09VUkNF',
        }),
        createNode('target-image', 'imageGen'),
      ],
      edges: [
        { id: 'source-edge', source: 'source-image', target: 'target-image', targetHandle: 'image-edit-source' },
      ],
    });

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <ImageNode
          data={{
            mediaMode: 'generate',
            provider: 'stability',
            modelId: 'stable-image-edit-inpaint',
            imageOperation: 'mask-inpaint',
            onChange: () => undefined,
          }}
          deletable
          dragging={false}
          draggable
          id="target-image"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="imageGen"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(html).toContain('Paint mask');
    expect(html).toContain('Mask Image');
  });

  it('shows the outpaint workspace launcher for outpaint nodes', () => {
    useFlowStore.setState({
      nodes: [
        createNode('source-image', 'imageGen', {
          mediaMode: 'import',
          sourceAssetUrl: 'data:image/png;base64,U09VUkNF',
        }),
        createNode('target-image', 'imageGen'),
      ],
      edges: [
        { id: 'source-edge', source: 'source-image', target: 'target-image', targetHandle: 'image-edit-source' },
      ],
    });

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <ImageNode
          data={{
            mediaMode: 'generate',
            provider: 'stability',
            modelId: 'stable-image-edit-outpaint',
            imageOperation: 'outpaint',
            onChange: () => undefined,
          }}
          deletable
          dragging={false}
          draggable
          id="target-image"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="imageGen"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(html).toContain('Open outpaint workspace');
  });
});

describe('ImageNode reference handle routing', () => {
  beforeEach(() => {
    useFlowStore.setState({ nodes: [], edges: [] });
  });

  it('places left-column references on the exterior left and right-column references on the exterior right', () => {
    useFlowStore.setState({
      nodes: [createNode('target-image', 'imageGen')],
      edges: [],
    });

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <ImageNode
          data={{
            mediaMode: 'generate',
            provider: 'bfl',
            modelId: 'flux-2-pro',
            onChange: () => undefined,
          }}
          deletable
          dragging={false}
          draggable
          id="target-image"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="imageGen"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(referenceHandleTag(html, 'image-reference-1')).toContain('react-flow__handle-left');
    expect(referenceHandleTag(html, 'image-reference-2')).toContain('react-flow__handle-right');
    expect(referenceHandleTag(html, 'image-reference-7')).toContain('react-flow__handle-left');
    expect(referenceHandleTag(html, 'image-reference-8')).toContain('react-flow__handle-right');
  });

  it('labels exterior reference targets so right-side inputs are not mistaken for the image output', () => {
    useFlowStore.setState({ nodes: [createNode('target-image', 'imageGen')], edges: [] });

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <ImageNode
          data={{ mediaMode: 'generate', provider: 'bfl', modelId: 'flux-2-pro' }}
          deletable
          dragging={false}
          draggable
          id="target-image"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="imageGen"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(referenceHandleTag(html, 'image-reference-2')).toContain('title="Reference 2 image input (right edge)"');
    expect(html).toContain('data-reference-side="right"');
  });
});

function referenceHandleTag(html: string, handleId: string): string {
  const tag = html.match(new RegExp(`<div[^>]*data-handleid="${handleId}"[^>]*>`))?.[0];
  expect(tag, `Expected ${handleId} handle in rendered Image node`).toBeDefined();
  return tag ?? '';
}
