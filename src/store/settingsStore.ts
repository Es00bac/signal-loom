import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecretEnvelope,
  isSecretEncryptionActive,
} from '../lib/secretCipher';
import {
  decryptSettingsBackup,
  encryptSettingsBackup,
  isSettingsBackupSupported,
  SettingsBackupError,
} from '../lib/settingsBackup';
import { DEFAULT_INTERFACE_THEME_ID, resolveInterfaceTheme } from '../lib/interfaceThemes';
import { normalizeLocale, resolveDefaultLocale, type AppLocale } from '../lib/i18n';
import { verifyLicenseKey, type LicenseVerification } from '../lib/licenseKey';
import { sanitizeKeyboardShortcutMap, type KeyboardShortcutMap } from '../lib/keyboardShortcuts';
import {
  createCropPreset,
  renameCropPreset,
  sanitizeCropPresets,
  type CropCustomPreset,
} from '../components/ImageEditor/cropPresets';
import type { BrushSettings } from '../types/imageEditor';
import {
  createDefaultGamepadBindings,
  normalizeGamepadBindings,
  type GamepadBindingProfile,
  type GamepadControlBinding,
  type GamepadControlId,
  type GamepadWorkspace,
} from '../lib/gamepadBindings';
import { DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS } from '../lib/providerCatalog';
import type { NativeMenuCommand } from '../lib/nativeApp';
import {
  createUserBrushPreset,
  renameUserBrushPreset,
  sanitizeUserBrushPresets,
  type ImageBrushPreset,
} from '../components/ImageEditor/ImageBrushPresets';
import {
  isOpenFontLibraryFace,
  type OpenFontLibraryFace,
} from '../lib/paperOpenFontCatalog';
import type {
  ApiKeys,
  DefaultModelSettings,
  ImageProvider,
  ProviderSettings,
} from '../types/flow';

/** The provider+model a new Image node starts on, when the user has pinned one as default. */
export interface DefaultImageNodeModel {
  provider: ImageProvider;
  modelId: string;
}

const API_KEY_PROVIDERS = ['openai', 'gemini', 'huggingface', 'elevenlabs', 'bfl', 'stability', 'atlas', 'byteplus'] as const;
type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];
type ApiKeyValueMap = Record<ApiKeyProvider, string>;
type ApiKeyStorageDescriptorMap = {
  [provider in ApiKeyProvider]: ApiKeyStorageDescriptor;
};

const API_KEY_REDACTION = '[redacted]';
const SETTINGS_STORAGE_KEY = 'flow-settings-storage';
const LOCAL_STORAGE_CAVEAT = 'API keys are stored in browser localStorage without at-rest encryption in this app.';
const MEMORY_ONLY_CAVEAT = 'API keys are currently not persisted to browser storage in this session.';
const ENCRYPTED_CAVEAT = 'API keys are encrypted at rest (the OS keychain on desktop, WebCrypto on web and mobile) and only decrypted in memory while the app is open.';

const API_KEY_REDACTED_LABEL: ApiKeyValueMap = {
  openai: API_KEY_REDACTION,
  gemini: API_KEY_REDACTION,
  huggingface: API_KEY_REDACTION,
  elevenlabs: API_KEY_REDACTION,
  bfl: API_KEY_REDACTION,
  stability: API_KEY_REDACTION,
  atlas: API_KEY_REDACTION,
  byteplus: API_KEY_REDACTION,
};

export type ApiKeyStorageMedium = 'local-storage' | 'memory-only';

export interface ApiKeyStorageDescriptor {
  provider: ApiKeyProvider;
  configured: boolean;
  redacted: string;
  storageMedium: ApiKeyStorageMedium;
  encryptedAtRest: boolean;
}

export interface ApiKeyStorageStatus {
  encryptedAtRest: boolean;
  storageMedium: ApiKeyStorageMedium;
  browserStorageAvailable: boolean;
  caveat: string;
  descriptors: ApiKeyStorageDescriptorMap;
}

export function isApiKeyStorageEncryptedAtRest(): boolean {
  return isSecretEncryptionActive();
}

export function getApiKeyStorageMedium(): ApiKeyStorageMedium {
  return hasBrowserLocalStorage() ? 'local-storage' : 'memory-only';
}

export function getApiKeyStorageCaveat(storageMedium: ApiKeyStorageMedium = getApiKeyStorageMedium()): string {
  if (storageMedium === 'memory-only') return MEMORY_ONLY_CAVEAT;
  return isSecretEncryptionActive() ? ENCRYPTED_CAVEAT : LOCAL_STORAGE_CAVEAT;
}

export function sanitizePersistedApiKeys(input: unknown): ApiKeys {
  const source = isRecord(input) ? input : {};
  const apiKeys: ApiKeys = {
    openai: '',
    gemini: '',
    huggingface: '',
    elevenlabs: '',
    bfl: '',
    stability: '',
    atlas: '',
    byteplus: '',
  };

  for (const provider of API_KEY_PROVIDERS) {
    const value = source[provider];
    if (typeof value === 'string') {
      apiKeys[provider] = value;
    }
  }

  return apiKeys;
}

export function redactApiKeysForUi(apiKeys: ApiKeys): ApiKeyValueMap {
  return buildRedactedApiKeys(apiKeys);
}

export function redactApiKeysForExport(apiKeys: ApiKeys): ApiKeyValueMap {
  return buildRedactedApiKeys(apiKeys);
}

export function redactApiKeysForDiagnostics(apiKeys: ApiKeys): ApiKeyValueMap {
  return buildRedactedApiKeys(apiKeys);
}

