import { beforeEach, describe, expect, it } from 'vitest';

import { serializeSlppr } from '../features/paper/SlpprFormat';
import {
  MemoryPaperAssetRepository,
  type PaperAssetRepository,
} from '../features/paper/assets/PaperAssetRepository';
import { createBinaryAssetRecord, type BinaryAssetRecord } from '../shared/assets/contentAddressedAsset';
import { useEditLockStore } from '../store/editLockStore';
import { usePaperStore } from '../store/paperStore';
import type { PaperDocument } from '../types/paper';
import { getLocalDevice } from './deviceIdentity';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import type { EditLockDevice, EditLockState } from './projectEditLock';
import { openStandaloneSlpprDocument } from './paperStandaloneDocumentOpen';

function resetPaperStore(): void {
  const document = createDefaultPaperDocument({ title: 'Existing project layout' });
  usePaperStore.getState().restoreSnapshot({ document, tool: 'select', zoom: 0.8 });
}

function importedDocument(record: BinaryAssetRecord): PaperDocument {
  let document = createDefaultPaperDocument({ title: 'Imported standalone layout' });
  document.id = 'standalone-paper';
  document = addFrameToPaperPage(document, document.pages[0].id, {
    id: 'standalone-image',
    kind: 'image',
    label: 'Managed cover',
    xMm: 10,
    yMm: 10,
    widthMm: 50,
    heightMm: 40,
    asset: {
      label: 'cover.png',
      kind: 'image',
      mimeType: 'image/png',
      locator: { kind: 'managed', ref: record.ref },
    },
  }).document;
  return document;
}

function heldLock(holder: EditLockDevice, revision: number, expiresAt = Date.now() + 60_000): EditLockState {
  return {
    revision,
    holder,
    pending: null,
    heldSince: Date.now(),
    expiresAt,
    pendingExpiresAt: 0,
  };
}

async function standaloneFixture(): Promise<{
  bytes: Uint8Array;
  document: PaperDocument;
  record: BinaryAssetRecord;
}> {
  const source = new MemoryPaperAssetRepository();
  const record = await createBinaryAssetRecord(new Uint8Array([1, 3, 5, 7]), {
    mimeType: 'image/png',
    fileName: 'cover.png',
  });
  await source.put(record);
  const document = importedDocument(record);
  return { bytes: await serializeSlppr(document, source), document, record };
}

class DelayedReadRepository implements PaperAssetRepository {
  readonly inner = new MemoryPaperAssetRepository();
  private releaseRead: (() => void) | undefined;
  readonly readStarted = new Promise<void>((resolve) => {
    this.releaseRead = resolve;
  });
  private continueRead: (() => void) | undefined;
  private readonly readCanContinue = new Promise<void>((resolve) => {
    this.continueRead = resolve;
  });
  private delayed = false;

  release(): void {
    this.continueRead?.();
  }

  put(record: BinaryAssetRecord) {
    return this.inner.put(record);
  }

  putAllAtomic(records: readonly BinaryAssetRecord[]) {
    return this.inner.putAllAtomic(records);
  }

  async get(id: BinaryAssetRecord['ref']['id']) {
    if (!this.delayed) {
      this.delayed = true;
      this.releaseRead?.();
      await this.readCanContinue;
    }
    return this.inner.get(id);
  }

  has(id: BinaryAssetRecord['ref']['id']) {
    return this.inner.has(id);
  }

  delete(id: BinaryAssetRecord['ref']['id']) {
    return this.inner.delete(id);
  }

  listRefs() {
    return this.inner.listRefs();
  }
}

beforeEach(() => {
  resetPaperStore();
  useEditLockStore.getState().setLock(null);
});

