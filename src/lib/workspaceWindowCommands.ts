import type { SourceBin, SourceBinLibraryItem } from '../store/sourceBinStore';
import {
  isWorkspaceWindowView,
  type WorkspaceWindowView,
} from './workspaceWindows';

export const WORKSPACE_WINDOW_COMMAND_CHANNEL = 'signal-loom-workspace-window-commands';

export type WorkspaceWindowCommand =
  | {
      type: 'source-bin-items-added';
      items: SourceBinLibraryItem[];
      targetWorkspace?: WorkspaceWindowView;
      targetBinId?: string;
    }
  | {
      type: 'source-bin-item-renamed';
      itemId: string;
      label: string;
      targetWorkspace?: WorkspaceWindowView;
    }
  | {
      type: 'source-bin-item-removed';
      itemId: string;
      sourceKey?: string;
      targetWorkspace?: WorkspaceWindowView;
    }
  | {
      type: 'flow-create-source-node';
      item: SourceBinLibraryItem;
      targetWorkspace: 'flow';
      targetFlowWorkspaceId?: string;
      targetBinId?: string;
    }
  | {
      type: 'video-select-source-item';
      item: SourceBinLibraryItem;
      targetWorkspace: 'editor';
    }
  | {
      /** A linked image edit returning to its Paper frame: merge the item, place it in the frame. */
      type: 'paper-place-source-asset';
      item: SourceBinLibraryItem;
      pageId: string;
      frameId: string;
      targetWorkspace: 'paper';
    }
  | {
      /** A linked .slimg edit was written to disk: refresh Flow nodes bound to that file. */
      type: 'flow-slimg-file-updated';
      filePath: string;
      /** Flattened PNG data URL — becomes the node output without another disk read. */
      flattened: string;
      targetWorkspace: 'flow';
    };

export interface WorkspaceWindowCommandEnvelope {
  senderId: string;
  command: WorkspaceWindowCommand;
}

let cachedSenderId: string | undefined;

export function getWorkspaceWindowSenderId(): string {
  cachedSenderId ??= globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return cachedSenderId;
}

export function shouldRunFlowOwnedSourceBinIngest(activeWorkspaceView: WorkspaceWindowView): boolean {
  return activeWorkspaceView === 'flow';
}

export function createWorkspaceWindowCommandEnvelope(
  senderId: string,
  command: WorkspaceWindowCommand,
): WorkspaceWindowCommandEnvelope {
  return {
    senderId,
    command,
  };
}

export function postWorkspaceWindowCommand(command: WorkspaceWindowCommand): boolean {
  if (typeof BroadcastChannel === 'undefined') {
    return false;
  }

  const channel = new BroadcastChannel(WORKSPACE_WINDOW_COMMAND_CHANNEL);
  channel.postMessage(createWorkspaceWindowCommandEnvelope(getWorkspaceWindowSenderId(), command));
  channel.close();
  return true;
}

export function getWorkspaceWindowCommandForWorkspace(
  envelope: unknown,
  localSenderId: string,
  activeWorkspaceView: WorkspaceWindowView,
): WorkspaceWindowCommand | undefined {
  if (!isWorkspaceWindowCommandEnvelope(envelope) || envelope.senderId === localSenderId) {
    return undefined;
  }

  const { command } = envelope;
  if (command.targetWorkspace && command.targetWorkspace !== activeWorkspaceView) {
    return undefined;
  }

  return command;
}

