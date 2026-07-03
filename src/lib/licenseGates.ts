/**
 * Commercial-license feature gates (licensing spec Part 2 §5). Everything noncommercial stays
 * fully free — webcomics, CBZ, PNG/JPG, video renders, HTML, story text. The gates cover exactly
 * where professional money starts: KDP, PDF/X-4, PDF/X-1a, IDML interchange, and CMYK/spot print
 * production. A gate is an unlock path, never a dead end: the prompt's confirm action opens
 * Settings → License for key entry.
 */
import { useSettingsStore } from '../store/settingsStore';
import { useConfirmationStore } from '../store/confirmationStore';

export function isCommercialExportUnlocked(): boolean {
  return useSettingsStore.getState().license.licensed;
}

/**
 * Returns true when the export may proceed. When unlicensed: one-line upsell; confirming routes
 * to Settings → License. The caller simply returns on false.
 */
export async function requestCommercialExportUnlock(featureLabel: string): Promise<boolean> {
  if (isCommercialExportUnlocked()) {
    return true;
  }

  const goToLicense = await useConfirmationStore.getState().requestConfirmation(
    `${featureLabel} is part of the one-time commercial license ($17.99 — everything noncommercial stays free). Enter your license key now?`,
    'Commercial license required',
  );

  if (goToLicense) {
    useSettingsStore.getState().openSettings('license');
  }

  return false;
}

/**
 * PDF export is free on the plain browser-PDF path; a PDF/X-4 / PDF/X-1a standard or a CMYK/spot
 * press output intent is commercial print production and takes the gate.
 */
export function isCommercialPrintProductionTarget(production: {
  pdfStandard: string;
  outputIntentColorSpace?: string;
}): boolean {
  return production.pdfStandard === 'pdf-x-4'
    || production.pdfStandard === 'pdf-x-1a'
    || production.outputIntentColorSpace === 'cmyk';
}
