import React from 'react';
import { LoaderCircle, RefreshCcw, X } from 'lucide-react';
import {
  ensureVoiceOption,
  getConfiguredProviders,
  getModelOptions,
  getProviderLabel,
  RENDER_BACKEND_OPTIONS,
} from '../../lib/providerCatalog';
import { useCatalogStore } from '../../store/catalogStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Capability, ProviderSettings } from '../../types/flow';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    toggleSettings,
    apiKeys,
    defaultModels,
    providerSettings,
    setApiKey,
    setDefaultModel,
    setProviderSetting,
  } = useSettingsStore();
  const {
    modelCatalog,
    elevenLabsVoices,
    isRefreshing,
    refreshError,
    lastRefreshedAt,
    refreshCatalogs,
  } = useCatalogStore();

  if (!isSettingsOpen) {
    return null;
  }

  const configuredTextProviders = getConfiguredProviders('text', apiKeys, providerSettings);
  const configuredImageProviders = getConfiguredProviders('image', apiKeys, providerSettings);
  const configuredVideoProviders = getConfiguredProviders('video', apiKeys, providerSettings);
  const configuredAudioProviders = getConfiguredProviders('audio', apiKeys, providerSettings);
  const voiceOptions = ensureVoiceOption(elevenLabsVoices, providerSettings.elevenlabsVoiceId);

  const handleRefresh = async () => {
    await refreshCatalogs({
      apiKeys,
      defaultModels,
      providerSettings,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-[#1c1e26] border border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-[#252830]">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Provider Configuration</h2>
            <p className="text-sm text-gray-400 mt-1">
              Keys stay in local browser storage. Model and voice selectors are refreshed from the providers you have configured.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#111217]/60 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
              onClick={() => void handleRefresh()}
              type="button"
            >
              {isRefreshing ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
              Refresh Catalogs
            </button>
            <button
              onClick={toggleSettings}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-700"
              type="button"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          <Section title="API Keys">
            <div className="grid gap-4 md:grid-cols-2">
              <ApiKeyInput
                label="Google Gemini / Veo"
                value={apiKeys.gemini}
                onChange={(value) => setApiKey('gemini', value)}
                placeholder="AIzaSy..."
              />
              <ApiKeyInput
                label="OpenAI / Compatible"
                value={apiKeys.openai}
                onChange={(value) => setApiKey('openai', value)}
                placeholder="sk-..."
              />
              <ApiKeyInput
                label="Hugging Face"
                value={apiKeys.huggingface}
                onChange={(value) => setApiKey('huggingface', value)}
                placeholder="hf_..."
              />
              <ApiKeyInput
                label="ElevenLabs"
                value={apiKeys.elevenlabs}
                onChange={(value) => setApiKey('elevenlabs', value)}
                placeholder="sk_..."
              />
            </div>
          </Section>

          <Section title="Runtime Options">
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="OpenAI-compatible base URL"
                value={providerSettings.openaiBaseUrl}
                onChange={(value) => setProviderSetting('openaiBaseUrl', value)}
                placeholder="https://api.openai.com/v1"
              />

              <SelectInput
                label="Local render backend"
                onChange={(value) => setProviderSetting('renderBackendPreference', value as ProviderSettings['renderBackendPreference'])}
                options={RENDER_BACKEND_OPTIONS}
                value={providerSettings.renderBackendPreference}
              />

              <TextInput
                label="Local native render service URL"
                value={providerSettings.localNativeRenderUrl}
                onChange={(value) => setProviderSetting('localNativeRenderUrl', value)}
                placeholder="http://127.0.0.1:41736"
              />

              <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-sm text-gray-300">
                <input
                  checked={providerSettings.backendProxyEnabled}
                  onChange={(event) => setProviderSetting('backendProxyEnabled', event.target.checked)}
                  type="checkbox"
                />
                Use backend proxy for provider runs
              </label>

              <TextInput
                label="Backend proxy URL"
                value={providerSettings.backendProxyBaseUrl}
                onChange={(value) => setProviderSetting('backendProxyBaseUrl', value)}
                placeholder="http://127.0.0.1:8787"
              />

              {apiKeys.elevenlabs.trim() ? (
                <SelectInput
                  label="Default ElevenLabs voice"
                  onChange={(value) => setProviderSetting('elevenlabsVoiceId', value)}
                  options={voiceOptions.map((voice) => ({
                    value: voice.value,
                    label: voice.category ? `${voice.label} · ${voice.category}` : voice.label,
                  }))}
                  value={providerSettings.elevenlabsVoiceId || voiceOptions[0]?.value || ''}
                />
              ) : (
                <div className="rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-sm text-gray-400">
                  Add an ElevenLabs key to populate voices.
                </div>
              )}
            </div>

            <CatalogStatus
              isRefreshing={isRefreshing}
              refreshError={refreshError}
              lastRefreshedAt={lastRefreshedAt}
            />
          </Section>

          <Section title="Default Text Models">
            <ConfiguredProviderGrid
              capability="text"
              configuredProviders={configuredTextProviders}
              defaultModels={defaultModels.text}
              modelCatalog={modelCatalog}
              onChange={(category, provider, value) =>
                setDefaultModel(category as 'text', provider as keyof typeof defaultModels.text, value)
              }
            />
          </Section>

          <Section title="Default Image Models">
            <ConfiguredProviderGrid
              capability="image"
              configuredProviders={configuredImageProviders}
              defaultModels={defaultModels.image}
              modelCatalog={modelCatalog}
              onChange={(category, provider, value) =>
                setDefaultModel(category as 'image', provider as keyof typeof defaultModels.image, value)
              }
            />
          </Section>

          <Section title="Default Video Models">
            <ConfiguredProviderGrid
              capability="video"
              configuredProviders={configuredVideoProviders}
              defaultModels={defaultModels.video}
              modelCatalog={modelCatalog}
              onChange={(category, provider, value) =>
                setDefaultModel(category as 'video', provider as keyof typeof defaultModels.video, value)
              }
            />
          </Section>

          <Section title="Default Audio Models">
            <ConfiguredProviderGrid
              capability="audio"
              configuredProviders={configuredAudioProviders}
              defaultModels={defaultModels.audio}
              modelCatalog={modelCatalog}
              onChange={(category, provider, value) =>
                setDefaultModel(category as 'audio', provider as keyof typeof defaultModels.audio, value)
              }
            />
          </Section>
        </div>

        <div className="p-5 border-t border-gray-800 bg-[#1c1e26] flex justify-end">
          <button
            onClick={toggleSettings}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            type="button"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">{title}</h3>
      {children}
    </section>
  );
}

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function ApiKeyInput({ label, value, onChange, placeholder }: InputProps) {
  return (
    <form className="flex flex-col gap-1.5" onSubmit={(event) => event.preventDefault()}>
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <input
        autoComplete="username"
        className="sr-only"
        name={`${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-hint`}
        readOnly
        tabIndex={-1}
        type="text"
        value={label}
      />
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#111217] border border-gray-700 text-gray-200 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
        autoComplete="new-password"
        name={label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
      />
    </form>
  );
}

function TextInput({ label, value, onChange, placeholder }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#111217] border border-gray-700 text-gray-200 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
        autoComplete="off"
      />
    </div>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function SelectInput({ label, value, onChange, options }: SelectInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <select
        className="w-full bg-[#111217] border border-gray-700 text-gray-200 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CatalogStatusProps {
  isRefreshing: boolean;
  refreshError?: string;
  lastRefreshedAt?: string;
}

function CatalogStatus({ isRefreshing, refreshError, lastRefreshedAt }: CatalogStatusProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-sm text-gray-400">
      {isRefreshing ? 'Refreshing provider catalogs…' : 'Catalogs refresh automatically after you edit keys.'}
      {lastRefreshedAt ? ` Last refresh: ${new Date(lastRefreshedAt).toLocaleString()}.` : ''}
      <div className="mt-2 text-xs text-gray-500">
        Native FFmpeg rendering is local-machine only. Remote browser sessions will fall back to browser rendering unless a compatible local render service is reachable from that browser.
      </div>
      {refreshError ? (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {refreshError}
        </div>
      ) : null}
    </div>
  );
}

interface ConfiguredProviderGridProps<TCapability extends Capability> {
  capability: TCapability;
  configuredProviders: string[];
  defaultModels: Record<string, string>;
  modelCatalog: ReturnType<typeof useCatalogStore.getState>['modelCatalog'];
  onChange: (category: Capability, provider: string, value: string) => void;
}

function ConfiguredProviderGrid<TCapability extends Capability>({
  capability,
  configuredProviders,
  defaultModels,
  modelCatalog,
  onChange,
}: ConfiguredProviderGridProps<TCapability>) {
  if (configuredProviders.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-sm text-gray-400">
        Add a provider key above to populate this model list.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {configuredProviders.map((provider) => {
        const options = getModelOptions(
          capability,
          provider as never,
          modelCatalog,
          defaultModels[provider],
        );

        return (
          <SelectInput
            key={`${capability}-${provider}`}
            label={getProviderLabel(provider as never)}
            onChange={(value) => onChange(capability, provider, value)}
            options={options}
            value={defaultModels[provider]}
          />
        );
      })}
    </div>
  );
}
