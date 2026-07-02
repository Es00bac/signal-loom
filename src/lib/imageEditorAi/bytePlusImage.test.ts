import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { runBytePlusImage } from './bytePlusImage';
import type { GenerativeFillRequest } from '../imageEditorAi';

function baseRequest(overrides: Partial<GenerativeFillRequest> = {}): GenerativeFillRequest {
  return {
    source: new Blob(['source']),
    mask: new Blob(['mask']),
    prompt: 'a cozy cabin in the woods',
    provider: 'byteplus',
    ...overrides,
  };
}

describe('runBytePlusImage', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      apiKeys: { ...useSettingsStore.getState().apiKeys, byteplus: 'test-byteplus-key' },
    });
  });

  it('rejects requests carrying reference images instead of silently dropping them', async () => {
    // BytePlus/Seedream has no confirmed edit/reference endpoint in this app yet (see
    // flowExecution.ts's byteplus case + bytePlusImage.ts docs) — a populated `references`
    // array must fail loudly rather than silently generate a reference-free image.
    await expect(runBytePlusImage(baseRequest({
      references: [{ id: 'ref-1', imageUrl: 'blob:ref-1' }],
    }))).rejects.toThrow(/reference-image endpoint/i);
  });

  it('requires an API key before doing anything else', async () => {
    useSettingsStore.setState({
      apiKeys: { ...useSettingsStore.getState().apiKeys, byteplus: '' },
    });
    await expect(runBytePlusImage(baseRequest())).rejects.toThrow(/API key not configured/i);
  });
});
