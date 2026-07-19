# Public release 0.9.13

## Outcome

`0.9.13` is the public packaging point for the completed 79-finding audit repair set and the post-audit creative-fidelity work documented in this guide. It supersedes the internal `0.9.12d` milestone without changing the frozen audit denominator: the two audit reports remain **79/79 implemented, mapped, integrated, and independently gated**.

The release also contains the later hands-on corrections prompted by the real origin-zine project: Paper editor/export typography parity, corrected drop caps and leading, exact managed-font restoration, safer blank-project startup, durable Source Library imports, compact workspace chrome, 173 calibrated Image brushes in 22 collapsible sets, and full physical Wacom stylus azimuth.

## Release-level gates

The final candidate passed both release gate groups before packaging:

- `npm run gate:local`: production build, zero-error lint, 733 test files / 6,901 tests, and eight application smoke tests.
- `npm run gate:native`: Electron smoke, Video rendering, real-project startup, stress, soak, and Paper PDF/editor parity. The final Paper normalized RMSE was `0.048588`.
- GitHub's multi-platform release workflow completed successfully for managed fonts, Android, Windows, Linux, macOS Intel, and macOS Apple Silicon.

The two Google Play advisory warnings are not functional failures: the Android bundle does not include an R8/ProGuard deobfuscation map or separate native debug-symbol archive. Both affect crash-report symbolication, not installation or execution, and Play accepted the Internal testing release.

## Published artifacts

| Platform | Public artifact |
|---|---|
| Windows | `SloomStudio-Setup-0.9.13.exe` |
| Linux | `SloomStudio-0.9.13-x86_64.AppImage`, `SloomStudio-0.9.13-amd64.deb` |
| macOS Intel | `SloomStudio-0.9.13-x64.dmg`, `SloomStudio-0.9.13-x64.zip` |
| macOS Apple Silicon | `SloomStudio-0.9.13-arm64.dmg`, `SloomStudio-0.9.13-arm64.zip` |
| Android direct install | signed `SloomStudio-0.9.13-android.apk` |
| Android store install | signed `SloomStudio-0.9.13-android.aab`, Google Play version code `15` |

The signed Android APK SHA-256 is `38719a297ed697914ee446f3eb78cf41cd7ea5793f2e914136d2bbeb04a6260d`. The signed App Bundle SHA-256 is `0925f58f7d178a738ff85b066d1814ffdf4b9a898b3415b7d5913bff8ef54316`.

## Publication destinations

- GitHub: public release tag `v0.9.13`, with all nine platform artifacts and the signed Android bundle.
- `sloom.studio`: English and Japanese site deployment, stable desktop download aliases, direct signed APK, exact SHA-256 manifest, privacy page, and update metadata.
- itch.io: Android, Linux AppImage, Linux DEB, Windows, macOS Intel, and macOS Apple Silicon release channels.
- Google Play: Internal testing track, release `15 (0.9.13)`, status `completed` and available to internal testers.
- Local Application Menu: the installed Linux desktop package points at the final `0.9.13` build.

## What users should now experience

Opening the application starts with a blank project unless the user explicitly opts into remembered-project reopening. Loading older projects no longer forces the startup save/discard loop described in the audit-repair session. Project authority, asset adoption, Paper tabs, and managed resources fail with explicit recovery guidance instead of silently replacing newer work.

Paper's editor and exports now share the corrected text-composition decisions for the zine cases that exposed the gap: the first paragraph alone receives a drop cap, authored hard breaks remain hard breaks, line spacing and contextual glyph metrics agree, variable-face descriptors survive, and clipped editor words are not treated as acceptable merely because export happened to contain them.

Flow execution keeps the repaired ownership, cancellation, retry, cache, scheduling, signal, and provider-result contracts from the two audits. Image retains durable histories and gains the expanded professional brush library and corrected stylus rotation. Video retains the repaired export/comic lifecycle and source-ownership behavior.

## Honest boundary

This release proves the frozen audits and the named post-audit regressions are repaired in the packaged candidate. It is not a claim that a large creative application can never contain another defect. The durable evidence is the row mapping, focused regression tests, full local/native gates, platform build workflow, signed hashes, live-download byte checks, and successful store/channel publication recorded here.
