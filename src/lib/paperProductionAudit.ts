export type PaperAuditSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PaperAuditStatus = 'reproduced' | 'fixed' | 'verified' | 'external-pending';

export interface PaperProductionAuditEntry {
  id: string;
  severity: PaperAuditSeverity;
  status: PaperAuditStatus;
  commercial: boolean;
  summary: string;
  evidence: string[];
  tests: string[];
}

export const PAPER_PROJECT_1_AUDIT: readonly PaperProductionAuditEntry[] = [
  { id: 'asset-inline-base64', severity: 'high', status: 'reproduced', commercial: false, summary: 'Paper stores binary assets in JSON/runtime state.', evidence: ['PaperImportedFont.dataBase64', 'PaperFrameAsset.src data URLs'], tests: [] },
  { id: 'font-system-authority', severity: 'critical', status: 'reproduced', commercial: true, summary: 'System/browser family names can change production typography.', evidence: ['PaperTypography.fontFamily', 'browserCanCheckFont'], tests: [] },
  { id: 'icc-profile-substitution', severity: 'critical', status: 'fixed', commercial: true, summary: 'Strict PDF/X resolves only the selected, hash-verified managed ICC asset; no output-condition fallback remains.', evidence: ['paperManagedIccProfiles.resolveExactPaperOutputProfile', 'PaperIccProfileManager'], tests: ['paperManagedIccProfiles.test.ts', 'paperPdfxPipeline.test.ts', 'paperPreflight.test.ts'] },
  { id: 'process-cmyk-roundtrip', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Authored process CMYK is rasterized through RGB.', evidence: ['paperPdfxPipeline raster backdrop'], tests: [] },
  { id: 'spot-rich-text-overclaim', severity: 'high', status: 'reproduced', commercial: true, summary: 'Preflight can claim a rich text spot plate that export rasterizes.', evidence: ['collectSpotTextNames'], tests: [] },
  { id: 'overprint-not-emitted', severity: 'high', status: 'reproduced', commercial: true, summary: 'Overprint is preview metadata without PDF graphics state.', evidence: ['PaperPrintProductionSpec.overprintPreview'], tests: [] },
  { id: 'pdfx-download-after-failure', severity: 'critical', status: 'reproduced', commercial: true, summary: 'PDF/X bytes save after internal validation failure.', evidence: ['exportPaperPdfxAndSave'], tests: [] },
  { id: 'stability-provider-contract', severity: 'high', status: 'verified', commercial: false, summary: 'Paper validates Stability input limits, blocks an unconfigured BYOK provider before a paid call, and stores only verified binary provider output.', evidence: ['paperStabilityUpscale', 'paperStabilitySource', 'docs/audits/paper-stability-live-2026-07-14.md'], tests: ['paperStabilityUpscale.test.ts', 'paperStabilitySource.test.ts', 'paperProductionAudit.test.ts'] },
  { id: 'stability-effective-ppi', severity: 'critical', status: 'external-pending', commercial: true, summary: 'Paper records provider dimensions and achieved placed PPI without locally fitting Stability output; live provider-result evidence remains pending because this environment has no configured Stability BYOK key.', evidence: ['buildPaperManagedPrintUpscaledFramePatch', 'PaperStabilityPrintUpscaleEvidence', 'paperPreflight', 'docs/audits/paper-stability-live-2026-07-14.md'], tests: ['paperStabilityUpscale.test.ts', 'paperImageUpscale.test.ts', 'paperPreflight.test.ts', 'paperProductionAudit.test.ts'] },
] as const;

export function paperAuditEntry(id: string): PaperProductionAuditEntry | undefined {
  return PAPER_PROJECT_1_AUDIT.find((entry) => entry.id === id);
}