export function getApiKeyStorageStatus(apiKeys: ApiKeys): ApiKeyStorageStatus {
  const storageMedium = getApiKeyStorageMedium();
  const browserStorageAvailable = storageMedium === 'local-storage';
  const encryptedAtRest = isSecretEncryptionActive();
  const descriptors: ApiKeyStorageDescriptorMap = {} as ApiKeyStorageDescriptorMap;

  for (const provider of API_KEY_PROVIDERS) {
    const hasValue = Boolean(apiKeys[provider]?.trim());
    descriptors[provider] = {
      provider,
      configured: hasValue,
      redacted: hasValue ? API_KEY_REDACTION : '',
      storageMedium,
      encryptedAtRest,
    };
  }

  return {
    encryptedAtRest,
    storageMedium,
    browserStorageAvailable,
    caveat: getApiKeyStorageCaveat(storageMedium),
    descriptors,
  };
}

function hasBrowserLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildRedactedApiKeys(apiKeys: ApiKeys): ApiKeyValueMap {
  const output: Partial<ApiKeyValueMap> = {};

  for (const provider of API_KEY_PROVIDERS) {
    output[provider] = apiKeys[provider]?.trim() ? API_KEY_REDACTION : '';
  }

  return {
    ...API_KEY_REDACTED_LABEL,
    ...output,
  };
}

/**
 * The user-meaningful slice of settings carried in an encrypted backup — everything worth restoring
 * after a reinstall/profile loss, including the bring-your-own-key API tokens and provider credentials.
 * The ephemeral UI flags (isSettingsOpen / settingsPanel) are intentionally excluded.
 */
export interface SettingsBackupData {
  apiKeys: ApiKeys;
  defaultModels: DefaultModelSettings;
  providerSettings: ProviderSettings;
  interfaceThemeId: string;
  keyboardShortcuts: KeyboardShortcutMap;
  gamepadBindings: GamepadBindingProfile;
  customBrushPresets: ImageBrushPreset[];
  customCropPresets: CropCustomPreset[];
  /** Commercial-license key; optional for backups created before licensing shipped. */
  licenseKey?: string;
}

/** Desktop integrated app-menu presentation: a single ☰ button, or a classic horizontal menu bar. */
export type AppMenuStyle = 'compact' | 'menubar';

/**
 * UI density: 'compact' keeps today's tight layout; 'comfortable' raises the
 * smallest text sizes (sub-11px chips/labels) and lifts low-contrast secondary
 * text via root-scoped CSS (see index.css `.density-comfortable`).
 */
export type InterfaceDensity = 'compact' | 'comfortable';

interface SettingsState {
  apiKeys: ApiKeys;
  defaultModels: DefaultModelSettings;
  providerSettings: ProviderSettings;
  interfaceThemeId: string;
  /** Desktop integrated-menu presentation: 'compact' (single ☰) or 'menubar' (classic File/Edit/… row). */
  appMenuStyle: AppMenuStyle;
  interfaceDensity: InterfaceDensity;
  /** Interface language ('en' | 'ja'); drives `translate()` across the UI. */
  locale: AppLocale;
  /** True once the user has confirmed a language (first-run gate or Settings). Gates the first-run
   *  bilingual language chooser so it appears exactly once on a fresh install. */
  localeChosen: boolean;
  keyboardShortcuts: KeyboardShortcutMap;
  gamepadBindings: GamepadBindingProfile;
  customBrushPresets: ImageBrushPreset[];
  customCropPresets: CropCustomPreset[];
  /** Metadata-only records for locally downloaded open fonts; binary bytes remain in the Paper repository. */
  openFontLibrary: OpenFontLibraryFace[];
  /** Encrypt the current settings (keys + credentials) into a portable, passphrase-locked backup blob. */
  exportSettingsBackup: (passphrase: string) => Promise<string>;
  /** Decrypt + restore a settings backup blob produced by exportSettingsBackup. */
  importSettingsBackup: (envelopeText: string, passphrase: string) => Promise<void>;
  settingsBackupSupported: boolean;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  setDefaultModel: <
    TCategory extends keyof DefaultModelSettings,
    TProvider extends keyof DefaultModelSettings[TCategory],
  >(
    category: TCategory,
    provider: TProvider,
    value: string,
  ) => void;
  /** The provider+model new Image nodes start on (pinned via the node's "default" checkbox); null = built-in. */
  defaultImageNodeModel: DefaultImageNodeModel | null;
  setDefaultImageNodeModel: (value: DefaultImageNodeModel | null) => void;
  setProviderSetting: <TKey extends keyof ProviderSettings>(key: TKey, value: ProviderSettings[TKey]) => void;
  setInterfaceThemeId: (themeId: string) => void;
  setAppMenuStyle: (style: AppMenuStyle) => void;
  setInterfaceDensity: (density: InterfaceDensity) => void;
  setLocale: (locale: AppLocale) => void;
  setKeyboardShortcut: (command: NativeMenuCommand, shortcut: string) => void;
  resetKeyboardShortcuts: () => void;
  setGamepadBinding: (workspace: GamepadWorkspace, controlId: GamepadControlId, patch: Partial<GamepadControlBinding>) => void;
  resetGamepadBindings: () => void;
  saveCustomBrushPreset: (label: string, settings: Partial<BrushSettings>) => void;
  renameCustomBrushPreset: (id: string, label: string) => void;
  deleteCustomBrushPreset: (id: string) => void;
  setCustomBrushPresets: (presets: ImageBrushPreset[]) => void;
  saveCustomCropPreset: (label: string, ratio: number) => void;
  renameCustomCropPreset: (id: string, label: string) => void;
  deleteCustomCropPreset: (id: string) => void;
  addOpenFontLibraryFace: (entry: OpenFontLibraryFace) => void;
  isSettingsOpen: boolean;
  settingsPanel: 'providers' | 'keyboard' | 'gamepad' | 'fonts' | 'license';
  openSettings: (panel?: SettingsState['settingsPanel']) => void;
  toggleSettings: () => void;
  /** Raw commercial-license key string ('' = Community). Encrypted at rest with the settings blob. */
  licenseKey: string;
  /** Offline Ed25519 verification result for licenseKey; fail-closed {licensed:false} until revalidated. */
  license: LicenseVerification;
  /** Verify + store a pasted key. Invalid keys are NOT stored; the returned verification carries the reason. */
  setLicenseKey: (key: string) => Promise<LicenseVerification>;
  removeLicenseKey: () => void;
  /** Re-verify the persisted key (app boot; license is fail-closed after rehydration). */
  revalidateLicense: () => Promise<void>;
  /**
   * True once the persisted encrypted settings snapshot has finished its initial hydration — or
   * definitively failed to (missing storage, undecryptable foreign-profile envelope) — so
   * in-memory state is authoritative. Startup decisions that read persisted identity (the
   * commercial license above all) must wait for this instead of judging the pre-hydration
   * defaults.
   *
   * This is a one-shot initial latch by design: it stays true across later rehydrates (manual
   * persist.rehydrate(), cross-window license sync) and deliberately does not model
   * "rehydration in progress" — no caller needs that today. License consistency across later
   * rehydrates is owned by the generation-guarded canonical verification (revalidateLicense),
   * not by this flag; add separate state if a future caller needs in-progress visibility.
   */
  settingsHydrated: boolean;
}