describe('standalone .slppr ownership transaction (FBL-031)', () => {
  it('adds a validated package as a clean standalone tab and preserves its managed bytes and path', async () => {
    const { bytes, document, record } = await standaloneFixture();
    const target = new MemoryPaperAssetRepository();
    const existingIds = usePaperStore.getState().documents.map(({ id }) => id);

    const openedId = await openStandaloneSlpprDocument(bytes, {
      repository: target,
      path: '/layouts/cover.slppr',
    });

    const state = usePaperStore.getState();
    expect(openedId).toBe('standalone-paper');
    expect(state.documents.map(({ id }) => id)).toEqual([...existingIds, openedId]);
    expect(state.document).toMatchObject({ id: document.id, title: document.title });
    expect(state.documents.at(-1)?.persistence).toMatchObject({
      kind: 'standalone',
      path: '/layouts/cover.slppr',
    });
    expect(state.isDocumentDirty(openedId)).toBe(false);
    expect(await target.get(record.ref.id)).toEqual(record);
  });

  it('refuses a local open while another device holds the edit baton without staging bytes or changing tabs', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new MemoryPaperAssetRepository();
    const before = usePaperStore.getState().exportSnapshot({ includeLocalPersistence: true });
    useEditLockStore.getState().setLock(heldLock({ id: 'phone-other', label: 'Phone' }, 9));

    await expect(openStandaloneSlpprDocument(bytes, { repository: target }))
      .rejects.toThrow(/is editing this project/i);

    expect(usePaperStore.getState().exportSnapshot({ includeLocalPersistence: true })).toEqual(before);
    expect(await target.get(record.ref.id)).toBeUndefined();
  });

  it('accepts the open when this device holds the edit baton', async () => {
    const { bytes } = await standaloneFixture();
    const local = getLocalDevice();
    useEditLockStore.getState().setLock(heldLock(local, 3));

    await expect(openStandaloneSlpprDocument(bytes, {
      repository: new MemoryPaperAssetRepository(),
    })).resolves.toBe('standalone-paper');
  });

  it('rolls managed records back exactly when baton ownership changes during the asynchronous open', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new DelayedReadRepository();
    const corruptPrevious = { ...record, bytes: new Uint8Array([9, 9, 9, 9]) };
    await target.put(corruptPrevious);
    const local = getLocalDevice();
    useEditLockStore.getState().setLock(heldLock(local, 10));
    const before = usePaperStore.getState().exportSnapshot({ includeLocalPersistence: true });

    const opening = openStandaloneSlpprDocument(bytes, { repository: target });
    await target.readStarted;
    useEditLockStore.getState().setLock(heldLock({ id: 'phone-other', label: 'Phone' }, 11));
    target.release();

    await expect(opening).rejects.toThrow(/ownership changed/i);
    expect(usePaperStore.getState().exportSnapshot({ includeLocalPersistence: true })).toEqual(before);
    expect(await target.get(record.ref.id)).toEqual(corruptPrevious);
  });

  it('does not mistake a same-holder heartbeat for an ownership transfer', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new DelayedReadRepository();
    const local = getLocalDevice();
    useEditLockStore.getState().setLock(heldLock(local, 20, Date.now() + 30_000));

    const opening = openStandaloneSlpprDocument(bytes, { repository: target });
    await target.readStarted;
    useEditLockStore.getState().setLock(heldLock(local, 21));
    target.release();

    await expect(opening).resolves.toBe('standalone-paper');
    expect(await target.get(record.ref.id)).toEqual(record);
  });

  it('rolls managed records back when Paper changes before the commit boundary', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new DelayedReadRepository();
    const beforeIds = usePaperStore.getState().documents.map(({ id }) => id);

    const opening = openStandaloneSlpprDocument(bytes, { repository: target });
    await target.readStarted;
    usePaperStore.getState().addPage();
    target.release();

    await expect(opening).rejects.toThrow(/workspace changed/i);
    expect(usePaperStore.getState().documents.map(({ id }) => id)).toEqual(beforeIds);
    expect(await target.get(record.ref.id)).toBeUndefined();
  });

  it('honors a desktop project-authority guard at start and revalidates it after asset publication', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new DelayedReadRepository();
    let projectAuthorityCurrent = true;

    const opening = openStandaloneSlpprDocument(bytes, {
      repository: target,
      isProjectAuthorityCurrent: () => projectAuthorityCurrent,
    });
    await target.readStarted;
    projectAuthorityCurrent = false;
    target.release();

    await expect(opening).rejects.toThrow(/project authority changed/i);
    expect(usePaperStore.getState().documents).toHaveLength(1);
    expect(await target.get(record.ref.id)).toBeUndefined();

    await expect(openStandaloneSlpprDocument(bytes, {
      repository: target,
      isProjectAuthorityCurrent: () => false,
    })).rejects.toThrow(/project authority/i);
    expect(await target.get(record.ref.id)).toBeUndefined();
  });

  it('reopens the same standalone document as a distinct clean tab without changing the first backing path', async () => {
    const { bytes } = await standaloneFixture();
    const target = new MemoryPaperAssetRepository();

    const first = await openStandaloneSlpprDocument(bytes, {
      repository: target,
      path: '/layouts/first.slppr',
    });
    const second = await openStandaloneSlpprDocument(bytes, {
      repository: target,
      path: '/layouts/second.slppr',
    });

    expect(first).toBe('standalone-paper');
    expect(second).toBe('standalone-paper-2');
    expect(usePaperStore.getState().documents.slice(-2).map(({ id, persistence }) => ({
      id,
      kind: persistence?.kind,
      path: persistence?.path,
    }))).toEqual([
      { id: 'standalone-paper', kind: 'standalone', path: '/layouts/first.slppr' },
      { id: 'standalone-paper-2', kind: 'standalone', path: '/layouts/second.slppr' },
    ]);
    expect(usePaperStore.getState().isDocumentDirty(first)).toBe(false);
    expect(usePaperStore.getState().isDocumentDirty(second)).toBe(false);
  });

  it('keeps committed managed bytes when a Paper store observer throws after the tab assignment', async () => {
    const { bytes, record } = await standaloneFixture();
    const target = new MemoryPaperAssetRepository();
    const unsubscribe = usePaperStore.subscribe(() => {
      throw new Error('broken Paper observer');
    });

    try {
      await expect(openStandaloneSlpprDocument(bytes, { repository: target }))
        .resolves.toBe('standalone-paper');
    } finally {
      unsubscribe();
    }

    expect(usePaperStore.getState().activeDocumentId).toBe('standalone-paper');
    expect(await target.get(record.ref.id)).toEqual(record);
  });
});
