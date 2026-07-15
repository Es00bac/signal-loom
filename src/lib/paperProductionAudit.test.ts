import { describe, expect, it } from 'vitest';
import { PAPER_PROJECT_1_AUDIT, paperAuditEntry } from './paperProductionAudit';

describe('Paper Project 1 audit ledger', () => {
  it('tracks every release-blocking production defect with evidence fields', () => {
    const required = [
      'asset-inline-base64', 'font-system-authority', 'icc-profile-substitution',
      'process-cmyk-roundtrip', 'spot-rich-text-overclaim', 'overprint-not-emitted',
      'pdfx-download-after-failure', 'stability-provider-contract', 'stability-effective-ppi',
    ];
    expect(PAPER_PROJECT_1_AUDIT.map((entry) => entry.id)).toEqual(expect.arrayContaining(required));
    for (const id of required) {
      expect(paperAuditEntry(id)).toMatchObject({ severity: expect.any(String), evidence: expect.any(Array) });
    }
  });

  it('keeps live Stability output evidence external-pending when the configured provider cannot run', () => {
    expect(paperAuditEntry('stability-provider-contract')).toMatchObject({
      status: 'verified',
    });
    expect(paperAuditEntry('stability-effective-ppi')).toMatchObject({
      status: 'external-pending',
      evidence: expect.arrayContaining([
        'docs/audits/paper-stability-live-2026-07-14.md',
      ]),
    });
  });

  it('closes every local production defect only with current focused and repository-wide evidence', () => {
    const verifiedLocally = [
      'asset-inline-base64',
      'font-system-authority',
      'icc-profile-substitution',
      'process-cmyk-roundtrip',
      'spot-rich-text-overclaim',
      'overprint-not-emitted',
      'pdfx-download-after-failure',
      'stability-provider-contract',
    ];

    for (const id of verifiedLocally) {
      expect(paperAuditEntry(id)).toMatchObject({
        status: 'verified',
        tests: expect.arrayContaining([expect.any(String)]),
      });
    }
  });
});