const INITIAL_API_KEYS: ApiKeys = {
  openai: '',
  gemini: '',
  huggingface: '',
  elevenlabs: '',
  bfl: '',
  stability: '',
  atlas: '',
};

/**
 * Persist storage that encrypts the serialized settings blob at rest (see secretCipher) and migrates
 * any pre-existing plaintext on first read. Decryption happens in memory during hydration; the value
 * on disk (localStorage) is opaque ciphertext.
 */
function createEncryptedSettingsStorage(): StateStorage {
  const backing = (): Storage | null => {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    getItem: async (name) => {
      const store = backing();
      if (!store) return null;
      const raw = store.getItem(name);
      if (raw == null) return null;
      if (isEncryptedSecretEnvelope(raw)) {
        // null => can't decrypt (e.g. profile copied to another machine) -> hydrate from defaults.
        return await decryptSecret(raw);
      }
      // Legacy plaintext from before encryption shipped: use it, then re-write it encrypted.
      void encryptSecret(raw).then((envelope) => {
        try {
          backing()?.setItem(name, envelope);
        } catch {
          /* ignore */
        }
      });
      return raw;
    },
    setItem: (name, value) => {
      // Serialize writes: parallel encryptions could otherwise land out of order and leave a
      // stale blob on disk, and the license-identity broadcast below must never fire before the
      // write that actually carries the new identity. The armed flag is captured at enqueue
      // time, so only the write enqueued by the mutating set() triggers the broadcast.
      const broadcastAfterWrite = licenseSyncBroadcastArmed;
      if (broadcastAfterWrite) {
        licenseSyncBroadcastArmed = false;
      }
      const write = pendingSettingsWrite.then(async () => {
        const store = backing();
        if (store) {
          try {
            const envelope = await encryptSecret(value);
            store.setItem(name, envelope);
          } catch {
            /* encryption / quota / availability */
          }
        }
        if (broadcastAfterWrite) {
          postLicenseSyncBroadcast();
        }
      });
      pendingSettingsWrite = write;
      return write;
    },
    removeItem: (name) => {
      try {
        backing()?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Hydration latch (AUD-015): the encrypted settings storage above decrypts asynchronously, so the
 * store exists — with default state — before the persisted snapshot lands. This promise settles
 * exactly once, when persist finishes its hydration attempt (restored, empty, or failed), letting
 * license validation and other persisted-identity readers sequence themselves after it.
 */
let settingsHydrationSettled = false;
let resolveSettingsHydration: () => void = () => {};
const settingsHydrationPromise = new Promise<void>((resolve) => {
  resolveSettingsHydration = resolve;
});

/** Resolves once the persisted settings snapshot has hydrated (or definitively failed to). */
export function waitForSettingsHydration(): Promise<void> {
  return settingsHydrationPromise;
}

function markSettingsHydrated(): void {
  if (settingsHydrationSettled) {
    return;
  }
  settingsHydrationSettled = true;
  useSettingsStore.setState({ settingsHydrated: true });
  resolveSettingsHydration();
}

/** Serializes encrypted settings writes so the persisted blob always converges on the latest state. */
let pendingSettingsWrite: Promise<void> = Promise.resolve();

/**
 * Mutation-vs-hydration guard (AUD-015 residual): hydration reads + decrypts the persisted blob
 * asynchronously, so a (re)hydrate that started BEFORE a local mutation can still be holding the
 * old blob when the mutation lands. Zustand's own hydrationVersion only drops superseded
 * *rehydrates*; nothing stops a stale read from being merged over a newer local write. So every
 * local write records the top-level state keys it touches here, and the persist `merge` below
 * drains the set: keys a local mutation owns keep their current (newer) value, while everything
 * else in the snapshot still applies (first-boot hydration, cross-window rehydrate, and
 * latest-rehydrate-wins for untouched fields are unchanged). The set is drained by merge — the
 * single point where a read snapshot becomes authoritative — never by timers or key-specific
 * cleanup, so any mutation not yet reflected in a read blob stays protected across overlapping
 * reads until one actually lands.
 */
const localMutationKeysSinceLastMerge = new Set<keyof SettingsState>();

function recordLocalMutationKeys(partial: unknown): void {
  if (!isRecord(partial)) {
    return;
  }
  for (const key of Object.keys(partial)) {
    localMutationKeysSinceLastMerge.add(key as keyof SettingsState);
  }
}

/**
 * Wrap a zustand set function so every local mutation records the top-level keys it writes.
 * Function partials are evaluated through a pass-through so their result keys are recorded too.
 */
type SettingsSetState = {
  (
    partial:
      | SettingsState
      | Partial<SettingsState>
      | ((state: SettingsState) => SettingsState | Partial<SettingsState>),
    replace?: false,
  ): void;
  (state: SettingsState | ((state: SettingsState) => SettingsState), replace: true): void;
};

function trackLocalMutationWrites(set: SettingsSetState): SettingsSetState {
  return ((partial: unknown, replace?: boolean) => {
    if (typeof partial === 'function') {
      return set(((state: SettingsState) => {
        const result = (partial as (state: SettingsState) => SettingsState | Partial<SettingsState>)(state);
        recordLocalMutationKeys(result);
        return result;
      }) as never, replace as never);
    }
    recordLocalMutationKeys(partial);
    return set(partial as never, replace as never);
  }) as SettingsSetState;
}

/** True when the last applied hydration merge kept locally-mutated keys over the stale snapshot. */
let lastHydrationKeptLocalMutations = false;

/**
 * Armed by the onRehydrateStorage hook at the start of every real hydration read and consumed by
 * the persist merge below. Only an armed merge applies the mutation-vs-hydration keep-override
 * and drains the pending keys: an out-of-band merge invocation (unit tests, tooling) keeps the
 * plain sanitizing behavior and leaves the pending keys protected for the next real hydration.
 */
let hydrationReadInFlight = false;

function drainLocalMutationKeys(): Array<keyof SettingsState> {
  const keys = [...localMutationKeysSinceLastMerge];
  localMutationKeysSinceLastMerge.clear();
  return keys;
}

/**
 * License-identity generation (AUD-015): verification is asynchronous, so every mutation of the
 * persisted license identity — key removal, activation, backup import, any applied rehydrate —
 * bumps this counter to invalidate whatever verification is still in flight. A verification may
 * only apply its verdict while both the generation and the key it captured are still current;
 * anything resolving later is discarded, so a stale positive can never fail open.
 */
let licenseVerificationGeneration = 0;

/** The one in-flight canonical verification; concurrent triggers coalesce onto it instead of duplicating. */
let pendingLicenseVerification: { generation: number; key: string; promise: Promise<void> } | null = null;

function invalidatePendingLicenseVerification(): void {
  licenseVerificationGeneration += 1;
}

/**
 * Cross-window license-identity sync (AUD-015): every renderer window runs its own store over the
 * shared encrypted settings blob, so a key removal/activation/import in one window must reach the
 * others. The mutating window arms a broadcast that the storage layer above posts only after the
 * persist write carrying the new identity has landed; receiving windows rehydrate, which
 * fail-closes `license` in merge and re-verifies through the canonical path. This is deliberately
 * scoped to license identity/rehydration — no other store state is synchronized here.
 */
const LICENSE_SYNC_CHANNEL_NAME = 'flow-license-identity-sync';
const LICENSE_SYNC_MESSAGE = 'license-identity-changed';
let licenseSyncBroadcastArmed = false;
let licenseSyncChannel: BroadcastChannel | null = null;

function getLicenseSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!licenseSyncChannel) {
    try {
      licenseSyncChannel = new BroadcastChannel(LICENSE_SYNC_CHANNEL_NAME);
    } catch {
      // Opaque-origin or shutting-down contexts can refuse the channel; degrade to no sync.
      return null;
    }
    // Node exposes unref (test runs); browsers have no such member.
    (licenseSyncChannel as unknown as { unref?: () => void }).unref?.();
  }
  return licenseSyncChannel;
}

function armLicenseSyncBroadcast(): void {
  licenseSyncBroadcastArmed = true;
}

function postLicenseSyncBroadcast(): void {
  try {
    getLicenseSyncChannel()?.postMessage(LICENSE_SYNC_MESSAGE);
  } catch {
    /* channel closed / unavailable */
  }
}

/**
 * Subscribe this window to license-identity changes made by other windows (install once per
 * renderer, e.g. from the App shell). Returns the cleanup that detaches the listener.
 */
export function installLicenseCrossWindowSync(): () => void {
  const channel = getLicenseSyncChannel();
  if (!channel) {
    return () => {};
  }
  const handleMessage = (event: MessageEvent) => {
    if (event.data !== LICENSE_SYNC_MESSAGE) {
      return;
    }
    // Re-read the shared blob: merge fail-closes `license`, the post-rehydrate hook re-verifies.
    void useSettingsStore.persist.rehydrate();
  };
  channel.addEventListener('message', handleMessage);
  return () => channel.removeEventListener('message', handleMessage);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (persistSet, get) => {
      // Every action-level mutation records the top-level keys it touches so the persist `merge`
      // below can protect them from stale in-flight hydration reads (mutation-vs-hydration guard).
      const set = trackLocalMutationWrites(persistSet);
      return ({
      apiKeys: INITIAL_API_KEYS,
      defaultModels: DEFAULT_MODELS,
      defaultImageNodeModel: null,
      providerSettings: {
        openaiBaseUrl: DEFAULT_PROVIDER_SETTINGS.openaiBaseUrl,
        atlasBaseUrl: DEFAULT_PROVIDER_SETTINGS.atlasBaseUrl,
        elevenlabsVoiceId: DEFAULT_PROVIDER_SETTINGS.elevenlabsVoiceId,
        renderBackendPreference: DEFAULT_PROVIDER_SETTINGS.renderBackendPreference,
        exportCompositorPreference: DEFAULT_PROVIDER_SETTINGS.exportCompositorPreference,
        localNativeRenderUrl: DEFAULT_PROVIDER_SETTINGS.localNativeRenderUrl,
        localNativeRenderToken: DEFAULT_PROVIDER_SETTINGS.localNativeRenderToken,
        backendProxyEnabled: DEFAULT_PROVIDER_SETTINGS.backendProxyEnabled,
        backendProxyBaseUrl: DEFAULT_PROVIDER_SETTINGS.backendProxyBaseUrl,
        geminiCredentialMode: DEFAULT_PROVIDER_SETTINGS.geminiCredentialMode,
        vertexAuthMode: DEFAULT_PROVIDER_SETTINGS.vertexAuthMode,
        vertexProjectId: DEFAULT_PROVIDER_SETTINGS.vertexProjectId,
        vertexLocation: DEFAULT_PROVIDER_SETTINGS.vertexLocation,
        vertexQuotaProjectId: DEFAULT_PROVIDER_SETTINGS.vertexQuotaProjectId,
        vertexEnvironmentVariables: DEFAULT_PROVIDER_SETTINGS.vertexEnvironmentVariables,
        vertexServiceAccountJson: DEFAULT_PROVIDER_SETTINGS.vertexServiceAccountJson,
        paperPrintUpscaleMethod: DEFAULT_PROVIDER_SETTINGS.paperPrintUpscaleMethod,
        paperPdfRasterPreset: DEFAULT_PROVIDER_SETTINGS.paperPdfRasterPreset,
        localOpenImageEndpointUrl: DEFAULT_PROVIDER_SETTINGS.localOpenImageEndpointUrl,
        localOpenImageAuthHeader: DEFAULT_PROVIDER_SETTINGS.localOpenImageAuthHeader,
        localOpenImageDefaultModel: DEFAULT_PROVIDER_SETTINGS.localOpenImageDefaultModel,
        genericImageEndpointUrl: DEFAULT_PROVIDER_SETTINGS.genericImageEndpointUrl,
        genericImageAuthHeader: DEFAULT_PROVIDER_SETTINGS.genericImageAuthHeader,
        localAiCpuEndpointUrl: DEFAULT_PROVIDER_SETTINGS.localAiCpuEndpointUrl,
        localAiCpuAuthHeader: DEFAULT_PROVIDER_SETTINGS.localAiCpuAuthHeader,
        localAiCpuModel: DEFAULT_PROVIDER_SETTINGS.localAiCpuModel,
        androidAcceleratorBaseUrl: DEFAULT_PROVIDER_SETTINGS.androidAcceleratorBaseUrl,
        androidAcceleratorAuthToken: DEFAULT_PROVIDER_SETTINGS.androidAcceleratorAuthToken,
        androidAcceleratorDefaultUpscaler: DEFAULT_PROVIDER_SETTINGS.androidAcceleratorDefaultUpscaler,
        androidAcceleratorDefaultImageModel: DEFAULT_PROVIDER_SETTINGS.androidAcceleratorDefaultImageModel,
        batchMaxRetries: DEFAULT_PROVIDER_SETTINGS.batchMaxRetries,
        batchRetryBaseDelayMs: DEFAULT_PROVIDER_SETTINGS.batchRetryBaseDelayMs,
        androidLanServerEnabled: DEFAULT_PROVIDER_SETTINGS.androidLanServerEnabled,
        androidLanServerPin: DEFAULT_PROVIDER_SETTINGS.androidLanServerPin,
      },
      interfaceThemeId: DEFAULT_INTERFACE_THEME_ID,
      appMenuStyle: 'compact',
      interfaceDensity: 'compact',
      locale: resolveDefaultLocale(),
      localeChosen: false,
      keyboardShortcuts: {},
      gamepadBindings: createDefaultGamepadBindings(),
      customBrushPresets: [],
      customCropPresets: [],
      openFontLibrary: [],
      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),
      setDefaultModel: (category, provider, value) =>
        set((state) => ({
          defaultModels: {
            ...state.defaultModels,
            [category]: {
              ...state.defaultModels[category],
              [provider]: value,
            },
          },
        })),
      setDefaultImageNodeModel: (value) => set({ defaultImageNodeModel: value }),
      setProviderSetting: (key, value) =>
        set((state) => ({
          providerSettings: {
            ...state.providerSettings,
            [key]: value,
          },
        })),
      setInterfaceThemeId: (themeId) =>
        set({ interfaceThemeId: resolveInterfaceTheme(themeId).id }),
      setAppMenuStyle: (style) =>
        set({ appMenuStyle: style === 'menubar' ? 'menubar' : 'compact' }),
      setInterfaceDensity: (density) =>
        set({ interfaceDensity: density === 'comfortable' ? 'comfortable' : 'compact' }),
      setLocale: (locale) => set({ locale: normalizeLocale(locale), localeChosen: true }),
      setKeyboardShortcut: (command, shortcut) =>
        set((state) => ({
          keyboardShortcuts: sanitizeKeyboardShortcutMap({
            ...state.keyboardShortcuts,
            [command]: shortcut,
          }),
        })),
      resetKeyboardShortcuts: () => set({ keyboardShortcuts: {} }),
      setGamepadBinding: (workspace, controlId, patch) =>
        set((state) => {
          const bindings = normalizeGamepadBindings(state.gamepadBindings);
          bindings[workspace][controlId] = {
            ...bindings[workspace][controlId],
            ...patch,
          };
          return { gamepadBindings: normalizeGamepadBindings(bindings) };
        }),
      resetGamepadBindings: () => set({ gamepadBindings: createDefaultGamepadBindings() }),
      saveCustomBrushPreset: (label, settings) =>
        set((state) => ({
          customBrushPresets: [
            ...state.customBrushPresets,
            createUserBrushPreset(
              label,
              settings,
              [
                ...IMAGE_BUILT_IN_BRUSH_IDS,
                ...state.customBrushPresets.map((preset) => preset.id),
              ],
            ),
          ],
        })),
      renameCustomBrushPreset: (id, label) =>
        set((state) => ({
          customBrushPresets: state.customBrushPresets.map((preset) =>
            preset.id === id ? renameUserBrushPreset(preset, label) : preset),
        })),
      deleteCustomBrushPreset: (id) =>
        set((state) => ({
          customBrushPresets: state.customBrushPresets.filter((preset) => preset.id !== id),
        })),
      setCustomBrushPresets: (presets) =>
        set(() => ({
          customBrushPresets: sanitizeUserBrushPresets(presets),
        })),
      saveCustomCropPreset: (label, ratio) =>
        set((state) => ({
          customCropPresets: [
            ...state.customCropPresets,
            createCropPreset(label, ratio, state.customCropPresets.map((preset) => preset.id)),
          ],
        })),
      renameCustomCropPreset: (id, label) =>
        set((state) => ({
          customCropPresets: state.customCropPresets.map((preset) =>
            preset.id === id ? renameCropPreset(preset, label) : preset),
        })),
      deleteCustomCropPreset: (id) =>
        set((state) => ({
          customCropPresets: state.customCropPresets.filter((preset) => preset.id !== id),
        })),
      addOpenFontLibraryFace: (entry) =>
        set((state) => ({
          openFontLibrary: [
            ...state.openFontLibrary.filter((current) => current.face.fontAsset.sha256 !== entry.face.fontAsset.sha256),
            entry,
          ],
        })),
      exportSettingsBackup: async (passphrase) => {
        const state = get();
        const data: SettingsBackupData = {
          apiKeys: { ...state.apiKeys },
          defaultModels: state.defaultModels,
          providerSettings: state.providerSettings,
          interfaceThemeId: state.interfaceThemeId,
          keyboardShortcuts: state.keyboardShortcuts,
          gamepadBindings: state.gamepadBindings,
          customBrushPresets: state.customBrushPresets,
          customCropPresets: state.customCropPresets,
          licenseKey: state.licenseKey,
        };
        return encryptSettingsBackup(JSON.stringify(data), passphrase);
      },
      importSettingsBackup: async (envelopeText, passphrase) => {
        const plaintext = await decryptSettingsBackup(envelopeText, passphrase);
        let parsed: unknown;
        try {
          parsed = JSON.parse(plaintext);
        } catch {
          // Decryption succeeded but the payload wasn't JSON — a corrupted or tampered backup.
          throw new SettingsBackupError('decrypt-failed', 'The backup contents were unreadable.');
        }
        // The sanitizers below defend every field, so the structural cast is safe even on a
        // hand-edited or corrupt payload (same trust model as the persist `merge` above).
        const data = (isRecord(parsed) ? parsed : {}) as Partial<SettingsBackupData>;
        // The imported payload owns the license identity now: invalidate in-flight verification,
        // apply fail-closed, then settle entitlement through the one canonical verification.
        // Callers get a deterministic postcondition — when this resolves, `license` reflects the
        // verifier's verdict on the imported key. Other windows learn through the broadcast.
        invalidatePendingLicenseVerification();
        armLicenseSyncBroadcast();
        set((current) => mergeSettingsBackupData(current, data));
        await get().revalidateLicense();
      },
      settingsBackupSupported: isSettingsBackupSupported(),
      isSettingsOpen: false,
      settingsPanel: 'providers',
      openSettings: (panel = 'providers') => set({ isSettingsOpen: true, settingsPanel: panel }),
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      licenseKey: '',
      license: { licensed: false },
      settingsHydrated: false,
      setLicenseKey: async (key) => {
        const verification = await verifyLicenseKey(key);
        if (verification.licensed) {
          // Activation is a new identity event: invalidate any verification still in flight so
          // it cannot clobber this fresh, verifier-backed grant, and tell the other windows.
          invalidatePendingLicenseVerification();
          armLicenseSyncBroadcast();
          set({ licenseKey: key.trim(), license: verification });
        }
        return verification;
      },
      removeLicenseKey: () => {
        // Removal fail-closes immediately and invalidates whatever verification is still in
        // flight — a stale positive verdict for the removed key must never resurrect the grant.
        invalidatePendingLicenseVerification();
        armLicenseSyncBroadcast();
        set({ licenseKey: '', license: { licensed: false } });
      },
      revalidateLicense: async () => {
        // AUD-015: encrypted hydration is asynchronous, so a boot-time call can observe the
        // default empty key. Judge the license only against the hydrated snapshot.
        await waitForSettingsHydration();
        const generation = licenseVerificationGeneration;
        const storedKey = get().licenseKey;
        if (
          pendingLicenseVerification
          && pendingLicenseVerification.generation === generation
          && pendingLicenseVerification.key === storedKey
        ) {
          // The identical verification is already in flight — join it instead of duplicating it.
          return pendingLicenseVerification.promise;
        }
        const verification = (async () => {
          // Fail closed for the whole verification window: the commercial gates read this
          // boolean directly and must never trust a verdict that predates the current key.
          if (get().license.licensed) {
            set({ license: { licensed: false } });
          }
          if (!storedKey) {
            return;
          }
          let verdict: LicenseVerification;
          try {
            verdict = await verifyLicenseKey(storedKey);
          } catch {
            // verifyLicenseKey is itself fail-closed, but the store must not depend on that
            // contract: a rejection still resolves this promise, still fail-closed.
            verdict = { licensed: false, reason: 'License verification failed.' };
          }
          if (generation !== licenseVerificationGeneration || get().licenseKey !== storedKey) {
            // A newer identity event (removal, activation, import, rehydrate) owns the state
            // now; applying this verdict would attach it to a key it never verified.
            return;
          }
          set({ license: verdict });
        })();
        pendingLicenseVerification = { generation, key: storedKey, promise: verification };
        try {
          await verification;
        } finally {
          if (pendingLicenseVerification?.promise === verification) {
            pendingLicenseVerification = null;
          }
        }
      },
      });
    },
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => createEncryptedSettingsStorage()),
      // Fires after every hydration attempt — restored, empty, or errored — including manual
      // rehydrate() calls; the latch itself only settles once. Every completed rehydrate then
      // re-verifies the (fail-closed) license exactly once through the canonical path: a
      // key-change subscription cannot do this job, because a same-key rehydrate also resets
      // `license` without ever changing the key string.
      onRehydrateStorage: () => {
        // A real hydration read starts now; its merge may apply a blob captured before local
        // mutations landed, so the mutation-vs-hydration guard arms for that merge.
        hydrationReadInFlight = true;
        return (hydratedState: SettingsState | undefined) => {
          markSettingsHydrated();
          if (hydratedState && lastHydrationKeptLocalMutations) {
            lastHydrationKeptLocalMutations = false;
            // The merge kept locally-mutated keys at their newer values, so memory is now
            // ahead of what the mutating writes persisted (they captured pre-hydration state).
            // Enqueue one write of the resolved state — on the same serialized write chain — so
            // storage converges on the newer local mutation instead of the stale snapshot.
            useSettingsStore.setState({});
          }
          void useSettingsStore.getState().revalidateLicense();
        };
      },
      merge: (persistedState, currentState) => {
        // Every applied rehydrate replaces the license identity and fail-closes `license` below,
        // so whatever verification was in flight before it is stale by definition.
        invalidatePendingLicenseVerification();
        // Mutation-vs-hydration guard: this read may have started before local mutations landed,
        // making its blob stale for exactly the keys those mutations wrote. Everything else in
        // the snapshot is still the newest durable fact and applies normally.
        const locallyMutatedKeys = hydrationReadInFlight ? drainLocalMutationKeys() : [];
        hydrationReadInFlight = false;
        const typedPersistedState = persistedState as Partial<SettingsState> | undefined;
        const persistedApiKeys = sanitizePersistedApiKeys(typedPersistedState?.apiKeys);

        let genericImageEndpointUrl = typedPersistedState?.providerSettings?.genericImageEndpointUrl;
        let genericImageAuthHeader = typedPersistedState?.providerSettings?.genericImageAuthHeader;
        let localOpenImageEndpointUrl = typedPersistedState?.providerSettings?.localOpenImageEndpointUrl;
        let localOpenImageAuthHeader = typedPersistedState?.providerSettings?.localOpenImageAuthHeader;

        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            const legacyEndpoint = window.localStorage.getItem('image-editor-generic-endpoint');
            const legacyAuth = window.localStorage.getItem('image-editor-generic-auth');

            if (legacyEndpoint) {
              if (!genericImageEndpointUrl) {
                genericImageEndpointUrl = legacyEndpoint;
              }
              if (!localOpenImageEndpointUrl) {
                localOpenImageEndpointUrl = legacyEndpoint;
              }
              window.localStorage.removeItem('image-editor-generic-endpoint');
            }

            if (legacyAuth) {
              if (!genericImageAuthHeader) {
                genericImageAuthHeader = legacyAuth;
              }
              if (!localOpenImageAuthHeader) {
                localOpenImageAuthHeader = legacyAuth;
              }
              window.localStorage.removeItem('image-editor-generic-auth');
            }
          } catch (e) {
            console.error('Failed to migrate image editor fallback settings from localStorage', e);
          }
        }

        const mergedState: SettingsState = {
          ...currentState,
          ...typedPersistedState,
          apiKeys: {
            ...currentState.apiKeys,
            ...persistedApiKeys,
          },
          defaultModels: {
            text: {
              ...currentState.defaultModels.text,
              ...typedPersistedState?.defaultModels?.text,
            },
            image: {
              ...currentState.defaultModels.image,
              ...typedPersistedState?.defaultModels?.image,
            },
            video: {
              ...currentState.defaultModels.video,
              ...typedPersistedState?.defaultModels?.video,
            },
            audio: {
              ...currentState.defaultModels.audio,
              ...typedPersistedState?.defaultModels?.audio,
            },
          },
          providerSettings: {
            ...currentState.providerSettings,
            ...typedPersistedState?.providerSettings,
            ...(typedPersistedState?.providerSettings?.vertexLocation === 'global'
              ? { vertexLocation: 'us-central1' }
              : {}),
            ...(genericImageEndpointUrl ? { genericImageEndpointUrl } : {}),
            ...(genericImageAuthHeader ? { genericImageAuthHeader } : {}),
            ...(localOpenImageEndpointUrl ? { localOpenImageEndpointUrl } : {}),
            ...(localOpenImageAuthHeader ? { localOpenImageAuthHeader } : {}),
          },
          interfaceThemeId: resolveInterfaceTheme(typedPersistedState?.interfaceThemeId).id,
          appMenuStyle: typedPersistedState?.appMenuStyle === 'menubar' ? 'menubar' : 'compact',
          interfaceDensity: typedPersistedState?.interfaceDensity === 'comfortable' ? 'comfortable' : 'compact',
          locale: normalizeLocale(typedPersistedState?.locale),
          localeChosen: Boolean(typedPersistedState?.localeChosen),
          keyboardShortcuts: sanitizeKeyboardShortcutMap(typedPersistedState?.keyboardShortcuts ?? {}),
          gamepadBindings: normalizeGamepadBindings(typedPersistedState?.gamepadBindings),
          customBrushPresets: sanitizeUserBrushPresets(typedPersistedState?.customBrushPresets),
          customCropPresets: sanitizeCropPresets(typedPersistedState?.customCropPresets),
          openFontLibrary: Array.isArray(typedPersistedState?.openFontLibrary)
            ? typedPersistedState.openFontLibrary.filter(isOpenFontLibraryFace)
            : [],
          settingsPanel: typedPersistedState?.settingsPanel === 'keyboard'
            || typedPersistedState?.settingsPanel === 'gamepad'
            || typedPersistedState?.settingsPanel === 'fonts'
            || typedPersistedState?.settingsPanel === 'license'
            ? typedPersistedState.settingsPanel
            : 'providers',
          licenseKey: typeof typedPersistedState?.licenseKey === 'string' ? typedPersistedState.licenseKey : '',
          // Fail-closed: never trust a persisted verification result. App boot calls
          // revalidateLicense(), which re-verifies the stored key offline in milliseconds.
          license: { licensed: false },
          // merge only runs while hydration data is being applied; never let a stale persisted
          // copy of this session flag claim otherwise.
          settingsHydrated: true,
        };

        // Locally-mutated keys win over the stale read. The two machinery-owned fields are
        // excluded: `license` is a derived verdict that merge always fail-closes and the
        // post-rehydrate hook re-verifies, and `settingsHydrated` is the hydration latch itself.
        let keptLocalMutations = false;
        if (locallyMutatedKeys.length > 0) {
          const mergedRecord = mergedState as unknown as Record<string, unknown>;
          const currentRecord = currentState as unknown as Record<string, unknown>;
          for (const key of locallyMutatedKeys) {
            if (key === 'license' || key === 'settingsHydrated' || !(key in mergedRecord)) {
              continue;
            }
            mergedRecord[key] = currentRecord[key];
            keptLocalMutations = true;
          }
        }
        lastHydrationKeptLocalMutations = keptLocalMutations;

        return mergedState;
      },
    },
  ),
);

