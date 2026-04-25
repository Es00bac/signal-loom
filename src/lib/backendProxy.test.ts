import { describe, expect, it } from 'vitest';
import { buildBackendProxyExecuteRequest, shouldUseBackendProxy } from './backendProxy';

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
