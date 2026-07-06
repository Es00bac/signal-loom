// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// The phone-host detection must never mistake a normal web visitor for a served LAN session.
// `setServedMutationPublisher` is invoked at module load (the publisher seam), so it must be stubbed.
vi.mock('./androidLanServer', () => ({
  isAndroidLanServerAvailable: () => false,
  setServedMutationPublisher: () => {},
}));

// The seed must hydrate the freshly-restored bins so a served client's native-file thumbnails resolve
// through the host endpoint (restoreProjectSnapshot leaves their unreachable phone-local assetUrl and
// does NOT hydrate). Mock the (lazily imported) source-bin store so the seed's calls are observable.
vi.mock('../store/sourceBinStore', () => {
  const restoreProjectSnapshot = vi.fn().mockResolvedValue(undefined);
  const hydrateAssets = vi.fn().mockResolvedValue(undefined);
  return {
    useSourceBinStore: {
      getState: () => ({ restoreProjectSnapshot, hydrateAssets }),
    },
  };
});

interface MockResponseInit {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse({ ok, status, contentType, body }: MockResponseInit) {
  return {
    ok,
    status: status ?? (ok ? 200 : 500),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType ?? null : null,
    },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const TOKEN_STORAGE_KEY = 'signal-loom-remote-host-token';

/** jsdom here has no working localStorage; provide an in-memory Storage the module can read/write. */
function stubMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

async function loadFreshModule() {
  vi.resetModules();
  return import('./remoteHostClient');
}

describe('remoteHostClient served-session detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not flag a served session when the host answers HTML (a static web host like sloom.studio)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockResponse({ ok: true, contentType: 'text/html', body: '<!doctype html>' })),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.isServedLanSession()).toBe(false);
  });

  it('does not flag a served session when JSON lacks the Sloom Studio identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockResponse({ ok: true, contentType: 'application/json', body: { name: 'Something Else' } })),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.isServedLanSession()).toBe(false);
  });

  it('flags a served session only when /health returns the Sloom Studio JSON identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/health')) {
          return mockResponse({
            ok: true,
            contentType: 'application/json',
            body: { name: 'Sloom Studio', authRequired: false },
          });
        }
        // source-library seed probe — return empty so the store import is skipped in this unit test
        return mockResponse({ ok: false });
      }),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.isServedLanSession()).toBe(true);
  });

  it('does not flag a served session on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.isServedLanSession()).toBe(false);
  });
});

describe('remoteHostClient seed hydration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates assets after restoring the seed snapshot (so served thumbnails resolve via the host)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/health')) {
          return mockResponse({
            ok: true,
            contentType: 'application/json',
            body: { name: 'Sloom Studio', authRequired: false },
          });
        }
        if (url.includes('/source-library') && !url.includes('/events')) {
          // A native-file-backed item: its assetUrl is an unreachable phone-local capacitor URL until
          // hydrateAssets re-resolves it through the host's /source-asset endpoint.
          return mockResponse({
            ok: true,
            contentType: 'application/json',
            body: {
              version: 1,
              snapshot: {
                bins: [{ id: 'b1', name: 'Source Library', items: [{ id: 'native-1', kind: 'image' }] }],
                dismissedSourceKeys: [],
              },
            },
          });
        }
        // The long-poll subscriber never starts here (no token in the open-host path), so /events is unused.
        return mockResponse({ ok: false });
      }),
    );

    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();

    const store = (await import('../store/sourceBinStore')).useSourceBinStore.getState();
    expect(store.restoreProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(store.hydrateAssets).toHaveBeenCalledTimes(1);
    // Hydration must run AFTER the restore (the restore seeds the unreachable URLs; hydrate fixes them).
    const restoreOrder = (store.restoreProjectSnapshot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const hydrateOrder = (store.hydrateAssets as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(hydrateOrder).toBeGreaterThan(restoreOrder);
  });
});

describe('remoteHostClient pairing (security without HTTPS)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves an auth-required host unpaired when no token is stored', async () => {
    stubMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/health')
          ? mockResponse({ ok: true, contentType: 'application/json', body: { name: 'Sloom Studio', authRequired: true } })
          : mockResponse({ ok: false }),
      ),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();

    expect(mod.isServedLanSession()).toBe(true);
    expect(mod.isRemoteHostAuthRequired()).toBe(true);
    expect(mod.getRemoteHostPairingState()).toBe('unpaired');
  });

  it('exchanges a correct PIN for a session token and flips to paired', async () => {
    const storage = stubMemoryStorage();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith('/health')) {
          return mockResponse({ ok: true, contentType: 'application/json', body: { name: 'Sloom Studio', authRequired: true } });
        }
        if (url.endsWith('/pair')) {
          return mockResponse({ ok: true, contentType: 'application/json', body: { token: 'tok-abc' } });
        }
        // /source-library seed: empty so the long-poll subscriber never starts in this unit test
        return mockResponse({ ok: false });
      }),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.getRemoteHostPairingState()).toBe('unpaired');

    const result = await mod.pairServedSession('123456');
    expect(result).toEqual({ ok: true });
    expect(mod.getRemoteHostPairingState()).toBe('paired');
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-abc');

    const pairCall = calls.find((call) => call.url.endsWith('/pair'));
    expect(pairCall?.init?.method).toBe('POST');
    expect(JSON.parse(String(pairCall?.init?.body))).toEqual({ pin: '123456' });
  });

  it('reports a friendly error and stays unpaired on a wrong PIN', async () => {
    const storage = stubMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/health')) {
          return mockResponse({ ok: true, contentType: 'application/json', body: { name: 'Sloom Studio', authRequired: true } });
        }
        if (url.endsWith('/pair')) {
          return mockResponse({ ok: false, status: 401, contentType: 'application/json', body: {} });
        }
        return mockResponse({ ok: false });
      }),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();

    const result = await mod.pairServedSession('000000');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/match/i);
    expect(mod.getRemoteHostPairingState()).toBe('unpaired');
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('attaches the bearer token on API calls and unpairs on a 401', async () => {
    const storage = stubMemoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, 'stored-tok');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith('/health')) {
          return mockResponse({ ok: true, contentType: 'application/json', body: { name: 'Sloom Studio', authRequired: true } });
        }
        if (url.endsWith('/projects')) {
          return mockResponse({ ok: false, status: 401 });
        }
        // /source-library seed: empty so no subscriber starts
        return mockResponse({ ok: false });
      }),
    );
    const mod = await loadFreshModule();
    await mod.initializeRemoteHostSession();
    expect(mod.getRemoteHostPairingState()).toBe('paired');

    const res = await mod.remoteHostFetch('/projects');
    expect(res?.status).toBe(401);

    const projectsCall = calls.find((call) => call.url.endsWith('/projects'));
    const headers = projectsCall?.init?.headers as Headers | undefined;
    expect(headers?.get('Authorization')).toBe('Bearer stored-tok');

    // A 401 invalidates the token: the session drops back to unpaired and forgets it.
    expect(mod.getRemoteHostPairingState()).toBe('unpaired');
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});
