import { create } from 'zustand';
import {
  buildDefaultFlowWorkspace,
  DEFAULT_FLOW_WORKSPACE_NAME,
  findActiveFlowWorkspace,
  type FlowProjectFlowSnapshot,
  type FlowWorkspaceProjectSnapshot,
} from '../lib/flowProjectWorkspaces';

export interface FlowWorkspaceStoreState {
  activeWorkspaceId: string;
  hydratedWorkspaceId: string;
  workspaces: FlowWorkspaceProjectSnapshot[];
  createWorkspace: (name?: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  duplicateWorkspace: (id: string) => string;
  deleteWorkspace: (id: string) => void;
  setActiveWorkspaceId: (id: string) => void;
  upsertHydratedSnapshot: (snapshot: FlowProjectFlowSnapshot) => void;
  consumePendingWorkspaceSwitch: (hydratedSnapshot: FlowProjectFlowSnapshot) => FlowProjectFlowSnapshot | undefined;
  hydrateProjectSnapshot: (input: {
    workspaces: FlowWorkspaceProjectSnapshot[];
    activeWorkspaceId?: string;
  }) => void;
  exportProjectSnapshot: (activeSnapshot: FlowProjectFlowSnapshot) => FlowWorkspaceProjectSnapshot[];
  getWorkspace: (id: string) => FlowWorkspaceProjectSnapshot | undefined;
  reset: () => void;
}

function makeWorkspaceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `flow-workspace-${Date.now()}`;
}

function cloneFlowSnapshot<T>(snapshot: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(snapshot);
  }

  return JSON.parse(JSON.stringify(snapshot)) as T;
}

function createBlankFlowSnapshot(): FlowProjectFlowSnapshot {
  return {
    version: 3,
    nodes: [],
    edges: [],
  };
}

function createWorkspaceRecord(name = 'Untitled Flow'): FlowWorkspaceProjectSnapshot {
  const now = Date.now();
  return {
    id: makeWorkspaceId(),
    name: name.trim() || 'Untitled Flow',
    createdAt: now,
    updatedAt: now,
    flow: createBlankFlowSnapshot(),
  };
}

function createInitialState(): Pick<FlowWorkspaceStoreState, 'activeWorkspaceId' | 'hydratedWorkspaceId' | 'workspaces'> {
  const mainWorkspace = buildDefaultFlowWorkspace(createBlankFlowSnapshot());
  return {
    activeWorkspaceId: mainWorkspace.id,
    hydratedWorkspaceId: mainWorkspace.id,
    workspaces: [mainWorkspace],
  };
}

function resolveActiveWorkspaceId(
  workspaces: readonly FlowWorkspaceProjectSnapshot[],
  activeWorkspaceId: string | undefined,
): string {
  return findActiveFlowWorkspace(workspaces, activeWorkspaceId)?.id ?? workspaces[0]?.id ?? 'main';
}

