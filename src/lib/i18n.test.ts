import { describe, expect, it } from 'vitest';

import {
  MESSAGES,
  normalizeLocale,
  translate,
  translateBoth,
  translateFormat,
  type MessageKey,
} from './i18n';

describe('i18n message catalog', () => {
  it('has both an English and a Japanese string for every key (no gaps)', () => {
    for (const [key, message] of Object.entries(MESSAGES)) {
      expect(message.en, `${key}.en`).toBeTruthy();
      expect(message.ja, `${key}.ja`).toBeTruthy();
    }
  });

  it('translate() follows the requested locale', () => {
    expect(translate('paper.view.spreads', 'en')).toBe('Spreads');
    expect(translate('paper.view.spreads', 'ja')).toBe('見開き');
    expect(translate('settings.language', 'ja')).toBe('言語');
  });

  it('translateBoth() renders both languages regardless of locale', () => {
    // Uses the explicit `both` form when present…
    expect(translateBoth('paper.jp.rtlBinding')).toBe('RTL 右綴じ');
    // …and otherwise joins en · ja.
    expect(translateBoth('paper.view.spreads')).toBe('Spreads · 見開き');
    // A term whose both-form is a single shared token stays compact.
    expect(translateBoth('paper.jp.furigana')).toBe('ルビ');
  });

  it('falls back to the raw key for an unknown lookup', () => {
    expect(translate('nope.missing' as MessageKey, 'en')).toBe('nope.missing');
  });

  it('falls back to English (never undefined) when the locale is missing/invalid', () => {
    // e.g. a server snapshot before the store hydrates — must still return a real string.
    expect(translate('paper.view.spreads', undefined as unknown as 'en')).toBe('Spreads');
    expect(translateFormat('flow.toolbar.addNode', undefined as unknown as 'en', { name: 'X' })).toBe('Add X node');
  });

  it('translateFormat substitutes placeholders with locale-correct word order', () => {
    // English keeps the name mid-sentence; Japanese moves it to the front — interpolation, not concat.
    expect(translateFormat('flow.toolbar.addNode', 'en', { name: 'Image' })).toBe('Add Image node');
    expect(translateFormat('flow.toolbar.addNode', 'ja', { name: 'Image' })).toBe('Imageノードを追加');
  });
});

describe('normalizeLocale', () => {
  it('accepts valid locales and rejects stale/absent values', () => {
    expect(normalizeLocale('ja')).toBe('ja');
    expect(normalizeLocale('en')).toBe('en');
    // Unknown/absent → a valid default (env-dependent, but always a real locale).
    expect(['en', 'ja']).toContain(normalizeLocale('fr'));
    expect(['en', 'ja']).toContain(normalizeLocale(undefined));
  });
});
