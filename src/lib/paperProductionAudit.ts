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
  { id: 'icc-profile-substitution', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Selected output conditions can map to different ICC profiles.', evidence: ['INTENT_TO_BUNDLED'], tests: [] },
  { id: 'process-cmyk-roundtrip', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Authored process CMYK is rasterized through RGB.', evidence: ['paperPdfxPipeline raster backdrop'], tests: [] },
  { id: 'spot-rich-text-overclaim', severity: 'high', status: 'reproduced', commercial: true, summary: 'Preflight can claim a rich text spot plate that export rasterizes.', evidence: ['collectSpotTextNames'], tests: [] },
  { id: 'overprint-not-emitted', severity: 'high', status: 'reproduced', commercial: true, summary: 'Overprint is preview metadata without PDF graphics state.', evidence: ['PaperPrintProductionSpec.overprintPreview'], tests: [] },
  { id: 'pdfx-download-after-failure', severity: 'critical', status: 'reproduced', commercial: true, summary: 'PDF/X bytes save after internal validation failure.', evidence: ['exportPaperPdfxAndSave'], tests: [] },
  { id: 'stability-provider-contract', severity: 'high', status: 'reproduced', commercial: false, summary: 'Paper can submit invalid Stability dimensions or creativity.', evidence: ['paperImageUpscale', 'buildStabilityUpscaleRequest'], tests: [] },
  { id: 'stability-effective-ppi', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Local fitting can be described as generated print detail.', evidence: ['fitProviderResultToTargetDataUrl'], tests: [] },
] as const;

export function paperAuditEntry(id: string): PaperProductionAuditEntry | undefined {
  return PAPER_PROJECT_1_AUDIT.find((entry) => entry.id === id);
}
