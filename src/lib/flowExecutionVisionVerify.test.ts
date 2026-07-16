import { describe, expect, it, vi } from 'vitest';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import { resolveFlowNodePorts } from './flowNodeContracts';
import { executeNodeRequest } from './flowExecution';

const response = vi.hoisted(() => ({ text: 'true\nThe subject matches the reference.' }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => ({ text: response.text, usageMetadata: {} }),
    };
  },
}));

const settings = {
  apiKeys: { gemini: 'test-key' },
  providerSettings: {
    backendProxyEnabled: false,
    batchMaxRetries: 0,
    batchRetryBaseDelayMs: 1,
    geminiCredentialMode: 'api-key',
  },
} as RuntimeSettingsSnapshot;

function visionVerifyNode(): AppNode {
  return {
    id: 'verify',
    type: 'visionVerifyNode',
    position: { x: 0, y: 0 },
    data: { modelId: 'gemini-3.5-flash' },
  } as AppNode;
}

describe('Vision Verify execution contract', () => {
  it.each([
    ['true', 'The subject matches the reference.', true],
    ['false', 'The subject does not match the reference.', false],
  ])('emits %s as a Boolean at the executor-to-port boundary', async (decision, explanation, expected) => {
    response.text = `${decision}\n${explanation}`;
    const node = visionVerifyNode();

    const execution = await executeNodeRequest(node, {
      prompt: 'Check the character design.',
      editImageInput: 'data:image/png;base64,U1VCSkVDVA==',
      config: DEFAULT_EXECUTION_CONFIG,
    }, settings);

    const output = resolveFlowNodePorts({ node, nodes: [node], edges: [] })
      .find((port) => port.direction === 'output');

    expect(output?.types).toEqual([{ kind: 'boolean' }]);
    expect(execution).toMatchObject({ result: expected, resultType: 'boolean' });
    expect(typeof execution.result).toBe('boolean');
    expect(execution.usage?.notes).toContain(explanation);
  });
});
