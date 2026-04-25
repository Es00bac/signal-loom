import { describe, expect, it } from 'vitest';
import type { FlowNodeType } from '../types/flow';
import { getNodeTheme } from './nodeTheme';

describe('getNodeTheme', () => {
  it('assigns a distinct accent color to every node type', () => {
    const nodeTypes: FlowNodeType[] = [
      'textNode',
      'imageGen',
      'videoGen',
      'audioGen',
      'settings',
      'composition',
      'sourceBin',
      'virtual',
    ];
    const accents = nodeTypes.map((type) => getNodeTheme(type).accentColor);

    expect(new Set(accents).size).toBe(nodeTypes.length);
  });

  it('keeps themed nodes on the dark visual system', () => {
    const theme = getNodeTheme('videoGen');

    expect(theme.containerClassName).toContain('bg-');
    expect(theme.headerClassName).toContain('border-');
    expect(theme.iconClassName).toContain('text-');
  });
});
