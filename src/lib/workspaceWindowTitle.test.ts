import { describe, expect, it } from 'vitest';
import { buildWorkspaceWindowTitle, paperDocumentWindowLabel } from './workspaceWindowTitle';

describe('workspace window titles', () => {
  it('moves the active Paper document identity into the native window title without repeating the product name', () => {
    expect(paperDocumentWindowLabel('Sloom Studio — The Studio That Grew Sideways'))
      .toBe('The Studio That Grew Sideways');
    expect(buildWorkspaceWindowTitle('paper', 'Sloom Studio — The Studio That Grew Sideways', true))
      .toBe('Sloom Studio Paper — The Studio That Grew Sideways');
  });

  it('retains the existing edition title outside Paper', () => {
    expect(buildWorkspaceWindowTitle('flow', 'Ignored', true)).toBe('Sloom Studio');
    expect(buildWorkspaceWindowTitle('image', 'Ignored', false)).toBe('Sloom Studio — Community');
  });
});
