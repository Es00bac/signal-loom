import type { DefaultModelSettings, ProviderSettings } from '../types/flow';

export interface BackendProxySettingsLike {
  backendProxyEnabled?: boolean;
  backendProxyBaseUrl?: string;
}

export interface BackendProxyExecuteRequestInput {
  baseUrl: string;
  node: unknown;
  context: unknown;
  settings: {
    defaultModels: Partial<DefaultModelSettings> | Record<string, unknown>;
    providerSettings: Partial<ProviderSettings> | Record<string, unknown>;
  };
}

/**
 * Version stamp of the outbound execution-settings DTO. Bump when the forwarded shape changes so
 * a proxy server can dispatch on it; the surrounding `{ node, context, settings }` envelope stays
 * wire-compatible with pre-versioned servers, which simply ignore the extra field.
 */
export const BACKEND_PROXY_EXECUTION_SETTINGS_VERSION = 1;

/**
 * Outbound policy for every ProviderSettings field (AUD-012). The proxy body is BUILT from the
 * 'forward' entries — never by copying the settings object and deleting secrets — so a field the
 * policy does not know about can never reach the wire. `satisfies` keeps the map exhaustive: adding
 * a ProviderSettings field refuses to compile until it is explicitly classified here.
 *
 * 'forward' is reserved for non-secret execution parameters a proxy server needs to run a node
 * (endpoints, model ids, project/region identifiers, retry policy). Anything credential-like
 * (tokens, auth headers, service-account JSON, ADC environment variables, PINs) and anything the
 * remote proxy has no use for (local render/export preferences, Paper output presets, the proxy's
 * own address, on-device Android accelerator config) is 'withhold'.
 */
const PROVIDER_SETTING_EXECUTION_POLICY = {
  openaiBaseUrl: 'forward',
  elevenlabsVoiceId: 'forward',
  renderBackendPreference: 'withhold',
  exportCompositorPreference: 'withhold',
  localNativeRenderUrl: 'withhold',
  localNativeRenderToken: 'withhold',
  backendProxyEnabled: 'withhold',
  backendProxyBaseUrl: 'withhold',
  geminiCredentialMode: 'forward',
  vertexAuthMode: 'forward',
  vertexProjectId: 'forward',
  vertexLocation: 'forward',
  vertexQuotaProjectId: 'forward',
  vertexEnvironmentVariables: 'withhold',
  vertexServiceAccountJson: 'withhold',
  paperPrintUpscaleMethod: 'withhold',
  paperPdfRasterPreset: 'withhold',
  localOpenImageEndpointUrl: 'forward',
  localOpenImageAuthHeader: 'withhold',
  localOpenImageDefaultModel: 'forward',
  genericImageEndpointUrl: 'forward',
  genericImageAuthHeader: 'withhold',
  localAiCpuEndpointUrl: 'forward',
  localAiCpuAuthHeader: 'withhold',
  localAiCpuModel: 'forward',
  atlasBaseUrl: 'forward',
  bytePlusBaseUrl: 'forward',
  androidAcceleratorBaseUrl: 'withhold',
  androidAcceleratorAuthToken: 'withhold',
  androidAcceleratorDefaultUpscaler: 'withhold',
  androidAcceleratorDefaultImageModel: 'withhold',
  batchMaxRetries: 'forward',
  batchRetryBaseDelayMs: 'forward',
  androidLanServerEnabled: 'withhold',
  androidLanServerPin: 'withhold',
} as const satisfies Record<keyof ProviderSettings, 'forward' | 'withhold'>;

type ProviderSettingExecutionPolicy = typeof PROVIDER_SETTING_EXECUTION_POLICY;

export type BackendProxyForwardedProviderSettingKey = {
  [TKey in keyof ProviderSettingExecutionPolicy]: ProviderSettingExecutionPolicy[TKey] extends 'forward'
    ? TKey
    : never;
}[keyof ProviderSettingExecutionPolicy];

/** The allowlisted, credential-free ProviderSettings subset a proxy request may carry. */
export type BackendProxyForwardedProviderSettings = Partial<
  Pick<ProviderSettings, BackendProxyForwardedProviderSettingKey>
>;

export const BACKEND_PROXY_FORWARDED_PROVIDER_SETTING_KEYS = (
  Object.keys(PROVIDER_SETTING_EXECUTION_POLICY) as Array<keyof ProviderSettings>
).filter(
  (key): key is BackendProxyForwardedProviderSettingKey =>
    PROVIDER_SETTING_EXECUTION_POLICY[key] === 'forward',
);

const DEFAULT_MODEL_CAPABILITIES = ['text', 'image', 'video', 'audio'] as const;

export type BackendProxyDefaultModels = Record<
  (typeof DEFAULT_MODEL_CAPABILITIES)[number],
  Record<string, string>
>;

/** Versioned, explicitly allowlisted execution settings — the only settings shape sent to a proxy. */
export interface BackendProxyExecutionSettings {
  version: typeof BACKEND_PROXY_EXECUTION_SETTINGS_VERSION;
  defaultModels: BackendProxyDefaultModels;
  providerSettings: BackendProxyForwardedProviderSettings;
}

export interface BackendProxyExecuteRequest {
  url: string;
  body: {
    node: unknown;
    context: unknown;
    settings: BackendProxyExecutionSettings;
  };
}

export function shouldUseBackendProxy(settings: BackendProxySettingsLike): boolean {
  return Boolean(settings.backendProxyEnabled && settings.backendProxyBaseUrl?.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildForwardedProviderSettings(source: unknown): BackendProxyForwardedProviderSettings {
  const record = isRecord(source) ? source : {};
  const forwarded: Record<string, string | number | boolean> = {};

  for (const key of BACKEND_PROXY_FORWARDED_PROVIDER_SETTING_KEYS) {
    const value = record[key];
    // Primitives only: an object smuggled into an allowlisted slot never travels.
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      forwarded[key] = value;
    }
  }

  return forwarded as BackendProxyForwardedProviderSettings;
}

function buildForwardedDefaultModels(source: unknown): BackendProxyDefaultModels {
  const record = isRecord(source) ? source : {};
  const models = {} as BackendProxyDefaultModels;

  for (const capability of DEFAULT_MODEL_CAPABILITIES) {
    const entries = record[capability];
    const forwarded: Record<string, string> = {};
    if (isRecord(entries)) {
      for (const [provider, modelId] of Object.entries(entries)) {
        if (typeof modelId === 'string') {
          forwarded[provider] = modelId;
        }
      }
    }
    models[capability] = forwarded;
  }

  return models;
}

export function buildBackendProxyExecuteRequest(
  input: BackendProxyExecuteRequestInput,
): BackendProxyExecuteRequest {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');

  return {
    url: `${baseUrl}/api/flow/execute-node`,
    body: {
      node: input.node,
      context: input.context,
      settings: {
        version: BACKEND_PROXY_EXECUTION_SETTINGS_VERSION,
        defaultModels: buildForwardedDefaultModels(input.settings.defaultModels),
        providerSettings: buildForwardedProviderSettings(input.settings.providerSettings),
      },
    },
  };
}
