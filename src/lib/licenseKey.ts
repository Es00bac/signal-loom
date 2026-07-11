/**
 * Sloom Studio commercial-license verification — public wrapper.
 *
 * Key format: `SLOOM-<base64url(payload JSON)>.<base64url(signature)>`, verified fully offline
 * (no license server exists; keys work forever). The verification implementation itself ships as
 * a generated artifact (`licenseVerifier.bin.js`) whose readable source is intentionally not part
 * of this source-available repository — building from source still works because the artifact is
 * committed. Fail-closed: any parse/crypto failure behaves as the free Community edition.
 */
// @ts-expect-error — generated artifact, no type declarations by design.
import { verifySignalLoomLicense } from './licenseVerifier.bin.js';

export interface LicenseVerification {
  licensed: boolean;
  email?: string;
  edition?: string;
  issued?: string;
  /** Human-readable reason when not licensed (empty input stays reasonless). */
  reason?: string;
}

export async function verifyLicenseKey(key: string): Promise<LicenseVerification> {
  try {
    const result = await verifySignalLoomLicense(key);
    if (typeof result !== 'object' || result === null || typeof result.licensed !== 'boolean') {
      return { licensed: false, reason: 'License verification is unavailable in this environment.' };
    }
    return result as LicenseVerification;
  } catch {
    return { licensed: false, reason: 'License verification is unavailable in this environment.' };
  }
}

export function describeLicenseEdition(verification: Pick<LicenseVerification, 'licensed' | 'email'>): string {
  return verification.licensed && verification.email
    ? `Licensed to ${verification.email}`
    : 'Community edition';
}
