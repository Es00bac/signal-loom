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

const API_KEY_PROVIDERS = ['openai', 'gemini', 'huggingface', 'elevenlabs', 'bfl', 'stability', 'atlas'] as const;
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
  keyboardShortcuts: KeyboardShortcutMap;
  gamepadBindings: GamepadBindingProfile;
  customBrushPresets: ImageBrushPreset[];
  customCropPresets: CropCustomPreset[];
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
  isSettingsOpen: boolean;
  settingsPanel: 'providers' | 'keyboard' | 'gamepad';
  openSettings: (panel?: SettingsState['settingsPanel']) => void;
  toggleSettings: () => void;
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
    setItem: async (name, value) => {
      const store = backing();
      if (!store) return;
      const envelope = await encryptSecret(value);
      try {
        store.setItem(name, envelope);
      } catch {
        /* quota / availability */
      }
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKeys: INITIAL_API_KEYS,
      defaultModels: DEFAULT_MODELS,
      defaultImageNodeModel: null,
      providerSettings: {
        openaiBaseUrl: DEFAULT_PROVIDER_SETTINGS.openaiBaseUrl,
        atlasBaseUrl: DEFAULT_PROVIDER_SETTINGS.atlasBaseUrl,
        elevenlabsVoiceId: DEFAULT_PROVIDER_SETTINGS.elevenlabsVoiceId,
        renderBackendPreference: DEFAULT_PROVIDER_SETTINGS.renderBackendPreference,
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
      keyboardShortcuts: {},
      gamepadBindings: createDefaultGamepadBindings(),
      customBrushPresets: [],
      customCropPresets: [],
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
        set((current) => mergeSettingsBackupData(current, data));
      },
      settingsBackupSupported: isSettingsBackupSupported(),
      isSettingsOpen: false,
      settingsPanel: 'providers',
      openSettings: (panel = 'providers') => set({ isSettingsOpen: true, settingsPanel: panel }),
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => createEncryptedSettingsStorage()),
      merge: (persistedState, currentState) => {
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

        return {
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
          keyboardShortcuts: sanitizeKeyboardShortcutMap(typedPersistedState?.keyboardShortcuts ?? {}),
          gamepadBindings: normalizeGamepadBindings(typedPersistedState?.gamepadBindings),
          customBrushPresets: sanitizeUserBrushPresets(typedPersistedState?.customBrushPresets),
          customCropPresets: sanitizeCropPresets(typedPersistedState?.customCropPresets),
          settingsPanel: typedPersistedState?.settingsPanel === 'keyboard' || typedPersistedState?.settingsPanel === 'gamepad'
            ? typedPersistedState.settingsPanel
            : 'providers',
        };
      },
    },
  ),
);

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
