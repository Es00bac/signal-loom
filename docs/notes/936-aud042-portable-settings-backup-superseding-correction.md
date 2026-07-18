# AUD-042 portable settings backup — superseding correction

Date: 2026-07-18

Base implementation tip: `f33e0f9ed2eba646702f4a469968806520d3e693`

Correction commit: `8c51311`

Role: Persona C correction author. This note records implementation and local verification only; it does not self-approve AUD-042. A different persona must perform the final read-only gate.

## Why the prior tip was rejected

The independent Persona D gate found two reachable Medium issues despite the original 57-test green matrix:

1. A decrypted `null`, array, or primitive was converted to `{}`, reported as a committed restore, and destructively reset API keys plus established preferences.
2. Import claimed the license-identity generation before decrypt/schema validation. A rejected newer schema therefore superseded an otherwise valid activation already in flight.

The disposable pre-correction probe failed both assertions on exact `f33e0f9e`: the malformed payload returned `committed`, and the valid activation returned `superseded` after the schema-v2 import was rejected. That probe was removed before this correction began.

## Atomic payload contract

Backup plaintext must now parse as a plain top-level object before any settings or license identity can change.

- Schema v1 requires `schemaVersion: 1` and the complete declared 15-field portable inventory. A missing current field rejects the whole payload before merge.
- A present unsupported schema rejects before merge or identity claim.
- Schema-less compatibility is deliberately limited to the complete eight-field core emitted by the legacy exporter (`apiKeys`, `defaultModels`, `providerSettings`, theme, keyboard, gamepad, brush presets, and crop presets). Its optional license key remains supported.
- Valid legacy backups cannot contain the six preferences old builds never exported, so those current preferences remain untouched through the existing presence-aware merge.
- Field values still pass through the same hydration/import sanitizers. Complete but hostile preference values therefore normalize safely instead of bypassing the shared rules.

Permanent parameterized coverage proves atomic rejection with an unchanged state snapshot for `null`, an array, a primitive, an incomplete schema-v1 object, and an unsupported current schema.

## Identity ordering without rollback

An import now reserves import-attempt order and observes the current license generation without mutating license identity. Only a fully decrypted, parsed, and schema-valid payload may claim a new license generation, and only when both its import reservation and observed license generation remain current.

This separates two invariants:

- rejected envelope/data schemas cannot cancel an activation or canonical verifier;
- a valid import that started earlier still cannot overwrite a later activation, removal, rehydrate, or import.

No generation rollback/decrement is used. Permanent deterministic races cover rejected envelope/schema during activation plus earlier-decrypting import versus later activation, removal, and import. Existing valid-import, late-hydration, cross-window, coalescing, and license fail-closed tests remain green.

## Product wording

The English and Japanese restore warning and success text now explicitly name editor preferences, API keys, and provider credentials. The Settings component comment matches that portable scope, and the bilingual catalog test prevents a regression back to credentials-only disclosure.

## Verification

- Focused correction matrix: 4 files, 36 tests passed.
- Full settings/backup/i18n/UI plus late-hydration/license/cross-window matrix: 10 files, 75 tests passed.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- ESLint across all eight touched production/test files — passed.
- `git diff --check` — passed.
- `npm run build` — passed; 3,279 modules transformed. Existing runtime-URL, browser externalization, and chunk-size warnings remain non-fatal and unchanged in kind.

No external provider or network service was called by this correction.
