import { describe, expect, it } from 'vitest';
import { formatFontFamily, formatSingleFontFamily } from './formatFontFamily';

describe('formatSingleFontFamily', () => {
  it('leaves generic keyword families unquoted', () => {
    expect(formatSingleFontFamily('serif')).toBe('serif');
    expect(formatSingleFontFamily('sans-serif')).toBe('sans-serif');
    expect(formatSingleFontFamily('monospace')).toBe('monospace');
    expect(formatSingleFontFamily('system-ui')).toBe('system-ui');
    expect(formatSingleFontFamily('ui-sans-serif')).toBe('ui-sans-serif');
    expect(formatSingleFontFamily('math')).toBe('math');
  });

  it('leaves simple single-word identifiers unquoted', () => {
    expect(formatSingleFontFamily('Inter')).toBe('Inter');
    expect(formatSingleFontFamily('Impact')).toBe('Impact');
    expect(formatSingleFontFamily('Cormorant_Garamond')).toBe('Cormorant_Garamond');
  });

  it('quotes family names that contain whitespace', () => {
    expect(formatSingleFontFamily('M PLUS 1')).toBe('"M PLUS 1"');
    expect(formatSingleFontFamily('Source Sans 3')).toBe('"Source Sans 3"');
    expect(formatSingleFontFamily('M PLUS Rounded 1c')).toBe('"M PLUS Rounded 1c"');
  });

  it('quotes family names that start with digits or contain punctuation', () => {
    expect(formatSingleFontFamily('Source Serif 4')).toBe('"Source Serif 4"');
    expect(formatSingleFontFamily('19th Century')).toBe('"19th Century"');
  });

  it('escapes embedded quotes and backslashes', () => {
    expect(formatSingleFontFamily('Weird "Quoted" Font')).toBe('"Weird \\"Quoted\\" Font"');
    expect(formatSingleFontFamily('Back\\slash')).toBe('"Back\\\\slash"');
  });

  it('trims surrounding whitespace', () => {
    expect(formatSingleFontFamily('  Inter  ')).toBe('Inter');
    expect(formatSingleFontFamily('  Source Sans 3  ')).toBe('"Source Sans 3"');
  });
});

describe('formatFontFamily', () => {
  it('serializes fallback stacks with per-family quoting', () => {
    expect(formatFontFamily('M PLUS 1, Inter, sans-serif')).toBe('"M PLUS 1", Inter, sans-serif');
    expect(formatFontFamily('Source Sans 3,system-ui,sans-serif')).toBe('"Source Sans 3", system-ui, sans-serif');
  });

  it('serializes the shipped problematic bundled families correctly', () => {
    const cases = [
      { input: 'M PLUS 1', output: '"M PLUS 1"' },
      { input: 'M PLUS 2', output: '"M PLUS 2"' },
      { input: 'M PLUS Rounded 1c', output: '"M PLUS Rounded 1c"' },
      { input: 'Source Sans 3', output: '"Source Sans 3"' },
      { input: 'Source Serif 4', output: '"Source Serif 4"' },
    ];
    for (const { input, output } of cases) {
      expect(formatFontFamily(input)).toBe(output);
    }
  });
});
