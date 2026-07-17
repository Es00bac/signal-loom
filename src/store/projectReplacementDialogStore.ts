import { create } from 'zustand';
import { shouldBypassConfirmations } from '../lib/automationBypass';

export type ProjectReplacementDecision = 'save' | 'discard' | 'cancel';

export interface ProjectReplacementRequestDetails {
  dirtyPaperTitles: string[];
  dirtyImageTitles: string[];
}

interface ProjectReplacementRequest extends ProjectReplacementRequestDetails {
  id: string;
  resolve: (decision: ProjectReplacementDecision) => void;
}

interface ProjectReplacementDialogState {
  activeRequest: ProjectReplacementRequest | null;
  requestDecision: (details: ProjectReplacementRequestDetails) => Promise<ProjectReplacementDecision>;
  respond: (decision: ProjectReplacementDecision) => void;
}

export const useProjectReplacementDialogStore = create<ProjectReplacementDialogState>()((set, get) => ({
  activeRequest: null,
  requestDecision: (details) => {
    if (shouldBypassConfirmations()) return Promise.resolve('discard');
    get().activeRequest?.resolve('cancel');
    return new Promise<ProjectReplacementDecision>((resolve) => {
      set({
        activeRequest: {
          ...details,
          id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
          resolve,
        },
      });
    });
  },
  respond: (decision) => {
    const request = get().activeRequest;
    if (!request) return;
    set({ activeRequest: null });
    request.resolve(decision);
  },
}));

export function requestProjectReplacementDecision(
  details: ProjectReplacementRequestDetails,
): Promise<ProjectReplacementDecision> {
  return useProjectReplacementDialogStore.getState().requestDecision(details);
}
