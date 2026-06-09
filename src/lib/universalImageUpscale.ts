import type { ApiKeys, PaperPrintUpscaleMethod, ProviderSettings } from '../types/flow';
import { isAndroidAcceleratorConfigured } from './androidAccelerator';
import {
  STABILITY_CONSERVATIVE_UPSCALE_COST_USD,
  STABILITY_FAST_UPSCALE_COST_USD,
} from './paperImageUpscale';
import { isVertexProjectConfigured } from './vertexProviderSettings';

export type UniversalConfiguredUpscaleProvider =
  | 'android-accelerator'
  | 'stability-fast'
  | 'stability-conservative'
  | 'vertex-imagen'
  | 'local-ai-cpu'
  | 'browser';

export interface UniversalConfiguredUpscalePlan {
  method: PaperPrintUpscaleMethod;
  provider: UniversalConfiguredUpscaleProvider;
  canRun: boolean;
  costUsd?: number;
  label: string;
  costLabel: string;
  notes: string[];
  unavailableReason?: string;
}

export function resolveUniversalConfiguredUpscalePlan(input: {
  providerSettings: ProviderSettings;
  apiKeys?: Pick<ApiKeys, 'stability'>;
}): UniversalConfiguredUpscalePlan {
  const method = input.providerSettings.paperPrintUpscaleMethod ?? 'auto';
  const hasAndroid = isAndroidAcceleratorConfigured(input.providerSettings);
  const hasStability = Boolean(input.apiKeys?.stability?.trim());
  const hasVertex = isVertexProjectConfigured(input.providerSettings);
  const hasLocalCpu = Boolean(input.providerSettings.localAiCpuEndpointUrl?.trim());

  if (method === 'auto') {
    if (hasAndroid) {
      return plan(method, 'android-accelerator');
    }
    if (hasLocalCpu) {
      return plan(method, 'local-ai-cpu');
    }
    if (hasStability) {
      return plan(method, 'stability-fast');
    }
    if (hasVertex) {
      return plan(method, 'vertex-imagen');
    }
    return plan(method, 'browser');
  }

  if (method === 'stability-fast') {
    return plan(method, 'stability-fast', hasStability ? undefined : 'Stability AI key is not configured.');
  }
  if (method === 'stability-conservative') {
    return plan(method, 'stability-conservative', hasStability ? undefined : 'Stability AI key is not configured.');
  }
  if (method === 'vertex-imagen') {
    return plan(method, 'vertex-imagen', hasVertex ? undefined : 'Vertex AI image project is not configured.');
  }
  if (method === 'android-accelerator') {
    return plan(method, 'android-accelerator', hasAndroid ? undefined : 'Android accelerator URL is not configured.');
  }
  if (method === 'local-ai-cpu') {
    return plan(method, 'local-ai-cpu', hasLocalCpu ? undefined : 'Local CPU AI upscaler runtime is not configured.');
  }
  return plan(method, 'browser');
}

export function addConfiguredUpscaleCost(input: {
  baseCostUsd?: number;
  enabled: boolean;
  providerSettings: ProviderSettings;
  apiKeys?: Pick<ApiKeys, 'stability'>;
}): { costUsd?: number; notes: string[] } {
  if (!input.enabled) {
    return { costUsd: input.baseCostUsd, notes: [] };
  }

  const upscale = resolveUniversalConfiguredUpscalePlan({
    providerSettings: input.providerSettings,
    apiKeys: input.apiKeys,
  });
  const notes = [`Auto-upscale: ${upscale.label} (${upscale.costLabel}).`];

  if (input.baseCostUsd === undefined || upscale.costUsd === undefined) {
    return {
      costUsd: undefined,
      notes,
    };
  }

  return {
    costUsd: roundUsd(input.baseCostUsd + upscale.costUsd),
    notes,
  };
}

function plan(
  method: PaperPrintUpscaleMethod,
  provider: UniversalConfiguredUpscaleProvider,
  unavailableReason?: string,
): UniversalConfiguredUpscalePlan {
  const costUsd = provider === 'stability-fast'
    ? STABILITY_FAST_UPSCALE_COST_USD
    : provider === 'stability-conservative'
      ? STABILITY_CONSERVATIVE_UPSCALE_COST_USD
      : provider === 'vertex-imagen'
        ? undefined
        : 0;
  const label = describeUniversalConfiguredUpscaleProvider(provider);

  return {
    method,
    provider,
    canRun: !unavailableReason,
    costUsd,
    label,
    costLabel: costUsd === undefined ? 'cost unknown' : costUsd <= 0 ? 'free' : `$${costUsd.toFixed(2)}`,
    notes: provider === 'android-accelerator'
      ? ['Runs on the paired phone over LAN with no provider spend.']
      : provider === 'local-ai-cpu'
        ? ['Runs AI upscaling with a local CPU runtime endpoint.']
        : provider === 'browser'
          ? ['Runs as local browser scaling with no provider spend.']
          : [],
    unavailableReason,
  };
}

function describeUniversalConfiguredUpscaleProvider(provider: UniversalConfiguredUpscaleProvider): string {
  switch (provider) {
    case 'android-accelerator':
      return 'Android accelerator';
    case 'stability-fast':
      return 'Stability Fast Upscale';
    case 'stability-conservative':
      return 'Stability Conservative Upscale';
    case 'vertex-imagen':
      return 'Vertex Imagen Upscale';
    case 'local-ai-cpu':
      return 'Local CPU AI upscaler';
    case 'browser':
      return 'Local browser upscale';
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}
