import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER_SETTINGS } from './providerCatalog';
import type { ProviderSettings } from '../types/flow';
import { buildBackendProxyExecuteRequest, shouldUseBackendProxy } from './backendProxy';

/**
 * AUD-012 expected outbound policy, duplicated here on purpose: the implementation must agree
 * with this classification key-for-key, so quietly moving a credential onto the wire requires
 * editing this test as well. Together the two lists must cover every ProviderSettings key.
 */
const EXPECTED_FORWARDED_PROVIDER_SETTING_KEYS = [
  'openaiBaseUrl',
  'elevenlabsVoiceId',
  'geminiCredentialMode',
  'vertexAuthMode',
  'vertexProjectId',
  'vertexLocation',
  'vertexQuotaProjectId',
  'localOpenImageEndpointUrl',
  'localOpenImageDefaultModel',
  'genericImageEndpointUrl',
  'localAiCpuEndpointUrl',
  'localAiCpuModel',
  'atlasBaseUrl',
  'bytePlusBaseUrl',
  'batchMaxRetries',
  'batchRetryBaseDelayMs',
] as const;

const EXPECTED_WITHHELD_PROVIDER_SETTING_KEYS = [
  'renderBackendPreference',
  'exportCompositorPreference',
  'localNativeRenderUrl',
  'localNativeRenderToken',
  'backendProxyEnabled',
  'backendProxyBaseUrl',
  'vertexEnvironmentVariables',
  'vertexServiceAccountJson',
  'paperPrintUpscaleMethod',
  'paperPdfRasterPreset',
  'localOpenImageAuthHeader',
  'genericImageAuthHeader',
  'localAiCpuAuthHeader',
  'androidAcceleratorBaseUrl',
  'androidAcceleratorAuthToken',
  'androidAcceleratorDefaultUpscaler',
  'androidAcceleratorDefaultImageModel',
  'androidLanServerEnabled',
  'androidLanServerPin',
] as const;

/** Every credential-bearing ProviderSettings field, each carrying a unique traceable sentinel. */
const CREDENTIAL_SENTINELS = {
  localNativeRenderToken: 'SECRET-local-native-render-token',
  vertexEnvironmentVariables: 'GOOGLE_APPLICATION_CREDENTIALS=SECRET-vertex-adc-path',
  vertexServiceAccountJson: '{"type":"service_account","private_key":"SECRET-vertex-private-key"}',
  localOpenImageAuthHeader: 'Bearer SECRET-local-open-image-token',
  genericImageAuthHeader: 'Bearer SECRET-generic-image-token',
  localAiCpuAuthHeader: 'Bearer SECRET-local-cpu-token',
  androidAcceleratorAuthToken: 'SECRET-android-accelerator-token',
  androidLanServerPin: 'SECRET-lan-pin-1234',
} satisfies Partial<ProviderSettings>;

/** Distinct values for every field a proxy legitimately needs to execute a node. */
const NON_SECRET_EXECUTION_VALUES = {
  openaiBaseUrl: 'https://openai-compatible.example/v1',
  elevenlabsVoiceId: 'voice-abc',
  geminiCredentialMode: 'vertex-adc',
  vertexAuthMode: 'gcloud-adc',
  vertexProjectId: 'render-project',
  vertexLocation: 'us-central1',
  vertexQuotaProjectId: 'billing-project',
  localOpenImageEndpointUrl: 'https://lan-image.example/edit',
  localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
  genericImageEndpointUrl: 'https://generic-image.example/generate',
  localAiCpuEndpointUrl: 'https://lan-cpu.example/upscale',
  localAiCpuModel: 'realesrgan-4x',
  atlasBaseUrl: 'https://api.atlas-cloud.ai',
  bytePlusBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  batchMaxRetries: 4,
  batchRetryBaseDelayMs: 12000,
} satisfies Partial<ProviderSettings>;

function buildHostileProviderSettings(): ProviderSettings {
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...NON_SECRET_EXECUTION_VALUES,
    ...CREDENTIAL_SENTINELS,
    // Hostile / future shapes an allowlist must drop even though they are not typed today:
    apiKeys: { openai: 'SECRET-nested-api-key' },
    futureAuthBlock: { serviceAccount: { private_key: 'SECRET-future-private-key' } },
  } as unknown as ProviderSettings;
}

function buildRequestFromHostileSettings() {
  return buildBackendProxyExecuteRequest({
    baseUrl: 'https://proxy.local/',
    node: { id: 'node-1', type: 'imageGen', data: { prompt: 'hello' } },
    context: { prompt: 'hello' },
    settings: {
      defaultModels: { text: { gemini: 'gemini-3' }, image: { openai: 'gpt-image-1' } },
      providerSettings: buildHostileProviderSettings(),
    },
  });
}

/** Depth-first collection of every string value reachable anywhere in a JSON-ish structure. */
function collectStringValues(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStringValues(entry, found);
  } else if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStringValues(entry, found);
  }
  return found;
}

