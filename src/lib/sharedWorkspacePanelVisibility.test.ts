import { describe, expect, it } from 'vitest';
import { shouldShowSharedWorkspacePanels } from './sharedWorkspacePanelVisibility';

describe('shared workspace panel visibility', () => {
  it('keeps shared panels on desktop Paper and Image workspaces', () => {
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: false,
      mobilePhoneInterfaceEnabled: false,
      workspaceView: 'paper',
    })).toBe(true);
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: false,
      mobilePhoneInterfaceEnabled: false,
      workspaceView: 'image',
    })).toBe(true);
  });

  it('suppresses legacy shared panels on phone Paper and Image workspaces', () => {
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: false,
      mobilePhoneInterfaceEnabled: true,
      workspaceView: 'paper',
    })).toBe(false);
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: false,
      mobilePhoneInterfaceEnabled: true,
      workspaceView: 'image',
    })).toBe(false);
  });

  it('keeps Flow source and bookmark panels available on phones unless chrome is hidden', () => {
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: false,
      mobilePhoneInterfaceEnabled: true,
      workspaceView: 'flow',
    })).toBe(true);
    expect(shouldShowSharedWorkspacePanels({
      applicationChromeHidden: true,
      mobilePhoneInterfaceEnabled: true,
      workspaceView: 'flow',
    })).toBe(false);
  });
});
