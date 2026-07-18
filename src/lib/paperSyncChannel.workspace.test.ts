import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  androidAvailable: { value: false },
  served: { value: false },
  notify: vi.fn<(channel: string, change: unknown) => void>(),
}));

vi.mock('./androidLanServer', () => ({
  isAndroidLanServerAvailable: () => h.androidAvailable.value,
  notifyLanProjectChange: (channel: string, change: unknown) => h.notify(channel, change),
}));
vi.mock('./remoteHostClient', () => ({
  isServedLanSession: () => h.served.value,
}));
vi.mock('./projectSyncClient', () => ({
  ensureProjectSyncChannelStarted: vi.fn(async () => undefined),
}));

import { usePaperStore } from '../store/paperStore';
import { MemoryPaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import { createBinaryAssetRecord, type BinaryAssetRecord } from '../shared/assets/contentAddressedAsset';
import type { PaperDocument, PaperManagedFontFace, PaperManagedIccProfile, PaperWorkspaceDocumentSnapshot } from '../types/paper';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { clearProjectSyncChannels, getProjectSyncChannel } from './projectSyncService';
import {
  PAPER_SYNC_CHANNEL,
  __flushPaperSyncEmitForTests,
  __resetPaperSyncChannelForTests,
  __setPaperSyncDepsForTests,
  initializePaperSyncChannel,
} from './paperSyncChannel';
import type { PaperDocumentNativeChange, PaperWorkspaceSnapshotChange } from './paperDocumentNativeSync';

interface ManagedWorkspaceFixture {
  documents: PaperWorkspaceDocumentSnapshot[];
  records: BinaryAssetRecord[];
}

async function managedWorkspaceFixture(): Promise<ManagedWorkspaceFixture> {
  const art = await createBinaryAssetRecord(new Uint8Array([1, 2, 3, 4]), { mimeType: 'image/png', fileName: 'art.png' });
  const font = await createBinaryAssetRecord(new Uint8Array([5, 6, 7, 8]), { mimeType: 'font/ttf', fileName: 'studio.ttf' });
  const icc = await createBinaryAssetRecord(new Uint8Array([9, 10, 11, 12]), { mimeType: 'application/vnd.iccprofile', fileName: 'press.icc' });

  let artDocument = createDefaultPaperDocument({ title: 'Managed art tab' });
  artDocument = addFrameToPaperPage(artDocument, artDocument.pages[0].id, {
    kind: 'image',
    xMm: 10,
    yMm: 10,
    widthMm: 80,
    heightMm: 60,
    asset: { label: 'Managed art', kind: 'image', locator: { kind: 'managed', ref: art.ref } },
  }).document;

  const managedFace: PaperManagedFontFace = {
    id: 'studio-face',
    familyId: 'studio',
    familyName: 'Studio Face',
    postscriptName: 'StudioFace-Regular',
    weight: 400,
    style: 'normal',
    stretchPercent: 100,
    collectionIndex: 0,
    variableAxes: {},
    unicodeRanges: [{ start: 0x20, end: 0x7e }],
    format: 'truetype',
    fontAsset: font.ref,
    embeddability: 'installable',
    canSubset: true,
    source: { kind: 'user-import' },
    license: {},
  };
  const profile: PaperManagedIccProfile = {
    id: icc.ref.id,
    asset: icc.ref,
    description: 'Studio press profile',
    deviceClass: 'prtr',
    colorSpace: 'CMYK',
    pcs: 'Lab ',
    outputConditionId: 'STUDIO-PRESS',
    source: { kind: 'user-import' },
  };
  const productionDocument: PaperDocument = {
    ...createDefaultPaperDocument({ title: 'Managed type and color tab' }),
    importedFonts: [managedFace],
    managedIccProfiles: [profile],
  };

  return {
    records: [art, font, icc],
    documents: [
      { id: 'art-tab', document: artDocument, assetIds: [art.ref.id], selectedPageId: artDocument.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 },
      { id: 'production-tab', document: productionDocument, assetIds: [font.ref.id, icc.ref.id].sort(), selectedPageId: productionDocument.pages[0].id, selectedFrameIds: [], tool: 'hand', zoom: 1.2 },
    ],
  };
}

function installWorkspace(documents: PaperWorkspaceDocumentSnapshot[], activeDocumentId: string): void {
  const active = documents.find((candidate) => candidate.id === activeDocumentId)!;
  usePaperStore.setState({
    documents,
    documentInstanceIds: Object.fromEntries(documents.map((candidate) => [candidate.id, `instance-${candidate.id}`])),
    activeDocumentId,
    document: active.document,
    selectedPageId: active.selectedPageId ?? active.document.pages[0].id,
    selectedFrameId: active.selectedFrameId ?? null,
    selectedFrameIds: active.selectedFrameIds ?? [],
    tool: active.tool,
    zoom: active.zoom,
    undoStack: [],
    redoStack: [],
    documentHistories: {},
  });
}

async function buildTransmittedWorkspace(): Promise<{
  change: PaperWorkspaceSnapshotChange;
  payloads: Map<string, string>;
  fixture: ManagedWorkspaceFixture;
}> {
  const fixture = await managedWorkspaceFixture();
  const sender = new MemoryPaperAssetRepository();
  for (const record of fixture.records) await sender.put(record);
  const payloads = new Map<string, string>();
  h.androidAvailable.value = true;
  h.served.value = false;
  installWorkspace(fixture.documents, 'production-tab');
  __setPaperSyncDepsForTests({
    repository: sender,
    putAsset: async (_channel, assetId, value) => {
      payloads.set(assetId, value);
      return true;
    },
  });
  initializePaperSyncChannel();
  const change = await getProjectSyncChannel(PAPER_SYNC_CHANNEL)!.snapshot() as PaperWorkspaceSnapshotChange;
  return { change, payloads, fixture };
}

beforeEach(() => {
  h.androidAvailable.value = false;
  h.served.value = false;
  h.notify.mockReset();
  clearProjectSyncChannels();
  __resetPaperSyncChannelForTests();
});

describe('Paper workspace sync envelope', () => {
  it('round-trips two tabs plus managed art, custom font, and ICC bytes into a clean receiver', async () => {
    const { change, payloads, fixture } = await buildTransmittedWorkspace();
    expect(change.schemaVersion).toBe(1);
    expect(change.workspace.documents.map((candidate) => candidate.id)).toEqual(['art-tab', 'production-tab']);
    expect(change.workspace.activeDocumentId).toBe('production-tab');
    expect(change.workspace.assetRefs.map((ref) => ref.id)).toEqual(fixture.records.map((record) => record.ref.id).sort());
    expect(payloads.size).toBe(3);

    __resetPaperSyncChannelForTests();
    clearProjectSyncChannels();
    h.androidAvailable.value = false;
    h.served.value = true;
    const receiver = new MemoryPaperAssetRepository();
    const blank = createDefaultPaperDocument({ title: 'Clean receiver' });
    installWorkspace([{ id: 'blank-tab', document: blank, selectedPageId: blank.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 }], 'blank-tab');
    __setPaperSyncDepsForTests({
      repository: receiver,
      getAsset: async (_channel, assetId) => payloads.get(assetId) ?? null,
    });
    initializePaperSyncChannel();

    await expect(getProjectSyncChannel(PAPER_SYNC_CHANNEL)!.applyRemote(change)).resolves.toBe(true);
    const state = usePaperStore.getState();
    expect(state.documents.map((candidate) => [candidate.id, candidate.document.title])).toEqual([
      ['art-tab', 'Managed art tab'],
      ['production-tab', 'Managed type and color tab'],
    ]);
    expect(state.activeDocumentId).toBe('production-tab');
    expect(state.document.title).toBe('Managed type and color tab');
    for (const record of fixture.records) {
      expect(await receiver.get(record.ref.id)).toEqual(record);
    }
  });

  it.each(['missing', 'corrupt'] as const)('defers the entire workspace when a managed asset is %s', async (failure) => {
    const { change, payloads } = await buildTransmittedWorkspace();
    __resetPaperSyncChannelForTests();
    clearProjectSyncChannels();
    h.androidAvailable.value = false;
    h.served.value = true;
    const receiver = new MemoryPaperAssetRepository();
    const blank = createDefaultPaperDocument({ title: 'Must remain' });
    installWorkspace([{ id: 'blank-tab', document: blank, selectedPageId: blank.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 }], 'blank-tab');
    const failedId = change.workspace.assetRefs[1].id;
    __setPaperSyncDepsForTests({
      repository: receiver,
      getAsset: async (_channel, assetId) => {
        if (assetId !== failedId) return payloads.get(assetId) ?? null;
        return failure === 'missing' ? null : 'data:application/octet-stream;base64,AAAA';
      },
    });
    initializePaperSyncChannel();

    await expect(getProjectSyncChannel(PAPER_SYNC_CHANNEL)!.applyRemote(change)).resolves.toBe(false);
    expect(usePaperStore.getState().activeDocumentId).toBe('blank-tab');
    expect(usePaperStore.getState().document.title).toBe('Must remain');
    expect(await receiver.listRefs()).toEqual([]);
  });

  it('publishes every verified asset before the envelope event', async () => {
    const fixture = await managedWorkspaceFixture();
    const sender = new MemoryPaperAssetRepository();
    for (const record of fixture.records) await sender.put(record);
    const events: string[] = [];
    h.androidAvailable.value = true;
    installWorkspace(fixture.documents, 'production-tab');
    __setPaperSyncDepsForTests({
      repository: sender,
      putAsset: async (_channel, assetId) => {
        events.push(`asset:${assetId}`);
        return true;
      },
    });
    h.notify.mockImplementation(() => events.push('envelope'));
    initializePaperSyncChannel();
    usePaperStore.setState((state) => ({
      document: { ...state.document, title: 'Changed after pairing', updatedAt: Date.now() },
    }));
    await __flushPaperSyncEmitForTests();

    expect(events.at(-1)).toBe('envelope');
    expect(events.slice(0, -1)).toHaveLength(3);
    expect(events.slice(0, -1).every((event) => event.startsWith('asset:sha256:'))).toBe(true);
  });

  it('does not publish workspace metadata when the sender repository lacks a reachable record', async () => {
    const fixture = await managedWorkspaceFixture();
    const sender = new MemoryPaperAssetRepository();
    await sender.put(fixture.records[0]);
    await sender.put(fixture.records[1]);
    h.androidAvailable.value = true;
    installWorkspace(fixture.documents, 'production-tab');
    __setPaperSyncDepsForTests({ repository: sender, putAsset: async () => true });
    initializePaperSyncChannel();
    usePaperStore.setState((state) => ({
      document: { ...state.document, title: 'Cannot publish', updatedAt: Date.now() },
    }));

    await __flushPaperSyncEmitForTests();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('serializes concurrent inbound envelopes so delayed older work cannot overwrite the newer arrival', async () => {
    const { change, payloads } = await buildTransmittedWorkspace();
    const newer: PaperWorkspaceSnapshotChange = structuredClone(change);
    newer.workspace.documents[1].document.title = 'Newest title';
    newer.document = newer.workspace.documents[1].document;

    __resetPaperSyncChannelForTests();
    clearProjectSyncChannels();
    h.androidAvailable.value = false;
    h.served.value = true;
    const receiver = new MemoryPaperAssetRepository();
    const blank = createDefaultPaperDocument({ title: 'Clean receiver' });
    installWorkspace([{ id: 'blank-tab', document: blank, selectedPageId: blank.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 }], 'blank-tab');
    let releaseFirst!: (value: string | null) => void;
    const firstFetch = new Promise<string | null>((resolve) => { releaseFirst = resolve; });
    let fetchCount = 0;
    __setPaperSyncDepsForTests({
      repository: receiver,
      getAsset: async (_channel, assetId) => {
        fetchCount += 1;
        if (fetchCount === 1) return firstFetch;
        return payloads.get(assetId) ?? null;
      },
    });
    initializePaperSyncChannel();
    const channel = getProjectSyncChannel(PAPER_SYNC_CHANNEL)!;
    const olderApply = channel.applyRemote(change);
    const newerApply = channel.applyRemote(newer);
    await vi.waitFor(() => expect(fetchCount).toBe(1));
    releaseFirst(payloads.get(change.workspace.assetRefs[0].id) ?? null);
    await Promise.all([olderApply, newerApply]);

    expect(usePaperStore.getState().document.title).toBe('Newest title');
    expect(usePaperStore.getState().activeDocumentId).toBe('production-tab');
  });
});

describe('Paper legacy payload compatibility', () => {
  it('applies an old snapshot to a single tab and keeps its catalog entry coherent', async () => {
    const local = createDefaultPaperDocument({ title: 'Local' });
    const remote = createDefaultPaperDocument({ title: 'Legacy remote' });
    installWorkspace([{ id: 'only-tab', document: local, selectedPageId: local.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 }], 'only-tab');
    h.served.value = true;
    initializePaperSyncChannel();

    await expect(getProjectSyncChannel(PAPER_SYNC_CHANNEL)!.applyRemote({
      type: 'paper-document-snapshot',
      document: remote,
    } satisfies PaperDocumentNativeChange)).resolves.toBe(true);
    expect(usePaperStore.getState().document).toBe(remote);
    expect(usePaperStore.getState().documents[0].document).toBe(remote);
    expect(usePaperStore.getState().activeDocumentId).toBe('only-tab');
  });

  it('rejects an unrelated old full snapshot on a multi-tab receiver', async () => {
    const first = createDefaultPaperDocument({ title: 'First' });
    const second = createDefaultPaperDocument({ title: 'Second' });
    const unrelated = createDefaultPaperDocument({ title: 'Unrelated legacy sender' });
    installWorkspace([
      { id: 'first-tab', document: first, selectedPageId: first.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 },
      { id: 'second-tab', document: second, selectedPageId: second.pages[0].id, selectedFrameIds: [], tool: 'select', zoom: 0.8 },
    ], 'second-tab');
    h.served.value = true;
    initializePaperSyncChannel();

    await expect(getProjectSyncChannel(PAPER_SYNC_CHANNEL)!.applyRemote({
      type: 'paper-document-snapshot',
      document: unrelated,
    } satisfies PaperDocumentNativeChange)).resolves.toBe(false);
    expect(usePaperStore.getState().document.title).toBe('Second');
    expect(usePaperStore.getState().documents.map((candidate) => candidate.document.title)).toEqual(['First', 'Second']);
  });
});
