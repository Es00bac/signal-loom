import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the Paper channel's policy layer (#52): the coalesced emit, the `applyingRemote` echo guard,
 * and the `canEmit` authority gate — driving the *real* paperStore with the LAN seam mocked, and using
 * the test-only flush to bypass the debounce timer deterministically.
 */

// Hoisted so the vi.mock factories can close over this shared, mutable state without a TDZ error.
const h = vi.hoisted(() => ({
  androidAvailable: { value: false },
  served: { value: false },
  notify: vi.fn<(channel: string, change: unknown) => void>(),
}));

vi.mock('./androidLanServer', () => ({
  isAndroidLanServerAvailable: () => h.androidAvailable.value,
  notifyLanProjectChange: (channel: string, change: unknown) => h.notify(channel, change),
}));
vi.mock('./remoteHostClient', () => ({
  isServedLanSession: () => h.served.value,
}));
vi.mock('./projectSyncClient', () => ({
  ensureProjectSyncChannelStarted: vi.fn(async () => undefined),
}));

import { usePaperStore } from '../store/paperStore';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { clearProjectSyncChannels, getProjectSyncChannel } from './projectSyncService';
import {
  PAPER_SYNC_CHANNEL,
  __flushPaperSyncEmitForTests,
  __resetPaperSyncChannelForTests,
  initializePaperSyncChannel,
} from './paperSyncChannel';
import type { PaperDocumentNativeChange } from './paperDocumentNativeSync';

let pageId = '';
let frameId = '';

beforeEach(() => {
  h.androidAvailable.value = false;
  h.served.value = false;
  h.notify.mockReset();
  clearProjectSyncChannels();
  __resetPaperSyncChannelForTests();

  let document = createDefaultPaperDocument();
  pageId = document.pages[0].id;
  const result = addFrameToPaperPage(document, pageId, { kind: 'text', xMm: 0, yMm: 0, widthMm: 40, heightMm: 30 });
  document = result.document;
  frameId = result.frameId;
  usePaperStore.setState({
    document,
    selectedPageId: pageId,
    selectedFrameId: frameId,
    selectedFrameIds: [frameId],
    undoStack: [],
    redoStack: [],
  });
});

const lastEmit = () => h.notify.mock.calls.at(-1) as [string, PaperDocumentNativeChange] | undefined;

describe('paperSyncChannel', () => {
  it('the phone authority emits a frame op after a local edit', () => {
    h.androidAvailable.value = true;
    initializePaperSyncChannel();

    usePaperStore.getState().updateFrame(pageId, frameId, { xMm: 50 });
    __flushPaperSyncEmitForTests();

    expect(h.notify).toHaveBeenCalled();
    const emit = lastEmit()!;
    expect(emit[0]).toBe(PAPER_SYNC_CHANNEL);
    expect(emit[1].type).toBe('paper-frame-moved');
  });

  it('does not re-broadcast a remote op it applies (echo guard)', () => {
    h.androidAvailable.value = true;
    initializePaperSyncChannel();
    h.notify.mockReset();

    const channel = getProjectSyncChannel(PAPER_SYNC_CHANNEL)!;
    channel.applyRemote({ type: 'paper-frame-moved', pageId, frameId, xMm: 99, yMm: 99 } as PaperDocumentNativeChange);
    __flushPaperSyncEmitForTests();

    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a served client stays mute until its first remote apply, then emits', () => {
    h.served.value = true; // served client, not the authority
    initializePaperSyncChannel();

    // A local edit before any seed must NOT push the client's stale document at the phone.
    usePaperStore.getState().updateFrame(pageId, frameId, { xMm: 5 });
    __flushPaperSyncEmitForTests();
    expect(h.notify).not.toHaveBeenCalled();

    // Applying a remote op (the seed) earns the right to emit.
    const channel = getProjectSyncChannel(PAPER_SYNC_CHANNEL)!;
    channel.applyRemote({ type: 'paper-frame-moved', pageId, frameId, xMm: 8, yMm: 8 } as PaperDocumentNativeChange);
    h.notify.mockReset();

    usePaperStore.getState().updateFrame(pageId, frameId, { xMm: 20 });
    __flushPaperSyncEmitForTests();
    expect(h.notify).toHaveBeenCalled();
  });

  it('is inert when no sync session is active', () => {
    // Neither authority nor served — initialize, edit, flush: nothing should be pushed.
    initializePaperSyncChannel();
    usePaperStore.getState().updateFrame(pageId, frameId, { xMm: 5 });
    __flushPaperSyncEmitForTests();
    expect(h.notify).not.toHaveBeenCalled();
  });
});
