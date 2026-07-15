import { describe, expect, it } from 'vitest';
import { isCommercialPrintProductionTarget } from './licenseGates';

describe('commercial print license gate', () => {
  it('keeps both PDF/X standards and CMYK press targets licensed while browser PDF stays free', () => {
    expect(isCommercialPrintProductionTarget({ pdfStandard: 'pdf-x-1a' })).toBe(true);
    expect(isCommercialPrintProductionTarget({ pdfStandard: 'pdf-x-4' })).toBe(true);
    expect(isCommercialPrintProductionTarget({ pdfStandard: 'browser-pdf', outputIntentColorSpace: 'cmyk' })).toBe(true);
    expect(isCommercialPrintProductionTarget({ pdfStandard: 'browser-pdf', outputIntentColorSpace: 'rgb' })).toBe(false);
  });
});
