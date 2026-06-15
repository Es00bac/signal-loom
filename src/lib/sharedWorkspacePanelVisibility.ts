import type { WorkspaceView } from '../types/flow';

export interface SharedWorkspacePanelVisibilityInput {
  applicationChromeHidden: boolean;
  mobilePhoneInterfaceEnabled: boolean;
  workspaceView: WorkspaceView;
}

export function shouldShowSharedWorkspacePanels({
  applicationChromeHidden,
  mobilePhoneInterfaceEnabled,
  workspaceView,
}: SharedWorkspacePanelVisibilityInput): boolean {
  if (workspaceView === 'editor' || applicationChromeHidden) {
    return false;
  }

  if (mobilePhoneInterfaceEnabled && (workspaceView === 'image' || workspaceView === 'paper')) {
    return false;
  }

  return true;
}
