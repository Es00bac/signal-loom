import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import { FlowWorkspaceShell } from './FlowWorkspaceShell';
import type { AppNode } from '../../../types/flow';

vi.mock('@xyflow/react', async () => {
  return {
    Background: () => <div data-testid="flow-background" />,
    Controls: () => <div data-testid="flow-controls" />,
    ReactFlow: ({ children }: { children?: any }) => (
      <div data-testid="react-flow-shell">{children}</div>
    ),
    useReactFlow: () => ({
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: () => {},
    }),
    useStoreApi: () => ({
      getState: () => ({ minZoom: 0.5, maxZoom: 2 }),
    }),
  };
});

describe('FlowWorkspaceShell', () => {
  it('renders a dedicated Flow canvas shell instead of keeping the logic in App.tsx', () => {
    const markup = renderToStaticMarkup(
      <FlowWorkspaceShell
        blockingFlowDiagnosticCount={0}
        diagnosticsOpen={false}
        flowDiagnostics={[]}
        flowOrganizeJob={null}
        flowRecoveryKey="flow::recovery"
        librarySearchMenu={null}
        nodeTypes={{} as Record<string, ComponentType<any>>}
        nodes={[] as AppNode[]}
        edges={[] as Edge[]}
        onCloseDiagnostics={() => {}}
        onCloseLibrarySearch={() => {}}
        onCollapseSelection={() => {}}
        onConnect={() => {}}
        onConnectEnd={() => {}}
        onConnectStart={() => {}}
        onCreateGroupFromSelection={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
        onEdgesChange={() => {}}
        onNodeContextMenu={() => {}}
        onNodesChange={() => {}}
        onPaneClick={() => {}}
        onPaneContextMenu={() => {}}
        onSelectLibrarySearchTemplate={() => {}}
        onStartFlowAutoOrganize={() => {}}
        onToggleDiagnostics={() => {}}
        onCancelFlowAutoOrganize={() => {}}
        selectedFlowNodeCount={0}
      />,
    );

    expect(markup).toContain('data-testid="flow-workspace-shell"');
    expect(markup).toContain('data-testid="react-flow-shell"');
  });

  it('is mounted by App instead of leaving the Flow canvas inline there', () => {
    const source = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');

    expect(source).toContain('FlowWorkspaceShell');
  });
});
