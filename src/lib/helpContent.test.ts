import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, getHelpSection } from './helpContent';

describe('help content', () => {
  it('provides project documentation, tutorial, feature help, and shortcuts sections', () => {
    expect(HELP_SECTIONS.map((section) => section.id)).toEqual([
      'project-documentation',
      'tutorial',
      'feature-help',
      'keyboard-shortcuts',
    ]);
  });

  it('keeps help menu sections populated with actionable content', () => {
    expect(getHelpSection('tutorial').groups.length).toBeGreaterThan(2);
    expect(getHelpSection('feature-help').groups.length).toBeGreaterThan(3);
    expect(getHelpSection('project-documentation').summary).toContain('Signal Loom');
  });
});