describe('backend proxy settings', () => {
  it('only enables proxy mode when both enabled and a base URL are present', () => {
    expect(shouldUseBackendProxy({ backendProxyEnabled: true, backendProxyBaseUrl: 'https://proxy.local' })).toBe(true);
    expect(shouldUseBackendProxy({ backendProxyEnabled: true, backendProxyBaseUrl: '   ' })).toBe(false);
    expect(shouldUseBackendProxy({ backendProxyEnabled: false, backendProxyBaseUrl: 'https://proxy.local' })).toBe(false);
  });

  it('builds an execute-node request without browser provider keys', () => {
    const request = buildBackendProxyExecuteRequest({
      baseUrl: 'https://proxy.local/',
      node: { id: 'node-1', type: 'textNode', data: { prompt: 'hello' } },
      context: { prompt: 'hello' },
      settings: {
        defaultModels: { text: { gemini: 'gemini' } },
        providerSettings: { backendProxyEnabled: true, backendProxyBaseUrl: 'https://proxy.local/' },
      },
    });

    expect(request.url).toBe('https://proxy.local/api/flow/execute-node');
    expect(request.body).not.toHaveProperty('apiKeys');
    expect(request.body).toMatchObject({
      node: { id: 'node-1' },
      context: { prompt: 'hello' },
    });
  });
});

describe('backend proxy execution settings DTO (AUD-012)', () => {
  it('classifies every ProviderSettings key exactly once (drift guard)', () => {
    const classified = [
      ...EXPECTED_FORWARDED_PROVIDER_SETTING_KEYS,
      ...EXPECTED_WITHHELD_PROVIDER_SETTING_KEYS,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(Object.keys(DEFAULT_PROVIDER_SETTINGS).sort());
  });

  it('stamps the outbound settings DTO with an explicit schema version', () => {
    const request = buildRequestFromHostileSettings();
    expect(request.body.settings.version).toBe(1);
  });

  it('withholds every credential-bearing value recursively, including hostile nesting', () => {
    const request = buildRequestFromHostileSettings();

    // No string anywhere in the outbound body may carry a planted secret.
    const strings = collectStringValues(request.body);
    const leaked = strings.filter((value) => value.includes('SECRET-'));
    expect(leaked).toEqual([]);

    // Belt and braces: the serialized wire payload (keys included) is also clean.
    expect(JSON.stringify(request.body)).not.toContain('SECRET-');

    // Each known credential field is structurally absent, not blanked or renamed.
    for (const key of Object.keys(CREDENTIAL_SENTINELS)) {
      expect(request.body.settings.providerSettings, `credential field forwarded: ${key}`).not.toHaveProperty(key);
    }
    expect(request.body.settings.providerSettings).not.toHaveProperty('apiKeys');
    expect(request.body.settings.providerSettings).not.toHaveProperty('futureAuthBlock');
  });

  it('forwards only allowlisted keys, and all required non-secret execution settings survive', () => {
    const request = buildRequestFromHostileSettings();
    const forwarded = request.body.settings.providerSettings as Record<string, unknown>;

    const allowlist = new Set<string>(EXPECTED_FORWARDED_PROVIDER_SETTING_KEYS);
    for (const key of Object.keys(forwarded)) {
      expect(allowlist.has(key), `unexpected forwarded provider setting: ${key}`).toBe(true);
    }

    for (const [key, value] of Object.entries(NON_SECRET_EXECUTION_VALUES)) {
      expect(forwarded[key], `missing required execution setting: ${key}`).toBe(value);
    }
  });

  it('drops non-primitive values even for allowlisted keys', () => {
    const request = buildBackendProxyExecuteRequest({
      baseUrl: 'https://proxy.local',
      node: {},
      context: {},
      settings: {
        defaultModels: {},
        providerSettings: {
          openaiBaseUrl: { smuggled: 'SECRET-object-valued-base-url' },
          atlasBaseUrl: 'https://api.atlas-cloud.ai',
        } as unknown as Partial<ProviderSettings>,
      },
    });

    expect(request.body.settings.providerSettings).not.toHaveProperty('openaiBaseUrl');
    expect(JSON.stringify(request.body)).not.toContain('SECRET-');
    expect((request.body.settings.providerSettings as Record<string, unknown>).atlasBaseUrl)
      .toBe('https://api.atlas-cloud.ai');
  });

  it('rebuilds defaultModels from the four capabilities with string-valued entries only', () => {
    const request = buildBackendProxyExecuteRequest({
      baseUrl: 'https://proxy.local',
      node: {},
      context: {},
      settings: {
        defaultModels: {
          text: { gemini: 'gemini-3', broken: 42 },
          image: { openai: { smuggled: 'SECRET-model-object' } },
          video: { atlas: 'google/veo3.1/text-to-video' },
          rogueCapability: { provider: 'SECRET-rogue-model' },
        },
        providerSettings: {},
      },
    });

    const models = request.body.settings.defaultModels as Record<string, Record<string, unknown>>;
    expect(models.text).toEqual({ gemini: 'gemini-3' });
    expect(models.image).toEqual({});
    expect(models.video).toEqual({ atlas: 'google/veo3.1/text-to-video' });
    expect(models.audio).toEqual({});
    expect(models).not.toHaveProperty('rogueCapability');
    expect(JSON.stringify(request.body)).not.toContain('SECRET-');
  });
});
