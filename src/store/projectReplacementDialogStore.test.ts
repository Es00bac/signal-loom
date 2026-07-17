import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectReplacementDialogStore } from './projectReplacementDialogStore';

vi.mock('../lib/automationBypass', () => ({ shouldBypassConfirmations: () => false }));

afterEach(() => {
  useProjectReplacementDialogStore.getState().respond('cancel');
  useProjectReplacementDialogStore.setState({ activeRequest: null });
});

describe('project replacement decision store', () => {
  it.each(['save', 'discard', 'cancel'] as const)('resolves an explicit %s decision', async (decision) => {
    const result = useProjectReplacementDialogStore.getState().requestDecision({
      dirtyPaperTitles: ['Magazine'],
      dirtyImageTitles: ['Cover'],
    });
    expect(useProjectReplacementDialogStore.getState().activeRequest).toMatchObject({
      dirtyPaperTitles: ['Magazine'],
      dirtyImageTitles: ['Cover'],
    });
    useProjectReplacementDialogStore.getState().respond(decision);
    await expect(result).resolves.toBe(decision);
  });

  it('cancels an older pending decision before showing a replacement request', async () => {
    const first = useProjectReplacementDialogStore.getState().requestDecision({
      dirtyPaperTitles: ['A'],
      dirtyImageTitles: [],
    });
    const second = useProjectReplacementDialogStore.getState().requestDecision({
      dirtyPaperTitles: ['B'],
      dirtyImageTitles: [],
    });
    await expect(first).resolves.toBe('cancel');
    useProjectReplacementDialogStore.getState().respond('discard');
    await expect(second).resolves.toBe('discard');
  });
});
