import './test-setup-window';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultGamepadBindings } from '../lib/gamepadBindings';
import type { OpenFontLibraryFace } from '../lib/paperOpenFontCatalog';
import { DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS } from '../lib/providerCatalog';
import { decryptSettingsBackup, encryptSettingsBackup } from '../lib/settingsBackup';
import { useSettingsStore } from './settingsStore';

const PASSPHRASE = 'portable settings test passphrase';

type SettingsState = ReturnType<typeof useSettingsStore.getState>;

type SettingsPersistOptions = {
  merge?: (persistedState: unknown, currentState: SettingsState) => SettingsState;
};

type PersistableSettingsStore = typeof useSettingsStore & {
  persist?: {
    getOptions?: () => SettingsPersistOptions;
  };
};

function openFontLibraryFace(): OpenFontLibraryFace {
  const fontSha256 = 'a'.repeat(64);
  const licenseSha256 = 'b'.repeat(64);
  return {
    subset: 'latin',
    retrievedAt: 1234,
    face: {
      id: 'open-example-sans-latin-400-normal',
      familyId: 'example sans',
      familyName: 'Example Sans',
      postscriptName: 'ExampleSans-Regular',
      weight: 400,
      style: 'normal',
      stretchPercent: 100,
      collectionIndex: 0,
      variableAxes: {},
      unicodeRanges: [{ start: 0x20, end: 0x7e }],
      format: 'truetype',
      fontAsset: { id: `sha256:${fontSha256}`, sha256: fontSha256, mimeType: 'font/ttf', byteLength: 4 },
      embeddability: 'unknown',
      canSubset: true,
      source: {
        kind: 'open-catalog',
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/example-sans@1.2.3/latin-400-normal.ttf',
        version: '1.2.3',
      },
      license: {
        id: 'OFL-1.1',
        textAsset: { id: `sha256:${licenseSha256}`, sha256: licenseSha256, mimeType: 'text/plain', byteLength: 4 },
      },
    },
  };
}

function legacyBackupData() {
  return {
    apiKeys: { openai: 'legacy-openai-key' },
    defaultModels: DEFAULT_MODELS,
    providerSettings: DEFAULT_PROVIDER_SETTINGS,
    interfaceThemeId: 'high-contrast',
    keyboardShortcuts: {},
    gamepadBindings: createDefaultGamepadBindings(),
    customBrushPresets: [],
    customCropPresets: [],
    licenseKey: '',
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useSettingsStore.setState({
    apiKeys: { openai: '', gemini: '', huggingface: '', elevenlabs: '', bfl: '', stability: '', atlas: '', byteplus: '' },
    defaultModels: DEFAULT_MODELS,
    defaultImageNodeModel: null,
    providerSettings: DEFAULT_PROVIDER_SETTINGS,
    interfaceThemeId: 'default',
    appMenuStyle: 'compact',
    interfaceDensity: 'compact',
    locale: 'en',
    localeChosen: false,
    keyboardShortcuts: {},
    gamepadBindings: createDefaultGamepadBindings(),
    customBrushPresets: [],
    customCropPresets: [],
    openFontLibrary: [],
    isSettingsOpen: false,
    settingsPanel: 'providers',
    licenseKey: '',
    license: { licensed: false },
  });
});

