# Linux Build Notes

## Linux host limitation

Linux can build the configured Linux packages and can smoke-check some cross-platform packaging paths, but it cannot produce the final signed/notarized macOS app package.

Configured Linux package targets:

- `AppImage`
- `deb`

Run:

```bash
npm run dist:linux
```

Linux can also run `npm run dist:mac:zip` as an unsigned macOS ZIP smoke check, but that does not replace the macOS packaging process documented in [macOS Build Process](./macos-build.md).
