import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import { NonRetryableError } from './exponentialBackoff';
import { BACKEND_PROXY_RESULT_ENVELOPE_VERSION } from './backendProxyResultEnvelope';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

/**
 * AUD-013: a valid proxied result must be semantically equivalent to the same direct ExecutionResult.
 * These tests drive the real fetch/executeNodeRequest proxy path — the versioned result envelope must
 * carry MIME/extension/file name, JSON-safe output metadata, a reconstructed Blob, and ordered
 * additionalResults through to the store/envelope consumer, and a processed-but-malformed 200 must
 * never be resubmitted through the retry wrapper.
 */

const V = BACKEND_PROXY_RESULT_ENVELOPE_VERSION;

function proxySettings(overrides: Partial<RuntimeSettingsSnapshot['providerSettings']> = {}): RuntimeSettingsSnapshot {
  return {
    apiKeys: { gemini: '', openai: '', atlas: '', huggingface: '', elevenlabs: '', bfl: '', stability: '' },
    defaultModels: {
      text: { gemini: 'gemini-3-flash-preview', openai: 'gpt-4.1-mini', huggingface: 'Qwen/Qwen3-4B-Instruct-2507' },
      image: {
        gemini: 'gemini-3-pro-image-preview', openai: 'gpt-image-2', atlas: 'gpt-image-2',
        huggingface: 'black-forest-labs/FLUX.1-dev', bfl: 'flux-2-pro', stability: 'stable-image-core',
        localOpen: 'Qwen/Qwen-Image-Edit', android: 'local-dream-active', byteplus: 'seedream-4.5',
      },
      video: { gemini: 'veo-3.1-generate-preview', huggingface: 'Wan-AI/Wan2.2-T2V-A14B', atlas: 'google/veo3.1/text-to-video' },
      audio: { gemini: 'gemini-3.1-flash-tts-preview', elevenlabs: 'eleven_multilingual_v2', huggingface: 'hexgrad/Kokoro-82M' },
    },
    providerSettings: {
      openaiBaseUrl: '', elevenlabsVoiceId: '', renderBackendPreference: 'auto', exportCompositorPreference: 'stage',
      localNativeRenderUrl: 'http://127.0.0.1:41736', backendProxyEnabled: true, backendProxyBaseUrl: 'https://proxy.example',
      geminiCredentialMode: 'api-key', vertexAuthMode: 'gcloud-user', vertexProjectId: '', vertexLocation: 'global',
      vertexQuotaProjectId: '', vertexEnvironmentVariables: '', vertexServiceAccountJson: '',
      paperPrintUpscaleMethod: 'auto', paperPdfRasterPreset: 'balanced-jpeg', localOpenImageEndpointUrl: '',
      localOpenImageAuthHeader: '', localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
      // Keep failure tests immediate and prove no resubmission: retries are configured but must not fire.
      batchMaxRetries: 3, batchRetryBaseDelayMs: 1,
      androidLanServerEnabled: false, androidLanServerPin: '',
      ...overrides,
    },
  } as RuntimeSettingsSnapshot;
}

function imageNode(): AppNode {
  return { id: 'image-proxy-1', type: 'imageGen', position: { x: 0, y: 0 }, data: { provider: 'stability', modelId: 'stable-image-core' } } as AppNode;
}
function textNodeGen(): AppNode {
  return { id: 'text-proxy-1', type: 'textNode', position: { x: 0, y: 0 }, data: { provider: 'gemini', mode: 'model' } } as AppNode;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}
function rawResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

