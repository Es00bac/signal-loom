import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditLockState } from '../lib/projectEditLock';

/**
 * Task #54: the paired served-session banner must (a) NEVER say the project is read-only — the old
 * "Projects open read-only" framing is gone now that the workspace channels + edit baton make a served
 * browser a fully-live editor — (b) surface live baton presence (who is the active editor), and (c) keep
 * the one honest caveat: Video timelines don't sync yet. The presence wiring runs through the REAL
 * {@link selectEditBaton}; only the store hook is swapped so the test can drive the mirrored lock
 * (renderToStaticMarkup reads zustand's *initial* snapshot, so the live store can't be set from a test).
 */

// Hoisted so the vi.mock factory (which runs during import) can close over the mutable lock the tests set.
const h = vi.hoisted(() => ({ lock: null as EditLockState | null }));

vi.mock('../lib/remoteHostClient', () => ({
  isServedLanSession: () => true,
  getRemoteHostPairingState: () => 'paired' as const,
  subscribeRemoteHostPairing: () => () => undefined,
  pairServedSession: async () => ({ ok: true }),
}));

vi.mock('../lib/deviceIdentity', () => ({
  getLocalDeviceId: () => 'desktop-1',
}));

vi.mock('../store/editLockStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/editLockStore')>();
  return {
    ...actual, // keep the real selectEditBaton so the presence derivation is genuinely exercised
    useEditLockStore: (selector: (s: { lock: EditLockState | null }) => unknown) =>
      selector({ lock: h.lock }),
  };
});

import { RemoteHostBanner } from './RemoteHostBanner';

function lockHeldBy(holder: { id: string; label: string } | null): EditLockState {
  return { holder, pending: null, heldSince: 1, expiresAt: 2, pendingExpiresAt: 0, revision: 1 };
}

afterEach(() => {
  h.lock = null;
});

describe('RemoteHostBanner — paired served session (#54)', () => {
  it('never tells the user the project is read-only, and shows the live-sync + Video caveat', () => {
    h.lock = null; // no baton seeded yet → unmanaged
    const html = renderToStaticMarkup(<RemoteHostBanner />);

    expect(html).toContain('data-remote-host-paired-banner="true"');
    expect(html).toContain('sync live');
    expect(html).toContain('Video timelines'); // the one honest caveat survives
    expect(html.toLowerCase()).not.toContain('read-only');
    expect(html.toLowerCase()).not.toContain('read only');
  });

  it('shows "editing here" when this device holds the baton', () => {
    h.lock = lockHeldBy({ id: 'desktop-1', label: 'This desktop' });
    const html = renderToStaticMarkup(<RemoteHostBanner />);

    expect(html).toContain('data-remote-host-presence="true"');
    expect(html).toContain('editing here');
  });

  it('names the remote holder when another device holds the baton', () => {
    h.lock = lockHeldBy({ id: '__loom_host__', label: 'Phone' });
    const html = renderToStaticMarkup(<RemoteHostBanner />);

    expect(html).toContain('data-remote-host-presence="true"');
    expect(html).toContain('Phone is editing');
    expect(html.toLowerCase()).not.toContain('read-only');
  });

  it('reads "available to edit" when the baton is free (no holder)', () => {
    h.lock = lockHeldBy(null);
    const html = renderToStaticMarkup(<RemoteHostBanner />);

    expect(html).toContain('available to edit');
  });
});