// Direct api.setState writes bypass the creator's tracked set; record their top-level keys too so
// the mutation-vs-hydration guard covers every local mutation path, not only store actions.
const untrackedSetState = useSettingsStore.setState;
useSettingsStore.setState = ((partial: unknown, replace?: boolean) => {
  if (typeof partial === 'function') {
    return untrackedSetState(((state: SettingsState) => {
      const result = (partial as (state: SettingsState) => Partial<SettingsState>)(state);
      recordLocalMutationKeys(result);
      return result;
    }) as never, replace as never);
  }
  recordLocalMutationKeys(partial);
  return untrackedSetState(partial as never, replace as never);
}) as typeof untrackedSetState;

/**
 * Sanitize + merge a decrypted settings-backup payload onto the current state. Mirrors the persist
 * `merge` config so an imported backup is validated exactly like a rehydrated profile: unknown
 * providers/shortcuts/presets are dropped, the theme falls back to a known one, and credentials layer
 * over the current values rather than wiping them.
 */
function mergeSettingsBackupData(
  current: SettingsState,
  data: Partial<SettingsBackupData>,
): Partial<SettingsState> {
  return {
    apiKeys: {
      ...current.apiKeys,
      ...sanitizePersistedApiKeys(data.apiKeys),
    },
    defaultModels: {
      text: { ...current.defaultModels.text, ...data.defaultModels?.text },
      image: { ...current.defaultModels.image, ...data.defaultModels?.image },
      video: { ...current.defaultModels.video, ...data.defaultModels?.video },
      audio: { ...current.defaultModels.audio, ...data.defaultModels?.audio },
    },
    providerSettings: {
      ...current.providerSettings,
      ...(isRecord(data.providerSettings) ? data.providerSettings : {}),
    },
    interfaceThemeId: resolveInterfaceTheme(
      typeof data.interfaceThemeId === 'string' ? data.interfaceThemeId : undefined,
    ).id,
    keyboardShortcuts: sanitizeKeyboardShortcutMap(
      isRecord(data.keyboardShortcuts) ? data.keyboardShortcuts : {},
    ),
    gamepadBindings: normalizeGamepadBindings(data.gamepadBindings),
    customBrushPresets: sanitizeUserBrushPresets(data.customBrushPresets),
    customCropPresets: sanitizeCropPresets(data.customCropPresets),
    // The license key travels with a settings backup; it is re-verified fail-closed on import.
    ...(typeof data.licenseKey === 'string'
      ? { licenseKey: data.licenseKey, license: { licensed: false } as LicenseVerification }
      : {}),
  };
}

const IMAGE_BUILT_IN_BRUSH_IDS = new Set<string>([
  'pencil',
  'marker',
  'charcoal',
  'textureStipple',
  'inker',
  'brushPen',
  'calligraphyChisel',
  'technicalLiner',
  'airbrush',
  'dryBrush',
  'watercolorWash',
  'gouacheFlat',
  'oilBristle',
  'cloudGlaze',
  'mangaInker',
  'screentoneDots',
  'speedLine',
  'storyboardBlue',
  'halftoneBlock',
  'fxSpark',
  'rimLight',
  'glowBloom',
  'hardRound',
  'softRound',
  'softEraser',
  'hardEraser',
]);
