import { describe, expect, it, vi } from 'vitest';
import { recordProjectUsageFromExecution } from './projectUsageRecording';
import type { AppNode } from '../types/flow';

describe('projectUsageRecording', () => {
  it('records known and unknown successful model execution usage with exact ownership and time', () => {
    const recordUsage = vi.fn();
    const node = {
      id: 'image-1',
      type: 'imageGen',
      position: { x: 0, y: 0 },
      data: { imageOperation: 'outpaint' },
    } as AppNode;

    recordProjectUsageFromExecution({
      node,
      usage: {
        source: 'actual',
        confidence: 'fixed',
        provider: 'stability',
        modelId: 'stable-image-outpaint',
        costUsd: 0.04,
      },
      workspace: 'flow',
      flowWorkspaceId: 'workspace-a',
      flowWorkspaceName: 'Issue 1',
      recordUsage,
      createdAt: 100,
    });

    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'image-1',
      nodeType: 'imageGen',
      nodeData: node.data,
      workspace: 'flow',
      flowWorkspaceId: 'workspace-a',
      flowWorkspaceName: 'Issue 1',
      usage: expect.objectContaining({ provider: 'stability', costUsd: 0.04 }),
      createdAt: 100,
    }));

    recordProjectUsageFromExecution({
      node,
      usage: undefined,
      workspace: 'flow',
      flowWorkspaceId: 'workspace-a',
      flowWorkspaceName: 'Issue 1',
      recordUsage,
      createdAt: 101,
    });
    expect(recordUsage).toHaveBeenCalledTimes(2);
    expect(recordUsage).toHaveBeenLastCalledWith(expect.objectContaining({
      nodeId: 'image-1',
      nodeType: 'imageGen',
      nodeData: node.data,
      workspace: 'flow',
      flowWorkspaceId: 'workspace-a',
      flowWorkspaceName: 'Issue 1',
      createdAt: 101,
      usage: {
        source: 'actual',
        confidence: 'unknown',
        provider: 'gemini',
        notes: [expect.stringContaining('did not report numeric usage')],
      },
    }));
    expect(recordUsage.mock.calls[1][0].usage).not.toHaveProperty('costUsd');
    expect(recordUsage.mock.calls[1][0].usage).not.toHaveProperty('inputTokens');
    expect(recordUsage.mock.calls[1][0].usage).not.toHaveProperty('outputTokens');

    recordProjectUsageFromExecution({
      node: { ...node, type: 'textNode', data: { mode: 'prompt', prompt: 'local text' } } as AppNode,
      usage: undefined,
      workspace: 'flow',
      recordUsage,
    });
    expect(recordUsage).toHaveBeenCalledTimes(2);
  });
});
