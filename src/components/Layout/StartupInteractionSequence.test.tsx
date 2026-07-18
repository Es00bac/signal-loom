// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../lib/i18n';
import { useSettingsStore } from '../../store/settingsStore';
import {
  NOTICE_DAY_STORAGE_KEY,
  releaseCommunityNoticeDayClaim,
} from './communityNoticeDayClaim';
import { StartupInteractionSequence } from './StartupInteractionSequence';

vi.hoisted(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
});

const originalRevalidateLicense = useSettingsStore.getState().revalidateLicense;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function languageGate(): Element | null {
  return document.querySelector('[data-first-run-language-gate]');
}

function communityNotice(): Element | null {
  return document.querySelector('[data-community-notice]');
}

async function renderSequence(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLDivElement);
    root.render(<StartupInteractionSequence />);
  });
}

async function waitForNotice(): Promise<Element> {
  await vi.waitFor(() => expect(communityNotice()).not.toBeNull());
  return communityNotice() as Element;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('navigator', {
    language: 'en-US',
    languages: ['en-US'],
    locks: {
      request: async (_name: string, callback: () => Promise<unknown>) => callback(),
    },
  });
  useSettingsStore.setState({
    settingsHydrated: false,
    locale: 'en',
    localeChosen: false,
    licenseKey: '',
    license: { licensed: false },
    isSettingsOpen: false,
    revalidateLicense: async () => {},
  });
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => mounted.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  releaseCommunityNoticeDayClaim();
  window.localStorage.clear();
  useSettingsStore.setState({
    settingsHydrated: true,
    locale: 'en',
    localeChosen: false,
    licenseKey: '',
    license: { licensed: false },
    isSettingsOpen: false,
    revalidateLicense: originalRevalidateLicense,
  });
});

describe('StartupInteractionSequence (AUD-043)', () => {
  it('waits for hydration, then completes Japanese selection before showing localized Community copy', async () => {
    await renderSequence();
    expect(languageGate()).toBeNull();
    expect(communityNotice()).toBeNull();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBeNull();

    await act(async () => {
      useSettingsStore.setState({ settingsHydrated: true });
    });
    expect(languageGate()).not.toBeNull();
    expect(communityNotice()).toBeNull();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBeNull();

    const japaneseButton = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('日本語'));
    expect(japaneseButton).toBeDefined();
    await act(async () => japaneseButton?.click());

    expect(languageGate()).toBeNull();
    const notice = await waitForNotice();
    expect(languageGate()).toBeNull();
    expect(notice.getAttribute('data-community-notice-locale')).toBe('ja');
    expect(notice.textContent).toContain(translate('communityNotice.title', 'ja'));
    expect(notice.textContent).toContain(
      `${translate('communityNotice.intro', 'ja')}${translate('communityNotice.price', 'ja')}${translate('communityNotice.benefits', 'ja')}`,
    );
    expect(notice.textContent).toContain(translate('communityNotice.buyLicense', 'ja'));
  });

  it('keeps a returning user clear during delayed hydration, then shows only the notice', async () => {
    useSettingsStore.setState({ locale: 'ja', localeChosen: true, settingsHydrated: false });
    await renderSequence();
    expect(languageGate()).toBeNull();
    expect(communityNotice()).toBeNull();

    await act(async () => {
      useSettingsStore.setState({ settingsHydrated: true });
    });
    const notice = await waitForNotice();
    expect(languageGate()).toBeNull();
    expect(notice.getAttribute('data-community-notice-locale')).toBe('ja');
  });

  it('re-renders a visible notice immediately when the locale changes', async () => {
    useSettingsStore.setState({ locale: 'en', localeChosen: true, settingsHydrated: true });
    await renderSequence();
    const englishNotice = await waitForNotice();
    expect(englishNotice.textContent).toContain(translate('communityNotice.buyLicense', 'en'));

    await act(async () => {
      useSettingsStore.getState().setLocale('ja');
    });
    const japaneseNotice = communityNotice();
    expect(japaneseNotice?.getAttribute('data-community-notice-locale')).toBe('ja');
    expect(japaneseNotice?.textContent).toContain(translate('communityNotice.buyLicense', 'ja'));
    expect(languageGate()).toBeNull();
  });

  it('keeps a dismissed notice dismissed for the claimed day after remount', async () => {
    useSettingsStore.setState({ locale: 'en', localeChosen: true, settingsHydrated: true });
    await renderSequence();
    const notice = await waitForNotice();
    const enterKey = [...notice.querySelectorAll('button')]
      .find((button) => button.textContent === translate('communityNotice.enterKey', 'en'));
    expect(enterKey).toBeDefined();
    await act(async () => enterKey?.click());
    expect(communityNotice()).toBeNull();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).not.toBeNull();

    const mounted = root;
    if (!mounted) throw new Error('startup sequence root was not mounted');
    await act(async () => mounted.unmount());
    root = null;
    container?.remove();
    container = null;

    await renderSequence();
    await act(async () => Promise.resolve());
    expect(languageGate()).toBeNull();
    expect(communityNotice()).toBeNull();
  });
});
