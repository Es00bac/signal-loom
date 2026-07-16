# Terra quickwins repair sprint — 2026-07-16

All requested findings were repaired with a focused red/green regression and a
separate commit. Focused Vitest commands use `--configLoader runner` because
the default loader writes temporary config output into the shared dependency
directory.

| Finding | Status | Commit | Red/green verification | Residual risk |
| --- | --- | --- | --- | --- |
| AUD-014 | Fixed | `3fb94b3` | `npx vitest run --configLoader runner src/store/settingsStore.test.ts` — red: supplied BytePlus key sanitized to `''`; green: 1 file, 13 tests passed. | Future credential providers must join the shared API-key registry. |
| AUD-044 | Fixed | `074feb2` | `npx vitest run --configLoader runner src/App.flowContextMenu.test.tsx` — red: locale switch then canvas menu showed `Generate`; green: 1 file, 1 test passed with `生成`. | Test deliberately mocks the surrounding workspaces while exercising App's callback boundary. |
| AUD-017 | Fixed | `dbd0067` | `npx vitest run --configLoader runner src/lib/paperDocumentFormats.test.ts` — red: `.sloom-paper.json` inferred as TXT; green: 1 file, 26 tests passed. | This covers native Paper JSON; foreign JSON remains ordinary text unless it has a supported extension. |
| FBL-015 | Fixed | `7396d17` | `npx vitest run --configLoader runner src/lib/flowSignals.test.ts src/lib/flowVariables.test.ts` — red: local double-brace slots blocked and rendered as `{value}`; green: 2 files, 32 tests passed. | Triple-brace syntax remains intentionally unspecified. |
| FBL-016 | Fixed | `544eaae` | `npx vitest run --configLoader runner src/lib/flowSignals.test.ts src/lib/listNodes.test.ts src/lib/listExecution.test.ts` — red: shuffled edges yielded slot 1 before slot 0; green: 3 files, 49 tests passed. | Duplicate edges on one numbered slot retain the established latest-edge behavior. |
| FBL-028 | Fixed | `241f59d` | `npx vitest run --configLoader runner src/lib/providerCatalog.test.ts src/lib/flowExecutionElevenLabsAudio.test.ts` — red: valid `mp3_48000_192` became `mp3_44100_128`; green: 2 files, 40 tests passed. | The accepted formats derive from the UI/catalog enum and should be maintained with provider capability updates. |
| FBL-035 | Fixed | `f277a97` | `npx vitest run --configLoader runner src/lib/desktopPackaging.test.ts` — red: absent staged library claimed ready; green: 1 file, 8 tests passed. `npx tsc -b` passed. | Packaging readiness now correctly blocks until `npm run prepare:font-library` stages the approved 116-family/430-face library and all checksummed bytes. |

## Implementation notes

- BytePlus now participates in the same persistence, redaction, and status
  registry as the other API-key providers.
- Flow context-menu callback dependencies include `locale`; Paper import has a
  dedicated `.sloom-paper.json` route through the validated Paper parser.
- Local String Template slots are canonicalized to lowercase for diagnostics
  and rendered by a longest-delimiter, case-insensitive replacement pattern.
- Numbered List input handles now share one ordering helper across the List
  model and Flow signal evaluation.
- Packaging validation verifies inventory shape, the approved 116/430 counts,
  all manifest face hashes, checksum manifest entries, and non-empty staged
  byte hashes before reporting the font resource ready.
