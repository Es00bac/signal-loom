import { describe, expect, it } from 'vitest';
import { hasPaperFolioToken, resolvePaperFolioText } from './paperFolios';

describe('resolvePaperFolioText', () => {
  it('replaces page and pages tokens (both spellings)', () => {
    expect(resolvePaperFolioText('Page {page} of {pages}', 3, 12)).toBe('Page 3 of 12');
    expect(resolvePaperFolioText('{#} / {##}', 7, 40)).toBe('7 / 40');
  });

  it('returns text unchanged when there is no token', () => {
    expect(resolvePaperFolioText('No markers here', 3, 12)).toBe('No markers here');
    expect(resolvePaperFolioText('', 3, 12)).toBe('');
  });

  it('rounds and floors negative values', () => {
    expect(resolvePaperFolioText('{page}', 4.6, 9.2)).toBe('5');
    expect(resolvePaperFolioText('{pages}', 1, -3)).toBe('0');
  });
});

describe('hasPaperFolioToken', () => {
  it('detects any folio token', () => {
    expect(hasPaperFolioToken('Footer {page}')).toBe(true);
    expect(hasPaperFolioToken('Total {##}')).toBe(true);
    expect(hasPaperFolioToken('plain footer')).toBe(false);
    expect(hasPaperFolioToken(undefined)).toBe(false);
  });
});
