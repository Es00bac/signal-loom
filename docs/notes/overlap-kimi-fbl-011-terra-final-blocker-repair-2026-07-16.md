# FBL-011 Terra final-blocker correction

Date: 2026-07-16
Branch: `overlap/kimi-managed-font-identity`
Reviewed clean HEAD: `e8ff6fcb40c70f3b1c8f1dd22afdc46d420a7bf0`
Production/tests correction: `d42a92e`
Scope base: `fbdad282e5edd107c479fe6babe03175824f07c2`

## Review disposition

Terra's fresh final review of `e8ff6fc` returned **BLOCK** on exactly two remaining FBL-011 issues. This correction addresses those two issues only. It does not claim approval; a fresh Terra read-only gate follows.

No Paper/FBL-010 production path was changed. The established schema-v2 identity, unique resolution, malformed/legacy issue persistence, store-mutation preflight, Image and normal Video alias paths, nonzero collection fail-closed behavior, and cache identity coverage remain intact.

## Blocker 1 — native Video frame-export sizing

Native frame-export pre-layout previously passed only `clip.textFontFamily` into `resolveTextSourceDimensions`, which reached `editorTextRender`'s hard-coded `700 <human-family>` canvas font. Final text-card paint used the managed runtime alias and richer Video typography, so a same-named installed system face could change the fitted box before the correct managed glyphs were painted.

The correction adds `src/lib/videoTextCardLayout.ts` as the shared text-card metrics boundary. Native pre-layout and `renderTextCard` now resolve the same text, size, exact managed alias, face-owned weight/style/stretch, kerning, tracking, leading, alignment, legacy effect mapping, and stroke/shadow/arc padding. `resolveStageFrameTextClipDimensions` explicitly awaits managed dependency registration and byte verification before invoking that resolver; a `managedFaceIssue` blocks before sizing. Content that never claimed an exact face continues to measure its authored human family honestly.

The native regression uses a same-named system face with deliberately 10× wider metrics and an exact managed reference at weight 530, oblique style, and 82% stretch. It proves registration resolves before any measurement, pre-layout and card paint use the same complete-identity alias and descriptor tuple, both produce the same canvas dimensions, and cache signatures vary with kerning, leading, tracking, managed weight, style, and stretch inputs.

## Blocker 2 — registration hook render purity

`useManagedFontRegistrationGate` no longer reads or writes any ref during render. Completion state is keyed by the dependency object, registrar, retry attempt, and complete dependency signature. Each committed effect owns an effect-local cancellation flag; cleanup rejects stale completion after committed A→B changes or unmount. Render derivation is pure: empty dependencies return ready, while a dependency/registrar/retry/signature mismatch returns loading without exposing managed or fallback content.

The concurrency regression commits request A, starts a transition that renders B and suspends before commit, proves B never starts registration, synchronously abandons that work by returning to A, and then proves A remains the sole request whose completion reaches ready. The existing committed A→B stale-completion, error, retry, first-paint loading, and no-fallback assertions remain green; an explicit empty-dependency ready regression was added.

## Verification

- Focused managed-font/native-export/registration matrix: 25 files / 314 tests passed with `--configLoader runner`.
- Broad Image/Video/project/Electron/cache/export matrix: 65 files / 638 tests passed with `--configLoader runner` (Terra's prior 633 plus five new regressions at the time of that run).
- Forced app TypeScript: `npx tsc -p tsconfig.app.json --noEmit --incremental false` passed.
- Forced node TypeScript: `npx tsc -p tsconfig.node.json --noEmit --incremental false` passed.
- Forced project references: `npx tsc -b --force` passed.
- NUL-safe full FBL-011-lineage ESLint: 41 files, 0 errors, 33 existing warnings. The corrected hook has no `react-hooks/refs` errors and no `set-state-in-effect` warning.
- `git diff --check` passed.
- Production build: `npm run build` passed.
- Current and full-lineage boundary checks found no Paper/FBL-010 production paths.

## Residuals

- The 33 lint warnings are pre-existing warnings in large Image/Video lineage files plus two stale disable comments in stage export; there are zero lint errors.
- The checked-in inventory remains standalone TTF. Nonzero TTC/OTC members remain intentionally blocked because browser `FontFace(ArrayBuffer)` cannot portably select a collection member.
- Browser font/canvas behavior is deterministically stubbed for adversarial metric tests. Packaged Electron restart/transfer checks on each shipping operating system remain useful external evidence.
- Final disposition is pending the fresh Terra read-only gate. This note does not declare approval.
