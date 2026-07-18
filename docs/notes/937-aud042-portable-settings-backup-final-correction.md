# AUD-042 portable settings backup — final correction evidence

Date: 2026-07-18

Correction base: `6726c8e2053af520bf014ca3296d2a955666e0bf`

Production/test correction: `762495d`

Role: Product Mechanic correction author. This note records implementation and local verification only; it does not self-approve or integrate AUD-042.

## Independently reproduced gaps

The read-only gate reproduced two Medium contract failures at the correction base:

1. A schema-less object containing the complete legacy core could also carry the six schema-v1 preferences. Import accepted and applied those extra fields, overwriting preferences that a genuine legacy exporter could never have written.
2. Import attempt order advanced before decryption and validation. A later rejected envelope, malformed plaintext, incomplete schema-v1 payload, or unsupported schema could therefore make an earlier valid import still decrypting return `superseded`.

Both disposable gate probes failed on exact `6726c8e2` and were removed before correction authorship.

## Correction

- The schema-less compatibility path now validates the complete eight-field legacy exporter core, then projects the accepted data onto exactly those fields plus a string license key when present. Schema-v1 preferences and arbitrary extra fields cannot enter the legacy merge.
- Import invocation order remains monotonic, but rejected attempts do not enter valid-import ordering. Once a payload has decrypted, parsed, and passed its schema contract, it may enter that ordering and claim license identity only if no later valid import or license-identity operation owns the state.
- Import invocation order still determines the winner between valid imports even when decryption completes out of order.
- Existing generation checks continue to ensure that a later valid activation, removal, rehydrate, or import wins.

## Permanent regression coverage

- A schema-less payload with the complete legacy core, all six newer preferences, and an arbitrary future field commits only its legacy fields and preserves all six current preferences.
- A valid import held during decryption still commits after each kind of later rejected import: unsupported envelope, malformed plaintext, incomplete current schema, and unsupported current schema.
- Existing deterministic neighbors proving later valid activation, removal, and import ownership remain green.
- The existing current schema round-trip, 15-field completeness, plaintext-shape atomicity, encryption, hydration, license, UI, and bilingual-copy tests remain green.

## Verification

- Focused/adjacent settings, backup, i18n, UI, hydration, cross-window, and license matrix: 10 files, 80 tests passed.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- ESLint across all three touched production/test files — passed.
- `git diff --check` — passed.
- `npm run build` — passed; 3,279 modules transformed. Existing runtime-URL, browser-externalization, and chunk-size warnings remain non-fatal.

No external provider or network service was called.
