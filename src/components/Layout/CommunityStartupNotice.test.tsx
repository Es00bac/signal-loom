// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-015 startup behavior: the Community notice must not judge the license (nor decide to show)
 * before the encrypted settings snapshot has hydrated. Decryption timing is test-controlled
 * through a mocked secretCipher; the store and component are re-imported fresh per test.
 */

const VALID_KEY = 'SLOOM-valid-test-key';
const SETTINGS_STORAGE_KEY = 'flow-settings-storage';
const NOTICE_DAY_STORAGE_KEY = 'signal-loom-community-notice-day';

vi.hoisted(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
});

const cipherControl = vi.hoisted(() => ({
  pending: [] as Array<{ envelope: string; resolve: (plain: string | null) => void }>,
}));

vi.mock('../../lib/secretCipher', () => ({
  isEncryptedSecretEnvelope: (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (envelope: string) =>
    new Promise<string | null>((resolve) => {
      cipherControl.pending.push({ envelope, resolve });
    }),
  encryptSecret: async (plain: string) => `enc:${plain}`,
  isSecretEncryptionActive: () => true,
}));

const verifierControl = vi.hoisted(() => ({
  mode: 'instant' as 'instant' | 'deferred',
  pending: [] as Array<{ key: string; resolve: (verdict: unknown) => void }>,
}));

vi.mock('../../lib/licenseKey', () => ({
  verifyLicenseKey: (key: string) => {
    const verdict = key === VALID_KEY
      ? { licensed: true, email: 'buyer@example.com', edition: 'commercial' }
      : { licensed: false, reason: 'Key not valid for this build.' };
    if (verifierControl.mode === 'instant') {
      return Promise.resolve(verdict);
    }
    return new Promise((resolve) => {
      verifierControl.pending.push({ key, resolve });
    });
  },
  describeLicenseEdition: () => 'Community edition',
}));

function seedPersistedSettings(state: Record<string, unknown>): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, `enc:${JSON.stringify({ state, version: 0 })}`);
}

async function flushPendingDecrypts(): Promise<void> {
  await vi.waitFor(() => {
    expect(cipherControl.pending.length).toBeGreaterThan(0);
  });
  for (const entry of cipherControl.pending.splice(0)) {
    entry.resolve(entry.envelope.slice('enc:'.length));
  }
}

/** Drain queued microtask chains and React effect work until the async startup flow settles. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function noticeElement(): Element | null {
  return document.querySelector('[data-community-notice]');
}

let root: Root | null = null;
let container: HTMLElement | null = null;

async function renderNotice(): Promise<void> {
  const { CommunityStartupNotice } = await import('./CommunityStartupNotice');
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLElement);
    root.render(<CommunityStartupNotice />);
  });
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  cipherControl.pending.length = 0;
  verifierControl.mode = 'instant';
  verifierControl.pending.length = 0;
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => {
      mounted.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('CommunityStartupNotice hydration race (AUD-015)', () => {
  it('never flashes the notice for a licensed user whose settings hydrate late', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    await renderNotice();
    await settle();

    // Hydration is still pending — the startup decision must not have been made yet.
    expect(noticeElement()).toBeNull();

    await act(async () => {
      await flushPendingDecrypts();
    });
    await settle();

    const { useSettingsStore } = await import('../../store/settingsStore');
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });
    await settle();

    expect(noticeElement()).toBeNull();
  });

  it('shows the notice for a community profile only after hydration confirms it', async () => {
    seedPersistedSettings({ locale: 'en' });
    await renderNotice();
    await settle();

    // No decision before the snapshot lands.
    expect(noticeElement()).toBeNull();

    await act(async () => {
      await flushPendingDecrypts();
    });
    await settle();

    await vi.waitFor(() => {
      expect(noticeElement()).not.toBeNull();
    });
  });

  it('an unmount during the startup decision never claims the day', async () => {
    // A community profile with a stale (unverifiable) key keeps the decision inside license
    // verification long enough for the window to go away underneath it.
    seedPersistedSettings({ licenseKey: 'SLOOM-stale-unverifiable-key' });
    verifierControl.mode = 'deferred';
    await renderNotice();
    await settle();

    await act(async () => {
      await flushPendingDecrypts();
    });
    await settle();

    await vi.waitFor(() => {
      expect(verifierControl.pending.length).toBeGreaterThan(0);
    });

    // The window closes (reload / workspace teardown) before the decision lands.
    const mounted = root;
    if (!mounted) {
      throw new Error('notice root was not mounted');
    }
    await act(async () => {
      mounted.unmount();
    });
    root = null;

    for (const entry of verifierControl.pending.splice(0)) {
      entry.resolve({ licensed: false, reason: 'Key not valid for this build.' });
    }
    await settle();

    // The cancelled decision displayed nothing, so it must not claim the day — a claim here
    // would suppress a notice that was never displayed.
    expect(noticeElement()).toBeNull();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBeNull();
  });

  it('exactly one notice shows when two windows decide together', async () => {
    seedPersistedSettings({ locale: 'en' });
    const { CommunityStartupNotice } = await import('./CommunityStartupNotice');
    const containers = [document.createElement('div'), document.createElement('div')];
    const roots: Root[] = [];
    for (const element of containers) {
      document.body.appendChild(element);
    }
    try {
      await act(async () => {
        for (const element of containers) {
          const mounted = createRoot(element);
          roots.push(mounted);
          mounted.render(<CommunityStartupNotice />);
        }
      });
      await settle();
      await act(async () => {
        await flushPendingDecrypts();
      });
      await settle();

      await vi.waitFor(() => {
        expect(document.querySelectorAll('[data-community-notice]').length).toBe(1);
      });
      // Hold long enough for a second (incorrect) decision to have landed, then re-check.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(document.querySelectorAll('[data-community-notice]').length).toBe(1);
    } finally {
      await act(async () => {
        for (const mounted of roots) {
          mounted.unmount();
        }
      });
      for (const element of containers) {
        element.remove();
      }
    }
  });
});
