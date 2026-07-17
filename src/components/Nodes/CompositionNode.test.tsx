import { ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFlowStore } from '../../store/flowStore';
import type { AppNode } from '../../types/flow';
import { CompositionNode } from './CompositionNode';

function renderCompositionNode(authoredTrackCount: number): string {
  return renderToStaticMarkup(
    <ReactFlowProvider>
      <CompositionNode
        data={{ compositionAudioTrackCount: authoredTrackCount, onChange: () => undefined }}
        deletable
        dragging={false}
        draggable
        id="composition-1"
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        selectable
        selected={false}
        type="composition"
        zIndex={0}
      />
    </ReactFlowProvider>,
  );
}

describe('CompositionNode audio track visibility (FBL-019 gap 2)', () => {
  beforeEach(() => {
    useFlowStore.setState({ nodes: [], edges: [], bookmarkSidebarOpen: true });
  });

  it('renders a higher explicit audio track handle even when its source has not produced media yet', () => {
    useFlowStore.setState({
      nodes: [
        {
          id: 'audio-1',
          type: 'audioGen',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'composition-1',
          type: 'composition',
          position: { x: 0, y: 0 },
          data: { compositionAudioTrackCount: 1 },
        },
      ] as AppNode[],
      edges: [
        { id: 'e1', source: 'audio-1', target: 'composition-1', targetHandle: 'composition-audio-3' },
      ],
    });

    const html = renderCompositionNode(1);

    expect(html).toContain('data-handleid="composition-audio-3"');
  });

  it('does not render a track beyond what is authored or connected', () => {
    useFlowStore.setState({
      nodes: [
        {
          id: 'composition-1',
          type: 'composition',
          position: { x: 0, y: 0 },
          data: { compositionAudioTrackCount: 1 },
        },
      ] as AppNode[],
      edges: [],
    });

    const html = renderCompositionNode(1);

    expect(html).not.toContain('data-handleid="composition-audio-2"');
  });
});

describe('CompositionNode composition audio migration warning display (FBL-019 correction)', () => {
  beforeEach(() => {
    useFlowStore.setState({ nodes: [], edges: [], bookmarkSidebarOpen: true });
  });

  it('derives the visible node message from a persisted composition audio migration warning when there is no live error', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <CompositionNode
          data={{
            compositionAudioTrackCount: 1,
            onChange: () => undefined,
            compositionAudioMigrationWarnings: [
              {
                handle: 'composition-audio-9',
                reason: 'overflow',
                message: 'Removed unsupported audio connection on handle "composition-audio-9" (beyond the supported 4-track limit).',
              },
            ],
          }}
          deletable
          dragging={false}
          draggable
          id="composition-1"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="composition"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(html).toContain('composition-audio-9');
  });
});
