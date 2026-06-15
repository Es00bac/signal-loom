# Windows Installer Process

Signal Loom is configured for a standard Windows NSIS installer through Electron Builder:

```bash
npm run dist:win
```

This repository only describes packaging readiness. Do not claim a signed installer artifact exists until an actual release build produces it.

## Dependency Bundling Readiness

Windows packaging depends on these installed npm packages before packaging starts:

- `electron` for the desktop runtime
- `electron-builder` for the installer build

The configured packaging inputs are the renderer output, Electron entrypoints, shared code, and package metadata:

- `dist/**/*`
- `electron/**/*`
- `shared/**/*`
- `package.json`

Electron Builder is configured for NSIS and x64:

- `electron-builder --win nsis`
- `win.target = nsis`
- `win.arch = x64`

## Signing Caveat

Windows installer packaging can be prepared on Linux, but signing credentials and final validation still need a Windows-oriented release step. NSIS packaging readiness does not by itself prove SmartScreen reputation, Authenticode signing, or final installer verification.
