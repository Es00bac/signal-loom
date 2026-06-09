import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { DEFAULT_PROVIDER_SETTINGS } from '../../lib/providerCatalog';

vi.mock('../DockablePanel', () => ({
  DockableDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: () => ({
    isSettingsOpen: true,
    settingsPanel: 'providers',
    apiKeys: {
      openai: '',
      gemini: '',
      huggingface: '',
      elevenlabs: '',
      bfl: '',
      stability: '',
    },
    defaultModels: { text: {}, image: {}, video: {}, audio: {} },
    providerSettings: {
      ...DEFAULT_PROVIDER_SETTINGS,
      batchMaxRetries: 7,
      batchRetryBaseDelayMs: 42000,
    },
    setProviderSetting: vi.fn(),
    setDefaultModel: vi.fn(),
    toggleSettings: vi.fn(),
  }),
}));

describe('SettingsModal', () => {
  it('renders numeric inputs for batch generation retry configuration', () => {
    const html = renderToStaticMarkup(<SettingsModal />);

    expect(html).toContain('Batch max retries');
    expect(html).toContain('value="7"');

    expect(html).toContain('Batch retry base delay (ms)');
    expect(html).toContain('value="42000"');
    expect(html).toContain('Local native render token');
    expect(html).toContain('Matches SIGNAL_LOOM_NATIVE_RENDER_TOKEN');
  });
});
