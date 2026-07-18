# AUD-029 alphabetic Bearer redaction correction — 2026-07-18

## Last bounded author correction

Fresh review found that the detached-value predicate added in `a0112e3e` recognized Bearer values containing digits or token punctuation but did not recognize a long opaque value containing only letters, such as `Bearer abcdefghijklmnop;`. Production/tests commit `91202dac` closes that exact gap without turning ordinary uses of “basic” or “bearer” into blanket redactions.

The correction:

- recognizes alphabetic-only detached Bearer values of at least twelve characters, alongside the existing token-shaped predicate;
- applies detached scheme recognition only at diagnostic segment boundaries: start of text, line boundaries, or adjacent punctuation;
- retains the unconditional labeled `Authorization:` / `Authorization=` handling from the prior correction;
- preserves ordinary “basic renderer,” “bearer of news,” and short `Bearer short` wording;
- retains all previously verified MIME-family, byte-bound, cancellation, native fallback, status-detail, object-URL ownership, and no-provider-submit behavior.

## Permanent coverage

`remoteMediaFetch.test.ts` now proves alphabetic-only Bearer removal in detached start/newline/punctuation positions, mixed capitalization, and labeled Authorization form. The same case proves renderer HTTP 401 and native HTTP 403 remain visible, while ordinary phrases and short words remain readable.

## Author verification

- Focused remote/media matrix: **3 files passed; 55 tests passed**.
- Adjacent Flow execution plus remote-media matrix: **23 files passed; 287 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- Touched-file ESLint and `git diff --check` — passed.
- `npm run verify:flow-production` — **9 files passed; 375 tests passed**; static audit passed for **63 nodes, 182 model contracts, and 178 normal model options**.
- `npm run build` — passed with only the established runtime-URL, browser-module externalization, deprecation, and chunk-size warnings.

This is superseding author evidence only. Fresh independent review remains required; no approval, integration, or audit closure is claimed.
