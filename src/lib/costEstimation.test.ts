import { describe, expect, it } from 'vitest';
import {
  estimateElevenLabsTtsCostUsd,
  estimateExecutionPlan,
  estimateGeminiTextCostUsd,
  estimateGeminiVideoCostUsd,
} from './costEstimation';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

function createNode(id: string, type: AppNode['type'], data: AppNode['data'] = {}): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as AppNode;
}

const settings: RuntimeSettingsSnapshot = {
  apiKeys: {
    openai: '',
    gemini: 'key',
    huggingface: '',
    elevenlabs: '',
  },
  defaultModels: {
    text: {
      gemini: 'gemini-2.5-flash',
      openai: 'gpt-4o-mini',
      huggingface: 'hf-text',
    },
    image: {
      gemini: 'gemini-2.5-flash-image',
      openai: 'gpt-image-1',
      huggingface: 'hf-image',
    },
    video: {
      gemini: 'veo-3.1-fast-generate-preview',
      huggingface: 'hf-video',
    },
    audio: {
      gemini: 'gemini-2.5-flash-preview-tts',
      elevenlabs: 'eleven_multilingual_v2',
      huggingface: 'hf-audio',
    },
  },
  providerSettings: {
    openaiBaseUrl: '',
    elevenlabsVoiceId: '',
    renderBackendPreference: 'browser',
    localNativeRenderUrl: '',
    backendProxyEnabled: false,
    backendProxyBaseUrl: '',
  },
};

describe('estimateGeminiTextCostUsd', () => {
  it('estimates Gemini 2.5 Flash text cost from input and output tokens', () => {
    expect(
      estimateGeminiTextCostUsd('gemini-2.5-flash', {
        inputTokens: 1000,
        outputTokens: 500,
      }),
    ).toBeCloseTo(0.00155, 6);
  });
});

describe('estimateGeminiVideoCostUsd', () => {
  it('estimates Veo 3.1 Fast 720p cost from duration', () => {
    expect(estimateGeminiVideoCostUsd('veo-3.1-fast-generate-preview', 4, '720p')).toBeCloseTo(0.6, 6);
  });

  it('normalizes legacy Veo aliases before estimating cost', () => {
    expect(estimateGeminiVideoCostUsd('veo-3.1-fast', 4, '720p')).toBeCloseTo(0.6, 6);
  });
});

describe('estimateElevenLabsTtsCostUsd', () => {
  it('estimates Multilingual v2 and Eleven v3 cost from characters', () => {
    expect(estimateElevenLabsTtsCostUsd('eleven_multilingual_v2', 1200)).toBeCloseTo(0.12, 6);
    expect(estimateElevenLabsTtsCostUsd('eleven_v3', 1200)).toBeCloseTo(0.12, 6);
  });
});

describe('estimateExecutionPlan', () => {
  it('treats virtual nodes as aliases of their linked source when estimating downstream runs', () => {
    const nodes = [
      createNode('text-1', 'textNode', {
        mode: 'prompt',
        prompt: 'A gold robot walking through fog',
      }),
      createNode('virtual-1', 'virtual'),
      createNode('image-1', 'imageGen', {
        provider: 'gemini',
        modelId: 'gemini-2.5-flash-image',
      }),
    ];

    const estimate = estimateExecutionPlan(
      'image-1',
      nodes,
      [
        { id: 'edge-1', source: 'text-1', target: 'virtual-1' },
        { id: 'edge-2', source: 'virtual-1', target: 'image-1' },
      ],
      settings,
    );

    expect(estimate.nodeIds).toEqual(['text-1', 'image-1']);
    expect(estimate.rollup.imageCount).toBe(1);
  });
});
