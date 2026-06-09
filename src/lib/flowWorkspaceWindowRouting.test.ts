import { describe, expect, it } from 'vitest';
import {
  createWorkspaceWindowCommandEnvelope,
  getWorkspaceWindowCommandForWorkspace,
} from './workspaceWindowCommands';

describe('flow workspace window routing', () => {
  it('accepts Flow commands even when targeting another active Flow workspace id', () => {
    const envelope = createWorkspaceWindowCommandEnvelope('remote', {
      type: 'flow-create-source-node',
      item: {
        id: 'asset-1',
        label: 'panel.png',
        kind: 'image',
        mimeType: 'image/png',
        createdAt: 1,
      },
      targetWorkspace: 'flow',
      targetFlowWorkspaceId: 'workspace-b',
    });

    expect(getWorkspaceWindowCommandForWorkspace(
      envelope,
      'local',
      'flow',
    )).toEqual(envelope.command);
  });

  it('accepts Flow commands for the active Flow workspace id', () => {
    const envelope = createWorkspaceWindowCommandEnvelope('remote', {
      type: 'flow-create-source-node',
      item: {
        id: 'asset-1',
        label: 'panel.png',
        kind: 'image',
        mimeType: 'image/png',
        createdAt: 1,
      },
      targetWorkspace: 'flow',
      targetFlowWorkspaceId: 'workspace-a',
    });

    expect(getWorkspaceWindowCommandForWorkspace(
      envelope,
      'local',
      'flow',
    )).toEqual(envelope.command);
  });

  it('accepts Flow commands with no explicit target flow workspace', () => {
    const envelope = createWorkspaceWindowCommandEnvelope('remote', {
      type: 'flow-create-source-node',
      item: {
        id: 'asset-1',
        label: 'panel.png',
        kind: 'image',
        mimeType: 'image/png',
        createdAt: 1,
      },
      targetWorkspace: 'flow',
    });

    expect(getWorkspaceWindowCommandForWorkspace(
      envelope,
      'local',
      'flow',
    )).toEqual(envelope.command);
  });
});
