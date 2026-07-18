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

const cipherControl = vi.hoisted(() => ({
  holdNextDecryptions: 0,
  pendingDecryptions: [] as Array<{ envelope: string; resolve: (plain: string | null) => void }>,
  holdNextEncryptions: 0,
  pendingEncryptions: [] as Array<{ plain: string; resolve: (envelope: string) => void }>,
}));

vi.mock('../lib/secretCipher', () => ({
  isEncryptedSecretEnvelope: (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (envelope: string) => {
    if (cipherControl.holdNextDecryptions > 0) {
      cipherControl.holdNextDecryptions -= 1;
      return new Promise<string | null>((resolve) => {
        cipherControl.pendingDecryptions.push({ envelope, resolve });
      });
    }
    return Promise.resolve(envelope.slice('enc:'.length));
  },
  encryptSecret: (plain: string) => {
    if (cipherControl.holdNextEncryptions > 0) {
      cipherControl.holdNextEncryptions -= 1;
      return new Promise<string>((resolve) => {
        cipherControl.pendingEncryptions.push({ plain, resolve });
      });
    }
    return Promise.resolve(`enc:${plain}`);
  },
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

function seedPersistedSettings(state: Record<string, unknown>, writeVersion = 0): void {
  const stamped = {
    state,
    version: 0,
    ...(writeVersion > 0 ? { __flowSettingsWriteVersion: writeVersion } : {}),
  };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, `enc:${JSON.stringify(stamped)}`);
  if (writeVersion > 0) {
    window.localStorage.setItem(`${SETTINGS_STORAGE_KEY}:write-version`, String(writeVersion));
    window.localStorage.setItem(`${SETTINGS_STORAGE_KEY}:committed-write-version`, String(writeVersion));
  } else {
    window.localStorage.removeItem(`${SETTINGS_STORAGE_KEY}:write-version`);
    window.localStorage.removeItem(`${SETTINGS_STORAGE_KEY}:committed-write-version`);
  }
}

function legacyBackupWithLicense(licenseKey: string): string {
  return JSON.stringify({
    apiKeys: {},
    defaultModels: {},
    providerSettings: {},
    interfaceThemeId: 'default',
    keyboardShortcuts: {},
    gamepadBindings: {},
    customBrushPresets: [],
    customCropPresets: [],
    licenseKey,
  });
}

function readPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  expect(raw).toBeTruthy();
  expect(raw!.startsWith('enc:')).toBe(true);
  return (JSON.parse(raw!.slice('enc:'.length)) as { state: Record<string, unknown> }).state;
}

type SettingsStoreModule = typeof import('./settingsStore');
type LicenseGatesModule = typeof import('../lib/licenseGates');
type RendererWindow = SettingsStoreModule & Pick<LicenseGatesModule, 'isCommercialExportUnlocked'>;

/** Import a fresh settings-store universe, as a second renderer window would evaluate it. */
async function importRendererWindow(): Promise<RendererWindow> {
  vi.resetModules();
  const settings = await import('./settingsStore');
  const gates = await import('../lib/licenseGates');
  return { ...settings, isCommercialExportUnlocked: gates.isCommercialExportUnlocked };
}

const teardowns: Array<() => void> = [];

beforeEach(() => {
  window.localStorage.clear();
  cipherControl.holdNextDecryptions = 0;
  cipherControl.pendingDecryptions.length = 0;
  cipherControl.holdNextEncryptions = 0;
  cipherControl.pendingEncryptions.length = 0;
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) {
    teardown();
  }
});

describe('license identity cross-window sync (AUD-015)', () => {
  it('never resurrects a delayed version-10 read after a dropped remote removal and unrelated write', async () => {
    // Exact AUD-015 final-gate reproduction. Window A has physically read version 10 and is
    // stuck decrypting it; Window B commits removal of both secrets plus an unrelated provider
    // change. Neither window installs the channel listener, deliberately dropping B's notice.
    seedPersistedSettings({
      licenseKey: VALID_KEY,
      apiKeys: { openai: 'sk-version-10-secret' },
      providerSettings: { atlasBaseUrl: 'https://version-10.example.test' },
    }, 10);
    cipherControl.holdNextDecryptions = 1;
    const windowA = await importRendererWindow();
    await vi.waitFor(() => {
      expect(cipherControl.pendingDecryptions).toHaveLength(1);
    });
    const staleRead = cipherControl.pendingDecryptions.splice(0, 1)[0];

    const windowB = await importRendererWindow();
    await windowB.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });

    windowB.useSettingsStore.getState().removeLicenseKey();
    windowB.useSettingsStore.getState().setApiKey('openai', '');
    windowB.useSettingsStore.getState().setProviderSetting('atlasBaseUrl', 'https://version-11.example.test');
    await vi.waitFor(() => {
      const persisted = readPersistedState();
      expect(persisted.licenseKey).toBe('');
      expect(persisted.apiKeys).toMatchObject({ openai: '' });
      expect(persisted.providerSettings).toMatchObject({ atlasBaseUrl: 'https://version-11.example.test' });
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(false);
      expect(windowB.isCommercialExportUnlocked()).toBe(false);
      expect(window.localStorage.getItem(`${SETTINGS_STORAGE_KEY}:change-token`)).toBeTruthy();
      expect(window.localStorage.getItem(`${SETTINGS_STORAGE_KEY}:license-change-token`)).toBeTruthy();
      expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .some((key) => key?.startsWith(`${SETTINGS_STORAGE_KEY}:record:licenseKey:`))).toBe(true);
    });

    // Releasing A's old decrypt must force a durable re-read before merge, not turn its old
    // complete snapshot into a fresh version-13 resurrection write.
    staleRead.resolve(staleRead.envelope.slice('enc:'.length));
    await windowA.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe('');
      expect(windowA.useSettingsStore.getState().apiKeys.openai).toBe('');
      expect(windowA.useSettingsStore.getState().providerSettings.atlasBaseUrl).toBe('https://version-11.example.test');
      expect(windowA.useSettingsStore.getState().license.licensed).toBe(false);
      expect(windowA.isCommercialExportUnlocked()).toBe(false);
      expect(readPersistedState().licenseKey).toBe('');
    });

    // Reload is another delivery-independent reader of the encrypted durable blob.
    const windowC = await importRendererWindow();
    await windowC.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowC.useSettingsStore.getState().licenseKey).toBe('');
      expect(windowC.useSettingsStore.getState().apiKeys.openai).toBe('');
      expect(windowC.useSettingsStore.getState().providerSettings.atlasBaseUrl).toBe('https://version-11.example.test');
      expect(windowC.useSettingsStore.getState().license.licensed).toBe(false);
      expect(windowC.isCommercialExportUnlocked()).toBe(false);
    });
  });

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

  it('does not rehydrate a licensed renderer for unrelated settings persistence notices', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const renderer = await importRendererWindow();
    const storageListeners = new Set<(event: StorageEvent) => void>();
    const eventWindow = window as unknown as {
      addEventListener?: (type: string, listener: (event: StorageEvent) => void) => void;
      removeEventListener?: (type: string, listener: (event: StorageEvent) => void) => void;
    };
    const previousAddEventListener = eventWindow.addEventListener;
    const previousRemoveEventListener = eventWindow.removeEventListener;
    eventWindow.addEventListener = (type, listener) => { if (type === 'storage') storageListeners.add(listener); };
    eventWindow.removeEventListener = (type, listener) => { if (type === 'storage') storageListeners.delete(listener); };
    teardowns.push(() => {
      eventWindow.addEventListener = previousAddEventListener;
      eventWindow.removeEventListener = previousRemoveEventListener;
    });
    teardowns.push(renderer.installLicenseCrossWindowSync());
    await renderer.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(renderer.useSettingsStore.getState().license.licensed).toBe(true);
    });

    const rehydrate = vi.spyOn(renderer.useSettingsStore.persist, 'rehydrate');
    renderer.useSettingsStore.getState().setProviderSetting('atlasBaseUrl', 'https://unrelated.example.test');
    await vi.waitFor(() => {
      expect(readPersistedState().providerSettings).toMatchObject({ atlasBaseUrl: 'https://unrelated.example.test' });
    });
    expect(window.localStorage.getItem(`${SETTINGS_STORAGE_KEY}:license-change-token`)).toBeNull();

    const dispatchStorage = (key: string) => storageListeners.forEach((listener) => listener({ key } as StorageEvent));
    dispatchStorage(SETTINGS_STORAGE_KEY);
    dispatchStorage(`${SETTINGS_STORAGE_KEY}:change-token`);
    dispatchStorage(`${SETTINGS_STORAGE_KEY}:record:providerSettings.atlasBaseUrl:remote`);
    await Promise.resolve();
    await Promise.resolve();

    expect(rehydrate).not.toHaveBeenCalled();
    expect(renderer.useSettingsStore.getState().license.licensed).toBe(true);
  });

  it('duplicate durable-change notices are idempotent after a removal tombstone', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY }, 4);
    const windowA = await importRendererWindow();
    const windowB = await importRendererWindow();
    teardowns.push(windowA.installLicenseCrossWindowSync(), windowB.installLicenseCrossWindowSync());
    await Promise.all([windowA.waitForSettingsHydration(), windowB.waitForSettingsHydration()]);
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });

    windowB.useSettingsStore.getState().removeLicenseKey();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe('');
    });
    const tombstoneVersion = window.localStorage.getItem(`${SETTINGS_STORAGE_KEY}:committed-write-version`);
    const duplicateSender = new BroadcastChannel('flow-license-identity-sync');
    try {
      duplicateSender.postMessage('license-identity-changed');
      duplicateSender.postMessage('license-identity-changed');
      await vi.waitFor(() => {
        expect(windowA.useSettingsStore.getState().licenseKey).toBe('');
        expect(windowA.useSettingsStore.getState().license.licensed).toBe(false);
        expect(windowB.useSettingsStore.getState().licenseKey).toBe('');
        expect(readPersistedState().licenseKey).toBe('');
      });
    } finally {
      duplicateSender.close();
    }
    expect(window.localStorage.getItem(`${SETTINGS_STORAGE_KEY}:committed-write-version`)).toBe(tombstoneVersion);
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
      .importSettingsBackup(legacyBackupWithLicense(VALID_KEY), 'passphrase');
    expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);

    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });
  });

  it('a completed removal broadcast wins over an older local activation marker in every window', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });

    const windowA = await importRendererWindow();
    teardowns.push(windowA.installLicenseCrossWindowSync());
    await windowA.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);
    });

    // This is deliberately the same valid key: it creates a persisted local identity write in A
    // without changing its visible entitlement. The old global marker model leaves this marker
    // pending indefinitely, even after its write has completed.
    await windowA.useSettingsStore.getState().setLicenseKey(VALID_KEY);
    await vi.waitFor(() => {
      expect(readPersistedState().licenseKey).toBe(VALID_KEY);
    });

    const windowB = await importRendererWindow();
    teardowns.push(windowB.installLicenseCrossWindowSync());
    await windowB.waitForSettingsHydration();
    await vi.waitFor(() => {
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
    });

    // B's write completes before its real BroadcastChannel message tells A to rehydrate.
    // A must accept that newer durable removal; it must not drain its stale activation marker
    // and write the old key back over B's completed state.
    windowB.useSettingsStore.getState().removeLicenseKey();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe('');
      expect(windowB.useSettingsStore.getState().licenseKey).toBe('');
      expect(readPersistedState().licenseKey).toBe('');
    });
  });

  it('a newer snapshot removes an old locally persisted API key while changing another provider setting', async () => {
    const windowA = await importRendererWindow();
    await windowA.waitForSettingsHydration();

    windowA.useSettingsStore.getState().setApiKey('openai', 'sk-old-local-key');
    await vi.waitFor(() => {
      expect(readPersistedState().apiKeys).toMatchObject({ openai: 'sk-old-local-key' });
    });

    const windowB = await importRendererWindow();
    await windowB.waitForSettingsHydration();
    expect(windowB.useSettingsStore.getState().apiKeys.openai).toBe('sk-old-local-key');

    // B persists a newer complete snapshot that removes the key and changes a different setting.
    windowB.useSettingsStore.getState().setApiKey('openai', '');
    windowB.useSettingsStore.getState().setProviderSetting('atlasBaseUrl', 'https://newer.example.test');
    await vi.waitFor(() => {
      const persisted = readPersistedState();
      expect(persisted.apiKeys).toMatchObject({ openai: '' });
      expect(persisted.providerSettings).toMatchObject({ atlasBaseUrl: 'https://newer.example.test' });
    });

    // Settings do not have a general BroadcastChannel contract, so this represents the normal
    // explicit refresh path. A's already-persisted old marker must not overwrite B's snapshot.
    await windowA.useSettingsStore.persist.rehydrate();
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().apiKeys.openai).toBe('');
      expect(windowA.useSettingsStore.getState().providerSettings.atlasBaseUrl).toBe('https://newer.example.test');
      expect(readPersistedState().apiKeys).toMatchObject({ openai: '' });
    });
  });

  it('three windows converge when a completed removal is followed by a newer activation', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });

    const windowA = await importRendererWindow();
    const windowB = await importRendererWindow();
    const windowC = await importRendererWindow();
    teardowns.push(
      windowA.installLicenseCrossWindowSync(),
      windowB.installLicenseCrossWindowSync(),
      windowC.installLicenseCrossWindowSync(),
    );
    await Promise.all([
      windowA.waitForSettingsHydration(),
      windowB.waitForSettingsHydration(),
      windowC.waitForSettingsHydration(),
    ]);
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().license.licensed).toBe(true);
      expect(windowB.useSettingsStore.getState().license.licensed).toBe(true);
      expect(windowC.useSettingsStore.getState().license.licensed).toBe(true);
    });

    windowA.useSettingsStore.getState().removeLicenseKey();
    await vi.waitFor(() => {
      expect(readPersistedState().licenseKey).toBe('');
      expect(windowB.useSettingsStore.getState().licenseKey).toBe('');
      expect(windowC.useSettingsStore.getState().licenseKey).toBe('');
    });

    await windowC.useSettingsStore.getState().setLicenseKey(VALID_KEY);
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(windowB.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(windowC.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(readPersistedState().licenseKey).toBe(VALID_KEY);
    });
  });

  it('a newer broadcast wins when it arrives before an older renderer finishes encrypting', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const windowA = await importRendererWindow();
    const windowB = await importRendererWindow();
    teardowns.push(windowA.installLicenseCrossWindowSync(), windowB.installLicenseCrossWindowSync());
    await Promise.all([windowA.waitForSettingsHydration(), windowB.waitForSettingsHydration()]);

    // A claims the older removal write but cannot finish encrypting it. B then writes a newer
    // activation and broadcasts its completed durable snapshot. The old encrypted completion
    // must be skipped rather than landing after B and recreating a last-writer race.
    cipherControl.holdNextEncryptions = 1;
    windowA.useSettingsStore.getState().removeLicenseKey();
    await vi.waitFor(() => {
      expect(cipherControl.pendingEncryptions.length).toBe(1);
    });

    await windowB.useSettingsStore.getState().setLicenseKey(VALID_KEY);
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(readPersistedState().licenseKey).toBe(VALID_KEY);
    });

    const delayed = cipherControl.pendingEncryptions.splice(0, 1)[0];
    delayed.resolve(`enc:${delayed.plain}`);
    await vi.waitFor(() => {
      expect(windowA.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(windowB.useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
      expect(readPersistedState().licenseKey).toBe(VALID_KEY);
    });
  });
});
