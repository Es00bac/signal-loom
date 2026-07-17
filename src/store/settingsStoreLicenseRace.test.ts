import './test-setup-window';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-015 follow-up: license verification is asynchronous, so every mutation of the license
 * identity (removal, activation, backup import, rehydration) can race an in-flight verifier
 * call. These tests hold verifications open with deferred promises and interleave the mutations
 * deliberately: a stale result must never fail open, duplicated verification must coalesce, and
 * the commercial gates must stay closed throughout every transition window.
 */

const VALID_KEY = 'SLOOM-valid-test-key';
const INVALID_KEY = 'SLOOM-unverifiable-test-key';
const SETTINGS_STORAGE_KEY = 'flow-settings-storage';

interface DeferredVerification {
  key: string;
  resolve: (verdict: unknown) => void;
  reject: (error: unknown) => void;
}

const verifierControl = vi.hoisted(() => ({
  pending: [] as DeferredVerificationHoisted[],
  calls: [] as string[],
}));

// vi.hoisted runs before the type declarations above are usable at runtime; keep the hoisted
// shape structural so the mock factory can push into it.
interface DeferredVerificationHoisted {
  key: string;
  resolve: (verdict: unknown) => void;
  reject: (error: unknown) => void;
}

vi.mock('../lib/licenseKey', () => ({
  verifyLicenseKey: (key: string) =>
    new Promise((resolve, reject) => {
      verifierControl.calls.push(key);
      verifierControl.pending.push({ key, resolve, reject });
    }),
  describeLicenseEdition: () => 'Community edition',
}));

const cipherControl = vi.hoisted(() => ({
  pending: [] as Array<{ envelope: string; resolve: (plain: string | null) => void }>,
}));

