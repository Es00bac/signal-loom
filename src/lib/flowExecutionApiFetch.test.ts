import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';

const settings = {
  providerSettings: {
    backendProxyEnabled: false,
    batchMaxRetries: 0,
    batchRetryBaseDelayMs: 1,
  },
} as RuntimeSettingsSnapshot;

function requestNode(declaredOutputType?: 'text' | 'json'): AppNode {
  return {
    id: 'request',
    type: 'apiFetchNode',
    position: { x: 0, y: 0 },
    data: { url: 'https://example.test/data', declaredOutputType },
  } as AppNode;
}

describe('API Requester declared output execution', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses declared JSON even when the server omits its content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));

    const result = await executeNodeRequest(
      requestNode('json'),
      { prompt: '', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    );

    expect(result.resultType).toBe('json');
    expect(result.result).toBe('{"ok":true}');
  });

  it('rejects a response that violates a declared JSON output without coercing it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

    await expect(executeNodeRequest(
      requestNode('json'),
      { prompt: '', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    )).rejects.toThrow('declared JSON output');
  });

  it('keeps declared text as text even when the response is JSON-labelled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    const result = await executeNodeRequest(
      requestNode('text'),
      { prompt: '', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    );

    expect(result.resultType).toBe('text');
    expect(result.result).toBe('{"ok":true}');
  });
});
