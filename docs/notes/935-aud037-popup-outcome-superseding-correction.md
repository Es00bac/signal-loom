# AUD-037 popup-outcome superseding correction

## Scope

- Candidate before correction: `07f89c64a9ec071db4bac622e44250192459138b`
- Production/test correction: `f68eb48`
- This note supersedes the incomplete proof in `934-aud037-popup-outcome-regression-proof.md`.
- Closure accounting is unchanged pending an independent regate.

The independent read-only gate found three gaps in the prior proof: Chromium returned `null` for the shipping `noopener,noreferrer` feature string even when it created a tab; exact-font readiness and popup DOM/print failures rejected instead of returning the required failed outcome; and the popup-blocked Android fallback reported completion before ordered storage finished.

## Correction

- Browser preview now calls `window.open('', '_blank')` before asynchronous font assembly, synchronously clears the returned window's `opener`, and only then prepares/writes the exact-font HTML.
- `PaperPrintPreviewOutcome` explicitly carries `printed`, `html-fallback`, or `failed`. Font assembly, popup isolation, document write, font readiness, focus/print, browser-download startup, and native-storage failures all settle as typed results rather than escaping the browser caller.
- Popup-blocked browser fallback reports only that the download was started because browsers do not expose completion.
- Android awaits the existing `Documents -> External -> Data` storage cascade. It reports the actual winning location, or `failed` after all three destinations reject.
- `exportPaperPdfDocument` maps both fallback and failure to a deterministic error outcome/status, so all three shipping `.then(finishPaperExportNotice)` callers settle without an unhandled preview rejection.

## Regression proof

Red gate against the prior candidate:

```text
npx vitest run --configLoader runner src/components/Paper/PaperWorkspaceUtils.test.ts
Test Files  1 failed (1)
Tests       9 failed | 47 passed (56)
```

The failures covered the feature-string handle mismatch, premature browser/Android messages, native destination ordering and total failure, browser fallback startup failure, managed-font readiness rejection, and popup write/print rejection.

Final focused result: `PaperWorkspaceUtils.test.ts` — 56/56 passed.

Final adjacent result:

```text
Test Files  6 passed (6)
Tests       123 passed (123)
```

The six-file sweep covered component and feature Paper workspace utilities, Paper document/export production behavior, exact managed fonts, print-production metadata, and shared downloads.

## Real Chromium probe

A direct user-click Playwright Chromium probe reproduced the old mismatch: the `noopener,noreferrer` call created an `about:blank` tab but returned `null`. The corrected no-feature call created the tab, returned a `WindowProxy`, and read back `opener === null` immediately after isolation. Probe artifacts were removed after the bounded check.

## Static and production gates

- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — pass
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — pass
- touched ESLint across both Paper files and both shared download/export files — pass
- `git diff --check` — pass
- Paper production verifier — pass for golden generation, both PDF standards, and all 10 local tool checks
- Adobe Acrobat Pro Preflight — external-pending; no certification is claimed

## Residuals

- Browser download APIs cannot prove that a user-selected file reached disk, so the browser fallback deliberately says “started,” never “downloaded” or “saved.”
- AUD-037 still requires a different persona's approval before it may be mapped to the already-recorded closure total; this correction does not increment that total.
