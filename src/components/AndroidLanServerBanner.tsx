import { useEffect, useState } from 'react';
import {
  isAndroidLanServerAvailable,
  startAndroidLanServer,
  stopAndroidLanServer,
  type SignalLoomLanServerStatus,
} from '../lib/androidLanServer';

import { useSettingsStore } from '../store/settingsStore';

/**
 * On the native Android app, starts the embedded LAN web server on boot and shows a dismissible
 * banner with the URL a desktop browser on the same Wi-Fi can open to run the full app from the
 * phone. Renders nothing on any other platform.
 */
export function AndroidLanServerBanner() {
  const [status, setStatus] = useState<SignalLoomLanServerStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { providerSettings } = useSettingsStore();

  useEffect(() => {
    if (!isAndroidLanServerAvailable()) return;
    let cancelled = false;

    if (providerSettings.androidLanServerEnabled) {
      void startAndroidLanServer(
        undefined,
        providerSettings.androidLanServerPin,
      ).then((next) => {
        if (!cancelled) setStatus(next);
      });
    } else {
      void stopAndroidLanServer().then(() => {
        if (!cancelled) setStatus(null);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    providerSettings.androidLanServerEnabled,
    providerSettings.androidLanServerPin,
  ]);

  if (dismissed || !status?.running || !status.url) return null;
  const url = status.url;
  const pin = status.pin;

  return (
    <div className="fixed bottom-3 left-1/2 z-[400] flex max-w-[94vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-cyan-400/40 bg-slate-950/95 px-3 py-2 text-xs text-cyan-100 shadow-2xl backdrop-blur">
      <span className="hidden font-semibold uppercase tracking-wide text-cyan-300/80 sm:inline">Desktop access</span>
      <code className="truncate rounded bg-cyan-500/15 px-1.5 py-1 text-cyan-100">{url}</code>
      {pin && (
        <span className="flex shrink-0 items-center gap-1">
          <span className="hidden uppercase tracking-wide text-cyan-300/70 sm:inline">PIN</span>
          <code className="rounded bg-cyan-500/15 px-1.5 py-1 font-semibold tracking-[0.2em] text-cyan-50">{pin}</code>
        </span>
      )}
      <button
        className="shrink-0 rounded border border-cyan-400/40 px-2 py-1 font-semibold hover:bg-cyan-500/20"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        type="button"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        aria-label="Dismiss"
        className="shrink-0 rounded px-1.5 py-1 text-cyan-100/60 hover:text-white"
        onClick={() => setDismissed(true)}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