vi.mock('../lib/secretCipher', () => ({
  isEncryptedSecretEnvelope: (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (envelope: string) =>
    new Promise<string | null>((resolve) => {
      cipherControl.pending.push({ envelope, resolve });
    }),
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

function licensedVerdict(): unknown {
  return { licensed: true, email: 'buyer@example.com', edition: 'commercial' };
}

function unlicensedVerdict(reason = 'Key not valid for this build.'): unknown {
  return { licensed: false, reason };
}

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

/** Wait for a deferred verification of `key` to appear and take ownership of it. */
async function takeVerification(key: string): Promise<DeferredVerification> {
  let taken: DeferredVerification | undefined;
  await vi.waitFor(() => {
    const index = verifierControl.pending.findIndex((entry) => entry.key === key);
    expect(index).toBeGreaterThanOrEqual(0);
    taken = verifierControl.pending.splice(index, 1)[0];
  });
  if (!taken) {
    throw new Error(`no pending verification for ${key}`);
  }
  return taken;
}

/** Drain queued microtask chains so settled verifications finish applying. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
  }
}

type SettingsStoreModule = typeof import('./settingsStore');
type LicenseGatesModule = typeof import('../lib/licenseGates');

async function importFreshModules(): Promise<{
  settings: SettingsStoreModule;
  gates: LicenseGatesModule;
}> {
  const settings = await import('./settingsStore');
  const gates = await import('../lib/licenseGates');
  return { settings, gates };
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  cipherControl.pending.length = 0;
  verifierControl.pending.length = 0;
  verifierControl.calls.length = 0;
});

describe('license verification race hardening (AUD-015)', () => {
  it('a stale verification of a removed key never fails open', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { settings, gates } = await importFreshModules();
    const { useSettingsStore } = settings;

    await flushPendingDecrypts();
    // Boot verification of the hydrated key is in flight…
    const bootVerification = await takeVerification(VALID_KEY);

    // …when the user removes the key. The store fail-closes immediately.
    useSettingsStore.getState().removeLicenseKey();
    expect(useSettingsStore.getState().licenseKey).toBe('');
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(gates.isCommercialExportUnlocked()).toBe(false);

    // The stale verification finishes last with a positive verdict. It must be discarded:
    // the removal is the newer identity event, and the gates trust this boolean.
    bootVerification.resolve(licensedVerdict());
    await settle();

    expect(useSettingsStore.getState().licenseKey).toBe('');
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(gates.isCommercialExportUnlocked()).toBe(false);
  });

  it('a verification of a superseded key is discarded even when it resolves last', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { settings, gates } = await importFreshModules();
    const { useSettingsStore } = settings;
    const persistApi = useSettingsStore.persist;

    await flushPendingDecrypts();
    const staleVerification = await takeVerification(VALID_KEY);

    // Another writer replaced the persisted identity with an unverifiable key.
    seedPersistedSettings({ licenseKey: INVALID_KEY });
    const rehydration = persistApi.rehydrate();
    await flushPendingDecrypts();
    await rehydration;
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    });

    const freshVerification = await takeVerification(INVALID_KEY);
    freshVerification.resolve(unlicensedVerdict());
    await settle();
    expect(useSettingsStore.getState().license.licensed).toBe(false);

    // The stale verification of the old (valid) key resolves last. Applying it would grant a
    // commercial license to a session whose stored key is unverifiable.
    staleVerification.resolve(licensedVerdict());
    await settle();

    expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(gates.isCommercialExportUnlocked()).toBe(false);
  });

  it('a same-key rehydrate re-verifies exactly once and restores entitlement', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { settings, gates } = await importFreshModules();
    const { useSettingsStore } = settings;
    const persistApi = useSettingsStore.persist;

    await flushPendingDecrypts();
    (await takeVerification(VALID_KEY)).resolve(licensedVerdict());
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });
    expect(useSettingsStore.getState().settingsHydrated).toBe(true);

    // A rehydrate that restores the SAME key: merge fail-closes `license`, and because the key
    // string is unchanged no key-change subscription can fire. The store must still re-verify.
    const verifierCallsBefore = verifierControl.calls.length;
    const rehydration = persistApi.rehydrate();
    await flushPendingDecrypts();
    await rehydration;

    // Transition window: rehydration fail-closed the license and the re-verification has not
    // settled yet — the commercial gate must be locked here, not stuck licensed.
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(gates.isCommercialExportUnlocked()).toBe(false);
    expect(useSettingsStore.getState().settingsHydrated).toBe(true);

    (await takeVerification(VALID_KEY)).resolve(licensedVerdict());
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });
    expect(gates.isCommercialExportUnlocked()).toBe(true);

    // Exactly one re-verification for the rehydrate — no duplicated detached work.
    expect(verifierControl.calls.length).toBe(verifierCallsBefore + 1);
  });

  it('overlapping rehydrates settle on the last writer with a consistent verdict', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { settings } = await importFreshModules();
    const { useSettingsStore } = settings;
    const persistApi = useSettingsStore.persist;

    await flushPendingDecrypts();
    (await takeVerification(VALID_KEY)).resolve(licensedVerdict());
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });

    // First rehydrate targets the valid key again; before its decrypt lands, a second rehydrate
    // starts against a replaced (invalid) identity. The second is the last writer and must win.
    const firstRehydrate = persistApi.rehydrate();
    await vi.waitFor(() => {
      expect(cipherControl.pending.length).toBe(1);
    });
    const firstDecrypt = cipherControl.pending.splice(0, 1)[0];

    seedPersistedSettings({ licenseKey: INVALID_KEY });
    const secondRehydrate = persistApi.rehydrate();
    await vi.waitFor(() => {
      expect(cipherControl.pending.length).toBe(1);
    });
    const secondDecrypt = cipherControl.pending.splice(0, 1)[0];

    // Resolve out of order: the superseded rehydrate's decrypt lands first.
    firstDecrypt.resolve(firstDecrypt.envelope.slice('enc:'.length));
    secondDecrypt.resolve(secondDecrypt.envelope.slice('enc:'.length));
    await Promise.all([firstRehydrate, secondRehydrate]);

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    });
    (await takeVerification(INVALID_KEY)).resolve(unlicensedVerdict());
    await settle();

    expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(verifierControl.pending.length).toBe(0);
  });

  it('backup import awaits the single canonical verification before resolving', async () => {
    const { settings } = await importFreshModules();
    const { useSettingsStore } = settings;
    await settings.waitForSettingsHydration();

    let importSettled = false;
    const importPromise = useSettingsStore
      .getState()
      .importSettingsBackup(JSON.stringify({ licenseKey: INVALID_KEY }), 'passphrase')
      .then(() => {
        importSettled = true;
      });

    const verification = await takeVerification(INVALID_KEY);
    await settle();

    // Deterministic postcondition: import must not resolve while the imported key's
    // entitlement is still unsettled.
    expect(importSettled).toBe(false);
    expect(useSettingsStore.getState().license.licensed).toBe(false);

    verification.resolve(unlicensedVerdict('nope'));
    await importPromise;

    expect(useSettingsStore.getState().licenseKey).toBe(INVALID_KEY);
    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(useSettingsStore.getState().license.reason).toBe('nope');

    // Exactly one verification for the imported key — the import must not race a second,
    // detached verification of the same identity.
    expect(verifierControl.calls.filter((key) => key === INVALID_KEY).length).toBe(1);
  });

  it('a verifier rejection resolves fail-closed instead of leaking the rejection', async () => {
    seedPersistedSettings({ licenseKey: VALID_KEY });
    const { settings, gates } = await importFreshModules();
    const { useSettingsStore } = settings;

    await flushPendingDecrypts();
    (await takeVerification(VALID_KEY)).resolve(licensedVerdict());
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(true);
    });

    const revalidation = useSettingsStore.getState().revalidateLicense();

    // Fail-closed before the verifier is awaited: mid-verification the gates must be locked.
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().license.licensed).toBe(false);
    });
    expect(gates.isCommercialExportUnlocked()).toBe(false);

    (await takeVerification(VALID_KEY)).reject(new Error('verifier crashed'));
    await expect(revalidation).resolves.toBeUndefined();

    expect(useSettingsStore.getState().license.licensed).toBe(false);
    expect(useSettingsStore.getState().license.reason).toBeTruthy();
    expect(gates.isCommercialExportUnlocked()).toBe(false);
  });

  it('an activation supersedes an in-flight revalidation of the previous key', async () => {
    seedPersistedSettings({ licenseKey: INVALID_KEY });
    const { settings, gates } = await importFreshModules();
    const { useSettingsStore } = settings;

    await flushPendingDecrypts();
    // Boot verification of the old (invalid) key is held open…
    const staleVerification = await takeVerification(INVALID_KEY);

    // …while the user pastes and activates a valid key.
    const activation = useSettingsStore.getState().setLicenseKey(VALID_KEY);
    (await takeVerification(VALID_KEY)).resolve(licensedVerdict());
    const activationResult = await activation;
    expect(activationResult.licensed).toBe(true);
    expect(useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
    expect(useSettingsStore.getState().license.licensed).toBe(true);

    // The stale verification of the replaced key resolves last; it must not clobber the fresh
    // activation in either direction.
    staleVerification.resolve(unlicensedVerdict('stale key'));
    await settle();

    expect(useSettingsStore.getState().licenseKey).toBe(VALID_KEY);
    expect(useSettingsStore.getState().license.licensed).toBe(true);
    expect(gates.isCommercialExportUnlocked()).toBe(true);
  });
});
