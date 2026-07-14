# Paper Managed ICC Profiles

Task 11 replaces Paper's PDF/X output-intent substitution with exact managed CMYK ICC records.

- `PaperManagedIccProfile` stores only typed metadata plus a content-addressed asset reference. The profile ID is the asset hash; ICC bytes remain in the Paper asset repository and `.slppr` binary entries.
- `parseAndValidateCmykOutputProfile()` verifies the ICC header (`acsp`, `prtr`, `CMYK`, Lab/XYZ PCS, declared size) and creates a disposable Little CMS sRGB-to-CMYK transform before an import is accepted.
- `resolveExactPaperOutputProfile()` rechecks the stored record hash, asset reference, and header at export/soft-proof time. There is no default profile or nearest-condition substitution.
- The Paper print inspector exposes an `.icc`/`.icm` manager. It writes only after an output condition is named, selects the new profile explicitly, and clears the selection when the output condition changes.
- PDF/X and KDP browser exports plus soft proof now load the document's selected managed profile. PDF/X preflight blocks missing, malformed, or output-condition-mismatched records. Snapshots and `.slppr` reachability include ICC assets without inline Base64.

The user must import the exact profile supplied or approved by the print provider. ICC headers do not provide a trustworthy universal mapping from a profile description to a print-provider contract, so Paper does not infer or substitute one.

Focused verification: `paperManagedIccProfiles`, `PaperIccProfileManager`, PDF/X pipeline/vector-text, preflight, Paper document/assets, and project-validation tests; `npm run build` passed. The build retained existing Vite externalization and chunk-size warnings.
