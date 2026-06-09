import { describe, expect, it } from 'vitest';

import {
  createWorkspaceWindowCommandEnvelope,
  getWorkspaceWindowCommandForWorkspace,
  mergeSourceBinItemsIntoBins,
  removeSourceBinItemFromBins,
  renameSourceBinItemInBins,
  shouldRunFlowOwnedSourceBinIngest,
} from './workspaceWindowCommands';
import type { SourceBin, SourceBinLibraryItem } from '../store/sourceBinStore';

function item(id: string): SourceBinLibraryItem {
  return {
    id,
    label: id,
    kind: 'image',
    mimeType: 'image/png',
    assetUrl: `data:image/png;base64,${id}`,
    createdAt: 1,
  };
}

function bin(items: SourceBinLibraryItem[], id = 'default'): SourceBin {
  return {
    id,
    name: id,
    items,
    collapsed: false,
    createdAt: 1,
  };
}

describe('workspace window commands', () => {
  it('ignores commands from the same renderer and commands for another workspace', () => {
    const ownEnvelope = createWorkspaceWindowCommandEnvelope('sender-a', {
      type: 'source-bin-items-added',
      targetWorkspace: 'paper',
      items: [item('image-1')],
    });
    const otherEnvelope = createWorkspaceWindowCommandEnvelope('sender-b', {
      type: 'source-bin-items-added',
      targetWorkspace: 'image',
      items: [item('image-1')],
    });

    expect(getWorkspaceWindowCommandForWorkspace(ownEnvelope, 'sender-a', 'paper')).toBeUndefined();
    expect(getWorkspaceWindowCommandForWorkspace(otherEnvelope, 'sender-a', 'paper')).toBeUndefined();
    expect(getWorkspaceWindowCommandForWorkspace(otherEnvelope, 'sender-a', 'image')).toEqual(otherEnvelope.command);
  });

  it('merges incoming source-bin items without replacing the local library', () => {
    const current = [bin([item('local-1'), item('local-2')])];
    const next = mergeSourceBinItemsIntoBins(current, [item('remote-1'), item('local-1')]);

    expect(next[0].items.map((sourceItem) => sourceItem.id)).toEqual([
      'remote-1',
      'local-1',
      'local-2',
    ]);
  });

  it('expands the target source bin when incoming items are added', () => {
    const current = [{ ...bin([item('local-1')]), collapsed: true }];
    const next = mergeSourceBinItemsIntoBins(current, [item('remote-1')]);

    expect(next[0].collapsed).toBe(false);
    expect(next[0].items.map((sourceItem) => sourceItem.id)).toEqual(['remote-1', 'local-1']);
  });

  it('skips incoming source-bin items that already exist under the same source key', () => {
    const current = [bin([{ ...item('local-1'), sourceKey: 'image:node-1:asset-a' }])];
    const next = mergeSourceBinItemsIntoBins(current, [
      { ...item('remote-duplicate'), sourceKey: 'image:node-1:asset-a' },
      { ...item('remote-2'), sourceKey: 'image:node-2:asset-b' },
    ]);

    expect(next[0].items.map((sourceItem) => sourceItem.id)).toEqual([
      'remote-2',
      'local-1',
    ]);
  });

  it('replaces existing source-bin items with the same id so asset updates converge', () => {
    const current = [bin([{ ...item('image-1'), label: 'Old panel', assetUrl: 'blob:old' }])];
    const next = mergeSourceBinItemsIntoBins(current, [
      { ...item('image-1'), label: 'New panel', assetUrl: 'blob:new' },
    ]);

    expect(next[0].items).toHaveLength(1);
    expect(next[0].items[0]).toMatchObject({
      id: 'image-1',
      label: 'New panel',
      assetUrl: 'blob:new',
    });
  });

  it('creates a target bin if the command names a missing bin', () => {
    const current = [bin([item('local-1')])];
    const next = mergeSourceBinItemsIntoBins(current, [item('remote-1')], 'incoming');

    expect(next.map((sourceBin) => sourceBin.id)).toEqual(['default', 'incoming']);
    expect(next[1].items.map((sourceItem) => sourceItem.id)).toEqual(['remote-1']);
  });

  it('keeps Flow source-item ingestion owned by the Flow workspace window', () => {
    expect(shouldRunFlowOwnedSourceBinIngest('flow')).toBe(true);
    expect(shouldRunFlowOwnedSourceBinIngest('paper')).toBe(false);
    expect(shouldRunFlowOwnedSourceBinIngest('image')).toBe(false);
    expect(shouldRunFlowOwnedSourceBinIngest('editor')).toBe(false);
  });

  it('applies source-bin item rename commands without losing asset metadata', () => {
    const current = [bin([{ ...item('image-1'), label: 'image_001.png', assetId: 'asset-1' }])];
    const next = renameSourceBinItemInBins(current, 'image-1', '  Cover panel.png  ');

    expect(next[0].items[0]).toEqual(expect.objectContaining({
      id: 'image-1',
      label: 'Cover panel.png',
      assetId: 'asset-1',
      assetUrl: 'data:image/png;base64,image-1',
    }));
  });

  it('applies source-bin item removal commands without replacing other local items', () => {
    const current = [bin([item('image-1'), item('image-2')])];
    const next = removeSourceBinItemFromBins(current, 'image-1');

    expect(next[0].items.map((sourceItem) => sourceItem.id)).toEqual(['image-2']);
  });
});
