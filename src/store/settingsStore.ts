import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_INTERFACE_THEME_ID, resolveInterfaceTheme } from '../lib/interfaceThemes';
import { sanitizeKeyboardShortcutMap, type KeyboardShortcutMap } from '../lib/keyboardShortcuts';
import { DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS } from '../lib/providerCatalog';
import type { NativeMenuCommand } from '../lib/nativeApp';
import type {
  ApiKeys,
  DefaultModelSettings,
  ProviderSettings,
} from '../types/flow';

interface SettingsState {
  apiKeys: ApiKeys;
  defaultModels: DefaultModelSettings;
  providerSettings: ProviderSettings;
  interfaceThemeId: string;
  keyboardShortcuts: KeyboardShortcutMap;
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
  isSettingsOpen: boolean;
  settingsPanel: 'providers' | 'keyboard';
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
      isSettingsOpen: false,
      settingsPanel: 'providers',
      openSettings: (panel = 'providers') => set({ isSettingsOpen: true, settingsPanel: panel }),
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
    }),
    {
      name: 'flow-settings-storage',
      merge: (persistedState, currentState) => {
        const typedPersistedState = persistedState as Partial<SettingsState> | undefined;

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
            ...typedPersistedState?.apiKeys,
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
          settingsPanel: typedPersistedState?.settingsPanel === 'keyboard' ? 'keyboard' : 'providers',
        };
      },
    },
  ),
);
