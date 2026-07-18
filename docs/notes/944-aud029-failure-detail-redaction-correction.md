# AUD-029 failure-detail redaction correction — 2026-07-18

## Final narrow author correction

Fresh review of the superseding media-boundary correction found one remaining failure-summary gap: a labeled Basic value could be reduced to `Authorization: [redacted] <encoded-value>`, leaving the encoded portion visible. Production/tests commit `a0112e3e` removes the complete scheme-plus-value credential while preserving the status and cause text that makes a renderer/native failure actionable.

The correction:

- recognizes Basic and Bearer values case-insensitively with spaces or tabs between the scheme and value;
- removes the complete value after `Authorization:` or `Authorization=`, including mixed case and extra spacing;
- retains prior detached Bearer protection and adds bounded detached Basic recognition without erasing ordinary prose that happens to use “basic” or “bearer”;
- stops at comma, semicolon, or line boundaries so adjacent HTTP status and cause text remains readable;
- leaves all AUD-029 MIME-family, byte-bound, cancellation, native fallback, object-URL ownership, and no-provider-submit behavior unchanged.

## Permanent coverage

`remoteMediaFetch.test.ts` now exercises the exact `Authorization: Basic dXNlcjpwYXNzd29yZA==` shape plus labeled and detached Basic/Bearer, mixed capitalization, extra spaces, comma/semicolon/newline boundaries, renderer HTTP 429, Electron HTTP 403, and controls proving ordinary “basic renderer diagnostics” and “a bearer of news” phrases remain visible.

## Author verification

- Focused remote/media matrix: **3 files passed; 54 tests passed**.
- Adjacent Flow execution plus remote-media matrix: **23 files passed; 286 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- Touched-file ESLint and `git diff --check` — passed.
- `npm run verify:flow-production` — **9 files passed; 375 tests passed**; static audit passed for **63 nodes, 182 model contracts, and 178 normal model options**.
- `npm run build` — passed with only the established runtime-URL, browser-module externalization, deprecation, and chunk-size warnings.

This is superseding author evidence only. Fresh independent review remains required; no approval, integration, or audit closure is claimed.