export function mergeSourceBinItemsIntoBins(
  bins: SourceBin[],
  items: SourceBinLibraryItem[],
  targetBinId?: string,
): SourceBin[] {
  const incomingItems = items.filter(isSourceBinLibraryItem);
  if (incomingItems.length === 0) {
    return bins;
  }

  const incomingItemsById = new Map(incomingItems.map((item) => [item.id, item]));
  let didReplaceExisting = false;
  const binsWithReplacements = bins.map((bin) => {
    let didReplaceInBin = false;
    const items = bin.items.map((item) => {
      const replacement = incomingItemsById.get(item.id);
      if (!replacement) {
        return item;
      }

      if (sourceBinLibraryItemsEqual(item, replacement)) {
        return item;
      }

      didReplaceExisting = true;
      didReplaceInBin = true;
      return replacement;
    });

    return didReplaceInBin ? { ...bin, items } : bin;
  });

  const existingIds = new Set(binsWithReplacements.flatMap((bin) => bin.items.map((item) => item.id)));
  const existingSourceKeys = new Set(
    binsWithReplacements
      .flatMap((bin) => bin.items)
      .map((item) => item.sourceKey)
      .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
  );
  const uniqueIncomingItems = incomingItems.filter((item) => {
    if (existingIds.has(item.id)) {
      return false;
    }

    if (item.sourceKey && existingSourceKeys.has(item.sourceKey)) {
      return false;
    }

    existingIds.add(item.id);
    if (item.sourceKey) {
      existingSourceKeys.add(item.sourceKey);
    }
    return true;
  });

  if (uniqueIncomingItems.length === 0) {
    return didReplaceExisting ? binsWithReplacements : bins;
  }

  const targetIndex = targetBinId
    ? bins.findIndex((bin) => bin.id === targetBinId)
    : 0;

  if (targetIndex >= 0) {
    return binsWithReplacements.map((bin, index) => (
      index === targetIndex
        ? { ...bin, collapsed: false, items: [...uniqueIncomingItems, ...bin.items] }
        : bin
    ));
  }

  return [
    ...binsWithReplacements,
    {
      id: targetBinId ?? 'default',
      name: 'Source Library',
      items: uniqueIncomingItems,
      collapsed: false,
      createdAt: Date.now(),
    },
  ];
}

function sourceBinLibraryItemsEqual(left: SourceBinLibraryItem, right: SourceBinLibraryItem): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function renameSourceBinItemInBins(
  bins: SourceBin[],
  itemId: string,
  label: string,
): SourceBin[] {
  const normalizedLabel = label.trim();
  if (!itemId.trim() || !normalizedLabel) {
    return bins;
  }

  let didRename = false;
  const nextBins = bins.map((bin) => ({
    ...bin,
    items: bin.items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      didRename = true;
      return { ...item, label: normalizedLabel };
    }),
  }));

  return didRename ? nextBins : bins;
}

export function removeSourceBinItemFromBins(
  bins: SourceBin[],
  itemId: string,
): SourceBin[] {
  if (!itemId.trim()) {
    return bins;
  }

  let didRemove = false;
  const nextBins = bins.map((bin) => {
    const nextItems = bin.items.filter((item) => item.id !== itemId);
    if (nextItems.length !== bin.items.length) {
      didRemove = true;
    }

    return nextItems === bin.items ? bin : { ...bin, items: nextItems };
  });

  return didRemove ? nextBins : bins;
}

function isWorkspaceWindowCommandEnvelope(value: unknown): value is WorkspaceWindowCommandEnvelope {
  if (!isPlainRecord(value)) {
    return false;
  }

  return typeof value.senderId === 'string' && isWorkspaceWindowCommand(value.command);
}

function isWorkspaceWindowCommand(value: unknown): value is WorkspaceWindowCommand {
  if (!isPlainRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  const targetWorkspace = value.targetWorkspace;
  if (targetWorkspace !== undefined && !isWorkspaceWindowView(targetWorkspace)) {
    return false;
  }

  switch (value.type) {
    case 'source-bin-items-added':
      return Array.isArray(value.items);
    case 'source-bin-item-renamed':
      return typeof value.itemId === 'string' && typeof value.label === 'string';
    case 'source-bin-item-removed':
      return typeof value.itemId === 'string' && (value.sourceKey === undefined || typeof value.sourceKey === 'string');
    case 'flow-create-source-node':
      return value.targetWorkspace === 'flow'
        && (value.targetFlowWorkspaceId === undefined || typeof value.targetFlowWorkspaceId === 'string')
        && isSourceBinLibraryItem(value.item);
    case 'video-select-source-item':
      return value.targetWorkspace === 'editor' && isSourceBinLibraryItem(value.item);
    default:
      return false;
  }
}

function isSourceBinLibraryItem(value: unknown): value is SourceBinLibraryItem {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    (
      value.assetUrl === undefined ||
      typeof value.assetUrl === 'string'
    )
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
