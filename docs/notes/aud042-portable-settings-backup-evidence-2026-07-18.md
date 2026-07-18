# AUD-042 — portable encrypted settings backup evidence

## Scope

- Base: `17b2f76e66fef5aa460d259cb7ccad0cde7bd7b5`
- Branch: `audit/aud042-settings-backup-20260718`
- Implementation: `6b05dba0`
- Finding: the encrypted backup omitted six persisted editor preferences, despite the UI describing the backup as portable settings.

The versioned payload now declares and exports all 15 user-meaningful persisted settings fields: API keys, default models, default image-node model, provider settings, theme, menu style, density, locale, locale-chosen gate, keyboard shortcuts, gamepad bindings, brush presets, crop presets, open-font library metadata, and license key. Runtime panels/dialog state, hydration state, actions, and the derived license verdict remain excluded.

Persisted hydration and backup import share the same sanitizers for the six formerly omitted preferences. Schema-less legacy backups remain importable and preserve preferences that their older schema could not carry. A present unsupported schema version fails without applying the payload.

## Regression proof

Old-code red gate:

```text
npx vitest run --configLoader runner src/store/settingsStoreBackup.test.ts
Test Files  1 failed (1)
Tests       2 failed | 1 passed (3)
```

The failures proved that the old export omitted `defaultImageNodeModel`, `appMenuStyle`, `interfaceDensity`, `locale`, `localeChosen`, and `openFontLibrary`, and that import did not round-trip those fields through the persistence sanitizers.

Final focused gate:

```text
npx vitest run --configLoader runner \
  src/lib/settingsBackup.test.ts \
  src/store/settingsStore.test.ts \
  src/store/settingsStoreBackup.test.ts \
  src/store/settingsStoreLateHydration.test.ts \
  src/store/settingsStoreLicenseCrossWindow.test.ts \
  src/store/settingsStoreLicenseHydration.test.ts \
  src/store/settingsStoreLicenseRace.test.ts \
  src/components/Settings/SettingsModal.test.tsx \
  src/components/Settings/FontLibrarySection.test.tsx
Test Files  9 passed (9)
Tests       57 passed (57)
```

The three new permanent tests prove a complete 15-field export/decrypt/import round-trip, sanitization parity for malformed preference fields, runtime-field exclusion, and schema-less legacy compatibility.

Additional gates:

- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — pass
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — pass
- `npx eslint src/store/settingsStore.ts src/store/settingsStoreBackup.test.ts` — pass
- `git diff --check` — pass
- `npm run build` — pass; 3,279 modules transformed

## Residuals

- `openFontLibrary` is intentionally metadata-only. Font binary bytes remain in the Paper repository and are not duplicated into a settings backup.
- This repair is portable export/import, not live settings synchronization.
- The successful production build retains existing Vite warnings for runtime-resolved URLs, browser-externalized modules, and large chunks; AUD-042 adds no build failure.