describe('portable encrypted settings backup schema (AUD-042)', () => {
  it('exports, decrypts, and imports every declared user-meaningful persisted setting', async () => {
    const font = openFontLibraryFace();
    const gamepadBindings = createDefaultGamepadBindings();
    gamepadBindings.flow.buttonSouth = {
      ...gamepadBindings.flow.buttonSouth,
      command: 'file:open',
      sensitivity: 1.25,
    };
    useSettingsStore.setState({
      apiKeys: { ...useSettingsStore.getState().apiKeys, openai: 'sk-portable' },
      defaultModels: {
        ...DEFAULT_MODELS,
        text: { ...DEFAULT_MODELS.text, openai: 'gpt-portable-preference' },
      },
      defaultImageNodeModel: { provider: 'atlas', modelId: 'black-forest-labs/flux-schnell' },
      providerSettings: {
        ...DEFAULT_PROVIDER_SETTINGS,
        atlasBaseUrl: 'https://portable.example.test',
        batchMaxRetries: 4,
      },
      interfaceThemeId: 'high-contrast',
      appMenuStyle: 'menubar',
      interfaceDensity: 'comfortable',
      locale: 'ja',
      localeChosen: true,
      keyboardShortcuts: { 'file:new': 'Ctrl+Alt+Shift+N' },
      gamepadBindings,
      openFontLibrary: [font],
      isSettingsOpen: true,
      settingsPanel: 'fonts',
    });
    useSettingsStore.getState().saveCustomBrushPreset('Portable Brush', { size: 17, opacity: 0.61 });
    useSettingsStore.getState().saveCustomCropPreset('Portable Crop', 1.91);

    const source = useSettingsStore.getState();
    const expectedPortableState = structuredClone({
      apiKeys: source.apiKeys,
      defaultModels: source.defaultModels,
      defaultImageNodeModel: source.defaultImageNodeModel,
      providerSettings: source.providerSettings,
      interfaceThemeId: source.interfaceThemeId,
      appMenuStyle: source.appMenuStyle,
      interfaceDensity: source.interfaceDensity,
      locale: source.locale,
      localeChosen: source.localeChosen,
      keyboardShortcuts: source.keyboardShortcuts,
      gamepadBindings: source.gamepadBindings,
      customBrushPresets: source.customBrushPresets,
      customCropPresets: source.customCropPresets,
      openFontLibrary: source.openFontLibrary,
      licenseKey: source.licenseKey,
    });

    const encrypted = await useSettingsStore.getState().exportSettingsBackup(PASSPHRASE);
    const data = JSON.parse(await decryptSettingsBackup(encrypted, PASSPHRASE)) as Record<string, unknown>;

    expect(Object.keys(data).sort()).toEqual([
      'apiKeys',
      'appMenuStyle',
      'customBrushPresets',
      'customCropPresets',
      'defaultImageNodeModel',
      'defaultModels',
      'gamepadBindings',
      'interfaceDensity',
      'interfaceThemeId',
      'keyboardShortcuts',
      'licenseKey',
      'locale',
      'localeChosen',
      'openFontLibrary',
      'providerSettings',
      'schemaVersion',
    ]);
    expect(data).toEqual({ schemaVersion: 1, ...expectedPortableState });
    expect(data).not.toHaveProperty('isSettingsOpen');
    expect(data).not.toHaveProperty('settingsPanel');
    expect(data).not.toHaveProperty('settingsHydrated');
    expect(data).not.toHaveProperty('license');

    useSettingsStore.setState({
      apiKeys: { ...useSettingsStore.getState().apiKeys, openai: '' },
      defaultModels: DEFAULT_MODELS,
      defaultImageNodeModel: null,
      providerSettings: DEFAULT_PROVIDER_SETTINGS,
      interfaceThemeId: 'default',
      appMenuStyle: 'compact',
      interfaceDensity: 'compact',
      locale: 'en',
      localeChosen: false,
      keyboardShortcuts: {},
      gamepadBindings: createDefaultGamepadBindings(),
      customBrushPresets: [],
      customCropPresets: [],
      openFontLibrary: [],
    });

    await expect(useSettingsStore.getState().importSettingsBackup(encrypted, PASSPHRASE))
      .resolves.toMatchObject({ status: 'committed' });
    const imported = useSettingsStore.getState();
    expect({
      apiKeys: imported.apiKeys,
      defaultModels: imported.defaultModels,
      defaultImageNodeModel: imported.defaultImageNodeModel,
      providerSettings: imported.providerSettings,
      interfaceThemeId: imported.interfaceThemeId,
      appMenuStyle: imported.appMenuStyle,
      interfaceDensity: imported.interfaceDensity,
      locale: imported.locale,
      localeChosen: imported.localeChosen,
      keyboardShortcuts: imported.keyboardShortcuts,
      gamepadBindings: imported.gamepadBindings,
      customBrushPresets: imported.customBrushPresets,
      customCropPresets: imported.customCropPresets,
      openFontLibrary: imported.openFontLibrary,
      licenseKey: imported.licenseKey,
    }).toEqual(expectedPortableState);
    expect(imported).toMatchObject({
      isSettingsOpen: true,
      settingsPanel: 'fonts',
    });
  });

  it('sanitizes hostile portable preference fields exactly like persisted settings hydration', async () => {
    const font = openFontLibraryFace();
    const hostile = {
      schemaVersion: 1,
      ...legacyBackupData(),
      defaultImageNodeModel: { provider: 'foreign-provider', modelId: ['not-a-string'] },
      appMenuStyle: 'floating',
      interfaceDensity: 'microscopic',
      locale: 'xx',
      localeChosen: 'yes',
      openFontLibrary: [font, { face: { source: { kind: 'open-catalog' } } }],
      isSettingsOpen: true,
      settingsPanel: 'license',
    };
    const merge = (useSettingsStore as PersistableSettingsStore).persist?.getOptions?.().merge;
    expect(merge).toBeTypeOf('function');
    const hydrated = merge?.(hostile, useSettingsStore.getState());

    const encrypted = await encryptSettingsBackup(JSON.stringify(hostile), PASSPHRASE);
    await expect(useSettingsStore.getState().importSettingsBackup(encrypted, PASSPHRASE))
      .resolves.toMatchObject({ status: 'committed' });

    const imported = useSettingsStore.getState();
    expect({
      defaultImageNodeModel: imported.defaultImageNodeModel,
      appMenuStyle: imported.appMenuStyle,
      interfaceDensity: imported.interfaceDensity,
      locale: imported.locale,
      localeChosen: imported.localeChosen,
      openFontLibrary: imported.openFontLibrary,
    }).toEqual({
      defaultImageNodeModel: hydrated?.defaultImageNodeModel,
      appMenuStyle: hydrated?.appMenuStyle,
      interfaceDensity: hydrated?.interfaceDensity,
      locale: hydrated?.locale,
      localeChosen: hydrated?.localeChosen,
      openFontLibrary: hydrated?.openFontLibrary,
    });
    expect(imported).toMatchObject({
      defaultImageNodeModel: null,
      appMenuStyle: 'compact',
      interfaceDensity: 'compact',
      locale: 'en',
      localeChosen: false,
      openFontLibrary: [font],
      isSettingsOpen: false,
      settingsPanel: 'providers',
    });
  });

  it('imports a legacy schema-less backup without erasing preferences that older builds could not carry', async () => {
    const font = openFontLibraryFace();
    useSettingsStore.setState({
      defaultImageNodeModel: { provider: 'bfl', modelId: 'flux-2-pro' },
      appMenuStyle: 'menubar',
      interfaceDensity: 'comfortable',
      locale: 'ja',
      localeChosen: true,
      openFontLibrary: [font],
    });
    const encrypted = await encryptSettingsBackup(JSON.stringify(legacyBackupData()), PASSPHRASE);

    await expect(useSettingsStore.getState().importSettingsBackup(encrypted, PASSPHRASE))
      .resolves.toMatchObject({ status: 'committed' });
    expect(useSettingsStore.getState()).toMatchObject({
      apiKeys: expect.objectContaining({ openai: 'legacy-openai-key' }),
      defaultImageNodeModel: { provider: 'bfl', modelId: 'flux-2-pro' },
      appMenuStyle: 'menubar',
      interfaceDensity: 'comfortable',
      locale: 'ja',
      localeChosen: true,
      openFontLibrary: [font],
    });
  });
});
