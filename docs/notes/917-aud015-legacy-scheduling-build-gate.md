# 917 — AUD-015 legacy scheduling reconciliation and build gate

**Baseline:** clean `de81ac2`; **correction commit:** `a4c74e4`; `31e941a` preserved without amend, rebase, integration, or push. This note supersedes the incomplete gate recorded in note 916. The author is the Sol follow-up author, not the approver.

## Finding and correction

The reported `settingsStoreLicenseRace.test.ts` failures reproduced exactly: 7/9 passed, same-key rehydrate found no second verifier, and activation→backup-import timed out. Both failing proofs passed when selected in isolation. The full-file failure was cross-test fixture bleed: per-key persistence now recursively awaits each encrypted immutable record, while the legacy helper advanced only ten Promise microtasks. An old module registry therefore continued consuming the next test's shared deferred cipher/verifier controls after `vi.resetModules()`.

The fixture now crosses a complete event-loop turn, asserts after every test that no deferred decrypt or verifier remains, and keeps every ownership/gate assertion. The older `settingsStoreLicenseHydration` matrix exposed the same obsolete assumption: its cache-decrypt controller was also holding immutable record decrypts, and its direct "remote" cache seed could race an older local cache write. Record envelopes now resolve independently, and simulated remote replacement begins only after prior local persistence settles. This preserves the intended proof: cache hydration remains controlled; activation, removal, import, rehydrate, verifier generation ownership, and fail-closed commercial gates remain asserted.

No settings/license production semantics changed. One unrelated pre-existing full-lint blocker in `desktopPackaging.ts` was corrected mechanically from two literal regex spaces to ` {2}`; its checksum-matching behavior is identical.

## Completed evidence

| Gate | Result |
| --- | --- |
| Original failing race file, repeated | 3 runs × 9/9 passed |
| Old hydration + new race files, repeated | 3 runs × 13/13 passed |
| Complete focused multi-window/settings/license/UI matrix | 23 files, 131/131 passed |
| Desktop packaging regression | 1 file, 8/8 passed |
| Flow production gate | 9 files, 313/313 passed; semantic verifier passed for 63 nodes, 182 model contracts, 178 normal options |
| Forced TypeScript | `tsconfig.app.json`, `tsconfig.node.json`, and root `tsconfig.json` each passed with `tsc -b --force` |
| Changed-file ESLint | 0 errors, 0 warnings |
| Full repository ESLint | 0 errors, 83 warnings |
| Diff hygiene | `git diff --check` passed |
| CI build | `CI=1 npm run build` completed: 3,247 modules transformed; production assets rendered; exit 0 |

## Remaining risks

- Repository lint still reports 83 non-blocking pre-existing warnings outside this correction.
- The production build remains warning-bearing: Vite reports runtime-resolved `new URL("./", import.meta.url)`, browser externalization notices for the HarfBuzz/LCMS `module` import, and chunks above 500 kB. None blocked output.
- The deterministic suites model browser windows/module registries and shared storage; this follow-up did not add installed-Electron, native multi-process, or live paid-license-key evidence.
- Fresh Terra approval is still mandatory. This author does not self-approve.
