import type { WorkspaceView } from '../types/flow';

const SLOOM_STUDIO_PAPER_PREFIX = /^sloom studio(?: paper)?\s*(?:[—–-]|:)\s*/i;

export function paperDocumentWindowLabel(title: string): string {
  const normalized = title.trim().replace(SLOOM_STUDIO_PAPER_PREFIX, '').trim();
  return normalized || 'Untitled Paper Layout';
}

export function buildWorkspaceWindowTitle(
  workspaceView: WorkspaceView,
  paperDocumentTitle: string,
  licenseIsCommercial: boolean,
): string {
  if (workspaceView === 'paper') {
    return `Sloom Studio Paper — ${paperDocumentWindowLabel(paperDocumentTitle)}`;
  }
  return licenseIsCommercial ? 'Sloom Studio' : 'Sloom Studio — Community';
}
