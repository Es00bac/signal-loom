# macOS Build Process

Signal Loom can be configured for macOS packages from this repository, but final DMG creation, signing, and notarization should run on macOS. Linux can produce an unsigned zip with `npm run dist:mac:zip`, but `npm run dist:mac` may fail on Linux because Electron Builder's DMG flow uses Apple tools such as `sips`.

The readiness here is descriptor-only. Do not claim a notarized app package exists until a macOS release build completes successfully.

## Unsigned Local macOS Build

Run these commands on a Mac with Xcode Command Line Tools installed:

```bash
npm ci
npm run icons:mac
npm run dist:mac
```

This creates a DMG and ZIP in `release/`. The icon helper creates `build/icon.icns` from the shared PNG icon before Electron Builder packages the app.

## Signed and Notarized Build

Use a Developer ID Application certificate in the login keychain, then export the notarization credentials before running the same build:

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=true
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"

npm ci
npm run icons:mac
npm run dist:mac
```

The Electron Builder macOS config enables hardened runtime and uses `build/mac/entitlements.mac.plist` for Electron-compatible JIT, native module loading, user-selected file access, and network client access.

## Linux Fallback

From Linux, use:

```bash
npm run dist:mac:zip
```

That path is useful for packaging smoke checks and dependency bundling, but it does not replace a signed and notarized macOS build created on macOS. Linux can only smoke-check the unsigned ZIP path and cannot replace the Mac packaging/signing/notarization process.
