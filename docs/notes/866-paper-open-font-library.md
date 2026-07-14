# Paper Open Font Library

Task 8 adds the opt-in Fonts panel to Settings. It makes no Fontsource request until the user clicks
`Browse open fonts`, then pins a strict package version before downloading a selected TTF face.

The catalog accepts only OFL-1.1, Apache-2.0, and MIT records. It verifies the package metadata,
authoritative license text, pinned CDN path, family response, and font bytes before storing separate
content-addressed font and license records in the Paper asset repository. Settings persist only metadata
references; encrypted settings backups intentionally omit them because they do not contain the matching
binary asset records.

An unknown OS/2 embedding flag is usable for production only when the managed face has this verified,
version-pinned open-catalog evidence. User-imported unknown-rights fonts still require the explicit
byte-bound attestation path.

Verification:

```text
npx vitest run src/lib/paperOpenFontCatalog.test.ts src/lib/paperManagedFonts.test.ts src/store/settingsStore.test.ts src/components/Settings/FontLibrarySection.test.tsx src/components/Settings/SettingsModal.test.tsx
npx tsc --noEmit
git diff --check
```
