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

vi.mock('../../lib/licenseKey', () => ({
  verifyLicenseKey: async (key: string) =>
    key === VALID_KEY
      ? { licensed: true, email: 'buyer@example.com', edition: 'commercial' }
      : { licensed: false, reason: 'Key not valid for this build.' },
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
});
