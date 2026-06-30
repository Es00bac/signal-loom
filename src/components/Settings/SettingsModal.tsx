import React from 'react';
import { ChevronRight, Download, LoaderCircle, RefreshCcw, ShieldCheck, Upload, X } from 'lucide-react';
import {
  ensureVoiceOption,
  getConfiguredProviders,
  getModelOptions,
  getProviderLabel,
  PAPER_PDF_RASTER_PRESET_OPTIONS,
  PAPER_PRINT_UPSCALE_METHOD_OPTIONS,
  RENDER_BACKEND_OPTIONS,
} from '../../lib/providerCatalog';
import { INTERFACE_THEMES, type InterfaceTheme } from '../../lib/interfaceThemes';
import {
  listImageModelPricingEntries,
  listImageProviderHelpEntries,
  type ImageModelPricingEntry,
  type ImageProviderHelpEntry,
} from '../../lib/imageProviderCapabilities';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  getKeyboardShortcutLabel,
  normalizeShortcutLabel,
} from '../../lib/keyboardShortcuts';
import {
  GAMEPAD_CONTROL_DEFINITIONS,
  GAMEPAD_WORKSPACES,
  getGamepadCommandOptionsForWorkspace,
  type GamepadBindingProfile,
  type GamepadControlBinding,
  type GamepadControlId,
  type GamepadWorkspace,
} from '../../lib/gamepadBindings';
import { NATIVE_MENU_COMMANDS, type NativeMenuCommand } from '../../lib/nativeApp';
import { useCatalogStore } from '../../store/catalogStore';
import {
  getApiKeyStorageStatus,
  useSettingsStore,
} from '../../store/settingsStore';
import type { Capability, ProviderSettings } from '../../types/flow';
import {
  getAndroidAcceleratorStatus,
  summarizeAndroidAcceleratorStatus,
} from '../../lib/androidAccelerator';
import { DockableDialog } from '../DockablePanel';
import { useMobilePhoneInterfaceDescriptor } from '../../lib/mobilePhoneInterface';
import {
  Section,
  TextInput,
  NumberInput,
  SelectInput,
  type InputProps,
} from './SettingsInputs';
import { Capacitor } from '@capacitor/core';
import { getSignalLoomNativeBridge } from '../../lib/nativeApp';
import { VertexAuthPanel } from './VertexAuthPanel';
import { useVertexAuth } from './useVertexAuth';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    toggleSettings,
    apiKeys,
    defaultModels,
    providerSettings,
    interfaceThemeId,
    keyboardShortcuts,
    gamepadBindings,
    settingsPanel,
    setApiKey,
    setDefaultModel,
    setInterfaceThemeId,
    setKeyboardShortcut,
    setGamepadBinding,
    setProviderSetting,
    resetKeyboardShortcuts,
    resetGamepadBindings,
    openSettings,
    exportSettingsBackup,
    importSettingsBackup,
    settingsBackupSupported,
  } = useSettingsStore();
  const keyStorageStatus = getApiKeyStorageStatus(apiKeys);
  const vertexPlatform: 'desktop' | 'mobile' = getSignalLoomNativeBridge()
    ? 'desktop'
    : (Capacitor.getPlatform?.() === 'android' ? 'mobile' : 'desktop');
  const vertexAuth = useVertexAuth({ providerSettings, setProviderSetting, platform: vertexPlatform });
  const {
    modelCatalog,
    elevenLabsVoices,
    isRefreshing,
    refreshError,
    lastRefreshedAt,
    refreshCatalogs,
  } = useCatalogStore();

  const configuredTextProviders = getConfiguredProviders('text', apiKeys, providerSettings);
  const configuredImageProviders = getConfiguredProviders('image', apiKeys, providerSettings);
  const configuredVideoProviders = getConfiguredProviders('video', apiKeys, providerSettings);
  const configuredAudioProviders = getConfiguredProviders('audio', apiKeys, providerSettings);
  const voiceOptions = ensureVoiceOption(elevenLabsVoices, providerSettings.elevenlabsVoiceId);
  const imageProviderHelpEntries = listImageProviderHelpEntries();
  const imageModelPricingEntries = listImageModelPricingEntries();
  const [androidAcceleratorStatus, setAndroidAcceleratorStatus] = React.useState<string>('');
  const [androidAcceleratorChecking, setAndroidAcceleratorChecking] = React.useState(false);

  const handleRefresh = async () => {
    await refreshCatalogs({
      apiKeys,
      defaultModels,
      providerSettings,
    });
  };

  const handleTestAndroidAccelerator = async () => {
    setAndroidAcceleratorChecking(true);
    setAndroidAcceleratorStatus('');
    try {
      const status = await getAndroidAcceleratorStatus({
        baseUrl: providerSettings.androidAcceleratorBaseUrl ?? '',
        authToken: providerSettings.androidAcceleratorAuthToken,
      });
      const summary = summarizeAndroidAcceleratorStatus(status);
      const warningText = summary.warnings.length ? `\n${summary.warnings.join('\n')}` : '';
      setAndroidAcceleratorStatus(`${summary.title}\n${summary.detail}${warningText}`);
    } catch (error) {
      setAndroidAcceleratorStatus(error instanceof Error ? error.message : 'Android accelerator connection failed.');
    } finally {
      setAndroidAcceleratorChecking(false);
    }
  };

  const phone = useMobilePhoneInterfaceDescriptor().enabled;

  return (
    <DockableDialog
      defaultFloatingRect={{ x: 120, y: 72, width: 920, height: 680 }}
      dialogId="settings"
      minSize={{ width: 520, height: 420 }}
      onClose={toggleSettings}
      open={isSettingsOpen}
      title={settingsPanel === 'keyboard'
        ? 'Keyboard Shortcut Configuration'
        : settingsPanel === 'gamepad'
          ? 'Gamepad Binding Configuration'
          : 'Provider Configuration'}
      workspaceId="app-dialogs"
    >
      <div
        className="signal-loom-themed theme-panel flex h-full min-h-0 flex-col overflow-hidden"
      >
        {phone ? (
          <div className="theme-surface theme-border flex items-center gap-2 overflow-x-auto border-b px-3 py-2">
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-800 bg-[#0b1018] p-1">
              {([['providers', 'Providers'], ['keyboard', 'Shortcuts'], ['gamepad', 'Gamepad']] as const).map(
                ([panel, label]) => (
                  <button
                    key={panel}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      settingsPanel === panel ? 'bg-blue-500/20 text-blue-100' : 'text-gray-300 hover:text-white'
                    }`}
                    onClick={() => openSettings(panel)}
                    type="button"
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <button
              aria-label="Refresh Catalogs"
              className="ml-auto shrink-0 rounded-lg border border-gray-700 bg-[#111217]/60 p-2 text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
              onClick={() => void handleRefresh()}
              type="button"
            >
              {isRefreshing ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            </button>
          </div>
        ) : null}
        <div className={`theme-surface theme-border ${phone ? 'hidden' : 'flex'} justify-between items-center p-5 border-b`}>
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Provider Configuration</h2>
            <p className="text-sm text-gray-400 mt-1">
              {settingsPanel === 'keyboard'
                ? 'Customize command and tool shortcuts. Changes apply to browser/runtime shortcuts and integrated menu labels immediately.'
                : settingsPanel === 'gamepad'
                  ? 'Bind gamepad controls for each workspace. Changes apply to Android and desktop controller input immediately.'
                  : `Keys are ${keyStorageStatus.encryptedAtRest ? 'stored encrypted' : 'not encrypted'} in ${keyStorageStatus.storageMedium}. ${keyStorageStatus.caveat}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                settingsPanel === 'providers'
                  ? 'border-blue-400/60 bg-blue-500/15 text-blue-100'
                  : 'border-gray-700 bg-[#111217]/60 text-gray-200 hover:border-gray-500 hover:text-white'
              }`}
              onClick={() => openSettings('providers')}
              type="button"
            >
              Providers
            </button>
            <button
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                settingsPanel === 'keyboard'
                  ? 'border-blue-400/60 bg-blue-500/15 text-blue-100'
                  : 'border-gray-700 bg-[#111217]/60 text-gray-200 hover:border-gray-500 hover:text-white'
              }`}
              onClick={() => openSettings('keyboard')}
              type="button"
            >
              Shortcuts
            </button>
            <button
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                settingsPanel === 'gamepad'
                  ? 'border-blue-400/60 bg-blue-500/15 text-blue-100'
                  : 'border-gray-700 bg-[#111217]/60 text-gray-200 hover:border-gray-500 hover:text-white'
              }`}
              onClick={() => openSettings('gamepad')}
              type="button"
            >
              Gamepad
            </button>
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

        <div className={`overflow-y-auto space-y-8 ${phone ? 'p-4' : 'p-6'}`}>
          {settingsPanel === 'keyboard' ? (
            <KeyboardShortcutsSection
              keyboardShortcuts={keyboardShortcuts}
              onChange={setKeyboardShortcut}
              onReset={resetKeyboardShortcuts}
            />
          ) : settingsPanel === 'gamepad' ? (
            <GamepadBindingsSection
              gamepadBindings={gamepadBindings}
              onChange={setGamepadBinding}
              onReset={resetGamepadBindings}
            />
          ) : (
            <>
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
                label="Atlas"
                value={apiKeys.atlas ?? ''}
                onChange={(value) => setApiKey('atlas', value)}
                placeholder="sk-atlas-..."
              />
              <ApiKeyInput
                label="BytePlus (Seedream)"
                value={apiKeys.byteplus ?? ''}
                onChange={(value) => setApiKey('byteplus', value)}
                placeholder="ModelArk API key"
              />
              <ApiKeyInput
                label="Hugging Face"
                value={apiKeys.huggingface}
                onChange={(value) => setApiKey('huggingface', value)}
                placeholder="hf_..."
              />
              <ApiKeyInput
                label="Black Forest Labs"
                value={apiKeys.bfl ?? ''}
                onChange={(value) => setApiKey('bfl', value)}
                placeholder="BFL API key"
              />
              <ApiKeyInput
                label="Stability AI"
                value={apiKeys.stability ?? ''}
                onChange={(value) => setApiKey('stability', value)}
                placeholder="sk-..."
              />
              <ApiKeyInput
                label="ElevenLabs"
                value={apiKeys.elevenlabs}
                onChange={(value) => setApiKey('elevenlabs', value)}
                placeholder="sk_..."
              />
            </div>
          </Section>

          <SettingsBackupSection
            exportSettingsBackup={exportSettingsBackup}
            importSettingsBackup={importSettingsBackup}
            supported={settingsBackupSupported}
          />

          <ImageProviderHelpSection entries={imageProviderHelpEntries} />
          <ImageModelPricingSection entries={imageModelPricingEntries} />

          <Section title="Runtime Options">
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="OpenAI-compatible base URL"
                value={providerSettings.openaiBaseUrl}
                onChange={(value) => setProviderSetting('openaiBaseUrl', value)}
                placeholder="https://api.openai.com/v1"
              />
              <TextInput
                label="Atlas base URL"
                value={providerSettings.atlasBaseUrl ?? ''}
                onChange={(value) => setProviderSetting('atlasBaseUrl', value)}
                placeholder="https://api.atlas-cloud.ai/v1"
              />

              <SelectInput
                label="Google Gemini / Vertex credential mode"
                onChange={(value) => setProviderSetting('geminiCredentialMode', value as ProviderSettings['geminiCredentialMode'])}
                options={[
                  { value: 'api-key', label: 'Gemini API key' },
                  { value: 'vertex-adc', label: 'Vertex AI via Google Cloud desktop auth' },
                ]}
                value={providerSettings.geminiCredentialMode}
              />

              {providerSettings.geminiCredentialMode === 'vertex-adc' ? (
                <div className="md:col-span-2">
                  <VertexAuthPanel
                    platform={vertexPlatform}
                    providerSettings={providerSettings}
                    setProviderSetting={setProviderSetting}
                    status={vertexAuth.status}
                    projects={vertexAuth.projects}
                    busy={vertexAuth.busy}
                    testResult={vertexAuth.testResult}
                    serviceAccountError={vertexAuth.serviceAccountError}
                    onSignIn={vertexAuth.onSignIn}
                    onDetect={vertexAuth.onDetect}
                    onRefreshProjects={vertexAuth.onRefreshProjects}
                    onTestConnection={vertexAuth.onTestConnection}
                    onServiceAccountFile={vertexAuth.onServiceAccountFile}
                    onServiceAccountText={vertexAuth.onServiceAccountText}
                  />
                </div>
              ) : null}

              <SelectInput
                label="Paper print image upscaling"
                onChange={(value) => setProviderSetting('paperPrintUpscaleMethod', value as ProviderSettings['paperPrintUpscaleMethod'])}
                options={PAPER_PRINT_UPSCALE_METHOD_OPTIONS}
                value={providerSettings.paperPrintUpscaleMethod}
              />

              <SelectInput
                label="Paper PDF raster preset"
                onChange={(value) => setProviderSetting('paperPdfRasterPreset', value as ProviderSettings['paperPdfRasterPreset'])}
                options={PAPER_PDF_RASTER_PRESET_OPTIONS}
                value={providerSettings.paperPdfRasterPreset}
              />

              <NumberInput
                label="Batch max retries"
                value={providerSettings.batchMaxRetries ?? 10}
                onChange={(value) => setProviderSetting('batchMaxRetries', value)}
                min={0}
                max={50}
              />

              <NumberInput
                label="Batch retry base delay (ms)"
                value={providerSettings.batchRetryBaseDelayMs ?? 30000}
                onChange={(value) => setProviderSetting('batchRetryBaseDelayMs', value)}
                min={1000}
                max={120000}
              />

              <SelectInput
                label="Local render backend"
                onChange={(value) => setProviderSetting('renderBackendPreference', value as ProviderSettings['renderBackendPreference'])}
                options={RENDER_BACKEND_OPTIONS}
                value={providerSettings.renderBackendPreference}
              />

              <SelectInput
                label="Interface theme"
                onChange={setInterfaceThemeId}
                options={INTERFACE_THEMES.map((theme) => ({
                  value: theme.id,
                  label: theme.name,
                }))}
                value={interfaceThemeId}
              />

              <div className="md:col-span-2">
                <ThemeGrid
                  activeThemeId={interfaceThemeId}
                  onChange={setInterfaceThemeId}
                  themes={INTERFACE_THEMES}
                />
              </div>

              <TextInput
                label="Local native render service URL"
                value={providerSettings.localNativeRenderUrl}
                onChange={(value) => setProviderSetting('localNativeRenderUrl', value)}
                placeholder="http://127.0.0.1:41736"
              />

              <ApiKeyInput
                label="Local native render token"
                value={providerSettings.localNativeRenderToken ?? ''}
                onChange={(value) => setProviderSetting('localNativeRenderToken', value)}
                placeholder="Matches SIGNAL_LOOM_NATIVE_RENDER_TOKEN"
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

              <TextInput
                label="Local/Open image endpoint"
                value={providerSettings.localOpenImageEndpointUrl ?? ''}
                onChange={(value) => setProviderSetting('localOpenImageEndpointUrl', value)}
                placeholder="http://127.0.0.1:8188/signal-loom-image-edit"
              />

              <TextInput
                label="Local/Open image auth header"
                value={providerSettings.localOpenImageAuthHeader ?? ''}
                onChange={(value) => setProviderSetting('localOpenImageAuthHeader', value)}
                placeholder="Bearer ..."
              />

              <TextInput
                label="Local/Open default image model"
                value={providerSettings.localOpenImageDefaultModel ?? 'Qwen/Qwen-Image-Edit'}
                onChange={(value) => setProviderSetting('localOpenImageDefaultModel', value)}
                placeholder="Qwen/Qwen-Image-Edit"
              />

              <TextInput
                label="Generic HTTP Image Endpoint"
                value={providerSettings.genericImageEndpointUrl ?? ''}
                onChange={(value) => setProviderSetting('genericImageEndpointUrl', value)}
                placeholder="http://127.0.0.1:5000/inpaint"
              />

              <TextInput
                label="Generic HTTP Image Auth Header"
                value={providerSettings.genericImageAuthHeader ?? ''}
                onChange={(value) => setProviderSetting('genericImageAuthHeader', value)}
                placeholder="Bearer ..."
              />

              <TextInput
                label="Android accelerator URL"
                value={providerSettings.androidAcceleratorBaseUrl ?? ''}
                onChange={(value) => setProviderSetting('androidAcceleratorBaseUrl', value)}
                placeholder="http://192.168.1.42:8788"
              />

              <TextInput
                label="Android accelerator pairing token"
                value={providerSettings.androidAcceleratorAuthToken ?? ''}
                onChange={(value) => setProviderSetting('androidAcceleratorAuthToken', value)}
                placeholder="Shown by the companion app"
              />

              <TextInput
                label="Android default upscaler"
                value={providerSettings.androidAcceleratorDefaultUpscaler ?? 'upscaler_realistic'}
                onChange={(value) => setProviderSetting('androidAcceleratorDefaultUpscaler', value)}
                placeholder="upscaler_realistic"
              />

              <TextInput
                label="Android default image model"
                value={providerSettings.androidAcceleratorDefaultImageModel ?? defaultModels.image.android}
                onChange={(value) => {
                  setProviderSetting('androidAcceleratorDefaultImageModel', value);
                  setDefaultModel('image', 'android', value);
                }}
                placeholder="local-dream-active"
              />

              <div className="md:col-span-2 rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-xs leading-5 text-gray-400">
                <div>
                  Pair the Signal Loom Android Accelerator companion on the same Wi-Fi network, then paste its URL and token here. Image nodes can generate on the phone, and Paper, Image/Photos, and Flow auto-upscale paths use the Android NPU/GPU path first when configured, with $0 provider spend and final exact-DPI fit inside Signal Loom where needed.
                </div>
                <div className="mt-2">
                  For the current Local Dream Play Store downloads, connect to the standalone bridge companion. The one-app Signal Loom Android build is supported too, but Android private app storage means it must download its own model and upscaler files before it can replace the bridge.
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-300/70"
                    disabled={androidAcceleratorChecking}
                    onClick={() => void handleTestAndroidAccelerator()}
                    type="button"
                  >
                    {androidAcceleratorChecking ? <LoaderCircle className="animate-spin" size={13} /> : <RefreshCcw size={13} />}
                    Test Android Accelerator
                  </button>
                  {androidAcceleratorStatus ? (
                    <span className="whitespace-pre-line text-gray-300">{androidAcceleratorStatus}</span>
                  ) : null}
                </div>
              </div>

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

          {vertexPlatform === 'mobile' && (
            <Section title="Android LAN Server">
              <div className="rounded-xl border border-gray-800 bg-[#111217]/50 px-4 py-3 text-sm text-gray-400 mb-4">
                Serve your projects and assets to other devices on your local Wi-Fi network (port 8723).
                Access is protected by pairing: the phone shows a one-time PIN and a desktop browser must
                enter it to connect — no certificates, no browser warnings. Set a fixed PIN below to reuse
                the same code, or leave it blank to auto-generate a new PIN each time the server starts.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectInput
                  label="LAN Server Toggle"
                  value={providerSettings.androidLanServerEnabled ? 'enabled' : 'disabled'}
                  onChange={(val) => setProviderSetting('androidLanServerEnabled', val === 'enabled')}
                  options={[
                    { value: 'enabled', label: 'Enabled' },
                    { value: 'disabled', label: 'Disabled (Auto-start off)' }
                  ]}
                />
                <TextInput
                  label="Pairing PIN (optional fixed code)"
                  value={providerSettings.androidLanServerPin ?? ''}
                  onChange={(val) => setProviderSetting('androidLanServerPin', val)}
                  placeholder="Auto-generated each session if empty"
                />
              </div>
            </Section>
          )}

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
            </>
          )}
        </div>

        <div className="theme-panel theme-border p-5 border-t flex justify-end">
          <button
            onClick={toggleSettings}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            type="button"
          >
            Save & Close
          </button>
        </div>
      </div>
    </DockableDialog>
  );
};

function KeyboardShortcutsSection({
  keyboardShortcuts,
  onChange,
  onReset,
}: {
  keyboardShortcuts: Partial<Record<NativeMenuCommand, string>>;
  onChange: (command: NativeMenuCommand, shortcut: string) => void;
  onReset: () => void;
}) {
  return (
    <Section title="Keyboard Shortcuts">
      <div className="rounded-xl border border-gray-800 bg-[#111217]/50 p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            Use labels like <span className="text-gray-200">Ctrl+Shift+Z</span>, <span className="text-gray-200">Shift+R</span>, <span className="text-gray-200">Del</span>, or <span className="text-gray-200">F1</span>.
          </div>
          <button
            className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 hover:text-white"
            onClick={onReset}
            type="button"
          >
            Reset Defaults
          </button>
        </div>
        <div className="grid gap-2">
          {NATIVE_MENU_COMMANDS.map((command) => {
            const current = getKeyboardShortcutLabel(command, keyboardShortcuts) ?? '';
            const defaultShortcut = DEFAULT_KEYBOARD_SHORTCUTS[command] ?? '';
            return (
              <div
                className="grid items-center gap-3 rounded-lg border border-gray-800 bg-[#0b1018] px-3 py-2 md:grid-cols-[minmax(12rem,1fr)_10rem_12rem]"
                key={command}
              >
                <div>
                  <div className="text-sm font-medium text-gray-200">{formatShortcutCommandLabel(command)}</div>
                  <div className="text-xs text-gray-500">{command}</div>
                </div>
                <div className="text-xs text-gray-500">
                  Default: <span className="text-gray-300">{defaultShortcut || 'None'}</span>
                </div>
                <input
                  className="w-full rounded-lg border border-gray-700 bg-[#111217] px-2.5 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
                  onBlur={(event) => onChange(command, normalizeShortcutLabel(event.target.value))}
                  onChange={(event) => onChange(command, event.target.value)}
                  placeholder={defaultShortcut || 'No shortcut'}
                  type="text"
                  value={current}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function GamepadBindingsSection({
  gamepadBindings,
  onChange,
  onReset,
}: {
  gamepadBindings: GamepadBindingProfile;
  onChange: (workspace: GamepadWorkspace, controlId: GamepadControlId, patch: Partial<GamepadControlBinding>) => void;
  onReset: () => void;
}) {
  const [activeWorkspace, setActiveWorkspace] = React.useState<GamepadWorkspace>('flow');
  const commandOptions = getGamepadCommandOptionsForWorkspace(activeWorkspace);
  const workspaceBindings = gamepadBindings[activeWorkspace];
  const activeWorkspaceLabel = GAMEPAD_WORKSPACES.find((workspace) => workspace.id === activeWorkspace)?.label ?? activeWorkspace;

  return (
    <Section title="Gamepad Bindings">
      <div className="rounded-xl border border-gray-800 bg-[#111217]/50 p-4" data-gamepad-bindings-panel="true">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-gray-800 bg-[#0b1018] p-1">
            {GAMEPAD_WORKSPACES.map((workspace) => (
              <button
                aria-pressed={activeWorkspace === workspace.id}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeWorkspace === workspace.id
                    ? 'bg-blue-500/20 text-blue-100'
                    : 'text-gray-400 hover:bg-gray-800/70 hover:text-gray-100'
                }`}
                key={workspace.id}
                onClick={() => setActiveWorkspace(workspace.id)}
                type="button"
              >
                {workspace.label}
              </button>
            ))}
          </div>
          <button
            className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 hover:text-white"
            onClick={onReset}
            type="button"
          >
            Reset Defaults
          </button>
        </div>
        <div className="grid gap-2">
          {GAMEPAD_CONTROL_DEFINITIONS.map((control) => {
            const binding = workspaceBindings[control.id];
            return (
              <div
                className="grid gap-3 rounded-lg border border-gray-800 bg-[#0b1018] px-3 py-2 lg:grid-cols-[11rem_minmax(14rem,1fr)_minmax(18rem,28rem)]"
                key={control.id}
              >
                <div>
                  <div className="text-sm font-medium text-gray-200">{control.label}</div>
                  <div className="text-xs capitalize text-gray-500">{control.kind}</div>
                </div>
                <select
                  aria-label={`${activeWorkspaceLabel} ${control.label} command`}
                  className="w-full rounded-lg border border-gray-700 bg-[#111217] px-2.5 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
                  onChange={(event) => onChange(activeWorkspace, control.id, { command: event.target.value as NativeMenuCommand | '' })}
                  value={binding.command}
                >
                  <option value="">None</option>
                  {commandOptions.map((command) => (
                    <option key={command} value={command}>
                      {formatShortcutCommandLabel(command)}
                    </option>
                  ))}
                </select>
                <GamepadAdvancedControls
                  binding={binding}
                  controlId={control.id}
                  kind={control.kind}
                  onChange={(patch) => onChange(activeWorkspace, control.id, patch)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function GamepadAdvancedControls({
  binding,
  controlId,
  kind,
  onChange,
}: {
  binding: GamepadControlBinding;
  controlId: GamepadControlId;
  kind: string;
  onChange: (patch: Partial<GamepadControlBinding>) => void;
}) {
  const isAnalog = kind === 'axis' || kind === 'trigger';
  return (
    <div className="grid gap-2 text-xs text-gray-400 sm:grid-cols-2">
      <NumberSetting
        label="Threshold"
        max={1}
        min={0.05}
        onChange={(threshold) => onChange({ threshold })}
        step={0.05}
        value={binding.threshold}
      />
      {kind === 'axis' ? (
        <>
          <NumberSetting
            label="Deadzone"
            max={0.95}
            min={0}
            onChange={(deadzone) => onChange({ deadzone })}
            step={0.05}
            value={binding.deadzone}
          />
          <NumberSetting
            label="Sensitivity"
            max={3}
            min={0.1}
            onChange={(sensitivity) => onChange({ sensitivity })}
            step={0.1}
            value={binding.sensitivity}
          />
          <label className="flex items-center gap-2 rounded-lg border border-gray-800 bg-[#111217] px-2 py-2">
            <input
              checked={binding.inverted}
              onChange={(event) => onChange({ inverted: event.target.checked })}
              type="checkbox"
            />
            Invert
          </label>
        </>
      ) : null}
      {!isAnalog ? (
        <div className="rounded-lg border border-gray-800 bg-[#111217] px-2 py-2 text-gray-500">
          Digital edge trigger
        </div>
      ) : null}
      <input name={`gamepad-${controlId}-marker`} type="hidden" value={controlId} />
    </div>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[5rem_1fr] items-center gap-2 rounded-lg border border-gray-800 bg-[#111217] px-2 py-1.5">
      <span>{label}</span>
      <input
        className="min-w-0 rounded border border-gray-700 bg-[#0d0f15] px-2 py-1 font-mono text-xs text-gray-100"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={Number(value.toFixed(2))}
      />
    </label>
  );
}

function formatShortcutCommandLabel(command: NativeMenuCommand): string {
  return command
    .replace(/^[^:]+:/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type SettingsBackupStatus = { tone: 'ok' | 'error' | 'info'; message: string } | null;

function backupErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong with the settings backup.';
}

function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Optional, user-initiated encrypted backup of API keys + provider credentials. The blob is sealed
 * with a passphrase the user chooses (portable across machines) and never leaves the device except as
 * the file the user explicitly saves. See lib/settingsBackup.ts for the crypto.
 */
function SettingsBackupSection({
  exportSettingsBackup,
  importSettingsBackup,
  supported,
}: {
  exportSettingsBackup: (passphrase: string) => Promise<string>;
  importSettingsBackup: (envelopeText: string, passphrase: string) => Promise<void>;
  supported: boolean;
}) {
  const [mode, setMode] = React.useState<'export' | 'import'>('export');
  const [passphrase, setPassphrase] = React.useState('');
  const [confirmPassphrase, setConfirmPassphrase] = React.useState('');
  const [importText, setImportText] = React.useState('');
  const [importFileName, setImportFileName] = React.useState('');
  const [exportedBlob, setExportedBlob] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<SettingsBackupStatus>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const resetFeedback = () => {
    setStatus(null);
    setExportedBlob('');
  };

  const switchMode = (next: 'export' | 'import') => {
    setMode(next);
    setPassphrase('');
    setConfirmPassphrase('');
    setImportText('');
    setImportFileName('');
    resetFeedback();
  };

  const handleExport = async () => {
    resetFeedback();
    if (passphrase.length < 8) {
      setStatus({ tone: 'error', message: 'Choose a passphrase of at least 8 characters — you will need it to restore.' });
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setStatus({ tone: 'error', message: 'The two passphrases do not match.' });
      return;
    }
    setBusy(true);
    try {
      const blob = await exportSettingsBackup(passphrase);
      setExportedBlob(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`signal-loom-settings-${stamp}.slbackup`, blob);
      setStatus({
        tone: 'ok',
        message: 'Encrypted backup saved. Keep the file and its passphrase somewhere safe — the passphrase cannot be recovered.',
      });
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (error) {
      setStatus({ tone: 'error', message: backupErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    resetFeedback();
    try {
      const text = await file.text();
      setImportText(text);
      setImportFileName(file.name);
      setStatus({ tone: 'info', message: `Loaded ${file.name}. Enter its passphrase, then Restore.` });
    } catch {
      setStatus({ tone: 'error', message: 'Could not read that file.' });
    }
  };

  const handleImport = async () => {
    setStatus(null);
    if (!importText.trim()) {
      setStatus({ tone: 'error', message: 'Choose a backup file or paste its contents first.' });
      return;
    }
    setBusy(true);
    try {
      await importSettingsBackup(importText, passphrase);
      setStatus({ tone: 'ok', message: 'Settings restored — your keys and credentials are back in place.' });
      setImportText('');
      setImportFileName('');
      setPassphrase('');
    } catch (error) {
      setStatus({ tone: 'error', message: backupErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const statusToneClass = status?.tone === 'ok'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    : status?.tone === 'error'
      ? 'border-red-500/30 bg-red-500/10 text-red-100'
      : 'border-blue-500/30 bg-blue-500/10 text-blue-100';

  return (
    <Section title="Settings Backup">
      <div className="space-y-4 rounded-xl border border-gray-800 bg-[#111217]/50 p-4">
        <div className="flex items-start gap-3 text-sm text-gray-400">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={18} />
          <p className="leading-5">
            Save an encrypted copy of your API keys, provider credentials, and editor preferences so you can
            restore them if the app data is ever lost. The backup is locked with a passphrase you choose and is
            useless without it — Signal Loom never uploads it anywhere. This is optional.
          </p>
        </div>

        {!supported ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Encrypted backups aren’t available in this environment (no Web Crypto support).
          </div>
        ) : (
          <>
            <div className="flex w-fit rounded-lg border border-gray-800 bg-[#0b1018] p-1">
              {([['export', 'Export'], ['import', 'Restore']] as const).map(([value, label]) => (
                <button
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    mode === value ? 'bg-blue-500/20 text-blue-100' : 'text-gray-400 hover:text-gray-100'
                  }`}
                  key={value}
                  onClick={() => switchMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'export' ? (
              <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
                <div className="grid gap-3 md:grid-cols-2">
                  <BackupPassphraseInput
                    autoComplete="new-password"
                    label="Backup passphrase"
                    onChange={setPassphrase}
                    placeholder="At least 8 characters"
                    value={passphrase}
                  />
                  <BackupPassphraseInput
                    autoComplete="new-password"
                    label="Confirm passphrase"
                    onChange={setConfirmPassphrase}
                    placeholder="Re-enter passphrase"
                    value={confirmPassphrase}
                  />
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-400/50 bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-100 transition-colors hover:border-blue-300/70 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void handleExport()}
                  type="button"
                >
                  {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Download size={14} />}
                  Export encrypted backup
                </button>
                {exportedBlob ? (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">
                      If the download didn’t start, copy this text and save it as a <span className="text-gray-300">.slbackup</span> file:
                    </div>
                    <textarea
                      className="h-28 w-full resize-y rounded-lg border border-gray-700 bg-[#0d0f15] p-2 font-mono text-[11px] text-gray-300 outline-none"
                      readOnly
                      value={exportedBlob}
                    />
                    <button
                      className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500 hover:text-white"
                      onClick={() => void navigator.clipboard?.writeText(exportedBlob)}
                      type="button"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                ) : null}
              </form>
            ) : (
              <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    accept=".slbackup,.json,application/json,text/plain"
                    className="hidden"
                    onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 hover:text-white"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Upload size={14} />
                    Choose backup file
                  </button>
                  {importFileName ? <span className="text-xs text-gray-400">{importFileName}</span> : null}
                </div>
                <textarea
                  className="h-24 w-full resize-y rounded-lg border border-gray-700 bg-[#0d0f15] p-2 font-mono text-[11px] text-gray-300 outline-none focus:border-blue-500"
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="…or paste the backup file contents here"
                  value={importText}
                />
                <BackupPassphraseInput
                  autoComplete="off"
                  label="Backup passphrase"
                  onChange={setPassphrase}
                  placeholder="The passphrase used to create this backup"
                  value={passphrase}
                />
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-400/50 bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-100 transition-colors hover:border-blue-300/70 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void handleImport()}
                  type="button"
                >
                  {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}
                  Restore from backup
                </button>
                <div className="text-xs text-gray-500">
                  Restoring overwrites your current keys and credentials with the ones in the backup.
                </div>
              </form>
            )}

            {status ? (
              <div className={`rounded-lg border px-3 py-2 text-xs ${statusToneClass}`}>{status.message}</div>
            ) : null}
          </>
        )}
      </div>
    </Section>
  );
}

function BackupPassphraseInput({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <input
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-gray-700 bg-[#111217] p-2.5 text-sm text-gray-200 outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="password"
        value={value}
      />
    </label>
  );
}

function ImageProviderHelpSection({ entries }: { entries: ImageProviderHelpEntry[] }) {
  return (
    <Section title="Image Provider Setup & Costs">
      <p className="text-xs text-gray-500">
        Tap a provider to expand its setup steps, costs, and troubleshooting — most of this is only needed
        once, when you first sign up.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <ImageProviderHelpCard entry={entry} key={entry.providerId} />
        ))}
      </div>
    </Section>
  );
}

function ImageProviderHelpCard({ entry }: { entry: ImageProviderHelpEntry }) {
  // Collapsed by default: the setup instructions are bulky and only relevant during first-time signup,
  // so the card shows just the identity + sign-up/pricing links until the user expands it.
  const [expanded, setExpanded] = React.useState(false);

  return (
    <article className="rounded-xl border border-gray-800 bg-[#111217]/50 text-sm text-gray-300">
      <div className="flex items-start justify-between gap-3 p-4">
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <ChevronRight
            className={`mt-0.5 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
            size={16}
          />
          <span className="min-w-0">
            <span className="block font-semibold text-gray-100">{entry.label}</span>
            <span className="mt-1 block text-xs leading-5 text-gray-400">{entry.capabilitySummary}</span>
            <span className="mt-1 block text-[11px] text-gray-500">Pricing verified {entry.lastVerifiedDate}</span>
          </span>
        </button>
        <div className="flex shrink-0 gap-2 text-xs">
          <a className="text-blue-300 hover:text-blue-100" href={entry.signupUrl} rel="noreferrer" target="_blank">
            Sign up
          </a>
          <a className="text-blue-300 hover:text-blue-100" href={entry.pricingUrl} rel="noreferrer" target="_blank">
            Pricing
          </a>
        </div>
      </div>
      {expanded ? (
        <div className="space-y-2 border-t border-gray-800 px-4 pb-4 pt-3 text-xs leading-5 text-gray-400">
          <div>
            <div className="font-semibold uppercase tracking-[0.16em] text-gray-500">Configure</div>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              {entry.setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.16em] text-gray-500">Cost</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {entry.costNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.16em] text-gray-500">Operations</div>
            <p className="mt-1 text-gray-400">
              {entry.supportedOperations.join(', ')}
            </p>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.16em] text-gray-500">Spend Controls</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {entry.spendControls.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.16em] text-gray-500">Troubleshooting</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {entry.troubleshooting.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          {entry.apiKeyUrl ? (
            <a className="inline-flex text-blue-300 hover:text-blue-100" href={entry.apiKeyUrl} rel="noreferrer" target="_blank">
              Open API key page
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ImageModelPricingSection({ entries }: { entries: ImageModelPricingEntry[] }) {
  return (
    <Section title="Image Model Cost Table">
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#111217]/50">
        <div className="grid grid-cols-[1.1fr_1.6fr_1fr_1fr_0.9fr] gap-3 border-b border-gray-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
          <span>Provider</span>
          <span>Model</span>
          <span>Operation</span>
          <span>Cost</span>
          <span>Confidence</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {entries.map((entry) => (
            <a
              className="grid grid-cols-[1.1fr_1.6fr_1fr_1fr_0.9fr] gap-3 border-b border-gray-900/80 px-4 py-2 text-xs text-gray-400 transition-colors last:border-b-0 hover:bg-blue-500/5"
              href={entry.sourceUrl}
              key={`${entry.providerId}:${entry.modelId}:${entry.operation}`}
              rel="noreferrer"
              target="_blank"
              title={`${entry.freeTierOrCredits} ${entry.notes.join(' ')}`}
            >
              <span className="text-gray-300">{getProviderLabel(entry.providerId)}</span>
              <span className="min-w-0 truncate text-gray-200">{entry.modelId}</span>
              <span>{entry.operation}</span>
              <span className="text-gray-100">
                {entry.unitPriceUsd === undefined ? entry.unit : `$${formatSettingsUsd(entry.unitPriceUsd)} / ${entry.unit}`}
              </span>
              <span>{entry.visibility}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="text-xs leading-5 text-gray-500">
        Exact rows use published fixed prices. Estimated rows are pre-run estimates and provider-routed rows depend on the selected endpoint or Hugging Face provider.
      </div>
    </Section>
  );
}

function formatSettingsUsd(value: number): string {
  if (value < 0.01) {
    return value.toFixed(4);
  }

  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
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

interface ThemeGridProps {
  activeThemeId: string;
  onChange: (themeId: string) => void;
  themes: InterfaceTheme[];
}

function ThemeGrid({ activeThemeId, onChange, themes }: ThemeGridProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-300">Theme previews</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {themes.map((theme) => {
          const selected = theme.id === activeThemeId;
          return (
            <button
              aria-pressed={selected}
              className={`rounded-lg border p-2 text-left transition-all ${
                selected
                  ? 'border-[var(--sl-accent)] shadow-[0_0_0_1px_var(--sl-accent)]'
                  : 'border-gray-700/60 hover:border-gray-500'
              }`}
              key={theme.id}
              onClick={() => onChange(theme.id)}
              style={{
                background: theme.colors['--sl-panel'],
                color: theme.colors['--sl-text'],
              }}
              type="button"
            >
              <span className="block text-xs font-semibold">{theme.name}</span>
              <span className="mt-2 flex gap-1">
                {(['--sl-bg', '--sl-surface', '--sl-panel', '--sl-border', '--sl-accent'] as const).map((variable) => (
                  <span
                    className="h-4 flex-1 rounded-sm border border-white/10"
                    key={variable}
                    style={{ background: theme.colors[variable] }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
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
        Native FFmpeg rendering is local-machine only. Auto prefers AMD VAAPI GPU encode when the token-protected local render service reports it, then native CPU, then browser FFmpeg. Use the forced AMD VAAPI option when CPU fallback is not acceptable.
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
        const modelValue = (defaultModels ?? {})[provider] ?? '';
        const options = getModelOptions(
          capability,
          provider as never,
          modelCatalog,
          modelValue,
        );

        return (
          <div key={`${capability}-${provider}`} className="space-y-2">
            <SelectInput
            key={`${capability}-${provider}`}
            label={getProviderLabel(provider as never)}
            onChange={(value) => onChange(capability, provider, value)}
            options={options}
            value={modelValue}
            />
            <TextInput
              label="Model ID override"
              onChange={(value) => onChange(capability, provider, value)}
              placeholder="Paste a newly announced model ID"
              value={modelValue}
            />
          </div>
        );
      })}
    </div>
  );
}
