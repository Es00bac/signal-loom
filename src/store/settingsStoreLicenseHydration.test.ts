import './test-setup-window';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-015: commercial-license validation must not race the asynchronous encrypted-settings
 * hydration. These tests control decryption timing through a mocked secretCipher and re-import
 * the store per test so every case starts from a fresh, un-hydrated module.
 */

const VALID_KEY = 'SLOOM-valid-test-key';
const INVALID_KEY = 'SLOOM-unverifiable-test-key';
const SETTINGS_STORAGE_KEY = 'flow-settings-storage';

const cipherControl = vi.hoisted(() => ({
  pending: [] as Array<{ envelope: string; resolve: (plain: string | null) => void }>,
}));

vi.mock('../lib/secretCipher', () => ({
  isEncryptedSecretEnvelope: (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (envelope: string) => {
    // This suite controls profile-cache hydration. Immutable operation records are separate
    // durable facts and must not become extra, unowned scheduling gates in the cache fixture.
    if (envelope.startsWith('enc:{"clock"')) return Promise.resolve(envelope.slice('enc:'.length));
    return new Promise<string | null>((resolve) => {
      cipherControl.pending.push({ envelope, resolve });
    });
  },
  encryptSecret: async (plain: string) => `enc:${plain}`,
  isSecretEncryptionActive: () => true,
}));

vi.mock('../lib/licenseKey', () => ({
  verifyLicenseKey: async (key: string) =>
    key === VALID_KEY
      ? { licensed: true, email: 'buyer@example.com', edition: 'commercial' }
      : { licensed: false, reason: 'Key not valid for this build.' },
  describeLicenseEdition: () => 'Community edition',
}));

function seedPersistedSettings(state: Record<string, unknown>): void {
  window.localStorage.removeItem(`${SETTINGS_STORAGE_KEY}:write-version`);
  window.localStorage.removeItem(`${SETTINGS_STORAGE_KEY}:committed-write-version`);
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, `enc:${JSON.stringify({ state, version: 0 })}`);
}

/** Resolve every queued decryption; `map` turns the stored envelope into its plaintext (or null). */
async function flushPendingDecrypts(map: (envelope: string) => string | null): Promise<void> {
  await vi.waitFor(() => {
    expect(cipherControl.pending.length).toBeGreaterThan(0);
  });
  for (const entry of cipherControl.pending.splice(0)) {
    entry.resolve(map(entry.envelope));
  }
}

const decryptEnvelope = (envelope: string): string => envelope.slice('enc:'.length);

async function settlePersistence(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

type SettingsStoreModule = typeof import('./settingsStore');

async function importFreshSettingsStore(): Promise<SettingsStoreModule> {
  return import('./settingsStore');
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  cipherControl.pending.length = 0;
});

afterEach(async () => {
  // Let the fresh module's recursively queued per-record persistence finish before the shared
  // deferred-cipher fixture is reset for the next module registry.
  await settlePersistence();
  expect(cipherControl.pending).toHaveLength(0);
});

describe('settings license hydration (AUD-015)', () => {
  it('a revalidation issued before hydration lands still validates the hydrated key', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { useSettingsStore } = await importFreshSettingsStore();

    // Boot-time validation fires while the encrypted snapshot is still decrypting.
    const bootValidation = useSettingsStore.getState().revalidateLicense();

    await flushPendingDecrypts(decryptEnvelope);
    await bootValidation;

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
      expect(useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
    });
  });

  it('exposes settingsHydrated=false until the encrypted snapshot lands', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const settingsModule = await importFreshSettingsStore();
    const { useSettingsStore } = settingsModule;

    expect(useSettingsStore.getState().settingsHydrated).toBe(false);

    await flushPendingDecrypts(decryptEnvelope);
    await settingsModule.waitForSettingsHydration();

    expect(useSettingsStore.getState().settingsHydrated).toBe(true);
  });

  it('completes hydration fail-closed when the snapshot cannot be decrypted', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const settingsModule = await importFreshSettingsStore();
    const { useSettingsStore } = settingsModule;

    const bootValidation = useSettingsStore.getState().revalidateLicense();

    // Foreign-profile envelope: decryption yields null, so hydration falls back to defaults.
    await flushPendingDecrypts(() => null);
    await settingsModule.waitForSettingsHydration();
    await bootValidation;

    expect(useSettingsStore.getState().settingsHydrated).toBe(true);
    expect(useSettingsStore.getState().licenseKey).toBe('');
    expect(useSettingsStore.getState().license.licensed).toBe(false);
  });

  it('re-verifies when a later rehydration changes the persisted license identity', async () => {
    seedPersistedSettings({ licenseKey: INVALID_KEY });
    const settingsModule = await importFreshSettingsStore();
    const { useSettingsStore } = settingsModule;
    const persistApi = (useSettingsStore as unknown as {
      persist: { rehydrate: () => Promise<void> | void };
    }).persist;

    await flushPendingDecrypts(decryptEnvelope);
    await settingsModule.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    });
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    // The simulated remote replacement starts after this renderer's boot write has completed.
    // Otherwise that older cache write can physically overwrite the fixture's direct seed.
    await settlePersistence();

    // Another writer persisted a valid key; this session rehydrates it.
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const upgrade = persistApi.rehydrate();
    await flushPendingDecrypts(decryptEnvelope);
    await upgrade;

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });
    await settlePersistence();

    // Downgrade direction stays fail-closed: an unverifiable key never keeps the old grant.
    seedPersistedSettings({ licenseKey: INVALID_KEY });
    const downgrade = persistApi.rehydrate();
    await flushPendingDecrypts(decryptEnvelope);
    await downgrade;

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
      expect(useSettingsStore.getState().license.licensed).toBe(false);
      expect(useSettingsStore.getState().license.reason).toBeTruthy();
    });
  });
});
