import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';
import { executeNodeRequest, resolveProviderStartPolicyKey } from './flowExecution';
import { getProviderLimiter } from './providerRateLimiter';
import {
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER_SETTINGS,
} from './providerCatalog';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function imageNode(provider: string, modelId: string): AppNode {
  return {
    id: `${provider}-image`,
    type: 'imageGen',
    position: { x: 0, y: 0 },
    data: { provider, modelId },
  } as AppNode;
}

const settings: RuntimeSettingsSnapshot = {
  apiKeys: {
    gemini: '',
    openai: '',
    huggingface: '',
    elevenlabs: '',
    atlas: 'atlas-key',
    byteplus: 'byteplus-key',
  },
  defaultModels: DEFAULT_MODELS,
  providerSettings: {
    ...DEFAULT_PROVIDER_SETTINGS,
    batchMaxRetries: 0,
  },
};

const context = {
  prompt: 'a deterministic lighthouse study',
  config: { ...DEFAULT_EXECUTION_CONFIG, imageOutputFormat: 'png' as const },
};

describe('Flow provider start scheduling', () => {
  const originalDelays = new Map<string, number>();

  beforeEach(() => {
    vi.useFakeTimers();
    for (const policy of ['atlas', 'byteplus', 'default']) {
      const limiter = getProviderLimiter(policy);
      originalDelays.set(policy, limiter.minDelayMs);
      limiter.minDelayMs = 0;
    }
  });

  afterEach(() => {
    for (const [policy, delay] of originalDelays) getProviderLimiter(policy).minDelayMs = delay;
    originalDelays.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('assigns independent provider and route policy keys without a shared default', () => {
    expect(resolveProviderStartPolicyKey(imageNode('atlas', 'black-forest-labs/flux-schnell'), settings)).toBe('atlas');
    expect(resolveProviderStartPolicyKey(imageNode('byteplus', 'seedream-5-0-260128'), settings)).toBe('byteplus');
    expect(resolveProviderStartPolicyKey(imageNode('localOpen', 'Qwen/Qwen-Image-Edit'), settings)).toBe('localOpen');
    expect(resolveProviderStartPolicyKey(imageNode('android', 'local-dream-active'), settings)).toBe('android');
    expect(resolveProviderStartPolicyKey({
      id: 'local-prompt',
      type: 'textNode',
      position: { x: 0, y: 0 },
      data: { mode: 'prompt', prompt: 'local text' },
    } as AppNode, settings)).toBe('local');

    const proxySettings: RuntimeSettingsSnapshot = {
      ...settings,
      providerSettings: {
        ...settings.providerSettings,
        backendProxyEnabled: true,
        backendProxyBaseUrl: 'https://proxy.example.test',
      },
    };
    expect(resolveProviderStartPolicyKey(
      imageNode('atlas', 'black-forest-labs/flux-schnell'),
      proxySettings,
    )).toBe('backend-proxy:atlas');

    expect(getProviderLimiter('atlas')).not.toBe(getProviderLimiter('byteplus'));
    expect(getProviderLimiter('atlas')).not.toBe(getProviderLimiter('default'));
    expect(getProviderLimiter('backend-proxy:atlas')).not.toBe(getProviderLimiter('atlas'));
  });

  it('does not let a polling Atlas job serialize an unrelated BytePlus start', async () => {
    const atlasPoll = deferred<Response>();
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith('/model/generateImage')) {
        return jsonResponse({ data: { id: 'atlas-polling-job' } });
      }
      if (url.includes('/model/prediction/atlas-polling-job')) {
        return atlasPoll.promise;
      }
      if (url.endsWith('/images/generations')) {
        return jsonResponse({ data: [{ b64_json: 'QllURVBMVVM=' }] });
      }
      throw new Error(`Unexpected fake provider request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const atlas = executeNodeRequest(
      imageNode('atlas', 'black-forest-labs/flux-schnell'),
      context,
      settings,
    );
    atlas.catch(() => undefined);
    for (let turn = 0; turn < 20 && !requestedUrls.some((url) => url.includes('/model/prediction/')); turn += 1) {
      await Promise.resolve();
    }
    expect(requestedUrls.some((url) => url.includes('/model/prediction/atlas-polling-job'))).toBe(true);

    const byteplus = executeNodeRequest(
      imageNode('byteplus', 'seedream-5-0-260128'),
      context,
      settings,
    );
    await expect(byteplus).resolves.toMatchObject({
      result: 'data:image/png;base64,QllURVBMVVM=',
      resultType: 'image',
    });
    expect(requestedUrls.some((url) => url.endsWith('/images/generations'))).toBe(true);

    atlasPoll.resolve(jsonResponse({
      data: {
        status: 'succeeded',
        outputs: ['data:image/png;base64,QVRMQVM='],
      },
    }));
    await expect(atlas).resolves.toMatchObject({ resultType: 'image' });
  });
});
