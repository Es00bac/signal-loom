import { describe, expect, it } from 'vitest';
import { describeLicenseEdition, verifyLicenseKey } from './licenseKey';

/**
 * Public-repo tests cover the fail-closed contract only. Positive-path tests (a key signed by the
 * real private key verifying through the shipped artifact, forgery rejection) live in the private
 * hermes workspace (`hermes/license/test-verifier.mjs`) alongside the signing key — a valid key
 * committed here would be a working commercial license in public git history.
 */
describe('license key verification (fail-closed contract)', () => {
  it('rejects malformed inputs without throwing', async () => {
    for (const input of [
      '',
      '   ',
      'not-a-key',
      'SLOOM-',
      'SLOOM-abc',
      'SLOOM-abc.',
      'SLOOM-.abc',
      'SLOOM-!!!.???',
      `SLOOM-${btoa('{"product":"other-app"}').replace(/=+$/, '')}.AAAA`,
      `SLOOM-${btoa('null').replace(/=+$/, '')}.AAAA`,
      `SLOOM-${btoa('not json at all').replace(/=+$/, '')}.AAAA`,
    ]) {
      const result = await verifyLicenseKey(input);
      expect(result.licensed, `input should fail closed: ${JSON.stringify(input)}`).toBe(false);
    }
  });

  it('gives empty input no reason but real garbage a human-readable one', async () => {
    expect((await verifyLicenseKey('')).reason).toBeUndefined();
    expect((await verifyLicenseKey('SLOOM-garbage')).reason).toMatch(/license key/i);
  });

  it('rejects a well-formed key with an unverifiable signature', async () => {
    const payload = btoa(JSON.stringify({
      v: 1,
      product: 'signal-loom',
      edition: 'commercial',
      email: 'forger@example.com',
      issued: '2026-07-03',
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const fakeSignature = btoa(String.fromCharCode(...new Uint8Array(64))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const result = await verifyLicenseKey(`SLOOM-${payload}.${fakeSignature}`);
    expect(result.licensed).toBe(false);
  });

  it('describes editions for the About screen and title bar', () => {
    expect(describeLicenseEdition({ licensed: false })).toBe('Community edition');
    expect(describeLicenseEdition({ licensed: true, email: 'buyer@example.com' })).toBe('Licensed to buyer@example.com');
    // licensed without an email cannot happen from the verifier, but the label stays safe:
    expect(describeLicenseEdition({ licensed: true })).toBe('Community edition');
  });
});
