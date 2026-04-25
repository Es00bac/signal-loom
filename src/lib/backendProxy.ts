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

export interface BackendProxyExecuteRequest {
  url: string;
  body: {
    node: unknown;
    context: unknown;
    settings: {
      defaultModels: Partial<DefaultModelSettings> | Record<string, unknown>;
      providerSettings: Partial<ProviderSettings> | Record<string, unknown>;
    };
  };
}

export function shouldUseBackendProxy(settings: BackendProxySettingsLike): boolean {
  return Boolean(settings.backendProxyEnabled && settings.backendProxyBaseUrl?.trim());
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
        defaultModels: input.settings.defaultModels,
        providerSettings: input.settings.providerSettings,
      },
    },
  };
}
