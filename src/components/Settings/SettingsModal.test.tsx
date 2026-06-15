import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { DEFAULT_PROVIDER_SETTINGS } from '../../lib/providerCatalog';

let mockSettingsPanel: 'providers' | 'keyboard' | 'gamepad' = 'providers';

vi.mock('../DockablePanel', () => ({
  DockableDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../store/settingsStore', async () => {
  const actual = await vi.importActual<typeof import('../../store/settingsStore')>('../../store/settingsStore');

  return {
    ...actual,
    getApiKeyStorageStatus: () => ({
      storageMedium: 'local-storage' as const,
      encryptedAtRest: false,
      caveat: 'API keys are stored in browser localStorage without at-rest encryption in this app.',
    }),
    useSettingsStore: () => ({
      isSettingsOpen: true,
      settingsPanel: mockSettingsPanel,
      apiKeys: {
        openai: '',
        gemini: '',
        huggingface: '',
        elevenlabs: '',
        bfl: '',
        stability: '',
      },
      defaultModels: { text: {}, image: {}, video: {}, audio: {} },
      keyboardShortcuts: {},
      providerSettings: {
        ...DEFAULT_PROVIDER_SETTINGS,
        batchMaxRetries: 7,
        batchRetryBaseDelayMs: 42000,
      },
      setProviderSetting: vi.fn(),
      setDefaultModel: vi.fn(),
      setKeyboardShortcut: vi.fn(),
      resetKeyboardShortcuts: vi.fn(),
      openSettings: vi.fn((panel?: 'providers' | 'keyboard' | 'gamepad') => {
        mockSettingsPanel = panel ?? 'providers';
      }),
      toggleSettings: vi.fn(),
    }),
  };
});

describe('SettingsModal', () => {
  it('displays API key storage readiness caveat in provider mode', () => {
    mockSettingsPanel = 'providers';
    const html = renderToStaticMarkup(<SettingsModal />);

    expect(html).toContain('Keys are');
    expect(html).toContain('local-storage');
    expect(html).toContain('not encrypted');
  });

  it('renders numeric inputs for batch generation retry configuration', () => {
    mockSettingsPanel = 'providers';
    const html = renderToStaticMarkup(<SettingsModal />);

    expect(html).toContain('Batch max retries');
    expect(html).toContain('value="7"');

    expect(html).toContain('Batch retry base delay (ms)');
    expect(html).toContain('value="42000"');
    expect(html).toContain('Local native render token');
    expect(html).toContain('Matches SIGNAL_LOOM_NATIVE_RENDER_TOKEN');
  });
});
