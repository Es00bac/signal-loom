import './test-setup-window';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-015 cross-window propagation: on desktop every workspace window is its own renderer with
 * its own settings store, but license identity is one shared fact (the encrypted settings blob).
 * A removal or import in one renderer must fail-close / re-key the others.
 *
 * Two "renderers" are simulated as two fresh module registries (vi.resetModules between imports)
 * sharing this process's localStorage stub and BroadcastChannel namespace — the same primitives
 * two Electron BrowserWindows (or two browser tabs) of the app share.
 */

const VALID_KEY = 'SLOOM-valid-test-key';
const SETTINGS_STORAGE_KEY = 'flow-settings-storage';

vi.mock('../lib/licenseKey', () => ({
  verifyLicenseKey: async (key: string) =>
    key === 'SLOOM-valid-test-key'
      ? { licensed: true, email: 'buyer@example.com', edition: 'commercial' }
      : { licensed: false, reason: 'Key not valid for this build.' },
  describeLicenseEdition: () => 'Community edition',
}));

vi.mock('../lib/secretCipher', () => ({
  isEncryptedSecretEnvelope: (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: async (envelope: string) => envelope.slice('enc:'.length),
  encryptSecret: async (plain: string) => `enc:${plain}`,
  isSecretEncryptionActive: () => true,
}));

vi.mock('../lib/settingsBackup', () => ({
  isSettingsBackupSupported: () => true,
  encryptSettingsBackup: async (plaintext: string) => plaintext,
  decryptSettingsBackup: async (envelopeText: string) => envelopeText,
  SettingsBackupError: class SettingsBackupError extends Error {
    kind: string;

    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

function seedPersistedSettings(state: Record<string, unknown>): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, `enc:${JSON.stringify({ state, version: 0 })}`);
}

type SettingsStoreModule = typeof import('./settingsStore');

/** Import a fresh settings-store universe, as a second renderer window would evaluate it. */
async function importRendererWindow(): Promise<SettingsStoreModule> {
  vi.resetModules();
  return import('./settingsStore');
}

const teardowns: Array<() => void> = [];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) {
    teardown();
  }
});

describe('license identity cross-window sync (AUD-015)', () => {
  it('a key removal in one renderer fail-closes the license in the other renderer', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });

    const windowA = await importRendererWindow();
    teardowns.push(windowA.installLicenseCrossWindowSync());
    await windowA.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);
    });

    const windowB = await importRendererWindow();
    teardowns.push(windowB.installLicenseCrossWindowSync());
    await windowB.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });

    windowA.useSettingsStore.getState().removeLicenseKey();
    expect(windowA.useSettingsStore.getState().license.licensed).toBe(false);

    // The other renderer must observe the removal and fail-close without any local action.
    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().licenseKey).toBe('');
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(false);
    });
  });

  it('a backup import in one renderer re-keys and re-verifies the other renderer', async () => {
    const windowA = await importRendererWindow();
    teardowns.push(windowA.installLicenseCrossWindowSync());
    await windowA.waitForSettingsHydration();

    const windowB = await importRendererWindow();
    teardowns.push(windowB.installLicenseCrossWindowSync());
    await windowB.waitForSettingsHydration();
    expect(windowB.useSettingsStore.getState().license.licensed).toBe(false);

    await windowA.useSettingsStore
      .getState()
      .importSettingsBackup(JSON.stringify({ licenseKey: VALID_KEY }), 'passphrase');
    expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);

    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });
  });
});
