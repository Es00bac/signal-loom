import React from 'react';
import { BadgeCheck, KeyRound, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { describeLicenseEdition } from '../../lib/licenseKey';

const BUY_LICENSE_URL = 'https://sloom.studio/#license';

/**
 * Settings → License (hermes strategy-and-licensing-spec Part 2 §3): paste-key field, validity
 * status, licensed-to email, remove-key. Validation is offline Ed25519 — no server, works forever.
 */
export const LicenseSection: React.FC = () => {
  const licenseKey = useSettingsStore((state) => state.licenseKey);
  const license = useSettingsStore((state) => state.license);
  const setLicenseKey = useSettingsStore((state) => state.setLicenseKey);
  const removeLicenseKey = useSettingsStore((state) => state.removeLicenseKey);

  const [draftKey, setDraftKey] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const applyKey = async () => {
    if (!draftKey.trim() || checking) {
      return;
    }
    setChecking(true);
    setFeedback(null);
    try {
      const result = await setLicenseKey(draftKey);
      if (result.licensed) {
        setDraftKey('');
        setFeedback({ tone: 'ok', text: `License activated — licensed to ${result.email}.` });
      } else {
        setFeedback({ tone: 'error', text: result.reason ?? 'This license key could not be verified.' });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-settings-license-section="true">
      <div className="rounded-xl border border-gray-700/60 bg-[#12161f]/60 p-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className={license.licensed ? 'text-emerald-300' : 'text-gray-500'} size={18} />
          <div className="text-sm font-semibold text-gray-100">{describeLicenseEdition(license)}</div>
        </div>
        <div className="mt-2 text-sm leading-6 text-gray-400">
          {license.licensed ? (
            <>
              Thank you for supporting Sloom Studio. This key unlocks the professional print-production
              exports on desktop and Android, marks your exports as licensed, and removes the startup notice.
              {license.issued ? <span className="text-gray-500"> Issued {license.issued}.</span> : null}
            </>
          ) : (
            <>
              Sloom Studio is free for personal and noncommercial use — learn it, make things, share them.
              When you start earning with what you make here, a one-time commercial license is due.
              It unlocks the commercial print-production exports — real CMYK PDF/X-1a and PDF/X-4 with an
              embedded ICC output intent, a KDP-ready print PDF, real Adobe IDML (opens in InDesign /
              Affinity Publisher), and CMYK/spot swatches. Free to license holders across the 0.9.x beta.
            </>
          )}
        </div>
        {!license.licensed ? (
          <a
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-300/70 hover:text-white"
            href={BUY_LICENSE_URL}
            rel="noreferrer"
            target="_blank"
          >
            Buy a commercial license
          </a>
        ) : null}
      </div>

      {license.licensed ? (
        <div className="rounded-xl border border-gray-700/60 bg-[#12161f]/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Active key</div>
          <div className="mt-1.5 truncate font-mono text-xs text-gray-300">{licenseKey}</div>
          <button
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:border-red-300/60 hover:text-red-100"
            onClick={() => {
              removeLicenseKey();
              setFeedback(null);
            }}
            type="button"
          >
            <Trash2 size={14} />
            Remove key from this device
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700/60 bg-[#12161f]/60 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <KeyRound size={13} />
            Enter your license key
          </div>
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-lg border border-gray-700/70 bg-[#0b0f16] p-3 font-mono text-xs text-gray-200 outline-none focus:border-cyan-400/50"
            data-settings-license-input="true"
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="SLOOM-…"
            spellCheck={false}
            value={draftKey}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-300/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!draftKey.trim() || checking}
              onClick={() => void applyKey()}
              type="button"
            >
              {checking ? 'Verifying…' : 'Activate license'}
            </button>
            <div className="text-xs text-gray-500">Verified offline — no account, no server, works forever.</div>
          </div>
        </div>
      )}

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.tone === 'ok'
              ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
              : 'border-red-400/35 bg-red-500/10 text-red-100'
          }`}
          data-settings-license-feedback={feedback.tone}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="text-xs leading-5 text-gray-500">
        The key is stored with the same encrypted-at-rest mechanism as your API keys, and travels with
        encrypted settings backups. One key covers desktop and Android.
      </div>
    </div>
  );
};
