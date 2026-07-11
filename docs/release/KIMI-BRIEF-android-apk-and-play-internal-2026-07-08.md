# Brief for Kimi: finish the Android 0.9.11 release (APK + Play internal track)

Jarrod stopped a previous kimi-cli run mid-way because the output looked like it was
"setting up a new build environment" and he wasn't sure it was doing the right thing.
Claude investigated the file timestamps/checksums afterward — here's what's actually
true, so you don't have to re-derive it.

## Verified state (2026-07-08, checked via `stat`/`md5sum`, not guessed)

- `flow/android/app/build/outputs/bundle/release/app-release.aab` — built today
  (12:00:13), and its MD5 is **identical** to
  `flow/release/play-store/SignalLoom-0.9.11.aab`. **The AAB (bundle) build
  completed successfully** before Jarrod stopped the run. `package.json` confirms
  source version `0.9.11` at the time.
- `flow/android/app/build/outputs/apk/release/app-release.apk` is **stale** — dated
  2026-07-03, five days before the 0.9.11 bundle build. **No fresh APK exists yet.**
  AAB (bundle) and APK are separate Gradle tasks (`bundleRelease` vs `assembleRelease`)
  — a successful bundle build does NOT also produce a fresh APK.
- Google Play Console (checked via the existing service-account scripts, see below)
  already has a **draft release on the `alpha` track**: version `0.9.11`, versionCode
  `12`. This may be from the same run that produced the fresh AAB above — check
  whether that draft's bundle matches the fresh AAB before re-uploading anything.

## What Jarrod actually wants (his words)

1. "Upload the aab to google, so it's available to internal testing" — meaning: get
   0.9.11 onto the **`internal` track** specifically, not `alpha` (where the current
   draft sits).
2. "Make an apk version" — build one fresh, matching current 0.9.11 source.
3. From an earlier instruction: once a real APK exists, add it to the website
   downloads and upload to itch via `butler` (already authenticated —
   `~/.config/itch/butler_creds` exists, no login needed).

## How to do the Play Console part (this is NOT a browser-login task)

There's already a working, non-interactive path: `hermes/secrets/google-play-service-account.json`
plus the Google Play Developer API (`androidpublisher`). Two existing scripts already
authenticate against it successfully and show the working pattern —
`hermes/scripts/play_tester_count.py` and `hermes/scripts/play_monitor.py`. Read
those first for the auth boilerplate (don't reinvent it), then use
`edits.tracks.update` (or `edits.bundles.upload` + `edits.tracks.update` if the
existing draft bundle doesn't match today's fresh AAB) to place 0.9.11 on the
`internal` track specifically. Package name is `studio.sloom.signalloom`.

Do not read or print the contents of the service-account JSON in any chat output —
treat it like any other credential file, reference it by path only.

## How to do the APK part

Run the Gradle `assembleRelease` task in `flow/android` against current source (same
environment that just successfully built the bundle, so this should be fast — no
need to redo whatever setup step worried Jarrod, that already happened). Confirm the
output timestamp is fresh (today) before treating it as usable, the same way Claude
verified the AAB.

## After both exist

- Add the fresh APK to the website's `downloads/` directory (stable-symlink
  convention — see the site README's "Maintenance: single-source values" section,
  don't hand-edit versioned filenames into HTML).
- Add/update the Android download link on `index.html` / `docs.html` (EN + JA) —
  coordinate with whatever the other website brief
  (`docs/release/website/KIMI-BRIEF-feature-update-2026-07-08.md`) already changed
  there, don't clobber it.
- `node verify-site.mjs` gate, then `./deploy.sh <host> --go`.
- `butler push <apk-path> <itch-user>/<itch-game>:android` (check the itch project
  page or an existing butler script in this repo for the exact target string before
  running it).

## Non-negotiable

Same as the other brief: verify before claiming, no AI-first framing, deploy gate is
mandatory, don't touch the service-account credential contents.
