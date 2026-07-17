import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import {
  claimCommunityNoticeDay,
  releaseCommunityNoticeDayClaim,
} from './communityNoticeDayClaim';

const DISMISS_ENABLE_DELAY_SECONDS = 4;
const BUY_LICENSE_URL = 'https://sloom.studio/#license';

/**
 * Community-edition startup notice (hermes strategy-and-licensing-spec Part 2 §4):
 * timed dismissible (~4s before Continue enables), at most once per day, licensed users never
 * see it. Copy is the spec draft verbatim in spirit: free to learn on, pay when it pays you.
 */
export const CommunityStartupNotice: React.FC = () => {
  const license = useSettingsStore((state) => state.license);
  const licenseKey = useSettingsStore((state) => state.licenseKey);
  const settingsHydrated = useSettingsStore((state) => state.settingsHydrated);
  const revalidateLicense = useSettingsStore((state) => state.revalidateLicense);
  const openSettings = useSettingsStore((state) => state.openSettings);

  const [visible, setVisible] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(DISMISS_ENABLE_DELAY_SECONDS);
  const decidedRef = React.useRef(false);

  React.useEffect(() => {
    // AUD-015: encrypted settings hydrate asynchronously; deciding before they land would
    // validate the default empty key and lock a licensed user to Community for the session.
    if (!settingsHydrated || decidedRef.current) {
      return;
    }
    decidedRef.current = true;

    let cancelled = false;
    void (async () => {
      // Fail-closed rehydration leaves license unverified — check the stored key first so a
      // licensed user never sees a Community flash.
      await revalidateLicense();
      if (cancelled) {
        // Unmounted mid-decision: nothing was displayed, so nothing may be claimed.
        return;
      }
      const { license: current } = useSettingsStore.getState();
      if (current.licensed) {
        return;
      }
      // The once-per-day slot is shared by every window; exactly one renderer claims and shows.
      const claimed = await claimCommunityNoticeDay();
      if (!claimed) {
        return;
      }
      if (cancelled) {
        // Claimed, but this window went away before displaying — give the claim back rather
        // than suppressing a notice nobody ever saw.
        releaseCommunityNoticeDayClaim();
        return;
      }
      setVisible(true);
    })();

    return () => {
      cancelled = true;
      // Let a StrictMode remount (same instance, refs persist) decide again; the cancelled
      // closure above can no longer claim or display anything.
      decidedRef.current = false;
    };
  }, [settingsHydrated, revalidateLicense]);

  React.useEffect(() => {
    if (!visible || secondsLeft <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [visible, secondsLeft]);

  // A key activated while the dialog is open dismisses it immediately.
  React.useEffect(() => {
    if (visible && license.licensed) {
      setVisible(false);
    }
  }, [visible, license.licensed, licenseKey]);

  if (!visible) {
    return null;
  }

  const canDismiss = secondsLeft <= 0;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-[2px]" data-community-notice="true">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-700/70 bg-[#10141d] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="text-lg font-semibold text-gray-100">Sloom Studio Community</div>
        <p className="mt-3 text-sm leading-6 text-gray-300">
          Free for personal and noncommercial use. Learn it, make things, share them. If you start
          earning with what you make here, that&apos;s when a license is due
          <span className="text-gray-100 font-semibold"> ($17.99, one-time, first 100 copies — then $39)</span>.
          It unlocks the commercial print-production exports (real CMYK PDF/X-1a and PDF/X-4, a KDP-ready
          print PDF, and real Adobe IDML) and removes this notice.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <a
            className="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-center text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-300/70 hover:text-white"
            href={BUY_LICENSE_URL}
            rel="noreferrer"
            target="_blank"
          >
            Buy a license
          </a>
          <button
            className="w-full rounded-lg border border-gray-700/70 bg-[#151a24] px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            onClick={() => {
              setVisible(false);
              openSettings('license');
            }}
            type="button"
          >
            Enter key
          </button>
          <button
            className="w-full rounded-lg border border-transparent px-4 py-2.5 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-200 disabled:cursor-default disabled:opacity-50"
            data-community-notice-continue="true"
            disabled={!canDismiss}
            onClick={() => setVisible(false)}
            type="button"
          >
            {canDismiss ? 'Continue free' : `Continue free (${secondsLeft})`}
          </button>
        </div>
      </div>
    </div>
  );
};