function run(node: AppNode, settings: RuntimeSettingsSnapshot) {
  return executeNodeRequest(node, { prompt: 'a castle at sunrise', config: DEFAULT_EXECUTION_CONFIG }, settings);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('backend proxy result envelope through executeNodeRequest', () => {
  it('preserves ordered multi-image additionalResults with distinct MIME values (previously dropped)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      envelopeVersion: V,
      result: 'data:image/png;base64,AAAA',
      resultType: 'image',
      mimeType: 'image/png',
      statusMessage: 'Generated 3 images',
      additionalResults: [
        { result: 'data:image/webp;base64,BBBB', mimeType: 'image/webp' },
        { result: 'data:image/jpeg;base64,CCCC', mimeType: 'image/jpeg' },
      ],
    })));

    const result = await run(imageNode(), proxySettings());
    expect(result.result).toBe('data:image/png;base64,AAAA');
    expect(result.mimeType).toBe('image/png');
    expect(result.additionalResults).toEqual([
      { result: 'data:image/webp;base64,BBBB', mimeType: 'image/webp' },
      { result: 'data:image/jpeg;base64,CCCC', mimeType: 'image/jpeg' },
    ]);
  });

  it('retains file metadata and nested JSON-safe outputMetadata exactly', async () => {
    const outputMetadata = { width: 2048, height: 1152, layers: [{ name: 'bg' }, { name: 'fg', blend: 'multiply' }] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      envelopeVersion: V,
      result: 'data:application/zip;base64,UEsDBAo=',
      resultType: 'package',
      mimeType: 'application/zip',
      extension: 'zip',
      fileName: 'frames.zip',
      outputMetadata,
    })));

    const result = await run(imageNode(), proxySettings());
    expect(result).toMatchObject({ mimeType: 'application/zip', extension: 'zip', fileName: 'frames.zip' });
    expect(result.outputMetadata).toEqual(outputMetadata);
  });

  it('reconstructs a real Blob from base64 with the correct type and byte length', async () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x7f]);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      envelopeVersion: V,
      result: 'data:video/mp4;base64,AAAA',
      resultType: 'video',
      binary: { encoding: 'base64', mimeType: 'video/mp4', byteLength: bytes.byteLength, data: bytes.toString('base64') },
    })));

    const result = await run(imageNode(), proxySettings());
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob?.type).toBe('video/mp4');
    expect(result.blob?.size).toBe(bytes.byteLength);
    expect(new Uint8Array(await result.blob!.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it('carries a text result with status and usage through unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      envelopeVersion: V,
      result: 'Once upon a time',
      resultType: 'text',
      statusMessage: 'Generated with gemini-3-flash',
      usage: { source: 'actual', confidence: 'measured', inputTokens: 4, outputTokens: 12 },
    })));

    const result = await run(textNodeGen(), proxySettings());
    expect(result).toMatchObject({
      result: 'Once upon a time',
      resultType: 'text',
      statusMessage: 'Generated with gemini-3-flash',
      usage: { inputTokens: 4, outputTokens: 12 },
    });
  });

  it('still accepts the legacy unversioned single-asset response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      result: 'data:image/png;base64,Q09SRQ==', resultType: 'image', statusMessage: 'Generated through backend proxy',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await run(imageNode(), proxySettings());
    expect(result.result).toBe('data:image/png;base64,Q09SRQ==');
    expect(result.additionalResults).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('backend proxy result envelope — processed terminal responses call the proxy exactly once', () => {
  it.each<[string, Response | (() => Response)]>([
    ['malformed JSON', () => rawResponse('{"result":true')],
    ['truncated JSON', () => rawResponse('{')],
    ['wrong top-level schema', () => jsonResponse([])],
    ['unknown envelope version', () => jsonResponse({ envelopeVersion: 999, result: 'x', resultType: 'text' })],
    ['wrong result type for asset', () => jsonResponse({ envelopeVersion: V, result: 'not-a-url', resultType: 'image' })],
    ['invalid base64 binary', () => jsonResponse({ envelopeVersion: V, result: 'data:image/png;base64,AA==', resultType: 'image', binary: { encoding: 'base64', mimeType: 'image/png', byteLength: 3, data: '@@@@' } })],
    ['byte-length mismatch', () => jsonResponse({ envelopeVersion: V, result: 'data:image/png;base64,AA==', resultType: 'image', binary: { encoding: 'base64', mimeType: 'image/png', byteLength: 99, data: 'AAAA' } })],
    ['malformed metadata', () => jsonResponse({ envelopeVersion: V, result: '{}', resultType: 'json', outputMetadata: [1, 2] })],
    ['tempting fields in an error payload', () => jsonResponse({ envelopeVersion: V, error: 'provider rejected', result: 'data:image/png;base64,AAAA', resultType: 'image', additionalResults: [{ result: 'data:image/png;base64,BBBB' }] })],
    ['legacy payload claiming a Blob', () => jsonResponse({ result: 'data:image/png;base64,AAAA', resultType: 'image', binary: { encoding: 'base64', mimeType: 'image/png', byteLength: 2, data: 'AQI=' } })],
  ])('rejects %s without resubmitting the job', async (_label, makeResponse) => {
    const fetchMock = vi.fn(async () => (typeof makeResponse === 'function' ? makeResponse() : makeResponse));
    vi.stubGlobal('fetch', fetchMock);

    await expect(run(imageNode(), proxySettings({ batchMaxRetries: 3 }))).rejects.toBeInstanceOf(NonRetryableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a well-formed provider error as a terminal failure with a single call', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ envelopeVersion: V, error: 'content policy violation', result: 'x', resultType: 'text' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(run(textNodeGen(), proxySettings({ batchMaxRetries: 3 })))
      .rejects.toThrow(/content policy violation/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
