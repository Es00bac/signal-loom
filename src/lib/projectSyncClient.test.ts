import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the generic served-client loop (task #51) against a mocked LAN transport + a fake channel,
 * so the seed → subscribe → publish path is verified without a phone: the seed applies the snapshot op,
 * the subscriber applies each event op through the channel, publish POSTs to the right route, and a
 * second start is idempotent.
 */

// Hoisted so the vi.mock factories (which run during import, before normal `let`s initialize) can
// safely close over this shared state without a temporal-dead-zone error.
const h = vi.hoisted(() => ({
  served: { value: true },
  fetchMock: vi.fn<(path: string, init?: { method?: string; body?: string }) => Promise<unknown>>(),
  publisher: { current: null as ((channel: string, change: unknown) => void) | null },
}));

vi.mock('./remoteHostClient', () => ({
  isServedLanSession: () => h.served.value,
  remoteHostFetch: (path: string, init?: { method?: string; body?: string }) => h.fetchMock(path, init),
}));

vi.mock('./androidLanServer', () => ({
  setServedProjectMutationPublisher: (pub: ((channel: string, change: unknown) => void) | null) => {
    h.publisher.current = pub;
  },
}));

vi.mock('./deviceIdentity', () => ({
  getLocalDevice: () => ({ id: 'desktop-x', label: 'Desktop browser' }),
}));

const fetchMock = h.fetchMock;
const setServed = (value: boolean) => {
  h.served.value = value;
};

import {
  clearProjectSyncChannels,
  registerProjectSyncChannel,
  type ProjectSyncChannel,
} from './projectSyncService';
import {
  __resetProjectSyncClientForTests,
  ensureProjectSyncChannelStarted,
} from './projectSyncClient';

const jsonRes = (body: unknown) => ({ ok: true, json: async () => body });

function fakeChannel(applied: unknown[]): ProjectSyncChannel {
  return {
    id: 'fake',
    applyRemote: (change) => {
      applied.push(change);
      return true;
    },
    snapshot: () => ({ kind: 'snap' }),
  };
}

beforeEach(() => {
  setServed(true);
  fetchMock.mockReset();
  clearProjectSyncChannels();
  __resetProjectSyncClientForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('projectSyncClient', () => {
  it('seeds from the snapshot then applies each tailed event op', async () => {
    const applied: unknown[] = [];
    registerProjectSyncChannel(fakeChannel(applied));

    fetchMock.mockImplementation((path: string) => {
      if (path.includes('/snapshot')) {
        return Promise.resolve(jsonRes({ snapshot: { op: 'seed' }, version: 3 }));
      }
      if (path.includes('/events')) {
        setServed(false); // end the long-poll loop after delivering this batch
        return Promise.resolve(
          jsonRes({ version: 5, events: [{ version: 4, channel: 'fake', change: { op: 'live' } }] }),
        );
      }
      return Promise.resolve(null);
    });

    await ensureProjectSyncChannelStarted('fake');
    await vi.waitFor(() => expect(applied).toHaveLength(2));

    expect(applied[0]).toEqual({ op: 'seed' }); // snapshot seed
    expect(applied[1]).toEqual({ op: 'live' }); // tailed event
    // The events long-poll carried the cursor from the seed version.
    expect(fetchMock.mock.calls.some(([p]) => p === '/project/fake/events?since=3')).toBe(true);
  });

  it('is idempotent: a second start does not re-seed', async () => {
    const applied: unknown[] = [];
    registerProjectSyncChannel(fakeChannel(applied));
    fetchMock.mockImplementation((path: string) => {
      if (path.includes('/snapshot')) return Promise.resolve(jsonRes({ snapshot: { op: 'seed' }, version: 1 }));
      setServed(false);
      return Promise.resolve(jsonRes({ version: 1, events: [] }));
    });

    await ensureProjectSyncChannelStarted('fake');
    await ensureProjectSyncChannelStarted('fake');

    const snapshotCalls = fetchMock.mock.calls.filter(([p]) => p.includes('/snapshot'));
    expect(snapshotCalls).toHaveLength(1);
  });

  it('does nothing off a served session', async () => {
    setServed(false);
    registerProjectSyncChannel(fakeChannel([]));
    await ensureProjectSyncChannelStarted('fake');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publishes a local op to /project/:channel/mutate with the actor device id for the baton gate', () => {
    expect(h.publisher.current).toBeTypeOf('function');
    fetchMock.mockResolvedValue(jsonRes({ ok: true }));

    h.publisher.current?.('fake', { op: 'push' });

    // The actor id rides in the query string so the host can gate non-holder writes (the relay forwards
    // no headers).
    expect(fetchMock).toHaveBeenCalledWith(
      '/project/fake/mutate?device=desktop-x',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ op: 'push' }) }),
    );
  });

  it('does not publish off a served session', () => {
    setServed(false);
    h.publisher.current?.('fake', { op: 'push' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
