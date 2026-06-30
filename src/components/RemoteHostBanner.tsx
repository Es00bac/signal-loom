import { useEffect, useState } from 'react';
import {
  getRemoteHostPairingState,
  isServedLanSession,
  pairServedSession,
  subscribeRemoteHostPairing,
  type RemoteHostPairingState,
} from '../lib/remoteHostClient';
import { getLocalDeviceId } from '../lib/deviceIdentity';
import { selectEditBaton, useEditLockStore } from '../store/editLockStore';

/**
 * Shown on a desktop browser served from a phone's LAN host (task #20). Two states:
 *
 * - **Unpaired** — a pairing prompt. The phone serves over plain HTTP and gates its data API behind a
 *   PIN → session token (security without HTTPS); enter the code shown on the phone to connect. This is
 *   the access control that a self-signed cert never provided.
 * - **Paired** — a dismissible notice that the library *and the open project* now sync live with the
 *   phone (the Flow/Paper channels + the edit baton, tasks #50–58). It surfaces live **presence** (who
 *   currently holds the baton, from {@link useEditLockStore}) and the one caveat the sync doesn't yet
 *   cover — the Video timeline. The old "projects open read-only" framing is gone: a project is fully
 *   editable here once this device takes the baton (the top-bar "Working here" control).
 *
 * Renders nothing in any other runtime.
 */
export function RemoteHostBanner() {
  const [pairing, setPairing] = useState<RemoteHostPairingState>(() => getRemoteHostPairingState());
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const baton = selectEditBaton(
    useEditLockStore((state) => state.lock),
    getLocalDeviceId(),
  );

  useEffect(() => subscribeRemoteHostPairing(setPairing), []);

  if (!isServedLanSession()) return null;

  if (pairing === 'unpaired') {
    const submit = async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const result = await pairServedSession(pin);
      if (!result.ok) {
        setError(result.error ?? 'Pairing failed.');
        setBusy(false);
        return;
      }
      setPin('');
      setBusy(false);
    };

    return (
      <div className="fixed bottom-3 left-1/2 z-[400] flex max-w-[94vw] -translate-x-1/2 flex-col gap-1 rounded-xl border border-amber-400/40 bg-slate-950/95 px-3 py-2 text-xs text-amber-100 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide text-amber-300/80">Connect to phone</span>
          <span className="truncate">Enter the code shown on your phone:</span>
          <input
            autoFocus
            className="w-24 rounded border border-amber-400/40 bg-slate-900 px-2 py-1 text-center font-semibold tracking-[0.2em] text-amber-50 outline-none focus:border-amber-300"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder="000000"
            value={pin}
          />
          <button
            className="shrink-0 rounded border border-amber-400/40 px-2 py-1 font-semibold hover:bg-amber-500/20 disabled:opacity-50"
            disabled={busy || pin.length === 0}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {error && <span className="text-amber-300/90">{error}</span>}
      </div>
    );
  }

  if (pairing === 'paired' && !dismissed) {
    // Live presence from the baton: who is the active editor right now. `unmanaged` means the baton hasn't
    // seeded yet (treat as available); otherwise show this device or the holder.
    const editor = baton.unmanaged
      ? null
      : baton.isHeldByThisDevice
        ? 'editing here'
        : baton.holderLabel
          ? `${baton.holderLabel} is editing`
          : 'available to edit';

    return (
      <div
        className="fixed bottom-3 left-1/2 z-[400] flex max-w-[94vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-400/40 bg-slate-950/95 px-3 py-2 text-xs text-emerald-100 shadow-2xl backdrop-blur"
        data-remote-host-paired-banner="true"
      >
        <span className="font-semibold uppercase tracking-wide text-emerald-300/80">Phone link</span>
        <span className="truncate">
          Connected — your library and open project <strong>sync live</strong> with your phone.
          {editor && (
            <>
              {' '}
              <span className="text-emerald-200/80" data-remote-host-presence="true">
                {editor}
              </span>
              .
            </>
          )}{' '}
          <span className="text-emerald-200/60">Video timelines don’t sync across devices yet.</span>
        </span>
        <button
          aria-label="Dismiss"
          className="shrink-0 rounded px-1.5 py-1 text-emerald-100/60 hover:text-white"
          onClick={() => setDismissed(true)}
          type="button"
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}