export const useFlowWorkspaceStore = create<FlowWorkspaceStoreState>()((set, get) => ({
  ...createInitialState(),
  createWorkspace: (name = 'Untitled Flow') => {
    const workspace = createWorkspaceRecord(name);
    set((state) => ({
      activeWorkspaceId: workspace.id,
      hydratedWorkspaceId: state.hydratedWorkspaceId,
      workspaces: [...state.workspaces, workspace],
    }));
    return workspace.id;
  },
  renameWorkspace: (id, name) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }

    set((state) => ({
      workspaces: state.workspaces.map((workspace) => (
        workspace.id === id
          ? { ...workspace, name: nextName, updatedAt: Date.now() }
          : workspace
      )),
    }));
  },
  duplicateWorkspace: (id) => {
    const existing = get().workspaces.find((workspace) => workspace.id === id);
    if (!existing) {
      return get().createWorkspace(DEFAULT_FLOW_WORKSPACE_NAME);
    }

    const now = Date.now();
    const duplicate: FlowWorkspaceProjectSnapshot = {
      ...existing,
      id: makeWorkspaceId(),
      name: `${existing.name} Copy`,
      createdAt: now,
      updatedAt: now,
      flow: cloneFlowSnapshot(existing.flow),
    };

    set((state) => ({
      activeWorkspaceId: duplicate.id,
      workspaces: [...state.workspaces, duplicate],
    }));

    return duplicate.id;
  },
  deleteWorkspace: (id) => {
    set((state) => {
      const deletedIndex = state.workspaces.findIndex((workspace) => workspace.id === id);
      const remaining = state.workspaces.filter((workspace) => workspace.id !== id);
      if (remaining.length === 0) {
        return createInitialState();
      }

      const fallbackWorkspaceId = state.activeWorkspaceId === id
        ? remaining[Math.max(0, Math.min(remaining.length - 1, deletedIndex - 1))]?.id
        : state.activeWorkspaceId;

      return {
        activeWorkspaceId: resolveActiveWorkspaceId(
          remaining,
          fallbackWorkspaceId,
        ),
        hydratedWorkspaceId: resolveActiveWorkspaceId(
          remaining,
          state.hydratedWorkspaceId === id ? fallbackWorkspaceId : state.hydratedWorkspaceId,
        ),
        workspaces: remaining,
      };
    });
  },
  setActiveWorkspaceId: (id) => {
    set((state) => ({
      activeWorkspaceId: resolveActiveWorkspaceId(state.workspaces, id),
    }));
  },
  upsertHydratedSnapshot: (snapshot) => {
    set((state) => {
      const hydratedWorkspace = findActiveFlowWorkspace(state.workspaces, state.hydratedWorkspaceId);
      if (!hydratedWorkspace) {
        const mainWorkspace = buildDefaultFlowWorkspace(cloneFlowSnapshot(snapshot));
        return {
          activeWorkspaceId: mainWorkspace.id,
          hydratedWorkspaceId: mainWorkspace.id,
          workspaces: [mainWorkspace],
        };
      }

      return {
        workspaces: state.workspaces.map((workspace) => (
          workspace.id === hydratedWorkspace.id
            ? { ...workspace, flow: cloneFlowSnapshot(snapshot), updatedAt: Date.now() }
            : workspace
        )),
      };
    });
  },
  consumePendingWorkspaceSwitch: (hydratedSnapshot) => {
    const state = get();
    if (state.activeWorkspaceId === state.hydratedWorkspaceId) {
      return undefined;
    }

    const nextWorkspaces = state.workspaces.map((workspace) => (
      workspace.id === state.hydratedWorkspaceId
        ? { ...workspace, flow: cloneFlowSnapshot(hydratedSnapshot), updatedAt: Date.now() }
        : workspace
    ));
    const nextWorkspace = findActiveFlowWorkspace(nextWorkspaces, state.activeWorkspaceId);

    if (!nextWorkspace) {
      return undefined;
    }

    set({
      hydratedWorkspaceId: nextWorkspace.id,
      workspaces: nextWorkspaces,
    });

    return cloneFlowSnapshot(nextWorkspace.flow);
  },
  hydrateProjectSnapshot: ({ workspaces, activeWorkspaceId }) => {
    const nextWorkspaces = workspaces.length > 0
      ? workspaces.map((workspace) => ({ ...workspace, flow: cloneFlowSnapshot(workspace.flow) }))
      : createInitialState().workspaces;
    const resolvedActiveWorkspaceId = resolveActiveWorkspaceId(nextWorkspaces, activeWorkspaceId);

    set({
      activeWorkspaceId: resolvedActiveWorkspaceId,
      hydratedWorkspaceId: resolvedActiveWorkspaceId,
      workspaces: nextWorkspaces,
    });
  },
  exportProjectSnapshot: (activeSnapshot) => {
    const state = get();
    const workspaces = state.workspaces.length > 0 ? state.workspaces : createInitialState().workspaces;
    const hydratedWorkspaceId = resolveActiveWorkspaceId(workspaces, state.hydratedWorkspaceId);

    return workspaces.map((workspace) => ({
      ...workspace,
      flow: cloneFlowSnapshot(
        workspace.id === hydratedWorkspaceId ? activeSnapshot : workspace.flow,
      ),
    }));
  },
  getWorkspace: (id) => {
    return get().workspaces.find((workspace) => workspace.id === id);
  },
  reset: () => {
    set(createInitialState());
  },
}));
