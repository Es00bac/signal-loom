import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_INTERFACE_THEME_ID, resolveInterfaceTheme } from '../lib/interfaceThemes';
import { sanitizeKeyboardShortcutMap, type KeyboardShortcutMap } from '../lib/keyboardShortcuts';
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
  ProviderSettings,
} from '../types/flow';

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
  encryptedAtRest: false;
}

export interface ApiKeyStorageStatus {
  encryptedAtRest: false;
  storageMedium: ApiKeyStorageMedium;
  browserStorageAvailable: boolean;
  caveat: string;
  descriptors: ApiKeyStorageDescriptorMap;
}

export function isApiKeyStorageEncryptedAtRest(): false {
  return false;
}

export function getApiKeyStorageMedium(): ApiKeyStorageMedium {
  return hasBrowserLocalStorage() ? 'local-storage' : 'memory-only';
}

export function getApiKeyStorageCaveat(storageMedium: ApiKeyStorageMedium = getApiKeyStorageMedium()): string {
  return storageMedium === 'local-storage' ? LOCAL_STORAGE_CAVEAT : MEMORY_ONLY_CAVEAT;
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
  const descriptors: ApiKeyStorageDescriptorMap = {} as ApiKeyStorageDescriptorMap;

  for (const provider of API_KEY_PROVIDERS) {
    const hasValue = Boolean(apiKeys[provider]?.trim());
    descriptors[provider] = {
      provider,
      configured: hasValue,
      redacted: hasValue ? API_KEY_REDACTION : '',
      storageMedium,
      encryptedAtRest: false,
    };
  }

  return {
    encryptedAtRest: false,
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

interface SettingsState {
  apiKeys: ApiKeys;
  defaultModels: DefaultModelSettings;
  providerSettings: ProviderSettings;
  interfaceThemeId: string;
  keyboardShortcuts: KeyboardShortcutMap;
  gamepadBindings: GamepadBindingProfile;
  customBrushPresets: ImageBrushPreset[];
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  setDefaultModel: <
    TCategory extends keyof DefaultModelSettings,
    TProvider extends keyof DefaultModelSettings[TCategory],
  >(
    category: TCategory,
    provider: TProvider,
    value: string,
  ) => void;
  setProviderSetting: <TKey extends keyof ProviderSettings>(key: TKey, value: ProviderSettings[TKey]) => void;
  setInterfaceThemeId: (themeId: string) => void;
  setKeyboardShortcut: (command: NativeMenuCommand, shortcut: string) => void;
  resetKeyboardShortcuts: () => void;
  setGamepadBinding: (workspace: GamepadWorkspace, controlId: GamepadControlId, patch: Partial<GamepadControlBinding>) => void;
  resetGamepadBindings: () => void;
  saveCustomBrushPreset: (label: string, settings: Partial<BrushSettings>) => void;
  renameCustomBrushPreset: (id: string, label: string) => void;
  deleteCustomBrushPreset: (id: string) => void;
  setCustomBrushPresets: (presets: ImageBrushPreset[]) => void;
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKeys: INITIAL_API_KEYS,
      defaultModels: DEFAULT_MODELS,
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
      },
      interfaceThemeId: DEFAULT_INTERFACE_THEME_ID,
      keyboardShortcuts: {},
      gamepadBindings: createDefaultGamepadBindings(),
      customBrushPresets: [],
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
      setProviderSetting: (key, value) =>
        set((state) => ({
          providerSettings: {
            ...state.providerSettings,
            [key]: value,
          },
        })),
      setInterfaceThemeId: (themeId) =>
        set({ interfaceThemeId: resolveInterfaceTheme(themeId).id }),
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
      isSettingsOpen: false,
      settingsPanel: 'providers',
      openSettings: (panel = 'providers') => set({ isSettingsOpen: true, settingsPanel: panel }),
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
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
          keyboardShortcuts: sanitizeKeyboardShortcutMap(typedPersistedState?.keyboardShortcuts ?? {}),
          gamepadBindings: normalizeGamepadBindings(typedPersistedState?.gamepadBindings),
          customBrushPresets: sanitizeUserBrushPresets(typedPersistedState?.customBrushPresets),
          settingsPanel: typedPersistedState?.settingsPanel === 'keyboard' || typedPersistedState?.settingsPanel === 'gamepad'
            ? typedPersistedState.settingsPanel
            : 'providers',
        };
      },
    },
  ),
);

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
